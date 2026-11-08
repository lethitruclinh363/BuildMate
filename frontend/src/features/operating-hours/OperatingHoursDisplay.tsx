import { Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import {
  formatRange,
  hoursStatus,
  normalizeWeeklyHours,
  type WeeklyHours,
} from '@/features/operating-hours/weeklyHours';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function OperatingHoursDisplay({
  hours,
  className,
  compact = false,
}: {
  hours?: WeeklyHours | null;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const normalized = normalizeWeeklyHours(hours);
  const status = hoursStatus(normalized);
  const todayLabel = t(`hours.days.${DAY_KEYS[status.weekday - 1]}`);

  if (!normalized.configured) {
    return (
      <div className={className}>
        <h2 className="font-display text-xl text-navy-800">{t('hours.title')}</h2>
        <p className="mt-3 text-sm text-ink-500">{t('hours.unset')}</p>
      </div>
    );
  }

  const today = normalized.days.find((day) => day.weekday === status.weekday);
  const statusLabel =
    status.state === 'OPEN' ? t('hours.openNow') : status.state === 'REST' ? t('hours.restToday') : t('hours.closedNow');
  const todayRange = today && !today.closed ? formatRange(today) : t('hours.rest');

  return (
    <div className={className}>
      <h2 className="font-display text-xl text-navy-800">{t('hours.title')}</h2>
      <p className="mt-3 text-sm text-ink-500">{t('hours.today', { day: todayLabel })}</p>
      <p className="mt-2 inline-flex items-center gap-2 font-display text-2xl text-navy-800">
        <Clock className="h-5 w-5 text-copper-500" />
        {todayRange}
      </p>
      <p
        className={cn(
          'mt-2 text-sm font-semibold',
          status.state === 'OPEN' ? 'text-emerald-700' : 'text-ink-500'
        )}
      >
        {statusLabel}
      </p>
      {compact ? null : (
        <ul className="mt-4 space-y-1.5">
          {normalized.days.map((day) => {
            const current = day.weekday === status.weekday;
            return (
              <li
                key={day.weekday}
                className={cn(
                  'flex items-center justify-between rounded-xl px-3 py-2 text-sm',
                  current ? 'bg-navy-800 text-white' : 'text-ink-600'
                )}
              >
                <span className={cn('font-semibold', current ? 'text-white' : 'text-navy-800')}>
                  {t(`hours.days.${DAY_KEYS[day.weekday - 1]}`)}
                </span>
                <span>{day.closed ? t('hours.rest') : formatRange(day)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
