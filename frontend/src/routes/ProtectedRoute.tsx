import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ScreenLoader } from '@/components/motion/ScreenLoader';
import { homeForUser, partnerGatePath, useAuth } from '@/context/AuthContext';

function normalizeRole(role: string) {
  if (role === 'MATERIAL_STORE_OWNER') return 'STORE';
  return role;
}

function homeFor(role: string, profileStatus?: string | null) {
  return homeForUser({ role, profileStatus });
}

type ProtectedRouteProps = {
  /** Nếu truyền, chỉ các role này được vào. Không truyền = chỉ cần đã đăng nhập. */
  roles?: string[];
};

/**
 * Chưa login → /login
 * Sai role → dashboard đúng vai trò
 */
export default function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { currentUser, token, loading } = useAuth();
  const location = useLocation();

  if (loading) return <ScreenLoader />;
  if (!token || !currentUser) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (roles && roles.length) {
    const role = currentUser.role;
    const aliases = [role, normalizeRole(role)];
    const ok = roles.some((allowed) => aliases.includes(allowed));
    if (!ok) return <Navigate to={homeFor(role, currentUser.profileStatus)} replace />;
  }

  const gate = partnerGatePath(currentUser);
  const onPartnerGate =
    location.pathname === '/partner/onboarding' || location.pathname === '/partner/onboarding/status';
  const filedProfile =
    currentUser.profileStatus === 'SUBMITTED' ||
    currentUser.profileStatus === 'PENDING_APPROVAL' ||
    currentUser.profileStatus === 'REJECTED' ||
    currentUser.profileStatus === 'APPROVED';
  const viewingFiledProfile =
    filedProfile &&
    (location.pathname === '/contractor/verification' ||
      location.pathname === '/contractor/store' ||
      location.pathname === '/store/verification');
  if (gate && !onPartnerGate && !viewingFiledProfile) {
    return <Navigate to={gate} replace />;
  }

  return <Outlet />;
}

export function GuestOnly() {
  const { currentUser, ready, dashboardPath } = useAuth();
  if (ready && currentUser) {
    const dest = dashboardPath();
    if (dest.startsWith('/customer') || dest.startsWith('/contractor') || dest.startsWith('/store') || dest.startsWith('/partner')) {
      return <Navigate to={dest} replace />;
    }
  }
  return <Outlet />;
}
