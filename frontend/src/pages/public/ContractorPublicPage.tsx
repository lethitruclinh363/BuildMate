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
<<<<<<< HEAD

  return (
    <PageTransition>
      <div className="px-4 py-6 md:px-8 md:py-10">
        <ContractorProfileShowcase
          profile={payload.publicProfile}
          services={payload.services || []}
          highlights={payload.highlights}
        />
=======
  const { contractor, store, services } = payload;
  const displayName = contractor.businessName || contractor.name || 'Contractor';
  const initial = displayName.charAt(0).toUpperCase();
  const description = contractor.description || t('public.noDescription');
  const address = contractor.address || t('public.noAddress');

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card hover={false} className="overflow-hidden p-0">
            <div className="h-48 bg-navy-800">
              {store?.coverImage ? (
                <img src={mediaUrl(store.coverImage)} alt="" className="h-full w-full object-cover opacity-80" />
              ) : null}
            </div>
            <div className="-mt-10 px-6 pb-6">
              <div className="flex items-end gap-4">
                <div className="grid h-20 w-20 place-items-center rounded-2xl bg-navy-800 font-display text-2xl text-paper-50">
                  {initial}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-3xl text-navy-800">{displayName}</h1>
                    <Badge tone="success">{t('common.verified')}</Badge>
                  </div>
                  <p className="text-sm text-ink-400">{t('public.years', { n: contractor.yearsExperience || 0, city: contractor.city || t('public.unknownCity') })}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-ink-600">{description}</p>
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-ink-600">
                <MapPin className="h-4 w-4 text-copper-500" /> {address}
              </p>
              {store ? (
              <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-navy-800">
                <Star className="h-4 w-4 fill-copper-400 text-copper-400" /> {(store.rating ?? 0).toFixed(1)}
                <span className="font-normal text-ink-400">{t('public.reviewsSeed', { n: store.reviewCount ?? 0 })}</span>
              </p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <RequestRepairButton
                  contractorId={contractor.userId}
                  storeId={store?.id}
                  size="md"
                />
                {store ? (
                  <Button asChild variant="outline">
                    <Link to={`/stores/${store.id}`}>{t('public.openStore')}</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card hover={false}>
              <h2 className="font-display text-xl text-navy-800">{t('public.certificates')}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {((contractor.license || []) as Array<{ url: string; originalName: string }>).concat(contractor.certificates || []).map((doc) => (
                  <img key={doc.url} src={mediaUrl(doc.url)} alt={doc.originalName} className="h-28 w-full rounded-2xl object-cover" />
                ))}
              </div>
            </Card>
            <Card hover={false}>
              <h2 className="font-display text-xl text-navy-800">{t('public.portfolio')}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(contractor.portfolio || []).map((doc) => (
                  <img key={doc.url} src={mediaUrl(doc.url)} alt="" className="h-28 w-full rounded-2xl object-cover" />
                ))}
              </div>
            </Card>
            <Card hover={false}>
              <h2 className="font-display text-xl text-navy-800">{t('public.reviews')}</h2>
              <p className="mt-2 text-sm text-ink-400">{t('public.reviewsSoon')}</p>
            </Card>
          </div>
        </div>

        <h2 className="mt-10 font-display text-2xl text-navy-800">{t('public.services')}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Card key={s.id}>
              <Badge tone="copper">{s.category}</Badge>
              <h3 className="mt-3 font-display text-lg text-navy-800">{s.name}</h3>
              <p className="mt-2 text-sm text-ink-600">{s.description}</p>
              <p className="mt-3 font-display text-xl text-navy-800">{vnd(s.basePrice)}</p>
            </Card>
          ))}
        </div>
>>>>>>> af3e5f8 (Implement Complete Contractor Public Profile)
      </div>
    </PageTransition>
  );
}
