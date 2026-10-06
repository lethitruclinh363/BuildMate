import { MapPinned, MessagesSquare, ShieldCheck, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { fadeUp, stagger } from '@/lib/motion';
import { useI18n } from '@/locales';

export function WhySection() {
  const { t } = useI18n();
  const reasons = [
    { icon: MapPinned, title: t('landing.why1Title'), body: t('landing.why1Body') },
    { icon: MessagesSquare, title: t('landing.why2Title'), body: t('landing.why2Body') },
    { icon: Timer, title: t('landing.why3Title'), body: t('landing.why3Body') },
    { icon: ShieldCheck, title: t('landing.why4Title'), body: t('landing.why4Body') },
  ];

  return (
    <section id="why" className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <p className="text-xs uppercase tracking-[0.28em] text-copper-500">{t('landing.whyEyebrow')}</p>
      <h2 className="mt-3 max-w-2xl font-display text-3xl text-navy-800 md:text-4xl">{t('landing.whyTitle')}</h2>
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4"
      >
        {reasons.map((item, i) => (
          <motion.div key={item.title} variants={fadeUp} custom={i}>
            <Card className="h-full p-5">
              <item.icon className="h-6 w-6 text-copper-600" />
              <h3 className="mt-3 text-lg font-semibold text-navy-800">{item.title}</h3>
              <p className="mt-1 text-sm font-normal leading-6 text-ink-600">{item.body}</p>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
