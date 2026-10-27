import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import type { ResultOut } from '@/api/types';
import i18n from '@/i18n';
import es from '@/i18n/locales/es.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import pt from '@/i18n/locales/pt.json';
import { ResultMetrics } from './ResultMetrics';

const { scatter, xAxis, yAxis, referenceLine } = vi.hoisted(() => ({
  scatter: vi.fn(), xAxis: vi.fn(), yAxis: vi.fn(), referenceLine: vi.fn(),
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ScatterChart: ({ children }: PropsWithChildren) => <div>{children}</div>,
  CartesianGrid: () => null, Cell: () => null, Tooltip: () => null,
  Scatter: (props: unknown) => { scatter(props); return null; },
  XAxis: (props: unknown) => { xAxis(props); return null; },
  YAxis: (props: unknown) => { yAxis(props); return null; },
  ReferenceLine: (props: unknown) => { referenceLine(props); return null; },
}));

const base: ResultOut = {
  maturity: { average: 3, level: 'Definido', dimensions: [] },
  heatmap: { vectors: [], areas: [] }, priorities: [],
};
const keys = ['eficiencia', 'ingresos', 'experiencia', 'riesgo', 'talento'];
const data: ResultOut = {
  ...base,
  value_vectors: {
    status: 'mapping_pending', mapped_questions: 5, total_questions: 132, unmapped_numeric_answers: 1,
    vectors: keys.map((key, i) => ({ key, percentage: i === 0 ? 66.6666666667 : null, numeric_answers: i === 0 ? 3 : 0 })),
  },
  pain_readiness: {
    threshold: 3, coverage_rule: 'complete_numeric_blocks',
    points: [{ area_key: 'ventas', pain: 3, readiness: 4, quadrant: 'boundary', quick_win: false, numeric_answers: 6, total_questions: 6 }],
    pending_areas: [{ area_key: 'finanzas', numeric_answers: 2, total_questions: 16 }],
  },
};
beforeEach(() => vi.clearAllMocks());

describe('APP-14 value vectors and Pain × Readiness', () => {
  it.each(['es', 'en', 'de', 'pt'] as const)('renders real metrics, coverage and all labels in %s', async (language) => {
    await i18n.changeLanguage(language);
    const dictionary = { es, en, de, pt }[language];
    const before = structuredClone(data);
    render(<ResultMetrics results={data} />);
    expect(screen.getByText(dictionary.resultsAnalytics.vectorsTitle)).toBeInTheDocument();
    for (const name of dictionary.results.vectors) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText(dictionary.areaList.ventas.name)).toBeInTheDocument();
    expect(screen.getByText(dictionary.resultsAnalytics.quadrants.boundary)).toBeInTheDocument();
    expect(screen.queryByText(dictionary.resultsAnalytics.quadrants.high_high)).not.toBeInTheDocument();
    expect(screen.getAllByText(dictionary.resultsPdf.noData)).toHaveLength(4);
    expect(screen.getByText(`${new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(66.6666666667)} %`)).toBeInTheDocument();
    expect(screen.getByText(i18n.t('resultsAnalytics.mappingPending', { mapped: 5, total: 132 }))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('resultsPreview.coverage', { count: 2, total: 16 }), { exact: false })).toBeInTheDocument();
    const chart = scatter.mock.calls.at(-1)![0];
    expect(chart.data).toEqual([{ ...data.pain_readiness!.points[0], name: dictionary.areaList.ventas.name }]);
    expect(xAxis.mock.calls.at(-1)![0]).toMatchObject({ dataKey: 'readiness', domain: [1, 5] });
    expect(yAxis.mock.calls.at(-1)![0]).toMatchObject({ dataKey: 'pain', domain: [1, 5] });
    expect(referenceLine.mock.calls.map(([props]) => [props.x, props.y])).toContainEqual([3, undefined]);
    expect(referenceLine.mock.calls.map(([props]) => [props.x, props.y])).toContainEqual([undefined, 3]);
    expect(document.body.textContent).not.toMatch(/resultsAnalytics\.|\{\{/);
    expect(data).toEqual(before);
  });

  it.each(['es', 'en', 'de', 'pt'] as const)('shows missing schema honestly in %s with no zero bars or chart', async (language) => {
    await i18n.changeLanguage(language);
    render(<ResultMetrics results={base} />);
    expect(screen.getByText(i18n.t('resultsAnalytics.schemaPending'))).toBeInTheDocument();
    expect(screen.getAllByText(i18n.t('resultsPdf.noData'))).toHaveLength(5);
    expect(screen.getByText(i18n.t('resultsAnalytics.noPoints'))).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(scatter).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('0 %');
  });

  it('uses server classification without rounding a near-boundary point into a different quadrant', async () => {
    await i18n.changeLanguage('es');
    render(<ResultMetrics results={{ ...data, pain_readiness: {
      ...data.pain_readiness!, points: [{ ...data.pain_readiness!.points[0], pain: 3.001,
        readiness: 3.001, quadrant: 'high_high', quick_win: true }],
    } }} />);
    expect(screen.getByText('Quick Win')).toBeInTheDocument();
    expect(scatter.mock.calls.at(-1)![0].data[0].pain).toBe(3.001);
  });
});
