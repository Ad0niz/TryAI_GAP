import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStorage } from '@/api/client';
import type { MeResponse } from '@/api/types';
import { useAuthStore } from './authStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VERIFY_BODY = {
  access_token: 'acc-1',
  refresh_token: 'ref-1',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'u-1', email: 'ana@acme.com', role: 'client', locale: 'es' },
};

const ME_BODY: MeResponse = {
  id: 'u-1',
  email: 'ana@acme.com',
  full_name: 'Ana',
  role: 'client',
  locale: 'es',
  organization_id: 'org-1',
};

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, status: 'idle' });
  });

  it('verify() stores tokens and authenticates the user', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, VERIFY_BODY)) // POST /auth/verify
        .mockResolvedValue(jsonResponse(200, ME_BODY)), // background GET /auth/me
    );

    const user = await useAuthStore.getState().verify('raw-token');
    expect(user.email).toBe('ana@acme.com');
    expect(tokenStorage.getAccess()).toBe('acc-1');
    expect(tokenStorage.getRefresh()).toBe('ref-1');
    expect(useAuthStore.getState().status).toBe('authenticated');

    // tokens survive a reload (localStorage persistence)
    expect(localStorage.getItem('tryaigap.access_token')).toBe('acc-1');
    expect(localStorage.getItem('tryaigap.user')).toContain('ana@acme.com');
  });

  it('hydrate() restores the session via GET /auth/me', async () => {
    tokenStorage.set('acc-1', 'ref-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, ME_BODY)));

    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.user?.organization_id).toBe('org-1');
    expect(state.hasRole('client')).toBe(true);
    expect(state.hasRole('admin')).toBe(false);
  });

  it('hydrate() without tokens becomes unauthenticated', async () => {
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('logout() revokes server-side and clears the local session', async () => {
    tokenStorage.set('acc-1', 'ref-1');
    useAuthStore.setState({ user: ME_BODY, status: 'authenticated' });
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', mock);

    await useAuthStore.getState().logout();
    expect(mock).toHaveBeenCalledOnce();
    expect((mock.mock.calls[0][0] as string).endsWith('/auth/logout')).toBe(true);
    expect(tokenStorage.getAccess()).toBeNull();
    expect(localStorage.getItem('tryaigap.user')).toBeNull();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('logout() still clears the session when the backend is down', async () => {
    tokenStorage.set('acc-1', 'ref-1');
    useAuthStore.setState({ user: ME_BODY, status: 'authenticated' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));

    await useAuthStore.getState().logout();
    expect(tokenStorage.getAccess()).toBeNull();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});
