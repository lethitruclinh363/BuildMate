const PERSON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const SHOP =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 9 5 4h14l2 5"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/></svg>';

const PIN = {
  job: { color: '#0B2E4A', glyph: '●' },
  contractor: { color: '#C9842A', glyph: PERSON },
  store: { color: '#D4A017', glyph: SHOP },
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
