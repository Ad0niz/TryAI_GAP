import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReview, fetchReview, fetchReviews, submitReviewRating } from '@/api';
import { ApiError } from '@/api/client';
import type { AssessmentSummary, ReviewListResponse, ReviewOut } from '@/api/types';
import i18n from '@/i18n';
import { useAssessmentStore } from '@/store/assessmentStore';
import { useAuthStore } from '@/store/authStore';
import Review from './Review';

vi.mock('@/api', async () => ({
  ...await vi.importActual<typeof import('@/api')>('@/api'),
  createReview: vi.fn(), fetchReview: vi.fn(), fetchReviews: vi.fn(), submitReviewRating: vi.fn(),
}));

const assessment: AssessmentSummary = { id: 'assessment-a', organization_id: 'org-a', plan: 'pro', status: 'in_progress',
  progress: { maturity: 100, areas_overall: 0 }, free_preview_reached: true };
const history: ReviewListResponse = { assessment_id: assessment.id, items: [
  { review_id: 'new', mode: 'async', stage: 1, consultant: null, created_at: '2026-10-29T12:00:00Z', updated_at: '2026-10-29T12:00:00Z' },
  { review_id: 'old', mode: 'sync', stage: 2, consultant: 'Consultor sintético', created_at: '2026-10-28T12:00:00Z', updated_at: '2026-10-29T12:00:00Z' },
] };
const detail = (id: string): ReviewOut => ({ review_id: id, stage: id === 'old' ? 2 : 1,
  consultant: id === 'old' ? 'Consultor sintético' : null,
  chapters: [{ chapter_key: 'data', validated: true, note: `Detail ${id}`, validated_at: '2026-10-29T12:00:00Z' }],
});

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await i18n.changeLanguage('es');
  useAuthStore.setState({ user: { id: 'user-a', email: 'synthetic@example.test', role: 'client', locale: 'es', organization_id: 'org-a' }, status: 'authenticated' });
  useAssessmentStore.setState({ assessment: { ...assessment }, status: 'ready' });
  vi.mocked(fetchReviews).mockResolvedValue(structuredClone(history));
  vi.mocked(fetchReview).mockImplementation(async id => detail(id));
});

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><MemoryRouter><Review /></MemoryRouter></QueryClientProvider>);
}

