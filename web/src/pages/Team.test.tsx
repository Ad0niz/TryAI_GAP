vi.mock('@/hooks/useOrganizationAccess', () => ({ useOrganizationAccess: () => ({ admin: true, areaKeys: [], loading: false, error: null }) }));
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvitation, fetchAreas, fetchTeam, resendInvitation } from '@/api';
import { ApiError } from '@/api/client';
import type { AssessmentSummary } from '@/api/types';
import i18n from '@/i18n';
import { useAssessmentStore } from '@/store/assessmentStore';
import Team from './Team';

vi.mock('@/api', async () => ({
  ...await vi.importActual<typeof import('@/api')>('@/api'),
  createInvitation: vi.fn(), fetchTeam: vi.fn(), fetchAreas: vi.fn(), resendInvitation: vi.fn(),
}));

// Exercise page mutations and messages without Radix's browser-only popup positioning.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: {
    children: ReactNode; value: string; onValueChange: (value: string) => void;
  }) => <select data-testid="invite-area" value={value} onChange={e => onValueChange(e.target.value)}>
    <option value="" />{children}
  </select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

const translations = {
  es: 'No se puede invitar a esta cuenta: está asociada a otra organización o no cumple los requisitos de acceso.',
  en: 'This account cannot be invited: it belongs to another organization or does not meet the access requirements.',
  de: 'Dieses Konto kann nicht eingeladen werden: Es gehört zu einer anderen Organisation oder erfüllt die Zugangsvoraussetzungen nicht.',
  pt: 'Não é possível convidar esta conta: ela está associada a outra organização ou não cumpre os requisitos de acesso.',
};

beforeEach(() => {
  vi.clearAllMocks();
  useAssessmentStore.setState({ assessment: {
    id: 'assessment-a', organization_id: 'org-a', plan: 'pro', status: 'in_progress',
    progress: { maturity: 0, areas_overall: 0 }, free_preview_reached: false,
  } satisfies AssessmentSummary, status: 'ready' });
  vi.mocked(fetchTeam).mockResolvedValue({ items: [], invitations: [{
    invitation_id: 'invite-a', full_name: 'Invited', email: 'invited@example.com',
    area_key: 'marketing', status: 'sent',
  }] });
  vi.mocked(fetchAreas).mockResolvedValue({ items: [{
    area_key: 'marketing', name: 'Marketing',
  }] } as Awaited<ReturnType<typeof fetchAreas>>);
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Team /></QueryClientProvider>);
}

describe('APP-11 organizer invitation errors', () => {
  it.each((['es', 'en', 'de', 'pt'] as const).flatMap(lang =>
    (['create', 'resend'] as const).map(action => ({ lang, action })),
  ))('translates $action conflicts in $lang without showing backend details', async ({ lang, action }) => {
    await i18n.changeLanguage(lang);
    const error = new ApiError(409, { code: 'INVITE_ACCOUNT_CONFLICT', message: 'PRIVATE ORGANIZATION DETAILS' });
    vi.mocked(resendInvitation).mockRejectedValue(error);
    vi.mocked(createInvitation).mockRejectedValue(error);
    mount();
    if (action === 'resend') {
      fireEvent.click(await screen.findByRole('button', { name: i18n.t('team.resend') }));
      expect(await screen.findByText(translations[lang])).toBeInTheDocument();
      expect(resendInvitation).toHaveBeenCalledExactlyOnceWith('invite-a');
      expect(screen.queryByText('PRIVATE ORGANIZATION DETAILS')).not.toBeInTheDocument();
      return;
    }
    fireEvent.click(screen.getByRole('button', { name: i18n.t('team.invite') }));
    fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('inviteModal.name'))), { target: { value: 'New person' } });
    fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('inviteModal.email'))), { target: { value: 'new@example.com' } });
    const area = await screen.findByRole('option', { name: 'Marketing' });
    expect(area).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('invite-area'), { target: { value: 'marketing' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('inviteModal.save') }));
    expect(await screen.findByText(translations[lang])).toBeInTheDocument();
    expect(createInvitation).toHaveBeenCalledExactlyOnceWith({
      full_name: 'New person', email: 'new@example.com', area_key: 'marketing', whatsapp: null, phone: null,
    });
    expect(screen.getByText(translations[lang])).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(translations[lang]);
    expect(screen.getByLabelText(new RegExp(i18n.t('inviteModal.email')))).toHaveValue('new@example.com');
    expect(screen.queryByText('PRIVATE ORGANIZATION DETAILS')).not.toBeInTheDocument();
  });

  it('uses a localized generic message for an unknown resend error', async () => {
    await i18n.changeLanguage('es');
    vi.mocked(resendInvitation).mockRejectedValue(new Error('PRIVATE DETAILS'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('team.resend') }));
    expect(await screen.findByText(i18n.t('common.errorGeneric'))).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE DETAILS')).not.toBeInTheDocument();
  });
});
