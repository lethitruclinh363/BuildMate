import { Navigate, Outlet } from 'react-router-dom';
import { ScreenLoader } from '@/components/motion/ScreenLoader';
import { getDefaultRouteByRole, isPartnerRole, useAuth } from '@/context/AuthContext';

/**
 * Trang công khai dành cho khách và khách hàng.
 * Đối tác đã đăng nhập được chuyển về dashboard sau khi phiên được khôi phục.
 */
export function CustomerSurface() {
  const { currentUser, loading } = useAuth();

  if (loading) return <ScreenLoader />;
  if (currentUser && isPartnerRole(currentUser.role)) {
    return <Navigate to={getDefaultRouteByRole(currentUser)} replace />;
  }
  return <Outlet />;
}
