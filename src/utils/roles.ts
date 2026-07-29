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

/**
 * Profiles that do not punch the clock / do not need DMPREP admission.
 * ADMIN = app owner; HR = RH assistant; MANAGEMENT = Diretoria (não CLT / sem ponto).
 */
export function isNonPunchingStaff(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'HR' || role === 'MANAGEMENT';
}

/**
 * Accounts that must NEVER accrue a timesheet balance (no expected hours, no
 * absence, no hour-bank credit/debit). These are system/administration profiles
 * that do not clock in: ADMIN (system owner), SUPER_ADMIN (platform) and
 * MANAGEMENT (Diretoria, não CLT).
 *
 * Note: HR is intentionally excluded — the RH assistant does punch the clock in
 * this deployment, so HR profiles are tracked normally.
 */
export function isTimesheetExempt(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MANAGEMENT';
}

/** Roles that require REP/DMPREP admission checklist after create. */
export function needsClockAdmission(role?: string | null): boolean {
  return role === 'EMPLOYEE' || role === 'MANAGER' || role === 'TEAM_LEAD';
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

/** Saturday / holiday work roster — Admin, RH and store managers. */
export function canManageRoster(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'HR' || role === 'MANAGER';
}
