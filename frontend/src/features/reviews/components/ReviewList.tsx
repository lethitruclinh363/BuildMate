import { itemListClass, ListRow } from '@/components/ui/surfaces';
import { useI18n } from '@/locales';
import { StarRating } from './StarRating';
import type { Review, ReviewTargetType } from '../types/review.types';

const VISIBLE_TARGETS = new Set<ReviewTargetType>(['CONTRACTOR', 'MATERIAL_STORE']);

export function ReviewList({ items }: { items: Review[] }) {
  const { locale, t } = useI18n();
  const tag = locale === 'en' ? 'en-US' : 'vi-VN';
  const visible = items.filter((row) => VISIBLE_TARGETS.has(row.targetType));
  return (
    <div className={itemListClass}>
      {visible.map((row) => (
        <ListRow key={row.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-copper-600">
                {t(`review.target.${row.targetType}`)}
              </p>
              <StarRating value={row.rating} readOnly />
            </div>
            <p className="text-xs text-ink-400">{new Date(row.createdAt).toLocaleDateString(tag)}</p>
          </div>
          {row.comment ? <p className="mt-3 text-sm leading-6 text-ink-600">{row.comment}</p> : null}
        </ListRow>
      ))}
    </div>
  );
}
