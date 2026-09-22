import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { createInvitation, fetchMetadata, updateOrganization } from '@/api';
import { ApiError } from '@/api/client';
import type { MetadataResponse } from '@/api';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

const DRAFT_KEY = 'tryaigap.onboarding_draft';

const FRAMEWORKS = [
  'UK GDPR',
  'Data Protection Act 2018 (UK)',
  'GDPR (EU)',
  'EU AI Act',
  'ISO/IEC 42001',
  'NIST AI RMF',
  'OECD AI Principles',
];

interface Profile {
  name: string;
  sector: string;
  size: string;
  country: string;
  currency: string;
}

interface Draft {
  profile: Profile;
  frameworks: string[];
  areas: string[];
  leaders: { name: string; email: string }[];
}

const EMPTY_DRAFT: Draft = {
  profile: { name: '', sector: '', size: '', country: '', currency: 'GBP' },
  frameworks: [],
  areas: [],
  leaders: [],
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Draft) } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

interface AreaEntry {
  name: string;
  icon: string;
  n: number;
}

const TOTAL_STEPS = 4;

/**
 * Organization onboarding wizard (4 steps):
 *  1. Company profile        → PATCH /organizations/{id}
 *  2. Compliance frameworks  → local draft (no endpoint yet)
 *  3. Functional areas       → local draft; activated via /assessments/…:activate in phase 2
 *  4. Invite area leaders    → POST /invitations (best effort, skippable)
 * Everything degrades gracefully when the backend is offline.
 */
export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [offlineNote, setOfflineNote] = useState(false);
  const [saving, setSaving] = useState(false);

  // Localized catalogs from the backend; wireframe dictionaries as fallback.
  useEffect(() => {
    fetchMetadata()
      .then(setMetadata)
      .catch(() => setMetadata(null));
  }, [i18n.language]);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const catalogs = useMemo(() => {
    const fallback = (key: string) =>
      (t(`examples.${key}`, { returnObjects: true }) as string[]) ?? [];
    return {
      sectors: metadata?.industries ?? fallback('sectors'),
      sizes: metadata?.sizes ?? fallback('sizes'),
      countries: metadata?.countries ?? fallback('countries'),
      currencies: metadata?.currencies ?? fallback('currencies'),
      frameworks: metadata?.frameworks ?? FRAMEWORKS,
    };
  }, [metadata, t]);

  const areaList = t('areaList', { returnObjects: true }) as Record<string, AreaEntry>;
  const stepTitles = [
    t('onboarding.step1Title'),
    t('onboarding.step2Title'),
    t('onboarding.step3Title'),
    t('onboarding.step4Title'),
  ];
  const stepSubs = [
    t('onboarding.step1Sub'),
    t('onboarding.step2Sub'),
    t('onboarding.step3Sub'),
    t('onboarding.step4Sub'),
  ];

  function patchDraft(partial: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  async function saveProfile(): Promise<void> {
    const orgId = user?.organization_id;
    if (!orgId) return; // nothing to PATCH yet (org created by backend flow)
    try {
      await updateOrganization(orgId, {
        name: draft.profile.name || undefined,
        sector: draft.profile.sector || undefined,
        size: draft.profile.size || undefined,
        country: draft.profile.country || undefined,
        currency: draft.profile.currency || undefined,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status > 0 && e.status < 500) throw e; // real validation error
      setOfflineNote(true); // backend offline: draft is already in localStorage
    }
  }

  async function sendInvites(): Promise<void> {
    for (const leader of draft.leaders) {
      if (!leader.name || !leader.email) continue;
      try {
        await createInvitation({ full_name: leader.name, email: leader.email });
      } catch {
        setOfflineNote(true);
      }
    }
  }

  async function handleNext() {
    setSaving(true);
    try {
      if (step === 1) await saveProfile();
      if (step === TOTAL_STEPS) {
        await sendInvites();
        localStorage.removeItem(DRAFT_KEY);
        navigate('/dashboard', { replace: true });
        return;
      }
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <BrandLogo compact />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">{t('onboarding.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('onboarding.sub')}</p>
        </div>

        {/* Step indicator */}
        <ol className="mb-6 flex items-center gap-2" aria-label={t('onboarding.stepOf', { current: step, total: TOTAL_STEPS })}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <li
              key={n}
              aria-current={n === step ? 'step' : undefined}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                n < step ? 'bg-primary' : n === step ? 'brand-gradient' : 'bg-muted',
              )}
            />
          ))}
        </ol>

        <Card>
          <CardContent className="p-6 md:p-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('onboarding.stepOf', { current: step, total: TOTAL_STEPS })}
            </p>
            <h2 className="text-xl font-bold">{stepTitles[step - 1]}</h2>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">{stepSubs[step - 1]}</p>

            {offlineNote && (
              <Alert className="mb-4">
                <AlertDescription className="text-xs">{t('onboarding.savedOffline')}</AlertDescription>
              </Alert>
            )}

            {step === 1 && (
              <StepProfile draft={draft} onChange={patchDraft} catalogs={catalogs} />
            )}
            {step === 2 && (
              <StepFrameworks draft={draft} onChange={patchDraft} frameworks={catalogs.frameworks} />
            )}
            {step === 3 && <StepAreas draft={draft} onChange={patchDraft} areaList={areaList} />}
            {step === 4 && <StepLeaders draft={draft} onChange={patchDraft} />}

            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => Math.max(s - 1, 1))}
                disabled={step === 1 || saving}
                className={step === 1 ? 'invisible' : ''}
              >
                <ArrowLeft className="h-4 w-4" /> {t('onboarding.back')}
              </Button>
              <div className="flex gap-2">
                {step > 1 && step < TOTAL_STEPS && (
                  <Button variant="ghost" onClick={() => setStep((s) => s + 1)} disabled={saving}>
                    {t('onboarding.skip')}
                  </Button>
                )}
                <Button
                  onClick={() => void handleNext()}
                  disabled={saving || (step === 1 && !draft.profile.name)}
                  className="brand-gradient border-0 text-white"
                >
                  {step === TOTAL_STEPS ? t('onboarding.start') : t('onboarding.next')}
                  {step === TOTAL_STEPS ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <p className="mt-3 text-center text-xs text-muted-foreground">{t('onboarding.etaCalculated')}</p>
      </main>
    </div>
  );
}

