import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { MaterialItemLines } from '@/components/mrl/MaterialItemLines';
import { contractorQuoteSplit } from '@/lib/contractor-finance';
import { materialRequirementApi, type MaterialRequirementList } from '@/lib/material-requirement-api';
import { vnd } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import { useSocket } from '@/providers/SocketProvider';
import { useToastStore } from '@/store/toast.store';
import type { Quotation } from '@/types/sprint4';

function publicId(value: { id?: unknown; _id?: unknown } | null | undefined) {
  if (!value) return '';
  const raw = value.id ?? value._id;
  return raw == null ? '' : String(raw);
}

export function CustomerQuotationPage() {
  const { t, te } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.push);
  const { socket } = useSocket();
  const [quote, setQuote] = useState<Quotation | null>(null);
  const [mrl, setMrl] = useState<MaterialRequirementList | null>(null);
  const [savedMrl, setSavedMrl] = useState<MaterialRequirementList | null>(null);
  const [savingList, setSavingList] = useState(false);
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
      .then(async (res) => {
        const next = res.data.data;
        setQuote(next);
        if (next.requestId) {
          const lists = await materialRequirementApi.mine({ repairRequestId: next.requestId }).catch(() => ({ data: { data: [] as MaterialRequirementList[] } }));
          const rows = lists.data.data || [];
          const saved = rows.find((row) => row.kind === 'SAVED' && row.status === 'DRAFT') || null;
          const source = rows.find((row) => row.kind === 'SOURCE' || (!row.parentListId && !row.storeId)) || null;
          setSavedMrl(saved);
          setMrl(saved || source || rows.find((row) => row.status !== 'CANCELLED') || null);
        } else {
          setMrl(null);
          setSavedMrl(null);
        }
      })
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!socket || !id) return;
    const onQuote = (next: Quotation) => {
      if (String(next?.id) === String(id)) setQuote(next);
    };
    socket.on('quotation:new', onQuote);
    return () => {
      socket.off('quotation:new', onQuote);
    };
  }, [socket, id]);

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

  const goToDeposit = async () => {
    if (quote.status !== 'SENT' && quote.status !== 'ACCEPTED') {
      toast({ kind: 'error', title: t('quote.statusLine', { status: labeled(t, 'status', quote.status) }) });
      return;
    }
    if (quote.status === 'SENT' && !termsOk) return;
    setBusy(true);
    try {
      const res = await quotationApi.accept(quote.id);
      const bundle = res.data.data;
      const orderId = publicId(bundle.order);
      toast({ kind: 'success', title: t('feedback.quoteAccepted') });
      if (bundle.payment?.status === 'PAID' && orderId) {
        navigate(`/customer/orders/${orderId}`, { replace: true });
      } else {
        navigate(`/customer/payment/${quote.id}`, { replace: true });
      }
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
        {mrl ? (
          <div className="rounded-[22px] border border-navy-800/8 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-600">{t('mrl.title')}</p>
                <p className="mt-1 text-sm text-ink-500">{t('mrl.customerViewHint')}</p>
              </div>
              <span className="rounded-full bg-paper-100 px-3 py-1 text-xs font-semibold text-navy-800">
                {t('mrl.kindCount', { n: (mrl.items || []).length })}
              </span>
            </div>
            <div className="mt-4">
              <MaterialItemLines items={mrl.items || []} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="copper"
                disabled={savingList || busy}
                onClick={() => {
                  setSavingList(true);
                  materialRequirementApi
                    .save(mrl.id)
                    .then((res) => {
                      setSavedMrl(res.data.data);
                      setMrl(res.data.data);
                      toast({ kind: 'success', title: t('mrl.savedToast') });
                    })
                    .catch((err) => toast({ kind: 'error', title: te(getApiErrorMessage(err)) }))
                    .finally(() => setSavingList(false));
                }}
              >
                {t('mrl.saveList')}
              </Button>
              <Button
                variant="outline"
                disabled={savingList || busy}
                onClick={() => {
                  const go = (id: string) => navigate(`/customer/explore?mrl=${encodeURIComponent(id)}`);
                  if (savedMrl?.id) {
                    go(savedMrl.id);
                    return;
                  }
                  setSavingList(true);
                  materialRequirementApi
                    .save(mrl.id)
                    .then((res) => {
                      setSavedMrl(res.data.data);
                      go(res.data.data.id);
                    })
                    .catch((err) => toast({ kind: 'error', title: te(getApiErrorMessage(err)) }))
                    .finally(() => setSavingList(false));
                }}
              >
                {t('mrl.findNearby')}
              </Button>
              {savedMrl ? (
                <Button asChild variant="outline">
                  <Link to={`/customer/material-lists/${savedMrl.id}`}>{t('mrl.openSaved')}</Link>
                </Button>
              ) : null}
            </div>
            {quote.status !== 'ACCEPTED' ? (
              <p className="mt-3 text-sm text-ink-500">{t('mrl.acceptLaborFirst')}</p>
            ) : null}
          </div>
        ) : null}
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
            <p className="pt-2 font-semibold text-ink-800">{t('quote.cancelDepositWarning')}</p>
            <label className="flex items-start gap-2 text-sm text-ink-600">
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
            <Button loading={busy} disabled={busy} onClick={() => void goToDeposit()}>
              {t('quote.continueDeposit')}
            </Button>
          </div>
        ) : awaiting ? (
          <div className="space-y-3 rounded-[22px] border border-navy-800/8 bg-white p-6">
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !termsOk} onClick={() => setConfirm('accept')}>
                {t('quote.accept')}
              </Button>
              <Button
                variant="outline"
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
        onConfirm={() => void goToDeposit()}
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
