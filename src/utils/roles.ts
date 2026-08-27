import type { Role } from '../types';

export type EmploymentTypeCode = 'PERMANENT' | 'CONTRACT' | 'TEMPORARY' | 'PJ';

/** Role string or a profile-like object with optional employmentType. */
export type RoleSubject =
  | string
  | null
  | undefined
  | {
      role?: string | null;
      employmentType?: string | null;
      status?: string | null;
    };

function asParts(
  subject?: RoleSubject,
  employmentType?: string | null,
): { role?: string | null; employmentType?: string | null; status?: string | null } {
  if (subject && typeof subject === 'object') {
    return {
      role: subject.role,
      employmentType: subject.employmentType ?? employmentType,
      status: subject.status,
    };
  }
  return { role: subject as string | null | undefined, employmentType };
}

/** Prestador PJ — escalas only; no punch / timesheet / payroll hours. */
export function isPjContractor(subject?: RoleSubject, employmentType?: string | null): boolean {
  const p = asParts(subject, employmentType);
  return String(p.employmentType ?? '').toUpperCase() === 'PJ';
}

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
 * Note: PJ contractors are NOT listed here — they still appear on work rosters.
 */
export function isNonPunchingStaff(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'HR' || role === 'MANAGEMENT';
}

/**
 * Accounts that must NEVER accrue a timesheet balance (no expected hours, no
 * absence, no hour-bank credit/debit). System/admin + Diretoria + PJ contractors.
 *
 * Note: HR is intentionally excluded — the RH assistant does punch the clock in
 * this deployment, so HR profiles are tracked normally.
 *
 * Accepts a role string (legacy) or `{ role, employmentType }`.
 */
export function isTimesheetExempt(subject?: RoleSubject, employmentType?: string | null): boolean {
  const p = asParts(subject, employmentType);
  if (isPjContractor(p)) return true;
  return p.role === 'ADMIN' || p.role === 'SUPER_ADMIN' || p.role === 'MANAGEMENT';
}

/** Active staff who punch the clock — reports metrics (PJ and Diretoria out). */
export function isClockReportEmployee(emp: {
  status?: string | null;
  role?: string | null;
  employmentType?: string | null;
}): boolean {
  if (emp.status === 'INACTIVE') return false;
  return !isTimesheetExempt(emp);
}

/**
 * Roles that require REP/DMPREP admission checklist after create.
 * PJ contractors never need clock admission even with EMPLOYEE role.
 */
export function needsClockAdmission(subject?: RoleSubject, employmentType?: string | null): boolean {
  const p = asParts(subject, employmentType);
  if (isPjContractor(p)) return false;
  return p.role === 'EMPLOYEE' || p.role === 'MANAGER' || p.role === 'TEAM_LEAD';
}

/**
 * Who appears on Saturday/holiday work roster grids.
 * Includes CLT punch roles and PJ (EMPLOYEE/MANAGER/TEAM_LEAD + employmentType PJ).
 * Excludes ADMIN/HR/MANAGEMENT/SUPER_ADMIN and INACTIVE.
 */
export function isRosterEligible(emp: {
  role?: string | null;
  employmentType?: string | null;
  status?: string | null;
}): boolean {
  if (emp.status === 'INACTIVE') return false;
  if (isNonPunchingStaff(emp.role) || emp.role === 'SUPER_ADMIN') return false;
  return emp.role === 'EMPLOYEE' || emp.role === 'MANAGER' || emp.role === 'TEAM_LEAD';
}

/** Login users who can open MyRoster (CLT punchers + PJ). */
export function canAccessMyRoster(subject?: RoleSubject, employmentType?: string | null): boolean {
  return needsClockAdmission(subject, employmentType) || isPjContractor(subject, employmentType);
}

/** Skip from payroll consolidation / CPF-PIS readiness (staff + PJ + exempt). */
export function isPayrollExcluded(subject?: RoleSubject, employmentType?: string | null): boolean {
  const p = asParts(subject, employmentType);
  if (p.role === 'SUPER_ADMIN') return true;
  if (isNonPunchingStaff(p.role)) return true;
  if (isTimesheetExempt(p)) return true;
  return false;
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
