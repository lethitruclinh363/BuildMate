import { useI18n } from '@/locales';

export function HowSection() {
  const { t } = useI18n();
  const steps = [
    { n: '01', title: t('landing.how1Title'), body: t('landing.how1Body') },
    { n: '02', title: t('landing.how2Title'), body: t('landing.how2Body') },
    { n: '03', title: t('landing.how3Title'), body: t('landing.how3Body') },
    { n: '04', title: t('landing.how4Title'), body: t('landing.how4Body') },
  ];

  return (
    <section id="how" className="bg-navy-800 py-10 text-white md:py-12">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <p className="text-xs uppercase tracking-[0.28em] text-copper-300">{t('landing.howEyebrow')}</p>
        <h2 className="mt-3 max-w-xl font-display text-3xl md:text-4xl">{t('landing.howTitle')}</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <article key={step.n} className="border-t border-white/15 pt-4">
              <p className="text-sm font-semibold text-copper-300">{step.n}</p>
              <h3 className="mt-4 font-display text-xl">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/65">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
