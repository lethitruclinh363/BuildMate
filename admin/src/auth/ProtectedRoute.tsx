import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '@/components/Spinner';
import { ForbiddenPage } from '@/components/ForbiddenPage';
import { useAuthStore } from '@/auth/auth.store';

export function ProtectedRoute() {
  const loading = useAuthStore((s) => s.loading);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  if (loading) return <Spinner />;
  if (!token || !user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <ForbiddenPage />;
  return <Outlet />;
}

export function GuestOnly() {
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);

  if (loading) return <Spinner />;
  if (user?.role === 'ADMIN') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function RoleGuard() {
  const user = useAuthStore((s) => s.user);
  if (!user || user.role !== 'ADMIN') return <ForbiddenPage />;
  return <Outlet />;
}
