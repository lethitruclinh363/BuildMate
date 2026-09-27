import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { Clock, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { VerificationGate } from '@/components/contractor/VerificationGate';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { useContractorWorkspace } from '@/hooks/useContractorWorkspace';
import { contractorApi, mediaUrl, vnd } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { ApiResponse } from '@/types/user';
import { SERVICE_CATEGORIES, type CatalogService } from '@/types/partner';

const schema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  basePrice: z.coerce.number().min(0),
  unit: z.enum(['JOB', 'HOUR', 'M2', 'DAY']),
  estimatedHours: z.coerce.number().min(0.5),
  image: z.string().optional(),
  description: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ContractorServicesPage() {
  const { t, te } = useI18n();
  const { data, loading, approved } = useContractorWorkspace();
  const [items, setItems] = useState<CatalogService[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogService | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const load = async () => {
    const res = await contractorApi.listServices();
    setItems(res.data.data);
  };

  useEffect(() => {
    if (approved && data?.store) void load().catch(() => setError(t('servicePage.needStoreFirst')));
  }, [approved, data?.store]);

  if (loading) return <DashboardSkeleton />;
  if (!approved) {
    return (
      <PageTransition>
        <PageHeader eyebrow={t('servicePage.catalog')} title={t('servicePage.gatedTitle')} />
        <VerificationGate />
      </PageTransition>
    );
  }

  const openNew = () => {
    setEditing(null);
    form.reset({ name: '', category: 'Waterproofing', basePrice: 0, unit: 'JOB', estimatedHours: 4, isActive: true });
    setOpen(true);
  };

  const openEdit = (item: CatalogService) => {
    setEditing(item);
    form.reset(item);
    setOpen(true);
  };

  const persist = form.handleSubmit(async (values) => {
    setBusy(true);
    setError('');
    try {
      await contractorApi.saveService(values, editing?.id);
      setOpen(false);
      await load();
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      setError(te(ax.response?.data?.message) || t('servicePage.saveFail'));
    } finally {
      setBusy(false);
    }
  });

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('servicePage.eyebrow')}
        title={t('servicePage.title')}
        description={t('servicePage.description')}
        actions={<Button onClick={openNew}>{t('forms.addService')}</Button>}
      />

      {!data?.store ? (
        <EmptyState icon={<Wrench className="h-5 w-5" />} title={t('servicePage.needStore')} body={t('servicePage.needStoreBody')} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Wrench className="h-5 w-5" />} title={t('servicePage.empty')} body={t('servicePage.emptyBody')} actionLabel={t('servicePage.addFirst')} onAction={openNew} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-col overflow-hidden p-0">
              <div className="h-36 bg-navy-800/10">
                {item.image ? <img src={mediaUrl(item.image)} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg text-navy-800">{item.name}</h3>
                  <Badge tone={item.isActive ? 'success' : 'mist'}>{item.isActive ? t('servicePage.listed') : t('servicePage.hidden')}</Badge>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wider text-copper-600">{item.category}</p>
                <p className="mt-3 flex-1 text-sm text-ink-600">{item.description}</p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-display text-xl text-navy-800">{vnd(item.basePrice)}</span>
                  <span className="inline-flex items-center gap-1 text-ink-400">
                    <Clock className="h-3.5 w-3.5" /> {item.estimatedHours}h · {item.unit}
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(item)}>{t('common.edit')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void contractorApi.deleteService(item.id).then(load)}>{t('common.remove')}</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onOpenChange={setOpen} title={editing ? t('servicePage.edit') : t('servicePage.create')} size="lg" description={t('servicePage.modalHint')}>
        <form className="grid gap-4" onSubmit={persist}>
          <Input id="s-name" label={t('servicePage.name')} {...form.register('name')} error={form.formState.errors.name?.message} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select id="s-cat" label={t('servicePage.category')} {...form.register('category')}>
              {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{labeled(t, 'category', c)}</option>)}
            </Select>
            <Select id="s-unit" label={t('servicePage.unit')} {...form.register('unit')}>
              <option value="JOB">{t('forms.perJob')}</option>
              <option value="HOUR">{t('forms.perHour')}</option>
              <option value="M2">{t('forms.perM2')}</option>
              <option value="DAY">{t('forms.perDay')}</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="s-price" label={t('servicePage.basePrice')} type="number" {...form.register('basePrice')} />
            <Input id="s-hours" label={t('servicePage.hours')} type="number" step="0.5" {...form.register('estimatedHours')} />
          </div>
          <Input id="s-image" label={t('servicePage.imageUrl')} {...form.register('image')} />
          <TextArea id="s-desc" label={t('servicePage.scope')} {...form.register('description')} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" loading={busy}>{t('forms.saveService')}</Button>
        </form>
      </Modal>
    </PageTransition>
  );
}
