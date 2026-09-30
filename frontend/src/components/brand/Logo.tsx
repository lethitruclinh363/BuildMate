import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

interface LogoProps {
  inverted?: boolean;
  compact?: boolean;
  className?: string;
}

export function Logo({ inverted, compact, className }: LogoProps) {
  const { t } = useI18n();
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2.5', className)}>
      <motion.img
        whileHover={{ rotate: -6, scale: 1.04 }}
        src="/favicon.svg"
        alt=""
        className="h-9 w-9 shrink-0 rounded-xl"
      />
      {!compact ? (
        <span className="leading-tight">
          <span
            className={cn(
              'block font-display text-[17px] font-bold tracking-tight',
              inverted ? 'text-white' : 'text-navy-800'
            )}
          >
            BuildMate
          </span>
          <span className={cn('block text-[10px] uppercase tracking-[0.18em]', inverted ? 'text-white/60' : 'text-ink-400')}>
            {t('brand.tagline')}
          </span>
        </span>
      ) : null}
    </Link>
  );
}
