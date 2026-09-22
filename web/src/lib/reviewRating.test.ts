import { describe, expect, it } from 'vitest';
import { isRatingComplete, isValidScore, ratingAverage } from './reviewRating';

describe('review rating validation', () => {
  it('accepts integer scores from 1 to 5 only', () => {
    for (const ok of [1, 2, 3, 4, 5]) expect(isValidScore(ok)).toBe(true);
    for (const bad of [0, 6, -1, 2.5, Number.NaN, null, undefined]) {
      expect(isValidScore(bad)).toBe(false);
    }
  });

  it('requires all three dimensions', () => {
    expect(isRatingComplete({ knowledge: 5, friendliness: 4, methodology: 3 })).toBe(true);
    expect(isRatingComplete({ knowledge: 5, friendliness: 4 })).toBe(false);
    expect(isRatingComplete({ knowledge: 5, friendliness: 4, methodology: 0 })).toBe(false);
    expect(isRatingComplete({})).toBe(false);
  });

  it('computes the one-decimal average like the backend', () => {
    expect(ratingAverage({ knowledge: 5, friendliness: 4, methodology: 4 })).toBe(4.3);
    expect(ratingAverage({ knowledge: 5, friendliness: 5, methodology: 5 })).toBe(5);
    expect(ratingAverage({ knowledge: 1, friendliness: 1, methodology: 2 })).toBe(1.3);
    expect(ratingAverage({ knowledge: 5 })).toBeNull();
  });
});
