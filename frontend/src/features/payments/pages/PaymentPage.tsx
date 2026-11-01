import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { BackButton } from '@/components/navigation/BackButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import { paymentApi } from '../services/payment.api';
import { canCheckout } from '../types/paymentStatus';
import type { OrderPaymentsPayload } from '../types/payment.types';
import { PaymentSummaryCard } from '../components/PaymentSummaryCard';

function publicId(value: { id?: unknown; _id?: unknown } | string | null | undefined) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const raw = value.id ?? value._id;
  return raw == null ? '' : String(raw);
}

export function PaymentPage() {
  const { orderId } = useParams();
  const refId = orderId;
  const navigate = useNavigate();
  const { t, te } = useI18n();
  const push = useToastStore((s) => s.push);
  const [data, setData] = useState<OrderPaymentsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const payingRef = useRef(false);

  const load = () => {
    if (!refId) return;
    setLoading(true);
    setError('');
    paymentApi
      .byQuotation(refId)
      .catch((err: { response?: { status?: number } }) => {
        if (err?.response?.status === 404) return paymentApi.byOrder(refId);
        throw err;
      })
      .then((res) => setData(res.data.data))
      .catch((err) => setError(te(getApiErrorMessage(err)) || t('pay.empty')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [refId]);

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return <ErrorState body={error || t('pay.empty')} onRetry={load} />;
  }

  const payable = data.items.find((row) => canCheckout(row.status)) || data.items.find((row) => row.status === 'PENDING');
  const paid = data.summary.status === 'PAID';
  const failed = payable?.status === 'FAILED' || data.summary.status === 'FAILED';
  const quotationId = data.job?.quotationId || '';
  const linkedOrderId = publicId(data.job?.orderId);

  const pay = async () => {
    if (!payable || payingRef.current) return;
    payingRef.current = true;
    setBusy(true);
    try {
      let id = payable.id;
      if (canCheckout(payable.status)) {
        try {
          const res = await paymentApi.checkout(payable.id, 'MOCK', {
            termsAccepted: true,
            termsVersion: 'CONTRACTOR_DEPOSIT_TERMS_V2_DRAFT',
          });
          id = res.data.data.payment.id;
        } catch (err) {
          const msg = String(getApiErrorMessage(err));
          if (!/already in progress|already closed/i.test(msg)) throw err;
        }
      }
      let capturedOrderId = linkedOrderId;
      if (import.meta.env.DEV || import.meta.env.MODE !== 'production') {
        const captured = await paymentApi.mockSuccess(id);
        capturedOrderId = publicId(captured.data.data.order) || capturedOrderId;
      }
      const latest = quotationId
        ? await paymentApi.byQuotation(quotationId).catch(() => paymentApi.byOrder(refId || ''))
        : await paymentApi.byOrder(refId || '');
      const next = latest.data.data;
      setData(next);
      if (next.summary.status !== 'PAID') {
        push({ kind: 'error', title: t('pay.retryHint') });
        return;
      }
      const orderIdNext = publicId(next.job?.orderId) || capturedOrderId;
      push({ id: `pay.success:${id}`, kind: 'success', title: t('pay.success') });
      if (orderIdNext) navigate(`/customer/orders/${orderIdNext}`, { replace: true });
    } catch (err) {
      push({ kind: 'error', title: te(getApiErrorMessage(err)) });
      load();
    } finally {
      payingRef.current = false;
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <PageTransition>
      <BackButton fallback={linkedOrderId ? `/customer/orders/${linkedOrderId}` : quotationId ? `/customer/quotation/${quotationId}` : '/customer/orders'} />
      <PageHeader eyebrow={t('pay.eyebrow')} title={t('pay.title')} description={t('pay.desc')} />
      <div className="space-y-6">
        <PaymentSummaryCard
          summary={data.summary}
          orderCode={data.job?.referenceCode || quotationId || refId || ''}
          title={data.job?.title || t('pay.job')}
          contractor={data.job?.contractorName}
        />
        <Card hover={false}>
          {paid ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">{t('pay.paidHint')}</p>
              {linkedOrderId ? (
                <Button asChild variant="copper">
                  <Link to={`/customer/orders/${linkedOrderId}`}>{t('pay.viewOrder')}</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {failed ? <p className="mb-4 text-sm text-red-700">{t('pay.retryHint')}</p> : null}
              {busy ? <p className="mb-4 text-sm text-ink-500">{t('pay.processing')}</p> : null}
              <label className="mb-4 flex items-start gap-3 text-sm text-ink-600">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={termsOk}
                  onChange={(event) => setTermsOk(event.target.checked)}
                  disabled={busy}
                />
                <span>{t('pay.termsBox')}</span>
              </label>
              <Button
                variant="copper"
                loading={busy}
                onClick={() => setOpen(true)}
                disabled={!payable || !termsOk || busy}
              >
                {t('pay.cta')}
              </Button>
            </>
          )}
        </Card>
      </div>
      <ConfirmModal
        open={open}
        title={t('pay.confirmTitle')}
        description={t('pay.confirmBody')}
        busy={busy}
        onOpenChange={(v) => !v && !busy && setOpen(false)}
        onConfirm={() => void pay()}
        confirmLabel={t('pay.cta')}
      />
    </PageTransition>
  );
}
