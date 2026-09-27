import { Badge } from '@/components/ui/Badge';
import { labeled, useI18n } from '@/locales';
import type { ComplaintStatus } from '../types/complaint.types';
import { complaintStatusTone } from '../types/complaintStatus';

export function ComplaintStatusBadge({ status }: { status: ComplaintStatus }) {
  const { t } = useI18n();
  return <Badge tone={complaintStatusTone(status)}>{labeled(t, 'complaintStatus', status)}</Badge>;
}
