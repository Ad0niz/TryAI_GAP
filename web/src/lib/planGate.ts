/**
 * Freemium / plan-gating helpers (UI logic).
 * The free plan allows FREE_MATURITY_LIMIT maturity answers; the backend
 * enforces it with 402 PLAN_UPGRADE_REQUIRED on single-answer PUT and on
 * pro-gated routes (area activation). Batch saves do NOT enforce the gate
 * server-side, so the UI must gate before offering new answers.
 */
import { ApiError } from '@/api/client';

export const FREE_MATURITY_LIMIT = 5;

/** True for 402 PLAN_UPGRADE_REQUIRED responses from the backend. */
export function isPaywallError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 402 || error.code === 'PLAN_UPGRADE_REQUIRED')
  );
}

/**
 * Whether a free-plan user may answer another maturity question.
 * `answeredMaturity` counts questions with any recorded answer
 * (answered / idk / delegated).
 */
export function freeMaturityLimitReached(plan: string, answeredMaturity: number): boolean {
  return plan === 'free' && answeredMaturity >= FREE_MATURITY_LIMIT;
}

/** Whether a new answer to `questionId` would exceed the free allowance. */
export function canAnswerQuestion(
  plan: string,
  answeredMaturity: number,
  alreadyAnswered: boolean,
): boolean {
  if (plan !== 'free') return true;
  if (alreadyAnswered) return true; // re-answering an existing answer is always allowed
  return answeredMaturity < FREE_MATURITY_LIMIT;
}
