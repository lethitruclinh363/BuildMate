import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { X, Send, Plus, CheckCircle2 } from 'lucide-react';
import {
  categoryDisplayLabel,
  collapseCategoryName,
  findOwnedCategoryMatch,
  findSystemCategoryMatch,
  isCategorySelected,
  type MaterialCategoryPick,
} from '@/data/material-categories';
import { getApiErrorMessage } from '@/lib/api';
import { FormLabel } from '@/components/ui/FormLabel';
import { cn } from '@/lib/cn';
import { materialStoreApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';

const MAX_CATEGORIES = 12;

function categoryError(code: string | undefined, t: (key: string) => string) {
  if (code === 'DUPLICATE_SYSTEM_CATEGORY') return t('auth.onboardCategorySystemDuplicate');
  if (code === 'DUPLICATE_CUSTOM_CATEGORY') return t('auth.onboardCategoryCustomDuplicate');
  if (code === 'INVALID') return t('auth.onboardCategoryRequired');
  return '';
}

export function StoreCategorySelector({
  selected,
  onChange,
}: {
  selected: MaterialCategoryPick[];
  onChange: (next: MaterialCategoryPick[]) => void;
}) {
  const { t } = useI18n();
  const [system, setSystem] = useState<MaterialCategoryPick[]>([]);
  const [owned, setOwned] = useState<MaterialCategoryPick[]>([]);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalName, setProposalName] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [proposalSuccess, setProposalSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let ignore = false;
    materialStoreApi
      .listMaterialCategories()
      .then((res) => {
        if (ignore) return;
        const rawSystem: MaterialCategoryPick[] = res.data.data?.system || [];
        const seen = new Set<string>();
        const uniqueSystem: MaterialCategoryPick[] = [];
        for (const item of rawSystem) {
          const key = item.categoryId ? `id:${item.categoryId}` : `name:${item.name}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueSystem.push(item);
          }
        }
        setSystem(uniqueSystem);
        setOwned(res.data.data?.custom || []);
        setLoadError(false);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  function toggleSystem(item: MaterialCategoryPick) {
    if (isCategorySelected(item, selected)) {
      onChange(selected.filter((entry) => !isCategorySelected(item, [entry])));
    } else {
      if (selected.length >= MAX_CATEGORIES) return;
      onChange([
        ...selected,
        {
          name: item.name,
          type: 'SYSTEM',
          categoryId: item.categoryId || null,
          status: 'APPROVED',
          aliases: item.aliases,
        },
      ]);
    }
  }

  function toggleApprovedCustom(item: MaterialCategoryPick) {
    if (item.status !== 'APPROVED') return;
    if (isCategorySelected(item, selected)) {
      onChange(selected.filter((entry) => !isCategorySelected(item, [entry])));
    } else {
      if (selected.length >= MAX_CATEGORIES) return;
      onChange([
        ...selected,
        {
          name: item.name,
          type: 'CUSTOM',
          categoryId: item.categoryId || null,
          status: 'APPROVED',
        },
      ]);
    }
  }

  function remove(item: MaterialCategoryPick) {
    onChange(selected.filter((entry) => !isCategorySelected(item, [entry])));
  }

  async function handleSendProposal() {
    const display = collapseCategoryName(proposalName);
    if (!display) {
      setProposalError(t('auth.onboardCategoryRequired'));
      setProposalSuccess('');
      return;
    }
    const systemHit = findSystemCategoryMatch(display, system);
    if (systemHit) {
      const matchLabel = categoryDisplayLabel(systemHit, t);
      setProposalError(
        t('auth.onboardCategorySystemGuide', { name: matchLabel }) ||
          `Danh mục này đã có trong hệ thống (${matchLabel}). Vui lòng chọn trực tiếp từ danh mục hệ thống ở trên.`
      );
      setProposalSuccess('');
      return;
    }
    const ownedHit = findOwnedCategoryMatch(display, owned);
    if (ownedHit) {
      setProposalError(t('auth.onboardCategoryCustomDuplicate'));
      setProposalSuccess('');
      return;
    }

    setSaving(true);
    setProposalError('');
    setProposalSuccess('');
    try {
      const { data } = await materialStoreApi.createMaterialCategory(display);
      const created = data.data;
      setOwned((current) => [...current, created]);
      setProposalName('');
      setProposalSuccess(t('auth.onboardCategoryProposalSubmitted'));
      setShowProposalForm(false);
    } catch (err) {
      const details = (err as AxiosError<{ details?: { code?: string } }>).response?.data?.details;
      setProposalError(categoryError(details?.code, t) || getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="onboard-services" className="space-y-6">
      {loadError ? <p className="text-sm text-red-600">{t('auth.onboardCategoryLoadFailed')}</p> : null}

      {/* SECTION A: DANH MỤC HỆ THỐNG */}
      <div>
        <p className="text-sm font-semibold text-navy-900">{t('auth.onboardStepCategory')}</p>
        <p className="mt-1 text-xs text-navy-600">{t('auth.onboardStoreCategoryLead')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {system.map((item) => {
            const active = isCategorySelected(item, selected);
            return (
              <button
                key={item.categoryId || item.name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSystem(item)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-semibold transition shadow-sm',
                  active
                    ? 'border-navy-900 bg-navy-900 text-white'
                    : 'border-navy-800/20 bg-white text-navy-800 hover:border-navy-800/40 hover:bg-navy-50'
                )}
              >
                {categoryDisplayLabel(item, t)}
              </button>
            );
          })}
          {!showProposalForm ? (
            <button
              type="button"
              onClick={() => {
                setShowProposalForm(true);
                setProposalError('');
                setProposalSuccess('');
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-navy-800/30 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:border-navy-800/60 hover:bg-navy-50 transition"
            >
              <Plus className="h-4 w-4" />
              {t('auth.onboardOtherService') || '+ Khác'}
            </button>
          ) : null}
        </div>
      </div>

      {/* SECTION B: ĐỀ XUẤT DANH MỤC KHÁC */}
      {showProposalForm ? (
        <div className="rounded-2xl border border-navy-800/12 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-navy-900">{t('auth.onboardCategoryOtherTitle')}</h4>
            <button
              type="button"
              onClick={() => {
                setShowProposalForm(false);
                setProposalError('');
              }}
              className="text-xs text-navy-500 hover:text-navy-800"
            >
              {t('common.cancel')}
            </button>
          </div>
          <p className="mt-1 text-xs text-navy-600">
            {t('auth.onboardCategoryOtherLead') ||
              'Nếu mặt hàng kinh doanh chưa có trong danh mục hệ thống, bạn có thể gửi đề xuất để Admin xét duyệt.'}
          </p>

          <div className="mt-3">
            <FormLabel required>{t('auth.onboardCategoryNewName')}</FormLabel>
            <input
              value={proposalName}
              maxLength={80}
              placeholder={t('auth.onboardCategoryPlaceholder')}
              onChange={(e) => {
                setProposalName(e.target.value);
                if (proposalError) setProposalError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSendProposal();
                }
              }}
              className={cn(
                'mt-1.5 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-navy-900 outline-none transition focus:border-navy-800 focus:ring-2 focus:ring-navy-800/10',
                proposalError ? 'border-red-500' : 'border-navy-800/20'
              )}
            />
          </div>

          {proposalError ? <p className="mt-2 text-xs font-medium text-red-600">{proposalError}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSendProposal()}
              className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-navy-800 disabled:opacity-60 transition"
            >
              <Send className="h-4 w-4" />
              {t('auth.onboardCategorySubmitProposal')}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowProposalForm(false);
                setProposalError('');
              }}
              className="rounded-xl border border-navy-800/20 bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50 transition"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {proposalSuccess ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-50/60 p-3 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{proposalSuccess}</span>
        </div>
      ) : null}

      {/* SECTION C: DANH MỤC TÙY CHỈNH ĐÃ ĐỀ XUẤT */}
      {owned.length > 0 ? (
        <div className="rounded-2xl border border-navy-800/10 bg-navy-50/40 p-4">
          <h4 className="text-sm font-semibold text-navy-900">{t('auth.onboardCategoryProposedTitle')}</h4>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {owned.map((item) => {
              const isApproved = item.status === 'APPROVED';
              const isPending = item.status === 'PENDING_APPROVAL';
              const isRejected = item.status === 'REJECTED';
              const isPicked = isApproved && isCategorySelected(item, selected);

              return (
                <div
                  key={item.categoryId || item.name}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
                    isApproved
                      ? isPicked
                        ? 'border-navy-900 bg-navy-900 text-white cursor-pointer'
                        : 'border-emerald-500/30 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 cursor-pointer'
                      : isPending
                      ? 'border-amber-400/40 bg-amber-50 text-amber-900 cursor-default'
                      : 'border-rose-400/30 bg-rose-50 text-rose-800 cursor-default line-through opacity-80'
                  )}
                  onClick={() => {
                    if (isApproved) toggleApprovedCustom(item);
                  }}
                  title={isApproved ? (isPicked ? 'Bỏ chọn' : 'Chọn danh mục này') : undefined}
                >
                  <span className="font-semibold">{item.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      isApproved
                        ? isPicked
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-200 text-emerald-800'
                        : isPending
                        ? 'bg-amber-200 text-amber-800'
                        : 'bg-rose-200 text-rose-800 no-underline'
                    )}
                  >
                    {isApproved
                      ? t('auth.onboardCategoryStatusApproved')
                      : isPending
                      ? t('auth.onboardCategoryStatusPending')
                      : t('auth.onboardCategoryStatusRejected')}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-navy-500 italic">
            * {t('auth.onboardCategoryUnapprovedNote')}
          </p>
        </div>
      ) : null}

      {/* DANH MỤC ĐÃ CHỌN */}
      {selected.length > 0 ? (
        <div className="pt-2">
          <p className="text-sm font-semibold text-navy-900">{t('auth.onboardSelectedCategories')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {selected.map((item) => (
              <li
                key={`${item.type}:${item.categoryId || item.name}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 py-1.5 pl-3.5 pr-2 text-xs font-semibold text-white shadow-sm"
              >
                <span>{categoryDisplayLabel(item, t)}</span>
                {item.type === 'CUSTOM' && item.status !== 'APPROVED' ? (
                  <span className="text-[10px] text-amber-300">({t('auth.onboardCategoryStatusPending')})</span>
                ) : null}
                <button
                  type="button"
                  aria-label={t('common.remove')}
                  onClick={() => remove(item)}
                  className="grid h-5 w-5 place-items-center rounded-full text-white/80 hover:bg-white/20 hover:text-white transition"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
