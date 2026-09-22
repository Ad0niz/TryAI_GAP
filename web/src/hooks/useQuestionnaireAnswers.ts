/**
 * Questionnaire answers: load existing answers, keep local edits,
 * debounced autosave via POST /assessments/{id}/answers:batch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAnswers, saveAnswersBatch } from '@/api';
import { isPaywallError } from '@/lib/planGate';
import {
  mergeServerAnswers,
  toBatchItems,
  type AnswersMap,
  type LocalAnswer,
} from '@/lib/answers';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const AUTOSAVE_DELAY_MS = 800;

interface AnswersFilter {
  module: string;
  areaKey?: string;
}

export function useQuestionnaireAnswers(
  assessmentId: string | undefined,
  filter: AnswersFilter,
) {
  const query = useQuery({
    queryKey: ['answers', assessmentId, filter.module, filter.areaKey ?? null],
    queryFn: () => fetchAnswers(assessmentId as string, filter),
    enabled: !!assessmentId,
  });

  const [answers, setAnswers] = useState<AnswersMap>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [paywallHit, setPaywallHit] = useState(false);

  const dirtyRef = useRef<Set<string>>(new Set());
  const answersRef = useRef<AnswersMap>(answers);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Hydrate from the server; never clobber unsaved local edits.
  useEffect(() => {
    if (!query.data) return;
    setAnswers((prev) => {
      const merged = mergeServerAnswers(query.data.items);
      for (const id of dirtyRef.current) {
        if (prev[id]) merged[id] = prev[id];
      }
      return merged;
    });
  }, [query.data]);

  const flush = useCallback(async () => {
    if (!assessmentId) return;
    const pending = [...dirtyRef.current];
    const items = toBatchItems(pending, answersRef.current);
    if (items.length === 0) return;
    const sent = new Set(items.map((i) => i.question_id));
    for (const id of sent) dirtyRef.current.delete(id);
    setSaveStatus('saving');
    try {
      await saveAnswersBatch(assessmentId, items);
      setSaveStatus('saved');
    } catch (e) {
      // Re-queue on failure so the next change retries.
      for (const id of sent) dirtyRef.current.add(id);
      setSaveStatus('error');
      if (isPaywallError(e)) setPaywallHit(true);
    }
  }, [assessmentId]);

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const setAnswer = useCallback((questionId: string, answer: LocalAnswer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    dirtyRef.current.add(questionId);
    setSaveStatus((s) => (s === 'saving' ? s : 'idle'));
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flushRef.current(), AUTOSAVE_DELAY_MS);
  }, []);

  // Best-effort flush on unmount (navigation away mid-edit).
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void flushRef.current();
    },
    [],
  );

  return useMemo(
    () => ({
      answers,
      setAnswer,
      saveStatus,
      saveNow: flush,
      paywallHit,
      clearPaywall: () => setPaywallHit(false),
      loading: query.isLoading,
      loadError: query.error,
    }),
    [answers, setAnswer, saveStatus, flush, paywallHit, query.isLoading, query.error],
  );
}
