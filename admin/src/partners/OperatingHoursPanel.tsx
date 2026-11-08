import { Lock } from 'lucide-react';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type AdminWeeklyHours = {
  configured?: boolean;
  days?: Array<{ weekday: number; closed: boolean; open?: string | null; close?: string | null }>;
} | null;

export function OperatingHoursPanel({
  title,
  hours,
  unsetLabel,
  restLabel,
  dayLabels,
}: {
  title: string;
  hours?: AdminWeeklyHours;
  unsetLabel: string;
  restLabel: string;
  dayLabels: Record<(typeof DAY_KEYS)[number], string>;
}) {
  const days = hours?.configured && Array.isArray(hours.days) ? [...hours.days].sort((a, b) => a.weekday - b.weekday) : [];
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-[#7E92A2]">{title}</p>
      {days.length ? (
        <ul className="mt-3 divide-y divide-[#E1E7ED] overflow-hidden rounded-2xl border border-[#E1E7ED] bg-white">
          {days.map((day) => {
            const key = DAY_KEYS[day.weekday - 1];
            return (
              <li key={day.weekday} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-semibold text-[#16283C]">{dayLabels[key]}</span>
                <span className="text-[#526477]">{day.closed ? restLabel : `${day.open || '—'} – ${day.close || '—'}`}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[#526477]">{unsetLabel}</p>
      )}
    </div>
  );
}

export function LockedContactValue({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-[#7E92A2]">
        <span className="inline-flex items-center gap-1.5">
          {label}
          <Lock className="h-3.5 w-3.5" aria-hidden />
        </span>
      </p>
      <div className="mt-1 rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] px-3 py-2 text-sm font-semibold text-[#16283C]">
        {value || '—'}
      </div>
    </div>
  );
}
