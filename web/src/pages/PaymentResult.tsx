import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Home, ReceiptText, XCircle } from 'lucide-react';
import { fetchPayment } from '@/api';
import { PAYMENT_SESSION_KEYS, pollPaymentStatus } from '@/lib/paymentFlow';
import { formatMoney } from '@/lib/quote';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useAssessment } from '@/store/assessmentStore';
import { useAuthStore } from '@/store/authStore';

type PageState = 'checking' | 'succeeded' | 'failed' | 'missing';

/** /payment/:status — success / cancel landing after the (mock) checkout. */
export default function PaymentResult() {
  const { t, i18n } = useTranslation();
  const { status } = useParams<{ status: string }>();
  const [params] = useSearchParams();
  const { reload } = useAssessment();
  const hydrate = useAuthStore((s) => s.hydrate);

  const [state, setState] = useState<PageState>(status === 'cancel' ? 'failed' : 'checking');
  const [amount, setAmount] = useState<string | null>(null);

  const canceledByUser = status === 'cancel' && params.get('reason') !== 'failed';
  const paymentId = sessionStorage.getItem(PAYMENT_SESSION_KEYS.paymentId);

  useEffect(() => {
    if (status !== 'success') return;
    if (!paymentId) {
      setState('missing');
      return;
    }
    let cancelled = false;
    void pollPaymentStatus(
      () => fetchPayment(paymentId).then((p) => {
        if (!cancelled) setAmount(formatMoney(p.amount, p.currency, i18n.language));
        return p.status;
      }),
      { maxAttempts: 8, intervalMs: 1200 },
    ).then(async (final) => {
      if (cancelled) return;
      setState(final === 'succeeded' ? 'succeeded' : 'failed');
      if (final === 'succeeded') {
        // Plan upgrade: refresh the session profile + assessment (plan → pro).
        await hydrate().catch(() => undefined);
        await reload().catch(() => null);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, paymentId]);

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader className="items-center text-center">
          {status === 'success' && state === 'checking' && (
            <>
              <Spinner className="h-10 w-10 text-primary" />
              <CardTitle>{t('payment.successChecking')}</CardTitle>
            </>
          )}
          {status === 'success' && state === 'succeeded' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <CardTitle>{t('payment.successTitle')}</CardTitle>
              <CardDescription>{t('payment.successSub')}</CardDescription>
            </>
          )}
          {status === 'success' && state === 'failed' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <CardTitle>{t('payment.failedTitle')}</CardTitle>
              <CardDescription>{t('payment.failedDesc')}</CardDescription>
            </>
          )}
          {status === 'success' && state === 'missing' && (
            <>
              <ReceiptText className="h-12 w-12 text-muted-foreground" />
              <CardTitle>{t('payment.missingPayment')}</CardTitle>
            </>
          )}
          {status === 'cancel' && (
            <>
              <XCircle className={`h-12 w-12 ${canceledByUser ? 'text-muted-foreground' : 'text-destructive'}`} />
              <CardTitle>
                {canceledByUser ? t('payment.cancelTitle') : t('payment.failedTitle')}
              </CardTitle>
              <CardDescription>
                {canceledByUser ? t('payment.cancelDesc') : t('payment.failedDesc')}
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'success' && state === 'succeeded' && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Free</Badge>
                <span aria-hidden>→</span>
                <Badge className="brand-gradient border-0 text-white">Pro</Badge>
                {amount && <span className="text-sm text-muted-foreground">{amount}</span>}
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {t('payment.successUpgraded')}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild className="brand-gradient border-0 text-white">
                  <Link to="/results">{t('payment.goResults')}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/dashboard">
                    <Home className="h-4 w-4" /> {t('payment.goHome')}
                  </Link>
                </Button>
              </div>
            </>
          )}
          {(status === 'cancel' ||
            (status === 'success' && (state === 'failed' || state === 'missing'))) && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild className="brand-gradient border-0 text-white">
                <Link to="/estimator">{t('payment.backToEstimator')}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard">{t('payment.goHome')}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
