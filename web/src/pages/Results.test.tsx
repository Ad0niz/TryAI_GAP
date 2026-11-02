vi.mock('@/hooks/useOrganizationAccess', () => ({ useOrganizationAccess: () => ({ admin: true, areaKeys: [], loading: false, error: null }) }));
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOrganization, fetchResults, fetchResultsPreview } from '@/api';
import { ApiError } from '@/api/client';
import type { AssessmentSummary, ResultOut, ResultPreviewOut } from '@/api/types';
import i18n from '@/i18n';
import { useAssessmentStore } from '@/store/assessmentStore';
import Results from './Results';

vi.mock('@/api', async () => ({
  ...await vi.importActual<typeof import('@/api')>('@/api'),
  fetchOrganization: vi.fn(), fetchResults: vi.fn(), fetchResultsPreview: vi.fn(),
}));
vi.mock('@/components/questionnaire/MaturityRadar', () => ({
  MaturityRadar: ({ data }: { data: { dim: string; score: number }[] }) => <div data-testid="full-radar" data-values={JSON.stringify(data)} />,
}));
vi.mock('@/pdf/ReportPdf', () => ({
  default: () => <div data-testid="pdf-actions" />,
}));

const assessment: AssessmentSummary = {
  id: 'assessment-a', organization_id: 'org-a', plan: 'free', status: 'in_progress',
  progress: { maturity: 25, areas_overall: 0 }, free_preview_reached: true,
};
const preview: ResultPreviewOut = {
  provisional: true, details_locked: true, average: 3, numeric_answers: 5, total_questions: 20,
};
const full: ResultOut = {
  maturity: { average: 3, level: 'Definido', dimensions: [{ key: 'datos', label: 'Datos', score: 3 }] },
  heatmap: { vectors: ['Bloque A'], areas: [{ name: 'Ventas B2B', row: [4] }] }, priorities: [],
};

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })) {
  const view = render(<QueryClientProvider client={client}><MemoryRouter><Results /></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('es');
  useAssessmentStore.setState({ assessment: { ...assessment }, status: 'ready' });
  vi.mocked(fetchResultsPreview).mockResolvedValue({ ...preview });
  vi.mocked(fetchResults).mockResolvedValue(full);
  vi.mocked(fetchOrganization).mockResolvedValue({ id: 'org-a', name: 'Company', plan: 'pro' } as Awaited<ReturnType<typeof fetchOrganization>>);
});

describe('APP-06 result preview and paywall', () => {
  it.each(['es', 'en', 'de', 'pt'])('shows a real provisional Free score and paywall in %s without requesting details', async (lang) => {
    await i18n.changeLanguage(lang);
    mount();
    expect(await screen.findByText(i18n.t('resultsPreview.provisional'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('resultsPreview.coverage', { count: 5, total: 20 }))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('resultsPreview.limited'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('resultsPreview.lockedDescription'))).toBeInTheDocument();
    const formatted = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(3);
    expect(screen.getByText(`${formatted} / 5`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: i18n.t('paywall.cta') })).toHaveAttribute('href', '/estimator');
    expect(fetchResults).not.toHaveBeenCalled();
    expect(fetchOrganization).not.toHaveBeenCalled();
    expect(screen.queryByTestId('full-radar')).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsAnalytics.vectorsTitle'))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsAnalytics.matrixTitle'))).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-actions')).not.toBeInTheDocument();
  });

  it('shows absence of numeric data instead of a zero or complete diagnosis', async () => {
    vi.mocked(fetchResultsPreview).mockResolvedValue({ ...preview, average: null, numeric_answers: 0 });
    mount();
    expect(await screen.findByText(i18n.t('resultsPreview.noNumericAnswers'))).toBeInTheDocument();
    expect(screen.queryByText('0,0 / 5')).not.toBeInTheDocument();
    expect(fetchResults).not.toHaveBeenCalled();
  });

  it('renders full results and PDF for a server-authorized Pro even with a stale Free assessment plan', async () => {
    vi.mocked(fetchResultsPreview).mockResolvedValue({ ...preview, details_locked: false });
    mount();
    expect(await screen.findByTestId('full-radar')).toBeInTheDocument();
    expect(await screen.findByTestId('pdf-actions')).toBeInTheDocument();
    expect(fetchResults).toHaveBeenCalledWith('assessment-a');
    expect(screen.getByText(i18n.t('resultsAnalytics.vectorsTitle'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('resultsAnalytics.matrixTitle'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsPreview.provisional'))).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: i18n.t('paywall.cta') })).not.toBeInTheDocument();
  });

  it('does not expose cached Pro results to a Free preview even if the local plan claims Pro', async () => {
    useAssessmentStore.setState({ assessment: { ...assessment, plan: 'pro' } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    client.setQueryData(['results', assessment.id], full);
    mount(client);
    expect(await screen.findByText(i18n.t('resultsPreview.provisional'))).toBeInTheDocument();
    expect(fetchResults).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pdf-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('full-radar')).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsAnalytics.vectorsTitle'))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsAnalytics.matrixTitle'))).not.toBeInTheDocument();
  });

  it('hides cached details if the detailed API rejects access during a plan change', async () => {
    vi.mocked(fetchResultsPreview).mockResolvedValue({ ...preview, details_locked: false });
    vi.mocked(fetchResults).mockRejectedValue(new ApiError(402, { code: 'PLAN_UPGRADE_REQUIRED', message: 'Pro required' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    client.setQueryData(['results', assessment.id], full);
    mount(client);
    expect(await screen.findByRole('link', { name: i18n.t('paywall.cta') })).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('full-radar')).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsAnalytics.vectorsTitle'))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsAnalytics.matrixTitle'))).not.toBeInTheDocument();
  });

  it('does not fetch details if preview authorization fails', async () => {
    vi.mocked(fetchResultsPreview).mockRejectedValue(new ApiError(403, { code: 'FORBIDDEN', message: 'Forbidden' }));
    mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(fetchResults).not.toHaveBeenCalled();
    expect(screen.queryByTestId('full-radar')).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsAnalytics.vectorsTitle'))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsAnalytics.matrixTitle'))).not.toBeInTheDocument();
  });

  it('refreshes access after the existing payment flow updates the assessment plan', async () => {
    const { client } = mount();
    expect(await screen.findByText(i18n.t('resultsPreview.provisional'))).toBeInTheDocument();
    vi.mocked(fetchResultsPreview).mockResolvedValue({ ...preview, details_locked: false });
    await act(async () => { useAssessmentStore.setState({ assessment: { ...assessment, plan: 'pro' } }); });
    expect(await screen.findByTestId('full-radar')).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsPreview.provisional'))).not.toBeInTheDocument();
    vi.mocked(fetchResultsPreview).mockResolvedValue(preview);
    await act(async () => { await client.invalidateQueries({ queryKey: ['results-preview', assessment.id] }); });
    await waitFor(() => expect(screen.queryByTestId('full-radar')).not.toBeInTheDocument());
    expect(await screen.findByText(i18n.t('resultsPreview.provisional'))).toBeInTheDocument();
  });
});

