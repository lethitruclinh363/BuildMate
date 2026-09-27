import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { labeled, useI18n } from '@/locales';
import { StarRating } from './StarRating';
import { ratingLabelKey } from '../types/reviewStatus';

export function ReviewForm({
  title,
  onSubmit,
  busy,
}: {
  title: string;
  onSubmit: (payload: { rating: number; comment: string }) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ rating, comment });
      }}
    >
      <div>
        <p className="mb-2 text-sm font-medium text-navy-800">{title}</p>
        <StarRating value={rating} onChange={setRating} />
        <p className="mt-2 text-sm text-ink-500">{labeled(t, 'stars', ratingLabelKey(rating))}</p>
      </div>
      <TextArea label={t('review.comment')} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      <Button type="submit" variant="copper" loading={busy} className="w-full">
        {t('review.submit')}
      </Button>
    </form>
  );
}
