import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/auth.store';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { roleLabel } from '@/lib/utils';
import { setAdminLanguage } from '@/locales/i18n';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <PageHeader
        eyebrow={t('shell.workspace')}
        title={t('pages.settings')}
        description={t('pages.settingsDesc')}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.16em] text-[#526477]">{t('shell.signedIn')}</p>
          <p className="mt-2 font-display text-xl font-bold text-[#16283C]">{user?.name}</p>
          <p className="text-sm text-[#526477]">{user?.email}</p>
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[#526477]">{roleLabel(user?.role)}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.16em] text-[#526477]">{t('nav.settings')}</p>
          <p className="mt-2 text-sm text-[#526477]">{t('shell.languageHint')}</p>
          <div className="mt-4 flex gap-2">
            {(['vi', 'en'] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setAdminLanguage(lng)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  i18n.language === lng
                    ? 'border-[#173B4F] bg-[#173B4F] text-white shadow-sm'
                    : 'border-[#E1E7ED] bg-white text-[#526477] hover:bg-[#F8FAFC] hover:text-[#16283C]'
                }`}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
