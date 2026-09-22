/**
 * Typed API client for the TryAIGap backend.
 *
 * - Injects `Authorization: Bearer <access_token>` and `Accept-Language`.
 * - Parses the backend error envelope `{error:{code,message,field,request_id}}`
 *   into an `ApiError`.
 * - On 401 (outside /auth/*) rotates tokens via POST /auth/refresh and retries
 *   the original request once; if the refresh fails, tokens are cleared and the
 *   registered session-expired handler fires (the auth store uses it to log out).
 */
import { API_URL } from '@/config';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string | null;
  readonly requestId?: string;

  constructor(
    status: number,
    body: { code: string; message: string; field?: string | null; request_id?: string },
  ) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.field = body.field ?? null;
    this.requestId = body.request_id;
  }
}

// ---------- token storage (localStorage) ----------
const ACCESS_KEY = 'tryaigap.access_token';
const REFRESH_KEY = 'tryaigap.refresh_token';

export const tokenStorage = {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ---------- pluggable hooks (avoid circular imports) ----------
let languageProvider: () => string = () => 'es';
/** Register a provider for the Accept-Language header (called per request). */
export function setLanguageProvider(provider: () => string): void {
  languageProvider = provider;
}

let sessionExpiredHandler: (() => void) | null = null;
/** Register a handler fired when the session can no longer be refreshed. */
export function setSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}

// ---------- refresh (single-flight) ----------
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    const p = (async (): Promise<boolean> => {
      const refreshToken = tokenStorage.getRefresh();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept-Language': languageProvider() },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { access_token: string; refresh_token: string };
        tokenStorage.set(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      }
    })();
    refreshPromise = p;
    try {
      return await p;
    } finally {
      refreshPromise = null;
    }
  }
  return refreshPromise;
}

// ---------- core request ----------
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  /** Send Authorization header (default true). */
  auth?: boolean;
}

async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    'Accept-Language': languageProvider(),
    ...options.headers,
  };

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData; // browser sets multipart boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  if (options.auth !== false) {
    const token = tokenStorage.getAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (body !== undefined ? 'POST' : 'GET'),
      headers,
      body,
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Network request failed' });
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; field?: string | null; request_id?: string };
    } | null;
    const err = payload?.error;
    throw new ApiError(res.status, {
      code: err?.code ?? `HTTP_${res.status}`,
      message: err?.message ?? res.statusText,
      field: err?.field ?? null,
      request_id: err?.request_id,
    });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Authenticated request with one refresh-and-retry cycle on 401.
 * The refresh endpoint itself is never retried (it is only called
 * internally by `tryRefresh`, never through this wrapper).
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (e) {
    const retriable =
      e instanceof ApiError &&
      e.status === 401 &&
      options.auth !== false &&
      !path.startsWith('/auth/refresh');
    if (retriable) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return await rawRequest<T>(path, options);
      }
      tokenStorage.clear();
      sessionExpiredHandler?.();
    }
    throw e;
  }
}

async function rawBlobRequest(path: string): Promise<Blob> {
  const headers: Record<string, string> = { 'Accept-Language': languageProvider() };
  const token = tokenStorage.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers });
  } catch {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Network request failed' });
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(res.status, {
      code: payload?.error?.code ?? `HTTP_${res.status}`,
      message: payload?.error?.message ?? res.statusText,
    });
  }
  return res.blob();
}

/** Authenticated binary download (e.g. document files) with 401 refresh-retry. */
export async function apiBlob(path: string): Promise<Blob> {
  try {
    return await rawBlobRequest(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const refreshed = await tryRefresh();
      if (refreshed) return await rawBlobRequest(path);
      tokenStorage.clear();
      sessionExpiredHandler?.();
    }
    throw e;
  }
}
