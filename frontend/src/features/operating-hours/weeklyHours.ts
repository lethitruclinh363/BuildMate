export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type WeeklyDay = {
  weekday: Weekday;
  closed: boolean;
  open: string | null;
  close: string | null;
};

export type WeeklyHours = {
  configured: boolean;
  days: WeeklyDay[];
};

export type HoursState = 'UNSET' | 'OPEN' | 'CLOSED' | 'REST';

export type HoursStatus = {
  state: HoursState;
  weekday: Weekday;
  open: string | null;
  close: string | null;
};

<<<<<<< HEAD
const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const WEEKDAY_SHORT: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export const TIME_SLOTS: string[] = Array.from({ length: 96 }, (_, index) => {
  const hour = String(Math.floor(index / 4)).padStart(2, '0');
  const minute = String((index % 4) * 15).padStart(2, '0');
  return `${hour}:${minute}`;
});

=======
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const WEEKDAY_SHORT: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

>>>>>>> origin/main
export function emptyDays(): WeeklyDay[] {
  return WEEKDAYS.map((weekday) => ({ weekday, closed: true, open: null, close: null }));
}

export function unsetHours(): WeeklyHours {
  return { configured: false, days: emptyDays() };
}

export function minutesOf(value: string | null | undefined) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTime(value: string | null | undefined) {
  return TIME_RE.test(String(value || ''));
}

type HoursDayInput = {
  weekday?: number;
  dayOfWeek?: number;
  day?: number;
  closed?: boolean;
  isOpen?: boolean;
  open?: string | null;
  close?: string | null;
  openTime?: string | null;
  closeTime?: string | null;
};

export function normalizeWeeklyHours(input: unknown): WeeklyHours {
  if (!input) return unsetHours();
  let rawInput: unknown = input;
  if (typeof input === 'string') {
    try {
      rawInput = JSON.parse(input);
    } catch {
      return unsetHours();
    }
  }
  if (!rawInput || typeof rawInput !== 'object') return unsetHours();
  const raw = rawInput as { configured?: boolean; days?: unknown; operatingHours?: unknown };
  const list = Array.isArray(rawInput) ? rawInput : raw.days || raw.operatingHours;
  if (!Array.isArray(list) || list.length !== 7) return unsetHours();
  const days = emptyDays().map((fallback) => {
    const found = list.find((item) => {
      const row = item as HoursDayInput;
      return Number(row.weekday ?? row.dayOfWeek ?? row.day) === fallback.weekday;
    }) as HoursDayInput | undefined;
    if (!found || found.closed === true || found.isOpen === false) {
      return { ...fallback, closed: true, open: null, close: null };
    }
    return {
      weekday: fallback.weekday,
      closed: false,
      open: found.open || found.openTime || null,
      close: found.close || found.closeTime || null,
    };
  });
  const configured = raw.configured === true || days.some((day) => !day.closed);
  return configured ? { configured: true, days } : unsetHours();
}

export function weeklyHoursError(hours: WeeklyHours) {
  if (!hours.configured) return '';
  for (const day of hours.days) {
    if (day.closed) continue;
    if (!isValidTime(day.open) || !isValidTime(day.close)) return 'hours.timeRequired';
    if ((minutesOf(day.close) || 0) <= (minutesOf(day.open) || 0)) return 'hours.closeAfterOpen';
  }
  return '';
}

export function vietnamClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: WEEKDAY_SHORT[map.weekday] || (1 as Weekday),
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}

export function hoursStatus(hours: WeeklyHours, now = new Date()): HoursStatus {
  const clock = vietnamClock(now);
  const normalized = normalizeWeeklyHours(hours);
  if (!normalized.configured) {
    return { state: 'UNSET', weekday: clock.weekday, open: null, close: null };
  }
  const day = normalized.days.find((item) => item.weekday === clock.weekday);
  if (!day || day.closed) {
    return { state: 'REST', weekday: clock.weekday, open: null, close: null };
  }
  const start = minutesOf(day.open);
  const end = minutesOf(day.close);
  const open = start != null && end != null && clock.minutes >= start && clock.minutes < end;
  return {
    state: open ? 'OPEN' : 'CLOSED',
    weekday: clock.weekday,
    open: day.open,
    close: day.close,
  };
}

export function formatRange(day: WeeklyDay) {
  if (day.closed || !day.open || !day.close) return '';
  return `${day.open} – ${day.close}`;
}
