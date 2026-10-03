import { useEffect, useState } from 'react';
import { LocationPicker } from '@/features/map/components/LocationPicker';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { CAN_THO } from '@/types/marketplace';
import { useI18n } from '@/locales';

export function PartnerLocationSection({
  title,
  hint,
  lat,
  lng,
  label,
  ready,
  saving,
  onSave,
}: {
  title: string;
  hint: string;
  lat?: number | null;
  lng?: number | null;
  label?: string;
  ready?: boolean;
  saving?: boolean;
  onSave: (origin: MapOrigin) => void;
}) {
  const { t } = useI18n();
  const [origin, setOrigin] = useState<MapOrigin>(() =>
    Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat: Number(lat), lng: Number(lng), label }
      : { ...CAN_THO, label }
  );

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setOrigin({ lat: Number(lat), lng: Number(lng), label: label || undefined });
  }, [lat, lng, label]);

  return (
    <div id="location" className="section-anchor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-navy-800">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">{hint}</p>
        </div>
        {ready === false ? (
          <span className="rounded-full bg-paper-100 px-3 py-1 text-xs font-semibold text-ink-500">{t('activation.incomplete')}</span>
        ) : null}
      </div>
      <div className="mt-4">
        <LocationPicker
          variant="panel"
          origin={origin}
          onPick={setOrigin}
          onSave={(next) => {
            if (saving) return;
            onSave(next);
          }}
        />
      </div>
    </div>
  );
}
