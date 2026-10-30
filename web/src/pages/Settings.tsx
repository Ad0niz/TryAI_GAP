import { OrganizationAccess } from '@/components/OrganizationAccess';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Moon, Sun } from 'lucide-react';

import { fetchMetadata, fetchOrganization, updateOrganization } from '@/api';
import type { MetadataResponse } from '@/api';
import type { Organization, OrgUpdate } from '@/api/types';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/theme-context';

/** Personal preferences and the authenticated organization's editable profile. */
export default function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);

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

        <CardContent
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t('common.language')}
        >
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

        <CardContent
          className="flex gap-2"
          role="group"
          aria-label={t('common.theme')}
        >
          <Button
            variant={theme === 'light' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
            className={cn(
              theme === 'light' && 'brand-gradient border-0 text-white',
            )}
          >
            <Sun className="h-4 w-4" />
            {t('settings.themeLight')}
          </Button>

          <Button
            variant={theme === 'dark' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={cn(
              theme === 'dark' && 'brand-gradient border-0 text-white',
            )}
          >
            <Moon className="h-4 w-4" />
            {t('settings.themeDark')}
          </Button>
        </CardContent>
      </Card>

      {/* Organization data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.organization.title')}</CardTitle>
          <CardDescription>{t('settings.organization.description')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {status === 'idle' || status === 'hydrating' ? (
            <LoadingMessage text={t('settings.organization.loadingSession')} />
          ) : status !== 'authenticated' || !user ? (
            <p role="alert">{t('settings.organization.noSession')}</p>
          ) : !user.organization_id ? (
            <p role="alert">{t('settings.organization.noOrganization')}</p>
          ) : (
            <OrganizationAccess><OrganizationForm key={`${user.id}:${user.organization_id}`} organizationId={user.organization_id} /></OrganizationAccess>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const profileFields = ['name', 'sector', 'size', 'country', 'currency', 'legal_name', 'address', 'tax_id'] as const;
type Profile = Record<(typeof profileFields)[number], string>;

function toProfile(organization: Organization): Profile {
  return Object.fromEntries(profileFields.map((field) => [field, organization[field] ?? ''])) as Profile;
}

function LoadingMessage({ text }: { text: string }) {
  return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{text}
  </p>;
}

function OrganizationForm({ organizationId }: { organizationId: string }) {
  const { t, i18n } = useTranslation();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [metadataError, setMetadataError] = useState(false);
  const [metadataAttempt, setMetadataAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOrganization(organizationId).then((data) => {
      if (cancelled) return;
      setOrganization(data);
      setProfile(toProfile(data));
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof ApiError && error.status === 403 ? 'orgPermissions.denied' : 'common.errorGeneric');
    });
    return () => { cancelled = true; };
  }, [organizationId, loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    fetchMetadata().then((data) => {
      if (!cancelled) {
        setMetadata(data);
        setMetadataError(false);
      }
    }).catch(() => {
      if (!cancelled) setMetadataError(true);
    });
    return () => { cancelled = true; };
  }, [i18n.language, metadataAttempt]);

  if (loadError !== null) return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">{t('settings.organization.loadError')} {t(loadError)}</p>
      <Button variant="outline" onClick={() => { setLoadError(null); setLoadAttempt((n) => n + 1); }}>
        {t('settings.organization.retry')}
      </Button>
    </div>
  );
  if (!organization || !profile) return <LoadingMessage text={t('settings.organization.loading')} />;

  const baseline = toProfile(organization);
  const dirty = profileFields.some((field) => profile[field] !== baseline[field]);
  const change = (field: keyof Profile, value: string) => {
    setProfile({ ...profile, [field]: value });
    setSaved(false);
    setSaveError(null);
  };

  async function save() {
    if (!organization || !profile || saving || !profile.name.trim() || !profile.currency) return;
    // Only changed, explicitly allowed fields belong in the partial update.
    const payload: OrgUpdate = {};
    for (const field of profileFields) {
      if (profile[field] === baseline[field]) continue;
      if (field === 'name' || field === 'currency') payload[field] = profile[field].trim();
      else payload[field] = profile[field].trim() || null;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateOrganization(organization.id, payload);
      setOrganization(updated);
      setProfile(toProfile(updated));
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof ApiError && error.status === 403 ? t('orgPermissions.denied') : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  }

  const catalogs = [
    { field: 'sector', label: 'cSector', options: metadata?.industries },
    { field: 'size', label: 'cSize', options: metadata?.sizes },
    { field: 'country', label: 'cCountry', options: metadata?.countries },
    { field: 'currency', label: 'cCurrency', options: metadata?.currencies },
  ] as const;

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <p className="text-sm text-muted-foreground">{t('settings.organization.plan')}: <span className="font-medium">{organization.plan}</span></p>
      {metadataError && <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">{t('settings.organization.metadataError')}</p>
        <Button type="button" variant="outline" onClick={() => { setMetadataError(false); setMetadataAttempt((n) => n + 1); }}>
          {t('settings.organization.retry')}
        </Button>
      </div>}
      {!metadata && !metadataError && <LoadingMessage text={t('settings.organization.loadingCatalogs')} />}
      <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="org-name">{t('onboarding.cName')}</Label>
          <Input id="org-name" required maxLength={200} value={profile.name} onChange={(e) => change('name', e.target.value)} />
        </div>
        {catalogs.map(({ field, label, options }) => (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={`org-${field}`}>{t(`onboarding.${label}`)}</Label>
            <Select value={profile[field]} onValueChange={(value) => change(field, value)} disabled={saving || !options}>
              <SelectTrigger id={`org-${field}`}><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {/* Keep existing values visible even when absent from the current localized catalog. */}
                {[...new Set([profile[field], ...(options ?? [])].filter(Boolean))].map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field !== 'currency' && profile[field] && (
              <Button type="button" variant="ghost" size="sm" disabled={saving || !options} onClick={() => change(field, '')}
                aria-label={`${t('settings.organization.clear')} ${t(`onboarding.${label}`)}`}>
                {t('settings.organization.clear')}
              </Button>
            )}
          </div>
        ))}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="org-legal-name">{t('settings.legalName')}</Label>
          <Input id="org-legal-name" maxLength={200} value={profile.legal_name} onChange={(e) => change('legal_name', e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="org-address">{t('settings.address')}</Label>
          <Textarea id="org-address" value={profile.address} onChange={(e) => change('address', e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="org-tax-id">{t('settings.taxId')}</Label>
          <Input id="org-tax-id" maxLength={40} value={profile.tax_id} onChange={(e) => change('tax_id', e.target.value)} />
        </div>
      </fieldset>
      {saveError !== null && <p role="alert" className="text-sm text-destructive">{t('settings.organization.saveError')} {saveError}</p>}
      {saved && <p role="status" className="text-sm">{t('settings.organization.saved')}</p>}
      <Button type="submit" disabled={saving || !dirty || !profile.name.trim() || !profile.currency}>
        {saving && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
        {t(saving ? 'settings.organization.saving' : 'settings.organization.save')}
      </Button>
    </form>
  );
}
