import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Link2Off } from 'lucide-react';
import { answerDelegation, fetchDelegation } from '@/api';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * Public delegation landing (no auth): renders the delegated question via
 * GET /delegations/{token} and posts the 1-5 answer. Handles the
 * sent/answered/expired/invalid states gracefully.
 */
export default function DelegateAnswer() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const delegationQuery = useQuery({
    queryKey: ['delegation', token],
    queryFn: () => fetchDelegation(token!),
    enabled: !!token,
    retry: 0,
  });

  const scale = t('questionnaire.scale', { returnObjects: true }) as string[];
  const info = delegationQuery.data;

  async function submit() {
    if (!token || selected === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await answerDelegation(token, selected);
      setAnswered(true);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'DELEGATION_ALREADY_ANSWERED') setSubmitError('answered');
      else if (code === 'DELEGATION_TOKEN_EXPIRED') setSubmitError('expired');
      else setSubmitError('generic');
    } finally {
      setSubmitting(false);
    }
  }

  function stateCard(icon: React.ReactNode, title: string, sub: string) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader className="items-center">
          {icon}
          <CardTitle>{title}</CardTitle>
          <CardDescription>{sub}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  let body: React.ReactNode;
  if (delegationQuery.isLoading) {
    body = <Skeleton className="h-48 w-full max-w-lg" />;
  } else if (delegationQuery.isError || !info) {
    body = stateCard(
      <Link2Off className="h-10 w-10 text-destructive" />,
      t('delegatePage.invalidTitle'),
      t('delegatePage.invalidSub'),
    );
  } else if (answered || info.status === 'answered' || submitError === 'answered') {
    body = stateCard(
      <CheckCircle2 className="h-10 w-10 text-primary" />,
      answered ? t('delegatePage.successTitle') : t('delegatePage.answeredTitle'),
      answered ? t('delegatePage.successSub') : t('delegatePage.answeredSub'),
    );
  } else if (info.status === 'expired' || submitError === 'expired') {
    body = stateCard(
      <Clock className="h-10 w-10 text-muted-foreground" />,
      t('delegatePage.expiredTitle'),
      t('delegatePage.expiredSub'),
    );
  } else {
    body = (
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">{t('delegatePage.greeting', { name: info.delegate_name })}</CardTitle>
          <CardDescription>{t('delegatePage.intro')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="rounded-lg bg-muted p-4 font-medium">
            {info.question_text ??
              t('delegatePage.questionFallback', { code: info.question_code ?? '' })}
          </p>
          <div className="flex justify-between gap-2" role="radiogroup">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={selected === v}
                onClick={() => setSelected(v)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-3 transition-colors',
                  selected === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/60',
                )}
              >
                <span className="text-lg font-bold">{v}</span>
                <span className="text-[10px] leading-tight">{scale[v - 1]}</span>
              </button>
            ))}
          </div>
          {submitError === 'generic' && (
            <Alert variant="destructive">
              <AlertTitle>{t('common.errorGeneric')}</AlertTitle>
            </Alert>
          )}
          <Button
            className="brand-gradient w-full border-0 text-white"
            disabled={selected === null || submitting}
            onClick={() => void submit()}
          >
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {t('delegatePage.submit')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <BrandLogo compact />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-4">{body}</main>
      <footer className="border-t p-3 text-center text-xs text-muted-foreground">
        {t('resultsPdf.footer')}
      </footer>
    </div>
  );
}
