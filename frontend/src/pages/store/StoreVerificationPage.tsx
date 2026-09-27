import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { FileText, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { VerificationBadge } from '@/components/contractor/VerificationBadge';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import { materialStoreApi, mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import type { ContractorProfile, DocumentType, Storefront } from '@/types/partner';
import type { ApiResponse, User } from '@/types/user';

type FormValues = {
  businessName: string;
  representative: string;
  taxCode?: string;
  address: string;
  city?: string;
  deliveryArea?: string;
  phone?: string;
};

const DOC_TYPES: DocumentType[] = ['BUSINESS_LICENSE', 'ID_CARD', 'STORE_IMAGE'];

export function StoreVerificationPage() {
  const { t, te } = useI18n();
  const schema = useMemo(
    () =>
      z.object({
        businessName: z.string().min(2, t('verify.businessRequired')),
        representative: z.string().min(2, t('verify.representativeRequired')),
        taxCode: z.string().optional(),
        address: z.string().min(4, t('verify.addressRequired')),
        city: z.string().optional(),
        deliveryArea: z.string().optional(),
        phone: z.string().optional(),
      }),
    [t]
  );
  const steps = [t('verify.stepStoreProfile'), t('verify.stepEvidence'), t('verify.stepSubmit')];
  const [params] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [store, setStore] = useState<Storefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<DocumentType>('BUSINESS_LICENSE');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const refresh = async () => {
    const res = await materialStoreApi.workspace();
    setProfile(res.data.data.profile);
    setStore(res.data.data.store);
    const next = res.data.data;
    form.reset({
      businessName: next.store?.name || next.profile.businessName,
      representative: useAuthStore.getState().user?.name || '',
      taxCode: next.profile.taxCode,
      address: next.store?.address || next.profile.address,
      city: next.store?.city || next.profile.city,
      deliveryArea: (next.profile.serviceAreas || []).join(', '),
      phone: next.store?.phone || useAuthStore.getState().user?.phone || '',
    });
  };

  useEffect(() => {
    void refresh()
      .catch(() => setError(t('verify.saveFail')))
      .finally(() => setLoading(false));
  }, []);

  const fail = (err: unknown, fallback: string) => {
    const ax = err as AxiosError<ApiResponse<null>>;
    setError(te(ax.response?.data?.message) || fallback);
  };

  const locked = profile?.verificationStatus === 'SUBMITTED';

  const save = form.handleSubmit(async (values) => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const profileRes = await api.patch<ApiResponse<User>>('/user/profile', { name: values.representative });
      if (token) setSession({ user: profileRes.data.data, token });
      const serviceAreas = (values.deliveryArea || '')
        .split(',')
        .map((area) => area.trim())
        .filter(Boolean);
      await materialStoreApi.saveProfile({
        businessName: values.businessName,
        taxCode: values.taxCode,
        address: values.address,
        city: values.city,
        serviceAreas,
      });
      const storeBody = {
        name: values.businessName,
        phone: values.phone,
        address: values.address,
        city: values.city,
        storeType: 'MATERIALS' as const,
      };
      if (store) await materialStoreApi.updateStore(storeBody);
      else await materialStoreApi.createStore({ ...storeBody, lng: 105.755, lat: 10.044 });
      setMessage(t('verify.saved'));
      await refresh();
    } catch (err) {
      fail(err, t('verify.saveFail'));
    } finally {
      setBusy(false);
    }
  });

  const onUpload = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      await materialStoreApi.uploadDocument(file, docType);
      await refresh();
    } catch (err) {
      fail(err, t('verify.uploadFail'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await materialStoreApi.submit();
      setMessage(t('verify.submitted'));
      await refresh();
    } catch (err) {
      fail(err, t('verify.submitFail'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    const step = params.get('step') || 'info';
    const id = step === 'documents' ? 'store-docs' : step === 'submit' ? 'store-submit' : 'store-info';
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [params, loading]);

  if (loading || !profile) return <DashboardSkeleton />;
  const stepIndex = profile.verificationStatus === 'APPROVED' ? 2 : profile.documents.length ? 1 : 0;

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('verify.eyebrow')}
        title={t('verify.storeTitle')}
        description={t('verify.storeDescription')}
        actions={<VerificationBadge status={profile.verificationStatus} />}
      />
      <ol className="mb-8 grid grid-cols-3 gap-2">
        {steps.map((label, i) => (
          <li
            key={label}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
              i <= stepIndex ? 'bg-navy-800 text-white' : 'bg-white text-ink-400'
            }`}
          >
            0{i + 1} {label}
          </li>
        ))}
      </ol>
      {profile.verificationStatus === 'REJECTED' ? (
        <Card hover={false} className="mb-6 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">{t('forms.revision')}</p>
          <p className="mt-1 text-sm text-red-700/80">{profile.rejectionReason}</p>
        </Card>
      ) : null}
      {profile.verificationStatus === 'APPROVED' ? (
        <Card hover={false} className="mb-6 border-emerald-200 bg-emerald-50">
          <p className="font-display text-xl text-navy-800">{t('forms.livePartner')}</p>
          <p className="mt-1 text-sm text-ink-600">{t('verify.storeLiveHint')}</p>
        </Card>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div id="store-info">
        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.stepStoreProfile')}</h2>
          <form className="mt-5 grid gap-4" onSubmit={save}>
            <Input id="businessName" label={t('storePage.storeName')} disabled={locked} error={form.formState.errors.businessName?.message} {...form.register('businessName')} />
            <Input id="representative" label={t('verify.representative')} disabled={locked} error={form.formState.errors.representative?.message} {...form.register('representative')} />
            <Input id="taxCode" label={t('verify.taxCode')} disabled={locked} {...form.register('taxCode')} />
            <Input id="address" label={t('verify.address')} disabled={locked} error={form.formState.errors.address?.message} {...form.register('address')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="city" label={t('verify.city')} disabled={locked} {...form.register('city')} />
              <Input id="phone" label={t('profile.phone')} disabled={locked} {...form.register('phone')} />
            </div>
            <Input id="deliveryArea" label={t('verify.deliveryArea')} disabled={locked} hint={t('verify.areasHint')} {...form.register('deliveryArea')} />
            {!locked ? <Button type="submit" loading={busy}>{t('forms.saveProfile')}</Button> : <p className="text-sm text-ink-400">{t('forms.lockedReview')}</p>}
          </form>
        </Card>
        </div>
        <div className="space-y-6">
          <div id="store-docs">
          <Card hover={false}>
            <h2 className="font-display text-xl text-navy-800">{t('nav.store.documents')}</h2>
            <p className="mt-1 text-sm text-ink-400">{t('verify.storeDocsHint')}</p>
            {!locked ? (
              <div className="mt-4 space-y-3">
                <Select value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)} label={t('verify.docType')}>
                  {DOC_TYPES.map((value) => (
                    <option key={value} value={value}>{t(`docType.${value}`)}</option>
                  ))}
                </Select>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-navy-800/20 bg-paper-50 px-4 py-8 text-center hover:border-copper-400">
                  <Upload className="h-5 w-5 text-navy-800" />
                  <span className="mt-2 text-sm font-semibold">{t('forms.dropScan')}</span>
                  <span className="text-xs text-ink-400">{t('verify.dropScanHint')}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onUpload(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            ) : null}
            <ul className="mt-4 space-y-2">
              {profile.documents.map((doc) => (
                <li key={doc._id} className="flex items-center gap-3 rounded-2xl bg-paper-100 p-2">
                  {doc.mimeType.startsWith('image/') ? (
                    <img src={mediaUrl(doc.url)} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-navy-800 text-paper-50">
                      <FileText className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-800">{t(`docType.${doc.type}`)}</p>
                    <p className="truncate text-xs text-ink-400">{doc.originalName}</p>
                  </div>
                  {!locked ? (
                    <button type="button" className="rounded-full p-1 hover:bg-white" onClick={() => void materialStoreApi.removeDocument(doc._id).then(refresh)} aria-label={t('common.remove')}>
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          </div>
          <div id="store-submit">
          <Card hover={false}>
            <h2 className="font-display text-xl text-navy-800">{t('verify.stepSubmit')}</h2>
            <p className="mt-2 text-sm text-ink-600">{t('verify.sendHint')}</p>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
            {profile.verificationStatus !== 'APPROVED' && profile.verificationStatus !== 'SUBMITTED' ? (
              <Button className="mt-4 w-full" variant="copper" loading={busy} onClick={() => void submit()}>
                {t('verify.submitApp')}
              </Button>
            ) : null}
          </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
