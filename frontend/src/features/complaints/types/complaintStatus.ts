import type { ComplaintStatus } from './complaint.types';

type Tone = 'navy' | 'copper' | 'mist' | 'success' | 'warn' | 'danger';

export const COMPLAINT_FILTERS: Array<ComplaintStatus | ''> = ['', 'OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED'];

export function complaintStatusTone(status: ComplaintStatus): Tone {
  if (status === 'RESOLVED') return 'success';
  if (status === 'PROCESSING') return 'copper';
  if (status === 'REJECTED') return 'danger';
  return 'warn';
}

export function complaintTimeline(status: ComplaintStatus) {
  return [
    { key: 'created' as const, done: true, current: status === 'OPEN' },
    { key: 'processing' as const, done: status !== 'OPEN', current: status === 'PROCESSING' },
    {
      key: 'closed' as const,
      done: status === 'RESOLVED' || status === 'REJECTED',
      current: status === 'RESOLVED' || status === 'REJECTED',
    },
  ];
}
