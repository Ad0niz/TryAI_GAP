import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/store/authStore';

type VerifyState = 'verifying' | 'error';

/** /auth/verify?token=RAW — exchanges the magic-link token for a session. */
export default function AuthVerify() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const verify = useAuthStore((s) => s.verify);
  const [token] = useState(() => params.get('token'));
  const [state, setState] = useState<VerifyState>(token ? 'verifying' : 'error');
  const [errorMsg, setErrorMsg] = useState<string | null>(
    token ? null : t('auth.missingToken'),
  );
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-effect guard
    ran.current = true;
    if (!token) return;
    verify(token)
      .then((user) => {
        navigate(user.organization_id ? '/dashboard' : '/onboarding', { replace: true });
      })
      .catch((e: unknown) => {
        setErrorMsg(e instanceof Error ? e.message : null);
        setState('error');
      });
  }, [verify, navigate, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        {state === 'verifying' ? (
          <CardHeader>
            <div className="mx-auto mb-2">
              <Spinner className="h-8 w-8 text-primary" />
            </div>
            <CardTitle role="status">{t('auth.verifying')}</CardTitle>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <div className="mx-auto mb-2 text-destructive">
                <CircleX className="h-10 w-10" />
              </div>
              <CardTitle>{t('auth.verifyError')}</CardTitle>
              {errorMsg && <CardDescription>{errorMsg}</CardDescription>}
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/login">{t('auth.backToLogin')}</Link>
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
