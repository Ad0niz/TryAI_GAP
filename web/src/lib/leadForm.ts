/**
 * Lead capture form: client-side validation + backend error mapping.
 * Mirrors wireframe-v2.html `validateLead` and the backend lead_service
 * validation order (email valid → corporate → terms → already exists).
 */
import { ApiError } from '@/api/client';

/** Free-provider domains rejected by the lead gate (mirrors backend emailrules). */
export const FREE_EMAIL_DOMAINS = [
  'gmail.',
  'googlemail.',
  'yahoo.',
  'hotmail.',
  'outlook.',
  'live.',
  'msn.',
  'icloud.',
  'me.com',
  'aol.',
  'proton.',
  'protonmail.',
  'gmx.',
  'zoho.',
  'mail.com',
  'mail.ru',
  'yandex.',
];

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim().toLowerCase());
}

export function isCorporateEmail(email: string): boolean {
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]{2,})$/.exec(email.trim().toLowerCase());
  if (!m) return false;
  const domain = m[1];
  return !FREE_EMAIL_DOMAINS.some((d) =>
    d.endsWith('.') ? domain.startsWith(d) : domain === d,
  );
}

export interface LeadFormValues {
  full_name: string;
  job_title: string;
  company_email: string;
  company_name: string;
  company_size: string;
  industry: string;
  country: string;
  terms_accepted: boolean;
}

export type LeadField = keyof LeadFormValues;

/** Maps a field to an i18n error key under `leadgate.*`. */
export type LeadErrors = Partial<Record<LeadField, string>>;

/** Client-side validation; returns i18n keys for invalid fields. */
export function validateLead(values: LeadFormValues): LeadErrors {
  const errors: LeadErrors = {};
  if (!values.full_name.trim()) errors.full_name = 'leadgate.errors.required';
  if (!values.job_title.trim()) errors.job_title = 'leadgate.errors.required';
  if (!values.company_name.trim()) errors.company_name = 'leadgate.errors.required';
  if (!isValidEmail(values.company_email)) {
    errors.company_email = 'leadgate.errors.emailInvalid';
  } else if (!isCorporateEmail(values.company_email)) {
    errors.company_email = 'leadgate.emailErr';
  }
  if (!values.terms_accepted) errors.terms_accepted = 'leadgate.errors.terms';
  return errors;
}

export interface LeadApiErrorMapping {
  field: LeadField | null;
  i18nKey: string;
  /** True when the user should be offered a link to /login. */
  suggestLogin: boolean;
}

/** Map backend lead error codes to localized UI feedback. */
export function mapLeadApiError(error: unknown): LeadApiErrorMapping {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'LEAD_EMAIL_INVALID':
        return { field: 'company_email', i18nKey: 'leadgate.errors.emailInvalid', suggestLogin: false };
      case 'LEAD_EMAIL_FREE_PROVIDER':
        return { field: 'company_email', i18nKey: 'leadgate.emailErr', suggestLogin: false };
      case 'LEAD_ALREADY_EXISTS':
        return { field: 'company_email', i18nKey: 'leadgate.errors.alreadyExists', suggestLogin: true };
      case 'TERMS_NOT_ACCEPTED':
        return { field: 'terms_accepted', i18nKey: 'leadgate.errors.terms', suggestLogin: false };
      default:
        break;
    }
  }
  return { field: null, i18nKey: 'common.errorGeneric', suggestLogin: false };
}
