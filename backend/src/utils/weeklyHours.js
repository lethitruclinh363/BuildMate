const { ApiError } = require('./ApiError');

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const WEEKDAY_SHORT = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const DAY_LABELS = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };

function emptyDays() {
  return WEEKDAYS.map((weekday) => ({ weekday, closed: true, open: null, close: null }));
}

function unsetHours() {
  return { configured: false, days: emptyDays() };
}

function minutesOf(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function invalid(message) {
  return new ApiError(400, message);
}

function coerceHoursInput(input) {
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return input;
  }
}

function parseDay(raw, fallbackWeekday) {
  const weekday = Number(raw?.weekday ?? raw?.dayOfWeek ?? raw?.day ?? fallbackWeekday);
  const closed = raw?.closed === true || raw?.open === false || raw?.isOpen === false;
  if (!WEEKDAYS.includes(weekday)) {
    throw invalid('Operating hours days are invalid');
  }
  if (closed) {
    return { weekday, closed: true, open: null, close: null };
  }
  const open = String(raw?.open || raw?.openTime || '').trim();
  const close = String(raw?.close || raw?.closeTime || '').trim();
  if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
    throw invalid('Choose opening and closing times in 15-minute steps');
  }
  if (minutesOf(close) <= minutesOf(open)) {
    throw invalid('Closing time must be after opening time');
  }
  return { weekday, closed: false, open, close };
}

function normalizeWeeklyHours(input) {
  input = coerceHoursInput(input);
  if (input == null || input === '') return unsetHours();
  if (typeof input !== 'object') return unsetHours();
  const list = Array.isArray(input) ? input : input.days || input.operatingHours;
  if (!Array.isArray(list) || list.length !== 7) {
    return unsetHours();
  }
  try {
    return parseWeeklyHours(input);
  } catch {
    return unsetHours();
  }
}

function parseWeeklyHours(input) {
  input = coerceHoursInput(input);
  if (input == null || input === '') return unsetHours();
  if (typeof input !== 'object') throw invalid('Invalid operating hours');
  if (input.configured === false && !Array.isArray(input.days) && !Array.isArray(input.operatingHours)) {
    return unsetHours();
  }

  const list = Array.isArray(input) ? input : input.days || input.operatingHours;
  if (!Array.isArray(list) || !list.length) {
    return unsetHours();
  }
  if (list.length !== 7) throw invalid('Operating hours must include all 7 days');

  const seen = new Set();
  const days = list.map((item, index) => {
    const day = parseDay(item, WEEKDAYS[index]);
    if (seen.has(day.weekday)) throw invalid('Operating hours days are invalid');
    seen.add(day.weekday);
    return day;
  });
  days.sort((a, b) => a.weekday - b.weekday);
  if (seen.size !== 7) throw invalid('Operating hours must include all 7 days');

  const anyOpen = days.some((day) => !day.closed);
  const configured = input.configured === false ? false : anyOpen || input.configured === true;
  if (!configured) return unsetHours();
  return { configured: true, days };
}

function summarizeWeeklyHours(hours) {
  const normalized = normalizeWeeklyHours(hours);
  if (!normalized.configured) return '';
  const groups = [];
  for (const day of normalized.days) {
    const stamp = day.closed ? 'closed' : `${day.open}-${day.close}`;
    const prev = groups[groups.length - 1];
    if (prev && prev.stamp === stamp && prev.end === day.weekday - 1) {
      prev.end = day.weekday;
      continue;
    }
    groups.push({ start: day.weekday, end: day.weekday, stamp, closed: day.closed, open: day.open, close: day.close });
  }
  return groups
    .map((group) => {
      const label = group.start === group.end ? DAY_LABELS[group.start] : `${DAY_LABELS[group.start]}–${DAY_LABELS[group.end]}`;
      return group.closed ? `${label} nghỉ` : `${label} ${group.open}–${group.close}`;
    })
    .join(' · ')
    .slice(0, 200);
}

function vietnamClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: WEEKDAY_SHORT[map.weekday] || 1,
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}

function hoursStatus(hours, now = new Date()) {
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

function persistableWeeklyHours(hours) {
  const normalized = normalizeWeeklyHours(hours);
  if (!normalized.configured) return null;
  return normalized;
}

function toOperatingHours(hours) {
  const normalized = normalizeWeeklyHours(hours);
  if (!normalized.configured) return [];
  return normalized.days.map((day) => ({
    dayOfWeek: day.weekday,
    isOpen: !day.closed,
    openTime: day.open,
    closeTime: day.close,
  }));
}

function resolveWeeklyHoursUpdate(existing, raw) {
  if (raw === undefined) {
    return { persist: false, hours: persistableWeeklyHours(existing) };
  }
  const parsed = parseWeeklyHours(raw);
  if (!parsed.configured) {
    return { persist: false, hours: persistableWeeklyHours(existing) };
  }
  return { persist: true, hours: persistableWeeklyHours(parsed) };
}

function accountContact(user) {
  return {
    contactPhone: String(user?.phoneNumber || user?.phone || '').trim(),
    contactEmail: String(user?.email || '').trim().toLowerCase(),
  };
}

function applyAccountContact(profile, user) {
  const contact = accountContact(user);
  profile.contactPhone = contact.contactPhone;
  profile.contactEmail = contact.contactEmail;
  return contact;
}

module.exports = {
  WEEKDAYS,
  TIME_RE,
  TIME_ZONE,
  emptyDays,
  unsetHours,
  minutesOf,
  parseWeeklyHours,
  normalizeWeeklyHours,
  summarizeWeeklyHours,
  hoursStatus,
  persistableWeeklyHours,
  toOperatingHours,
  resolveWeeklyHoursUpdate,
  accountContact,
  applyAccountContact,
};
