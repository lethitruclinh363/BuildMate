import { useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/locales';
import type { ApiResponse } from '@/types/user';

type PolicyDoc = {
  id: string;
  title: string;
  content: string;
  version: string;
  type: string;
};

type PolicyKind = 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY';

export function PolicyConsent({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState<PolicyKind | null>(null);
  const [doc, setDoc] = useState<PolicyDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openPolicy(type: PolicyKind) {
    setOpen(type);
    setDoc(null);
    setFailed(false);
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<PolicyDoc>>('/policies/active', {
        params: { type, language: locale },
        silent: true,
      });
      setDoc(data.data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <label className="flex items-start gap-3 text-sm text-navy-800">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-navy-800"
          checked={accepted}
          onChange={(event) => onAcceptedChange(event.target.checked)}
        />
        <span>
          {t('auth.agreeLead')}{' '}
          <button type="button" className="font-semibold text-copper-500 underline" onClick={() => void openPolicy('TERMS_OF_SERVICE')}>
            {t('auth.termsLink')}
          </button>{' '}
          {t('auth.agreeAnd')}{' '}
          <button type="button" className="font-semibold text-copper-500 underline" onClick={() => void openPolicy('PRIVACY_POLICY')}>
            {t('auth.privacyLink')}
          </button>
          {t('auth.agreeTail') ? ` ${t('auth.agreeTail')}` : null}
        </span>
      </label>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-card">
            <div className="flex items-start justify-between gap-4 border-b border-navy-800/8 px-5 py-4">
              <div>
                <h2 className="font-display text-xl text-navy-800">{doc?.title || (open === 'TERMS_OF_SERVICE' ? t('auth.termsLink') : t('auth.privacyLink'))}</h2>
                {doc?.version ? <p className="mt-1 text-xs text-ink-400">{t('auth.policyVersion', { version: doc.version })}</p> : null}
              </div>
              <button type="button" className="text-sm font-semibold text-navy-800" onClick={() => setOpen(null)}>
                {t('common.close')}
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-sm leading-relaxed text-navy-800 [&_p+p]:mt-3">
              {loading ? <p>{t('common.loading')}</p> : null}
              {failed ? <p className="text-red-700">{t('auth.policyLoadFail')}</p> : null}
              {!loading && !failed && !doc ? <p>{t('auth.policyEmpty')}</p> : null}
              {doc ? <div dangerouslySetInnerHTML={{ __html: doc.content }} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
