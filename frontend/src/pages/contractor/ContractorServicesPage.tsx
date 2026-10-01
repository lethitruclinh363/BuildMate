import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { Check, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { VerificationGate } from '@/components/contractor/VerificationGate';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import {
  catalogCategoryLabel,
  catalogPickLabel,
  catalogServiceLabel,
  collapseServiceName,
  CONTRACTOR_SERVICE_CATEGORIES,
  normalizeServiceName,
  type ContractorServiceCategory,
  type ContractorServicePick,
} from '@/data/contractor-services';
import { useContractorWorkspace } from '@/hooks/useContractorWorkspace';
import { api, getApiErrorMessage } from '@/lib/api';
import { contractorApi, mediaUrl, vnd } from '@/lib/partner-api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import type { ApiResponse } from '@/types/user';
import type { CatalogService } from '@/types/partner';

const schema = z.object({
  basePrice: z.coerce.number().refine((value) => value > 0, 'Enter a base price'),
  unit: z.enum(['JOB', 'HOUR', 'M2', 'DAY']),
  estimatedHours: z.coerce.number().min(0.5),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const UNIT_KEY = {
  JOB: 'forms.perJob',
  HOUR: 'forms.perHour',
  M2: 'forms.perM2',
  DAY: 'forms.perDay',
} as const;

export function ContractorServicesPage() {
  const { t, te } = useI18n();
  const { data, loading, approved } = useContractorWorkspace();
  const [items, setItems] = useState<CatalogService[]>([]);
  const [approvedCustoms, setApprovedCustoms] = useState<ContractorServicePick[]>([]);
  const [editing, setEditing] = useState<CatalogService | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeName, setProposeName] = useState('');
  const [proposeCategory, setProposeCategory] = useState<ContractorServiceCategory | ''>('');
  const [proposeNote, setProposeNote] = useState('');
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const load = async () => {
    const [services, catalog] = await Promise.all([
      contractorApi.listServices(),
      contractorApi.listServiceCatalog().catch(() => ({ data: { data: [] as ContractorServicePick[] } })),
    ]);
    setItems(services.data.data);
    setApprovedCustoms(catalog.data.data || []);
  };

  useEffect(() => {
    if (approved && data?.store) void load().catch(() => setError(t('servicePage.needStoreFirst')));
  }, [approved, data?.store]);

  const titleOf = (item: { name: string; catalogType?: string }) =>
    item.catalogType === 'CUSTOM' ? item.name : catalogServiceLabel(item.name, t);

  const registeredKeys = useMemo(() => {
    const keys = new Set<string>();
    items.forEach((item) => {
      if (item.catalogKey) keys.add(item.catalogKey);
      keys.add(normalizeServiceName(item.name));
      keys.add(normalizeServiceName(titleOf(item)));
    });
    return keys;
  }, [items, t]);

  const catalogRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return approvedCustoms
      .map((item) => {
        const catalogKey = item.catalogKey || item.serviceId || '';
        const name = item.labelKey ? catalogPickLabel({ name: item.labelKey, labelKey: item.labelKey, label: item.name }, t) : item.name;
        return {
          catalogKey,
          name,
          category: catalogCategoryLabel(item.category, t),
          registered:
            Boolean(catalogKey && registeredKeys.has(catalogKey)) ||
            registeredKeys.has(normalizeServiceName(item.name)) ||
            registeredKeys.has(normalizeServiceName(item.labelKey || '')) ||
            registeredKeys.has(normalizeServiceName(name)),
        };
      })
      .filter((item) => item.catalogKey)
      .filter((item) => {
        if (!needle) return true;
        return `${item.name} ${item.category}`.toLowerCase().includes(needle);
      });
  }, [approvedCustoms, query, registeredKeys, t]);

  if (loading) return <DashboardSkeleton />;
  if (!approved) {
    return (
      <PageTransition>
        <PageHeader eyebrow={t('servicePage.eyebrow')} title={t('servicePage.gatedTitle')} />
        <VerificationGate />
      </PageTransition>
    );
  }

  const openComplete = (item: CatalogService) => {
    if (item.completionStatus === 'PENDING_APPROVAL' || item.id.startsWith('pending-')) return;
    setEditing(item);
    setImage(item.image || '');
    setError('');
    form.reset({
      basePrice: item.basePrice && item.basePrice > 0 ? item.basePrice : ('' as unknown as number),
      unit: item.unit || 'JOB',
      estimatedHours: item.estimatedHours && item.estimatedHours > 0 ? item.estimatedHours : 4,
      description: item.description || '',
    });
  };

  const persist = form.handleSubmit(async (values) => {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      await contractorApi.saveService(
        {
          basePrice: values.basePrice,
          unit: values.unit,
          estimatedHours: values.estimatedHours,
          description: values.description || '',
          image,
        },
        editing.id
      );
      setEditing(null);
      await load();
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      setError(te(ax.response?.data?.message) || t('servicePage.saveFail'));
    } finally {
      setBusy(false);
    }
  });

  async function registerPicked() {
    setBusy(true);
    setError('');
    try {
      for (const catalogKey of picked) {
        await contractorApi.registerService(catalogKey);
      }
      setPicked([]);
      setRegisterOpen(false);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function propose() {
    const name = collapseServiceName(proposeName);
    if (!name) {
      setProposeNote(t('auth.onboardCustomRequired'));
      return;
    }
    if (!proposeCategory) {
      setProposeNote(t('auth.onboardCustomCategoryRequired'));
      return;
    }
    setBusy(true);
    setProposeNote('');
    try {
      const check = await contractorApi.checkServiceCatalog(name);
      if (check.data.data.code === 'SIMILAR_SERVICE') {
        setProposeNote(t('auth.onboardCustomSimilarIntro'));
        return;
      }
      if (check.data.data.code !== 'AVAILABLE') {
        setProposeNote(t('auth.onboardCustomExistsIntro'));
        return;
      }
      await contractorApi.createCustomService({ name, category: proposeCategory });
      setProposeOpen(false);
      setProposeName('');
      setProposeCategory('');
      setRegisterOpen(false);
      await load();
    } catch (err) {
      setProposeNote(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onImage(file: File) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError(t('servicePage.imageInvalid'));
      return;
    }
    const body = new FormData();
    body.append('file', file);
    const res = await api.post<ApiResponse<{ url: string }>>('/upload/stores', body, { timeout: 60000 });
    setImage(res.data.data.url);
    setError('');
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('servicePage.eyebrow')}
        title={t('servicePage.title')}
        description={t('servicePage.description')}
        actions={<Button onClick={() => { setRegisterOpen(true); setError(''); }}>{t('servicePage.registerMore')}</Button>}
      />

      {!data?.store ? (
        <EmptyState icon={<Wrench className="h-5 w-5" />} title={t('servicePage.needStore')} body={t('servicePage.needStoreBody')} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-5 w-5" />}
          title={t('servicePage.empty')}
          body={t('servicePage.emptyBody')}
          actionLabel={t('servicePage.addFirst')}
          onAction={() => setRegisterOpen(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const pending = item.completionStatus === 'PENDING_APPROVAL';
            const complete = item.completionStatus === 'COMPLETED' && Number(item.basePrice) > 0;
            return (
              <Card key={item.id} hover={false} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-navy-800 text-paper-50">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg text-navy-800">{titleOf(item)}</h3>
                    <p className="text-sm text-ink-400">{catalogCategoryLabel(item.category, t)}</p>
                  </div>
                </div>
                {pending ? (
                  <p className="mt-4 text-sm font-semibold text-copper-700">{t('servicePage.pending')}</p>
                ) : complete ? (
                  <p className="mt-4 text-sm font-semibold text-emerald-700">✓ {t('servicePage.completed')}</p>
                ) : (
                  <p className="mt-4 text-sm font-semibold text-amber-700">⚠ {t('servicePage.incomplete')}</p>
                )}
                <p className="mt-2 flex-1 text-sm leading-6 text-ink-600">
                  {pending ? t('servicePage.pendingHint') : complete ? '' : t('servicePage.incompleteHint')}
                </p>
                {complete ? (
                  <p className="mt-3 text-sm text-navy-800">
                    <span className="font-display text-xl">{vnd(item.basePrice || 0)}</span>
                    <span className="ml-2 text-ink-400">{t(UNIT_KEY[item.unit] || 'forms.perJob')}</span>
                  </p>
                ) : null}
                {pending ? null : (
                  <Button className="mt-4" variant={complete ? 'outline' : 'primary'} onClick={() => openComplete(item)}>
                    {complete ? t('servicePage.edit') : t('servicePage.complete')}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        title={t('servicePage.completeTitle')}
        size="lg"
      >
        {editing ? (
          <form className="grid gap-4" onSubmit={persist}>
            <Input id="s-name" label={t('servicePage.name')} value={titleOf(editing)} readOnly />
            <Input id="s-cat" label={t('servicePage.category')} value={catalogCategoryLabel(editing.category, t)} readOnly />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select id="s-unit" label={t('servicePage.unit')} {...form.register('unit')}>
                <option value="JOB">{t('forms.perJob')}</option>
                <option value="HOUR">{t('forms.perHour')}</option>
                <option value="M2">{t('forms.perM2')}</option>
                <option value="DAY">{t('forms.perDay')}</option>
              </Select>
              <Input id="s-price" label={t('servicePage.basePrice')} type="number" min="1" {...form.register('basePrice')} error={form.formState.errors.basePrice ? t('servicePage.priceRequired') : undefined} />
            </div>
            <Input id="s-hours" label={t('servicePage.hours')} type="number" step="0.5" min="0.5" {...form.register('estimatedHours')} />
            <TextArea id="s-desc" label={t('servicePage.scope')} {...form.register('description')} />
            <label className="block text-sm font-medium text-navy-800">
              {t('servicePage.image')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1.5 block w-full text-sm"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImage(file);
                }}
              />
            </label>
            {image ? <img src={mediaUrl(image)} alt="" className="h-28 w-full rounded-2xl object-cover" /> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" loading={busy}>{t('servicePage.saveDetails')}</Button>
          </form>
        ) : null}
      </Modal>

      <Modal open={registerOpen} onOpenChange={setRegisterOpen} title={t('servicePage.registerMore')} size="lg">
        <div className="space-y-4">
          <Input id="s-search" label={t('auth.onboardServiceSearch')} value={query} onChange={(event) => setQuery(event.target.value)} />
          <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
            {catalogRows.map((item) => (
              <li key={item.catalogKey}>
                <button
                  type="button"
                  disabled={item.registered}
                  onClick={() =>
                    setPicked((current) =>
                      current.includes(item.catalogKey) ? current.filter((key) => key !== item.catalogKey) : [...current, item.catalogKey]
                    )
                  }
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left',
                    item.registered || picked.includes(item.catalogKey) ? 'border-navy-800 bg-navy-800/5' : 'border-navy-800/10 bg-white'
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md border border-navy-800/20">
                    {item.registered || picked.includes(item.catalogKey) ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-800">{item.name}</span>
                    <span className="block text-xs text-ink-400">{item.registered ? t('servicePage.registered') : item.category}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="text-sm font-semibold text-navy-800" onClick={() => setProposeOpen((open) => !open)}>
            + {t('servicePage.propose')}
          </button>
          {proposeOpen ? (
            <div className="rounded-2xl bg-paper-50 p-4">
              <Input id="propose-name" label={t('auth.onboardCustomName')} value={proposeName} onChange={(event) => setProposeName(event.target.value)} />
              <label className="mt-3 block text-sm font-medium text-navy-800">
                {t('auth.onboardCustomCategory')}
                <select
                  value={proposeCategory}
                  onChange={(event) => setProposeCategory(event.target.value as ContractorServiceCategory | '')}
                  className="mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm"
                >
                  <option value="">{t('auth.onboardCustomCategoryPlaceholder')}</option>
                  {CONTRACTOR_SERVICE_CATEGORIES.map((item) => (
                    <option key={item} value={item}>{catalogCategoryLabel(item, t)}</option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-ink-400">{t('auth.onboardCustomAvailableNote')}</p>
              {proposeNote ? <p className="mt-2 text-sm text-red-600">{proposeNote}</p> : null}
              <Button className="mt-3" type="button" variant="outline" loading={busy} onClick={() => void propose()}>
                {t('servicePage.propose')}
              </Button>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="button" loading={busy} disabled={picked.length === 0} onClick={() => void registerPicked()}>
            {t('servicePage.addFirst')}
          </Button>
        </div>
      </Modal>
    </PageTransition>
  );
}
