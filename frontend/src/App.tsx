import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { CustomerLayout } from '@/components/layout/CustomerLayout';
import { ContractorLayout } from '@/components/layout/ContractorLayout';
import { MainLayout } from '@/components/layout/MainLayout';
import { ScreenLoader } from '@/components/motion/ScreenLoader';
import { LandingPage } from '@/pages/LandingPage';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import VerifyEmail from '@/pages/auth/VerifyEmail';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import StoreDashboard, { StoreLayout } from '@/pages/store/StoreDashboard';
import PartnerOnboardingPage from '@/pages/partner/PartnerOnboardingPage';
import PartnerStatusPage from '@/pages/partner/PartnerStatusPage';
import { CustomerSurface } from '@/routes/CustomerSurface';
import ProtectedRoute, { GuestOnly } from '@/routes/ProtectedRoute';
import { CustomerDashboardPage } from '@/pages/CustomerDashboardPage';
import { ContractorDashboardPage } from '@/pages/ContractorDashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const ContractorVerificationPage = lazy(() =>
  import('@/pages/contractor/ContractorVerificationPage').then((m) => ({ default: m.ContractorVerificationPage }))
);
const ContractorPublicProfilePage = lazy(() =>
  import('@/pages/contractor/ContractorPublicProfilePage').then((m) => ({ default: m.ContractorPublicProfilePage }))
);
const ContractorServicesPage = lazy(() =>
  import('@/pages/contractor/ContractorServicesPage').then((m) => ({ default: m.ContractorServicesPage }))
);
const StorePublicProfilePage = lazy(() =>
  import('@/pages/store/StorePublicProfilePage').then((m) => ({ default: m.StorePublicProfilePage }))
);
const StoreVerificationPage = lazy(() =>
  import('@/pages/store/StoreVerificationPage').then((m) => ({ default: m.StoreVerificationPage }))
);
const StoreMaterialsPage = lazy(() =>
  import('@/pages/store/StoreMaterialsPage').then((m) => ({ default: m.StoreMaterialsPage }))
);
const StoreProductDetailPage = lazy(() =>
  import('@/pages/store/StoreProductDetailPage').then((m) => ({ default: m.StoreProductDetailPage }))
);
const StoreCategoriesPage = lazy(() =>
  import('@/pages/store/StoreCategoriesPage').then((m) => ({ default: m.StoreCategoriesPage }))
);
const StoreReviewsPage = lazy(() => import('@/pages/store/StoreReviewsPage').then((m) => ({ default: m.StoreReviewsPage })));
const PaymentPage = lazy(() => import('@/features/payments/pages/PaymentPage').then((m) => ({ default: m.PaymentPage })));
const CustomerReviewsPage = lazy(() =>
  import('@/features/reviews/pages/CustomerReviewsPage').then((m) => ({ default: m.CustomerReviewsPage }))
);
const CustomerReviewPage = lazy(() =>
  import('@/features/reviews/pages/CustomerReviewPage').then((m) => ({ default: m.CustomerReviewPage }))
);
const ContractorReviewsPage = lazy(() =>
  import('@/features/reviews/pages/ContractorReviewsPage').then((m) => ({ default: m.ContractorReviewsPage }))
);

