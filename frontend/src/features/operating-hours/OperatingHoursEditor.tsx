import { FormLabel } from '@/components/ui/FormLabel';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import {
  isValidTime,
  minutesOf,
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

  function shiftTime(time: string, minutes: number) {
    const total = minutesOf(time);
    if (total === null) return undefined;
    const shifted = total + minutes;
    if (shifted < 0 || shifted >= 24 * 60) return undefined;
    return `${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`;
  }

  function updateOpenTime(day: WeeklyDay, nextOpen: string, currentClose: string) {
    const nextMinutes = minutesOf(nextOpen);
    const closeMinutes = minutesOf(currentClose);
    if (!isValidTime(nextOpen) || nextMinutes === null || closeMinutes === null || nextMinutes >= closeMinutes) return;
    patchDay(day.weekday, { open: nextOpen });
  }

  function updateCloseTime(day: WeeklyDay, currentOpen: string, nextClose: string) {
    const nextMinutes = minutesOf(nextClose);
    const openMinutes = minutesOf(currentOpen);
    if (!isValidTime(nextClose) || nextMinutes === null || openMinutes === null || nextMinutes <= openMinutes) return;
    patchDay(day.weekday, { close: nextClose });
  }

  return (
    <section id="hours-editor" className={cn('sm:col-span-2', className)}>
      <FormLabel>{t('hours.title')}</FormLabel>
      <p className="mt-1 text-xs leading-5 text-ink-500">{t('hours.hint')}</p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
        <div className="hidden grid-cols-[1.2fr_0.8fr_1fr_1fr] gap-2 border-b border-navy-800/8 bg-mist-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:grid">
          <span>{t('hours.day')}</span>
          <span>{t('hours.active')}</span>
          <span>{t('hours.open')}</span>
          <span>{t('hours.close')}</span>
        </div>
        <ul>
          {value.days.map((day) => {
            const label = t(`hours.days.${DAY_KEYS[day.weekday - 1]}`);
            const openTime = day.open && isValidTime(day.open) ? day.open : '07:00';
            const closeTime =
              day.close && isValidTime(day.close)
                ? day.close
                : day.weekday === 6
                  ? '17:00'
                  : '18:00';
            return (
              <li
                key={day.weekday}
                className="grid grid-cols-1 items-center gap-2 border-t border-navy-800/6 px-3 py-3 first:border-t-0 sm:grid-cols-[1.2fr_0.8fr_1fr_1fr] sm:gap-2 sm:py-2"
              >
                <p className="text-sm font-semibold text-navy-800">{label}</p>
                <select
                  aria-label={`${label} ${t('hours.active')}`}
                  className="h-10 w-full rounded-xl border border-navy-800/10 bg-white px-3 text-sm text-navy-800 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10"
                  value={day.closed ? 'closed' : 'open'}
                  onChange={(event) => toggleDay(day, event.target.value === 'open')}
                >
                  <option value="open">{t('hours.openDay')}</option>
                  <option value="closed">{t('hours.closed')}</option>
                </select>
                {day.closed ? (
                  <p className="text-sm font-medium text-ink-400 sm:col-span-2">{t('hours.rest')}</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label htmlFor={`hours-open-${day.weekday}`} className="block text-xs text-ink-500 sm:sr-only">
                        {t('hours.open')}
                      </label>
                      <input
                        id={`hours-open-${day.weekday}`}
                        type="time"
                        step={60}
                        aria-label={`${label} ${t('hours.open')}`}
                        className="h-10 w-full accent-navy-800 rounded-xl border border-navy-800/10 bg-white px-3 text-sm text-navy-800 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10"
                        value={openTime}
                        max={shiftTime(closeTime, -1)}
                        onChange={(event) => updateOpenTime(day, event.target.value, closeTime)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`hours-close-${day.weekday}`} className="block text-xs text-ink-500 sm:sr-only">
                        {t('hours.close')}
                      </label>
                      <input
                        id={`hours-close-${day.weekday}`}
                        type="time"
                        step={60}
                        aria-label={`${label} ${t('hours.close')}`}
                        className="h-10 w-full accent-navy-800 rounded-xl border border-navy-800/10 bg-white px-3 text-sm text-navy-800 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10"
                        value={closeTime}
                        min={shiftTime(openTime, 1)}
                        onChange={(event) => updateCloseTime(day, openTime, event.target.value)}
                      />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {errorKey ? <p className="mt-2 text-xs text-red-600">{t(errorKey)}</p> : null}
    </section>
  );
}
