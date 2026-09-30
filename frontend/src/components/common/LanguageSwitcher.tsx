import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import type { Locale } from '@/locales/storage';

const options: { id: Locale; flag: string; labelKey: 'language.vi' | 'language.en' }[] = [
  { id: 'vi', flag: '🇻🇳', labelKey: 'language.vi' },
  { id: 'en', flag: '🇬🇧', labelKey: 'language.en' },
];

export function LanguageSwitcher({
  variant = 'light',
  placement = 'default',
  className,
}: {
  variant?: 'light' | 'dark';
  placement?: string;
  className?: string;
}) {
  const { locale, setLocale, t } = useI18n();
  const { currentUser } = useAuth();
  const dark = variant === 'dark';
  const pillId = `lang-pill-${variant}-${placement}`;

  return (
    <div
      role="group"
      aria-label={t('language.switch')}
      className={cn(
        'relative inline-flex items-center rounded-full p-1 shadow-card backdrop-blur-md',
        dark
          ? 'border border-white/20 bg-white/10'
          : 'border border-navy-800/10 bg-white/75',
        className
      )}
    >
      {options.map((opt) => {
        const active = locale === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              void setLocale(opt.id);
              if (!currentUser || currentUser.preferredLanguage === opt.id) return;
              void api.patch('/user/profile', { preferredLanguage: opt.id }).catch(() => undefined);
            }}
            className={cn(
              'relative z-10 flex min-w-[4.25rem] items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tracking-wider transition',
              active
                ? dark
                  ? 'text-navy-900'
                  : 'text-white'
                : dark
                  ? 'text-white/70 hover:text-white'
                  : 'text-ink-500 hover:text-navy-800'
            )}
          >
            {active ? (
              <motion.span
                layoutId={pillId}
                className={cn(
                  'absolute inset-0 rounded-full shadow-card',
                  dark ? 'bg-copper-400' : 'bg-navy-800'
                )}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            ) : null}
            <span className="relative">{opt.flag}</span>
            <span className="relative">{t(opt.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
