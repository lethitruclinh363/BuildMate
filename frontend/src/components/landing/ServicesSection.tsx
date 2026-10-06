import { BrickWall, Droplets, Hammer, PaintBucket, PlugZap, ShowerHead } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/locales';

export function ServicesSection() {
  const { t } = useI18n();
  const services = [
    { icon: Droplets, name: t('landing.svcWaterproof'), hint: t('landing.svcWaterproofHint') },
    { icon: PlugZap, name: t('landing.svcElectrical'), hint: t('landing.svcElectricalHint') },
    { icon: ShowerHead, name: t('landing.svcPlumbing'), hint: t('landing.svcPlumbingHint') },
    { icon: PaintBucket, name: t('landing.svcPainting'), hint: t('landing.svcPaintingHint') },
    { icon: BrickWall, name: t('landing.svcMasonry'), hint: t('landing.svcMasonryHint') },
    { icon: Hammer, name: t('landing.svcGeneral'), hint: t('landing.svcGeneralHint') },
  ];

  return (
    <section id="services" className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <p className="text-xs uppercase tracking-[0.28em] text-copper-500">{t('landing.servicesEyebrow')}</p>
      <h2 className="mt-3 font-display text-3xl text-navy-800 md:text-4xl">{t('landing.servicesTitle')}</h2>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <Card key={s.name} className="flex min-h-[80px] items-center gap-4 px-5 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy-800/8 text-navy-800">
              <s.icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-lg text-navy-800">{s.name}</h3>
              <p className="text-sm text-ink-400">{s.hint}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
