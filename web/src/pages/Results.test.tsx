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
  MaturityRadar: () => <div data-testid="full-radar" />,
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
  });

  it('does not fetch details if preview authorization fails', async () => {
    vi.mocked(fetchResultsPreview).mockRejectedValue(new ApiError(403, { code: 'FORBIDDEN', message: 'Forbidden' }));
    mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(fetchResults).not.toHaveBeenCalled();
    expect(screen.queryByTestId('full-radar')).not.toBeInTheDocument();
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
