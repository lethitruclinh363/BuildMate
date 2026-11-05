import { Copy } from 'lucide-react';
import { FormLabel } from '@/components/ui/FormLabel';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import {
  TIME_SLOTS,
  weeklyHoursError,
  type WeeklyDay,
  type WeeklyHours,
} from '@/features/operating-hours/weeklyHours';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function OperatingHoursEditor({
  value,
  onChange,
  className,
}: {
  value: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const errorKey = weeklyHoursError(value);

  function patchDay(weekday: number, patch: Partial<WeeklyDay>) {
    const days = value.days.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day));
    onChange({ configured: true, days });
  }

  function toggleDay(day: WeeklyDay, open: boolean) {
    patchDay(day.weekday, open
      ? { closed: false, open: day.open || '07:00', close: day.close || (day.weekday === 6 ? '17:00' : '18:00') }
      : { closed: true, open: null, close: null });
  }

  function copyToOpenDays(source: WeeklyDay) {
    if (source.closed || !source.open || !source.close) return;
    onChange({
      configured: true,
      days: value.days.map((day) => (day.closed ? day : { ...day, open: source.open, close: source.close })),
    });
  }

  return (
    <section id="hours-editor" className={cn('sm:col-span-2', className)}>
      <FormLabel>{t('hours.title')}</FormLabel>
      <p className="mt-1 text-xs leading-5 text-ink-500">{t('hours.hint')}</p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
        <div className="hidden grid-cols-[1.2fr_0.8fr_1fr_1fr_auto] gap-2 border-b border-navy-800/8 bg-mist-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:grid">
          <span>{t('hours.day')}</span>
          <span>{t('hours.active')}</span>
          <span>{t('hours.open')}</span>
          <span>{t('hours.close')}</span>
          <span className="sr-only">{t('hours.copy')}</span>
        </div>
        <ul>
          {value.days.map((day) => {
            const label = t(`hours.days.${DAY_KEYS[day.weekday - 1]}`);
            return (
              <li
                key={day.weekday}
                className="grid grid-cols-1 items-center gap-2 border-t border-navy-800/6 px-3 py-3 first:border-t-0 sm:grid-cols-[1.2fr_0.8fr_1fr_1fr_auto] sm:gap-2 sm:py-2"
              >
                <p className="text-sm font-semibold text-navy-800">{label}</p>
                <label className="inline-flex items-center gap-2 text-sm text-ink-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-navy-800/20 text-navy-800 focus:ring-navy-800/20"
                    checked={!day.closed}
                    onChange={(event) => toggleDay(day, event.target.checked)}
                  />
                  {day.closed ? t('hours.closed') : t('hours.openDay')}
                </label>
                {day.closed ? (
                  <p className="text-sm font-medium text-ink-400 sm:col-span-2">{t('hours.rest')}</p>
                ) : (
                  <>
                    <select
                      aria-label={t('hours.open')}
                      className="h-10 w-full rounded-xl border border-navy-800/10 bg-white px-3 text-sm text-navy-800 outline-none focus:border-navy-500"
                      value={day.open || '07:00'}
                      onChange={(event) => patchDay(day.weekday, { open: event.target.value })}
                    >
                      {TIME_SLOTS.map((slot) => (
                        <option key={`open-${day.weekday}-${slot}`} value={slot}>{slot}</option>
                      ))}
                    </select>
                    <select
                      aria-label={t('hours.close')}
                      className="h-10 w-full rounded-xl border border-navy-800/10 bg-white px-3 text-sm text-navy-800 outline-none focus:border-navy-500"
                      value={day.close || '18:00'}
                      onChange={(event) => patchDay(day.weekday, { close: event.target.value })}
                    >
                      {TIME_SLOTS.map((slot) => (
                        <option key={`close-${day.weekday}-${slot}`} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </>
                )}
                <button
                  type="button"
                  disabled={day.closed}
                  onClick={() => copyToOpenDays(day)}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl px-2 text-xs font-semibold text-navy-800 disabled:cursor-not-allowed disabled:text-ink-300"
                  title={t('hours.copyHint')}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sm:sr-only">{t('hours.copy')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {errorKey ? <p className="mt-2 text-xs text-red-600">{t(errorKey)}</p> : null}
    </section>
  );
}
