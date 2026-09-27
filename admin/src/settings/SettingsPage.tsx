import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/auth.store';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { roleLabel } from '@/lib/utils';
import { setAdminLanguage } from '@/locales/i18n';
import { applyAdminTheme, useUiStore } from '@/stores/ui.store';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <div>
      <PageHeader
        eyebrow={t('shell.workspace')}
        title={t('pages.settings')}
        description={t('pages.settingsDesc')}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.16em] text-copper-400">{t('shell.signedIn')}</p>
          <p className="mt-2 font-display text-xl">{user?.name}</p>
          <p className="text-sm text-white/50">{user?.email}</p>
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-copper-400">{roleLabel(user?.role)}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.16em] text-copper-400">{t('nav.settings')}</p>
          <p className="mt-2 text-sm text-white/60">{t('shell.languageHint')}</p>
          <div className="mt-4 flex gap-2">
            {(['vi', 'en'] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setAdminLanguage(lng)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  i18n.language === lng ? 'bg-copper-500 text-navy-950' : 'bg-white/8 text-white/70'
                }`}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="mt-6 text-sm text-white/60">{t('shell.appearance')}</p>
          <div className="mt-3 flex gap-2">
            {(['dark', 'oled'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setTheme(mode);
                  applyAdminTheme(mode);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  theme === mode ? 'bg-copper-500 text-navy-950' : 'bg-white/8 text-white/70'
                }`}
              >
                {mode === 'dark' ? t('shell.dark') : t('shell.oled')}
              </button>
            ))}
          </div>
          <Link to="/commission" className="mt-6 inline-block text-sm text-copper-300">
            {t('shell.openCommission')}
          </Link>
        </GlassCard>
      </div>
    </div>
  );
}
