import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { withRegisterParams, type RegisterableRole } from '@/lib/register-role';
import { useI18n } from '@/locales';
import { cn } from '@/lib/cn';

type PartnerRegisterPanelProps = {
  /** Dark hero overlay (AuthLayout left) vs light block on mobile login. */
  variant?: 'dark' | 'light';
  className?: string;
};

type PartnerRole = Extract<RegisterableRole, 'CONTRACTOR' | 'MATERIAL_STORE_OWNER'>;

export function PartnerRegisterPanel({ variant = 'dark', className }: PartnerRegisterPanelProps) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<PartnerRole | null>(null);
  const next = params.get('next');
  const dark = variant === 'dark';

  function roleButtonClass(role: PartnerRole) {
    const isSelected = selected === role;
    if (dark) {
      return cn(
        'flex min-h-12 items-center justify-center rounded-2xl border px-4 py-3 text-center text-sm font-semibold text-white transition duration-200',
        'backdrop-blur-[2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-300',
        isSelected
          ? 'border-copper-400 bg-navy-900/55 ring-1 ring-copper-400/50'
          : 'border-white/55 bg-white/14 hover:border-white/80 hover:bg-white/24 active:border-copper-400 active:bg-navy-900/45'
      );
    }
    return cn(
      'flex min-h-12 items-center justify-center rounded-2xl border-2 px-4 py-3 text-center text-sm font-semibold transition duration-200',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-400',
      isSelected
        ? 'border-copper-500 bg-copper-50 text-navy-800 ring-2 ring-copper-400/30'
        : 'border-navy-800/25 bg-white text-navy-800 hover:border-copper-400 hover:bg-copper-50'
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
      {dark ? (
        <>
          <p className="text-xs uppercase tracking-[0.28em] text-copper-300 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
            {t('brand.eyebrow')}
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.35)] sm:text-4xl">
            {t('auth.partnerPanelTitle')}
          </h2>
        </>
      ) : (
        <h2 className="font-display text-lg text-navy-800">{t('auth.partnerPanelTitle')}</h2>
      )}

      <p
        className={cn(
          'mt-3 text-sm',
          dark ? 'text-white/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]' : 'text-ink-500'
        )}
      >
        {t('auth.partnerPanelAsk')}
      </p>

      <p
        className={cn(
          'mt-5 text-sm font-semibold',
          dark ? 'text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]' : 'text-navy-800'
        )}
      >
        {t('auth.partnerRegisterHeading')}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Link
          to={withRegisterParams('CONTRACTOR', next)}
          aria-pressed={selected === 'CONTRACTOR'}
          onClick={() => setSelected('CONTRACTOR')}
          className={roleButtonClass('CONTRACTOR')}
        >
          {t('auth.partnerPickContractor')}
        </Link>
        <Link
          to={withRegisterParams('MATERIAL_STORE_OWNER', next)}
          aria-pressed={selected === 'MATERIAL_STORE_OWNER'}
          onClick={() => setSelected('MATERIAL_STORE_OWNER')}
          className={roleButtonClass('MATERIAL_STORE_OWNER')}
        >
          {t('auth.partnerPickStore')}
        </Link>
      </div>

      {!dark ? (
        <p className="mt-5 text-sm text-ink-400">{t('auth.partnerPanelFoot')}</p>
      ) : null}
    </div>
  );
}
