/**
 * Session store (zustand): user, tokens (via tokenStorage) and auth actions.
 * Roles: client | consultant | admin.
 */
import { create } from 'zustand';
import { ApiError, setSessionExpiredHandler, tokenStorage } from '@/api/client';
import { fetchMe, logoutRequest, verifyMagicLink } from '@/api';
import type { MeResponse, Role } from '@/api/types';
import { useAssessmentStore } from './assessmentStore';

const USER_KEY = 'tryaigap.user';

export type AuthStatus = 'idle' | 'hydrating' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: MeResponse | null;
  status: AuthStatus;
  /** Exchange a magic-link token for a session. */
  verify: (token: string) => Promise<MeResponse>;
  /** Revoke tokens server-side (best effort) and clear the local session. */
  logout: () => Promise<void>;
  /** Restore the session on reload via GET /auth/me. */
  hydrate: () => Promise<void>;
  /** Role helper for guards and menus. */
  hasRole: (...roles: Role[]) => boolean;
}

function loadCachedUser(): MeResponse | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as MeResponse) : null;
  } catch {
    return null;
  }
}

function persistUser(user: MeResponse | null): void {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

/** Bootstrap (or drop) the organization assessment after auth state changes. */
function syncAssessment(user: MeResponse | null): void {
  const store = useAssessmentStore.getState();
  if (user?.organization_id) {
    void store.load().catch(() => undefined);
  } else {
    store.clear();
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadCachedUser(),
  status: 'idle',

  async verify(token) {
    const res = await verifyMagicLink(token);
    tokenStorage.set(res.access_token, res.refresh_token);
    const user: MeResponse = {
      id: res.user.id,
      email: res.user.email,
      role: res.user.role,
      locale: res.user.locale,
      full_name: null,
      organization_id: null,
    };
    persistUser(user);
    set({ user, status: 'authenticated' });
    // Hydrate the full profile (organization_id etc.) in the background.
    void get()
      .hydrate()
      .catch(() => undefined);
    return user;
  },

  async logout() {
    try {
      await logoutRequest();
    } catch {
      // Best effort: even if the backend is unreachable we clear the session.
    } finally {
      tokenStorage.clear();
      persistUser(null);
      set({ user: null, status: 'unauthenticated' });
      syncAssessment(null);
    }
  },

  async hydrate() {
    if (!tokenStorage.getAccess()) {
      persistUser(null);
      set({ user: null, status: 'unauthenticated' });
      return;
    }
    if (get().status !== 'authenticated') set({ status: 'hydrating' });
    try {
      const user = await fetchMe();
      persistUser(user);
      set({ user, status: 'authenticated' });
      syncAssessment(user);
    } catch (e) {
      // The API client already cleared tokens on an unrecoverable 401.
      if (e instanceof ApiError && e.status === 401) {
        persistUser(null);
        set({ user: null, status: 'unauthenticated' });
      } else {
        // Network/backend down: keep the cached user if we have one.
        const cached = loadCachedUser();
        set({ user: cached, status: cached ? 'authenticated' : 'unauthenticated' });
      }
    }
  },

  hasRole(...roles) {
    const { user } = get();
    return !!user && roles.includes(user.role);
  },
}));

// When the refresh token also fails, the API client clears tokens — mirror that here.
setSessionExpiredHandler(() => {
  persistUser(null);
  useAuthStore.setState({ user: null, status: 'unauthenticated' });
  useAssessmentStore.getState().clear();
});
