import { ApiError } from '@/api/client';

/** Translate known codes; never render untrusted server messages or credentials. */
export function accountErrorKey(error: unknown): string {
  if (!(error instanceof ApiError)) return 'common.errorGeneric';
  const keys: Record<string, string> = {
    AUTH_LOGIN_FAILED: 'loginFailed', AUTH_LINK_INVALID: 'linkInvalid', AUTH_LINK_EXPIRED: 'linkExpired',
    AUTH_LINK_USED: 'linkUsed', AUTH_PASSWORD_INVALID: 'passwordHint', AUTH_PASSWORD_MISMATCH: 'mismatch',
    RATE_LIMITED: 'rateLimited', AUTH_2FA_UNAVAILABLE: 'secondFactor',
    LEAD_ALREADY_EXISTS: 'alreadyRegistered', LEAD_EMAIL_INVALID: 'invalidEmail',
    LEAD_EMAIL_FREE_PROVIDER: 'corporateEmail', VALIDATION_ERROR: 'invalidFields',
    TOKEN_INVALID: 'linkInvalid', TOKEN_EXPIRED: 'linkExpired', TOKEN_ALREADY_USED: 'linkUsed',
  };
  return keys[error.code] ? `accountAuth.${keys[error.code]}` : 'common.errorGeneric';
}

export function passwordError(password: string, confirmation: string): string | null {
  if (password.length < 12 || password.length > 128 || !password.trim()) return 'accountAuth.passwordHint';
  return password === confirmation ? null : 'accountAuth.mismatch';
}

export function accountDestination(user: { role: string; organization_id?: string | null }): string {
  return user.role === 'consultant' ? '/consultant' : user.organization_id ? '/dashboard' : '/start';
}
