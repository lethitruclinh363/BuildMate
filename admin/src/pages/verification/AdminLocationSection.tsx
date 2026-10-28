import { MapPin, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { AdminVietMapView } from '@/components/AdminVietMapView';
import type { PartnerApplication } from '@/types/admin';

export function extractApplicationCoords(item: PartnerApplication): { lat: number; lng: number } | null {
  const lat =
    item.lat !== undefined && item.lat !== null
      ? Number(item.lat)
      : item.latitude !== undefined && item.latitude !== null
        ? Number(item.latitude)
        : item.location?.coordinates?.[1] != null
          ? Number(item.location.coordinates[1])
          : null;

  const lng =
    item.lng !== undefined && item.lng !== null
      ? Number(item.lng)
      : item.longitude !== undefined && item.longitude !== null
        ? Number(item.longitude)
        : item.location?.coordinates?.[0] != null
          ? Number(item.location.coordinates[0])
          : null;

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function AdminLocationSection({
  application,
  actor,
}: {
  application: PartnerApplication;
  actor: 'CONTRACTOR' | 'MATERIAL_STORE_OWNER';
}) {
  const { t } = useTranslation();
  const coords = extractApplicationCoords(application);

  const isConfirmed = application.locationConfirmed === true && Boolean(coords);
  const isApproved = isConfirmed && application.verificationStatus === 'APPROVED';
  const approvalDate = application.locationApprovedAt || (isApproved ? application.reviewedAt : null);

  function sourceTitle(src?: string | null) {
    if (src === 'GPS') return t('verify.sourceGps');
    if (src === 'VIETMAP_PLACE' || src === 'VIETMAP_AUTOCOMPLETE') return t('verify.sourcePlace');
    if (src === 'MANUAL_PIN' || src === 'MAP_PIN') return t('verify.sourceManual');
    return src || '—';
  }

  const badgeTone = isApproved ? 'success' : isConfirmed ? 'warn' : 'navy';
  const badgeLabel = isApproved
    ? t('verify.locationApproved')
    : isConfirmed
      ? t('verify.locationPendingApproval')
      : t('verify.locationUnconfirmed');

  return (
    <div className="mt-6 rounded-2xl border border-[#E1E7ED] bg-white p-4 shadow-sm sm:p-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E1E7ED] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#2B6280]" />
            <h3 className="font-display text-lg font-bold text-[#16283C]">{t('verify.locationTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-[#526477]">{t('verify.locationDesc')}</p>
        </div>
        <Badge tone={badgeTone}>{badgeLabel}</Badge>
      </div>

      {/* Details Grid */}
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-3 sm:col-span-2">
          <span className="block text-xs font-medium text-[#7E92A2]">{t('verify.locationAddress')}</span>
          <p className="mt-1 font-semibold text-[#16283C]">
            {application.address ? `${application.address}, ${application.city || ''}` : t('verify.empty')}
          </p>
        </div>

        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-3">
          <span className="block text-xs font-medium text-[#7E92A2]">{t('verify.locationCity')}</span>
          <p className="mt-1 font-semibold text-[#16283C]">{application.city || '—'}</p>
        </div>

        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-3">
          <span className="block text-xs font-medium text-[#7E92A2]">{t('verify.locationLatitude')}</span>
          <p className="mt-1 font-mono font-semibold text-[#16283C]">
            {coords ? coords.lat.toFixed(6) : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-3">
          <span className="block text-xs font-medium text-[#7E92A2]">{t('verify.locationLongitude')}</span>
          <p className="mt-1 font-mono font-semibold text-[#16283C]">
            {coords ? coords.lng.toFixed(6) : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-3">
          <span className="block text-xs font-medium text-[#7E92A2]">{t('verify.locationSource')}</span>
          <p className="mt-1 font-semibold text-[#16283C]">{sourceTitle(application.locationSource)}</p>
        </div>

        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-3">
          <span className="block text-xs font-medium text-[#7E92A2]">{t('verify.locationConfirmedAt')}</span>
          <p className="mt-1 text-xs font-medium text-[#16283C]">
            {formatDate(application.locationConfirmedAt)}
          </p>
        </div>

        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-3">
          <span className="block text-xs font-medium text-[#7E92A2]">{t('verify.locationPartnerStatus')}</span>
          <div className="mt-1 flex items-center gap-1.5">
            {isConfirmed ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-emerald-700">{t('verify.locationConfirmed')}</span>
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-[#7E92A2]" />
                <span className="font-semibold text-[#7E92A2]">{t('verify.locationUnconfirmed')}</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-3">
          <span className="block text-xs font-medium text-[#7E92A2]">{t('verify.locationApprovedAt')}</span>
          <div className="mt-1 flex items-center gap-1.5">
            {isApproved ? (
              <>
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">{formatDate(approvalDate)}</span>
              </>
            ) : (
              <span className="text-xs text-[#7E92A2]">{t('verify.locationNotApproved')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Map or Missing Notice */}
      <div className="mt-4">
        {coords ? (
          <div className="overflow-hidden rounded-xl border border-[#E1E7ED] shadow-sm">
            <AdminVietMapView
              center={coords}
              zoom={15}
              actorKind={actor === 'CONTRACTOR' ? 'contractor' : 'store'}
              address={application.address}
              fallbackText={t('verify.mapUnavailable')}
              className="h-[280px] w-full md:h-[320px]"
            />
            <div className="bg-[#F8FAFC] px-3.5 py-2 text-xs text-[#526477]">
              {t('verify.mapReadOnlyHint')}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">{t('verify.locationMissingCoords')}</p>
              <p className="mt-0.5 text-xs text-amber-800">
                {application.address
                  ? t('verify.locationMissingCoordsDesc', {
                      address: [application.address, application.city].filter(Boolean).join(', '),
                    })
                  : t('verify.locationNoAddress')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
