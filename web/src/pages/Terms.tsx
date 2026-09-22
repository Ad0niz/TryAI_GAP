import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';

interface TermsSection {
  h: string;
  p: string;
}

/** Public Terms & Conditions page (referenced from the lead gate and login). */
export default function Terms() {
  const { t } = useTranslation();
  const location = useLocation();
  const sections = t('terms.sections', { returnObjects: true }) as TermsSection[];
  const backTo = (location.state as { from?: string } | null)?.from ?? '/';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <BrandLogo compact />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-bold">{t('terms.title')}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t('terms.lastUpdated')}</p>
        <p className="mt-6 text-sm leading-7 text-muted-foreground">{t('terms.intro')}</p>
        {Array.isArray(sections) &&
          sections.map((s) => (
            <section key={s.h} className="mt-6 border-t pt-4">
              <h2 className="text-base font-semibold">{s.h}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{s.p}</p>
            </section>
          ))}
        <div className="mt-10">
          <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> {t('leadgate.back')}
          </Link>
        </div>
      </main>
    </div>
  );
}
