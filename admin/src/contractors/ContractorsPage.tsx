// ContractorsPage và MaterialStoresPage là các trang danh sách đối tác (chủ đội thợ và cửa hàng vật liệu) trong hệ thống quản trị. 
// Chúng sử dụng cùng một component PartnerDirectoryPage để hiển thị dữ liệu dựa trên vai trò của đối tác.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Store } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import type { PartnerApplication } from '@/types/admin';

// Màu trạng thái của đối tác
const tone: Record<string, 'success' | 'warn' | 'danger' | 'navy'> = {
  APPROVED: 'success',
  SUBMITTED: 'warn',
  REJECTED: 'danger',
  DRAFT: 'navy',
};

function PartnerDirectoryPage({
  role,
}: {
  role: 'CONTRACTOR' | 'MATERIAL_STORE_OWNER';
}) {
  const { t } = useTranslation();

  // Xác định loại đối tác
  const copy = role === 'CONTRACTOR' ? 'crew' : 'store';

  // Đường dẫn đến trang xét duyệt
  const queue =
    role === 'CONTRACTOR'
      ? '/partners/contractors'
      : '/partners/stores';

  // Lấy danh sách hồ sơ
  const { data, loading, error, reload } = useAsync(
    () => adminApi.listVerifications(),
    []
  );

  // Hiển thị khi đang tải dữ liệu
  if (loading) {
    return <Spinner />;
  }

  // Hiển thị lỗi nếu không lấy được dữ liệu
  if (error || !data) {
    return <ErrorState body={error || undefined} onRetry={reload} />;
  }

  // Lọc đối tác theo vai trò
  const rows = data.filter(
    (row: PartnerApplication) => row.user?.role === role
  );

  return (
    <div className="[&_h1]:!text-black [&_h2]:!text-black [&_p]:!text-black [&_th]:!text-black [&_td]:!text-black [&_th_*]:!text-black [&_td_*]:!text-black">

      {/* Tiêu đề trang */}
      <PageHeader
        eyebrow={t(`partners.${copy}.eyebrow`)}
        title={t(`partners.${copy}.title`)}
        description={t(`partners.${copy}.subtitle`)}
        actions={
          <Link
            to={queue}
            className="rounded-xl bg-[#173B4F] px-4 py-2 text-sm font-semibold text-white"
          >
            {t('partners.openQueue')}
          </Link>
        }
      />

      {/* Bảng danh sách đối tác */}
      <DataTable
        columns={[
          t(`partners.${copy}.business`),
          t('partners.owner'),
          t('partners.city'),
          t('partners.status'),
          t('partners.actions'),
        ]}

        empty={
          <EmptyState
            icon={
              role === 'CONTRACTOR'
                ? <Building2 className="h-5 w-5" />
                : <Store className="h-5 w-5" />
            }
            title={t(`partners.${copy}.empty`)}
          />
        }

        rows={rows.map((row) => [
          // Tên đội thợ hoặc cửa hàng
          row.businessName || row.user?.name || '—',

          // Email
          row.user?.email || '—',

          // Thành phố
          row.city || '—',

          // Trạng thái hồ sơ
          <Badge
            key={row.id}
            tone={tone[row.verificationStatus] || 'navy'}
          >
            {row.verificationStatus}
          </Badge>,

          // Xem hồ sơ chi tiết
          <Link
            key={row.id}
            to={
              role === 'CONTRACTOR'
                ? `/contractors/${row.id}/profile`
                : `/material-stores/${row.id}/profile`
            }
            className="font-semibold text-black hover:underline"
          >
            {t('partners.profile')}
          </Link>,
        ])}
      />
    </div>
  );
}

// Trang danh sách chủ đội thợ
export function ContractorsPage() {
  return <PartnerDirectoryPage role="CONTRACTOR" />;
}

// Trang danh sách cửa hàng vật liệu
export function MaterialStoresPage() {
  return <PartnerDirectoryPage role="MATERIAL_STORE_OWNER" />;
}
