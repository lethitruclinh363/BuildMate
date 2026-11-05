export const TILT_LIMIT_DEG = 15;
export const STABLE_FRAMES = 1;
export const CCCD_RATIO = 85.6 / 53.98;
export const LIVE_ASPECT = 85 / 54;
export const MAX_CARD_BYTES = 8 * 1024 * 1024;

export type CardIssue =
  | 'missing'
  | 'corners'
  | 'tiltLeft'
  | 'tiltRight'
  | 'perspective'
  | 'far'
  | 'close'
  | 'blur'
  | 'glare'
  | 'dark'
  | 'occluded'
  | 'face'
  | 'center'
  | 'tilt';

export type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type AssessMode = 'live' | 'upload';

const ACCEPT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp']);

export function isAcceptedImageFile(
  file: { type?: string; name?: string; size: number },
  maxBytes = MAX_CARD_BYTES
) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) return false;
  const type = String(file.type || '').toLowerCase();
  if (ACCEPT_TYPES.has(type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(String(file.name || ''));
}

export function coverSourceRect(srcW: number, srcH: number, destAspect = LIVE_ASPECT) {
  const width = Math.max(1, srcW);
  const height = Math.max(1, srcH);
  const srcAspect = width / height;
  if (srcAspect > destAspect) {
    const sw = height * destAspect;
    return { sx: (width - sw) / 2, sy: 0, sw, sh: height };
  }
  const sh = width / destAspect;
  return { sx: 0, sy: (height - sh) / 2, sw: width, sh };
}

export function cardWindow(width: number, height: number) {
  const maxWidth = width * 0.86;
  const maxHeight = height * 0.72;
  let w = maxWidth;
  let h = w / CCCD_RATIO;
  if (h > maxHeight) {
    h = maxHeight;
    w = h * CCCD_RATIO;
  }
  return {
    x: Math.round((width - w) / 2),
    y: Math.round((height - h) / 2),
    w: Math.round(w),
    h: Math.round(h),
  };
}

export function nextStableCount(prev: number, ok: boolean) {
  return ok ? prev + 1 : 0;
}

function luma(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const i = (y * width + x) * 4;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
}

export function assessCardBuffer(buf: PixelBuffer, _options: { mode?: AssessMode } = {}): CardIssue | null {
  if (buf.width < 40 || buf.height < 40) return 'far';
  const { data, width, height } = buf;
  const step = Math.max(1, Math.round(Math.min(width, height) / 80));
  let sum = 0;
  let n = 0;
  const laps: number[] = [];
  for (let y = 2; y < height - 2; y += step) {
    for (let x = 2; x < width - 2; x += step) {
      const v = luma(data, width, x, y);
      sum += v;
      n += 1;
      const up = luma(data, width, x, y - 1);
      const down = luma(data, width, x, y + 1);
      const left = luma(data, width, x - 1, y);
      const right = luma(data, width, x + 1, y);
      laps.push(Math.abs(v * 4 - up - down - left - right));
    }
  }
  if (!n) return 'missing';
  const mean = sum / n;
  laps.sort((a, b) => a - b);
  const cut = Math.floor(laps.length * 0.6);
  let sharpSum = 0;
  for (let i = cut; i < laps.length; i += 1) sharpSum += laps[i];
  const sharpness = sharpSum / Math.max(1, laps.length - cut);
  if (mean < 36) return 'dark';
  if (sharpness < 3) return 'blur';
  return null;
}
