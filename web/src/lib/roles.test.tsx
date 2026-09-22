import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { canAccessConsultant } from './roles';
import { RequireRole } from '@/components/RequireRole';
import { useAuthStore } from '@/store/authStore';
import type { MeResponse } from '@/api/types';

function setUser(role: MeResponse['role'] | null) {
  useAuthStore.setState({
    user: role
      ? { id: 'u1', email: 'x@acme.com', role, locale: 'es', organization_id: 'o1' }
      : null,
    status: role ? 'authenticated' : 'unauthenticated',
  });
}

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/consultant']}>
      <Routes>
        <Route
          path="/consultant"
          element={
            <RequireRole roles={['consultant']}>
              <p>consultant-console</p>
            </RequireRole>
          }
        />
        <Route path="/dashboard" element={<p>dashboard-redirect</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('consultant route guard', () => {
  it('canAccessConsultant allows only the consultant role', () => {
    expect(canAccessConsultant('consultant')).toBe(true);
    expect(canAccessConsultant('client')).toBe(false);
    expect(canAccessConsultant('admin')).toBe(false);
    expect(canAccessConsultant(null)).toBe(false);
    expect(canAccessConsultant(undefined)).toBe(false);
  });

  it('renders the console for consultants', () => {
    setUser('consultant');
    renderGuard();
    expect(screen.getByText('consultant-console')).toBeInTheDocument();
  });

  it('redirects clients away from /consultant', () => {
    setUser('client');
    renderGuard();
    expect(screen.queryByText('consultant-console')).not.toBeInTheDocument();
    expect(screen.getByText('dashboard-redirect')).toBeInTheDocument();
  });

  it('redirects admins (backend is consultant-only too)', () => {
    setUser('admin');
    renderGuard();
    expect(screen.getByText('dashboard-redirect')).toBeInTheDocument();
  });
});
