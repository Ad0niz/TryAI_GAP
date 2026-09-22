import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStorage } from '@/api/client';
import { useAssessmentStore } from './assessmentStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SUMMARY = {
  id: 'a-1',
  organization_id: 'org-1',
  plan: 'free',
  status: 'in_progress',
  started_at: '2026-07-01T10:00:00Z',
  completed_at: null,
  progress: { maturity: 25, areas_overall: 0 },
  free_preview_reached: false,
};

describe('assessment store', () => {
  beforeEach(() => {
    useAssessmentStore.setState({ assessment: null, status: 'idle' });
  });

  it('load() fetches GET /assessments/current and becomes ready', async () => {
    tokenStorage.set('acc', 'ref');
    const mock = vi.fn().mockResolvedValue(jsonResponse(200, SUMMARY));
    vi.stubGlobal('fetch', mock);

    const result = await useAssessmentStore.getState().load();
    expect(result?.id).toBe('a-1');
    expect(useAssessmentStore.getState().status).toBe('ready');
    expect(useAssessmentStore.getState().assessment?.progress.maturity).toBe(25);
    expect((mock.mock.calls[0][0] as string).endsWith('/assessments/current')).toBe(true);
  });

  it('load() maps 404 ASSESSMENT_NOT_FOUND to status missing', async () => {
    tokenStorage.set('acc', 'ref');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, {
          error: { code: 'ASSESSMENT_NOT_FOUND', message: 'nope' },
        }),
      ),
    );

    const result = await useAssessmentStore.getState().load();
    expect(result).toBeNull();
    expect(useAssessmentStore.getState().status).toBe('missing');
    expect(useAssessmentStore.getState().assessment).toBeNull();
  });

  it('load() without tokens is a no-op (idle)', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    const result = await useAssessmentStore.getState().load();
    expect(result).toBeNull();
    expect(mock).not.toHaveBeenCalled();
    expect(useAssessmentStore.getState().status).toBe('idle');
  });

  it('clear() drops the cached assessment', () => {
    useAssessmentStore.setState({ assessment: SUMMARY, status: 'ready' });
    useAssessmentStore.getState().clear();
    expect(useAssessmentStore.getState().assessment).toBeNull();
    expect(useAssessmentStore.getState().status).toBe('idle');
  });
});
