import { useEffect, useState } from 'react';
import { EkycCamera } from '@/features/ekyc/EkycCamera';
import { EkycLivenessCamera } from '@/features/ekyc/EkycLivenessCamera';
import { ekycApi, type EkycRecord } from '@/features/ekyc/ekyc.api';
import { getApiErrorMessage } from '@/lib/api';
import type { AxiosError } from 'axios';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function wizardError(error: unknown, t: Translate) {
  const ax = error as AxiosError;
  if (!ax.response || ax.response.status === 502 || ax.code === 'ECONNABORTED') return t('ekyc.unavailable');
  return getApiErrorMessage(error);
}

const RESULT_STATUSES = new Set(['AI_PASSED', 'AI_REVIEW_REQUIRED', 'AI_FAILED', 'SUBMITTED']);

function initialStep(record: EkycRecord | null) {
  if (!record) return 1;
  if (RESULT_STATUSES.has(record.status)) return 6;
  if (record.status === 'IN_PROGRESS') {
    if (record.frontDocumentId && record.backDocumentId) return 4;
    if (record.frontDocumentId) return 3;
    return 2;
  }
  return 1;
}

export function ContractorEkycWizard({
  t,
  onClose,
  onFinished,
}: {
  t: Translate;
  onClose: () => void;
  onFinished: (record: EkycRecord) => void;
}) {
  const [step, setStep] = useState(1);
  const [record, setRecord] = useState<EkycRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    ekycApi.current().then((row) => {
      if (cancelled) return;
      setRecord(row);
      const nextStep = initialStep(row);
      setStep(nextStep);
      if (nextStep === 4) setError(t('ekyc.resumeFace'));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSide(type: 'CCCD_FRONT' | 'CCCD_BACK', file: File, next: number) {
    setError('');
    const nextRecord = await ekycApi.saveDocument(file, type);
    setRecord(nextRecord);
    setStep(next);
  }

  async function runProcess(frames: Record<string, File>) {
    setStep(5);
    setBusy(true);
    setError('');
    try {
      const nextRecord = await ekycApi.process(frames);
      setRecord(nextRecord);
      setStep(6);
    } catch (err) {
      setError(wizardError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError('');
    try {
      const nextRecord = await ekycApi.submit();
      setRecord(nextRecord);
      onFinished(nextRecord);
    } catch (err) {
      setError(wizardError(err, t));
    } finally {
      setBusy(false);
    }
  }

  const match = record?.faceMatch?.decision;
  const canSend = record?.status === 'AI_PASSED' || record?.status === 'AI_REVIEW_REQUIRED';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-h-[90vh] sm:max-w-xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-wide text-ink-400">{t('ekyc.progress', { step })}</p>
          <div className="flex items-center gap-3">
            {step > 1 && step < 5 ? (
              <button type="button" className="text-sm font-semibold text-navy-800" onClick={() => setStep((value) => value - 1)}>
                {t('common.back')}
              </button>
            ) : null}
            <button type="button" className="text-sm font-semibold text-navy-800" onClick={onClose}>
              {t('ekyc.close')}
            </button>
          </div>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-navy-800">{t('ekyc.title')}</h2>
            <p className="text-sm leading-6 text-ink-500">{t('ekyc.intro')}</p>
            {record?.retakeReason ? <p className="rounded-2xl bg-paper-50 p-3 text-sm text-navy-800">{record.retakeReason}</p> : null}
            <ul className="space-y-2 text-sm text-navy-800">
              <li>{t('ekyc.itemValid')}</li>
              <li>{t('ekyc.itemCamera')}</li>
              <li>{t('ekyc.itemLight')}</li>
              <li>{t('ekyc.itemClear')}</li>
            </ul>
            <button type="button" className="h-11 w-full rounded-full bg-navy-800 text-sm font-semibold text-white" onClick={() => setStep(2)}>
              {t('ekyc.start')}
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <EkycCamera
            title={t('ekyc.frontTitle')}
            hint={t('ekyc.frontHint')}
            t={t}
            onUse={async (file) => {
              try {
                await saveSide('CCCD_FRONT', file, 3);
              } catch (err) {
                setError(wizardError(err, t));
              }
            }}
          />
        ) : null}

        {step === 3 ? (
          <EkycCamera
            title={t('ekyc.backTitle')}
            hint={t('ekyc.backHint')}
            t={t}
            onUse={async (file) => {
              try {
                await saveSide('CCCD_BACK', file, 4);
              } catch (err) {
                setError(wizardError(err, t));
              }
            }}
          />
        ) : null}

        {step === 4 ? <EkycLivenessCamera t={t} onComplete={(frames) => void runProcess(frames)} /> : null}

        {step === 5 ? (
          <div className="space-y-3 py-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-navy-800 border-t-transparent" />
            <p className="text-sm font-semibold text-navy-800">{busy ? t('ekyc.processing') : t('ekyc.processingWait')}</p>
            <p className="text-sm text-ink-500">{t('ekyc.processingWait')}</p>
          </div>
        ) : null}

        {step === 6 && record ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-navy-800">{t('ekyc.resultTitle')}</h2>
            {record.referenceCode ? <p className="text-xs text-ink-400">{record.referenceCode}</p> : null}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-400">{t('ekyc.fullName')}</dt>
                <dd className="font-semibold text-navy-800">{record.ocr.fullName || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400">{t('ekyc.idNumber')}</dt>
                <dd className="font-semibold text-navy-800">{record.ocr.idNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400">{t('ekyc.dob')}</dt>
                <dd className="font-semibold text-navy-800">{record.ocr.dateOfBirth || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400">{t('ekyc.gender')}</dt>
                <dd className="font-semibold text-navy-800">{record.ocr.gender || '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ink-400">{t('ekyc.hometown')}</dt>
                <dd className="font-semibold text-navy-800">{record.ocr.hometown || '—'}</dd>
              </div>
            </dl>
            <ul className="space-y-1 text-sm text-navy-800">
              <li>{record.ocr.passed ? '✓' : '✗'} {t('ekyc.checkOcr')}</li>
              <li>{record.liveness.passed ? '✓' : '✗'} {t('ekyc.checkLive')}</li>
              <li>{record.liveness.passed ? '✓' : '✗'} {t('ekyc.checkAngles')}</li>
              <li>{match === 'MATCH' ? '✓' : '⚠'} {t('ekyc.checkMatch')} {match ? t(`ekyc.match.${match}`) : ''}</li>
            </ul>
            {record.status === 'SUBMITTED' ? <p className="text-sm text-navy-800">{t('ekyc.submitted')}</p> : null}
            <div className="flex gap-2">
              {record.status !== 'SUBMITTED' ? (
                <button type="button" className="h-11 flex-1 rounded-full border border-navy-800/15 text-sm font-semibold text-navy-800" onClick={() => setStep(1)}>
                  {t('ekyc.redo')}
                </button>
              ) : null}
              {canSend ? (
                <button type="button" disabled={busy} className="h-11 flex-1 rounded-full bg-navy-800 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void send()}>
                  {t('ekyc.submit')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
