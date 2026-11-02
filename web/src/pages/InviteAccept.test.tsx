import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import i18n from '@/i18n';
import { tokenStorage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useAssessmentStore } from '@/store/assessmentStore';
import { ThemeProvider } from '@/theme/ThemeProvider';
import InviteAccept from './InviteAccept';

const token = 'a'.repeat(43);
const password = 'Una frase privada 2026!';
const preview = {
  organization_name: 'Empresa invitante', full_name: 'Persona invitada', email: 'invite@example.com',
  area_key: 'finance', expires_at: '2026-10-25T12:00:00Z', password_is_set: false,
};
const accepted = {
  status: 'accepted', access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'bearer', expires_in: 900,
  user: { id: 'invited-user', email: preview.email, role: 'client', locale: 'es', organization_id: 'inviting-org', full_name: preview.full_name },
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
let client: QueryClient;

function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['team'], { private: 'old-session' });
  return render(<QueryClientProvider client={client}><ThemeProvider>
    <MemoryRouter initialEntries={[`/invite/${token}`]}><Routes>
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route path="/dashboard" element={<p>Dashboard destino</p>} />
      <Route path="/login" element={<p>Login destino</p>} />
    </Routes></MemoryRouter>
  </ThemeProvider></QueryClientProvider>);
}

async function fill(value = password, confirmation = value) {
  fireEvent.change(await screen.findByLabelText('Define tu contraseña'), { target: { value } });
  fireEvent.change(screen.getByLabelText('Confirma tu contraseña'), { target: { value: confirmation } });
}
function submit() {
  fireEvent.submit(screen.getByRole('button', { name: 'Aceptar y entrar' }).closest('form')!);
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  useAuthStore.setState({ user: null, status: 'unauthenticated' });
  useAssessmentStore.getState().clear();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => response(init?.method === 'POST' ? accepted : preview));
  vi.stubGlobal('fetch', fetchMock);
});

describe('APP-11 public invitation acceptance', () => {
  it('loads without auth, accepts and persists session + organization, clears old query data', async () => {
    tokenStorage.set('previous-access', 'previous-refresh');
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Comprobando');
    await fill();
    expect(screen.getByText(preview.email)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
    submit();
    expect(await screen.findByText('Invitación aceptada')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(call?.[0]).toMatch(/\/invitations\/accept$/);
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({ token, password });
    expect(call?.[1]?.headers).not.toHaveProperty('Authorization');
    expect(useAuthStore.getState().user?.organization_id).toBe('inviting-org');
    expect(tokenStorage.getAccess()).toBe('new-access');
    expect(tokenStorage.getRefresh()).toBe('new-refresh');
    expect(localStorage.getItem('tryaigap.user')).toContain('inviting-org');
    expect(Object.values(localStorage).join(' ')).not.toContain(password);
    expect(client.getQueryData(['team'])).toBeUndefined();
    expect(screen.queryByLabelText('Define tu contraseña')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Ir al dashboard' }));
    expect(screen.getByText('Dashboard destino')).toBeInTheDocument();
  });

  it.each([
    ['INVITE_TOKEN_INVALID', 400, 'Este enlace no es válido'],
    ['INVITE_TOKEN_EXPIRED', 410, 'La invitación venció'],
    ['INVITE_ALREADY_ACCEPTED', 409, 'Esta invitación ya fue aceptada'],
    ['INVITE_ACCOUNT_CONFLICT', 409, 'Tu cuenta no puede asociarse'],
    ['INVITE_ACCOUNT_DISABLED', 403, 'Tu cuenta está deshabilitada'],
  ])('shows %s without a password form', async (code, status, text) => {
    fetchMock.mockResolvedValueOnce(response({ error: { code } }, status));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByRole('button', { name: 'Aceptar y entrar' })).not.toBeInTheDocument();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('validates password length and confirmation before sending', async () => {
    mount();
    await fill('short');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('12 y 128');
    await fill(password, 'Otra frase diferente');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent('no coinciden');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recovers from a preview network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Comprueba tu conexión');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Define tu contraseña')).toBeInTheDocument();
  });

  it('handles a token expiring between preview and submit', async () => {
    mount();
    await fill();
    fetchMock.mockResolvedValueOnce(response({ error: { code: 'INVITE_TOKEN_EXPIRED' } }, 410));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('La invitación venció');
    expect(screen.queryByLabelText('Define tu contraseña')).not.toBeInTheDocument();
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it('keeps form entries after a transient submit error and permits retry', async () => {
    mount();
    await fill();
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Comprueba tu conexión');
    expect(screen.getByLabelText('Define tu contraseña')).toHaveValue(password);
    submit();
    expect(await screen.findByText('Invitación aceptada')).toBeInTheDocument();
  });

  it('uses existing password without offering to replace it', async () => {
    fetchMock.mockResolvedValueOnce(response({ ...preview, password_is_set: true }));
    mount();
    fireEvent.change(await screen.findByLabelText('Contraseña actual'), { target: { value: password } });
    expect(screen.queryByLabelText('Confirma tu contraseña')).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(response({ error: { code: 'INVITE_PASSWORD_INCORRECT' } }, 400));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta');
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it('prevents duplicate submissions while accepting', async () => {
    mount();
    await fill();
    let finish!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const form = screen.getByRole('button', { name: 'Aceptar y entrar' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(screen.getByRole('button', { name: 'Activando tu cuenta…' })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    await act(async () => finish(response(accepted)));
    await waitFor(() => expect(screen.getByText('Invitación aceptada')).toBeInTheDocument());
  });
});
