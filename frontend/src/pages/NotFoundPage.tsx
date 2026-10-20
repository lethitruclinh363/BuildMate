import { Link } from 'react-router-dom';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { getDefaultRouteByRole, useAuth } from '@/context/AuthContext';
import { useI18n } from '@/locales';

export function NotFoundPage() {
  const { t } = useI18n();
  const { currentUser, loading } = useAuth();
  const home = !loading && currentUser ? getDefaultRouteByRole(currentUser) : '/';
  return (
    <PageTransition>
      <div className="grid min-h-[70vh] place-items-center px-4">
        <div className="max-w-md text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-copper-500">{t('brand.name')}</p>
          <h1 className="mt-3 font-display text-4xl text-navy-800">{t('notFound.title')}</h1>
          <p className="mt-3 text-sm text-ink-400">{t('notFound.body')}</p>
          <Button asChild className="mt-6">
            <Link to={home}>{t('notFound.home')}</Link>
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
