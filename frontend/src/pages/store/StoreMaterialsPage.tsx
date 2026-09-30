import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
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
import { materialStoreApi, vnd } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { ApiResponse } from '@/types/user';
import { MATERIAL_CATEGORIES, type CatalogMaterial, type Storefront } from '@/types/partner';

const schema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  sku: z.string().optional(),
  unit: z.string().min(1),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().min(0),
  minOrderQty: z.coerce.number().min(1),
  image: z.string().optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function StoreMaterialsPage() {
  const { t, te } = useI18n();
  const { pathname } = useLocation();
  const view = pathname.includes('/prices') ? 'price' : pathname.includes('/products') ? 'product' : 'catalog';
  const title =
    view === 'price' ? t('materialPage.priceTitle') : view === 'product' ? t('materialPage.productTitle') : t('materialPage.catalogTitle');
  const [approved, setApproved] = useState(false);
  const [store, setStore] = useState<Storefront | null>(null);
  const [items, setItems] = useState<CatalogMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogMaterial | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const load = async () => {
    const workspace = await materialStoreApi.workspace();
    setApproved(workspace.data.data.approved);
    if (!workspace.data.data.approved) {
      setStore(workspace.data.data.store);
      setItems([]);
      return;
    }
    const storeRes = await materialStoreApi.getStore();
    setStore(storeRes.data.data);
    if (!storeRes.data.data) {
      setItems([]);
      return;
    }
    const res = await materialStoreApi.listMaterials();
    setItems(res.data.data);
  };

  useEffect(() => {
    void load()
      .catch(() => setError(t('servicePage.needStoreFirst')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) return <DashboardSkeleton />;
  if (!approved) {
    return (
      <PageTransition>
        <PageHeader eyebrow={t('materialPage.eyebrow')} title={t('materialPage.gatedTitle')} />
        <VerificationGate to="/store/verification" />
      </PageTransition>
    );
  }

  const openNew = () => {
    setEditing(null);
    form.reset({ name: '', category: 'Cement', sku: '', unit: 'bag', price: 0, stock: 0, minOrderQty: 1 });
    setOpen(true);
  };

  const persist = form.handleSubmit(async (values) => {
    setBusy(true);
    setError('');
    try {
      await materialStoreApi.saveMaterial(values, editing?.id);
      setOpen(false);
      await load();
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      setError(te(ax.response?.data?.message) || t('materialPage.saveFail'));
    } finally {
      setBusy(false);
    }
  });

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('materialPage.eyebrow')}
        title={title}
        description={t('materialPage.description')}
        actions={store ? <Button onClick={openNew}>{t('forms.addSku')}</Button> : undefined}
      />

      {!store ? (
        <EmptyState icon={<Package className="h-5 w-5" />} title={t('servicePage.needStore')} body={t('materialPage.needStoreBody')} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Package className="h-5 w-5" />} title={t('materialPage.empty')} body={t('materialPage.emptyBody')} actionLabel={t('materialPage.addFirst')} onAction={openNew} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const low = item.stock <= item.minOrderQty * 2;
            return (
              <Card key={item.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-copper-600">{item.category}</p>
                    <h3 className="font-display text-lg text-navy-800">{item.name}</h3>
                    <p className="text-xs text-ink-400">{item.sku || t('materialPage.noSku')} · /{item.unit}</p>
                  </div>
                  <Badge tone={low ? 'warn' : 'success'}>{t('materialPage.inYard', { n: item.stock })}</Badge>
                </div>
                <p className="mt-4 font-display text-2xl text-navy-800">{vnd(item.price)}</p>
                <p className="text-xs text-ink-400">{t('forms.minOrder', { n: item.minOrderQty, unit: item.unit })}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(item); form.reset(item); setOpen(true); }}>{t('common.edit')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void materialStoreApi.deleteMaterial(item.id).then(load)}>{t('common.remove')}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} onOpenChange={setOpen} title={editing ? t('materialPage.edit') : t('materialPage.create')} size="lg">
        <form className="grid gap-4" onSubmit={persist}>
          <Input id="m-name" label={t('materialPage.name')} {...form.register('name')} error={form.formState.errors.name?.message} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select id="m-cat" label={t('servicePage.category')} {...form.register('category')}>
              {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{labeled(t, 'category', c)}</option>)}
            </Select>
            <Input id="m-sku" label={t('materialPage.sku')} {...form.register('sku')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input id="m-price" label={t('materialPage.price')} type="number" {...form.register('price')} />
            <Input id="m-stock" label={t('materialPage.stock')} type="number" {...form.register('stock')} />
            <Input id="m-unit" label={t('materialPage.unit')} {...form.register('unit')} />
          </div>
          <Input id="m-min" label={t('materialPage.minQty')} type="number" {...form.register('minOrderQty')} />
          <Input id="m-image" label={t('servicePage.imageUrl')} {...form.register('image')} />
          <TextArea id="m-desc" label={t('materialPage.notes')} {...form.register('description')} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" loading={busy}>{t('forms.saveMaterial')}</Button>
        </form>
      </Modal>
    </PageTransition>
  );
}
