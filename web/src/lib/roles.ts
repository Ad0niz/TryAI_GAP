/** Role-based access helpers for route guards and menus. */
import type { Role } from '@/api/types';

/** Consultant console is restricted to the consultant role (backend enforces
 * require_roles("consultant") — admin gets 403 there too). */
export function canAccessConsultant(role: Role | null | undefined): boolean {
  return role === 'consultant';
}
