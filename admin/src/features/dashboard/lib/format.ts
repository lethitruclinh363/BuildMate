import i18n from '@/locales/i18n';

function localeTag() {
  return i18n.language?.startsWith('en') ? 'en-US' : 'vi-VN';
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return i18n.t('time.morning');
  if (hour < 18) return i18n.t('time.afternoon');
  return i18n.t('time.evening');
}

export function relativeTime(value?: string | null) {
  if (!value) return i18n.t('time.justNow');
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(delta / 60000));
  if (minutes < 1) return i18n.t('time.justNow');
  if (minutes < 60) return i18n.t('time.minutes', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return i18n.t('time.hours', { n: hours });
  const days = Math.round(hours / 24);
  return i18n.t('time.days', { n: days });
}

export function compactVnd(value: number) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000_000) return i18n.t('money.billion', { n: (value / 1_000_000_000).toFixed(1) });
  if (abs >= 1_000_000) return i18n.t('money.million', { n: (value / 1_000_000).toFixed(1) });
  const formatted = new Intl.NumberFormat(localeTag()).format(Math.round(value || 0));
  return i18n.language?.startsWith('en') ? `${formatted} VND` : `${formatted}đ`;
}

export function formatKpi(value: number, format: 'number' | 'vnd' | 'compact') {
  if (format === 'vnd' || format === 'compact') return compactVnd(value);
  return new Intl.NumberFormat(localeTag()).format(Math.round(value || 0));
}

export function dayLabels(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i));
    return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
  });
}

export function monthLabels() {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i));
    return d.toLocaleDateString(localeTag(), { month: 'short' });
  });
}

export function chartHasValues(rows: Array<Record<string, any>>, keys: string[]) {
  return rows.some((row) =>
    keys.some((key) => {
      const value = Number(row[key]);
      return Number.isFinite(value) && value > 0;
    })
  );
}

export function periodDelta(values: number[]) {
  if (values.length < 2) return 0;
  const prev = values[values.length - 2] || 0;
  const last = values[values.length - 1] || 0;
  if (!prev) return 0;
  return Math.round(((last - prev) / prev) * 1000) / 10;
}
