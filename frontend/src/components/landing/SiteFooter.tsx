import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { useI18n } from '@/locales';

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-navy-800/10 bg-navy-900 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-4 md:px-8">
        <div className="md:col-span-2">
          <Logo inverted />
          <p className="mt-4 max-w-sm text-sm text-white/60">{t('landing.footerBlurb')}</p>
        </div>
        <div>
          <p className="text-sm font-semibold">{t('landing.footerPlatform')}</p>
          <ul className="mt-3 space-y-2 text-sm text-white/60">
            <li><a href="/#why">{t('landing.whyEyebrow')}</a></li>
            <li><a href="/#services">{t('landing.servicesEyebrow')}</a></li>
            <li><Link to="/register">{t('landing.becomePartner')}</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">{t('landing.footerAccount')}</p>
          <ul className="mt-3 space-y-2 text-sm text-white/60">
            <li><Link to="/login">{t('common.login')}</Link></li>
            <li><Link to="/register">{t('landing.createAccount')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-6 text-center text-xs text-white/40">
        {t('landing.copyright', { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
