import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import {
  isCorporateEmail,
  isValidEmail,
  mapLeadApiError,
  validateLead,
  type LeadFormValues,
} from './leadForm';

const VALID: LeadFormValues = {
  full_name: 'Margaret Reid',
  job_title: 'COO',
  company_email: 'margaret@acme.co.uk',
  company_name: 'Acme Industrial',
  company_size: '11-50',
  industry: 'Manufactura',
  country: 'España',
  terms_accepted: true,
};

describe('lead form validation', () => {
  it('accepts a complete corporate submission', () => {
    expect(validateLead(VALID)).toEqual({});
  });

  it('rejects free email providers', () => {
    for (const email of ['a@gmail.com', 'b@outlook.com', 'c@protonmail.ch', 'd@yahoo.es']) {
      expect(isCorporateEmail(email)).toBe(false);
    }
    expect(isCorporateEmail('margaret@acme.co.uk')).toBe(true);
  });

  it('rejects malformed emails', () => {
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a@b.co')).toBe(true);
  });

  it('flags missing required fields and terms', () => {
    const errors = validateLead({
      ...VALID,
      full_name: ' ',
      job_title: '',
      company_name: '',
      terms_accepted: false,
    });
    expect(errors.full_name).toBe('leadgate.errors.required');
    expect(errors.job_title).toBe('leadgate.errors.required');
    expect(errors.company_name).toBe('leadgate.errors.required');
    expect(errors.terms_accepted).toBe('leadgate.errors.terms');
  });

  it('flags invalid vs free-provider emails with different messages', () => {
    expect(validateLead({ ...VALID, company_email: 'bad' }).company_email).toBe(
      'leadgate.errors.emailInvalid',
    );
    expect(validateLead({ ...VALID, company_email: 'x@gmail.com' }).company_email).toBe(
      'leadgate.emailErr',
    );
  });
});

describe('lead API error mapping', () => {
  const apiErr = (status: number, code: string) =>
    new ApiError(status, { code, message: 'msg' });

  it('maps LEAD_EMAIL_FREE_PROVIDER to the email field', () => {
    const m = mapLeadApiError(apiErr(422, 'LEAD_EMAIL_FREE_PROVIDER'));
    expect(m.field).toBe('company_email');
    expect(m.i18nKey).toBe('leadgate.emailErr');
    expect(m.suggestLogin).toBe(false);
  });

  it('maps LEAD_ALREADY_EXISTS with a login suggestion', () => {
    const m = mapLeadApiError(apiErr(409, 'LEAD_ALREADY_EXISTS'));
    expect(m.field).toBe('company_email');
    expect(m.i18nKey).toBe('leadgate.errors.alreadyExists');
    expect(m.suggestLogin).toBe(true);
  });

  it('maps TERMS_NOT_ACCEPTED to the terms field', () => {
    const m = mapLeadApiError(apiErr(422, 'TERMS_NOT_ACCEPTED'));
    expect(m.field).toBe('terms_accepted');
    expect(m.i18nKey).toBe('leadgate.errors.terms');
  });

  it('falls back to the generic error for unknown codes', () => {
    const m = mapLeadApiError(apiErr(500, 'BOOM'));
    expect(m.field).toBeNull();
    expect(m.i18nKey).toBe('common.errorGeneric');
    expect(mapLeadApiError(new Error('x')).i18nKey).toBe('common.errorGeneric');
  });
});
