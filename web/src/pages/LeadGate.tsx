import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { createLead, fetchMetadata } from '@/api';
import { tokenStorage } from '@/api/client';
import type { MetadataResponse } from '@/api';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  mapLeadApiError,
  validateLead,
  type LeadField,
  type LeadFormValues,
} from '@/lib/leadForm';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

const EMPTY: LeadFormValues = {
  full_name: '',
  job_title: '',
  company_email: '',
  company_name: '',
  company_size: '',
  industry: '',
  country: '',
  terms_accepted: false,
};

/**
 * Freemium lead gate (/start): public capture form. On success the backend
 * returns org + assessment + tokens; we store the session and go to onboarding.
 */
export default function LeadGate() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const hydrate = useAuthStore((s) => s.hydrate);

  const [values, setValues] = useState<LeadFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LeadField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestLogin, setSuggestLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);

  useEffect(() => {
    fetchMetadata()
      .then(setMetadata)
      .catch(() => setMetadata(null));
  }, [i18n.language]);

  const catalogs = useMemo(() => {
    const fallback = (key: string) =>
      (t(`leadgate.${key}`, { returnObjects: true }) as string[]) ?? [];
    return {
      sizes: metadata?.sizes ?? fallback('sizes'),
      industries: metadata?.industries ?? fallback('industries'),
      countries: metadata?.countries ?? fallback('countries'),
    };
  }, [metadata, t]);

  function set<K extends LeadField>(key: K, value: LeadFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuggestLogin(false);

    const errors = validateLead(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(t('leadgate.requiredErr'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await createLead({
        full_name: values.full_name.trim(),
        job_title: values.job_title.trim() || null,
        company_email: values.company_email.trim(),
        company_name: values.company_name.trim(),
        company_size: values.company_size || null,
        industry: values.industry || null,
        country: values.country || null,
        terms_accepted: values.terms_accepted,
        locale: i18n.language.slice(0, 2),
      });
      tokenStorage.set(res.access_token, res.refresh_token);
      await hydrate();
      navigate('/onboarding', { replace: true });
    } catch (err) {
      const mapped = mapLeadApiError(err);
      if (mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.i18nKey });
      } else {
        setFormError(t(mapped.i18nKey));
      }
      setSuggestLogin(mapped.suggestLogin);
    } finally {
      setSubmitting(false);
    }
  }

  const errText = (key: LeadField) =>
    fieldErrors[key] ? (
      <p className="text-xs text-destructive">{t(fieldErrors[key] as string)}</p>
    ) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <BrandLogo compact />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 items-start px-4 pb-16 pt-8">
        <Card className="w-full">
          <CardContent className="p-6 md:p-8">
            <h1 className="text-2xl font-bold">{t('leadgate.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('leadgate.sub')}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {t('leadgate.perks')}
            </span>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lg-name">{t('leadgate.name')} *</Label>
                  <Input
                    id="lg-name"
                    value={values.full_name}
                    onChange={(e) => set('full_name', e.target.value)}
                    placeholder="Margaret Reid"
                    aria-invalid={!!fieldErrors.full_name}
                  />
                  {errText('full_name')}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lg-role">{t('leadgate.role')} *</Label>
                  <Input
                    id="lg-role"
                    value={values.job_title}
                    onChange={(e) => set('job_title', e.target.value)}
                    placeholder="COO"
                    aria-invalid={!!fieldErrors.job_title}
                  />
                  {errText('job_title')}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="lg-email">{t('leadgate.email')} *</Label>
                  <Input
                    id="lg-email"
                    type="email"
                    value={values.company_email}
                    onChange={(e) => set('company_email', e.target.value)}
                    placeholder="margaret@acme.co.uk"
                    aria-invalid={!!fieldErrors.company_email}
                  />
                  {fieldErrors.company_email ? (
                    <p className="text-xs text-destructive">
                      {t(fieldErrors.company_email)}{' '}
                      {suggestLogin && (
                        <Link to="/login" className="font-medium underline">
                          {t('leadgate.goLogin')}
                        </Link>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('leadgate.emailHint')}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lg-company">{t('leadgate.company')} *</Label>
                  <Input
                    id="lg-company"
                    value={values.company_name}
                    onChange={(e) => set('company_name', e.target.value)}
                    placeholder="Acme Industrial Ltd."
                    aria-invalid={!!fieldErrors.company_name}
                  />
                  {errText('company_name')}
                </div>
                <CatalogSelect
                  id="lg-size"
                  label={t('leadgate.size')}
                  value={values.company_size}
                  options={catalogs.sizes}
                  onChange={(v) => set('company_size', v)}
                />
                <CatalogSelect
                  id="lg-industry"
                  label={t('leadgate.industry')}
                  value={values.industry}
                  options={catalogs.industries}
                  onChange={(v) => set('industry', v)}
                />
                <CatalogSelect
                  id="lg-country"
                  label={t('leadgate.country')}
                  value={values.country}
                  options={catalogs.countries}
                  onChange={(v) => set('country', v)}
                />
              </div>

              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 text-sm',
                  fieldErrors.terms_accepted && 'text-destructive',
                )}
              >
                <Checkbox
                  checked={values.terms_accepted}
                  onCheckedChange={(c) => set('terms_accepted', c === true)}
                  aria-invalid={!!fieldErrors.terms_accepted}
                  className="mt-0.5"
                />
                <span>
                  {t('leadgate.terms')}{' '}
                  <Link to="/terms" state={{ from: '/start' }} className="text-primary underline">
                    {t('terms.title')}
                  </Link>
                </span>
              </label>
              {errText('terms_accepted')}

              {formError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">{formError}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="brand-gradient w-full border-0 text-white"
              >
                {submitting ? t('leadgate.submitting') : t('leadgate.cta')}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </Button>
              <div className="text-center">
                <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                  <ArrowLeft className="h-3 w-3" /> {t('leadgate.back')}
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function CatalogSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
