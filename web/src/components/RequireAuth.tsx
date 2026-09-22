import { Navigate, useLocation } from 'react-router';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/store/authStore';

/**
 * Route guard: hydrates the session on first mount, shows a loading state
 * while hydrating, and redirects to /login when unauthenticated.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const location = useLocation();

  useEffect(() => {
    if (status === 'idle') void hydrate();
  }, [status, hydrate]);

  if (status === 'idle' || status === 'hydrating') {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
