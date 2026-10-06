import { MapPin } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { autocompleteAddress, type AddressSuggestion, type SearchFocus } from '@/features/map/services/geocoding';
import { useI18n } from '@/locales';

export function AddressSearch({
  value,
  onChange,
  onSelect,
  focus,
  placeholder,
  inputId = 'site-address',
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (hit: AddressSuggestion) => void;
  focus?: SearchFocus | null;
  placeholder?: string;
  inputId?: string;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const typedValue = useRef<string | null>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'empty' | 'error'>('idle');
  const [hits, setHits] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  useEffect(() => {
    if (typedValue.current !== value) return;
    const text = value.trim();
    if (text.length < 2) {
      setHits([]);
      setLoading(false);
      setStatus('idle');
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setOpen(true);
      autocompleteAddress(text, focus, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          const next = rows.slice(0, 6);
          setHits(next);
          setActive(0);
          setStatus(next.length ? 'idle' : 'empty');
        })
        .catch((err: { code?: string; name?: string }) => {
          if (controller.signal.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
          setHits([]);
          setStatus('error');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, focus?.lat, focus?.lng]);

  function choose(hit: AddressSuggestion) {
    typedValue.current = null;
    setOpen(false);
    setHits([]);
    onChange(hit.display);
    onSelect(hit);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!hits.length) return;
      setActive((index) => (index + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!hits.length) return;
      setActive((index) => (index - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (hits[active]) choose(hits[active]);
    }
  }

  const showList = open && value.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder || t('map.addressPlaceholder')}
        value={value}
        className="h-10 w-full rounded-lg border border-navy-800/10 bg-white px-3 text-sm text-ink-800 outline-none placeholder:text-ink-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10"
        onChange={(event) => {
          typedValue.current = event.target.value;
          setOpen(true);
          onChange(event.target.value);
        }}
        onFocus={() => {
          if (hits.length || loading || status !== 'idle') setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-navy-800/10 bg-white py-1 shadow-sm"
        >
          {loading ? <li className="px-3 py-2 text-sm text-ink-500">{t('map.searching')}</li> : null}
          {!loading && status === 'empty' ? <li className="px-3 py-2 text-sm text-ink-500">{t('map.noResults')}</li> : null}
          {!loading && status === 'error' ? <li className="px-3 py-2 text-sm text-red-700">{t('map.searchFailed')}</li> : null}
          {hits.map((hit, index) => {
            const title = hit.name || hit.display;
            const secondary = hit.address && hit.address !== title ? hit.address : '';
            return (
              <li key={hit.refId} role="option" aria-selected={index === active} className="border-t border-navy-800/5 first:border-t-0">
                <button
                  type="button"
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left ${index === active ? 'bg-paper-100' : 'hover:bg-paper-100'}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(hit)}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-navy-800" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-navy-800">{title}</span>
                    {secondary ? <span className="block truncate text-xs text-ink-400">{secondary}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
