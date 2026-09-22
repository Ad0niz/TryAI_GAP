import { useTranslation } from 'react-i18next';
import { Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Router-level error fallback (errorElement). */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError() as { statusText?: string; message?: string } | null;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('common.errorGeneric')}</CardTitle>
          <CardDescription>{error?.statusText ?? error?.message ?? 'Error'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/">{t('notFound.cta')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
