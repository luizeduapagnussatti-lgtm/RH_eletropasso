/**
 * resolveNotificationNav — roster + swap deep-link
 * Run: node scripts/test-notification-roster-nav.mjs
 */
import assert from 'node:assert/strict';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function canAccessMyRoster(user) {
  const role = String(user?.role || '').toUpperCase();
  return role === 'EMPLOYEE' || role === 'MANAGER' || role === 'TEAM_LEAD';
}

function canManageRoster(role) {
  const r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'HR' || r === 'MANAGER';
}

function resolveNotificationNav(notification, user) {
  let path = (notification.actionUrl || '').trim();
  if (!path && notification.referenceType === 'roster') path = 'my-roster';
  if (!path && notification.referenceType === 'roster_swap') {
    path = canManageRoster(user?.role) ? 'roster' : 'my-roster';
  }
  if (!path) return null;

  if (
    (notification.referenceType === 'roster_swap' || path === 'roster') &&
    canManageRoster(user?.role)
  ) {
    if (path === 'my-roster' || notification.referenceType === 'roster_swap') {
      path = 'roster';
    }
  }

  if (path === 'my-roster' && user && !canAccessMyRoster(user)) {
    const role = String(user.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'HR' || role === 'MANAGER') path = 'roster';
  }
  const fromMeta = notification.metadata?.workDate;
  const fromRef = notification.referenceId;
  const focusDate =
    (typeof fromMeta === 'string' && ISO_DATE_RE.test(fromMeta) && fromMeta) ||
    (typeof fromRef === 'string' && ISO_DATE_RE.test(fromRef) && fromRef) ||
    undefined;
  if (focusDate && (path === 'my-roster' || path === 'roster')) {
    const [, y, m] = focusDate.match(ISO_DATE_RE);
    return { path, params: { year: Number(y), month: Number(m), focusDate } };
  }
  return { path };
}

const manager = resolveNotificationNav(
  { actionUrl: 'my-roster', referenceId: '2026-09-05', referenceType: 'roster' },
  { role: 'MANAGER' },
);
assert.equal(manager.path, 'my-roster');
assert.deepEqual(manager.params, { year: 2026, month: 9, focusDate: '2026-09-05' });

const fallback = resolveNotificationNav(
  { actionUrl: '', referenceType: 'roster', referenceId: '2026-09-12' },
  { role: 'EMPLOYEE' },
);
assert.equal(fallback.path, 'my-roster');
assert.equal(fallback.params.focusDate, '2026-09-12');

const admin = resolveNotificationNav(
  { actionUrl: 'my-roster', referenceId: '2026-09-05', metadata: { workDate: '2026-09-05' } },
  { role: 'ADMIN' },
);
assert.equal(admin.path, 'roster');
assert.equal(admin.params.month, 9);

const swapMgr = resolveNotificationNav(
  {
    actionUrl: 'my-roster',
    referenceType: 'roster_swap',
    referenceId: '2026-09-19',
  },
  { role: 'MANAGER' },
);
assert.equal(swapMgr.path, 'roster');
assert.equal(swapMgr.params.focusDate, '2026-09-19');

const swapEmp = resolveNotificationNav(
  {
    actionUrl: 'my-roster',
    referenceType: 'roster_swap',
    referenceId: '2026-09-19',
  },
  { role: 'EMPLOYEE' },
);
assert.equal(swapEmp.path, 'my-roster');

const noop = resolveNotificationNav({ title: 'x' }, { role: 'EMPLOYEE' });
assert.equal(noop, null);

console.log('✅ notification roster nav tests passed.');
