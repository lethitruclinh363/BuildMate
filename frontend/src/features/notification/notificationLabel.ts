import { labeled } from '@/locales';

const LEGACY_WORKER_NOTICE: Record<string, string> = {
  WORKER_ASSIGNED: 'Contractor accepted the job',
  WORKER_ACCEPTED: 'Contractor accepted the job',
  WORKER_STARTED: 'Contractor started the job',
  WORKER_COMPLETED: 'Contractor completed the job',
};

const TYPE_TITLES: Record<string, string> = {
  MESSAGE: 'New message',
  REQUEST: 'New repair request',
  ORDER_CREATED: 'New repair job',
  NEW_REVIEW: 'New review',
};

export function notificationTitle(
  t: (path: string) => string,
  item: { type?: string; title: string }
) {
  const fromType = item.type ? TYPE_TITLES[item.type] || LEGACY_WORKER_NOTICE[item.type] : undefined;
  const fromTitle = LEGACY_WORKER_NOTICE[item.title];
  const raw = fromType || fromTitle || item.title;
  const hit = labeled(t, 'notify.titles', raw);
  if (!hit || hit === '—' || hit === `notify.titles.${raw}`) return raw;
  return hit;
}

export function notificationMessage(
  t: (path: string) => string,
  item: { title: string; message: string }
) {
  const heldDeposit = item.message.match(/^(.+?) is held by BuildMate \(mock\)$/);
  if (item.title === 'Deposit held in escrow' && heldDeposit) {
    return t('notify.messages.depositHeld').replace('{amount}', heldDeposit[1]);
  }
  return item.message;
}