describe('APP-17 review history', () => {
  it.each(['es', 'en', 'de', 'pt'])('shows an empty assessment and request form in %s', async lang => {
    await i18n.changeLanguage(lang);
    vi.mocked(fetchReviews).mockResolvedValue({ assessment_id: assessment.id, items: [] });
    mount();
    expect(await screen.findByText(i18n.t('reviewHistory.empty'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('review.requestCta') })).toBeInTheDocument();
    expect(fetchReviews).toHaveBeenCalledWith(assessment.id);
    expect(fetchReview).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/reviewHistory\.|\{\{/);
  });

  it('discovers multiple reviews and opens their details without trusting a legacy browser ID', async () => {
    localStorage.setItem('tryaigap.review.assessment-a', 'foreign-browser-id');
    mount();
    expect(await screen.findByText('Detail new')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: i18n.t('reviewHistory.open') });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(buttons[1]);
    expect(await screen.findByText('Detail old')).toBeInTheDocument();
    expect(screen.queryByText('Detail new')).not.toBeInTheDocument();
    expect(fetchReview).not.toHaveBeenCalledWith('foreign-browser-id');
    expect(screen.getByRole('button', { name: i18n.t('review.rateCta') })).toBeInTheDocument();
  });

  it('finds existing reviews again after reopening with no saved review identifier', async () => {
    const first = mount();
    await screen.findByText('Detail new');
    first.unmount();
    localStorage.clear();
    mount();
    expect(await screen.findByText('Detail new')).toBeInTheDocument();
    expect(fetchReviews).toHaveBeenCalledTimes(2);
  });

  it('creates a review, refreshes the server history and opens the new detail', async () => {
    vi.mocked(fetchReviews).mockResolvedValueOnce({ assessment_id: assessment.id, items: [] }).mockResolvedValue({
      assessment_id: assessment.id, items: [{ ...history.items[0], review_id: 'created' }],
    });
    vi.mocked(createReview).mockResolvedValue({ review_id: 'created', mode: 'async', stage: 1 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('review.requestCta') }));
    expect(await screen.findByText('Detail created')).toBeInTheDocument();
    expect(createReview).toHaveBeenCalledWith({ assessment_id: assessment.id, mode: 'async' });
    expect(localStorage.getItem('tryaigap.review.assessment-a')).toBeNull();
  });

  it('handles the existing Pro requirement without hiding the empty history', async () => {
    vi.mocked(fetchReviews).mockResolvedValue({ assessment_id: assessment.id, items: [] });
    vi.mocked(createReview).mockRejectedValue(new ApiError(402, { code: 'PLAN_UPGRADE_REQUIRED', message: 'Pro' }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('review.requestCta') }));
    expect(await screen.findByText(i18n.t('review.needPro'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: i18n.t('common.upgrade') })).toHaveAttribute('href', '/estimator');
    expect(screen.getByText(i18n.t('reviewHistory.empty'))).toBeInTheDocument();
  });

  it('recovers the server history when another session already requested a review', async () => {
    vi.mocked(fetchReviews).mockResolvedValueOnce({ assessment_id: assessment.id, items: [] }).mockResolvedValue(history);
    vi.mocked(createReview).mockRejectedValue(new ApiError(409, { code: 'REVIEW_ALREADY_REQUESTED', message: 'Conflict' }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('review.requestCta') }));
    expect(await screen.findByText('Detail new')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('review.requestedInfo'))).toBeInTheDocument();
  });

  it.each([403, 404])('handles list HTTP %s without a request form or detail', async status => {
    vi.mocked(fetchReviews).mockRejectedValue(new ApiError(status, { code: 'REJECTED', message: 'PRIVATE DETAILS' }));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t(status === 403 ? 'reviewHistory.forbidden' : 'reviewHistory.notFound'));
    expect(screen.queryByRole('button', { name: i18n.t('review.requestCta') })).not.toBeInTheDocument();
    expect(fetchReview).not.toHaveBeenCalled();
    expect(screen.queryByText('PRIVATE DETAILS')).not.toBeInTheDocument();
  });

  it.each([403, 404])('handles detail HTTP %s while keeping the authorized history', async status => {
    vi.mocked(fetchReview).mockRejectedValue(new ApiError(status, { code: 'REJECTED', message: 'PRIVATE DETAILS' }));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t(status === 403 ? 'reviewHistory.forbidden' : 'reviewHistory.notFound'));
    expect(screen.getAllByRole('button', { name: i18n.t('reviewHistory.open') })).toHaveLength(2);
    expect(screen.queryByText('PRIVATE DETAILS')).not.toBeInTheDocument();
  });

  it('shows loading and permits retry after a list failure', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(fetchReviews).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValue(history);
    mount();
    expect(screen.getByRole('status', { name: i18n.t('reviewHistory.loading') })).toBeInTheDocument();
    await act(async () => reject(new Error('offline')));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('reviewHistory.error'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('reviewHistory.retry') }));
    expect(await screen.findByText('Detail new')).toBeInTheDocument();
  });

  it('does not expose cached history or detail before authorization is revalidated', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    client.setQueryData(['reviews', 'user-a', assessment.id], history);
    client.setQueryData(['review', 'user-a', assessment.id, 'new'], detail('new'));
    let reject!: (error: Error) => void;
    vi.mocked(fetchReviews).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    mount(client);
    expect(screen.queryByText('Detail new')).not.toBeInTheDocument();
    expect(fetchReview).not.toHaveBeenCalled();
    await act(async () => reject(new ApiError(403, { code: 'FORBIDDEN', message: 'Forbidden' })));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('reviewHistory.forbidden'));
    expect(screen.queryByText('Detail new')).not.toBeInTheDocument();
  });

  it('clears the visible detail when the user and assessment change', async () => {
    mount();
    await screen.findByText('Detail new');
    vi.mocked(fetchReviews).mockResolvedValue({ assessment_id: 'assessment-b', items: [{ ...history.items[0], review_id: 'other-own' }] });
    await act(async () => {
      useAuthStore.setState({ user: { id: 'user-b', email: 'other@example.test', role: 'client', locale: 'es', organization_id: 'org-b' } });
      useAssessmentStore.setState({ assessment: { ...assessment, id: 'assessment-b', organization_id: 'org-b' }, status: 'ready' });
    });
    expect(screen.queryByText('Detail new')).not.toBeInTheDocument();
    expect(await screen.findByText('Detail other-own')).toBeInTheDocument();
    await waitFor(() => expect(fetchReviews).toHaveBeenCalledWith('assessment-b'));
  });
});

it('allows a new request when every historical review is completed', async () => {
  vi.mocked(fetchReviews).mockResolvedValue({ assessment_id: assessment.id, items: [{ ...history.items[1] }] });
  mount();
  await screen.findByText('Detail old');
  expect(screen.getByRole('button', { name: i18n.t('review.requestCta') })).toBeInTheDocument();
});

it('preserves consultant rating from an opened historical review', async () => {
  vi.mocked(fetchReviews).mockResolvedValue({ assessment_id: assessment.id, items: [{ ...history.items[1] }] });
  vi.mocked(submitReviewRating).mockResolvedValue({ rating_id: 'rating-a', average: 4 });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('review.rateCta') }));
  const save = screen.getByRole('button', { name: i18n.t('evaluation.save') });
  const form = save.closest('form')!;
  const groups = within(form).getAllByRole('radiogroup');
  for (const [index, value] of [3, 4, 5].entries()) {
    fireEvent.click(within(groups[index]).getByRole('radio', { name: new RegExp(`^${value} `) }));
  }
  fireEvent.click(save);
  expect(await screen.findByText(i18n.t('evaluation.successTitle'))).toBeInTheDocument();
  expect(submitReviewRating).toHaveBeenCalledWith('old', { chapter_key: 'overall', knowledge: 3, friendliness: 4, methodology: 5, comments: null });
  expect(localStorage.getItem('tryaigap.rated.old')).toBe('4');
});
