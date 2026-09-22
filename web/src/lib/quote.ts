/**
 * Quote math for the estimator — mirrors backend estimator_service.create_quote
 * exactly so the live preview matches the persisted quote:
 *
 *   lines:   base (always) + area reviews + support sessions + final validation
 *   review:  charged per area with review=true (regardless of active)
 *   session: support_session × sessions, only for areas with active=true
 *   discount: subtotal × discountPct/100 (backend applies 10% for valid codes)
 */
import type { PricingResponse } from '@/api/types';

export const MAX_SESSIONS_PER_AREA = 3;

export interface QuoteAreaConfig {
  area_key: string;
  active: boolean;
  review: boolean;
  sessions: number;
}

export interface QuoteLineOut {
  concept: 'base_price' | 'area_review' | 'support_session' | 'final_report_validation';
  amount: number;
}

export interface ComputedQuote {
  lines: QuoteLineOut[];
  subtotal: number;
  discount: number;
  total: number;
  reviewCount: number;
  sessionCount: number;
}

export function isValidSessions(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_SESSIONS_PER_AREA;
}

export function computeQuote(
  pricing: Pick<
    PricingResponse,
    'base_price' | 'area_review' | 'support_session' | 'final_report_validation'
  >,
  areas: QuoteAreaConfig[],
  finalReport: boolean,
  discountPct = 0,
): ComputedQuote {
  const lines: QuoteLineOut[] = [{ concept: 'base_price', amount: pricing.base_price }];

  const reviewCount = areas.filter((a) => a.review).length;
  const reviewTotal = reviewCount * pricing.area_review;
  if (reviewTotal > 0) lines.push({ concept: 'area_review', amount: reviewTotal });

  const sessionCount = areas
    .filter((a) => a.active)
    .reduce((sum, a) => sum + (isValidSessions(a.sessions) ? a.sessions : 0), 0);
  const sessionTotal = sessionCount * pricing.support_session;
  if (sessionTotal > 0) lines.push({ concept: 'support_session', amount: sessionTotal });

  const finalTotal = finalReport ? pricing.final_report_validation : 0;
  if (finalTotal > 0) lines.push({ concept: 'final_report_validation', amount: finalTotal });

  const subtotal = pricing.base_price + reviewTotal + sessionTotal + finalTotal;
  const discount = discountPct > 0 ? round2((subtotal * discountPct) / 100) : 0;
  const total = round2(subtotal - discount);

  return { lines, subtotal, discount, total, reviewCount, sessionCount };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "Consultor asesorado" profile: any human accompaniment add-on selected. */
export function hasHumanAccompaniment(areas: QuoteAreaConfig[], finalReport: boolean): boolean {
  return finalReport || areas.some((a) => a.review || (a.active && a.sessions > 0));
}

/** Format a money amount with the quote currency. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
