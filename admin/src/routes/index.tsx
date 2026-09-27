import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnly, ProtectedRoute, RoleGuard } from '@/auth/ProtectedRoute';
import { AdminLoginPage } from '@/pages/login/AdminLoginPage';
import { AdminLayout } from '@/layouts/AdminLayout';
import { AdminDashboardPage } from '@/pages/dashboard/AdminDashboardPage';
import { AdminUserManagementPage } from '@/pages/users/AdminUserManagementPage';
import { UserDetailPage } from '@/users/UserDetailPage';
import { ContractorsPage, MaterialStoresPage } from '@/contractors/ContractorsPage';
import { AdminVerificationPage } from '@/pages/verification/AdminVerificationPage';
import { OrdersPage } from '@/orders/OrdersPage';
import { OrderDetailPage } from '@/orders/OrderDetailPage';
import { PaymentsPage } from '@/payments/PaymentsPage';
import { CommissionPage } from '@/commissions/CommissionPage';
import { ReviewsPage } from '@/reviews/ReviewsPage';
import { ComplaintsPage } from '@/complaints/ComplaintsPage';
import { ComplaintDetailPage } from '@/complaints/ComplaintDetailPage';
import { AnalyticsPage } from '@/analytics/AnalyticsPage';
import { AuditPage } from '@/audit/AuditPage';
import { SettingsPage } from '@/settings/SettingsPage';
import { ForbiddenPage } from '@/components/ForbiddenPage';
import { NotFoundPage } from '@/components/NotFoundPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<AdminLoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<RoleGuard />}>
          <Route element={<AdminLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<AdminDashboardPage />} />
            <Route path="/users" element={<AdminUserManagementPage />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/contractors" element={<ContractorsPage />} />
            <Route path="/material-stores" element={<MaterialStoresPage />} />
            <Route path="/verification" element={<AdminVerificationPage />} />
            <Route path="/verifications" element={<Navigate to="/verification" replace />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/commission" element={<CommissionPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/complaints" element={<ComplaintsPage />} />
            <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
