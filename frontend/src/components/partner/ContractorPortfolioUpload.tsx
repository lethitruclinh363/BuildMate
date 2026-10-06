import { useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { FormLabel } from '@/components/ui/FormLabel';
import { catalogPickLabel, registeredServiceId } from '@/data/contractor-services';
import { contractorApi, mediaUrl } from '@/lib/partner-api';
import { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import type { ContractorProfile, PortfolioProject } from '@/types/partner';

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
  projects: [] as PortfolioProject[],
};

const fieldClass =
  'mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 text-sm text-navy-800 outline-none focus:border-navy-800';

function isPdf(url: string) {
  return url.toLowerCase().split('?')[0].endsWith('.pdf');
}

export function ContractorPortfolioUpload({
  profile,
  portfolio,
  services,
  disabled,
  showErrors,
  syncRef,
  onProfile,
  onError,
  errors,
}: {
  profile?: ContractorProfile | null;
  portfolio?: ContractorProfile['portfolio'];
  services: { category?: string; name: string; serviceId?: string | null; label?: string; labelKey?: string; type?: string }[];
  disabled: boolean;
  showErrors?: boolean;
  syncRef?: MutableRefObject<(() => Promise<void>) | null>;
  onProfile: (profile: ContractorProfile) => void;
  onError: (message: string) => void;
  errors?: { avatar?: string; teamLogo?: string; workshop?: string };
}) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<{ slot: Slot; value: number } | null>(null);
  const [projectProgress, setProjectProgress] = useState<{ id: string; value: number } | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [serviceDraft, setServiceDraft] = useState<Record<string, string>>({});
  const shots = portfolio || empty;
  const projects = shots.projects || [];
  const drafts = useRef<Record<string, { serviceId?: string; description?: string }>>({});
  const tail = useRef<Promise<void>>(Promise.resolve());
  const profileRef = useRef(profile);
  profileRef.current = profile;

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

  async function addProject() {
    if (disabled || projects.length >= 8 || !services.length) return;
    onError('');
    try {
      const { data } = await contractorApi.createPortfolioProject();
      onProfile(data.data);
    } catch (err) {
      onError(getApiErrorMessage(err));
    }
  }

  function previewProject(projectId: string, patch: Partial<PortfolioProject>) {
    const current = profileRef.current;
    if (!current?.portfolio) return;
    onProfile({
      ...current,
      portfolio: {
        ...current.portfolio,
        projects: (current.portfolio.projects || []).map((item) => (item.id === projectId ? { ...item, ...patch } : item)),
      },
    });
  }

  function enqueue(task: () => Promise<void>) {
    const next = tail.current.then(task, task);
    tail.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  function flushDrafts() {
    return enqueue(async () => {
      const entries = Object.entries(drafts.current).map(
        ([projectId, body]) => [projectId, { ...body }] as const
      );
      for (const [projectId, body] of entries) {
        const { data } = await contractorApi.updatePortfolioProject(projectId, body);
        const latest = drafts.current[projectId];
        const unchanged = latest?.description === body.description && latest?.serviceId === body.serviceId;
        if (unchanged) delete drafts.current[projectId];
        const saved = data.data;
        const pending = drafts.current[projectId];
        if (pending && saved.portfolio) {
          saved.portfolio = {
            ...saved.portfolio,
            projects: (saved.portfolio.projects || []).map((item) => (item.id === projectId ? { ...item, ...pending } : item)),
          };
        }
        onProfile(saved);
        if (!pending) {
          setDescriptions((current) => {
            if (!(projectId in current)) return current;
            const next = { ...current };
            delete next[projectId];
            return next;
          });
          setServiceDraft((current) => {
            if (!(projectId in current)) return current;
            const next = { ...current };
            delete next[projectId];
            return next;
          });
        }
      }
    });
  }

  if (syncRef) {
    syncRef.current = () =>
      flushDrafts().catch((err) => {
        onError(getApiErrorMessage(err));
        throw err;
      });
  }

  async function removeProject(project: PortfolioProject) {
    const filled = Boolean(project.serviceId || project.description.trim() || project.images.length);
    if (filled && !window.confirm(t('auth.projectRemoveConfirm'))) return;
    onError('');
    try {
      const { data } = await contractorApi.deletePortfolioProject(project.id);
      onProfile(data.data);
    } catch (err) {
      onError(getApiErrorMessage(err));
    }
  }

  async function addProjectImages(project: PortfolioProject, list: FileList | null) {
    const files = Array.from(list || []);
    if (!files.length || disabled) return;
    const room = 4 - project.images.length;
    if (room <= 0) {
      onError(t('auth.projectImageMax'));
      return;
    }
    const accepted = files.slice(0, room);
    const invalid = accepted.map((file) => fileError(file, 'construction')).find(Boolean);
    if (invalid) {
      onError(invalid);
      return;
    }
    if (files.length > room) onError(t('auth.projectImageMax'));
    else onError('');
    try {
      let latest: ContractorProfile | null = null;
      for (const file of accepted) {
        setProjectProgress({ id: project.id, value: 0 });
        const { data } = await contractorApi.uploadProjectImage(project.id, file, (value) => setProjectProgress({ id: project.id, value }));
        latest = data.data;
      }
      if (latest) onProfile(latest);
    } catch (err) {
      onError(getApiErrorMessage(err));
    } finally {
      setProjectProgress(null);
    }
  }

  async function removeProjectImage(projectId: string, url: string) {
    onError('');
    try {
      const { data } = await contractorApi.removeProjectImage(projectId, url);
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
        label={t('auth.onboardAvatar')}
        required
        error={errors?.avatar}
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
          label={t('auth.onboardTeamLogo')}
          required
          error={errors?.teamLogo}
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
          label={t('auth.onboardWorkshop')}
          required
          error={errors?.workshop}
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

      <div id="onboard-projects" tabIndex={-1} className="border-t border-navy-800/10 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-500">{t('auth.onboardImagesLater')}</p>
        <div className="mt-3">
          <FormLabel optional={t('auth.onboardOptionalMark')}>{t('auth.projectSection')}</FormLabel>
          <p className="mt-1 text-xs text-ink-400">{t('auth.projectSectionHint')}</p>
        </div>
        {projects.map((project, index) => {
          const serviceId = serviceDraft[project.id] ?? project.serviceId;
          const description = descriptions[project.id] ?? project.description;
          const known = services.some((item) => registeredServiceId(item) === serviceId);
          const serviceError = showErrors && !known ? t('auth.projectTypeRequired') : '';
          const descriptionError = showErrors && !description.trim() ? t('auth.projectDescriptionRequired') : '';
          const imageError = showErrors && project.images.length < 1 ? t('auth.projectImageRequired') : '';
          return (
            <div key={project.id} id={`onboard-project-${project.id}`} tabIndex={-1} className="mt-4 border-t border-navy-800/10 pt-4">
              <p className="text-sm font-semibold text-navy-800">{t('auth.projectNumber', { n: index + 1 })}</p>
              <label className="mt-3 block">
                <FormLabel required>{t('auth.projectType')}</FormLabel>
                <select
                  className={cn(fieldClass, 'h-10', serviceError && 'border-red-500')}
                  value={known ? serviceId : ''}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.value;
                    drafts.current[project.id] = { ...drafts.current[project.id], serviceId: next };
                    setServiceDraft((current) => ({ ...current, [project.id]: next }));
                    const match = services.find((item) => registeredServiceId(item) === next);
                    previewProject(project.id, { serviceId: next, serviceNameSnapshot: match?.name || '' });
                    void flushDrafts().catch((err) => onError(getApiErrorMessage(err)));
                  }}
                >
                  <option value="">{t('auth.projectTypePlaceholder')}</option>
                  {services.map((item) => {
                    const id = registeredServiceId(item);
                    return (
                      <option key={id} value={id}>
                        {catalogPickLabel(item, t)}
                      </option>
                    );
                  })}
                </select>
                <span className="mt-1 block text-xs text-ink-400">{t('auth.projectTypeHint')}</span>
                {serviceError ? <span className="mt-1 block text-xs text-red-600">{serviceError}</span> : null}
              </label>
              <label className="mt-3 block">
                <FormLabel required>{t('auth.projectDescription')}</FormLabel>
                <textarea
                  className={cn(fieldClass, 'min-h-20 py-2', descriptionError && 'border-red-500')}
                  maxLength={500}
                  rows={3}
                  placeholder={t('auth.projectDescriptionPlaceholder')}
                  value={description}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.value;
                    drafts.current[project.id] = { ...drafts.current[project.id], description: next };
                    setDescriptions((current) => ({ ...current, [project.id]: next }));
                    previewProject(project.id, { description: next });
                  }}
                  onBlur={() => {
                    void flushDrafts().catch((err) => onError(getApiErrorMessage(err)));
                  }}
                />
                <span className="mt-1 block text-right text-xs text-ink-400">{description.length}/500</span>
                {descriptionError ? <span className="mt-1 block text-xs text-red-600">{descriptionError}</span> : null}
              </label>
              <div className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <FormLabel required>{t('auth.projectImages')}</FormLabel>
                  <span className="text-xs text-ink-400">{t('auth.projectImageCount', { n: project.images.length })}</span>
                </div>
                <p className="mt-1 text-xs text-ink-400">{t('auth.projectImageHint')}</p>
                {project.images.length < 4 ? (
                  <label className={cn('mt-2 inline-flex h-10 cursor-pointer items-center rounded-lg border border-dashed px-3 text-sm font-medium text-navy-800', imageError ? 'border-red-500' : 'border-navy-800/20')}>
                    + {t('auth.projectAddImage')}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      multiple
                      disabled={disabled || projectProgress !== null}
                      onChange={(event) => {
                        void addProjectImages(project, event.target.files);
                        event.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
                {imageError ? <p className="mt-1 text-xs text-red-600">{imageError}</p> : null}
                {projectProgress?.id === project.id ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-800/10" role="progressbar" aria-valuenow={projectProgress.value} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-copper-500 transition-all" style={{ width: `${projectProgress.value}%` }} />
                  </div>
                ) : null}
                {project.images.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {project.images.map((url) => (
                      <Preview key={url} url={url} busy={disabled} compact onRemove={() => void removeProjectImage(project.id, url)} removeLabel={t('common.remove')} />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" className="text-sm font-medium text-red-600" disabled={disabled} onClick={() => void removeProject(project)}>
                  {t('auth.projectRemove')}
                </button>
              </div>
            </div>
          );
        })}
        {projects.length < 8 ? (
          <button
            type="button"
            className="mt-4 inline-flex h-10 items-center rounded-lg border border-navy-800/15 px-3 text-sm font-medium text-navy-800 disabled:opacity-50"
            disabled={disabled || !services.length}
            onClick={() => void addProject()}
          >
            + {t('auth.projectAdd')}
          </button>
        ) : null}
        {!services.length ? <p className="mt-2 text-xs text-ink-400">{t('auth.projectNeedsService')}</p> : null}
      </div>

      <SlotBlock
        label={t('auth.onboardCertificates')}
        optional={t('auth.onboardOptionalMark')}
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
  required,
  optional,
  error,
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
  required?: boolean;
  optional?: string;
  error?: string;
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
      <FormLabel required={required} optional={optional}>
        {label}
      </FormLabel>
      <p className="mt-1 text-xs text-ink-400">{hint}</p>
      {note ? <p className="mt-0.5 text-xs text-ink-400">{note}</p> : null}
      <label
        className={cn(
          'mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-paper-50 px-4 py-5 text-center text-sm font-medium text-navy-800',
          error ? 'border-red-500' : 'border-navy-800/20'
        )}
      >
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
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
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
  compact,
  onRemove,
  removeLabel,
}: {
  url: string;
  round?: boolean;
  busy: boolean;
  compact?: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className={`relative overflow-hidden border border-navy-800/8 bg-paper-50 ${round ? 'h-28 w-28 rounded-full' : 'aspect-square rounded-lg'}`}>
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
        className={compact
          ? 'absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-sm font-semibold text-navy-800'
          : 'absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-semibold text-red-600'}
      >
        {compact ? '×' : removeLabel}
      </button>
    </div>
  );
}
