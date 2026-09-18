/**
 * Staff-admin mobile nav eligibility (mirrors MainLayout).
 * Run: node scripts/test-admin-pwa-nav.mjs
 */
import assert from 'node:assert/strict';

function needsClockAdmission(role) {
  return ['EMPLOYEE', 'MANAGER', 'TEAM_LEAD'].includes(String(role || '').toUpperCase());
}

function isPjContractor(employmentType) {
  return String(employmentType || '').toUpperCase() === 'PJ';
}

function shouldUseEmployeeMobileShell(role, employmentType, isMobile) {
  return isMobile && (needsClockAdmission(role) || isPjContractor(employmentType));
}

function isStaffAdmin(role) {
  return role === 'ADMIN' || role === 'HR';
}

function shouldUseStaffAdminMobileNav(role, employmentType, isMobile) {
  return !shouldUseEmployeeMobileShell(role, employmentType, isMobile) && isStaffAdmin(role);
}

assert.equal(shouldUseStaffAdminMobileNav('ADMIN', 'PERMANENT', true), true);
assert.equal(shouldUseStaffAdminMobileNav('HR', 'PERMANENT', true), true);
assert.equal(shouldUseStaffAdminMobileNav('MANAGER', 'PERMANENT', true), false);
assert.equal(shouldUseStaffAdminMobileNav('EMPLOYEE', 'PERMANENT', true), false);
assert.equal(shouldUseStaffAdminMobileNav('ADMIN', 'PERMANENT', false), true); // desktop: BN hidden via CSS
assert.equal(shouldUseEmployeeMobileShell('ADMIN', 'PERMANENT', true), false);

console.log('test-admin-pwa-nav: ok');