const CustomerComplaintsPage = lazy(() =>
  import('@/features/complaints/pages/CustomerComplaintsPage').then((m) => ({ default: m.CustomerComplaintsPage }))
);
const CustomerComplaintPage = lazy(() =>
  import('@/features/complaints/pages/CustomerComplaintPage').then((m) => ({ default: m.CustomerComplaintPage }))
);
const ContractorEarningsPage = lazy(() =>
  import('@/features/analytics/pages/ContractorEarningsPage').then((m) => ({ default: m.ContractorEarningsPage }))
);
const ExplorePage = lazy(() => import('@/pages/customer/ExplorePage').then((m) => ({ default: m.ExplorePage })));
const ContractorPublicPage = lazy(() =>
  import('@/pages/public/ContractorPublicPage').then((m) => ({ default: m.ContractorPublicPage }))
);
const StorePublicPage = lazy(() => import('@/pages/public/StorePublicPage').then((m) => ({ default: m.StorePublicPage })));
const PublicMaterialPage = lazy(() => import('@/pages/public/PublicMaterialPage').then((m) => ({ default: m.PublicMaterialPage })));
const CustomerMaterialListsPage = lazy(() =>
  import('@/pages/customer/CustomerMaterialListsPage').then((m) => ({ default: m.CustomerMaterialListsPage }))
);
const CustomerMaterialListPage = lazy(() =>
  import('@/pages/customer/CustomerMaterialListPage').then((m) => ({ default: m.CustomerMaterialListPage }))
);
const ChatPage = lazy(() => import('@/pages/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const CreateRepairRequestPage = lazy(() =>
  import('@/pages/customer/CreateRepairRequestPage').then((m) => ({ default: m.CreateRepairRequestPage }))
);
const RequestHistoryPage = lazy(() =>
  import('@/pages/customer/RequestHistoryPage').then((m) => ({ default: m.RequestHistoryPage }))
);
const CustomerQuotationPage = lazy(() =>
  import('@/pages/customer/CustomerQuotationPage').then((m) => ({ default: m.CustomerQuotationPage }))
);
const CustomerOrdersPage = lazy(() =>
  import('@/pages/customer/CustomerOrdersPage').then((m) => ({ default: m.CustomerOrdersPage }))
);
const CustomerOrderDetailPage = lazy(() =>
  import('@/pages/customer/CustomerOrderDetailPage').then((m) => ({ default: m.CustomerOrderDetailPage }))
);
const ContractorRequestsPage = lazy(() =>
  import('@/pages/contractor/ContractorRequestsPage').then((m) => ({ default: m.ContractorRequestsPage }))
);
const ContractorRequestDetailPage = lazy(() =>
  import('@/pages/contractor/ContractorRequestDetailPage').then((m) => ({ default: m.ContractorRequestDetailPage }))
);
const ContractorOrdersPage = lazy(() =>
  import('@/pages/contractor/ContractorOrdersPage').then((m) => ({ default: m.ContractorOrdersPage }))
);
const ContractorOrderDetailPage = lazy(() =>
  import('@/pages/contractor/ContractorOrderDetailPage').then((m) => ({ default: m.ContractorOrderDetailPage }))
);
const CreateQuotationPage = lazy(() =>
  import('@/pages/contractor/CreateQuotationPage').then((m) => ({ default: m.CreateQuotationPage }))
);
const ContractorMaterialRequirementPage = lazy(() =>
  import('@/pages/contractor/ContractorMaterialRequirementPage').then((m) => ({
    default: m.ContractorMaterialRequirementPage,
  }))
);
const StoreMaterialRequestsPage = lazy(() =>
  import('@/pages/store/StoreMaterialRequestsPage').then((m) => ({ default: m.StoreMaterialRequestsPage }))
);
const StoreMaterialRequestDetailPage = lazy(() =>
  import('@/pages/store/StoreMaterialRequestDetailPage').then((m) => ({ default: m.StoreMaterialRequestDetailPage }))
);
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const NotificationsPage = lazy(() =>
  import('@/pages/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);

export function App() {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Routes>
          <Route element={<CustomerSurface />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/explore" element={<ExplorePage />} />
              </Route>
              <Route path="/contractors/:id" element={<ContractorPublicPage />} />
              <Route path="/stores/:id/materials/:materialId" element={<PublicMaterialPage />} />
              <Route path="/stores/:id" element={<StorePublicPage />} />
              <Route path="/cart" element={<Navigate to="/explore" replace />} />
            </Route>
          </Route>

          <Route element={<GuestOnly />}>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute />}>
              <Route path="/partner/onboarding" element={<PartnerOnboardingPage />} />
              <Route path="/partner/onboarding/status" element={<PartnerStatusPage />} />
              <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
                <Route element={<CustomerLayout />}>
                  <Route path="/customer/dashboard" element={<CustomerDashboardPage />} />
                  <Route path="/customer/explore" element={<ExplorePage />} />
                  <Route path="/customer/contractors/:id" element={<ContractorPublicPage />} />
                  <Route path="/customer/stores/:id/materials/:materialId" element={<PublicMaterialPage />} />
                  <Route path="/customer/stores/:id" element={<StorePublicPage />} />
                  <Route path="/customer/request/create" element={<CreateRepairRequestPage />} />
                  <Route path="/customer/request/history" element={<RequestHistoryPage />} />
                  <Route path="/customer/chat" element={<ChatPage />} />
                  <Route path="/customer/chat/:roomId" element={<ChatPage />} />
                  <Route path="/customer/quotation/:id" element={<CustomerQuotationPage />} />
                  <Route path="/customer/orders" element={<CustomerOrdersPage />} />
                  <Route path="/customer/orders/:id/review" element={<CustomerReviewPage />} />
                  <Route path="/customer/orders/:id/complaint" element={<CustomerComplaintPage />} />
                  <Route path="/customer/orders/:id" element={<CustomerOrderDetailPage />} />
                  <Route path="/customer/payment/:orderId" element={<PaymentPage />} />
                  <Route path="/customer/reviews" element={<CustomerReviewsPage />} />
                  <Route path="/customer/complaints" element={<CustomerComplaintsPage />} />
                  <Route path="/customer/notifications" element={<NotificationsPage />} />
                  <Route path="/customer/profile" element={<ProfilePage />} />
                  <Route path="/material-checkout" element={<Navigate to="/customer/material-lists" replace />} />
                  <Route path="/customer/material-orders" element={<Navigate to="/customer/material-lists" replace />} />
                  <Route path="/customer/material-orders/:id" element={<Navigate to="/customer/material-lists" replace />} />
                  <Route path="/customer/material-lists" element={<CustomerMaterialListsPage />} />
                  <Route path="/customer/material-lists/:listId" element={<CustomerMaterialListPage />} />
                </Route>
              </Route>
              <Route element={<ProtectedRoute roles={['CONTRACTOR']} />}>
                <Route element={<ContractorLayout />}>
                  <Route path="/contractor/dashboard" element={<ContractorDashboardPage />} />
                  <Route path="/contractor/verification" element={<ContractorVerificationPage />} />
                  <Route path="/contractor/store" element={<Navigate to="/contractor/verification" replace />} />
                  <Route path="/contractor/services" element={<ContractorServicesPage />} />
                  <Route path="/contractor/requests" element={<ContractorRequestsPage />} />
                  <Route path="/contractor/requests/:id" element={<ContractorRequestDetailPage />} />
                  <Route path="/contractor/orders" element={<ContractorOrdersPage />} />
                  <Route path="/contractor/orders/:id" element={<ContractorOrderDetailPage />} />
                  <Route path="/contractor/earnings" element={<ContractorEarningsPage />} />
                  <Route path="/contractor/reviews" element={<ContractorReviewsPage />} />
                  <Route path="/contractor/reputation" element={<Navigate to="/contractor/dashboard" replace />} />
                  <Route path="/contractor/chat" element={<ChatPage />} />
                  <Route path="/contractor/chat/:roomId" element={<ChatPage />} />
                  <Route path="/contractor/quotation/create/:requestId" element={<CreateQuotationPage />} />
                  <Route path="/contractor/material-requirements/new/:requestId" element={<ContractorMaterialRequirementPage />} />
                  <Route path="/contractor/material-requirements/:listId" element={<ContractorMaterialRequirementPage />} />
                  <Route path="/contractor/quotation/create" element={<ContractorRequestsPage />} />
                  <Route path="/contractor/notifications" element={<NotificationsPage />} />
                  <Route path="/contractor/profile/edit" element={<ContractorPublicProfilePage />} />
                  <Route path="/contractor/profile" element={<Navigate to="/contractor/profile/edit" replace />} />
                  <Route path="/contractor/account" element={<ProfilePage />} />
                </Route>
              </Route>
              <Route element={<ProtectedRoute roles={['STORE', 'MATERIAL_STORE_OWNER']} />}>
                <Route element={<StoreLayout />}>
                  <Route path="/store/dashboard" element={<StoreDashboard />} />
                  <Route path="/store/profile/edit" element={<StorePublicProfilePage />} />
                  <Route path="/store/verification" element={<StoreVerificationPage />} />
                  <Route path="/store/materials" element={<StoreCategoriesPage />} />
                  <Route path="/store/products/:id" element={<StoreProductDetailPage />} />
                  <Route path="/store/products" element={<StoreMaterialsPage />} />
                  <Route path="/store/prices" element={<Navigate to="/store/products" replace />} />
                  <Route path="/store/delivery" element={<Navigate to="/store/material-requests" replace />} />
                  <Route path="/store/orders" element={<Navigate to="/store/material-requests" replace />} />
                  <Route path="/store/orders/:id" element={<Navigate to="/store/material-requests" replace />} />
                  <Route path="/store/material-requests" element={<StoreMaterialRequestsPage />} />
                  <Route path="/store/material-requests/:id" element={<StoreMaterialRequestDetailPage />} />
                  <Route path="/store/earnings" element={<Navigate to="/store/dashboard" replace />} />
                  <Route path="/store/reviews" element={<StoreReviewsPage />} />
                  <Route path="/store/reputation" element={<Navigate to="/store/dashboard" replace />} />
                  <Route path="/store/chat" element={<ChatPage />} />
                  <Route path="/store/chat/:roomId" element={<ChatPage />} />
                  <Route path="/store/notifications" element={<NotificationsPage />} />
                  <Route path="/store/profile" element={<ProfilePage />} />
                </Route>
              </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
    </Suspense>
  );
}
