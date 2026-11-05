import { useEffect, useRef, useState } from 'react';
import { captureVideoFrame, isStreamLive, openCamera, stopStream } from '@/features/ekyc/camera';
import {
  MAX_CARD_BYTES,
  STABLE_FRAMES,
  inspectCardFile,
  inspectLiveVideo,
  isAcceptedImageFile,
  nextStableCount,
  type CardIssue,
} from '@/features/ekyc/cardQuality';
import { ekycApi } from '@/features/ekyc/ekyc.api';
import { getApiErrorMessage } from '@/lib/api';

const FRAME_MS = 280;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function EkycCamera({
  title,
  hint,
  compareSrc,
  side,
  onUse,
  t,
}: {
  title: string;
  hint: string;
  compareSrc?: string;
  side: 'front' | 'back';
  onUse: (file: File) => Promise<void>;
  t: Translate;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrl = useRef('');
  const cameraGen = useRef(0);
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'denied' | 'error'>('starting');
  const [shot, setShot] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [liveIssue, setLiveIssue] = useState<CardIssue | null>('missing');
  const [stableCount, setStableCount] = useState(0);
  const [captureIssue, setCaptureIssue] = useState<CardIssue | null>(null);
  const [localError, setLocalError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);

  function setPreviewUrl(url: string) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = url;
    setPreview(url);
  }

  async function startCamera() {
    const video = videoRef.current;
    if (!video) return;
    const gen = cameraGen.current + 1;
    cameraGen.current = gen;
    setCameraState('starting');
    try {
      stopStream(streamRef.current);
      streamRef.current = null;
      const stream = await openCamera(video, 'environment');
      if (cameraGen.current !== gen) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      setCameraState('ready');
    } catch (error) {
      if (cameraGen.current !== gen) return;
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraState((error as Error).name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }

  const startCameraRef = useRef(startCamera);
  startCameraRef.current = startCamera;

  useEffect(() => {
    void startCameraRef.current();
    return () => {
      cameraGen.current += 1;
      stopStream(streamRef.current);
      streamRef.current = null;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  useEffect(() => {
    if (shot || cameraState !== 'ready') return undefined;
    let timer = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video && video.videoWidth) {
        const issue = inspectLiveVideo(video);
        setLiveIssue(issue);
        setStableCount((value) => nextStableCount(value, issue === null));
      }
      if (streamRef.current && !isStreamLive(streamRef.current)) {
        void startCameraRef.current();
        return;
      }
      timer = window.setTimeout(tick, FRAME_MS);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [shot, cameraState]);

  function clearStill() {
    setShot(null);
    setPreviewUrl('');
    setCaptureIssue(null);
    setLocalError('');
    setStableCount(0);
  }

  async function shoot() {
    const video = videoRef.current;
    const readable = liveIssue === null;
    if (!video || cameraState !== 'ready' || capturing || busy || !readable) return;
    setCapturing(true);
    setLocalError('');
    setCaptureIssue(null);
    try {
      if (!isStreamLive(streamRef.current) || !video.videoWidth) {
        await startCamera();
        const live = videoRef.current;
        if (!live || !isStreamLive(streamRef.current) || !live.videoWidth) return;
      }
      const liveVideo = videoRef.current;
      if (!liveVideo) return;
      const file = await captureVideoFrame(liveVideo, side, 1600);
      const quality = await inspectCardFile(file);
      if (quality) {
        setCaptureIssue(quality);
        setShot(file);
        setPreviewUrl(URL.createObjectURL(file));
        setStableCount(0);
        return;
      }
      setShot(file);
      setPreviewUrl(URL.createObjectURL(file));
      setLiveIssue(null);
    } catch {
      setLocalError(t('ekyc.cameraError'));
    } finally {
      setCapturing(false);
    }
  }

  async function chooseFile(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!isAcceptedImageFile(file, MAX_CARD_BYTES)) {
      setLocalError(t('ekyc.invalidImage'));
      return;
    }
    setLocalError('');
    setCaptureIssue(null);
    setShot(file);
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);
    try {
      const quality = await inspectCardFile(file);
      if (quality) setCaptureIssue(quality);
    } catch {
      setCaptureIssue('missing');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!shot || captureIssue || busy) return;
    setBusy(true);
    setLocalError('');
    try {
      try {
        const face = await ekycApi.readiness(shot);
        if (face.ready) {
          setLocalError(t(side === 'back' ? 'ekyc.faceAsBack' : 'ekyc.faceAsCard'));
          setShot(null);
          setPreviewUrl('');
          setStableCount(0);
          return;
        }
      } catch {
        /* Local quality already passed; Python selfie check is extra. */
      }
      await onUse(shot);
    } catch (error) {
      setShot(null);
      setPreviewUrl('');
      setStableCount(0);
      setLocalError(getApiErrorMessage(error) || t('ekyc.unavailable'));
    } finally {
      setBusy(false);
    }
  }

  const issue = captureIssue || (!shot ? liveIssue : null);
  const readable = liveIssue === null && cameraState === 'ready' && !shot;
  const stable = readable && stableCount >= STABLE_FRAMES;
  const canCapture = cameraState === 'ready' && !capturing && !busy && !shot && readable;
  const statusKey = localError
    ? ''
    : issue
      ? `ekyc.card.${issue}`
      : readable && !stable
        ? 'ekyc.card.checking'
        : 'ekyc.card.ok';

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-navy-800">{title}</h3>
      <p className="text-sm leading-6 text-ink-500">{hint}</p>
      {compareSrc ? (
        <div className="flex items-center gap-3 rounded-2xl bg-paper-50 p-3">
          <img src={compareSrc} alt="" className="h-14 w-24 rounded-lg object-cover" />
          <p className="text-xs text-ink-500">{t('ekyc.frontReference')}</p>
        </div>
      ) : null}
      <div className="relative overflow-hidden rounded-2xl bg-navy-900">
        <div className="relative aspect-[85/54] w-full bg-navy-950">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`absolute inset-0 h-full w-full object-cover ${preview ? 'opacity-0' : ''}`}
          />
          {preview ? <img src={preview} alt="" className="absolute inset-0 h-full w-full object-contain" /> : null}
          {!preview ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`relative h-[72%] w-[86%] max-w-[520px] ${
                  stable ? 'text-emerald-400' : issue ? 'text-red-400' : 'text-white/80'
                }`}
              >
                <span className="absolute left-0 top-0 h-7 w-7 border-l-2 border-t-2" />
                <span className="absolute right-0 top-0 h-7 w-7 border-r-2 border-t-2" />
                <span className="absolute bottom-0 left-0 h-7 w-7 border-b-2 border-l-2" />
                <span className="absolute bottom-0 right-0 h-7 w-7 border-b-2 border-r-2" />
              </div>
            </div>
          ) : null}
          {cameraState === 'starting' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-navy-900/70 text-sm text-white">
              {t('ekyc.cameraStarting')}
            </div>
          ) : null}
        </div>
      </div>
      <p className={`text-sm ${issue || localError ? 'text-red-600' : 'text-navy-800'}`}>
        {localError || (statusKey ? t(statusKey) : '')}
      </p>
      {cameraState === 'denied' ? <p className="text-sm text-navy-800">{t('ekyc.cameraDenied')}</p> : null}
      {cameraState === 'error' ? <p className="text-sm text-navy-800">{t('ekyc.cameraError')}</p> : null}
      <div className="flex flex-wrap gap-2">
        {cameraState !== 'ready' && !shot ? (
          <button type="button" className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white" onClick={() => void startCamera()}>
            {t('ekyc.retry')}
          </button>
        ) : null}
        {!shot ? (
          <button
            type="button"
            className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!canCapture}
            onClick={() => void shoot()}
          >
            {t('ekyc.capture')}
          </button>
        ) : (
          <>
            <button type="button" className="rounded-full border border-navy-800/15 px-4 py-2 text-sm font-semibold text-navy-800" onClick={clearStill}>
              {t('ekyc.retake')}
            </button>
            <button
              type="button"
              disabled={busy || Boolean(captureIssue)}
              className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void confirm()}
            >
              {busy ? t('ekyc.saving') : t('ekyc.usePhoto')}
            </button>
          </>
        )}
        <label className="rounded-full border border-navy-800/15 px-4 py-2 text-sm font-semibold text-navy-800">
          {t('ekyc.upload')}
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            onChange={(event) => {
              void chooseFile(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
