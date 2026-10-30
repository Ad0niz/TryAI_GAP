import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { requestMagicLink } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { AuthFrame } from '@/components/auth/AuthFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountDestination, accountErrorKey } from '@/lib/accountAuth';

export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const login = useAuthStore(s => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magic, setMagic] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('accountAuth.invalidEmail'); return; }
    setLoading(true);
    try {
      if (magic) { await requestMagicLink(email.trim(), i18n.language.slice(0, 2)); setSent(true); }
      else { const user = await login(email.trim(), password); setPassword(''); cache.clear(); navigate(accountDestination(user), { replace: true }); }
    } catch (err) { setError(accountErrorKey(err)); setPassword(''); }
    finally { setLoading(false); }
  }

  return <AuthFrame title={t('login.title')}>
    {sent ? <p role="status">{t('accountAuth.emailSent')}</p> : <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="login-email">{t('login.email')}</Label>
        <Input id="login-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></div>
      {!magic && <div className="space-y-1.5"><Label htmlFor="login-password">{t('accountAuth.password')}</Label>
        <Input id="login-password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></div>}
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <Button type="submit" disabled={loading} className="brand-gradient w-full border-0 text-white">{t(loading ? 'common.loading' : magic ? 'login.send' : 'accountAuth.signIn')}</Button>
    </form>}
    <Button variant="outline" className="w-full" onClick={() => { setMagic(!magic); setSent(false); setError(null); setPassword(''); }}>
      {t(magic ? 'accountAuth.usePassword' : 'accountAuth.useMagic')}
    </Button>
    <div className="flex flex-wrap justify-between gap-3 text-sm text-primary underline">
      <Link to="/password/reset">{t('accountAuth.forgot')}</Link><Link to="/start">{t('accountAuth.register')}</Link>
    </div>
  </AuthFrame>;
}
