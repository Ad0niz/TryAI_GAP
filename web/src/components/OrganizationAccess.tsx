import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';

export function OrganizationAccess({ children, areaKey }: { children: ReactNode; areaKey?: string }) {
  const { t } = useTranslation();
  const access = useOrganizationAccess();
  if (access.loading) return <p role="status">{t('common.loading')}</p>;
  if (access.error || (!access.admin && (!areaKey || !access.areaKeys.includes(areaKey)))) {
    return <p role="alert" className="rounded-lg border p-4 text-sm">{t('orgPermissions.denied')}</p>;
  }
  return <>{children}</>;
}
