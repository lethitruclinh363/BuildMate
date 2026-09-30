import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/locales';
import type { VerificationStatus } from '@/types/partner';

const tones: Record<VerificationStatus, 'mist' | 'warn' | 'success' | 'danger' | 'copper'> = {
  DRAFT: 'mist',
  SUBMITTED: 'warn',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const keys: Record<VerificationStatus, string> = {
  DRAFT: 'verify.draft',
  SUBMITTED: 'verify.review',
  APPROVED: 'verify.approved',
  REJECTED: 'verify.revision',
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const { t } = useI18n();
  return <Badge tone={tones[status]}>{t(keys[status])}</Badge>;
}
