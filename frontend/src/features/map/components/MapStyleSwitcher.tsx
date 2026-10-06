import { Check, Layers } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MapStyleType } from '@/features/map/lib/map-style';
import { useI18n } from '@/locales';

const OPTIONS: MapStyleType[] = ['STANDARD', 'SATELLITE', 'HYBRID'];

function Swatch({ kind }: { kind: MapStyleType }) {
  if (kind === 'SATELLITE') {
    return (
      <span
        aria-hidden
        className="block h-7 w-9 shrink-0 rounded-md"
        style={{ background: 'linear-gradient(155deg,#2f5d34 0%,#6d8f45 42%,#8a7348 78%,#3e6840 100%)' }}
      />
    );
  }
  if (kind === 'HYBRID') {
    return (
      <span
        aria-hidden
        className="relative block h-7 w-9 shrink-0 overflow-hidden rounded-md"
        style={{ background: 'linear-gradient(155deg,#2f5d34 0%,#6d8f45 48%,#c2ae86 100%)' }}
      >
        <span className="absolute left-0 right-0 top-1/2 h-0.5 bg-white" />
        <span className="absolute bottom-1 left-1 right-1 top-1/2 w-px bg-white" />
      </span>
    );
  }
  return (
    <span aria-hidden className="relative block h-7 w-9 shrink-0 overflow-hidden rounded-md bg-[#e7eef3]">
      <span className="absolute left-0 right-0 top-2 h-0.5 bg-[#e2b15a]" />
      <span className="absolute bottom-0 left-0 right-0 h-2.5 bg-[#d5e2cf]" />
      <span className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-white" />
    </span>
  );
}

export function MapStyleSwitcher({
  value,
  onChange,
}: {
  value: MapStyleType;
  onChange: (style: MapStyleType) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = {
    STANDARD: t('map.standard'),
    SATELLITE: t('map.satellite'),
    HYBRID: t('map.hybrid'),
  } satisfies Record<MapStyleType, string>;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="absolute bottom-3 right-3 z-10">
      {open ? (
        <div className="absolute bottom-11 right-0 w-52 max-w-[calc(100vw-1.5rem)] rounded-xl border border-navy-800/10 bg-white p-2 shadow-card">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">{t('map.mapType')}</p>
          <div role="radiogroup" aria-label={t('map.mapType')} className="flex flex-col">
            {OPTIONS.map((style) => {
              const selected = value === style;
              return (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${selected ? 'bg-paper-100 font-semibold text-navy-800' : 'text-ink-600 hover:bg-paper-100'}`}
                  onClick={() => {
                    onChange(style);
                    setOpen(false);
                  }}
                >
                  <Swatch kind={style} />
                  <span className="min-w-0 flex-1 truncate">{label[style]}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-navy-800" /> : <span className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('map.layers')}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-navy-800/10 bg-white px-3 text-sm font-semibold text-navy-800 shadow-card"
        onClick={() => setOpen((current) => !current)}
      >
        <Layers className="h-4 w-4" />
        <span>{t('map.layers')}</span>
      </button>
    </div>
  );
}
