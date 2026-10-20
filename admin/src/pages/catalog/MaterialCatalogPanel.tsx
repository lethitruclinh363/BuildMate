import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { GlassCard } from '@/components/GlassCard';
import { getApiErrorMessage } from '@/services/api';
import { adminApi, type AdminMaterialCategory } from '@/services/admin.api';
import type { ApiResponse } from '@/types/api';
import { useToastStore } from '@/stores/toast.store';

function categoryLabel(item: AdminMaterialCategory, language: string) {
  if (item.type === 'CUSTOM') return item.name;
  const label = language === 'en' ? item.labels?.en : item.labels?.vi;
  return label || item.name;
}

function categoryError(error: unknown, translate: (key: string) => string) {
  const code = (error as AxiosError<ApiResponse<null> & { details?: { code?: string } }>).response?.data?.details?.code;
  if (code === 'DUPLICATE_SYSTEM_CATEGORY' || code === 'DUPLICATE_CUSTOM_CATEGORY') return translate('catalog.materials.duplicate');
  if (code === 'INVALID') return translate('catalog.materials.emptyName');
  return getApiErrorMessage(error);
}

export function MaterialCatalogPanel() {
  const { t, i18n } = useTranslation();
  const push = useToastStore((s) => s.push);
  const [system, setSystem] = useState<AdminMaterialCategory[]>([]);
  const [custom, setCustom] = useState<AdminMaterialCategory[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<AdminMaterialCategory | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const payload = await adminApi.listMaterialCategories();
    setSystem(payload.system || []);
    setCustom(payload.custom || []);
  };

  useEffect(() => {
    void load().catch((error) => push('error', getApiErrorMessage(error)));
  }, [push]);

  async function save() {
    const next = name.trim();
    if (!next) {
      push('error', t('catalog.materials.emptyName'));
      return;
    }
    setBusy(true);
    try {
      if (editing?.id) await adminApi.updateMaterialCategory(editing.id, next);
      else await adminApi.createMaterialCategory(next);
      setName('');
      setEditing(null);
      push('success', t('catalog.materials.saved'));
      await load();
    } catch (error) {
      push('error', categoryError(error, t));
    } finally {
      setBusy(false);
    }
  }

  function statusLabel(item: AdminMaterialCategory) {
    if (item.type === 'SYSTEM' && (item.status === 'ACTIVE' || item.status === 'APPROVED')) return t('catalog.materials.active');
    if (item.status === 'REJECTED') return t('verify.customStatusRejected');
    if (item.status === 'PENDING_APPROVAL') return t('verify.customStatusPending');
    if (item.status === 'APPROVED') return t('verify.customStatusApproved');
    return item.status;
  }

  function createdLabel(value?: string | null) {
    if (!value) return '';
    return new Date(value).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'vi-VN');
  }

  async function review(item: AdminMaterialCategory, decision: 'approve' | 'reject') {
    if (!item.id) return;
    let reason: string | undefined;
    if (decision === 'reject') {
      const promptRes = window.prompt(t('catalog.materials.rejectReasonPrompt'));
      if (promptRes === null) return;
      reason = promptRes.trim();
    }
    setBusy(true);
    try {
      await adminApi.reviewMaterialCategory(item.id, decision, reason);
      push('success', decision === 'approve' ? t('catalog.materials.approvedToast') : t('catalog.materials.rejectedToast'));
      await load();
    } catch (error) {
      push('error', categoryError(error, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <GlassCard>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">{editing ? t('catalog.materials.edit') : t('catalog.materials.add')}</h2>
            <p className="mt-1 text-sm text-white/50">{t('catalog.materials.description')}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={name}
            placeholder={t('catalog.materials.placeholder')}
            onChange={(event) => setName(event.target.value)}
            className="w-full max-w-sm rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-copper-500/60"
          />
          <Button disabled={busy} onClick={() => void save()}>
            {t('catalog.materials.save')}
          </Button>
          {editing ? (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setName('');
              }}
            >
              {t('catalog.materials.cancel')}
            </Button>
          ) : null}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-lg">{t('catalog.materials.systemTitle')}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-white/40">
              <tr>
                <th className="py-2">{t('catalog.materials.name')}</th>
                <th>{t('catalog.materials.group')}</th>
                <th>{t('catalog.materials.type')}</th>
                <th>{t('catalog.materials.status')}</th>
                <th>{t('catalog.materials.created')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {system.map((item) => (
                <tr key={item.id || item.name} className="border-t border-white/8 text-white">
                  <td className="py-3 pr-3 font-semibold">{categoryLabel(item, i18n.language)}</td>
                  <td>{t('catalog.materials.materialsGroup')}</td>
                  <td>{t('verify.systemBadge')}</td>
                  <td>{statusLabel(item)}</td>
                  <td>{createdLabel(item.createdAt)}</td>
                  <td>
                    {item.locked || !item.id ? (
                      <span className="text-xs text-white/40">{t('catalog.materials.locked')}</span>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditing(item);
                          setName(item.name);
                        }}
                      >
                        {t('catalog.materials.edit')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-lg">{t('catalog.materials.customTitle')}</h2>
        {custom.length === 0 ? (
          <p className="mt-3 text-sm text-white/45">{t('catalog.materials.emptyCustom')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-white/40">
                <tr>
                  <th className="py-2">{t('catalog.materials.name')}</th>
                  <th>{t('catalog.materials.store')}</th>
                  <th>{t('catalog.materials.type')}</th>
                  <th>{t('catalog.materials.status')}</th>
                  <th>{t('catalog.materials.created')}</th>
                  <th>{t('catalog.materials.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {custom.map((item) => (
                  <tr key={item.id || item.name} className="border-t border-white/8 text-white">
                    <td className="py-3 pr-3 font-semibold">{item.name}</td>
                    <td>{item.storeName || ''}</td>
                    <td>{t('verify.customBadge')}</td>
                    <td>{statusLabel(item)}</td>
                    <td>{createdLabel(item.createdAt)}</td>
                    <td>
                      {item.status === 'PENDING_APPROVAL' && item.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            className="px-3 py-1.5 text-xs text-emerald-400 hover:text-emerald-300"
                            disabled={busy}
                            onClick={() => void review(item, 'approve')}
                          >
                            {t('catalog.materials.approve')}
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                            disabled={busy}
                            onClick={() => void review(item, 'reject')}
                          >
                            {t('catalog.materials.reject')}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
