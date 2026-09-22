import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, LockOpen } from 'lucide-react';
import { activateArea, fetchAreaCases, fetchAreas } from '@/api';
import { isPaywallError } from '@/lib/planGate';
import { QuestionnaireEngine } from '@/components/questionnaire/QuestionnaireEngine';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAssessment } from '@/store/assessmentStore';

interface AreaEntry {
  name: string;
  icon: string;
  n: number;
}

/** Single area: AI-readiness questionnaire + use-case catalog tabs. */
export default function AreaDetail() {
  const { areaKey } = useParams<{ areaKey: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { assessment, status, reload } = useAssessment();
  const [upgradeMsg, setUpgradeMsg] = useState(false);

  useEffect(() => {
    if (status === 'idle') void reload();
  }, [status, reload]);

  const areaList = t('areaList', { returnObjects: true }) as Record<string, AreaEntry>;
  const entry = areaKey ? areaList[areaKey] : undefined;

  const areasQuery = useQuery({
    queryKey: ['areas', assessment?.id],
    queryFn: () => fetchAreas(assessment!.id),
    enabled: !!assessment,
  });

  const casesQuery = useQuery({
    queryKey: ['area-cases', areaKey],
    queryFn: () => fetchAreaCases(areaKey!),
    enabled: !!entry,
  });

  const activate = useMutation({
    mutationFn: () => activateArea(assessment!.id, areaKey!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['areas', assessment?.id] }),
    onError: (e) => {
      if (isPaywallError(e)) setUpgradeMsg(true);
    },
  });

  if (!entry) {
    return (
      <div className="mx-auto max-w-6xl">
        <Alert variant="destructive">
          <AlertDescription>{t('common.errorGeneric')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const areaState = areasQuery.data?.items.find((a) => a.area_key === areaKey);
  const loading =
    status === 'idle' || status === 'loading' || (assessment && areasQuery.isLoading);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Link to="/areas" className="hover:underline">
              {t('nav.areas')}
            </Link>{' '}
            · {entry.name}
          </p>
          <h1 className="text-2xl font-bold">
            <span aria-hidden="true">{entry.icon}</span> {entry.name}
          </h1>
          <p className="text-sm text-muted-foreground">{t('areas.sub')}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/areas">
            <ArrowLeft className="h-3.5 w-3.5" /> {t('nav.areas')}
          </Link>
        </Button>
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && upgradeMsg && (
        <Alert className="border-primary">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">{t('areas.lockedUpgrade')}</span>
            <Button asChild size="sm" className="brand-gradient border-0 text-white">
              <Link to="/estimator">{t('dashboard.upgradeCta')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && areaState?.locked && (
        <Card className="border-dashed border-primary">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">{t('areas.stateLocked')}</p>
                <p className="text-xs text-muted-foreground">{t('areas.lockedUpgrade')}</p>
              </div>
            </div>
            <Button asChild className="brand-gradient border-0 text-white">
              <Link to="/estimator">{t('dashboard.upgradeCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && areaState && !areaState.locked && !areaState.active && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <p className="text-sm">{t('areas.activateFirst')}</p>
            <Button
              onClick={() => activate.mutate()}
              disabled={activate.isPending}
              className="brand-gradient border-0 text-white"
            >
              <LockOpen className="h-4 w-4" /> {t('areas.activate')}
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && areaState?.active && (
        <Tabs defaultValue="questionnaire">
          <TabsList>
            <TabsTrigger value="questionnaire">{t('areas.tabs.questionnaire')}</TabsTrigger>
            <TabsTrigger value="cases">{t('areas.tabs.cases')}</TabsTrigger>
          </TabsList>

          <TabsContent value="questionnaire" className="mt-4">
            <QuestionnaireEngine module="area" areaKey={areaKey} moduleLabel={entry.name} />
          </TabsContent>

          <TabsContent value="cases" className="mt-4">
            <p className="mb-3 text-xs text-muted-foreground">{t('areas.casesNote')}</p>
            {casesQuery.isLoading && <Skeleton className="h-48 w-full" />}
            {casesQuery.error && (
              <Alert variant="destructive">
                <AlertDescription>{t('common.errorGeneric')}</AlertDescription>
              </Alert>
            )}
            {casesQuery.data && (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>{t('cases.useCase')}</TableHead>
                      <TableHead>{t('cases.family')}</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>{t('cases.effort')}</TableHead>
                      <TableHead>{t('cases.maturity')}</TableHead>
                      <TableHead>{t('cases.stage')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {casesQuery.data.cases.map((c, i) => (
                      <TableRow key={c.name}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{c.family}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{c.kpi}</TableCell>
                        <TableCell className="text-sm">{c.effort}</TableCell>
                        <TableCell className="text-sm">{c.maturity}</TableCell>
                        <TableCell className="text-sm">{c.stage}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
