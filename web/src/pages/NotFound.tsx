import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl font-extrabold text-brand-gradient">404</p>
      <h1 className="text-xl font-bold">{t('notFound.title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('notFound.sub')}</p>
      <Button asChild>
        <Link to="/dashboard">{t('notFound.cta')}</Link>
      </Button>
    </div>
  );
}
