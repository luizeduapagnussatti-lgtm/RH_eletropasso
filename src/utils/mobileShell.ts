import { isPjContractor, needsClockAdmission, type RoleSubject } from './roles';

export const EMPLOYEE_MOBILE_MAX_WIDTH = 767;

/** Routes that record mobile selfie attendance — blocked on employee mobile shell. */
export const ATTENDANCE_ROUTE_IDS = new Set([
  'attendance',
  'attendance-quick-office',
  'attendance-quick-factory',
  'attendance-finish',
]);

export function isAttendanceRoute(path: string): boolean {
  return path === 'attendance' || path.startsWith('attendance-');
}

export function isEmployeeMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(max-width: ${EMPLOYEE_MOBILE_MAX_WIDTH}px)`).matches;
}

/**
 * Punching CLT roles and PJ contractors get the simplified mobile shell.
 * PJ sees roster/profile; timesheet shortcuts stay hidden in the UI.
 */
export function shouldUseEmployeeMobileShell(
  roleOrUser?: RoleSubject,
  isMobile = isEmployeeMobileViewport(),
): boolean {
  return isMobile && (needsClockAdmission(roleOrUser) || isPjContractor(roleOrUser));
}

export const EMPLOYEE_MOBILE_NAV_PATHS = new Set([
  'dashboard',
  'my-timesheet',
  'my-roster',
  'profile',
  'leave',
]);
