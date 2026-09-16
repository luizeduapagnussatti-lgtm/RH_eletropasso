/**
 * Login provision helpers: import emails cannot receive a staff-set password.
 * Run: node scripts/test-employee-login-provision.mjs
 */
import assert from 'node:assert/strict';

const INTERNAL_AUTH_EMAIL_SUFFIXES = [
  '@eletropasso.loja',
  '@import.eletropasso.local',
  '@inactive.eletropasso.local',
];

function isInternalAuthEmail(email) {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return INTERNAL_AUTH_EMAIL_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

const LOGIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUsableLoginEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return LOGIN_EMAIL_RE.test(value) && !isInternalAuthEmail(value);
}

function staffPasswordRequiresRealEmail(loginEmail, password) {
  if (!String(password || '').trim()) return false;
  const email = String(loginEmail || '').trim();
  if (!email) return false;
  return !isUsableLoginEmail(email);
}

assert.equal(isUsableLoginEmail('rep.016015373653@import.eletropasso.local'), false);
assert.equal(isUsableLoginEmail('felipe@eletropasso.com.br'), true);
assert.equal(staffPasswordRequiresRealEmail('rep.016015373653@import.eletropasso.local', 'SenhaForte1'), true);
assert.equal(staffPasswordRequiresRealEmail('felipe@eletropasso.com.br', 'SenhaForte1'), false);
assert.equal(staffPasswordRequiresRealEmail('', 'SenhaForte1'), false);
assert.equal(staffPasswordRequiresRealEmail('rep.016015373653@import.eletropasso.local', ''), false);

console.log('test-employee-login-provision: ok');
