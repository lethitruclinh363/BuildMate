import { useEffect, useRef, useState } from 'react';
import { EkycCamera } from '@/features/ekyc/EkycCamera';
import { EkycLivenessCamera } from '@/features/ekyc/EkycLivenessCamera';
import { EkycStepper } from '@/features/ekyc/EkycStepper';
import { clampEkycStep, readPartnerNav, restoreEkycStep, writePartnerNav } from '@/features/ekyc/ekycNav';
import { ekycApi, type EkycRecord } from '@/features/ekyc/ekyc.api';
import { getApiErrorMessage } from '@/lib/api';
import type { AxiosError } from 'axios';

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type TaskState = 'idle' | 'run' | 'ok' | 'fail';

const PROCESS_TASKS = ['ocr', 'quality', 'live', 'match', 'summary'] as const;
const RESULT_STATUSES = new Set(['AI_PASSED', 'AI_REVIEW_REQUIRED', 'AI_FAILED', 'SUBMITTED']);

function wizardError(error: unknown, t: Translate) {
  const ax = error as AxiosError;
  if (!ax.response || ax.response.status === 502 || ax.code === 'ECONNABORTED') return t('ekyc.unavailable');
  return getApiErrorMessage(error);
}

function maskCitizenId(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length < 8) return '••••';
  return `${digits.slice(0, 3)}••••${digits.slice(-4)}`;
}

function validDob(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim());
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return year >= 1900 && parsed <= today;
}

function ocrReady(record: EkycRecord | null) {
  return Boolean(
    record?.ocr.passed
      && record.ocr.fullName.trim()
      && validDob(record.ocr.dateOfBirth)
      && String(record.ocr.idNumber || '').replace(/\D/g, '').length === 12
  );
}

