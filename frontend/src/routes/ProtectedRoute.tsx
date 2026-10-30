import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ScreenLoader } from '@/components/motion/ScreenLoader';
import { getDefaultRouteByRole, isPartnerRole, partnerGatePath, useAuth } from '@/context/AuthContext';

function normalizeRole(role: string) {
  if (role === 'MATERIAL_STORE_OWNER') return 'STORE';
  return role;
}

const AUTH_RETURN_BLOCKLIST = new Set(['/', '/login', '/register', '/verify-email', '/forgot-password']);

/** Chỉ nhận đường dẫn nội bộ, chặn open redirect và vòng lặp login/register. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  const pathname = raw.split(/[?#]/)[0];
  if (AUTH_RETURN_BLOCKLIST.has(pathname)) return null;
  return raw;
}

export function withNextParam(path: string, next: string | null | undefined) {
  const safe = safeReturnPath(next);
  if (!safe) return path;
  return `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(safe)}`;
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
    if (!ok) return <Navigate to={getDefaultRouteByRole(currentUser)} replace />;
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
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  if (loading) return <ScreenLoader />;
  if (currentUser) {
    const next = safeReturnPath(new URLSearchParams(location.search).get('next'));
    const home = getDefaultRouteByRole(currentUser);
    if (next && !isPartnerRole(currentUser.role)) return <Navigate to={next} replace />;
    return <Navigate to={home} replace />;
  }
  return <Outlet />;
}
