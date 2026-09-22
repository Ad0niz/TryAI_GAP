/**
 * Local answer state + scoring helpers for the questionnaire engine.
 * An "answered" question for progress purposes is any entry with a recorded
 * state (answered | idk | delegated); scores only average numeric values.
 */
import type { AnswerListItem, BatchAnswerItem } from '@/api/types';

export type AnswerState = 'answered' | 'idk' | 'delegated';

export interface LocalAnswer {
  value: number | null;
  state: AnswerState;
}

/** question_id → local answer. */
export type AnswersMap = Record<string, LocalAnswer>;

/** Merge server-side answers into the local map shape. */
export function mergeServerAnswers(items: AnswerListItem[]): AnswersMap {
  const map: AnswersMap = {};
  for (const item of items) {
    map[item.question_id] = {
      value: item.value ?? null,
      state: (item.state as AnswerState) || 'answered',
    };
  }
  return map;
}

/**
 * Build batch payload items for the dirty question ids.
 * `answered` requires a 1-5 value; idk/delegated are sent with value null.
 */
export function toBatchItems(dirtyIds: Iterable<string>, answers: AnswersMap): BatchAnswerItem[] {
  const items: BatchAnswerItem[] = [];
  for (const id of dirtyIds) {
    const a = answers[id];
    if (!a) continue;
    if (a.state === 'answered' && (a.value === null || a.value < 1 || a.value > 5)) continue;
    items.push({
      question_id: id,
      value: a.state === 'answered' ? a.value : null,
      state: a.state,
    });
  }
  return items;
}

/** Average of numeric answers over the given question ids (0 when none). */
export function averageScore(answers: AnswersMap, questionIds: string[]): number {
  let sum = 0;
  let n = 0;
  for (const id of questionIds) {
    const v = answers[id]?.value;
    if (typeof v === 'number') {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

/** Count of questions with any recorded answer state. */
export function countAnswered(answers: AnswersMap, questionIds: string[]): number {
  let n = 0;
  for (const id of questionIds) {
    if (answers[id]) n += 1;
  }
  return n;
}

/** Maturity level index 0-5 for a 0-5 score (0 = no data). */
export function levelIndex(score: number): number {
  if (score >= 4.5) return 5;
  if (score >= 3.5) return 4;
  if (score >= 2.5) return 3;
  if (score >= 1.5) return 2;
  if (score > 0) return 1;
  return 0;
}
