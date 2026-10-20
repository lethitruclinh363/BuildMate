import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { ErrorState } from '@/components/feedback/ErrorState';
import { SuccessState } from '@/components/feedback/SuccessState';
import { PageTransition } from '@/components/motion/PageTransition';
import { BackButton } from '@/components/navigation/BackButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { quotationApi } from '@/features/chat/services/sprint4.api';
import { QuotationCard } from '@/features/quotation/components/QuotationCard';
import { getApiErrorMessage } from '@/lib/api';
import { contractorQuoteSplit } from '@/lib/contractor-finance';
import { vnd } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { Quotation } from '@/types/sprint4';

export function CustomerQuotationPage() {
  const { t, te } = useI18n();
  const { id } = useParams();
  const toast = useToastStore((s) => s.push);
  const [quote, setQuote] = useState<Quotation | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'accept' | 'reject' | null>(null);
  const [termsOk, setTermsOk] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    quotationApi
      .get(id)
      .then((res) => setQuote(res.data.data))
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <DashboardSkeleton />;
  if (error || !quote) return <ErrorState body={error || undefined} onRetry={load} />;

  const awaiting = quote.status === 'SENT';
  const split = contractorQuoteSplit(quote.totalCost);

  const act = async (fn: () => Promise<unknown>, successTitle: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ kind: 'success', title: successTitle });
      load();
    } catch (err) {
      toast({ kind: 'error', title: te(getApiErrorMessage(err)) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <PageTransition>
      <BackButton fallback="/customer/request/history" />
      <PageHeader eyebrow={t('quote.pageEyebrow')} title={t('quote.title')} description={t('quote.pageDesc')} />
      <div className="mx-auto grid max-w-3xl gap-6">
        <QuotationCard quote={quote} />
        {awaiting ? (
          <dl className="space-y-2 rounded-[22px] border border-navy-800/8 bg-white p-5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('quote.deposit')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(split.depositAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('quote.remainingDirect')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(split.remainingAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('quote.platformFee')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(split.platformFee)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('quote.contractorHold')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(split.contractorHold)}</dd>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-ink-600">
              <input type="checkbox" className="mt-1" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} />
              <span>{t('quote.terms')}</span>
            </label>
          </dl>
        ) : null}
        {quote.modificationNote ? (
          <p className="text-sm text-ink-600">{t('quote.lastNote', { note: quote.modificationNote })}</p>
        ) : null}
        {quote.status === 'ACCEPTED' ? (
          <div className="space-y-3">
            <SuccessState title={t('feedback.quoteAccepted')} body={t('quote.acceptedHint')} />
            <Button asChild variant="copper">
              <Link to="/customer/orders">{t('orders.viewOrders')}</Link>
            </Button>
          </div>
        ) : awaiting ? (
          <div className="space-y-3 rounded-[22px] border border-navy-800/8 bg-white p-6">
            <div className="flex flex-wrap gap-2">
              <Button className="bg-emerald-700 hover:bg-emerald-600" disabled={busy || !termsOk} onClick={() => setConfirm('accept')}>
                {t('quote.accept')}
              </Button>
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                disabled={busy}
                onClick={() => setConfirm('reject')}
              >
                {t('quote.reject')}
              </Button>
            </div>
            <Input
              id="modify"
              label={t('quote.modifyLabel')}
              placeholder={t('quote.modifyPh')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              variant="outline"
              className="border-amber-300 text-amber-800"
              disabled={busy || note.trim().length < 4}
              onClick={() => void act(() => quotationApi.requestModify(quote.id, note), t('quote.sendModify'))}
            >
              {t('quote.sendModify')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-400">{t('quote.statusLine', { status: labeled(t, 'status', quote.status) })}</p>
        )}
        {quote.roomId ? (
          <Button asChild variant="outline">
            <Link to={`/customer/chat/${quote.roomId}`}>{t('quote.backChat')}</Link>
          </Button>
        ) : null}
      </div>
      <ConfirmModal
        open={confirm === 'accept'}
        title={t('quote.accept')}
        description={t('quote.acceptBody')}
        busy={busy}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={() => void act(() => quotationApi.accept(quote.id), t('feedback.quoteAccepted'))}
      />
      <ConfirmModal
        open={confirm === 'reject'}
        title={t('quote.reject')}
        tone="danger"
        busy={busy}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={() => void act(() => quotationApi.reject(quote.id), t('feedback.quoteRejected'))}
      />
    </PageTransition>
  );
}
