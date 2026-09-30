import { ContractorCard } from '@/features/map/components/ContractorCard';
import { MaterialStoreCard } from '@/features/map/components/MaterialStoreCard';
import type { NearbyPlace } from '@/types/marketplace';

/** Giữ chỗ gọi cũ: đội thợ và cửa hàng không còn dùng chung nút. */
export function NearbyCard({
  place,
  kind,
  active,
  onHover,
}: {
  place: NearbyPlace;
  kind: 'contractor' | 'store';
  active?: boolean;
  onHover?: () => void;
}) {
  if (kind === 'store') {
    return <MaterialStoreCard place={place} active={active} onHover={onHover} />;
  }
  return <ContractorCard place={place} active={active} onHover={onHover} />;
}
