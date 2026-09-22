import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LandingStat {
  v: string;
  l: string;
}

interface LandingModule {
  n: string;
  t: string;
  d: string;
}

/** Public landing: brand hero with the magenta→teal gradient + module overview. */
export default function Landing() {
  const { t } = useTranslation();
  const stats = t('landing.stats', { returnObjects: true }) as LandingStat[];
  const modules = t('landing.modules', { returnObjects: true }) as LandingModule[];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <BrandLogo compact />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button asChild size="sm" className="ml-2">
            <Link to="/login">{t('landing.navLogin')}</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="brand-gradient-soft">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center md:py-28">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {t('landing.eyebrow')}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-6xl">
            {t('landing.h1Pre')}{' '}
            <span className="text-brand-gradient">{t('landing.h1Em')}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {t('landing.sub')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="brand-gradient border-0 text-white">
              <Link to="/start">
                {t('landing.ctaPrimary')} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">{t('landing.ctaSecondary')}</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('landing.ctaNote')}</p>
          <p className="mt-8 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('landing.trustLabel')}
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-12 md:grid-cols-3">
        {Array.isArray(stats) &&
          stats.map((s) => (
            <Card key={s.v}>
              <CardHeader className="pb-2">
                <CardTitle className="text-3xl text-brand-gradient">{s.v}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{s.l}</CardContent>
            </Card>
          ))}
      </section>

      {/* Modules */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-16">
        <h2 className="text-center text-2xl font-bold md:text-3xl">{t('landing.modulesTitle')}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">
          {t('landing.modulesSub')}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.isArray(modules) &&
            modules.map((m) => (
              <Card key={m.n} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <span className="mb-1 inline-flex w-fit rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                    {m.n}
                  </span>
                  <CardTitle className="text-base">{m.t}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{m.d}</CardContent>
              </Card>
            ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="brand-gradient">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center text-white">
          <h2 className="text-2xl font-bold md:text-3xl">{t('landing.finalTitle')}</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/85">{t('landing.finalSub')}</p>
          <Button asChild size="lg" variant="secondary" className="mt-6">
            <Link to="/start">
              {t('landing.finalCta')} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        {t('landing.footer')}
      </footer>
    </div>
  );
}
