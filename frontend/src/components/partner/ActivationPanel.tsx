import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { checklistDestination, CONTRACTOR_CHECKLIST, STORE_CHECKLIST } from '@/components/partner/checklist-nav';
import { contractorApi, materialStoreApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { ActivationReadiness } from '@/types/partner';

export function ActivationPanel({
  activation,
  onChanged,
}: {
  activation?: ActivationReadiness | null;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [modal, setModal] = useState<'activate' | 'pause' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!activation || activation.verificationStatus !== 'APPROVED') return null;

  const store = activation.kind === 'STORE';
  const links = store ? STORE_CHECKLIST : CONTRACTOR_CHECKLIST;
  const paused = activation.activationStatus === 'PAUSED';
  const live = activation.activationStatus === 'LIVE' && activation.visible;
  const ready = activation.ready && activation.activationStatus !== 'LIVE';
  const api = store ? materialStoreApi : contractorApi;
  const done = activation.checks.filter((item) => item.ok).length;
  const total = activation.checks.length;
  const firstGap = activation.checks.find((item) => !item.ok);
  const gapHref = firstGap && links[firstGap.key] ? checklistDestination(links[firstGap.key]) : store ? '/store/profile/edit' : '/contractor/profile/edit';

  const title = paused
    ? t('activation.pausedTitle')
    : live
      ? store
        ? t('activation.storeLiveTitle')
        : t('activation.liveTitle')
      : ready
        ? t('activation.readyTitle')
        : t('activation.notReadyTitle');
  const body = paused
    ? t('activation.pausedBody')
    : live
      ? store
        ? t('activation.storeLiveBody')
        : t('activation.liveBody')
      : ready
        ? store
          ? t('activation.storeReadyBody')
          : t('activation.readyBody')
        : t('activation.notReadyBody');

  async function run(action: 'activate' | 'pause') {
    setBusy(true);
    setError('');
    try {
      if (action === 'activate') await api.activate();
      else await api.pauseListing();
      setModal(null);
      onChanged?.();
    } catch {
      setError(t('activation.notReadyBody'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card hover={false} className="mb-6 border-navy-800/10">
      <p className="text-sm font-semibold text-navy-800">
        {t('activation.progress', { n: activation.percent })}
        <span className="ml-2 font-normal text-ink-400">{t('activation.progressCount', { done, total })}</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-800/10">
        <div className="h-full rounded-full bg-copper-400" style={{ width: `${Math.max(0, Math.min(100, activation.percent))}%` }} />
      </div>
      <h2 className="mt-5 font-display text-2xl text-navy-800">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">{body}</p>
      <ul className="mt-4 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {activation.checks.map((item) => (
          <li key={item.key}>
            <Link
              to={links[item.key] ? checklistDestination(links[item.key]) : gapHref}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-mist-100"
            >
              {item.ok ? <Check className="h-4 w-4 shrink-0 text-copper-500" /> : <Circle className="h-4 w-4 shrink-0 text-ink-300" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-navy-800">{t(`activation.check.${item.key}`)}</span>
                {item.key === 'verification' && item.ok ? (
                  <span className="block text-xs text-ink-400">{t('activation.approvedNote')}</span>
                ) : null}
                {!item.ok ? <span className="block text-xs text-ink-400">{t('activation.incomplete')}</span> : null}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-300" />
            </Link>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-copper-600">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        {!ready && !live ? (
          <Button asChild variant="copper" size="sm">
            <Link to={gapHref}>{store ? t('activation.continueStore') : t('activation.continue')}</Link>
          </Button>
        ) : null}
        {ready && !paused ? (
          <Button variant="copper" size="sm" onClick={() => setModal('activate')}>
            {store ? t('activation.activateStore') : t('activation.activateCrew')}
          </Button>
        ) : null}
        {paused && activation.ready ? (
          <Button variant="copper" size="sm" onClick={() => setModal('activate')}>
            {t('activation.resume')}
          </Button>
        ) : null}
        {live ? (
          <Button variant="outline" size="sm" onClick={() => setModal('pause')}>
            {t('activation.pause')}
          </Button>
        ) : null}
      </div>
      <Modal
        open={modal === 'activate'}
        onOpenChange={(open) => setModal(open ? 'activate' : null)}
        title={store ? t('activation.confirmStoreTitle') : t('activation.confirmCrewTitle')}
        description={store ? t('activation.confirmStoreBody') : t('activation.confirmCrewBody')}
      >
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setModal(null)}>{t('activation.cancel')}</Button>
          <Button variant="copper" loading={busy} onClick={() => void run('activate')}>{t('activation.confirm')}</Button>
        </div>
      </Modal>
      <Modal
        open={modal === 'pause'}
        onOpenChange={(open) => setModal(open ? 'pause' : null)}
        title={t('activation.pauseTitle')}
        description={t('activation.pauseBody')}
      >
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setModal(null)}>{t('activation.cancel')}</Button>
          <Button variant="copper" loading={busy} onClick={() => void run('pause')}>{t('activation.confirmPause')}</Button>
        </div>
      </Modal>
    </Card>
  );
}
