import { describe, expect, it, vi } from 'vitest';
import { ApiError, api, setSessionExpiredHandler, tokenStorage } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API client — error envelope', () => {
  it('parses {error:{code,message,field,request_id}} into ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(422, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'email inválido',
            field: 'email',
            request_id: 'req-123',
          },
        }),
      ),
    );

    const err = (await api('/anything', { method: 'POST', body: {} }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('email inválido');
    expect(err.field).toBe('email');
    expect(err.requestId).toBe('req-123');
  });

  it('throws NETWORK_ERROR when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = (await api('/anything').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.status).toBe(0);
  });

  it('sends Authorization and Accept-Language headers', async () => {
    tokenStorage.set('access-abc', 'refresh-xyz');
    const mock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', mock);

    await api('/auth/me');
    const headers = (mock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-abc');
    expect(headers['Accept-Language']).toBe('es');
  });
});

describe('API client — 401 refresh rotation', () => {
  it('refreshes once and retries the original request', async () => {
    tokenStorage.set('old-access', 'old-refresh');
    const mock = vi
      .fn()
      // first attempt → 401
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
      )
      // refresh → new pair
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'new-access', refresh_token: 'new-refresh' }),
      )
      // retry → success
      .mockResolvedValueOnce(jsonResponse(200, { id: 'u1' }));
    vi.stubGlobal('fetch', mock);

    const data = await api<{ id: string }>('/auth/me');
    expect(data.id).toBe('u1');
    expect(mock).toHaveBeenCalledTimes(3);
    expect(tokenStorage.getAccess()).toBe('new-access');
    expect(tokenStorage.getRefresh()).toBe('new-refresh');

    // retry carries the new token
    const retryHeaders = (mock.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-access');
  });

  it('clears tokens and fires the session-expired handler when refresh fails', async () => {
    tokenStorage.set('old-access', 'old-refresh');
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'INVALID_REFRESH', message: 'bad refresh' } }),
      );
    vi.stubGlobal('fetch', mock);

    const err = (await api('/auth/me').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(tokenStorage.getAccess()).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('does not retry token-less auth endpoints on 401', async () => {
    tokenStorage.set('a', 'r');
    const mock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { code: 'X', message: 'no' } }));
    vi.stubGlobal('fetch', mock);

    // verify/magic-link/refresh are always called with auth:false
    await api('/auth/verify', { method: 'POST', body: {}, auth: false }).catch(() => undefined);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
