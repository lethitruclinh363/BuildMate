import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Search,
  Lock,
  Unlock,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { formatDate } from '@/lib/utils';
import { useReturnState } from '@/lib/navigation';
import { useAuthStore } from '@/auth/auth.store';
import type { AdminUserAccount, AdminUsersPayload } from '@/types/admin';

export function AdminUserManagementPage() {
  const { t } = useTranslation();
  const back = useReturnState();
  const currentAdmin = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();

  const urlRole = searchParams.get('role') || 'ALL';
  const urlStatus = searchParams.get('status') || 'ALL';
  const urlPage = Number(searchParams.get('page')) || 1;
  const urlKeyword = searchParams.get('q') || '';

  const [keyword, setKeyword] = useState(urlKeyword);
  const [debouncedKeyword, setDebouncedKeyword] = useState(urlKeyword);
  const [role, setRole] = useState(urlRole);
  const [status, setStatus] = useState(urlStatus);
  const [page, setPage] = useState(urlPage);

  const [payload, setPayload] = useState<AdminUsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [activeModal, setActiveModal] = useState<'lock' | 'unlock' | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserAccount | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const debounceTimer = useRef<number>(0);

  // Debounce search input
  useEffect(() => {
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(debounceTimer.current);
  }, [keyword]);

  // Sync to URL
  useEffect(() => {
    const next = new URLSearchParams();
    if (role !== 'ALL') next.set('role', role);
    if (status !== 'ALL') next.set('status', status);
    if (debouncedKeyword) next.set('q', debouncedKeyword);
    if (page > 1) next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [role, status, debouncedKeyword, page, setSearchParams]);

  // Fetch users
  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listUsers({
        page,
        limit: 15,
        role: role !== 'ALL' ? role : undefined,
        status: status !== 'ALL' ? status : undefined,
        keyword: debouncedKeyword || undefined,
      });
      setPayload(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [page, role, status, debouncedKeyword]);

  const openLockModal = (user: AdminUserAccount) => {
    setSelectedUser(user);
    setActionReason('');
    setModalError(null);
    setActiveModal('lock');
  };

  const openUnlockModal = (user: AdminUserAccount) => {
    setSelectedUser(user);
    setActionReason('');
    setModalError(null);
    setActiveModal('unlock');
  };

  const closeModal = () => {
    if (submitting) return;
    setActiveModal(null);
    setSelectedUser(null);
    setActionReason('');
    setModalError(null);
  };

  const handleConfirmAction = async () => {
    if (!selectedUser || submitting) return;
    setSubmitting(true);
    setModalError(null);
    try {
      if (activeModal === 'lock') {
        const res = await adminApi.lockUser(selectedUser.id, actionReason.trim());
        setToastMessage(t('usersPage.lockSuccess') || res.message);
      } else if (activeModal === 'unlock') {
        const res = await adminApi.unlockUser(selectedUser.id, actionReason.trim());
        setToastMessage(t('usersPage.unlockSuccess') || res.message);
      }
      closeModal();
      loadUsers();
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

  const roleTone = (r: string) => {
    if (r === 'ADMIN') return 'purple';
    if (r === 'CONTRACTOR') return 'copper';
    if (r === 'MATERIAL_STORE_OWNER') return 'warn';
    return 'navy';
  };

  const roleText = (r: string) => {
    if (r === 'CUSTOMER') return t('usersPage.roleCustomer') || 'Khách hàng';
    if (r === 'CONTRACTOR') return t('usersPage.roleContractor') || 'Chủ đội thợ';
    if (r === 'MATERIAL_STORE_OWNER') return t('usersPage.roleStore') || 'Cửa hàng vật liệu';
    if (r === 'ADMIN') return t('usersPage.roleAdmin') || 'Quản trị viên';
    return r;
  };

  const statusTone = (st: string) => {
    if (st === 'ACTIVE') return 'success';
    if (st === 'BLOCKED' || st === 'BANNED') return 'danger';
    return 'warn';
  };

  const statusText = (st: string) => {
    if (st === 'ACTIVE') return t('usersPage.statusActive') || 'Đang hoạt động';
    if (st === 'BLOCKED') return t('usersPage.statusBlocked') || 'Đã khóa';
    if (st === 'BANNED') return 'Bị cấm';
    if (st === 'PENDING_EMAIL') return 'Chờ email';
    return st;
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('usersPage.eyebrow')}
        title={t('usersPage.title')}
        description={t('usersPage.subtitle')}
      />

      {/* Toast message notification */}
      {toastMessage && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 shadow-sm animate-fade-in">
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPI Stats */}
      <div className="mb-6 grid gap-4 grid-cols-2 sm:grid-cols-4">
        <StatCard label={t('usersPage.statTotal') || 'Tổng người dùng'} value={payload?.stats?.total ?? '—'} />
        <StatCard label={t('usersPage.statActive') || 'Đang hoạt động'} value={payload?.stats?.active ?? '—'} />
        <StatCard label={t('usersPage.statBlocked') || 'Đã bị khóa'} value={payload?.stats?.blocked ?? '—'} />
        <StatCard label={t('usersPage.statusPending') || 'Chờ xác thực'} value={payload?.stats?.pending ?? '—'} />
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-[#E1E7ED] bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('usersPage.searchPlaceholder') || 'Tìm theo tên, email hoặc SĐT...'}
            className="w-full rounded-xl border border-[#D5DDE5] bg-white py-2 pl-9 pr-8 text-sm text-[#16283C] placeholder:text-gray-400 focus:border-[#2B6280] focus:outline-none focus:ring-1 focus:ring-[#2B6280]"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Role select */}
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-[#D5DDE5] bg-white px-3 py-2 text-sm text-[#16283C] shadow-sm focus:border-[#2B6280] focus:outline-none"
          >
            <option value="ALL">{t('usersPage.roleAll') || 'Tất cả vai trò'}</option>
            <option value="CUSTOMER">{t('usersPage.roleCustomer') || 'Khách hàng'}</option>
            <option value="CONTRACTOR">{t('usersPage.roleContractor') || 'Chủ đội thợ'}</option>
            <option value="MATERIAL_STORE_OWNER">{t('usersPage.roleStore') || 'Cửa hàng vật liệu'}</option>
            <option value="ADMIN">{t('usersPage.roleAdmin') || 'Quản trị viên'}</option>
          </select>

          {/* Status select */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-[#D5DDE5] bg-white px-3 py-2 text-sm text-[#16283C] shadow-sm focus:border-[#2B6280] focus:outline-none"
          >
            <option value="ALL">{t('usersPage.statusAll') || 'Tất cả trạng thái'}</option>
            <option value="ACTIVE">{t('usersPage.statusActive') || 'Đang hoạt động'}</option>
            <option value="BLOCKED">{t('usersPage.statusBlocked') || 'Đã khóa'}</option>
            <option value="PENDING_EMAIL">{t('usersPage.statusPending') || 'Chờ xác thực'}</option>
          </select>

          {/* Reset Filters */}
          {(role !== 'ALL' || status !== 'ALL' || debouncedKeyword) && (
            <button
              type="button"
              onClick={() => {
                setRole('ALL');
                setStatus('ALL');
                setKeyword('');
                setDebouncedKeyword('');
                setPage(1);
              }}
              className="text-xs font-semibold text-[#2B6280] hover:underline px-2"
            >
              {t('usersPage.btnCancel') || 'Đặt lại'}
            </button>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      {loading ? (
        <div className="py-12">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorState body={error} onRetry={loadUsers} />
      ) : (
        <>
          <DataTable
            columns={[
              t('usersPage.colUser') || 'Người dùng',
              t('usersPage.colRole') || 'Vai trò',
              t('usersPage.colAccountStatus') || 'Trạng thái TK',
              t('usersPage.colPartnerStatus') || 'Trạng thái đối tác',
              t('usersPage.colJoined') || 'Ngày tham gia',
              t('usersPage.colActions') || 'Thao tác',
            ]}
            empty={<EmptyState icon={<Users className="h-5 w-5" />} title={t('usersPage.empty') || 'Không tìm thấy người dùng phù hợp'} />}
            rows={(payload?.items || []).map((u) => {
              const isSelf = currentAdmin?.id === u.id || (u.numericId && currentAdmin?.id === u.numericId);
              const isAdmin = u.role === 'ADMIN';
              const isBlocked = u.status === 'BLOCKED' || u.status === 'BANNED';

              // Partner details representation
              let partnerSummary = '—';
              if (u.partnerStatus) {
                partnerSummary = `${u.partnerStatus.businessName || 'Thợ'} (${u.partnerStatus.verificationStatus || 'DRAFT'}${u.partnerStatus.isLive ? ' · LIVE' : ''})`;
              } else if (u.storeStatus) {
                partnerSummary = `${u.storeStatus.storeName || 'Cửa hàng'} (${u.storeStatus.isActive ? 'LIVE' : 'PAUSED'})`;
              }

              return [
                <div key={`${u.id}-info`} className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-[#EBF3F7] text-[#173B4F] font-bold grid place-items-center text-sm shrink-0">
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      (u.name || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-[#16283C]">{u.name || '—'}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                    {u.phone && <p className="text-xs text-gray-400">{u.phone}</p>}
                  </div>
                </div>,

                <Badge key={`${u.id}-role`} tone={roleTone(u.role)}>
                  {roleText(u.role)}
                </Badge>,

                <Badge key={`${u.id}-status`} tone={statusTone(u.status)}>
                  {statusText(u.status)}
                </Badge>,

                <span key={`${u.id}-partner`} className="text-xs text-[#526477]">
                  {partnerSummary}
                </span>,

                <span key={`${u.id}-date`} className="text-xs text-gray-500">
                  {formatDate(u.createdAt)}
                </span>,

                <div key={`${u.id}-act`} className="flex items-center gap-2">
                  <Link
                    to={`/users/${u.id}`}
                    state={back}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-[#2B6280] hover:bg-[#EBF3F7] hover:underline"
                  >
                    {t('usersPage.btnView') || 'Chi tiết'}
                  </Link>

                  {/* Lock / Unlock actions */}
                  {!isAdmin && !isSelf && (
                    <>
                      {isBlocked ? (
                        <button
                          type="button"
                          onClick={() => openUnlockModal(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-xs hover:bg-emerald-100 transition"
                        >
                          <Unlock className="h-3 w-3" />
                          <span>{t('usersPage.btnUnlock') || 'Mở khóa'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openLockModal(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-xs hover:bg-rose-100 transition"
                        >
                          <Lock className="h-3 w-3" />
                          <span>{t('usersPage.btnLock') || 'Khóa'}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>,
              ];
            })}
          />

          {/* Pagination */}
          {payload && payload.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 px-2">
              <span className="text-xs text-gray-500">
                {t('usersPage.pageInfo', {
                  page: payload.page,
                  totalPages: payload.totalPages,
                  total: payload.total,
                }) || `Trang ${payload.page} / ${payload.totalPages} (Tổng ${payload.total})`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={payload.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>{t('usersPage.prev') || 'Trước'}</span>
                </Button>
                <Button
                  variant="outline"
                  disabled={payload.page >= payload.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1 text-xs"
                >
                  <span>{t('usersPage.next') || 'Sau'}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal */}
      {activeModal && selectedUser && (
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

              {/* Target User Info Summary */}
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tên người dùng:</span>
                  <span className="font-semibold text-gray-800">{selectedUser.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email:</span>
                  <span className="font-mono text-gray-800">{selectedUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Vai trò:</span>
                  <span className="font-semibold text-gray-800">{roleText(selectedUser.role)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Trạng thái hiện tại:</span>
                  <Badge tone={statusTone(selectedUser.status)}>{statusText(selectedUser.status)}</Badge>
                </div>
              </div>

              {/* Reason Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('usersPage.reasonLabel') || 'Lý do (tùy chọn)'}
                </label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={t('usersPage.reasonPlaceholder') || 'Nhập lý do thực hiện thao tác...'}
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
