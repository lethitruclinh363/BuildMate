import { Navigate, Outlet } from 'react-router-dom';
import { ScreenLoader } from '@/components/motion/ScreenLoader';
import { ROLE_HOME, useAuth } from '@/context/AuthContext';

function normalizeRole(role: string) {
  if (role === 'MATERIAL_STORE_OWNER') return 'STORE';
  return role;
}

function homeFor(role: string) {
  const key = role in ROLE_HOME ? (role as keyof typeof ROLE_HOME) : null;
  const alias = normalizeRole(role);
  const aliasKey = alias in ROLE_HOME ? (alias as keyof typeof ROLE_HOME) : null;
  if (key) return ROLE_HOME[key];
  if (aliasKey) return ROLE_HOME[aliasKey];
  return '/login';
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

  if (loading) return <ScreenLoader />;
  if (!token || !currentUser) return <Navigate to="/login" replace />;

  if (roles && roles.length) {
    const role = currentUser.role;
    const aliases = [role, normalizeRole(role)];
    const ok = roles.some((allowed) => aliases.includes(allowed));
    if (!ok) return <Navigate to={homeFor(role)} replace />;
  }

  return <Outlet />;
}

export function GuestOnly() {
  const { currentUser, ready, dashboardPath } = useAuth();
  if (ready && currentUser) {
    const dest = dashboardPath();
    if (dest.startsWith('/customer') || dest.startsWith('/contractor') || dest.startsWith('/store')) {
      return <Navigate to={dest} replace />;
    }
  }
  return <Outlet />;
}
