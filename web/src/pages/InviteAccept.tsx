import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { fetchInvitation } from '@/api';
import { ApiError } from '@/api/client';
import type { InvitationPreview } from '@/api/types';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/authStore';

function errorKey(error: unknown): string {
  if (!(error instanceof ApiError)) return 'generic';
  const keys: Record<string, string> = {
    INVITE_TOKEN_INVALID: 'invalid', INVITE_TOKEN_EXPIRED: 'expired',
    INVITE_ALREADY_ACCEPTED: 'used', INVITE_ACCOUNT_CONFLICT: 'conflict',
    INVITE_ACCOUNT_DISABLED: 'disabled', INVITE_PASSWORD_INCORRECT: 'incorrect',
    INVITE_PASSWORD_INVALID: 'passwordRule', VALIDATION_ERROR: 'passwordRule',
    INVITE_CHANGED: 'changed',
  };
  return keys[error.code] ?? 'generic';
}

export default function InviteAccept() {
  const { token = '' } = useParams<{ token: string }>();
  return <InvitationForm key={token} token={token} />;
}

function InvitationForm({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const acceptInvite = useAuthStore((state) => state.acceptInvite);
  const [info, setInfo] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    fetchInvitation(token).then((result) => {
      if (active) setInfo(result);
    }).catch((reason: unknown) => {
      if (active) setError(errorKey(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !info) return;
    if (password.length < 12 || password.length > 128 || !password.trim()) {
      setError('passwordRule'); return;
    }
    if (!info.password_is_set && password !== confirmation) {
      setError('mismatch'); return;
    }
    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await acceptInvite(token, password);
      // Cached data from another session must not survive the account switch.
      await queryClient.cancelQueries();
      queryClient.clear();
      setPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch (reason) {
      setError(errorKey(reason));
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  const terminal = error && ['invalid', 'expired', 'used', 'conflict', 'disabled', 'changed'].includes(error);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <meta name="referrer" content="no-referrer" />
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-6">
        <BrandLogo /><div className="flex gap-2"><LanguageSwitcher /><ThemeToggle /></div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-10">
        <Card>
          <CardHeader><CardTitle>{t(success ? 'invitePage.success' : 'invitePage.title')}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {loading ? <p role="status">{t('invitePage.loading')}</p> : success ? <>
              <p role="status">{t('invitePage.successBody', { company: info?.organization_name })}</p>
              <p className="text-sm text-muted-foreground">{t('invitePage.magicLink')}</p>
              <Button asChild><Link to="/dashboard" replace>{t('invitePage.continue')}</Link></Button>
            </> : <>
              {error && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{t(`invitePage.${error}`)}</p>}
              {(!info || terminal) ? <>
                {(error === 'generic' || error === 'changed') && <Button onClick={() => {
                  setLoading(true); setError(null); setInfo(null); setAttempt((value) => value + 1);
                }}>{t('invitePage.retry')}</Button>}
                <p><Link to="/login" className="underline">{t('invitePage.login')}</Link></p>
              </> : <form onSubmit={submit} className="space-y-5">
                <p>{t('invitePage.intro', { name: info.full_name, company: info.organization_name })}</p>
                <dl className="rounded-md bg-muted p-4 text-sm space-y-2">
                  <div><dt className="font-medium">{t('invitePage.email')}</dt><dd className="break-all">{info.email}</dd></div>
                  {info.area_key && <div><dt className="font-medium">{t('invitePage.area')}</dt><dd>{t(`areaList.${info.area_key}.name`, { defaultValue: info.area_key })}</dd></div>}
                  <div><dt className="font-medium">{t('invitePage.expires')}</dt><dd>{new Date(info.expires_at).toLocaleString(i18n.language)}</dd></div>
                </dl>
                <div className="space-y-2">
                  <Label htmlFor="invite-password">{t(info.password_is_set ? 'invitePage.currentPassword' : 'invitePage.password')}</Label>
                  <Input id="invite-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
                    autoComplete={info.password_is_set ? 'current-password' : 'new-password'} minLength={12} maxLength={128} required disabled={submitting} aria-describedby="password-help" />
                  <p id="password-help" className="text-sm text-muted-foreground">{t(info.password_is_set ? 'invitePage.keepPassword' : 'invitePage.passwordRule')}</p>
                </div>
                {!info.password_is_set && <div className="space-y-2">
                  <Label htmlFor="invite-confirm">{t('invitePage.confirm')}</Label>
                  <Input id="invite-confirm" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password" minLength={12} maxLength={128} required disabled={submitting} />
                </div>}
                <Button type="submit" disabled={submitting}>{t(submitting ? 'invitePage.saving' : 'invitePage.accept')}</Button>
              </form>}
            </>}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
