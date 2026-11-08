import { useEffect, useRef, useState } from 'react';
import { captureVideoFrame, openCamera, stopStream } from '@/features/ekyc/camera';
import { ekycApi, type FaceCheck } from '@/features/ekyc/ekyc.api';

const STEPS = ['center', 'left', 'right', 'up', 'down'] as const;
const ARROWS = { center: '◎', left: '←', right: '→', up: '↑', down: '↓' } as const;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type Ring = 'idle' | 'checking' | 'ok' | 'bad';

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
  const [done, setDone] = useState<boolean[]>([false, false, false, false, false]);
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [ring, setRing] = useState<Ring>('idle');

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return undefined;
    openCamera(video, 'user')
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
      stopStream(streamRef.current);
      streamRef.current = null;
      streamRef.current = await openCamera(video, 'user');
      setCameraState('ready');
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
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
    setDone([false, false, false, false, false]);
    setRing('checking');
    setMessage(t('ekyc.checking'));
    const frames: Record<string, File> = {};
    try {
      const preview = await captureVideoFrame(video, 'readiness', 640);
      const ready: FaceCheck = await ekycApi.readiness(preview);
      if (!current()) return;
      if (!ready.ready) {
        setRing('bad');
        setMessage(codeMessage(t, ready.code));
        setScanning(false);
        return;
      }
      let stepIndex = 0;
      while (stepIndex < STEPS.length) {
        if (!current()) return;
        const step = STEPS[stepIndex];
        setIndex(stepIndex);
        setRing('idle');
        setMessage(t(`ekyc.pose.${step}`));
        for (let n = 3; n >= 1; n -= 1) {
          if (!current()) return;
          setCountdown(n);
          await wait(700);
        }
        setCountdown(0);
        setRing('checking');
        setMessage(t('ekyc.checking'));
        const frame = await captureVideoFrame(video, step, step === 'center' ? 720 : 640);
        const result = await ekycApi.validateFrame(
          frame,
          step,
          step === 'center' ? null : frames.center,
          step === 'right' ? frames.left : null
        );
        if (!current()) return;
        if (!result.passed) {
          setRing('bad');
          setMessage(codeMessage(t, result.code));
          await wait(1100);
          continue;
        }
        frames[step] = frame;
        setDone((prev) => prev.map((value, idx) => (idx === stepIndex ? true : value)));
        setRing('ok');
        setMessage(t('ekyc.passed'));
        await wait(400);
        stepIndex += 1;
      }
      if (!current()) return;
      setScanning(false);
      onComplete(frames);
    } catch (error) {
      if (!current()) return;
      const status = (error as { response?: { status?: number } })?.response?.status;
      setRing('bad');
      setMessage(!status || status === 502 ? t('ekyc.unavailable') : t('ekyc.codes.UNKNOWN'));
      setScanning(false);
    }
  }

  const step = STEPS[index];
  const ringClass =
    ring === 'ok'
      ? 'border-emerald-400'
      : ring === 'bad'
        ? 'border-red-400'
        : ring === 'checking'
          ? 'border-amber-300'
          : 'border-white/80';

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <h3 className="text-base font-semibold text-navy-800 sm:text-lg">{t('ekyc.faceTitle')}</h3>
      <p className="text-xs leading-5 text-ink-500 sm:text-sm">{t('ekyc.faceLead')}</p>
      <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl bg-navy-900 sm:max-w-[320px]">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-[4/5] h-[min(42dvh,340px)] w-full object-cover [transform:scaleX(-1)]"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={`h-[58%] w-[48%] max-h-[210px] rounded-[50%] border-[3px] ${ringClass}`} />
        </div>
        <div className="pointer-events-none absolute inset-0 text-white">
          <p className={`absolute left-1/2 top-2 -translate-x-1/2 text-4xl font-semibold drop-shadow ${step === 'up' ? 'animate-pulse text-amber-300 motion-reduce:animate-none' : 'text-white/35'}`}>
            {ARROWS.up}
          </p>
          <p className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-4xl font-semibold drop-shadow ${step === 'down' ? 'animate-pulse text-amber-300 motion-reduce:animate-none' : 'text-white/35'}`}>
            {ARROWS.down}
          </p>
          <p className={`absolute left-2 top-1/2 -translate-y-1/2 text-5xl font-semibold drop-shadow ${step === 'left' ? 'animate-pulse text-amber-300 motion-reduce:animate-none' : 'text-white/35'}`}>
            {ARROWS.left}
          </p>
          <p className={`absolute right-2 top-1/2 -translate-y-1/2 text-5xl font-semibold drop-shadow ${step === 'right' ? 'animate-pulse text-amber-300 motion-reduce:animate-none' : 'text-white/35'}`}>
            {ARROWS.right}
          </p>
          {step === 'center' ? (
            <p className="absolute left-1/2 top-3 -translate-x-1/2 text-3xl text-amber-300 drop-shadow">{ARROWS.center}</p>
          ) : null}
        </div>
        {countdown ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-semibold text-white">{countdown}</p>
        ) : null}
        {cameraState !== 'ready' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-900/80 p-4 text-center text-sm text-white">
            {cameraState === 'starting' ? t('ekyc.cameraStarting') : cameraState === 'denied' ? t('ekyc.cameraDenied') : t('ekyc.cameraError')}
          </div>
        ) : null}
      </div>
      <p className="text-center text-sm font-semibold text-navy-800">{t(`ekyc.pose.${step}`)}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {STEPS.map((item, idx) => (
          <div key={item} className="text-center">
            <div className={`h-1.5 rounded-full ${done[idx] ? 'bg-emerald-500' : idx === index && scanning ? 'bg-amber-400' : 'bg-navy-800/15'}`} />
            <p className="mt-1 text-[10px] text-ink-400">{ARROWS[item]}</p>
          </div>
        ))}
      </div>
      <p className="text-xs font-semibold text-navy-800 sm:text-sm">
        {t('ekyc.stepCount', { current: index + 1, total: STEPS.length })}
      </p>
      {message ? <p className="text-xs text-ink-500 sm:text-sm">{message}</p> : null}
      {cameraState === 'ready' ? (
        <button type="button" disabled={scanning} className="h-11 w-full rounded-full bg-navy-800 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void start()}>
          {scanning ? t('ekyc.checking') : t('ekyc.startScan')}
        </button>
      ) : (
        <button type="button" className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white" onClick={() => void retryCamera()}>
          {t('ekyc.retry')}
        </button>
      )}
    </div>
  );
}
