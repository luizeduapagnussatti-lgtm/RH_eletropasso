import type { Role } from '../types';

/** Organization owner — full app admin (not a punch profile). */
export function isOrgAdmin(role?: string | null): boolean {
  return role === 'ADMIN';
}

/** Operational RH assistant (auxiliar de RH). */
export function isHrAssistant(role?: string | null): boolean {
  return role === 'HR';
}

/** Admin or HR assistant — people-ops staff. */
export function isStaffAdmin(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'HR';
}

/** Staff who administer the app and should not use clock-in UX. */
export function isNonPunchingStaff(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'HR';
}

/** Roles an actor may assign when creating/editing users. */
export function assignableRoles(actorRole?: string | null): Role[] {
  const all: Role[] = ['EMPLOYEE', 'MANAGER', 'TEAM_LEAD', 'MANAGEMENT', 'HR', 'ADMIN'];
  if (actorRole === 'ADMIN') return all;
  if (actorRole === 'HR') return all.filter(r => r !== 'ADMIN');
  return [];
}

export function canAssignRole(actorRole?: string | null, targetRole?: string | null): boolean {
  if (!targetRole) return false;
  return assignableRoles(actorRole).includes(targetRole as Role);
}

/** HR cannot edit/delete ADMIN accounts. */
export function canManageEmployeeRecord(
  actorRole?: string | null,
  targetRole?: string | null
): boolean {
  if (actorRole === 'ADMIN') return true;
  if (actorRole === 'HR') return targetRole !== 'ADMIN' && targetRole !== 'SUPER_ADMIN';
  return false;
}
