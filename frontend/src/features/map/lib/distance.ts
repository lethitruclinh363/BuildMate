export function formatDistance(meters: number | null | undefined) {
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(2)} km`;
}
