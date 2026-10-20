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
import { EscrowPage } from '@/finance/EscrowPage';
import { CommissionPage } from '@/commissions/CommissionPage';
import { ReviewsPage } from '@/reviews/ReviewsPage';
import { ComplaintsPage } from '@/complaints/ComplaintsPage';
import { ComplaintDetailPage } from '@/complaints/ComplaintDetailPage';
import { AnalyticsPage } from '@/analytics/AnalyticsPage';
import { AuditPage } from '@/audit/AuditPage';
import { SettingsPage } from '@/settings/SettingsPage';
import { PolicyListPage } from '@/policies/PolicyListPage';
import { PolicyFormPage } from '@/policies/PolicyFormPage';
import { PolicyDetailPage } from '@/policies/PolicyDetailPage';
import { PolicyHistoryPage } from '@/policies/PolicyHistoryPage';
import { ForbiddenPage } from '@/components/ForbiddenPage';
import { NotFoundPage } from '@/components/NotFoundPage';
import { ServiceCatalogPage } from '@/pages/catalog/ServiceCatalogPage';
import { AdminNotificationsPage } from '@/pages/notifications/AdminNotificationsPage';

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
            <Route path="/partners/contractors" element={<AdminVerificationPage actor="CONTRACTOR" />} />
            <Route path="/partners/stores" element={<AdminVerificationPage actor="MATERIAL_STORE_OWNER" />} />
            <Route path="/verification" element={<Navigate to="/partners/contractors" replace />} />
            <Route path="/verifications" element={<Navigate to="/partners/contractors" replace />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/services" element={<ServiceCatalogPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/escrow" element={<EscrowPage />} />
            <Route path="/commission" element={<CommissionPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/complaints" element={<ComplaintsPage />} />
            <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/notifications" element={<AdminNotificationsPage />} />
            <Route path="/policies" element={<PolicyListPage />} />
            <Route path="/policies/new" element={<PolicyFormPage mode="create" />} />
            <Route path="/policies/:id/edit" element={<PolicyFormPage mode="edit" />} />
            <Route path="/policies/:id/history" element={<PolicyHistoryPage />} />
            <Route path="/policies/:id" element={<PolicyDetailPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
