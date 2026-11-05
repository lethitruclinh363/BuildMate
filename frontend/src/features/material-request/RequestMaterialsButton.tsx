import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/lib/api';
import { materialRequirementApi } from '@/lib/material-requirement-api';
import { saleLabelKey, saleState } from '@/lib/material-sale';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { CatalogMaterial } from '@/types/partner';

function defaultQty(material: CatalogMaterial) {
  const min = Number(material.minOrderQty);
  return Number.isFinite(min) && min > 0 ? min : 1;
}

export function RequestMaterialsButton({
  material,
  storeId,
  storeName,
}: {
  material: CatalogMaterial;
  storeId: string;
  storeName: string;
}) {
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, currentUser } = useAuth();
  const push = useToastStore((state) => state.push);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState(defaultQty(material));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const state = saleState(material);

  function openForm() {
    if (!token || !currentUser) {
      const next = `${location.pathname}${location.search}`;
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (currentUser.role !== 'CUSTOMER') {
      push({ kind: 'error', title: t('materialRequest.needCustomer') });
      return;
    }
    setQuantity(defaultQty(material));
    setNotes('');
    setError('');
    setOpen(true);
  }

  async function submit() {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t('validation.invalid'));
      return;
    }
    if (busy || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    try {
      const res = await materialRequirementApi.createDirect({
        storeId,
        title: material.name,
        note: notes.trim(),
        items: [
          {
            name: material.name,
            specification: material.sku || '',
            unit: material.unit || '',
            quantity: qty,
            notes: notes.trim(),
          },
        ],
      });
      setOpen(false);
      push({ kind: 'success', title: t('materialRequest.sent') });
      navigate(`/customer/material-lists/${res.data.data.id}`);
    } catch (err: unknown) {
      setError(te(getApiErrorMessage(err)));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-ink-500">{t(saleLabelKey(state))}</p>
      <Button type="button" className="w-full" onClick={openForm}>
        {t('materialRequest.cta')}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t('materialRequest.title')}
        description={t('materialRequest.body')}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-navy-800/10 bg-white p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-copper-600">{t('materialRequest.review')}</p>
            <p className="mt-1 font-display text-lg text-navy-800">{material.name}</p>
            <p className="mt-1 text-ink-500">{t('materialRequest.store')}: {storeName}</p>
            {material.unit ? <p className="mt-1 text-ink-500">{t('materialRequest.unit')}: {material.unit}</p> : null}
            {Number(material.price) > 0 ? (
              <p className="mt-1 text-ink-500">{t('public.referencePrice')}: {vnd(material.price)} / {material.unit}</p>
            ) : null}
          </div>
          <Input
            id="mrl-direct-qty"
            label={t('materialRequest.qty')}
            type="number"
            min={0.001}
            step="0.001"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
          <Input
            id="mrl-direct-notes"
            label={t('materialRequest.notes')}
            placeholder={t('materialRequest.notesPh')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" disabled={busy} onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" loading={busy} onClick={() => void submit()}>
              {t('materialRequest.send')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
