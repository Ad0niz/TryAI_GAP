import { useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  FileCheck2,
  FileText,
  Gauge,
  LayoutGrid,
  MessagesSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { fetchAreas, fetchDocuments, fetchTeam } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssessment } from '@/store/assessmentStore';
import { useAuthStore } from '@/store/authStore';

interface ModuleCard {
  title: string;
  sub: string;
  cta: string;
  meta: string;
}

const MODULE_ROUTES: Record<string, { to: string; icon: React.ComponentType<{ className?: string }> }> = {
  estimator: { to: '/estimator', icon: CalendarClock },
  maturity: { to: '/maturity', icon: Gauge },
  areas: { to: '/areas', icon: LayoutGrid },
  documents: { to: '/documents', icon: FileText },
  team: { to: '/team', icon: Users },
  results: { to: '/results', icon: BarChart3 },
  review: { to: '/review', icon: ShieldCheck },
};

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

/** Dashboard: assessment status, KPIs, per-module next steps. */
export default function Dashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { assessment, status, reload } = useAssessment();
  const moduleCards = t('moduleCards', { returnObjects: true }) as Record<string, ModuleCard>;

  useEffect(() => {
    if (status === 'idle') void reload();
  }, [status, reload]);

  const areasQuery = useQuery({
    queryKey: ['areas', assessment?.id],
    queryFn: () => fetchAreas(assessment!.id),
    enabled: !!assessment,
  });
  const teamQuery = useQuery({ queryKey: ['team'], queryFn: fetchTeam });
  const docsQuery = useQuery({
    queryKey: ['documents', 'count'],
    queryFn: () => fetchDocuments(1),
    retry: 0,
  });

  const areas = areasQuery.data?.items ?? [];
  const activeAreas = areas.filter((a) => a.active);
  const teamSize = teamQuery.data?.items.length;
  const docCount = docsQuery.data?.meta.total;
  const days = daysSince(assessment?.started_at);
  const maturityPct = assessment?.progress.maturity ?? 0;
  const loading = status === 'idle' || status === 'loading';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {t('dashboard.welcome')}
            {user?.full_name ? `, ${user.full_name}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.pickUp')}</p>
        </div>
        {assessment && (
          <div className="flex items-center gap-2">
            <Badge variant={assessment.plan === 'pro' ? 'default' : 'secondary'}>
              {assessment.plan === 'pro' ? t('dashboard.planPro') : t('dashboard.planFree')}
            </Badge>
            <Button asChild className="brand-gradient border-0 text-white">
              <Link to="/maturity">
                {t('dashboard.resume')} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>

      {status === 'missing' && (
        <Card className="border-primary/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <p className="font-semibold">{t('dashboard.noAssessmentTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('common.noAssessment')}</p>
            </div>
            <Button asChild className="brand-gradient border-0 text-white">
              <Link to="/onboarding">{t('dashboard.noAssessmentCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dashboard.kpis.coverage')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <p className="text-2xl font-bold">{maturityPct}%</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dashboard.maturityProgress')} · {activeAreas.length}/7{' '}
                  {t('dashboard.areasProgress').toLowerCase()}
                </p>
                <Progress value={maturityPct} className="mt-2 h-1.5" />
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dashboard.kpis.team')}</CardDescription>
          </CardHeader>
          <CardContent>
            {teamQuery.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold">{teamSize ?? '—'}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dashboard.kpis.evidence')}</CardDescription>
          </CardHeader>
          <CardContent>
            {docsQuery.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold">{docCount ?? '—'}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dashboard.kpis.days')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold">
                {days ?? '—'}
                {days !== null && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {t('dashboard.daysUnit')}
                  </span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Free-plan upgrade CTA */}
      {assessment?.plan === 'free' && (
        <Card className="border-dashed border-primary">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">
              <span className="font-semibold">{t('paywall.title')}. </span>
              <span className="text-muted-foreground">{t('paywall.note')}</span>
            </p>
            <Button asChild size="sm" className="brand-gradient border-0 text-white">
              <Link to="/estimator">{t('dashboard.upgradeCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Module cards with live meta where available */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('dashboard.modules')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(moduleCards).map(([key, mod]) => {
            const route = MODULE_ROUTES[key];
            if (!route || !mod?.title) return null;
            const Icon = route.icon;
            let meta = mod.meta;
            if (key === 'maturity' && assessment) meta = `${maturityPct}% · ${mod.meta}`;
            if (key === 'areas' && areas.length > 0)
              meta = `${activeAreas.length}/7 ${t('dashboard.areasProgress').toLowerCase()} · ${mod.meta}`;
            if (key === 'documents' && docCount !== undefined)
              meta = `${docCount} · ${mod.meta}`;
            if (key === 'team' && teamSize !== undefined) meta = `${teamSize} · ${mod.meta}`;
            return (
              <Card key={key} className="flex flex-col transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md brand-gradient-soft text-primary">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <CardTitle className="text-base">{mod.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{mod.sub}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex items-center justify-between pt-0">
                  <span className="text-xs text-muted-foreground">{meta}</span>
                  <Button asChild size="sm" variant="ghost">
                    <Link to={route.to}>
                      {mod.cta} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Assistant card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('dashboard.assistantTitle')}</CardTitle>
          </div>
          <CardDescription>{t('dashboard.assistantSub')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled>
            {t('dashboard.askAI')}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/review">{t('dashboard.bookHuman')}</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Evidence summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('nav.documents')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          {docsQuery.isLoading ? (
            <Skeleton className="h-4 w-1/2" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('dashboard.kpis.evidence')}: <span className="font-semibold">{docCount ?? 0}</span>
            </p>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/documents">
              {t('moduleCards.documents.cta')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
