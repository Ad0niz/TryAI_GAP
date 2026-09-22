import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Lock, LockOpen } from 'lucide-react';
import { activateArea, deactivateArea, fetchAreas } from '@/api';
import { isPaywallError } from '@/lib/planGate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssessment } from '@/store/assessmentStore';
import { cn } from '@/lib/utils';

interface AreaEntry {
  name: string;
  icon: string;
  n: number;
}

/** Functional areas overview: 7 area kits with activation + progress. */
export default function Areas() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { assessment, status, reload } = useAssessment();
  const [upgradeMsg, setUpgradeMsg] = useState(false);

  useEffect(() => {
    if (status === 'idle') void reload();
  }, [status, reload]);

  const areasQuery = useQuery({
    queryKey: ['areas', assessment?.id],
    queryFn: () => fetchAreas(assessment!.id),
    enabled: !!assessment,
  });

  const activate = useMutation({
    mutationFn: (areaKey: string) => activateArea(assessment!.id, areaKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['areas', assessment?.id] }),
    onError: (e) => {
      if (isPaywallError(e)) setUpgradeMsg(true);
    },
  });

  const deactivate = useMutation({
    mutationFn: (areaKey: string) => deactivateArea(assessment!.id, areaKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['areas', assessment?.id] }),
  });

  const areaList = t('areaList', { returnObjects: true }) as Record<string, AreaEntry>;

  if (status === 'idle' || status === 'loading' || areasQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <div className="mx-auto max-w-6xl">
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('common.noAssessment')}</span>
            <Button asChild size="sm">
              <Link to="/onboarding">{t('common.startDiagnostic')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('nav.areas')}
        </p>
        <h1 className="text-2xl font-bold">{t('areas.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('areas.sub')}</p>
      </div>

      {upgradeMsg && (
        <Alert className="border-primary">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">{t('areas.lockedUpgrade')}</span>
            <Button asChild size="sm" className="brand-gradient border-0 text-white">
              <Link to="/estimator">{t('dashboard.upgradeCta')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(areasQuery.data?.items ?? []).map((area) => {
          const entry = areaList[area.area_key];
          const state = area.locked
            ? t('areas.stateLocked')
            : area.active
              ? t('areas.stateActive')
              : t('areas.stateInactive');
          return (
            <Card
              key={area.area_key}
              className={cn(
                'flex flex-col transition-shadow hover:shadow-md',
                !area.active && 'opacity-80',
              )}
            >
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl" aria-hidden="true">
                      {entry?.icon ?? '📦'}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{entry?.name ?? area.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t('areas.questions', { n: entry?.n ?? 16 })}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={area.active ? 'default' : 'secondary'}
                    className={cn(area.locked && 'gap-1')}
                  >
                    {area.locked && <Lock className="h-3 w-3" />}
                    {state}
                  </Badge>
                </div>

                <div className="mt-auto space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('areas.progressLabel')}</span>
                    <span className="font-semibold">{area.progress}%</span>
                  </div>
                  <Progress value={area.progress} className="h-1.5" />
                </div>

                <div className="flex items-center gap-2">
                  {area.active ? (
                    <>
                      <Button
                        size="sm"
                        className="brand-gradient flex-1 border-0 text-white"
                        onClick={() => navigate(`/areas/${area.area_key}`)}
                      >
                        {t('moduleCards.areas.cta')} <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deactivate.mutate(area.area_key)}
                        disabled={deactivate.isPending}
                      >
                        {t('areas.deactivate')}
                      </Button>
                    </>
                  ) : area.locked ? (
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link to="/estimator">
                        <Lock className="h-3.5 w-3.5" /> {t('common.upgrade')}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => activate.mutate(area.area_key)}
                      disabled={activate.isPending}
                    >
                      <LockOpen className="h-3.5 w-3.5" /> {t('areas.activate')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
