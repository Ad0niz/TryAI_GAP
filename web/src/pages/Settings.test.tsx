vi.mock('@/hooks/useOrganizationAccess', () => ({ useOrganizationAccess: () => ({ admin: true, areaKeys: [], loading: false, error: null }) }));
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Organization } from '@/api/types';
import i18n from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { ThemeProvider } from '@/theme/ThemeProvider';
import Settings from './Settings';

const organization: Organization = {
  id: 'org-a', name: 'Empresa A', sector: 'Sector anterior', size: '10–49',
  country: 'Chile', currency: 'CLP', legal_name: 'Empresa A Ltda.',
  address: 'Calle 123', tax_id: '12345678-9', plan: 'free',
  settings: { doc_locale: 'es', theme: 'light' },
};
const user = { id: 'user-a', email: 'a@example.com', role: 'client' as const, locale: 'es', organization_id: 'org-a' };
const catalogs = { industries: ['Tecnología'], sizes: ['10–49'], countries: ['Chile'], currencies: ['CLP', 'USD'], frameworks: [] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let stored: Organization;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

function mount() { return render(<ThemeProvider><Settings /></ThemeProvider>); }
const nameInput = () => screen.getByLabelText('Nombre de la empresa');
const saveButton = () => screen.getByRole('button', { name: 'Guardar cambios' });

beforeEach(async () => {
  await i18n.changeLanguage('es');
  useAuthStore.setState({ user, status: 'authenticated' });
  stored = structuredClone(organization);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/metadata')) return response(catalogs);
    if (init?.method === 'PATCH') stored = { ...stored, ...JSON.parse(init.body as string), name: 'Nombre confirmado' };
    return response(stored);
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('Settings organization profile', () => {
  it('waits for session hydration, then loads the real organization and legal fields', async () => {
    useAuthStore.setState({ user: null, status: 'hydrating' });
    mount();
    expect(screen.getByText('Cargando sesión…')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => useAuthStore.setState({ user, status: 'authenticated' }));
    expect(await screen.findByDisplayValue('Empresa A')).toBeInTheDocument();
    expect(screen.getByLabelText('Razón social / Nombre legal')).toHaveValue('Empresa A Ltda.');
    expect(screen.getByLabelText('Dirección fiscal registrada')).toHaveValue('Calle 123');
    expect(screen.getByLabelText('Identificador tributario')).toHaveValue('12345678-9');
    expect(screen.getByRole('combobox', { name: 'Sector / industria' })).toHaveTextContent('Sector anterior');
    expect(screen.getByText('free')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('explains a missing organization and an unauthenticated session', () => {
    useAuthStore.setState({ user: { ...user, organization_id: null } });
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('No se encontró una organización');
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => useAuthStore.setState({ user: null, status: 'unauthenticated' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Inicia sesión');
  });

  it('PATCHes only edited fields, clears nullable fields and displays the server response after reload', async () => {
    const view = mount();
    await screen.findByDisplayValue('Empresa A');
    fireEvent.change(nameInput(), { target: { value: 'Nombre editado' } });
    fireEvent.change(screen.getByLabelText('Identificador tributario'), { target: { value: '' } });
    fireEvent.click(saveButton());
    await screen.findByText('Datos de la organización guardados.');
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toMatch(/\/organizations\/org-a$/);
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ name: 'Nombre editado', tax_id: null });
    expect(nameInput()).toHaveValue('Nombre confirmado');
    expect(saveButton()).toBeDisabled();
    view.unmount();
    mount();
    expect(await screen.findByDisplayValue('Nombre confirmado')).toBeInTheDocument();
    expect(screen.getByLabelText('Identificador tributario')).toHaveValue('');
  });

  it('allows retrying a failed GET', async () => {
    fetchMock.mockImplementationOnce(async () => response({ error: { code: 'FORBIDDEN', message: 'Sin acceso' } }, 403));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('orgPermissions.denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByDisplayValue('Empresa A')).toBeInTheDocument();
  });

  it('keeps edits after a failed PATCH and permits retrying', async () => {
    mount();
    await screen.findByDisplayValue('Empresa A');
    fireEvent.change(nameInput(), { target: { value: 'Mi cambio' } });
    fetchMock.mockImplementationOnce(async () => response({ error: { code: 'SERVER_ERROR', message: 'Servicio no disponible' } }, 500));
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('common.errorGeneric'));
    expect(nameInput()).toHaveValue('Mi cambio');
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await screen.findByText('Datos de la organización guardados.');
  });

  it('still displays organization data if metadata fails and retries catalogs independently', async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => url.endsWith('/metadata') ? Promise.reject(new TypeError('offline')) : normalFetch(url, init));
    mount();
    await screen.findByDisplayValue('Empresa A');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los catálogos');
    expect(screen.getByRole('combobox', { name: 'Sector / industria' })).toBeDisabled();
    expect(nameInput()).toBeEnabled();
    fetchMock.mockImplementation(normalFetch);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Sector / industria' })).toBeEnabled());
  });

  it('does not show a previous tenant when its pending GET completes', async () => {
    let resolveOld!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }));
    mount();
    stored = { ...organization, id: 'org-b', name: 'Empresa B' };
    act(() => useAuthStore.setState({ user: { ...user, organization_id: 'org-b' } }));
    await screen.findByDisplayValue('Empresa B');
    await act(async () => resolveOld(response(organization)));
    expect(nameInput()).toHaveValue('Empresa B');
    expect(screen.queryByDisplayValue('Empresa A')).not.toBeInTheDocument();
  });

  it('blocks blank names and editing while saving', async () => {
    mount();
    await screen.findByDisplayValue('Empresa A');
    fireEvent.change(nameInput(), { target: { value: '   ' } });
    expect(saveButton()).toBeDisabled();
    fireEvent.change(nameInput(), { target: { value: 'Nuevo' } });
    let resolveSave!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSave = resolve; }));
    fireEvent.click(saveButton());
    expect(nameInput()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await act(async () => resolveSave(response({ ...organization, name: 'Nuevo' })));
    expect(nameInput()).toBeEnabled();
  });

  it('preserves language and theme controls without resetting unsaved edits', async () => {
    mount();
    await screen.findByDisplayValue('Empresa A');
    fireEvent.change(nameInput(), { target: { value: 'Sin guardar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }));
    expect(document.documentElement).toHaveClass('dark');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Company name')).toHaveValue('Sin guardar');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });
});
