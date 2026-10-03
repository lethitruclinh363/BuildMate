import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function focusField(section: HTMLElement) {
  const field = section.querySelector<HTMLElement>('textarea, input:not([type="file"]):not([type="hidden"]), select');
  field?.focus({ preventScroll: true });
}

export function useHashFocus(ready: boolean) {
  const location = useLocation();

  useEffect(() => {
    if (!ready) return undefined;
    const id = location.hash.replace(/^#/, '');
    if (!id) return undefined;

    let cancelled = false;
    let attempts = 0;
    let highlight: HTMLElement | null = null;
    let clearHighlight = 0;

    const run = () => {
      if (cancelled) return;
      const element = document.getElementById(id);
      if (!element) {
        if (attempts < 20) {
          attempts += 1;
          window.setTimeout(run, 50);
        }
        return;
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element.classList.add('highlight-target');
      highlight = element;
      focusField(element);
      clearHighlight = window.setTimeout(() => {
        element.classList.remove('highlight-target');
      }, 1800);
    };

    const frame = window.requestAnimationFrame(run);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clearHighlight);
      highlight?.classList.remove('highlight-target');
    };
  }, [location.pathname, location.hash, ready]);
}
