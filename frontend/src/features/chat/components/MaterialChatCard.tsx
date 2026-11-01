import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { vnd } from '@/lib/partner-api';
import type { MrlChatPayload } from '@/lib/mrl-chat';
import { MaterialItemLines } from '@/components/mrl/MaterialItemLines';
import { useI18n } from '@/locales';

export function MaterialChatCard({
  payload,
  role,
  listStatus,
  busy,
  onSendRequest,
  onConfirm,
  onReject,
}: {
  payload: MrlChatPayload;
  role?: string;
  listStatus?: string;
  busy?: boolean;
  onSendRequest?: () => void;
  onConfirm?: () => void;
  onReject?: () => void;
}) {
  const { t } = useI18n();
  const customer = role === 'CUSTOMER';
  const store = role === 'MATERIAL_STORE_OWNER';
  const status = payload.status || listStatus || '';
  const quoted = status === 'QUOTED';
  const confirmed = Boolean(status && ['CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED'].includes(status));
  const detailHref = customer
    ? `/customer/material-lists/${payload.listId}`
    : `/store/material-requests/${payload.listId}`;
  const title =
    payload.kind === 'MRL_QUOTE'
      ? t('mrl.quoteTitle')
      : payload.kind === 'MRL_CONFIRMED'
        ? t('mrl.confirm')
        : payload.kind === 'MRL_REJECTED'
          ? t('mrl.rejectedTitle')
          : payload.kind === 'MRL_PROGRESS'
            ? t('mrl.orderTitle')
            : t('mrl.chatRequestTitle');

  return (
    <div className="w-full max-w-sm rounded-[22px] border border-copper-300/70 bg-white p-4 shadow-lift">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-600">{title}</p>
      <p className="mt-1 text-xs text-ink-400">{payload.requestCode || `${t('mrl.listLabel')} ${payload.listId.slice(-6)}`}</p>
      {payload.title ? <p className="mt-1 font-display text-lg text-navy-800">{payload.title}</p> : null}
      {payload.customerName ? <p className="text-sm text-ink-500">{payload.customerName}</p> : null}
      {payload.address ? <p className="mt-1 text-sm text-ink-500">{payload.address}</p> : null}
      {payload.storeName ? <p className="text-sm text-ink-500">{payload.storeName}</p> : null}

      {(payload.items || []).length ? (
        <div className="mt-3 rounded-xl border border-navy-800/10 px-3 py-2">
          <MaterialItemLines
            items={(payload.items || []).map((item) => ({
              ...item,
              amountLabel: payload.kind === 'MRL_QUOTE' ? vnd((item.quantity || 0) * (item.unitPrice || 0)) : '',
            }))}
            compact
          />
        </div>
      ) : null}

      {payload.kind === 'MRL_QUOTE' ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-ink-500">{t('mrl.deliveryFee')}: {vnd(payload.deliveryFee || 0)}</p>
          {payload.note ? <p className="text-ink-500">{payload.note}</p> : null}
          <p className="font-semibold text-navy-800">{t('mrl.total')}: {vnd(payload.total || 0)}</p>
        </div>
      ) : null}

      {status ? (
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-copper-600">
          {t(`mrl.status.${status}`)}
        </p>
      ) : null}

      {payload.kind === 'MRL_REQUEST' && onSendRequest ? (
        <Button className="mt-4 w-full" disabled={busy} onClick={onSendRequest}>
          {t('mrl.send')}
        </Button>
      ) : null}

      {payload.kind === 'MRL_REQUEST' && store && status === 'SENT' ? (
        <Button asChild className="mt-4 w-full" variant="copper">
          <Link to={`/store/material-requests/${payload.listId}`}>{t('mrl.createQuote')}</Link>
        </Button>
      ) : null}

      {payload.kind === 'MRL_QUOTE' && customer && quoted ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {onConfirm ? (
            <Button disabled={busy} onClick={onConfirm}>{t('mrl.confirm')}</Button>
          ) : null}
          {onReject ? (
            <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={onReject}>
              {t('mrl.rejectQuote')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {payload.kind === 'MRL_QUOTE' && confirmed ? (
        <p className="mt-3 text-sm text-ink-500">{t('mrl.customerConfirmedHint')}</p>
      ) : null}

      <Button asChild className="mt-4 w-full" variant="outline">
        <Link to={detailHref}>{payload.kind === 'MRL_CONFIRMED' || payload.kind === 'MRL_PROGRESS' ? t('mrl.orderTitle') : t('mrl.viewRequest')}</Link>
      </Button>
    </div>
  );
}
