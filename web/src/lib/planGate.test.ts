import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import {
  canAnswerQuestion,
  FREE_MATURITY_LIMIT,
  freeMaturityLimitReached,
  isPaywallError,
} from './planGate';

describe('plan gating UI logic', () => {
  it('detects 402 PLAN_UPGRADE_REQUIRED responses', () => {
    expect(
      isPaywallError(new ApiError(402, { code: 'PLAN_UPGRADE_REQUIRED', message: 'x' })),
    ).toBe(true);
    expect(isPaywallError(new ApiError(402, { code: 'OTHER', message: 'x' }))).toBe(true);
    expect(isPaywallError(new ApiError(403, { code: 'FORBIDDEN', message: 'x' }))).toBe(false);
    expect(isPaywallError(new Error('nope'))).toBe(false);
  });

  it('free limit only applies to the free plan', () => {
    expect(freeMaturityLimitReached('free', FREE_MATURITY_LIMIT)).toBe(true);
    expect(freeMaturityLimitReached('free', FREE_MATURITY_LIMIT - 1)).toBe(false);
    expect(freeMaturityLimitReached('pro', 999)).toBe(false);
  });

  it('pro users can always answer', () => {
    expect(canAnswerQuestion('pro', 0, false)).toBe(true);
    expect(canAnswerQuestion('pro', 100, false)).toBe(true);
  });

  it('free users can answer below the limit but not beyond', () => {
    expect(canAnswerQuestion('free', 0, false)).toBe(true);
    expect(canAnswerQuestion('free', FREE_MATURITY_LIMIT - 1, false)).toBe(true);
    expect(canAnswerQuestion('free', FREE_MATURITY_LIMIT, false)).toBe(false);
  });

  it('re-answering an already-answered question is always allowed', () => {
    expect(canAnswerQuestion('free', FREE_MATURITY_LIMIT, true)).toBe(true);
    expect(canAnswerQuestion('free', 99, true)).toBe(true);
  });
});
