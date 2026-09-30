import { ArrowRight, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/locales';

export function HeroSection() {
  const { t } = useI18n();

  return (
    <section className="relative min-h-[92vh] overflow-hidden bg-navy-800 text-white">
      <img
        src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=2000&q=80"
        alt={t('landing.heroAlt')}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-hero-wash" />
      <div className="absolute inset-0 bg-copper-glow" />
      <div className="absolute inset-0 blueprint-frame" />

      <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-center px-4 py-24 md:px-8">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs uppercase tracking-[0.32em] text-copper-300"
        >
          {t('landing.heroEyebrow')}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.05] md:text-6xl lg:text-7xl"
        >
          {t('brand.slogan')}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="mt-6 max-w-xl text-base text-white/75 md:text-lg"
        >
          {t('brand.subtitle')}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <Button asChild variant="copper" size="lg">
            <Link to="/explore">
              {t('landing.ctaFind')} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white/25 bg-white/5 text-white hover:bg-white/10">
            <a href="#how">
              <Play className="h-4 w-4" /> {t('landing.ctaHow')}
            </a>
          </Button>
        </motion.div>

        <div className="mt-16 grid max-w-3xl grid-cols-3 gap-6 border-t border-white/15 pt-8">
          {[
            ['12k+', t('landing.statsJobs')],
            ['4.8', t('landing.statsRating')],
            ['3 km', t('landing.statsRadius')],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="font-display text-2xl md:text-3xl">{value}</p>
              <p className="mt-1 text-xs text-white/60 md:text-sm">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
