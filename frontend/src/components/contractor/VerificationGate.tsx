import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/locales';

export function VerificationGate({ to = '/contractor/verification' }: { to?: string }) {
  const { t } = useI18n();
  return (
    <Card hover={false} className="border-copper-200 bg-copper-50/60">
      <ShieldAlert className="h-6 w-6 text-copper-600" />
      <h2 className="mt-3 font-display text-2xl text-navy-800">{t('verify.gateTitle')}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-ink-600">{t('verify.gateBody')}</p>
      <Button asChild className="mt-5" variant="copper">
        <Link to={to}>{t('verify.openDesk')}</Link>
      </Button>
    </Card>
  );
}