interface StepProps {
  draft: Draft;
  onChange: (partial: Partial<Draft>) => void;
}

function StepProfile({
  draft,
  onChange,
  catalogs,
}: StepProps & { catalogs: { sectors: string[]; sizes: string[]; countries: string[]; currencies: string[] } }) {
  const { t } = useTranslation();
  const p = draft.profile;
  const set = (k: keyof Profile) => (v: string) =>
    onChange({ profile: { ...p, [k]: v } });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ob-name">{t('onboarding.cName')}</Label>
        <Input id="ob-name" value={p.name} onChange={(e) => set('name')(e.target.value)} required />
      </div>
      <CatalogSelect id="ob-sector" label={t('onboarding.cSector')} value={p.sector} options={catalogs.sectors} onChange={set('sector')} />
      <CatalogSelect id="ob-size" label={t('onboarding.cSize')} value={p.size} options={catalogs.sizes} onChange={set('size')} />
      <CatalogSelect id="ob-country" label={t('onboarding.cCountry')} value={p.country} options={catalogs.countries} onChange={set('country')} />
      <CatalogSelect id="ob-currency" label={t('onboarding.cCurrency')} value={p.currency} options={catalogs.currencies} onChange={set('currency')} />
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

function StepFrameworks({
  draft,
  onChange,
  frameworks,
}: StepProps & { frameworks: string[] }) {
  function toggle(fw: string, checked: boolean) {
    onChange({
      frameworks: checked ? [...draft.frameworks, fw] : draft.frameworks.filter((f) => f !== fw),
    });
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {frameworks.map((fw) => (
        <li key={fw}>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md border p-3 text-sm font-medium transition-colors hover:bg-accent/10 has-[:checked]:border-primary has-[:checked]:bg-accent/10">
            <Checkbox
              checked={draft.frameworks.includes(fw)}
              onCheckedChange={(c) => toggle(fw, c === true)}
            />
            {fw}
          </label>
        </li>
      ))}
    </ul>
  );
}

function StepAreas({
  draft,
  onChange,
  areaList,
}: StepProps & { areaList: Record<string, AreaEntry> }) {
  function toggle(key: string) {
    onChange({
      areas: draft.areas.includes(key)
        ? draft.areas.filter((a) => a !== key)
        : [...draft.areas, key],
    });
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {Object.entries(areaList).map(([key, area]) => {
        const active = draft.areas.includes(key);
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-pressed={active}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors',
                active ? 'border-primary bg-accent/10' : 'hover:bg-accent/5',
              )}
            >
              <span className="text-xl" aria-hidden="true">
                {area.icon}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{area.name}</span>
                <span className="block text-xs text-muted-foreground">{area.n} questions</span>
              </span>
              {active && (
                <Badge variant="default" className="shrink-0">
                  <Check className="h-3 w-3" />
                </Badge>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StepLeaders({ draft, onChange }: StepProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  function add() {
    if (!name || !email) return;
    onChange({ leaders: [...draft.leaders, { name, email }] });
    setName('');
    setEmail('');
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('onboarding.leadersSub')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder={t('onboarding.inviteName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t('onboarding.inviteName')}
        />
        <Input
          type="email"
          placeholder={t('onboarding.inviteEmail')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label={t('onboarding.inviteEmail')}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!name || !email}>
          {t('onboarding.inviteAdd')}
        </Button>
      </div>
      {draft.leaders.length > 0 && (
        <ul className="space-y-1.5">
          {draft.leaders.map((l, i) => (
            <li key={`${l.email}-${i}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{l.name}</span>{' '}
                <span className="text-muted-foreground">&lt;{l.email}&gt;</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ leaders: draft.leaders.filter((_, j) => j !== i) })}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
