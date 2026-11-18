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
  submitToken = 0,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (hit: AddressSuggestion) => void;
  focus?: SearchFocus | null;
  placeholder?: string;
  inputId?: string;
  submitToken?: number;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const typedValue = useRef<string | null>(null);
  const submittedToken = useRef(0);
  const submitController = useRef<AbortController | null>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'empty' | 'error'>('idle');
  const [hits, setHits] = useState<AddressSuggestion[]>([]);
  const [hitsQuery, setHitsQuery] = useState('');
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
      setHitsQuery('');
      setLoading(false);
      setStatus('idle');
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (typedValue.current !== value) return;
      setLoading(true);
      setOpen(true);
      autocompleteAddress(text, focus, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          const next = rows.slice(0, 6);
          setHits(next);
          setHitsQuery(text);
          setActive(0);
          setStatus(next.length ? 'idle' : 'empty');
        })
        .catch((err: { code?: string; name?: string; message?: string }) => {
          if (
            controller.signal.aborted ||
            err?.code === 'ERR_CANCELED' ||
            err?.name === 'CanceledError' ||
            err?.name === 'AbortError' ||
            /signal is aborted/i.test(err?.message || '')
          ) return;
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
    setHitsQuery('');
    onChange(hit.display);
    onSelect(hit);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (hits[active]) choose(hits[active]);
      else if (hits[0]) choose(hits[0]);
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
    }
  }

  useEffect(() => {
    if (!submitToken || submittedToken.current === submitToken) return;
    submittedToken.current = submitToken;
    if (typedValue.current !== value) return;

    const text = value.trim();
    const matchingHits = hitsQuery === text ? hits : [];
    const hit = matchingHits[active] || matchingHits[0];
    if (hit) {
      choose(hit);
      return;
    }
    if (text.length < 2) return;

    submitController.current?.abort();
    const controller = new AbortController();
    submitController.current = controller;
    setLoading(true);
    setOpen(true);
    setStatus('idle');
    autocompleteAddress(text, focus, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted || typedValue.current !== value) return;
        const next = rows.slice(0, 6);
        setHits(next);
        setHitsQuery(text);
        setActive(0);
        if (next[0]) choose(next[0]);
        else setStatus('empty');
      })
      .catch((err: { code?: string; name?: string; message?: string }) => {
        if (
          controller.signal.aborted ||
          err?.code === 'ERR_CANCELED' ||
          err?.name === 'CanceledError' ||
          err?.name === 'AbortError' ||
          /signal is aborted/i.test(err?.message || '')
        ) return;
        setHits([]);
        setHitsQuery(text);
        setStatus('error');
      })
      .finally(() => {
        if (submitController.current === controller) {
          submitController.current = null;
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      if (submitController.current === controller) submitController.current = null;
    };
    // submitToken is a click counter; use the current query and matching hits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitToken]);

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
          submitController.current?.abort();
          submitController.current = null;
          setLoading(false);
          typedValue.current = event.target.value;
          setHits([]);
          setHitsQuery('');
          setActive(0);
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
