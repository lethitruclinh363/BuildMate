import { labeled } from '@/locales';

const LEGACY_WORKER_NOTICE: Record<string, string> = {
  WORKER_ASSIGNED: 'Contractor accepted the job',
  WORKER_ACCEPTED: 'Contractor accepted the job',
  WORKER_STARTED: 'Contractor started the job',
  WORKER_COMPLETED: 'Contractor completed the job',
};

export function notificationTitle(
  t: (path: string) => string,
  item: { type?: string; title: string }
) {
  const fromType = item.type ? LEGACY_WORKER_NOTICE[item.type] : undefined;
  const fromTitle = LEGACY_WORKER_NOTICE[item.title];
  return labeled(t, 'notify.titles', fromType || fromTitle || item.title);
}
