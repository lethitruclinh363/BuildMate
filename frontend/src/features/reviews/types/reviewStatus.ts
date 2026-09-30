export function ratingLabelKey(rating: number) {
  if (rating >= 5) return 'five';
  if (rating >= 4) return 'four';
  if (rating >= 3) return 'three';
  if (rating >= 2) return 'two';
  return 'one';
}
