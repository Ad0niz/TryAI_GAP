import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset, resetPassword } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { AuthFrame } from '@/components/auth/AuthFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountErrorKey, passwordError } from '@/lib/accountAuth';

export default function PasswordReset() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [token] = useState(() => params.get('token'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const cache = useQueryClient();
  useEffect(() => { if (params.has('token')) setParams({}, { replace: true }); }, [params, setParams]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (token) { const problem = passwordError(password, confirmation); if (problem) { setError(problem); return; } }
    setLoading(true);
    try {
      if (token) { await resetPassword(token, password, confirmation); useAuthStore.getState().clearSession(); cache.clear(); }
      else await requestPasswordReset(email.trim(), i18n.language.slice(0, 2));
      setPassword(''); setConfirmation(''); setDone(true);
    } catch (err) { setError(accountErrorKey(err)); }
    finally { setLoading(false); }
  }
  return <AuthFrame title={t(token ? 'accountAuth.setPassword' : 'accountAuth.recoverTitle')}>
    {done ? <p role="status">{t(token ? 'accountAuth.resetDone' : 'accountAuth.emailSent')}</p> : <form onSubmit={submit} className="space-y-4">
      {token ? <>
        <div className="space-y-1.5"><Label htmlFor="reset-password">{t('accountAuth.password')}</Label><Input id="reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">{t('accountAuth.passwordHint')}</p>
        <div className="space-y-1.5"><Label htmlFor="reset-confirm">{t('accountAuth.confirmPassword')}</Label><Input id="reset-confirm" type="password" autoComplete="new-password" required maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></div>
      </> : <><p className="text-sm text-muted-foreground">{t('accountAuth.recoverHint')}</p><Label htmlFor="reset-email">{t('login.email')}</Label><Input id="reset-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></>}
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <Button type="submit" disabled={loading} className="w-full">{t(loading ? 'common.loading' : token ? 'accountAuth.savePassword' : 'accountAuth.sendLink')}</Button>
    </form>}
    <Link to="/login" className="text-sm text-primary underline">{t('auth.backToLogin')}</Link>
  </AuthFrame>;
}
