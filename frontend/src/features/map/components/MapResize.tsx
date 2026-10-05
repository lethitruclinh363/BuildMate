import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/** Recalculate tile grid when the map box changes. Not on every React render. */
export function MapResize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
      });
    };

    update();
    const timer = window.setTimeout(update, 120);
    const observer = new ResizeObserver(update);
    observer.observe(container);
    if (container.parentElement) observer.observe(container.parentElement);
    window.addEventListener('resize', update);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [map]);

  return null;
}
