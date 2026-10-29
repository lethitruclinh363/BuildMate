import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminBackButton } from '@/components/AdminBackButton';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { formatDate, paymentStatusLabel, vnd, mediaUrl } from '@/lib/utils';

export function AdminMaterialOrderDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  
  const { data: order, loading, error, reload } = useAsync(async () => {
    return adminApi.getMaterialOrder(id);
  }, [id]);

  if (loading) return <Spinner />;
  if (error || !order) return <ErrorState body={error || undefined} onRetry={reload} />;

  const materialStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      PENDING_PAYMENT: 'Chờ thanh toán',
      PENDING_CONFIRMATION: 'Chờ xác nhận',
      DEPOSIT_PAID: 'Đã cọc',
      CONFIRMED: 'Đã xác nhận',
      PREPARING: 'Đang chuẩn bị',
      READY_FOR_DELIVERY: 'Sẵn sàng giao',
      DELIVERING: 'Đang giao',
      DELIVERED: 'Đã giao',
      CUSTOMER_RECEIVED: 'Khách đã nhận',
      COMPLETED: 'Hoàn thành',
      CANCELLED: 'Đã hủy',
    };
    return map[s] || s;
  };

  const getStatusTone = (s: string) => {
    if (s === 'COMPLETED') return 'success';
    if (s === 'CANCELLED') return 'danger';
    if (['DELIVERING', 'DELIVERED', 'CUSTOMER_RECEIVED'].includes(s)) return 'info';
    return 'warn';
  };

  return (
    <div>
      <AdminBackButton fallback="/material-orders" label={t('nav.materialOrders')} />
      <PageHeader
        eyebrow={order.orderCode}
        title={`Đơn hàng vật liệu ${order.orderCode}`}
        description="Chi tiết giao dịch và trạng thái vận chuyển vật liệu."
        actions={
          <Badge tone={getStatusTone(order.status)}>
            {materialStatusLabel(order.status)}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <GlassCard>
            <h3 className="mb-4 text-lg font-semibold text-white">Sản phẩm trong đơn</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white/60">
                    <th className="pb-3 pr-4 font-medium">Sản phẩm</th>
                    <th className="pb-3 pr-4 text-center font-medium">Số lượng</th>
                    <th className="pb-3 pr-4 text-right font-medium">Đơn giá</th>
                    <th className="pb-3 text-right font-medium">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {order.items.map((item, idx) => (
                    <tr key={idx} className="text-white">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          {item.imageSnapshot && (
                            <img
                              src={mediaUrl(item.imageSnapshot)}
                              alt={item.nameSnapshot}
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium">{item.nameSnapshot}</p>
                            <p className="text-xs text-white/40">{item.unitSnapshot}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-center">
                        {Number(item.quantity)}
                      </td>
                      <td className="py-4 pr-4 text-right">
                        {vnd(Number(item.priceSnapshot))}
                      </td>
                      <td className="py-4 text-right font-medium">
                        {vnd(Number(item.lineTotal))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 space-y-2 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between text-white/60">
                <span>Tạm tính vật liệu:</span>
                <span className="text-white">{vnd(Number(order.materialSubtotal))}</span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>Phí vận chuyển ({order.distanceKm} km):</span>
                <span className="text-white">{vnd(Number(order.shippingFee))}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-white pt-2">
                <span>Tổng tiền thanh toán:</span>
                <span className="text-[#8FB1CA]">{vnd(Number(order.totalAmount))}</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="mb-4 text-lg font-semibold text-white">Lịch sử trạng thái</h3>
            <div className="space-y-4">
              {order.statusHistory.map((h, idx) => (
                <div key={idx} className="relative flex gap-4 pl-6">
                  {idx !== order.statusHistory.length - 1 && (
                    <div className="absolute left-[7px] top-6 bottom-0 w-[2px] bg-white/10" />
                  )}
                  <div className="absolute left-0 top-[6px] h-[14px] w-[14px] rounded-full border-2 border-[#2B6280] bg-[#102D3D]" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {materialStatusLabel(h.status)}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-white/40">
                        {h.actorRole}
                      </span>
                    </div>
                    <p className="text-xs text-white/60">{formatDate(h.createdAt)}</p>
                    {h.note && (
                      <p className="mt-1 text-sm text-white/80 bg-white/5 rounded p-2 italic">
                        "{h.note}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard>
            <h3 className="mb-4 text-lg font-semibold text-white">Thông tin giao hàng</h3>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-white/40 mb-1">Địa chỉ nhận hàng:</p>
                <p className="text-white font-medium">{order.deliveryAddress}</p>
              </div>
              <div>
                <p className="text-white/40 mb-1">Ghi chú từ khách hàng:</p>
                <p className="text-white">{order.customerNote || 'Không có ghi chú'}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="mb-4 text-lg font-semibold text-white">Đối tác liên quan</h3>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-white/40 mb-1">Khách hàng:</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium">{order.customer?.name || 'Unknown'}</p>
                  <span className="text-[10px] text-white/40 font-mono">({order.customerId})</span>
                </div>
              </div>
              <div>
                <p className="text-white/40 mb-1">Cửa hàng vật liệu:</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium">{order.storeName || 'Unknown'}</p>
                  <span className="text-[10px] text-white/40 font-mono">({order.storeId})</span>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="mb-4 text-lg font-semibold text-white">Thanh toán COD</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Trạng thái thanh toán:</span>
                <Badge tone={order.paymentStatus === 'PAID' ? 'success' : 'warn'}>
                  {paymentStatusLabel(order.paymentStatus)}
                </Badge>
              </div>
              {order.remainingSettledAt && (
                <div className="text-xs text-white/40 text-right">
                  Xác nhận lúc: {formatDate(order.remainingSettledAt)}
                </div>
              )}
              <div className="rounded-lg bg-white/5 p-3 text-xs text-white/60 leading-relaxed">
                Đơn hàng vật liệu sử dụng phương thức COD. BuildMate không thu phí nền tảng (0% commission) và không giữ tiền qua Escrow.
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
