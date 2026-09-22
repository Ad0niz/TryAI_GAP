import { describe, expect, it } from 'vitest';
import { computeQuote, hasHumanAccompaniment, isValidSessions, MAX_SESSIONS_PER_AREA } from './quote';

const PRICING = {
  base_price: 500,
  area_review: 200,
  support_session: 150,
  final_report_validation: 400,
};

describe('quote calculation', () => {
  it('base package only → subtotal equals base price, no extras', () => {
    const q = computeQuote(PRICING, [], false);
    expect(q.subtotal).toBe(500);
    expect(q.discount).toBe(0);
    expect(q.total).toBe(500);
    expect(q.lines).toEqual([{ concept: 'base_price', amount: 500 }]);
  });

  it('adds one line per concept with backend-identical amounts', () => {
    const areas = [
      { area_key: 'ventas', active: true, review: true, sessions: 2 },
      { area_key: 'finanzas', active: true, review: false, sessions: 1 },
      { area_key: 'rrhh', active: false, review: true, sessions: 3 }, // review charged, sessions not (inactive)
    ];
    const q = computeQuote(PRICING, areas, true);
    // base 500 + reviews 2×200 + sessions (2+1)×150 + final 400
    expect(q.reviewCount).toBe(2);
    expect(q.sessionCount).toBe(3);
    expect(q.subtotal).toBe(500 + 400 + 450 + 400);
    expect(q.lines.map((l) => l.concept)).toEqual([
      'base_price',
      'area_review',
      'support_session',
      'final_report_validation',
    ]);
  });

  it('sessions of inactive areas are never charged', () => {
    const q = computeQuote(
      PRICING,
      [{ area_key: 'legal', active: false, review: false, sessions: 3 }],
      false,
    );
    expect(q.subtotal).toBe(500);
  });

  it('applies the distributor discount over the subtotal', () => {
    const areas = [{ area_key: 'ventas', active: true, review: true, sessions: 0 }];
    const q = computeQuote(PRICING, areas, true, 10);
    // subtotal 500+200+400 = 1100 → 10% = 110 → total 990
    expect(q.subtotal).toBe(1100);
    expect(q.discount).toBe(110);
    expect(q.total).toBe(990);
  });

  it('rounds discount to two decimals', () => {
    const q = computeQuote({ ...PRICING, base_price: 333.33 }, [], false, 10);
    expect(q.discount).toBe(33.33);
    expect(q.total).toBe(300);
  });

  it('omits zero-amount lines', () => {
    const q = computeQuote(PRICING, [{ area_key: 'ventas', active: true, review: false, sessions: 0 }], false);
    expect(q.lines).toHaveLength(1);
  });
});

describe('session bounds and profiles', () => {
  it('validates 0..3 sessions per area', () => {
    expect(isValidSessions(0)).toBe(true);
    expect(isValidSessions(MAX_SESSIONS_PER_AREA)).toBe(true);
    expect(isValidSessions(MAX_SESSIONS_PER_AREA + 1)).toBe(false);
    expect(isValidSessions(-1)).toBe(false);
    expect(isValidSessions(1.5)).toBe(false);
  });

  it('self-service vs asesorado profile detection', () => {
    expect(hasHumanAccompaniment([], false)).toBe(false);
    expect(hasHumanAccompaniment([{ area_key: 'a', active: true, review: true, sessions: 0 }], false)).toBe(true);
    expect(hasHumanAccompaniment([{ area_key: 'a', active: true, review: false, sessions: 1 }], false)).toBe(true);
    expect(hasHumanAccompaniment([], true)).toBe(true);
    // sessions on an inactive area do not count as accompaniment
    expect(hasHumanAccompaniment([{ area_key: 'a', active: false, review: false, sessions: 2 }], false)).toBe(false);
  });
});
