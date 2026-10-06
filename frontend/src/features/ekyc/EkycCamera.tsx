import { useEffect, useRef, useState } from 'react';
import { captureVideoFrame, openCamera, stopStream } from '@/features/ekyc/camera';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function EkycCamera({
  title,
  hint,
  onUse,
  t,
}: {
  title: string;
  hint: string;
  onUse: (file: File) => Promise<void>;
  t: Translate;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'denied' | 'error'>('starting');
  const [shot, setShot] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return undefined;
    openCamera(video)
      .then((stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        setCameraState('ready');
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setCameraState(error.name === 'NotAllowedError' ? 'denied' : 'error');
      });
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  function retryCamera() {
    const video = videoRef.current;
    if (!video) return;
    setCameraState('starting');
    openCamera(video)
      .then((stream) => {
        streamRef.current = stream;
        setCameraState('ready');
      })
      .catch((error: Error) => {
        setCameraState(error.name === 'NotAllowedError' ? 'denied' : 'error');
      });
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video) return;
    setLocalError('');
    const file = await captureVideoFrame(video, 'card', 1400);
    setShot(file);
    setPreview(URL.createObjectURL(file));
  }

  function chooseFile(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!ACCEPT.includes(file.type) || file.size === 0 || file.size > MAX_BYTES) {
      setLocalError(t('ekyc.invalidImage'));
      return;
    }
    setLocalError('');
    setShot(file);
    setPreview(URL.createObjectURL(file));
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-navy-800">{title}</h3>
      <p className="text-sm text-ink-500">{hint}</p>
      <div className="overflow-hidden rounded-2xl bg-navy-900">
        {preview ? (
          <img src={preview} alt="" className="aspect-video w-full object-contain" />
        ) : (
          <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
        )}
      </div>
      {cameraState === 'denied' ? <p className="text-sm text-navy-800">{t('ekyc.cameraDenied')}</p> : null}
      {cameraState === 'error' ? <p className="text-sm text-navy-800">{t('ekyc.cameraError')}</p> : null}
      {localError ? <p className="text-sm text-red-600">{localError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {cameraState !== 'ready' && !preview ? (
          <button type="button" className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white" onClick={retryCamera}>
            {t('ekyc.retry')}
          </button>
        ) : null}
        {!shot ? (
          <button type="button" className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white" disabled={cameraState !== 'ready'} onClick={() => void shoot()}>
            {t('ekyc.capture')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="rounded-full border border-navy-800/15 px-4 py-2 text-sm font-semibold text-navy-800"
              onClick={() => {
                setShot(null);
                setPreview('');
              }}
            >
              {t('ekyc.retake')}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => {
                if (!shot) return;
                setBusy(true);
                void onUse(shot).finally(() => setBusy(false));
              }}
            >
              {t('ekyc.usePhoto')}
            </button>
          </>
        )}
        <label className="rounded-full border border-navy-800/15 px-4 py-2 text-sm font-semibold text-navy-800">
          {t('ekyc.upload')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              chooseFile(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
