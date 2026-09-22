import { Navigate, useLocation } from 'react-router';
import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/api/types';

/**
 * Role guard: renders children only when the session user has one of the
 * required roles; otherwise redirects to /dashboard. Must sit inside
 * RequireAuth (assumes an authenticated session).
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const hasRole = useAuthStore((s) => s.hasRole);
  const location = useLocation();

  if (!hasRole(...roles)) {
    return <Navigate to="/dashboard" state={{ from: location.pathname, denied: true }} replace />;
  }
  return <>{children}</>;
}
