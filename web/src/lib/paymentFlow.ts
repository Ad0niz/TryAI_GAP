/**
 * Simulated-payment flow helpers.
 *
 * Dev backend (no real Stripe keys) answers POST /payments/checkout-session
 * with a mock session whose checkout_url is
 *   `{success_url}?mock_session=cs_mock_{payment_id}`
 * The app detects that marker and routes to an in-app simulated checkout
 * instead of redirecting to Stripe.
 */

export const MOCK_SESSION_PREFIX = 'cs_mock_';

/** One idempotency key per checkout attempt (UUID v4). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts: RFC4122 v4 shape from random bytes.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Extract the mock session id (cs_mock_…) from a checkout URL, if present. */
export function parseMockSessionId(checkoutUrl: string): string | null {
  const match = /[?&]mock_session=([^&]+)/.exec(checkoutUrl);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  return id.startsWith(MOCK_SESSION_PREFIX) ? id : null;
}

export function isMockCheckoutUrl(checkoutUrl: string): boolean {
  return parseMockSessionId(checkoutUrl) !== null;
}

/** payment_id is embedded in the mock session id: cs_mock_{payment_id}. */
export function paymentIdFromMockSession(sessionId: string): string | null {
  if (!sessionId.startsWith(MOCK_SESSION_PREFIX)) return null;
  const id = sessionId.slice(MOCK_SESSION_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function isFinalPaymentStatus(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

/** sessionStorage keys used to hand the payment context between pages. */
export const PAYMENT_SESSION_KEYS = {
  paymentId: 'tryaigap.lastPaymentId',
  providerRef: 'tryaigap.lastProviderRef',
} as const;

export interface PollOptions {
  maxAttempts?: number;
  intervalMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Poll a payment-status fetcher until the status is final or attempts run out.
 * Resolves with the last seen status (caller decides how to render it).
 */
export async function pollPaymentStatus(
  fetchStatus: () => Promise<string>,
  options: PollOptions = {},
): Promise<string> {
  const { maxAttempts = 10, intervalMs = 1500, sleep = defaultSleep } = options;
  let last = 'pending';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await fetchStatus();
    if (isFinalPaymentStatus(last)) return last;
    if (attempt < maxAttempts - 1) await sleep(intervalMs);
  }
  return last;
}
