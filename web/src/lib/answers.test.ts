import { describe, expect, it } from 'vitest';
import {
  averageScore,
  countAnswered,
  levelIndex,
  mergeServerAnswers,
  toBatchItems,
  type AnswersMap,
} from './answers';

describe('answers: batch payload construction', () => {
  const answers: AnswersMap = {
    q1: { value: 4, state: 'answered' },
    q2: { value: null, state: 'idk' },
    q3: { value: null, state: 'delegated' },
    q4: { value: null, state: 'answered' }, // invalid: answered without value → skipped
  };

  it('toBatchItems sends answered values and nulls for idk/delegated', () => {
    const items = toBatchItems(['q1', 'q2', 'q3', 'q4'], answers);
    expect(items).toEqual([
      { question_id: 'q1', value: 4, state: 'answered' },
      { question_id: 'q2', value: null, state: 'idk' },
      { question_id: 'q3', value: null, state: 'delegated' },
    ]);
  });

  it('toBatchItems ignores unknown ids and rejects out-of-range values', () => {
    const withBad: AnswersMap = { q5: { value: 9, state: 'answered' } };
    expect(toBatchItems(['nope', 'q5'], withBad)).toEqual([]);
  });

  it('mergeServerAnswers normalizes the server list shape', () => {
    const map = mergeServerAnswers([
      { question_id: 'q1', code: 'A1', value: 3, state: 'answered' },
      { question_id: 'q2', code: 'A2', value: null, state: 'idk' },
    ]);
    expect(map.q1).toEqual({ value: 3, state: 'answered' });
    expect(map.q2).toEqual({ value: null, state: 'idk' });
  });
});

describe('answers: scoring', () => {
  const answers: AnswersMap = {
    q1: { value: 4, state: 'answered' },
    q2: { value: 2, state: 'answered' },
    q3: { value: null, state: 'idk' },
  };

  it('averageScore only averages numeric answers', () => {
    expect(averageScore(answers, ['q1', 'q2', 'q3'])).toBe(3);
    expect(averageScore(answers, ['q3'])).toBe(0);
  });

  it('countAnswered counts any recorded state', () => {
    expect(countAnswered(answers, ['q1', 'q2', 'q3', 'q4'])).toBe(3);
  });

  it('levelIndex bucketizes the 0-5 score', () => {
    expect(levelIndex(0)).toBe(0);
    expect(levelIndex(1.2)).toBe(1);
    expect(levelIndex(1.5)).toBe(2);
    expect(levelIndex(2.5)).toBe(3);
    expect(levelIndex(3.9)).toBe(4);
    expect(levelIndex(4.7)).toBe(5);
  });
});