describe('APP-14 individual initiatives', () => {
  it.each(['es', 'en', 'de', 'pt'])('hides the empty initiative section in %s for Pro', async lang => {
    await i18n.changeLanguage(lang);
    vi.mocked(fetchResultsPreview).mockResolvedValue({ ...preview, details_locked: false });
    mount();
    await screen.findByTestId('full-radar');
    expect(screen.queryByText(i18n.t('results.priorities'))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('resultsPdf.noPriorities'))).not.toBeInTheDocument();
  });

  it('shows future initiatives supplied by the backend without generating others', async () => {
    vi.mocked(fetchResultsPreview).mockResolvedValue({ ...preview, details_locked: false });
    vi.mocked(fetchResults).mockResolvedValue({ ...full, priorities: [{
      initiative: 'Proyecto real de prueba', area: 'Ventas', vector: 'Ingresos', pain: 4, readiness: 4, recommendation: 'qw',
    }] });
    mount();
    expect(await screen.findByText('Proyecto real de prueba')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('results.priorities'))).toBeInTheDocument();
  });
});

describe('APP-14 labels follow the active interface language', () => {
  it.each(['es', 'en', 'de', 'pt'])('translates cached Spanish API labels in %s without changing data', async lang => {
    const payload: ResultOut = {
      ...structuredClone(full),
      maturity: { average: 4, level: 'Gestionado', dimensions: [
        { key: 'datos', label: 'Datos', score: 4 }, { key: 'tech', label: 'Tecnología', score: 4 },
        { key: 'talento', label: 'Talento', score: 4 }, { key: 'procesos', label: 'Procesos', score: 4 },
        { key: 'cultura', label: 'Cultura', score: 4 },
      ] },
      heatmap: { vectors: ['Bloque A', 'Bloque B', 'Bloque C', 'Bloque D'], areas: [
        { name: 'Ventas B2B', row: [4, null, 3.25, 5] },
        { name: 'Custom Datos Company', row: [2, 2, 2, 2] },
      ] },
    };
    const original = structuredClone(payload);
    vi.mocked(fetchResultsPreview).mockResolvedValue({ ...preview, details_locked: false });
    vi.mocked(fetchResults).mockResolvedValue(payload);
    mount();
    await screen.findByTestId('full-radar');
    await act(() => i18n.changeLanguage(lang));
    await waitFor(() => expect(screen.getByText(`${i18n.t('results.levelLabel')}: ${i18n.t('resultsPdf.levels.managed')}`)).toBeInTheDocument());
    const dims = i18n.t('maturity.dims', { returnObjects: true }) as { id: string; label: string }[];
    for (const dimension of dims) expect(screen.getAllByText(dimension.label).length).toBeGreaterThan(0);
    expect(JSON.parse(screen.getByTestId('full-radar').getAttribute('data-values')!)).toEqual(dims.map(d => ({ dim: d.label, score: 4 })));
    for (const block of ['A','B','C','D']) expect(screen.getByRole('columnheader', { name: i18n.t('resultsPdf.block', { block }) })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: i18n.t('areaList.ventas.name') })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Custom Datos Company' })).toBeInTheDocument();
    expect(payload).toEqual(original);
    expect(fetchResults).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('pdf-actions')).toBeInTheDocument();
  });
});
