import { useLocation, type Location, type NavigateFunction } from 'react-router-dom';

export function isAppPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

export function locationFrom(location: { pathname: string; search: string; hash: string }) {
  return { from: `${location.pathname}${location.search}${location.hash}` };
}

export function useReturnState() {
  const location = useLocation();
  return locationFrom(location);
}

/** Prefer an in-app source, then a previous BuildMate history entry, then a known fallback. */
export function goBackOrFallback(
  navigate: NavigateFunction,
  location: Pick<Location, 'state'>,
  fallback: string
) {
  const from = (location.state as { from?: unknown } | null)?.from;
  if (isAppPath(from)) {
    navigate(from);
    return;
  }
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === 'number' && idx > 0) {
    navigate(-1);
    return;
  }
  navigate(isAppPath(fallback) ? fallback : '/');
}
