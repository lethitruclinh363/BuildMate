import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ScreenLoader } from '@/components/motion/ScreenLoader';
import { getDefaultRouteByRole, isPartnerRole, useAuth } from '@/context/AuthContext';

/**
 * Public marketing/explore surface.
 * Logged-in partners never stay here.
 * Logged-in customers hitting `/` go to their dashboard.
 * Logged-in customers opening public profile/explore URLs are mirrored into Customer Workspace.
 */
export function CustomerSurface() {
  const { currentUser, loading } = useAuth();
  const { pathname, search, hash } = useLocation();

  if (loading && !currentUser) return <ScreenLoader />;

  if (currentUser && isPartnerRole(currentUser.role)) {
    return <Navigate to={getDefaultRouteByRole(currentUser)} replace />;
  }

  if (currentUser && pathname === '/') {
    return <Navigate to={getDefaultRouteByRole(currentUser)} replace />;
  }

  if (currentUser?.role === 'CUSTOMER') {
    const publicPartner =
      pathname === '/explore' || pathname.startsWith('/contractors/') || pathname.startsWith('/stores/');
    if (publicPartner) {
      return <Navigate to={`/customer${pathname}${search}${hash}`} replace />;
    }
  }

  return <Outlet />;
}
