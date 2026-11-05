import { assessCardBuffer, type AssessMode, type CardIssue } from '@/features/ekyc/cardGeometry';

export type { CardIssue };
export {
  LIVE_ASPECT,
  MAX_CARD_BYTES,
  STABLE_FRAMES,
  TILT_LIMIT_DEG,
  cardWindow,
  coverSourceRect,
  isAcceptedImageFile,
  nextStableCount,
} from '@/features/ekyc/cardGeometry';

type SourceRect = { sx: number; sy: number; sw: number; sh: number };

export function inspectCardFrame(
  source: CanvasImageSource,
  width: number,
  height: number,
  options: { mode?: AssessMode; crop?: SourceRect } = {}
): CardIssue | null {
  const crop = options.crop;
  const srcW = crop?.sw ?? width;
  const srcH = crop?.sh ?? height;
  if (srcW < 40 || srcH < 40) return 'far';
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 320 / srcW);
  canvas.width = Math.max(40, Math.round(srcW * scale));
  canvas.height = Math.max(30, Math.round(srcH * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  if (crop) {
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return assessCardBuffer(ctx.getImageData(0, 0, canvas.width, canvas.height), {
    mode: options.mode || 'live',
  });
}

export function inspectLiveVideo(video: HTMLVideoElement): CardIssue | null {
  if (!video.videoWidth || !video.videoHeight) return 'missing';
  return inspectCardFrame(video, video.videoWidth, video.videoHeight, { mode: 'live' });
}

async function rasterizeImageFile(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
  }
  const url = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const node = new Image();
    node.onload = () => resolve(node);
    node.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    node.src = url;
  });
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

export async function inspectCardFile(file: File): Promise<CardIssue | null> {
  const image = await rasterizeImageFile(file);
  try {
    return inspectCardFrame(image.source, image.width, image.height, { mode: 'upload' });
  } finally {
    image.close?.();
  }
}
