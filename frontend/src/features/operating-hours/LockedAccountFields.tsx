import { Lock } from 'lucide-react';
import { FormLabel } from '@/components/ui/FormLabel';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

export function LockedAccountFields({
  phone,
  email,
  className,
}: {
  phone: string;
  email: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', className)}>
      <LockedField id="account-phone" label={t('auth.phone')} value={phone} />
      <LockedField id="account-email" label={t('auth.email')} value={email} />
      <p className="text-xs leading-5 text-ink-500 sm:col-span-2">{t('hours.accountLockedHint')}</p>
    </div>
  );
}

function LockedField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <label className="block" htmlFor={id}>
      <FormLabel>
        <span className="inline-flex items-center gap-1.5">
          {label}
          <Lock className="h-3.5 w-3.5 text-ink-400" aria-hidden />
        </span>
      </FormLabel>
      <input
        id={id}
        readOnly
        tabIndex={0}
        value={value || '—'}
        className="mt-1.5 h-12 w-full cursor-not-allowed rounded-2xl border border-navy-800/10 bg-slate-100 px-4 text-sm text-ink-600 outline-none"
      />
    </label>
  );
}
