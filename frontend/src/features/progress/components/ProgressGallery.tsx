import { mediaUrl } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { ProgressUpdate } from '@/features/orders/types/order.types';

export function ProgressGallery({ items }: { items: ProgressUpdate[] }) {
  const { t } = useI18n();
  if (!items.length) {
    return <p className="text-sm text-ink-400">{t('orders.progress.empty')}</p>;
  }

  return (
    <ol className="space-y-4">
      {items.map((item) => {
        const day = new Date(item.createdAt).toLocaleDateString(undefined, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        return (
          <li key={item.id} className="rounded-2xl border border-navy-800/8 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-copper-600">
                {labeled(t, 'orders.progressStatus', item.status)}
              </p>
              <p className="text-xs text-ink-400">{day}</p>
            </div>
            {item.description ? <p className="mt-2 text-sm text-ink-600">{item.description}</p> : null}
            {item.images.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {item.images.map((src: string) => (
                  <img
                    key={src}
                    src={mediaUrl(src)}
                    alt=""
                    className="h-28 w-full rounded-xl object-cover"
                  />
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