function ocrMissingFields(record: EkycRecord | null) {
  const fields: string[] = [];
  if (!record?.ocr.fullName.trim() || record.ocr.fullName.trim().length < 2) fields.push('MISSING_NAME');
  if (String(record?.ocr.idNumber || '').replace(/\D/g, '').length !== 12) fields.push('MISSING_ID');
  if (!validDob(record?.ocr.dateOfBirth || '')) fields.push('MISSING_DOB');
  return fields;
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${ok ? 'text-navy-800' : 'text-red-700'}`}>
      <span>{ok ? '✓' : '✗'}</span>
      <span>{label}</span>
    </li>
  );
}

export function ContractorEkycWizard({
  t,
  userId,
  onboardingStep,
  onClose,
  onFinished,
}: {
  t: Translate;
  userId: string;
  onboardingStep: number;
  onClose: () => void;
  onFinished: (record: EkycRecord) => void;
}) {
  const [step, setStep] = useState(() => clampEkycStep(readPartnerNav(userId)?.ekycStep));
  const [record, setRecord] = useState<EkycRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [frontPreview, setFrontPreview] = useState('');
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<Record<(typeof PROCESS_TASKS)[number], TaskState>>({
    ocr: 'idle',
    quality: 'idle',
    live: 'idle',
    match: 'idle',
    summary: 'idle',
  });
  const closed = useRef(false);
  const processGen = useRef(0);
  const onboardingStepRef = useRef(onboardingStep);
  onboardingStepRef.current = onboardingStep;

  useEffect(() => {
    closed.current = false;
    let cancelled = false;
    const stored = readPartnerNav(userId);
    ekycApi.current().then((row) => {
      if (cancelled) return;
      setRecord(row);
      const nextStep = restoreEkycStep(row, stored?.ekycStep);
      setStep(nextStep);
      writePartnerNav(userId, { onboardingStep: onboardingStepRef.current, wizardOpen: true, ekycStep: nextStep });
      if (nextStep === 4 && !RESULT_STATUSES.has(row?.status || '')) setError(t('ekyc.resumeFace'));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [t, userId]);

  useEffect(() => () => {
    closed.current = true;
  }, []);

  useEffect(() => {
    if (!userId || closed.current) return;
    writePartnerNav(userId, { onboardingStep, wizardOpen: true, ekycStep: step });
  }, [userId, onboardingStep, step]);

  useEffect(() => {
    if (step !== 6 || !record) return undefined;
    let ignore = false;
    const created: string[] = [];
    void Promise.all(
      (['front', 'back', 'center'] as const).map(async (kind) => {
        try {
          const url = await ekycApi.file(kind);
          created.push(url);
          return [kind, url] as const;
        } catch {
          return [kind, ''] as const;
        }
      })
    ).then((rows) => {
      if (ignore) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setPhotos(Object.fromEntries(rows.filter(([, url]) => url)));
    });
    return () => {
      ignore = true;
    };
  }, [step, record?.processedAt, record?.status]);

  async function saveSide(type: 'CCCD_FRONT' | 'CCCD_BACK', file: File, next: number) {
    setError('');
    const nextRecord = await ekycApi.saveDocument(file, type);
    setRecord(nextRecord);
    if (type === 'CCCD_FRONT') {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setFrontPreview(URL.createObjectURL(file));
    }
    setStep(next);
  }

  async function restartWizard() {
    processGen.current += 1;
    setBusy(true);
    setError('');
    try {
      const nextRecord = await ekycApi.restart();
      Object.values(photos).forEach((url) => URL.revokeObjectURL(url));
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setPhotos({});
      setFrontPreview('');
      setRecord(nextRecord);
      setTasks({ ocr: 'idle', quality: 'idle', live: 'idle', match: 'idle', summary: 'idle' });
      setStep(2);
      writePartnerNav(userId, { onboardingStep, wizardOpen: true, ekycStep: 2 });
    } catch (err) {
      setError(wizardError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function runProcess(frames: Record<string, File>) {
    const gen = processGen.current + 1;
    processGen.current = gen;
    setStep(5);
    setBusy(true);
    setError('');
    setTasks({ ocr: 'run', quality: 'run', live: 'run', match: 'run', summary: 'run' });
    let timedOut = false;
    const timer = window.setTimeout(() => {
      if (closed.current || processGen.current !== gen) return;
      timedOut = true;
      setTasks({ ocr: 'fail', quality: 'fail', live: 'fail', match: 'fail', summary: 'fail' });
      setError(t('ekyc.timeout'));
      setBusy(false);
    }, 90000);
    try {
      const nextRecord = await ekycApi.process(frames);
      if (closed.current || timedOut || processGen.current !== gen) return;
      setRecord(nextRecord);
      const failed = nextRecord.status === 'AI_FAILED';
      setTasks({
        ocr: ocrReady(nextRecord) ? 'ok' : 'fail',
        quality: ocrReady(nextRecord) ? 'ok' : 'fail',
        live: nextRecord.liveness.passed ? 'ok' : 'fail',
        match: nextRecord.faceMatch?.decision ? 'ok' : 'fail',
        summary: failed ? 'fail' : 'ok',
      });
      setStep(6);
    } catch (err) {
      if (closed.current || processGen.current !== gen) return;
      setTasks({ ocr: 'fail', quality: 'fail', live: 'fail', match: 'fail', summary: 'fail' });
      setError(wizardError(err, t));
    } finally {
      window.clearTimeout(timer);
      if (!closed.current && processGen.current === gen) setBusy(false);
    }
  }

  async function send() {
    if (!ocrReady(record) || !record?.liveness.passed || !record.faceMatch?.decision) return;
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
  const canSend =
    (record?.status === 'AI_PASSED' || record?.status === 'AI_REVIEW_REQUIRED')
    && ocrReady(record)
    && Boolean(record?.liveness.passed)
    && Boolean(match);

  const runningTask = PROCESS_TASKS.find((task) => tasks[task] === 'run');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 p-0 sm:items-center sm:p-4">
      <div className={`flex w-full flex-col rounded-t-3xl bg-white p-4 sm:max-w-2xl sm:rounded-3xl sm:p-6 ${step === 4 ? 'h-[100dvh] max-h-[100dvh] overflow-hidden sm:h-auto sm:max-h-[min(92dvh,720px)]' : 'max-h-[100dvh] overflow-y-auto sm:max-h-[92vh]'}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
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
        <EkycStepper current={step} errorStep={record?.status === 'AI_FAILED' && step === 6 ? 6 : error && step === 5 ? 5 : null} />

        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-navy-800">{t('ekyc.title')}</h2>
            <p className="text-sm leading-6 text-ink-500">{t('ekyc.intro')}</p>
            {record?.retakeReason ? <p className="rounded-2xl bg-paper-50 p-3 text-sm text-navy-800">{record.retakeReason}</p> : null}
            <ul className="space-y-2 text-sm text-navy-800">
              <li>{t('ekyc.itemPurpose')}</li>
              <li>{t('ekyc.itemValid')}</li>
              <li>{t('ekyc.itemLight')}</li>
              <li>{t('ekyc.itemCamera')}</li>
              <li>{t('ekyc.itemClear')}</li>
            </ul>
            <button type="button" className="h-12 w-full rounded-full bg-navy-800 text-sm font-semibold text-white" onClick={() => setStep(2)}>
              {t('ekyc.start')}
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <EkycCamera
            side="front"
            title={t('ekyc.frontTitle')}
            hint={t('ekyc.frontHint')}
            t={t}
            onUse={async (file) => {
              try {
                await saveSide('CCCD_FRONT', file, 3);
              } catch (err) {
                setError(wizardError(err, t));
                throw err;
              }
            }}
          />
        ) : null}

        {step === 3 ? (
          <EkycCamera
            side="back"
            title={t('ekyc.backTitle')}
            hint={t('ekyc.backHint')}
            compareSrc={frontPreview}
            t={t}
            onUse={async (file) => {
              try {
                await saveSide('CCCD_BACK', file, 4);
              } catch (err) {
                setError(wizardError(err, t));
                throw err;
              }
            }}
          />
        ) : null}

        {step === 4 ? (
          <div className="min-h-0 flex-1 overflow-y-auto sm:overflow-hidden">
            <EkycLivenessCamera t={t} onComplete={(frames) => void runProcess(frames)} />
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4 py-2">
            <h2 className="text-xl font-semibold text-navy-800">{t('ekyc.processing')}</h2>
            <p className="text-sm text-ink-500">{runningTask ? t(`ekyc.taskRunHint.${runningTask}`) : t('ekyc.processingWait')}</p>
            <ul className="space-y-3">
              {PROCESS_TASKS.map((task) => {
                const state = tasks[task];
                return (
                  <li
                    key={task}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                      state === 'run' ? 'border-navy-800 bg-paper-50' : state === 'fail' ? 'border-red-300' : 'border-navy-800/10'
                    }`}
                  >
                    <span className="text-navy-800">{t(`ekyc.task.${task}`)}</span>
                    <span className={`flex items-center gap-2 ${state === 'ok' ? 'text-emerald-700' : state === 'fail' ? 'text-red-700' : 'text-ink-400'}`}>
                      {state === 'run' ? (
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-navy-800/20 border-t-navy-800 motion-reduce:animate-none" aria-hidden />
                      ) : null}
                      {state === 'ok' ? '✓' : state === 'fail' ? '!' : null}
                      {state === 'run' ? t('ekyc.taskRun') : state === 'ok' ? t('ekyc.taskOk') : state === 'fail' ? t('ekyc.taskFail') : t('ekyc.taskIdle')}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!busy && error ? (
              <button type="button" className="h-11 w-full rounded-full bg-navy-800 text-sm font-semibold text-white" onClick={() => setStep(4)}>
                {t('ekyc.retry')}
              </button>
            ) : null}
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
                <dd className="font-semibold text-navy-800">{maskCitizenId(record.ocr.idNumber) || '—'}</dd>
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
            <div className="grid grid-cols-3 gap-2">
              {photos.front ? <img src={photos.front} alt="" className="h-24 w-full rounded-xl object-cover" /> : null}
              {photos.back ? <img src={photos.back} alt="" className="h-24 w-full rounded-xl object-cover" /> : null}
              {photos.center ? <img src={photos.center} alt="" className="h-24 w-full rounded-xl object-cover" /> : null}
            </div>
            <ul className="space-y-1">
              <CheckRow ok={ocrReady(record)} label={t('ekyc.checkOcr')} />
              <CheckRow ok={Boolean(record.liveness.passed)} label={t('ekyc.checkLive')} />
              <CheckRow ok={Boolean(record.liveness.passed && record.liveness.hasCenter && record.liveness.hasLeft && record.liveness.hasRight && record.liveness.hasUp && record.liveness.hasDown)} label={t('ekyc.checkAngles')} />
              <CheckRow ok={Boolean(match)} label={`${t('ekyc.checkMatch')} ${match ? t(`ekyc.match.${match}`) : ''}`} />
            </ul>
            {!ocrReady(record) ? (
              <div className="space-y-1">
                <p className="text-sm text-red-700">{t('ekyc.ocrIncomplete')}</p>
                {ocrMissingFields(record).map((field) => (
                  <p key={field} className="text-sm text-red-700">{t(`ekyc.ocrField.${field}`)}</p>
                ))}
              </div>
            ) : null}
            {record.status === 'SUBMITTED' ? <p className="text-sm text-navy-800">{t('ekyc.submitted')}</p> : null}
            <div className="flex gap-2">
              {record.status !== 'SUBMITTED' ? (
                <button type="button" disabled={busy} className="h-11 flex-1 rounded-full border border-navy-800/15 text-sm font-semibold text-navy-800 disabled:opacity-60" onClick={() => void restartWizard()}>
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
