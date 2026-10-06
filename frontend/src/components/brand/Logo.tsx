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
      <motion.span
        whileHover={{ rotate: -6, scale: 1.04 }}
        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl"
      >
        <img
          src="/brand-logo.png"
          alt=""
          className="absolute left-1/2 top-1/2 h-full w-full max-w-none -translate-x-1/2 -translate-y-1/2 scale-[2.15] object-cover"
        />
      </motion.span>
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
          <span className={cn('block text-[11px] font-medium', inverted ? 'text-white/70' : 'text-ink-400')}>
            {t('brand.tagline')}
          </span>
        </span>
      ) : null}
    </Link>
  );
}
