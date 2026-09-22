import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BadgePercent, Check, Minus, Plus, UserCheck, UserRound } from 'lucide-react';
import {
  createCheckoutSession,
  createQuote,
  fetchAreas,
  fetchPricing,
  validateDistributorCode,
} from '@/api';
import {
  computeQuote,
  formatMoney,
  hasHumanAccompaniment,
  MAX_SESSIONS_PER_AREA,
  type QuoteAreaConfig,
} from '@/lib/quote';
import {
  isMockCheckoutUrl,
  newIdempotencyKey,
  parseMockSessionId,
  PAYMENT_SESSION_KEYS,
  paymentIdFromMockSession,
} from '@/lib/paymentFlow';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAssessment } from '@/store/assessmentStore';

const FALLBACK_AREA_KEYS = [
  'ventas',
  'marketing',
  'servicio',
  'finanzas',
  'rrhh',
  'operaciones',
  'legal',
] as const;

/** Estimator: interactive quote builder → persisted quote → (mock) checkout. */
export default function Estimator() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { assessment } = useAssessment();

  const [configs, setConfigs] = useState<Record<string, QuoteAreaConfig>>({});
  const [finalReport, setFinalReport] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<{ code: string; pct: number } | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  // One idempotency key per checkout attempt; regenerated after a session is created.
  const idemKey = useRef(newIdempotencyKey());

  const pricingQuery = useQuery({ queryKey: ['pricing'], queryFn: fetchPricing });
  const areasQuery = useQuery({
    queryKey: ['areas', assessment?.id],
    queryFn: () => fetchAreas(assessment!.id),
    enabled: !!assessment,
  });

  interface AreaOption {
    key: string;
    name: string;
    icon?: string;
  }
  const areaOptions: AreaOption[] = useMemo(() => {
    const fromApi = areasQuery.data?.items;
    if (fromApi && fromApi.length > 0) {
      return fromApi.map((a) => ({ key: a.area_key, name: a.name }));
    }
    const names = t('areaList', { returnObjects: true }) as Record<string, { name: string; icon: string }>;
    return FALLBACK_AREA_KEYS.map((key) => ({
      key,
      name: names[key]?.name ?? key,
      icon: names[key]?.icon,
    }));
  }, [areasQuery.data, t]);

  const cfgFor = (key: string): QuoteAreaConfig =>
    configs[key] ?? { area_key: key, active: false, review: false, sessions: 0 };

  function patchArea(key: string, patch: Partial<QuoteAreaConfig>) {
    setConfigs((prev) => ({ ...prev, [key]: { ...cfgFor(key), ...patch } }));
  }

  const pricing = pricingQuery.data;
  const areaList = areaOptions.map((a) => cfgFor(a.key));
  const quote = pricing
    ? computeQuote(pricing, areaList, finalReport, appliedCode?.pct ?? 0)
    : null;
  const guided = hasHumanAccompaniment(areaList, finalReport);
  const money = (n: number) => formatMoney(n, pricing?.currency ?? 'USD', i18n.language);
  const activeCount = areaList.filter((a) => a.active).length;

  const codeMutation = useMutation({
    mutationFn: (code: string) => validateDistributorCode(code),
    onSuccess: (res, code) => {
      setAppliedCode({ code, pct: res.discount_pct });
      setCodeError(false);
    },
    onError: () => {
      setAppliedCode(null);
      setCodeError(true);
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const quoteRes = await createQuote({
        areas: areaList.filter((a) => a.active || a.review || a.sessions > 0),
        final_report: finalReport,
        distributor_code: appliedCode?.code ?? null,
      });
      const origin = window.location.origin;
      const session = await createCheckoutSession(
        {
          quote_id: quoteRes.quote_id,
          success_url: `${origin}/payment/success`,
          cancel_url: `${origin}/payment/cancel`,
        },
        idemKey.current,
      );
      return session;
    },
    onSuccess: (session) => {
      idemKey.current = newIdempotencyKey();
      sessionStorage.setItem(PAYMENT_SESSION_KEYS.paymentId, session.payment_id);
      sessionStorage.setItem(PAYMENT_SESSION_KEYS.providerRef, `cs_mock_${session.payment_id}`);
      if (isMockCheckoutUrl(session.checkout_url)) {
        const mockId = parseMockSessionId(session.checkout_url)!;
        const pid = paymentIdFromMockSession(mockId) ?? session.payment_id;
        sessionStorage.setItem(PAYMENT_SESSION_KEYS.providerRef, mockId);
        navigate(`/payment/checkout?session=${encodeURIComponent(mockId)}&payment_id=${encodeURIComponent(pid)}`);
      } else {
        window.location.assign(session.checkout_url);
      }
    },
    onError: () => setCheckoutError(true),
  });

  const loading = pricingQuery.isLoading || (!!assessment && areasQuery.isLoading);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('estimator2.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('estimator2.sub')}</p>
        </div>
        <Badge variant={guided ? 'default' : 'secondary'} className="gap-1.5 px-3 py-1.5 text-sm">
          {guided ? <UserCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
          {guided ? t('estimator2.profileGuided') : t('estimator2.profileSelf')}
        </Badge>
      </div>

      {!assessment && (
        <Alert>
          <AlertDescription>
            {t('estimator2.needAssessment')}{' '}
            <Button asChild variant="outline" size="sm" className="ml-2">
              <Link to="/onboarding">{t('common.startDiagnostic')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {checkoutError && (
        <Alert variant="destructive">
          <AlertDescription>{t('estimator2.checkoutError')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Base package */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t('estimator2.baseTitle')}</CardTitle>
                <Badge variant="outline">{t('estimator2.baseIncluded')}</Badge>
              </div>
              <CardDescription>{t('estimator2.baseDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('estimator2.cartBase')}</span>
              <span className="text-lg font-bold">{pricing ? money(pricing.base_price) : '—'}</span>
            </CardContent>
          </Card>

          {/* Areas config */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('estimator2.areasTitle')}</CardTitle>
              <CardDescription>{t('estimator2.areasSub')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)
              ) : (
                areaOptions.map((area) => {
                  const cfg = cfgFor(area.key);
                  return (
                    <div key={area.key} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 font-medium">
                          {area.icon && <span aria-hidden>{area.icon}</span>}
                          {area.name}
                        </div>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`active-${area.key}`}
                            className="text-sm text-muted-foreground"
                          >
                            {t('estimator2.activate')}
                          </label>
                          <Switch
                            id={`active-${area.key}`}
                            checked={cfg.active}
                            onCheckedChange={(v) => patchArea(area.key, { active: v })}
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={`review-${area.key}`}
                            checked={cfg.review}
                            onCheckedChange={(v) => patchArea(area.key, { review: v === true })}
                          />
                          <div>
                            <label htmlFor={`review-${area.key}`} className="text-sm font-medium">
                              {t('estimator2.areaReview')}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {pricing ? `+${money(pricing.area_review)}` : ''} ·{' '}
                              {t('estimator2.areaReviewDesc')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{t('estimator2.sessionsLabel')}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="−"
                              disabled={!cfg.active || cfg.sessions <= 0}
                              onClick={() => patchArea(area.key, { sessions: cfg.sessions - 1 })}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-6 text-center text-sm font-semibold">
                              {cfg.sessions}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="+"
                              disabled={!cfg.active || cfg.sessions >= MAX_SESSIONS_PER_AREA}
                              onClick={() => patchArea(area.key, { sessions: cfg.sessions + 1 })}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {pricing ? `+${money(pricing.support_session)}/ses.` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <p className="text-xs text-muted-foreground">
                {t('estimator2.activeCount', { n: activeCount })}
              </p>
            </CardContent>
          </Card>

          {/* Final report validation */}
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{t('estimator2.finalReportTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('estimator2.finalReportDesc')}
                  {pricing ? ` · +${money(pricing.final_report_validation)}` : ''}
                </p>
              </div>
              <Switch
                checked={finalReport}
                onCheckedChange={setFinalReport}
                aria-label={t('estimator2.finalReportTitle')}
              />
            </CardContent>
          </Card>
        </div>

        {/* Cart */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-base">{t('estimator2.cartTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading || !quote ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span>{t('estimator2.cartBase')}</span>
                  <span>{money(pricing!.base_price)}</span>
                </div>
                {quote.reviewCount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>
                      {quote.reviewCount === 1
                        ? t('estimator2.cartReviews', { n: quote.reviewCount })
                        : t('estimator2.cartReviewsPlural', { n: quote.reviewCount })}
                    </span>
                    <span>{money(quote.reviewCount * pricing!.area_review)}</span>
                  </div>
                )}
                {quote.sessionCount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>
                      {quote.sessionCount === 1
                        ? t('estimator2.cartSessions', { n: quote.sessionCount })
                        : t('estimator2.cartSessionsPlural', { n: quote.sessionCount })}
                    </span>
                    <span>{money(quote.sessionCount * pricing!.support_session)}</span>
                  </div>
                )}
                {finalReport && (
                  <div className="flex justify-between text-sm">
                    <span>{t('estimator2.cartFinal')}</span>
                    <span>{money(pricing!.final_report_validation)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-sm font-medium">
                  <span>{t('estimator2.cartSubtotal')}</span>
                  <span>{money(quote.subtotal)}</span>
                </div>

                {/* Distributor code */}
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <BadgePercent className="h-4 w-4 text-primary" />
                    {t('estimator2.distLabel')}
                  </p>
                  {appliedCode ? (
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" />
                        {t('estimator2.distApplied', { pct: appliedCode.pct })}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAppliedCode(null);
                          setCodeInput('');
                        }}
                      >
                        {t('estimator2.distRemove')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={codeInput}
                        onChange={(e) => {
                          setCodeInput(e.target.value);
                          setCodeError(false);
                        }}
                        placeholder={t('payment.distributorPh')}
                        aria-label={t('estimator2.distLabel')}
                      />
                      <Button
                        variant="outline"
                        disabled={!codeInput.trim() || codeMutation.isPending}
                        onClick={() => codeMutation.mutate(codeInput.trim())}
                      >
                        {codeMutation.isPending
                          ? t('estimator2.distChecking')
                          : t('estimator2.distApply')}
                      </Button>
                    </div>
                  )}
                  {codeError && (
                    <p className="text-xs text-destructive">{t('estimator2.distInvalid')}</p>
                  )}
                </div>

                {quote.discount > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>{t('estimator2.cartDiscount')}</span>
                    <span>−{money(quote.discount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>{t('estimator2.cartTotal')}</span>
                  <span>{money(quote.total)}</span>
                </div>
                <Button
                  className="brand-gradient w-full border-0 text-white"
                  disabled={checkoutMutation.isPending || !assessment}
                  onClick={() => {
                    setCheckoutError(false);
                    checkoutMutation.mutate();
                  }}
                >
                  {checkoutMutation.isPending
                    ? t('common.loading')
                    : t('estimator2.approveCta')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('estimator2.cartNote')}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
