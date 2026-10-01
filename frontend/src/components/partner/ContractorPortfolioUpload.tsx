import { useState, type ReactNode } from 'react';
import { contractorApi, mediaUrl } from '@/lib/partner-api';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import type { ContractorProfile } from '@/types/partner';

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CERT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

type Slot = 'avatar' | 'teamLogo' | 'workshop' | 'construction' | 'certificate';

const empty = {
  avatar: '',
  teamLogo: '',
  workshop: '',
  construction: [] as string[],
  certificates: [] as string[],
};

function isPdf(url: string) {
  return url.toLowerCase().split('?')[0].endsWith('.pdf');
}

export function ContractorPortfolioUpload({
  portfolio,
  disabled,
  onProfile,
  onError,
}: {
  portfolio?: ContractorProfile['portfolio'];
  disabled: boolean;
  onProfile: (profile: ContractorProfile) => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<{ slot: Slot; value: number } | null>(null);
  const shots = portfolio || empty;

  function fileError(file: File, slot: Slot) {
    const requiredImage = slot === 'avatar' || slot === 'teamLogo' || slot === 'workshop';
    const name = file.name.toLowerCase();
    const type = file.type
      || (name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg' : '')
      || (name.endsWith('.png') ? 'image/png' : '')
      || (name.endsWith('.webp') ? 'image/webp' : '')
      || (name.endsWith('.pdf') ? 'application/pdf' : '');
    const allowed = slot === 'certificate' ? CERT_TYPES : IMAGE_TYPES;
    const invalid = file.size > MAX_BYTES || !allowed.has(type);
    if (!invalid) return '';
    if (requiredImage) return t('auth.onboardFileInvalid');
    if (file.size > MAX_BYTES) return t('auth.onboardFileLimit');
    return slot === 'certificate' ? t('auth.onboardCertType') : t('auth.onboardImageType');
  }

  async function upload(list: FileList | null, slot: Slot) {
    const files = Array.from(list || []);
    if (!files.length) return;
    const invalid = files.map((file) => fileError(file, slot)).find(Boolean);
    if (invalid) {
      onError(invalid);
      return;
    }
    onError('');
    try {
      let latest: ContractorProfile | null = null;
      for (const file of files) {
        setProgress({ slot, value: 0 });
        const { data } = await contractorApi.uploadPortfolio(file, slot, (value) => setProgress({ slot, value }));
        latest = data.data;
      }
      if (latest) onProfile(latest);
    } catch (err) {
      onError(getApiErrorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  async function remove(slot: Slot, url: string) {
    onError('');
    try {
      const { data } = await contractorApi.removePortfolio(slot, url);
      onProfile(data.data);
    } catch (err) {
      onError(getApiErrorMessage(err));
    }
  }

  return (
    <div className="mt-5 space-y-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-500">{t('auth.onboardImagesRequired')}</p>
      <SlotBlock
        id="onboard-avatar"
        label={`${t('auth.onboardAvatar')} *`}
        hint={t('auth.onboardImageHint')}
        progress={progress?.slot === 'avatar' ? progress.value : null}
        disabled={disabled || progress !== null}
        multiple={false}
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onPick={(list) => void upload(list, 'avatar')}
      >
        {shots.avatar ? <Preview url={shots.avatar} round busy={disabled} onRemove={() => void remove('avatar', shots.avatar)} removeLabel={t('common.remove')} /> : null}
      </SlotBlock>

      <div className="grid gap-4 sm:grid-cols-2">
        <SlotBlock
          id="onboard-teamLogo"
          label={`${t('auth.onboardTeamLogo')} *`}
          hint={t('auth.onboardImageHint')}
          progress={progress?.slot === 'teamLogo' ? progress.value : null}
          disabled={disabled || progress !== null}
          multiple={false}
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onPick={(list) => void upload(list, 'teamLogo')}
        >
          {shots.teamLogo ? <Preview url={shots.teamLogo} busy={disabled} onRemove={() => void remove('teamLogo', shots.teamLogo)} removeLabel={t('common.remove')} /> : null}
        </SlotBlock>
        <SlotBlock
          id="onboard-workshop"
          label={`${t('auth.onboardWorkshop')} *`}
          hint={t('auth.onboardImageHint')}
          progress={progress?.slot === 'workshop' ? progress.value : null}
          disabled={disabled || progress !== null}
          multiple={false}
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onPick={(list) => void upload(list, 'workshop')}
        >
          {shots.workshop ? <Preview url={shots.workshop} busy={disabled} onRemove={() => void remove('workshop', shots.workshop)} removeLabel={t('common.remove')} /> : null}
        </SlotBlock>
      </div>

      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-500">{t('auth.onboardImagesLater')}</p>
      <SlotBlock
        label={t('auth.onboardConstruction')}
        hint={t('auth.onboardOptionalWork')}
        note={t('auth.onboardImageHint')}
        progress={progress?.slot === 'construction' ? progress.value : null}
        disabled={disabled || progress !== null || shots.construction.length >= 6}
        multiple
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onPick={(list) => void upload(list, 'construction')}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shots.construction.map((url) => (
            <Preview key={url} url={url} busy={disabled} onRemove={() => void remove('construction', url)} removeLabel={t('common.remove')} />
          ))}
        </div>
      </SlotBlock>

      <SlotBlock
        label={t('auth.onboardCertificates')}
        hint={t('auth.onboardOptionalCert')}
        note={t('auth.onboardCertHint')}
        progress={progress?.slot === 'certificate' ? progress.value : null}
        disabled={disabled || progress !== null || shots.certificates.length >= 4}
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
        onPick={(list) => void upload(list, 'certificate')}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shots.certificates.map((url) => (
            <Preview key={url} url={url} busy={disabled} onRemove={() => void remove('certificate', url)} removeLabel={t('common.remove')} />
          ))}
        </div>
      </SlotBlock>
    </div>
  );
}

function SlotBlock({
  id,
  label,
  hint,
  note,
  progress,
  disabled,
  multiple,
  accept,
  onPick,
  children,
}: {
  id?: string;
  label: string;
  hint: string;
  note?: string;
  progress: number | null;
  disabled: boolean;
  multiple: boolean;
  accept: string;
  onPick: (list: FileList | null) => void;
  children?: ReactNode;
}) {
  return (
    <div id={id} tabIndex={-1}>
      <p className="text-sm font-semibold text-navy-800">{label}</p>
      <p className="mt-1 text-xs text-ink-400">{hint}</p>
      {note ? <p className="mt-0.5 text-xs text-ink-400">{note}</p> : null}
      <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-navy-800/20 bg-paper-50 px-4 py-5 text-center text-sm font-semibold text-navy-800">
        {label}
        <input
          className="sr-only"
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            onPick(event.target.files);
            event.target.value = '';
          }}
        />
      </label>
      {progress !== null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-800/10" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} role="progressbar">
          <div className="h-full bg-copper-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function Preview({
  url,
  round,
  busy,
  onRemove,
  removeLabel,
}: {
  url: string;
  round?: boolean;
  busy: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className={`relative overflow-hidden border border-navy-800/8 bg-paper-50 ${round ? 'h-28 w-28 rounded-full' : 'aspect-square rounded-2xl'}`}>
      {isPdf(url) ? (
        <a href={mediaUrl(url)} target="_blank" rel="noreferrer" className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-navy-800">
          PDF
        </a>
      ) : (
        <img src={mediaUrl(url)} alt="" className="h-full w-full object-cover" />
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        aria-label={removeLabel}
        className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-semibold text-red-600"
      >
        {removeLabel}
      </button>
    </div>
  );
}
