import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Lock, XCircle } from 'lucide-react';
import { fetchPayment, postMockStripeWebhook } from '@/api';
import { formatMoney } from '@/lib/quote';
import { pollPaymentStatus } from '@/lib/paymentFlow';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

/**
 * Simulated Stripe checkout (dev only): the backend's mock session URL lands
 * here. "Pay" fires the dev webhook to mark the payment succeeded, polls
 * GET /payments/{id}, then routes to /payment/success or /payment/cancel.
 */
export default function PaymentCheckout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get('session') ?? '';
  const paymentId = params.get('payment_id') ?? '';

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(false);

  const paymentQuery = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => fetchPayment(paymentId),
    enabled: !!paymentId,
  });

  async function handlePay() {
    setProcessing(true);
    setError(false);
    try {
      await postMockStripeWebhook(paymentId, sessionId);
      const status = await pollPaymentStatus(
        () => fetchPayment(paymentId).then((p) => p.status),
        { maxAttempts: 6, intervalMs: 1000 },
      );
      navigate(status === 'succeeded' ? '/payment/success' : '/payment/cancel?reason=failed', {
        replace: true,
      });
    } catch {
      setError(true);
      setProcessing(false);
    }
  }

  const payment = paymentQuery.data;
  const amount = payment ? formatMoney(payment.amount, payment.currency, i18n.language) : '…';

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-primary" />
              {t('payment.title')}
            </CardTitle>
            <Badge variant="outline" className="border-primary text-primary">
              {t('payment.simBadge')}
            </Badge>
          </div>
          <CardDescription>{t('payment.simTitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert>
            <AlertDescription>{t('payment.simDesc')}</AlertDescription>
          </Alert>

          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">{t('payment.orderSummary')}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('estimator2.cartTotal')}</span>
              <span className="text-xl font-bold">{amount}</span>
            </div>
          </div>

          {/* Simulated card form (non-functional, mirrors the wireframe) */}
          <fieldset className="space-y-3" disabled={processing}>
            <legend className="text-sm font-medium">{t('payment.cardSection')}</legend>
            <div className="space-y-1.5">
              <Label htmlFor="cc-name">{t('payment.cardHolder')}</Label>
              <Input id="cc-name" defaultValue="Demo User" autoComplete="cc-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-number">{t('payment.cardNumber')}</Label>
              <div className="relative">
                <Input id="cc-number" defaultValue="4242 4242 4242 4242" inputMode="numeric" />
                <CreditCard className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cc-exp">{t('payment.cardExp')}</Label>
                <Input id="cc-exp" defaultValue="12/28" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-cvc">{t('payment.cardCvc')}</Label>
                <Input id="cc-cvc" defaultValue="123" inputMode="numeric" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('payment.stripeNote')}</p>
          </fieldset>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{t('estimator2.checkoutError')}</AlertDescription>
            </Alert>
          )}

          {processing ? (
            <div className="flex flex-col items-center gap-2 py-4" role="status">
              <Spinner className="h-8 w-8 text-primary" />
              <p className="font-medium">{t('payment.processing')}</p>
              <p className="text-sm text-muted-foreground">{t('payment.processingDesc')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                className="brand-gradient border-0 text-white"
                onClick={() => void handlePay()}
                disabled={!paymentId || paymentQuery.isLoading}
              >
                {t('payment.simPayCta', { amount })}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/payment/cancel', { replace: true })}>
                <XCircle className="h-4 w-4" /> {t('payment.simCancel')}
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">{t('payment.securedBy')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
