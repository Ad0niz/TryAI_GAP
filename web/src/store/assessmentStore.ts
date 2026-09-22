/**
 * Assessment store (zustand): the current organization's assessment,
 * bootstrapped after login/hydrate via GET /assessments/current.
 *
 * Statuses:
 *  - idle:    never loaded (no session yet)
 *  - loading: fetch in flight
 *  - ready:   assessment available
 *  - missing: authenticated but the org has no assessment (404 ASSESSMENT_NOT_FOUND)
 *  - error:   fetch failed for another reason (network, 5xx)
 */
import { create } from 'zustand';
import { ApiError, tokenStorage } from '@/api/client';
import { fetchCurrentAssessment } from '@/api';
import type { AssessmentSummary } from '@/api/types';

export type AssessmentStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

interface AssessmentState {
  assessment: AssessmentSummary | null;
  status: AssessmentStatus;
  /** Fetch (or refetch) the current assessment. */
  load: () => Promise<AssessmentSummary | null>;
  /** Replace the cached assessment (e.g. after a mutation). */
  setAssessment: (assessment: AssessmentSummary | null) => void;
  /** Drop state on logout / session expiry. */
  clear: () => void;
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  assessment: null,
  status: 'idle',

  async load() {
    if (!tokenStorage.getAccess()) {
      set({ assessment: null, status: 'idle' });
      return null;
    }
    set({ status: 'loading' });
    try {
      const assessment = await fetchCurrentAssessment();
      set({ assessment, status: 'ready' });
      return assessment;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        set({ assessment: null, status: 'missing' });
        return null;
      }
      // Keep any previously loaded assessment on transient errors.
      set({ status: get().assessment ? 'ready' : 'error' });
      return get().assessment;
    }
  },

  setAssessment(assessment) {
    set({ assessment, status: assessment ? 'ready' : 'missing' });
  },

  clear() {
    set({ assessment: null, status: 'idle' });
  },
}));

/** Convenience hook for components. */
export function useAssessment() {
  const assessment = useAssessmentStore((s) => s.assessment);
  const status = useAssessmentStore((s) => s.status);
  const load = useAssessmentStore((s) => s.load);
  return { assessment, status, reload: load };
}
