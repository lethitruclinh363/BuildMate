import { useEffect, useState } from 'react';
import { adminApi } from '@/services/admin.api';
import { Button } from '@/components/Button';
import type { PartnerApplication } from '@/types/admin';

const MAIN_KINDS = ['front', 'back', 'center'] as const;
const LIVE_KINDS = ['center', 'left', 'right', 'up', 'down'] as const;

export function EkycReviewPanel({
  applicationId,
  ekyc,
  busy,
  reasonReady,
  onRetake,
  t,
}: {
  applicationId: string;
  ekyc: PartnerApplication['ekyc'];
  busy: boolean;
  reasonReady: boolean;
  onRetake: () => void;
  t: (key: string) => string;
}) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [showLive, setShowLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const kinds = showLive ? LIVE_KINDS : MAIN_KINDS;
    void Promise.all(
      kinds.map(async (kind) => {
        try {
          const url = await adminApi.ekycFile(applicationId, kind);
          created.push(url);
          return [kind, url] as const;
        } catch {
          return [kind, ''] as const;
        }
      })
    ).then((rows) => {
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setPhotos((current) => {
        Object.values(current).forEach((url) => URL.revokeObjectURL(url));
        return Object.fromEntries(rows.filter(([, url]) => url));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId, showLive, ekyc?.status]);

  if (!ekyc) return <p className="mt-4 text-sm text-white/50">{t('verify.ekycEmpty')}</p>;

  const match = ekyc.faceMatch;

  return (
    <section className="mt-6 space-y-3 border-t border-white/8 pt-5">
      <h3 className="font-display text-lg">{t('verify.ekycTitle')}</h3>
      <p className="text-xs text-white/45">{ekyc.referenceCode} · {ekyc.status}</p>
      {ekyc.retakeReason ? <p className="text-sm text-white/70">{ekyc.retakeReason}</p> : null}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-white/45">{t('verify.ekycName')}</dt><dd>{ekyc.ocr?.fullName || '—'}</dd></div>
        <div><dt className="text-white/45">{t('verify.ekycId')}</dt><dd>{ekyc.ocr?.idNumber || '—'}</dd></div>
        <div><dt className="text-white/45">{t('verify.ekycDob')}</dt><dd>{ekyc.ocr?.dateOfBirth || '—'}</dd></div>
        <div><dt className="text-white/45">{t('verify.ekycGender')}</dt><dd>{ekyc.ocr?.gender || '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-white/45">{t('verify.ekycHometown')}</dt><dd>{ekyc.ocr?.hometown || '—'}</dd></div>
      </dl>
      <ul className="space-y-1 text-sm text-white/80">
        <li>{t('verify.ekycOcr')}: {ekyc.ocr?.passed ? t('verify.ekycPass') : t('verify.ekycFail')}</li>
        <li>{t('verify.ekycLiveness')}: {ekyc.liveness?.passed ? t('verify.ekycPass') : t('verify.ekycFail')}</li>
        <li>{t('verify.ekycMatch')}: {match?.decision || '—'}</li>
        <li>{t('verify.ekycDistance')}: {match?.distance ?? '—'} / {match?.threshold ?? '—'}</li>
      </ul>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(photos).map(([kind, url]) => (
          <figure key={kind} className="overflow-hidden rounded-2xl border border-white/10">
            <img src={url} alt="" className="h-32 w-full object-cover" />
            <figcaption className="p-2 text-xs text-white/55">{t(`verify.ekycFile.${kind}`)}</figcaption>
          </figure>
        ))}
      </div>
      <button type="button" className="text-sm font-semibold text-copper-300" onClick={() => setShowLive((value) => !value)}>
        {showLive ? t('verify.ekycHideLive') : t('verify.ekycShowLive')}
      </button>
      <div>
        <Button variant="outline" loading={busy} disabled={!reasonReady} onClick={onRetake}>
          {t('verify.ekycRetake')}
        </Button>
      </div>
    </section>
  );
}
