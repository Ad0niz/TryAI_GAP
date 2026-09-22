import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, Lock } from 'lucide-react';
import { ApiError } from '@/api/client';
import { fetchOrganization, fetchResults } from '@/api';
import type { ResultOut } from '@/api/types';
import { MaturityRadar } from '@/components/questionnaire/MaturityRadar';
import type { ReportLabels } from '@/pdf/ReportDocument';

const ReportPdfActions = lazy(() => import('@/pdf/ReportPdf'));
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAssessment } from '@/store/assessmentStore';

/** Heat cell color by 1-5 intensity. */
function heatClass(v: number): string {
  if (v >= 4) return 'bg-primary text-primary-foreground';
  if (v === 3) return 'bg-primary/60 text-primary-foreground';
  if (v === 2) return 'bg-primary/25';
  return 'bg-muted';
}

function ResultsBody({ results }: { results: ResultOut }) {
  const { t, i18n } = useTranslation();
  const { assessment } = useAssessment();
  const recoLabels = t('resultsUI.reco', { returnObjects: true }) as Record<string, string>;

  const orgQuery = useQuery({
    queryKey: ['organization', assessment?.organization_id],
    queryFn: () => fetchOrganization(assessment!.organization_id),
    enabled: !!assessment?.organization_id,
  });

  const dateStr = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date());

  const labels: ReportLabels = useMemo(
    () => ({
      coverTitle: t('resultsPdf.coverTitle'),
      coverSub: t('resultsPdf.coverSub'),
      generatedOn: t('resultsPdf.generatedOn', { date: dateStr }),
      overallScore: t('resultsPdf.overallScore', {
        avg: results.maturity.average.toFixed(1),
        level: results.maturity.level,
      }),
      methodology: t('resultsPdf.methodology'),
      methodologyBody: t('resultsPdf.methodologyBody'),
      dimTitle: t('resultsPdf.dimTitle'),
      dimName: t('resultsPdf.dimName'),
      dimScore: t('resultsPdf.dimScore'),
      heatTitle: t('resultsPdf.heatTitle'),
      prioTitle: t('resultsPdf.prioTitle'),
      recoTitle: t('resultsPdf.recoTitle'),
      nextSteps: t('resultsPdf.nextSteps', { returnObjects: true }) as string[],
      footer: t('resultsPdf.footer'),
      prioritiesHeaders: {
        initiative: t('resultsUI.thInitiative'),
        area: t('resultsUI.thArea'),
        vector: t('resultsUI.thVector'),
        recommendation: t('resultsUI.thReco'),
      },
      recoLabels,
    }),
    [t, dateStr, results, recoLabels],
  );

  const reportData = {
    orgName: orgQuery.data?.name ?? '—',
    date: dateStr,
    results,
  };

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{t('results.overall')}</p>
            <p className="text-3xl font-bold">{results.maturity.average.toFixed(1)}<span className="text-lg text-muted-foreground"> / 5</span></p>
          </div>
          <Badge className="brand-gradient border-0 px-3 py-1.5 text-sm text-white">
            {t('results.levelLabel')}: {results.maturity.level}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Suspense fallback={<Skeleton className="h-9 w-72" />}>
            <ReportPdfActions
              data={reportData}
              labels={labels}
              fileName={`TryAIGap-Report-${new Date().toISOString().slice(0, 10)}.pdf`}
              texts={{
                preview: t('results.pdfPreview'),
                download: t('results.downloadPdf'),
                loading: t('common.loading'),
              }}
            />
          </Suspense>
          <Button asChild variant="outline">
            <Link to="/review">
              <CalendarCheck2 className="h-4 w-4" /> {t('results.bookReview')}
            </Link>
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('results.pdfNote')}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('results.maturityRadar')}</CardTitle>
          </CardHeader>
          <CardContent>
            <MaturityRadar
              data={results.maturity.dimensions.map((d) => ({ dim: d.label, score: d.score }))}
            />
          </CardContent>
        </Card>

        {/* Dimension bars */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('results.dimScores')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.maturity.dimensions.map((d) => (
              <div key={d.key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{d.label}</span>
                  <span className="text-muted-foreground">{d.score.toFixed(1)} / 5</span>
                </div>
                <Progress value={(d.score / 5) * 100} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('results.heatmap')}</CardTitle>
          <CardDescription>{t('resultsUI.heatTitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('resultsUI.thArea')}</TableHead>
                {results.heatmap.vectors.map((v) => (
                  <TableHead key={v} className="text-center">
                    {v}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.heatmap.areas.map((area) => (
                <TableRow key={area.name}>
                  <TableCell className="font-medium">{area.name}</TableCell>
                  {area.row.map((v, i) => (
                    <TableCell key={i} className="p-1 text-center">
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${heatClass(v)}`}
                      >
                        {v}
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Priorities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('results.priorities')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('resultsUI.thInitiative')}</TableHead>
                <TableHead>{t('resultsUI.thArea')}</TableHead>
                <TableHead>{t('resultsUI.thVector')}</TableHead>
                <TableHead>{t('resultsUI.thReco')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.priorities.map((p) => (
                <TableRow key={p.initiative}>
                  <TableCell className="font-medium">{p.initiative}</TableCell>
                  <TableCell>{p.area}</TableCell>
                  <TableCell>{p.vector}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{recoLabels[p.recommendation] ?? p.recommendation}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Results: overall score, radar, heatmap, priorities + client-side PDF report. */
export default function Results() {
  const { t } = useTranslation();
  const { assessment, status: assessmentStatus, reload } = useAssessment();

  if (assessmentStatus === 'idle') void reload();

  const resultsQuery = useQuery({
    queryKey: ['results', assessment?.id],
    queryFn: () => fetchResults(assessment!.id),
    enabled: !!assessment,
    retry: 0,
  });

  const error = resultsQuery.error;
  const isPaywall = error instanceof ApiError && error.status === 402;
  const isNotReady = error instanceof ApiError && error.code === 'RESULTS_NOT_READY';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('results.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('results.sub')}</p>
      </div>

      {!assessment && (
        <Alert>
          <AlertDescription>
            {t('common.noAssessment')}{' '}
            <Button asChild variant="outline" size="sm" className="ml-2">
              <Link to="/onboarding">{t('common.startDiagnostic')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {resultsQuery.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isPaywall && (
        <Card className="border-primary/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t('paywall.title')}</CardTitle>
            </div>
            <CardDescription>{t('paywall.sub')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="brand-gradient border-0 text-white">
              <Link to="/estimator">{t('paywall.cta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {isNotReady && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('results.notReadyTitle')}</CardTitle>
            <CardDescription>{t('results.notReadyDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="brand-gradient border-0 text-white">
              <Link to="/maturity">{t('results.goMaturity')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/areas">{t('results.goAreas')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {resultsQuery.isError && !isPaywall && !isNotReady && (
        <Alert variant="destructive">
          <AlertTitle>{t('common.errorGeneric')}</AlertTitle>
          <AlertDescription>
            <Button variant="outline" size="sm" onClick={() => void resultsQuery.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {resultsQuery.data && <ResultsBody results={resultsQuery.data} />}
    </div>
  );
}
