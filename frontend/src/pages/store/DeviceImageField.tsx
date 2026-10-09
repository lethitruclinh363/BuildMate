import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function imageProblem(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const typeOk = IMAGE_TYPES.has(file.type) || (!file.type && ['jpg', 'jpeg', 'png', 'webp'].includes(ext));
  if (!typeOk) return 'type' as const;
  if (file.size > MAX_IMAGE_BYTES) return 'size' as const;
  return null;
}

export function DeviceImageField({
  label,
  file,
  existing,
  removed,
  error,
  onFile,
  onClear,
}: {
  label: string;
  file: File | null;
  existing: string;
  removed: boolean;
  error: string;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview || (!removed && existing ? mediaUrl(existing) : '');

  function take(next?: File) {
    if (!next) return;
    onFile(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-navy-800">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => take(event.target.files?.[0])}
      />
      {shown ? (
        <div className="overflow-hidden rounded-2xl border border-navy-800/10 bg-mist-100/60">
          <img src={shown} alt="" className="aspect-[4/3] w-full object-cover" />
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <p className="min-w-0 truncate text-sm text-ink-500">{file?.name || t('materialPage.imageCurrent')}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
                {t('materialPage.replaceImage')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onClear}>
                {t('materialPage.removeImage')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl border border-dashed border-navy-800/15 bg-mist-100/40 px-6 py-8 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            take(event.dataTransfer.files?.[0]);
          }}
        >
          <ImagePlus className="mx-auto h-8 w-8 text-ink-400" aria-hidden />
          <p className="mt-3 text-sm font-medium text-navy-800">{t('materialPage.dropImage')}</p>
          <p className="mt-1 text-sm text-ink-400">{t('materialPage.or')}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => inputRef.current?.click()}>
            {t('materialPage.chooseImage')}
          </Button>
          <p className="mt-3 text-xs text-ink-400">{t('materialPage.imageHint')}</p>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
