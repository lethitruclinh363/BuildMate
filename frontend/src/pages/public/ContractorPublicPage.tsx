import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageTransition } from '@/components/motion/PageTransition';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Button } from '@/components/ui/Button';
import { locationApi } from '@/features/map/services/location.api';
import { useI18n } from '@/locales';
import type { CatalogService } from '@/types/partner';
import type { PublicContractorProfile, PublicHighlights } from '@/types/marketplace';
import { ContractorProfileShowcase } from './ContractorProfileShowcase';

export function ContractorPublicPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<{
    publicProfile: PublicContractorProfile | null;
    highlights?: PublicHighlights;
    services: CatalogService[];
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    locationApi
      .contractor(id)
      .then((res) => setPayload(res.data.data))
      .catch(() => setPayload(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <DashboardSkeleton />;
  if (!payload?.publicProfile) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <ErrorState title={t('errors.notFoundContractor')} body={t('errors.notFoundContractorBody')} />
          <div className="mt-4 text-center">
            <Button asChild>
              <Link to="/explore">{t('common.backToMap')}</Link>
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }
  return (
    <PageTransition>
      <div className="px-4 py-6 md:px-8 md:py-10">
        <ContractorProfileShowcase
          profile={payload.publicProfile}
          services={payload.services || []}
          highlights={payload.highlights}
        />
      </div>
    </PageTransition>
  );
}
