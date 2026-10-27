import { useTranslation } from 'react-i18next';
import { CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { ResultOut } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const vectorKeys = ['eficiencia', 'ingresos', 'experiencia', 'riesgo', 'talento'];

/** Pro result details: coordinates and percentages are supplied by the backend. */
export function ResultMetrics({ results }: { results: ResultOut }) {
  const { t, i18n } = useTranslation();
  const format = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language,
    { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value);
  const vectors = results.value_vectors;
  const matrix = results.pain_readiness;
  const names = t('results.vectors', { returnObjects: true }) as string[];
  const points = matrix?.points.map((point) => ({
    ...point, name: t(`areaList.${point.area_key}.name`),
  })) ?? [];
  const quadrantLabel = (key: string) => t(`resultsAnalytics.quadrants.${key}`);

  return <>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('resultsAnalytics.vectorsTitle')}</CardTitle>
        <CardDescription>{t('resultsAnalytics.vectorsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(!vectors || vectors.status === 'schema_pending') && <p className="text-sm text-muted-foreground">{t('resultsAnalytics.schemaPending')}</p>}
        {vectors?.status === 'mapping_pending' && <p className="text-sm text-muted-foreground">{t('resultsAnalytics.mappingPending', {
          mapped: vectors.mapped_questions, total: vectors.total_questions,
        })}</p>}
        {vectorKeys.map((key, index) => {
          const vector = vectors?.vectors.find((item) => item.key === key);
          const percentage = vector?.percentage;
          return <div key={key}>
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">{names[index]}</span>
              <span>{percentage == null ? t('resultsPdf.noData') : `${format(percentage)} %`}</span>
            </div>
            {vector && percentage != null && <>
              <Progress aria-label={names[index]} value={percentage} className="h-2" />
              <p className="mt-1 text-xs text-muted-foreground">{t('resultsAnalytics.answerCount', { count: vector.numeric_answers })}</p>
            </>}
          </div>;
        })}
        {!!vectors?.unmapped_numeric_answers && <p className="text-sm text-muted-foreground">{t('resultsAnalytics.unmapped', { count: vectors.unmapped_numeric_answers })}</p>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('resultsAnalytics.matrixTitle')}</CardTitle>
        <CardDescription>{t('resultsAnalytics.matrixDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('resultsAnalytics.coverageRule')}</p>
        <p className="text-sm text-muted-foreground">{t('resultsAnalytics.boundaryRule')}</p>
        {points.length === 0 ? <p>{t('resultsAnalytics.noPoints')}</p> : <>
          <div role="img" aria-label={t('resultsAnalytics.matrixTitle')}>
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 15, right: 25, bottom: 30, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="readiness" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]}
                  name={t('resultsAnalytics.readiness')} label={{ value: t('resultsAnalytics.readiness'), position: 'bottom' }} />
                <YAxis type="number" dataKey="pain" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]}
                  name={t('resultsAnalytics.pain')} label={{ value: t('resultsAnalytics.pain'), angle: -90, position: 'insideLeft' }} />
                <ReferenceLine x={matrix!.threshold} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                <ReferenceLine y={matrix!.threshold} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                <Tooltip content={({ active, payload }) => {
                  const point = active ? payload?.[0]?.payload as typeof points[number] | undefined : undefined;
                  return point ? <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                    <p className="font-medium">{point.name}</p>
                    <p>{t('resultsAnalytics.pain')}: {format(point.pain)}</p>
                    <p>{t('resultsAnalytics.readiness')}: {format(point.readiness)}</p>
                    <p>{quadrantLabel(point.quadrant)}</p>
                  </div> : null;
                }} />
                <Scatter data={points} name={t('resultsUI.thArea')} isAnimationActive={false}>
                  {points.map((point) => <Cell key={point.area_key} fill={point.quick_win ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-sm">{t('resultsAnalytics.legend')}</p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t('resultsUI.thArea')}</TableHead>
              <TableHead>{t('resultsAnalytics.pain')}</TableHead>
              <TableHead>{t('resultsAnalytics.readiness')}</TableHead>
              <TableHead>{t('resultsAnalytics.classification')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{points.map((point) => <TableRow key={point.area_key}>
              <TableCell>{point.name}</TableCell>
              <TableCell>{format(point.pain)}</TableCell>
              <TableCell>{format(point.readiness)}</TableCell>
              <TableCell><Badge variant={point.quick_win ? 'default' : 'secondary'}>{quadrantLabel(point.quadrant)}</Badge></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </>}
        {!!matrix?.pending_areas.length && <div className="space-y-1 text-sm text-muted-foreground">
          <p>{t('resultsAnalytics.pendingAreas')}</p>
          <ul className="list-inside list-disc">{matrix.pending_areas.map((area) => <li key={area.area_key}>
            {t(`areaList.${area.area_key}.name`)}: {t('resultsPreview.coverage', { count: area.numeric_answers, total: area.total_questions })}
          </li>)}</ul>
        </div>}
      </CardContent>
    </Card>
  </>;
}
