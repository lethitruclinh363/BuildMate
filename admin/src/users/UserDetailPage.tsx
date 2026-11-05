import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Lock,
  Unlock,
  AlertTriangle,
  X,
  Shield,
  Clock,
  Building2,
  Store as StoreIcon,
} from 'lucide-react';
import { AdminBackButton } from '@/components/AdminBackButton';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/auth/auth.store';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
    const currentAdmin = useAuthStore((s) => s.user);

  const { data, loading, error, reload } = useAsync(async () => adminApi.getUser(id), [id]);

  // Modal State
  const [activeModal, setActiveModal] = useState<'lock' | 'unlock' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || t('customers.missing')} onRetry={reload} />;

  const { user, partnerProfile, store, counts, auditHistory } = data;
  const isSelf = currentAdmin?.id === user.id || (user.numericId && currentAdmin?.id === user.numericId);
  const isAdmin = user.role === 'ADMIN';
  const isBlocked = user.status === 'BLOCKED' || user.status === 'BANNED';

  const roleTone = (r: string) => {
    if (r === 'ADMIN') return 'purple';
    if (r === 'CONTRACTOR') return 'copper';
    if (r === 'MATERIAL_STORE_OWNER') return 'warn';
    return 'navy';
  };

  const statusTone = (st: string) => {
    if (st === 'ACTIVE') return 'success';
    if (st === 'BLOCKED' || st === 'BANNED') return 'danger';
    return 'warn';
  };

  const closeModal = () => {
    if (submitting) return;
    setActiveModal(null);
    setActionReason('');
    setModalError(null);
  };

  const handleConfirmAction = async () => {
    if (submitting) return;
    setSubmitting(true);
    setModalError(null);
    try {
      if (activeModal === 'lock') {
        const res = await adminApi.lockUser(user.id, actionReason.trim());
        setToastMessage(t('usersPage.lockSuccess') || res.message);
      } else if (activeModal === 'unlock') {
        const res = await adminApi.unlockUser(user.id, actionReason.trim());
        setToastMessage(t('usersPage.unlockSuccess') || res.message);
      }
      closeModal();
      reload();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setModalError(
        err?.response?.data?.message ||
          err?.message ||
          (activeModal === 'lock' ? t('usersPage.lockError') : t('usersPage.unlockError'))
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <AdminBackButton fallback="/users" label={t('customers.back') || 'Quay lại danh sách'} />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 shadow-sm animate-fade-in">
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <PageHeader
        eyebrow={t('customers.record') || 'Hồ sơ người dùng'}
        title={user.fullName || user.name}
        description={user.email}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={roleTone(user.role)}>{user.role}</Badge>
            <Badge tone={statusTone(user.status)}>{user.status}</Badge>

            {!isAdmin && !isSelf && (
              <>
                {isBlocked ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setActionReason('');
                      setModalError(null);
                      setActiveModal('unlock');
                    }}
                    className="ml-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Unlock className="h-4 w-4" />
                    <span>{t('usersPage.btnUnlock') || 'Mở khóa'}</span>
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setActionReason('');
                      setModalError(null);
                      setActiveModal('lock');
                    }}
                    className="ml-2"
                  >
                    <Lock className="h-4 w-4" />
                    <span>{t('usersPage.btnLock') || 'Khóa tài khoản'}</span>
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* User Information Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Profile Info */}
        <GlassCard className="lg:col-span-2 space-y-3 text-sm text-[#16283C]">
          <h3 className="font-display text-base font-bold text-[#16283C] border-b pb-2">Thông tin tài khoản</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Mã tài khoản (ID):</p>
              <p className="font-mono text-xs font-semibold text-gray-800">{user.id}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Số điện thoại:</p>
              <p className="font-semibold text-gray-800">{user.phone || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Trạng thái tài khoản:</p>
              <div className="mt-0.5">
                <Badge tone={statusTone(user.status)}>{user.status}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Email xác thực:</p>
              <p className="font-semibold text-gray-800">{user.emailVerified ? 'Đã xác thực' : 'Chưa xác thực'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Ngày đăng ký:</p>
              <p className="font-semibold text-gray-800">{formatDate(user.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Phiên bảo mật (Token Version):</p>
              <p className="font-mono text-xs font-semibold text-gray-800">{user.tokenVersion ?? 0}</p>
            </div>
          </div>
        </GlassCard>

        {/* Counts summary card */}
        <GlassCard className="space-y-4">
          <h3 className="font-display text-base font-bold text-[#16283C] border-b pb-2">Hoạt động nền tảng</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.16em] text-[#526477]">Đơn sửa chữa:</span>
              <span className="font-display text-xl font-bold text-[#16283C]">{counts?.repairOrders ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.16em] text-[#526477]">Khiếu nại liên quan:</span>
              <span className="font-display text-xl font-bold text-[#16283C]">{counts?.complaints ?? 0}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Partner or Store Details if applicable */}
      {(partnerProfile || store) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {partnerProfile && (
            <GlassCard className="space-y-3">
              <div className="flex items-center gap-2 border-b pb-2">
                <Building2 className="h-4 w-4 text-[#2B6280]" />
                <h3 className="font-display text-base font-bold text-[#16283C]">Hồ sơ đối tác sửa chữa</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm text-[#16283C]">
                <div>
                  <p className="text-xs text-gray-500">Tên kinh doanh:</p>
                  <p className="font-semibold">{partnerProfile.business_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Mã số thuế:</p>
                  <p className="font-semibold">{partnerProfile.tax_code || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Trạng thái duyệt:</p>
                  <Badge tone={partnerProfile.verification_status === 'APPROVED' ? 'success' : 'warn'}>
                    {partnerProfile.verification_status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Hoạt động (Live):</p>
                  <Badge tone={partnerProfile.is_live ? 'success' : 'navy'}>
                    {partnerProfile.is_live ? 'LIVE' : 'PAUSED'}
                  </Badge>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-500">Địa chỉ hoạt động:</p>
                  <p className="font-medium text-xs">{partnerProfile.address ? `${partnerProfile.address}, ${partnerProfile.city}` : partnerProfile.city || '—'}</p>
                </div>
              </div>
            </GlassCard>
          )}

          {store && (
            <GlassCard className="space-y-3">
              <div className="flex items-center gap-2 border-b pb-2">
                <StoreIcon className="h-4 w-4 text-[#2B6280]" />
                <h3 className="font-display text-base font-bold text-[#16283C]">Thông tin cửa hàng vật liệu</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm text-[#16283C]">
                <div>
                  <p className="text-xs text-gray-500">Tên cửa hàng:</p>
                  <p className="font-semibold">{store.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Loại hình:</p>
                  <Badge tone="copper">{store.store_type}</Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Hotline:</p>
                  <p className="font-semibold">{store.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Kinh doanh:</p>
                  <Badge tone={store.is_active ? 'success' : 'navy'}>
                    {store.is_active ? 'ACTIVE' : 'PAUSED'}
                  </Badge>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Audit Log / History Section */}
      <div className="mt-8">
        <GlassCard>
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#2B6280]" />
              <h3 className="font-display text-base font-bold text-[#16283C]">
                {t('usersPage.auditHistoryTitle') || 'Lịch sử khóa / mở khóa & thao tác'}
              </h3>
            </div>
            <span className="text-xs text-gray-500">{auditHistory?.length || 0} bản ghi</span>
          </div>

          {!auditHistory || auditHistory.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 italic">
              {t('usersPage.noAudit') || 'Chưa có lịch sử thao tác cho tài khoản này'}
            </p>
          ) : (
            <div className="space-y-3">
              {auditHistory.map((item) => {
                const isLock = item.action === 'ADMIN_LOCK_USER';
                const isUnlock = item.action === 'ADMIN_UNLOCK_USER';
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`grid h-6 w-6 place-items-center rounded-lg mt-0.5 shrink-0 ${
                          isLock
                            ? 'bg-rose-100 text-rose-700'
                            : isUnlock
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {isLock ? <Lock className="h-3 w-3" /> : isUnlock ? <Unlock className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">
                            {isLock ? 'Khóa tài khoản' : isUnlock ? 'Mở khóa tài khoản' : item.action}
                          </span>
                          {item.actor && (
                            <span className="text-gray-500">
                              bởi <strong className="text-gray-700">{item.actor.name || item.actor.email}</strong> ({item.actor.role})
                            </span>
                          )}
                        </div>
                        {item.meta?.reason && (
                          <p className="mt-1 text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 inline-block">
                            Lý do: <em>{String(item.meta.reason)}</em>
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-400 font-mono text-[11px] shrink-0">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Confirmation Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div
                  className={`grid h-8 w-8 place-items-center rounded-xl ${
                    activeModal === 'lock' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                  }`}
                >
                  {activeModal === 'lock' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </div>
                <h3 className="font-display text-base font-bold text-[#16283C]">
                  {activeModal === 'lock' ? t('usersPage.lockModalTitle') : t('usersPage.unlockModalTitle')}
                </h3>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                {activeModal === 'lock' ? t('usersPage.lockModalDesc') : t('usersPage.unlockModalDesc')}
              </p>

              {/* User info snippet */}
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tài khoản:</span>
                  <span className="font-semibold text-gray-800">{user.fullName || user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email:</span>
                  <span className="font-mono text-gray-800">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Trạng thái hiện tại:</span>
                  <Badge tone={statusTone(user.status)}>{user.status}</Badge>
                </div>
              </div>

              {/* Reason input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('usersPage.reasonLabel') || 'Lý do (tùy chọn)'}
                </label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={t('usersPage.reasonPlaceholder') || 'Nhập lý do thực hiện...'}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-800 focus:border-[#2B6280] focus:ring-1 focus:ring-[#2B6280] focus:outline-none"
                  maxLength={500}
                />
              </div>

              {/* Modal Error */}
              {modalError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <Button variant="ghost" onClick={closeModal} disabled={submitting}>
                {t('usersPage.btnCancel') || 'Hủy'}
              </Button>
              <Button
                variant={activeModal === 'lock' ? 'danger' : 'primary'}
                loading={submitting}
                onClick={handleConfirmAction}
              >
                {activeModal === 'lock'
                  ? t('usersPage.btnConfirmLock') || 'Xác nhận khóa'
                  : t('usersPage.btnConfirmUnlock') || 'Xác nhận mở khóa'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
