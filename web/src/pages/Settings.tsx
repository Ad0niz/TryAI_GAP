import { useTranslation } from 'react-i18next';
import { Construction, Moon, Sun } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useTheme } from '@/theme/theme-context';
import { cn } from '@/lib/utils';

/**
 * Preferences: language + theme are fully functional; legal/org data fields
 * are phase-2 stubs (PATCH /organizations/{id}).
 */
export default function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const current = (i18n.language ?? 'es').slice(0, 2);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('settings.sub')}</p>
      </div>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.appLang')}</CardTitle>
          <CardDescription>{t('settings.appLangDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2" role="group" aria-label={t('common.language')}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Button
              key={lang.code}
              variant={current === lang.code ? 'default' : 'outline'}
              size="sm"
              onClick={() => void i18n.changeLanguage(lang.code)}
              aria-pressed={current === lang.code}
            >
              {lang.name}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.theme')}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2" role="group" aria-label={t('common.theme')}>
          <Button
            variant={theme === 'light' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
            className={cn(theme === 'light' && 'brand-gradient border-0 text-white')}
          >
            <Sun className="h-4 w-4" /> {t('settings.themeLight')}
          </Button>
          <Button
            variant={theme === 'dark' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={cn(theme === 'dark' && 'brand-gradient border-0 text-white')}
          >
            <Moon className="h-4 w-4" /> {t('settings.themeDark')}
          </Button>
        </CardContent>
      </Card>

      {/* Legal / org data — phase 2 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{t('settings.legalTitle')}</CardTitle>
            <Badge variant="secondary" className="gap-1">
              <Construction className="h-3 w-3" />
              {t('common.todo')}
            </Badge>
          </div>
          <CardDescription>{t('settings.legalSub')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5">PATCH /organizations/{'{id}'}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
