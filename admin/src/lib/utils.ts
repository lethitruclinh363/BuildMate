import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import i18n from '@/locales/i18n';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function localeTag() {
  return i18n.language?.startsWith('en') ? 'en-US' : 'vi-VN';
}

export function vnd(value: number) {
  const formatted = new Intl.NumberFormat(localeTag()).format(Math.round(value || 0));
  return i18n.language?.startsWith('en') ? `${formatted} VND` : `${formatted}đ`;
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeTag(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const LEGACY_WORKER_STATUSES = new Set([
  'ASSIGNING_WORKER',
  'ASSIGNED',
  'WAITING_WORKER',
  'WORKER_ACCEPTED',
  'WORKER_COMPLETED',
]);

function enumText(group: string, code: string) {
  const key = `${group}.${code}`;
  const hit = i18n.t(key);
  return hit && hit !== '—' && hit !== key ? hit : code;
}

export function roleLabel(role?: string | null) {
  if (!role) return '—';
  return enumText('roles', role);
}

export function orderStatusLabel(status: string) {
  if (LEGACY_WORKER_STATUSES.has(status)) return enumText('orderStatus', 'IN_PROGRESS');
  return enumText('orderStatus', status);
}

export function paymentStatusLabel(status: string) {
  return enumText('paymentStatus', status);
}

export function complaintStatusLabel(status: string) {
  if (!status) return i18n.t('complaintStatus.all');
  return enumText('complaintStatus', status);
}

export function shortenId(id: string) {
  if (!id) return '—';
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function mediaUrl(url?: string) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:')) return url;
  const origin = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace(/\/api\/v1\/?$/, '');
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

export async function settleAll<T>(jobs: Array<Promise<T>>): Promise<T[]> {
  const results = await Promise.allSettled(jobs);
  const values: T[] = [];
  for (const row of results) {
    if (row.status === 'fulfilled') values.push(row.value);
  }
  return values;
}
