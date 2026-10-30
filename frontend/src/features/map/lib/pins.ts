/** Lucide HardHat — cùng icon với chú thích “Đội thợ”. */
const HARD_HAT =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>';

/** Lucide Store — cùng icon với chú thích “Cửa hàng vật liệu”. */
const STORE =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>';

const PIN = {
  job: { color: '#0B2E4A', glyph: '●' },
  contractor: { color: '#C9842A', glyph: HARD_HAT },
  store: { color: '#D4A017', glyph: STORE },
} as const;

export type PinKind = keyof typeof PIN;

export function createPinElement(kind: PinKind, selected = false) {
  const spec = PIN[kind];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = selected ? 'bm-pin bm-pin-selected' : kind === 'job' ? 'bm-pin bm-pin-still' : 'bm-pin';
  button.style.background = spec.color;
  button.innerHTML = spec.glyph;
  return button;
}
