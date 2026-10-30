import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { repairCreatePath, withAuthRedirect } from '@/types/sprint4';

export function RequestRepairButton({
  contractorId,
  storeId,
  size = 'sm',
  variant = 'copper',
  label,
  className,
}: {
  contractorId: string;
  storeId?: string | null;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'copper' | 'outline';
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  if (user && user.role !== 'CUSTOMER') return null;
  const text = label || t('public.requestRepair');
  const path = repairCreatePath(contractorId, storeId);
  const href = withAuthRedirect(path, user?.role);

  return (
    <Button asChild size={size} variant={variant} className={className}>
      <Link to={href}>
        <Wrench className="h-4 w-4" /> {text}
      </Link>
    </Button>
  );
}
