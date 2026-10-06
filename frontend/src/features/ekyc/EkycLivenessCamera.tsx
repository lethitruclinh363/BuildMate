import { useEffect, useRef, useState } from 'react';
import { captureVideoFrame, openCamera, stopStream } from '@/features/ekyc/camera';
import { ekycApi, type FaceCheck } from '@/features/ekyc/ekyc.api';

const STEPS = ['center', 'left', 'right', 'up', 'down'] as const;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function codeMessage(t: Translate, code?: string) {
  if (!code) return t('ekyc.codes.UNKNOWN');
  const key = `ekyc.codes.${code}`;
  const text = t(key);
  return text === '—' ? `${t('ekyc.codes.UNKNOWN')} (${code})` : text;
}

export function EkycLivenessCamera({
  onComplete,
  t,
}: {
  onComplete: (frames: Record<string, File>) => void;
  t: Translate;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'denied' | 'error'>('starting');
  const [scanning, setScanning] = useState(false);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [passed, setPassed] = useState(false);

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
        if (!cancelled) setCameraState(error.name === 'NotAllowedError' ? 'denied' : 'error');
      });
    return () => {
      cancelled = true;
      runRef.current += 1;
      stopStream(streamRef.current);
    };
  }, []);

  async function retryCamera() {
    const video = videoRef.current;
    if (!video) return;
    setCameraState('starting');
    try {
      streamRef.current = await openCamera(video);
      setCameraState('ready');
    } catch (error) {
      setCameraState((error as Error).name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }

  async function start() {
    const video = videoRef.current;
    if (!video || cameraState !== 'ready' || scanning) return;
    const runId = runRef.current + 1;
    runRef.current = runId;
    const current = () => runRef.current === runId;
    setScanning(true);
    setPassed(false);
    setMessage(t('ekyc.checking'));
    const frames: Record<string, File> = {};
    try {
      const preview = await captureVideoFrame(video, 'readiness', 640);
      const ready: FaceCheck = await ekycApi.readiness(preview);
      if (!current()) return;
      if (!ready.ready) {
        setMessage(codeMessage(t, ready.code));
        setScanning(false);
        return;
      }
      let stepIndex = 0;
      while (stepIndex < STEPS.length) {
        if (!current()) return;
        const step = STEPS[stepIndex];
        setIndex(stepIndex);
        setMessage(t(`ekyc.pose.${step}`));
        await wait(1600);
        if (!current()) return;
        const frame = await captureVideoFrame(video, step, step === 'center' ? 720 : 640);
        setMessage(t('ekyc.checking'));
        const result = await ekycApi.validateFrame(
          frame,
          step,
          step === 'center' ? null : frames.center,
          step === 'right' ? frames.left : null
        );
        if (!current()) return;
        if (!result.passed) {
          setMessage(codeMessage(t, result.code));
          await wait(1200);
          continue;
        }
        frames[step] = frame;
        setPassed(true);
        await wait(400);
        setPassed(false);
        stepIndex += 1;
      }
      if (!current()) return;
      setScanning(false);
      onComplete(frames);
    } catch (error) {
      if (!current()) return;
      const status = (error as { response?: { status?: number } })?.response?.status;
      setMessage(!status || status === 502 ? t('ekyc.unavailable') : t('ekyc.codes.UNKNOWN'));
      setScanning(false);
    }
  }

  const step = STEPS[index];

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-navy-800">{t('ekyc.faceTitle')}</h3>
      <p className="text-sm text-ink-500">{t('ekyc.faceLead')}</p>
      <div className="relative overflow-hidden rounded-2xl bg-navy-900">
        <video ref={videoRef} autoPlay muted playsInline className="aspect-[3/4] w-full object-cover sm:aspect-video" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[70%] w-[46%] rounded-[50%] border-2 border-white/80" />
        </div>
        {cameraState !== 'ready' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-900/80 p-4 text-center text-sm text-white">
            {cameraState === 'starting' ? t('ekyc.cameraStarting') : cameraState === 'denied' ? t('ekyc.cameraDenied') : t('ekyc.cameraError')}
          </div>
        ) : null}
      </div>
      <p className="text-sm font-semibold text-navy-800">
        {t('ekyc.stepCount', { current: index + 1, total: STEPS.length })} · {t(`ekyc.pose.${step}`)}
      </p>
      {message ? <p className="text-sm text-ink-500">{passed ? t('ekyc.passed') : message}</p> : null}
      {cameraState === 'ready' ? (
        <button type="button" disabled={scanning} className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void start()}>
          {t('ekyc.startScan')}
        </button>
      ) : (
        <button type="button" className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white" onClick={() => void retryCamera()}>
          {t('ekyc.retry')}
        </button>
      )}
    </div>
  );
}
