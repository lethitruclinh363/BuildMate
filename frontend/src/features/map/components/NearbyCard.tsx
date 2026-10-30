import { ContractorCard } from '@/features/map/components/ContractorCard';
import { MaterialStoreCard } from '@/features/map/components/MaterialStoreCard';
import type { LatLng } from '@/features/map/lib/location';
import type { NearbyPlace } from '@/types/marketplace';

/** Giữ chỗ gọi cũ: đội thợ và cửa hàng không còn dùng chung nút. */
export function NearbyCard({
  place,
  kind,
  active,
  onHover,
  origin,
}: {
  place: NearbyPlace;
  kind: 'contractor' | 'store';
  active?: boolean;
  onHover?: () => void;
  origin?: LatLng | null;
}) {
  if (kind === 'store') {
    return <MaterialStoreCard place={place} active={active} onHover={onHover} origin={origin} />;
  }
  return <ContractorCard place={place} active={active} onHover={onHover} origin={origin} />;
}
