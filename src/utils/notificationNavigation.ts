import type { AppNotification } from '../types';
import { canAccessMyRoster, canManageRoster } from './roles';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type NotificationNavResult = {
  path: string;
  params?: {
    year?: number;
    month?: number;
    focusDate?: string;
    openRequest?: boolean;
    missingDates?: string[];
  };
};

function extractFocusDate(notification: AppNotification): string | undefined {
  const fromMeta = notification.metadata?.workDate;
  if (typeof fromMeta === 'string' && ISO_DATE_RE.test(fromMeta)) return fromMeta;
  const fromRef = notification.referenceId;
  if (typeof fromRef === 'string' && ISO_DATE_RE.test(fromRef)) return fromRef;
  return undefined;
}

function dateParams(focusDate: string): { year: number; month: number; focusDate: string } {
  const [, y, m] = focusDate.match(ISO_DATE_RE)!;
  return { year: Number(y), month: Number(m), focusDate };
}

/**
 * Resolve where a notification click should navigate.
 * Roster alerts prefer Minha escala with year/month/focusDate deep-link.
 * Swap approvals for managers go to team Escalas.
 */
export function resolveNotificationNav(
  notification: AppNotification,
  user?: { role?: string | null; employmentType?: string | null } | null,
): NotificationNavResult | null {
  let path = (notification.actionUrl || '').trim();

  if (!path && notification.referenceType === 'roster') {
    path = 'my-roster';
  }
  if (!path && notification.referenceType === 'roster_swap') {
    path = canManageRoster(user?.role) ? 'roster' : 'my-roster';
  }
  if (!path && notification.referenceType === 'MISSING_PUNCHES_ALERT') {
    path = 'punch-corrections';
  }
  if (!path && notification.referenceType === 'punch_correction') {
    path = 'punch-corrections';
  }

  if (!path) return null;

  // Manager/Admin/HR approving swaps land on team Escalas, not Minha escala.
  if (
    (notification.referenceType === 'roster_swap' || path === 'roster') &&
    canManageRoster(user?.role)
  ) {
    if (path === 'my-roster' || notification.referenceType === 'roster_swap') {
      path = 'roster';
    }
  }

  // ADMIN/HR (and similar) cannot open my-roster — send them to team Escalas.
  if (path === 'my-roster' && user && !canAccessMyRoster(user)) {
    const role = String(user.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'HR' || role === 'MANAGER') {
      path = 'roster';
    }
  }

  if (path === 'punch-corrections') {
    const metaDates = notification.metadata?.missingDates;
    const dates = Array.isArray(metaDates)
      ? metaDates.filter((d): d is string => typeof d === 'string')
      : [];
    const openRequest =
      notification.referenceType === 'MISSING_PUNCHES_ALERT' && dates.length > 0;
    return {
      path,
      params: {
        ...(openRequest ? { openRequest: true, missingDates: dates } : {}),
      },
    };
  }

  const focusDate = extractFocusDate(notification);
  if (focusDate && (path === 'my-roster' || path === 'roster')) {
    return { path, params: dateParams(focusDate) };
  }

  return { path };
}
