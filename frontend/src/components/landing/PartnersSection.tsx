import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReturnState } from '@/lib/navigation';
import { BadgeCheck, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MediaFrame } from '@/components/media/ProfileMedia';
import { catalogCategoryLabel } from '@/data/contractor-services';
import { api } from '@/lib/api';
import { useI18n } from '@/locales';

interface FeaturedContractor {
  id: string;
  name: string;
  avatar?: string;
  rating: number | null;
  reviewCount: number;
  completedJobs: number;
  services: string[];
  verified: boolean;
}

interface FeaturedStore {
  id: string;
  name: string;
  image?: string;
  rating: number | null;
  reviewCount: number;
  completedOrders: number;
  verified: boolean;
  deliveryEnabled: boolean;
}

interface FeaturedProviders {
  contractors: FeaturedContractor[];
  stores: FeaturedStore[];
}

function RatingLine({ rating, reviewCount }: { rating: number | null; reviewCount: number }) {
  const { t } = useI18n();
  return (
    <p className="inline-flex items-center gap-1 text-sm font-semibold text-navy-800">
      <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
      {reviewCount > 0 && rating != null ? `${rating.toFixed(1)} (${reviewCount})` : t('landing.noReviews')}
    </p>
  );
}

export function PartnersSection() {
  const { t } = useI18n();
  const back = useReturnState();
  const [data, setData] = useState<FeaturedProviders | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<{ data: FeaturedProviders }>('/public/featured-providers', { silent: true })
      .then((res) => {
        if (!active) return;
        setData({
          contractors: res.data.data?.contractors || [],
          stores: res.data.data?.stores || [],
        });
      })
      .catch(() => {
        if (active) setData({ contractors: [], stores: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  const contractors = data?.contractors || [];
  const stores = data?.stores || [];

  return (
    <section id="partners" className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <div className="grid gap-16">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-copper-500">{t('landing.partnersEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl text-navy-800 md:text-4xl">{t('landing.partnersTitle')}</h2>
          {data && contractors.length === 0 ? (
            <p className="mt-6 border-t border-navy-800/10 pt-4 text-sm text-ink-500">{t('landing.partnersEmpty')}</p>
          ) : (
            <div className="mt-6 grid gap-4 border-t border-navy-800/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {contractors.map((crew) => {
                const trades = crew.services.map((item) => catalogCategoryLabel(item, t)).filter(Boolean);
                return (
                  <article key={crew.id} className="flex h-full flex-col rounded-2xl border border-navy-800/10 bg-white p-4">
                    <div className="flex gap-3">
                      <Link to={`/contractors/${crew.id}`} state={back} className="h-14 w-14 shrink-0" aria-label={crew.name}>
                        <MediaFrame
                          src={crew.avatar}
                          alt={crew.name}
                          fit="cover"
                          frameClassName="h-14 w-14 rounded-xl"
                          empty={<span className="absolute inset-0 grid place-items-center bg-navy-800 font-display text-xl text-paper-50">{crew.name.slice(0, 1)}</span>}
                        />
                      </Link>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/contractors/${crew.id}`} state={back} className="font-display text-xl text-navy-800 hover:text-copper-600">
                            {crew.name}
                          </Link>
                          {crew.verified ? (
                            <Badge tone="success">
                              <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                              {t('common.verified')}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-ink-500">{trades.join(' · ') || t('landing.crewTrade')}</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1">
                      <RatingLine rating={crew.rating} reviewCount={crew.reviewCount} />
                      <p className="text-sm text-ink-600">{t('landing.jobsCompleted', { n: crew.completedJobs })}</p>
                    </div>
                    <Button asChild size="sm" variant="outline" className="mt-4 w-fit">
                      <Link to={`/contractors/${crew.id}`} state={back}>{t('explore.viewProfile')}</Link>
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-copper-500">{t('landing.storesEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl text-navy-800 md:text-4xl">{t('landing.storesTitle')}</h2>
          {data && stores.length === 0 ? (
            <p className="mt-6 border-t border-navy-800/10 pt-4 text-sm text-ink-500">{t('landing.storesEmpty')}</p>
          ) : (
            <div className="mt-6 grid gap-4 border-t border-navy-800/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <article key={store.id} className="flex h-full flex-col rounded-2xl border border-navy-800/10 bg-white p-4">
                  <div className="flex gap-3">
                    <Link to={`/stores/${store.id}`} state={back} className="h-14 w-14 shrink-0" aria-label={store.name}>
                      <MediaFrame
                        src={store.image}
                        alt={store.name}
                        fit="cover"
                        frameClassName="h-14 w-14 rounded-xl"
                        empty={<span className="absolute inset-0 grid place-items-center bg-navy-800 font-display text-xl text-paper-50">{store.name.slice(0, 1)}</span>}
                      />
                    </Link>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/stores/${store.id}`} state={back} className="font-display text-xl text-navy-800 hover:text-copper-600">
                          {store.name}
                        </Link>
                        {store.verified ? (
                          <Badge tone="success">
                            <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                            {t('common.verified')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-ink-500">{t('landing.storeKind')}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-1">
                    <RatingLine rating={store.rating} reviewCount={store.reviewCount} />
                    {store.deliveryEnabled ? <p className="text-sm text-ink-600">{t('landing.deliveryOn')}</p> : null}
                  </div>
                  <Button asChild size="sm" variant="outline" className="mt-4 w-fit">
                    <Link to={`/stores/${store.id}`} state={back}>{t('landing.viewStore')}</Link>
                  </Button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
