import type { ClipboardEvent, KeyboardEvent } from 'react';

export function numberInputFloor(min?: string | number) {
  if (min == null || min === '') return 0;
  const parsed = Number(min);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function allowsNegativeNumber(min?: string | number) {
  return numberInputFloor(min) < 0;
}

export function parseFiniteNumber(raw: string) {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function guardNumberKeyDown(event: KeyboardEvent<HTMLInputElement>, min?: string | number) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'e' || event.key === 'E' || event.key === '+') {
    event.preventDefault();
    return;
  }
  if (!allowsNegativeNumber(min) && (event.key === '-' || event.key === 'Minus')) {
    event.preventDefault();
  }
}

export function guardNumberPaste(event: ClipboardEvent<HTMLInputElement>, min?: string | number) {
  const text = event.clipboardData?.getData('text') ?? '';
  const parsed = parseFiniteNumber(text);
  const floor = numberInputFloor(min);
  if (parsed == null || parsed < floor) event.preventDefault();
}
