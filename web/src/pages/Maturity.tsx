import { useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { QuestionnaireEngine } from '@/components/questionnaire/QuestionnaireEngine';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssessment } from '@/store/assessmentStore';

/** Maturity diagnostic (M1): 5 blocks × 4 questions, scale 1-5, idk, delegation. */
export default function Maturity() {
  const { t } = useTranslation();
  const { assessment, status, reload } = useAssessment();

  useEffect(() => {
    if (status === 'idle') void reload();
  }, [status, reload]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('nav.maturity')}
        </p>
        <h1 className="text-2xl font-bold">{t('maturity.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('maturity.sub')}</p>
      </div>

      {(status === 'idle' || status === 'loading') && <Skeleton className="h-64 w-full" />}

      {status === 'missing' && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('common.noAssessment')}</span>
            <Button asChild size="sm">
              <Link to="/onboarding">
                {t('common.startDiagnostic')} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {assessment && (
        <QuestionnaireEngine
          module="maturity"
          moduleLabel={t('nav.maturity')}
        />
      )}
    </div>
  );
}
