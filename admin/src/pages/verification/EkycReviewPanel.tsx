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

  if (!ekyc) return <p className="mt-4 text-sm text-[#7E92A2]">{t('verify.ekycEmpty')}</p>;

  const match = ekyc.faceMatch;

  return (
    <section className="mt-6 space-y-3 border-t border-[#E1E7ED] pt-5">
      <h3 className="font-display text-lg font-bold text-[#16283C]">{t('verify.ekycTitle')}</h3>
      <p className="text-xs text-[#7E92A2]">{ekyc.referenceCode} · {ekyc.status}</p>
      {ekyc.retakeReason ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-[#B91C1C]">{ekyc.retakeReason}</p>
      ) : null}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{t('verify.ekycName')}</dt><dd className="font-medium text-[#16283C]">{ekyc.ocr?.fullName || '—'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{t('verify.ekycId')}</dt><dd className="font-medium text-[#16283C]">{ekyc.ocr?.idNumber || '—'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{t('verify.ekycDob')}</dt><dd className="font-medium text-[#16283C]">{ekyc.ocr?.dateOfBirth || '—'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{t('verify.ekycGender')}</dt><dd className="font-medium text-[#16283C]">{ekyc.ocr?.gender || '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{t('verify.ekycHometown')}</dt><dd className="font-medium text-[#16283C]">{ekyc.ocr?.hometown || '—'}</dd></div>
      </dl>
      <ul className="space-y-1 text-sm text-[#16283C]">
        <li>{t('verify.ekycOcr')}: <span className="font-semibold">{ekyc.ocr?.passed ? t('verify.ekycPass') : t('verify.ekycFail')}</span></li>
        <li>{t('verify.ekycLiveness')}: <span className="font-semibold">{ekyc.liveness?.passed ? t('verify.ekycPass') : t('verify.ekycFail')}</span></li>
        <li>{t('verify.ekycMatch')}: <span className="font-semibold">{match?.decision || '—'}</span></li>
        <li>{t('verify.ekycDistance')}: <span className="font-semibold">{match?.distance ?? '—'} / {match?.threshold ?? '—'}</span></li>
      </ul>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(photos).map(([kind, url]) => (
          <figure key={kind} className="overflow-hidden rounded-xl border border-[#E1E7ED] bg-white">
            <img src={url} alt="" className="h-32 w-full object-cover" />
            <figcaption className="border-t border-[#E1E7ED] bg-[#F8FAFC] p-2 text-xs font-medium text-[#526477]">{t(`verify.ekycFile.${kind}`)}</figcaption>
          </figure>
        ))}
      </div>
      <button type="button" className="text-sm font-semibold text-[#2B6280] hover:underline" onClick={() => setShowLive((value) => !value)}>
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
