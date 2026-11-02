import { useQuery } from '@tanstack/react-query';
import { fetchOrganizationPermissions } from '@/api';
import { useAuthStore } from '@/store/authStore';

export function useOrganizationAccess() {
  const user = useAuthStore(s => s.user);
  const query = useQuery({
    queryKey: ['organization-permissions', user?.id, user?.organization_id],
    queryFn: fetchOrganizationPermissions,
    enabled: !!user?.organization_id,
    staleTime: 0, retry: false,
  });
  return {
    admin: query.data?.organization_admin === true,
    areaKeys: query.data?.area_keys ?? [],
    loading: !!user?.organization_id && query.isPending,
    error: query.error,
  };
}
