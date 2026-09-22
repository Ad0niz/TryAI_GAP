import { describe, expect, it } from 'vitest';
import {
  isFinalPaymentStatus,
  isMockCheckoutUrl,
  newIdempotencyKey,
  parseMockSessionId,
  paymentIdFromMockSession,
  pollPaymentStatus,
} from './paymentFlow';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('idempotency-key generation', () => {
  it('produces RFC4122 v4 UUIDs', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(newIdempotencyKey()).toMatch(UUID_RE);
    }
  });

  it('generates a unique key per attempt', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(200);
  });
});

describe('mock checkout URL parsing', () => {
  const paymentId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const url = `http://localhost:5173/payment/checkout?mock_session=cs_mock_${paymentId}`;

  it('detects and parses the dev mock session', () => {
    expect(isMockCheckoutUrl(url)).toBe(true);
    expect(parseMockSessionId(url)).toBe(`cs_mock_${paymentId}`);
    expect(paymentIdFromMockSession(`cs_mock_${paymentId}`)).toBe(paymentId);
  });

  it('rejects real Stripe URLs and malformed markers', () => {
    expect(isMockCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(false);
    expect(isMockCheckoutUrl('http://x/?mock_session=cs_test_123')).toBe(false);
    expect(parseMockSessionId('http://x/?other=1')).toBeNull();
    expect(paymentIdFromMockSession('cs_test_123')).toBeNull();
    expect(paymentIdFromMockSession('cs_mock_')).toBeNull();
  });
});

describe('payment status polling', () => {
  const noSleep = () => Promise.resolve();

  it('stops as soon as the payment succeeds', async () => {
    const seq = ['pending', 'pending', 'succeeded'];
    let calls = 0;
    const status = await pollPaymentStatus(
      () => Promise.resolve(seq[Math.min(calls++, seq.length - 1)]),
      { maxAttempts: 10, sleep: noSleep },
    );
    expect(status).toBe('succeeded');
    expect(calls).toBe(3);
  });

  it('stops on a terminal failure without exhausting attempts', async () => {
    const seq = ['pending', 'failed', 'pending'];
    let calls = 0;
    const status = await pollPaymentStatus(
      () => Promise.resolve(seq[Math.min(calls++, seq.length - 1)]),
      { maxAttempts: 10, sleep: noSleep },
    );
    expect(status).toBe('failed');
    expect(calls).toBe(2);
  });

  it('returns the last known status when attempts run out', async () => {
    let calls = 0;
    const status = await pollPaymentStatus(() => {
      calls += 1;
      return Promise.resolve('pending');
    }, { maxAttempts: 4, sleep: noSleep });
    expect(status).toBe('pending');
    expect(calls).toBe(4);
  });

  it('treats canceled as a final status', () => {
    expect(isFinalPaymentStatus('canceled')).toBe(true);
    expect(isFinalPaymentStatus('pending')).toBe(false);
    expect(isFinalPaymentStatus('processing')).toBe(false);
  });
});
