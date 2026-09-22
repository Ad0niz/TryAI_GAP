import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Info, MailCheck } from 'lucide-react';
import { requestMagicLink } from '@/api';
import { ApiError } from '@/api/client';
import { IS_DEV } from '@/config';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Magic-link login: email → POST /auth/magic-link → "check your inbox" state. */
export default function Login() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    setLoading(true);
    try {
      await requestMagicLink(email, (i18n.language ?? 'es').slice(0, 2));
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <Link to="/" aria-label="tryAIGap">
          <BrandLogo compact />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          {sent ? (
            <>
              <CardHeader className="text-center">
                <div className="brand-gradient mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-white">
                  <MailCheck className="h-6 w-6" />
                </div>
                <CardTitle>{t('auth.checkInboxTitle')}</CardTitle>
                <CardDescription>{t('auth.checkInboxSub', { email })}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                  {t('auth.useAnotherEmail')}
                </Button>
                <Button variant="ghost" className="w-full" onClick={handleSubmit} disabled={loading}>
                  {t('auth.resend')}
                </Button>
                {IS_DEV && <DevHint />}
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
                <CardDescription>{t('login.sub')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t('login.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={!!error}
                    />
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="brand-gradient w-full border-0 text-white" disabled={loading}>
                    {loading ? t('common.loading') : t('login.send')}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t('login.legal')}</p>
                </form>
                {IS_DEV && <DevHint />}
              </CardContent>
            </>
          )}
        </Card>
      </main>

      <footer className="p-4 text-center">
        <Button asChild variant="link" size="sm">
          <Link to="/">
            <ArrowLeft className="h-3.5 w-3.5" /> tryAIGap
          </Link>
        </Button>
      </footer>
    </div>
  );
}

/** Dev-only hint: local backend prints the magic link in the uvicorn console. */
function DevHint() {
  const { t } = useTranslation();
  return (
    <Alert className="mt-4 border-dashed">
      <Info className="h-4 w-4" />
      <AlertDescription className="text-xs">{t('auth.devHint')}</AlertDescription>
    </Alert>
  );
}
