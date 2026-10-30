import { safeReturnPath } from '@/routes/ProtectedRoute';

/** Roles allowed on the shared public register form (never ADMIN). */
export const REGISTERABLE_ROLES = ['CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER'] as const;

export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number];

export function isRegisterableRole(value: string | null | undefined): value is RegisterableRole {
  return Boolean(value && (REGISTERABLE_ROLES as readonly string[]).includes(value));
}

/**
 * Resolve register role from navigation (?role=).
 * Unknown / missing / ADMIN → CUSTOMER (no privilege escalation via query).
 */
export function parseRegisterRole(raw: string | null | undefined): RegisterableRole {
  const role = String(raw || '')
    .trim()
    .toUpperCase();
  if (isRegisterableRole(role)) return role;
  return 'CUSTOMER';
}

/** Build `/register?role=…` and optionally preserve a safe `next` return path. */
export function withRegisterParams(role: RegisterableRole, next?: string | null) {
  const params = new URLSearchParams();
  params.set('role', role);
  const safe = safeReturnPath(next);
  if (safe) params.set('next', safe);
  return `/register?${params.toString()}`;
}
