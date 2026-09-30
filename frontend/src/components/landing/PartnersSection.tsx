import { Card } from '@/components/ui/Card';
import { useI18n } from '@/locales';

export function PartnersSection() {
  const { t } = useI18n();

  return (
    <section id="partners" className="mx-auto max-w-7xl px-4 pb-24 md:px-8">
      <div className="grid gap-16">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-copper-500">{t('landing.partnersEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl text-navy-800 md:text-4xl">{t('landing.partnersTitle')}</h2>
          <Card className="mt-8">
            <p className="text-sm text-ink-500">{t('landing.partnersEmpty')}</p>
          </Card>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-copper-500">{t('landing.storesEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl text-navy-800 md:text-4xl">{t('landing.storesTitle')}</h2>
          <Card className="mt-8">
            <p className="text-sm text-ink-500">{t('landing.storesEmpty')}</p>
          </Card>
        </div>
      </div>
    </section>
  );
}
