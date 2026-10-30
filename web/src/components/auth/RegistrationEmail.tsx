import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { requestRegistration } from '@/api';
import { AuthFrame } from '@/components/auth/AuthFrame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { accountErrorKey } from '@/lib/accountAuth';
import { isCorporateEmail } from '@/lib/leadForm';

export function RegistrationEmail() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!isCorporateEmail(email)) { setError('accountAuth.corporateEmail'); return; }
    setLoading(true);
    try { await requestRegistration(email.trim(), i18n.language.slice(0, 2)); setSent(true); }
    catch (err) { setError(accountErrorKey(err)); }
    finally { setLoading(false); }
  }
  return <AuthFrame title={t('accountAuth.verifyTitle')}>
    {sent ? <p role="status">{t('accountAuth.emailSent')}</p> : <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('accountAuth.verifyHint')}</p>
      <Label htmlFor="register-email">{t('leadgate.email')}</Label><Input id="register-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <Button type="submit" disabled={loading} className="w-full">{t(loading ? 'common.loading' : 'accountAuth.sendLink')}</Button>
    </form>}
    <Link to="/login" className="text-sm text-primary underline">{t('auth.backToLogin')}</Link>
  </AuthFrame>;
}
