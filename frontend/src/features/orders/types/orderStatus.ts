import type { OrderFilter, OrderStatus, ProgressStatus } from './order.types';

type Tone = 'navy' | 'copper' | 'mist' | 'success' | 'warn' | 'danger';

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'REQUEST_CREATED',
  'QUOTATION_SENT',
  'QUOTATION_ACCEPTED',
  'DEPOSIT_PAID',
  'STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CUSTOMER_ACCEPTED',
];

export const PROCESSING_STATUSES: OrderStatus[] = ['QUOTATION_ACCEPTED', 'DEPOSIT_PAID'];
export const SITE_STATUSES: OrderStatus[] = ['STARTED', 'IN_PROGRESS'];

const LEGACY_WORKER_STATUSES = new Set([
  'ASSIGNING_WORKER',
  'ASSIGNED',
  'WAITING_WORKER',
  'WORKER_ACCEPTED',
  'WORKER_COMPLETED',
]);

export function isKnownOrderStatus(status: string): status is OrderStatus {
  return (ORDER_STATUS_SEQUENCE as string[]).includes(status) || status === 'CANCELLED';
}

export function displayOrderStatus(status: string): OrderStatus | 'UNKNOWN' {
  if (LEGACY_WORKER_STATUSES.has(status) || !isKnownOrderStatus(status)) return 'UNKNOWN';
  return status;
}

export function orderStatusTone(status: string): Tone {
  const shown = displayOrderStatus(status);
  if (shown === 'CUSTOMER_ACCEPTED') return 'success';
  if (shown === 'CANCELLED') return 'danger';
  if (shown === 'COMPLETED' || shown === 'DEPOSIT_PAID') return 'warn';
  if (shown === 'STARTED' || shown === 'IN_PROGRESS') return 'copper';
  return 'navy';
}

export function matchesOrderFilter(status: OrderStatus, filter: OrderFilter) {
  if (filter === 'all') return true;
  if (filter === 'processing') return PROCESSING_STATUSES.includes(status);
  if (filter === 'in_progress') return SITE_STATUSES.includes(status);
  if (filter === 'waiting') return status === 'COMPLETED';
  if (filter === 'completed') return status === 'CUSTOMER_ACCEPTED';
  return status === 'CANCELLED';
}

export function canCancelOrder(status: OrderStatus) {
  return status === 'QUOTATION_ACCEPTED' || status === 'DEPOSIT_PAID';
}

/** Next forward progress status only. Start from DEPOSIT_PAID uses the dedicated accept button. */
export function allowedProgressStatuses(status: OrderStatus): ProgressStatus[] {
  switch (status) {
    case 'DEPOSIT_PAID':
      return [];
    case 'STARTED':
      return ['IN_PROGRESS'];
    case 'IN_PROGRESS':
      return ['COMPLETED'];
    default:
      return [];
  }
}

export type TimelineKey =
  | 'request'
  | 'quoteSent'
  | 'quote'
  | 'deposit'
  | 'started'
  | 'progress'
  | 'completed'
  | 'accepted';

export interface TimelineStep {
  key: TimelineKey;
  done: boolean;
  current: boolean;
}

const TIMELINE_RANK: Record<OrderStatus, number> = {
  REQUEST_CREATED: 1,
  QUOTATION_SENT: 2,
  QUOTATION_ACCEPTED: 3,
  DEPOSIT_PAID: 4,
  STARTED: 5,
  IN_PROGRESS: 6,
  COMPLETED: 7,
  CUSTOMER_ACCEPTED: 8,
  CANCELLED: 0,
};

export function buildTimeline(status: OrderStatus): TimelineStep[] {
  const current = TIMELINE_RANK[status];
  const finished = status === 'CUSTOMER_ACCEPTED';
  const steps: { key: TimelineKey; threshold: number }[] = [
    { key: 'request', threshold: 1 },
    { key: 'quoteSent', threshold: 2 },
    { key: 'quote', threshold: 3 },
    { key: 'deposit', threshold: 4 },
    { key: 'started', threshold: 5 },
    { key: 'progress', threshold: 6 },
    { key: 'completed', threshold: 7 },
    { key: 'accepted', threshold: 8 },
  ];

  return steps.map((step) => {
    const done = status !== 'CANCELLED' && (current > step.threshold || (finished && current >= step.threshold));
    const currentStep = status !== 'CANCELLED' && !done && current === step.threshold;
    return { key: step.key, done, current: currentStep };
  });
}
