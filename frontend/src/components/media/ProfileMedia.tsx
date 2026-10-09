import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';

export type ViewerSlide = { src: string; alt: string };

type FrameFit = 'cover' | 'thumbnail' | 'logo';

const FRAME_FIT: Record<FrameFit, string> = {
  cover: 'object-cover object-center',
  thumbnail: 'object-cover object-center',
  logo: 'object-contain object-center',
};

/** Khung ảnh trong trang. Cover và thumbnail dùng cover; logo giữ nguyên toàn bộ dấu. */
export function MediaFrame({
  src,
  alt,
  fit,
  frameClassName,
  onOpen,
  empty,
  priority = false,
}: {
  src?: string;
  alt: string;
  fit: FrameFit;
  frameClassName: string;
  onOpen?: () => void;
  empty?: ReactNode;
  priority?: boolean;
}) {
  const { t } = useI18n();
  const imgRef = useRef<HTMLImageElement>(null);
  const resolved = src ? mediaUrl(src) : '';
  const [visual, setVisual] = useState({ src: resolved, status: 'loading' as 'loading' | 'ready' | 'error' });

  if (visual.src !== resolved) {
    setVisual({ src: resolved, status: resolved ? 'loading' : 'ready' });
  }

  const status = visual.src === resolved ? visual.status : 'loading';
  const defaultAspect = frameClassName.includes('aspect-')
    ? ''
    : fit === 'logo'
      ? 'aspect-square'
      : fit === 'cover'
        ? 'aspect-[21/9]'
        : 'aspect-[4/3]';

  useLayoutEffect(() => {
    const image = imgRef.current;
    if (!image || !resolved) return;
    let cancelled = false;
    function settle() {
      if (cancelled || !image) return;
      if (!image.complete || image.naturalWidth <= 0) return;
      setVisual({ src: resolved, status: 'ready' });
    }
    settle();
    const timer = window.setTimeout(settle, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [resolved]);

  return (
    <div className={`relative w-full overflow-hidden bg-navy-800/5 ${defaultAspect} ${frameClassName}`}>
      {!src ? (
        empty ?? null
      ) : status === 'error' ? (
        <div className="absolute inset-0 grid place-items-center gap-1 p-3 text-center text-xs text-ink-400">
          <ImageOff className="h-5 w-5" aria-hidden />
          <span>{t('viewer.failed')}</span>
        </div>
      ) : (
        <>
          {status === 'loading' ? <div className="absolute inset-0 animate-pulse bg-navy-800/10" /> : null}
          <img
            key={resolved}
            ref={imgRef}
            src={resolved}
            alt={alt}
            loading="eager"
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            onLoad={() => setVisual({ src: resolved, status: 'ready' })}
            onError={() => {
              setVisual({ src: resolved, status: 'error' });
            }}
            className={`absolute inset-0 z-[1] h-full w-full ${FRAME_FIT[fit]}`}
          />
          {onOpen ? (
            <button type="button" className="absolute inset-0 z-[2] cursor-zoom-in" aria-label={alt} onClick={onOpen} />
          ) : null}
        </>
      )}
    </div>
  );
}

/** Xem ảnh gốc toàn màn hình. Luôn object-contain, gắn vào document.body để không bị cắt bởi card. */
export function ImageViewer({
  slides,
  index,
  onClose,
  onChange,
}: {
  slides: ViewerSlide[];
  index: number | null;
  onClose: () => void;
  onChange: (index: number) => void;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const onChangeRef = useRef(onChange);
  onCloseRef.current = onClose;
  onChangeRef.current = onChange;
  const open = index != null && slides.length > 0;
  const safeIndex = open ? Math.min(index, slides.length - 1) : 0;
  const slide = open ? slides[safeIndex] : null;
  const many = slides.length > 1;
  const indexRef = useRef(safeIndex);
  const lengthRef = useRef(slides.length);
  indexRef.current = safeIndex;
  lengthRef.current = slides.length;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      const count = lengthRef.current;
      const current = indexRef.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
      if (count < 2) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onChangeRef.current((current - 1 + count) % count);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onChangeRef.current((current + 1) % count);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open || !slide || typeof document === 'undefined') return null;

  function step(direction: -1 | 1) {
    onChange((safeIndex + direction + slides.length) % slides.length);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label={slide.alt}
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white"
        aria-label={t('viewer.close')}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X className="h-5 w-5" />
      </button>
      {many ? (
        <>
          <button
            type="button"
            className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white sm:left-4"
            aria-label={t('viewer.previous')}
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white sm:right-4"
            aria-label={t('viewer.next')}
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}
      <div className="flex h-full w-full items-center justify-center" onClick={onClose}>
        <ViewerImage
          slide={slide}
          onSwipe={(direction) => {
            if (many) step(direction);
          }}
          touchX={touchX}
        />
      </div>
      {many ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm font-semibold text-white">
          {t('viewer.position', { current: safeIndex + 1, total: slides.length })}
        </p>
      ) : null}
    </div>,
    document.body
  );
}

function ViewerImage({
  slide,
  onSwipe,
  touchX,
}: {
  slide: ViewerSlide;
  onSwipe: (direction: -1 | 1) => void;
  touchX: MutableRefObject<number | null>;
}) {
  const { t } = useI18n();
  const imgRef = useRef<HTMLImageElement>(null);
  const resolved = mediaUrl(slide.src);
  const [visual, setVisual] = useState({ src: resolved, status: 'loading' as 'loading' | 'ready' | 'error' });

  if (visual.src !== resolved) {
    setVisual({ src: resolved, status: 'loading' });
  }

  const status = visual.src === resolved ? visual.status : 'loading';

  useLayoutEffect(() => {
    const image = imgRef.current;
    if (!image || !resolved) return;
    let cancelled = false;
    function settle() {
      if (cancelled || !image) return;
      if (!image.complete || image.naturalWidth <= 0) return;
      setVisual({ src: resolved, status: 'ready' });
    }
    settle();
    const timer = window.setTimeout(settle, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [resolved]);

  if (status === 'error') {
    return (
      <div className="grid place-items-center gap-2 px-6 text-center text-sm text-white" onClick={(event) => event.stopPropagation()}>
        <ImageOff className="h-8 w-8" aria-hidden />
        <p>{t('viewer.failed')}</p>
      </div>
    );
  }

  return (
    <>
      {status === 'loading' ? <div className="pointer-events-none absolute h-16 w-16 animate-pulse rounded-full bg-white/20" /> : null}
      <img
        key={resolved}
        ref={imgRef}
        src={resolved}
        alt={slide.alt}
        onLoad={() => setVisual({ src: resolved, status: 'ready' })}
        onError={() => {
          setVisual({ src: resolved, status: 'error' });
        }}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          touchX.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchX.current;
          const end = event.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || end == null) return;
          const delta = end - start;
          if (delta > 48) onSwipe(-1);
          if (delta < -48) onSwipe(1);
        }}
        className="max-h-[calc(100dvh-6rem)] max-w-[100vw] object-contain sm:max-h-[90vh] sm:max-w-[95vw]"
      />
    </>
  );
}
