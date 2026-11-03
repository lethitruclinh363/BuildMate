import { Link, useSearchParams } from 'react-router-dom';
import { withRegisterParams } from '@/lib/register-role';
import { useI18n } from '@/locales';
import { cn } from '@/lib/cn';

type PartnerRegisterPanelProps = {
  /** Dark hero overlay (AuthLayout left) vs light block on mobile login. */
  variant?: 'dark' | 'light';
  compact?: boolean;
  selectedRole?: 'CONTRACTOR' | 'MATERIAL_STORE_OWNER';
  className?: string;
};

export function PartnerRegisterPanel({
  variant = 'dark',
  compact = false,
  selectedRole,
  className,
}: PartnerRegisterPanelProps) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const next = params.get('next');
  const dark = variant === 'dark';

  function roleButtonClass(role: 'CONTRACTOR' | 'MATERIAL_STORE_OWNER') {
    if (dark) {
      return cn(
        'flex min-h-12 items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-semibold text-white transition-colors',
        selectedRole === role
          ? 'border-white bg-white/25'
          : 'border-white/40 bg-white/10 hover:bg-white/20',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
      );
    }
    return cn(
      'flex min-h-12 items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-semibold transition-colors',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-400',
      'border-navy-800/15 bg-white text-navy-800 hover:border-navy-800/35 hover:bg-paper-50'
    );
  }

  return (
    <div
      className={cn(
        // Dark: layout only — no card chrome (content on hero image)
        dark ? 'max-w-md text-white' : 'rounded-2xl border border-navy-800/10 bg-navy-800/5 p-4',
        className
      )}
    >
      {!compact && dark ? (
        <>
          <p className="text-xs uppercase tracking-wider text-copper-200">
            {t('brand.eyebrow')}
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-white">
            {t('auth.partnerPanelTitle')}
          </h2>
        </>
      ) : !compact ? (
        <h2 className="font-display text-lg text-navy-800">{t('auth.partnerPanelTitle')}</h2>
      ) : null}

      {!compact ? (
        <p className={cn('mt-3 text-sm', dark ? 'text-white/80' : 'text-ink-500')}>
          {t('auth.partnerPanelAsk')}
        </p>
      ) : null}

      {!compact ? (
        <p className={cn('mt-5 text-sm font-semibold', dark ? 'text-white' : 'text-navy-800')}>
          {t('auth.partnerRegisterHeading')}
        </p>
      ) : null}

      <div className={cn('grid gap-3 sm:grid-cols-2', !compact && 'mt-3')}>
        <Link
          to={withRegisterParams('CONTRACTOR', next)}
          aria-current={selectedRole === 'CONTRACTOR' ? 'page' : undefined}
          className={roleButtonClass('CONTRACTOR')}
        >
          {t('auth.partnerPickContractor')}
        </Link>
        <Link
          to={withRegisterParams('MATERIAL_STORE_OWNER', next)}
          aria-current={selectedRole === 'MATERIAL_STORE_OWNER' ? 'page' : undefined}
          className={roleButtonClass('MATERIAL_STORE_OWNER')}
        >
          {t('auth.partnerPickStore')}
        </Link>
      </div>

      {!compact && !dark ? (
        <p className="mt-5 text-sm text-ink-400">{t('auth.partnerPanelFoot')}</p>
      ) : null}
    </div>
  );
}
