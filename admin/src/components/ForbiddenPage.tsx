import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--admin-bg)] p-6">
      <GlassCard className="max-w-md text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-[#E05252]" />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#526477]">403</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-[#16283C]">{t('errors.forbiddenTitle')}</h1>
        <p className="mt-2 text-sm text-[#526477]">{t('errors.forbiddenBody')}</p>
        <Link
          to="/login"
          className="mt-6 inline-flex rounded-xl bg-[#173B4F] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#102D3D] transition"
        >
          {t('errors.backLogin')}
        </Link>
      </GlassCard>
    </div>
  );
}
