import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePis,
  validatePis,
  validateCpf,
  formatCpfDisplay,
  formatPisDisplay,
  allocateNextClockCredential,
  isShortClockCredential,
  normalizeClockCredential,
  toWatchCommSendEmployee,
} from './employeeCredentials.ts';

describe('employeeCredentials', () => {
  it('normalizePis pads to 12 digits', () => {
    assert.equal(normalizePis('26740847000'), '026740847000');
    assert.equal(normalizePis('026740847000'), '026740847000');
    assert.equal(normalizePis(''), '');
  });

  it('validatePis accepts 11–12 digit credentials', () => {
    assert.equal(validatePis('26740847000').ok, true);
    assert.equal(validatePis('026740847000').ok, true);
    assert.equal(validatePis('').ok, false);
    assert.equal(validatePis('123').ok, false);
    assert.equal(validatePis('abc').ok, false);
  });

  it('formatPisDisplay returns normalized PIS', () => {
    assert.equal(formatPisDisplay('26740847000'), '026740847000');
  });

  it('validateCpf accepts valid CPF and rejects invalid', () => {
    assert.equal(validateCpf('').ok, true);
    assert.equal(validateCpf('529.982.247-25').ok, true);
    assert.equal(validateCpf('111.111.111-11').ok, false);
    assert.equal(validateCpf('12345678901').ok, false);
  });

  it('formatCpfDisplay masks CPF', () => {
    assert.equal(formatCpfDisplay('52998224725'), '529.982.247-25');
  });

  it('isShortClockCredential rejects PIS-like values', () => {
    assert.equal(isShortClockCredential('98'), true);
    assert.equal(isShortClockCredential('000000000098'), true);
    assert.equal(isShortClockCredential('012443149112'), false);
    assert.equal(isShortClockCredential(''), false);
  });

  it('allocateNextClockCredential uses max short ID + 1', () => {
    assert.equal(allocateNextClockCredential([]), '000000000001');
    assert.equal(
      allocateNextClockCredential(['000000000001', '000000000098', '17']),
      '000000000099'
    );
  });

  it('allocateNextClockCredential ignores PIS leftovers in the max', () => {
    assert.equal(
      allocateNextClockCredential(['000000000098', '012443149112']),
      '000000000099'
    );
  });

  it('allocateNextClockCredential skips a taken next slot', () => {
    assert.equal(
      allocateNextClockCredential(['98', '99', '000000000100']),
      '000000000101'
    );
  });

  it('normalizeClockCredential pads short IDs to 12', () => {
    assert.equal(normalizeClockCredential('99'), '000000000099');
  });

  it('allocateNextClockCredential never reuses inactive credentials still in the list', () => {
    // Paulo (INACTIVE) keeps 97; next hire must get 98+
    assert.equal(
      allocateNextClockCredential(['000000000097', null, '', '000000000050']),
      '000000000098'
    );
  });

  it('toWatchCommSendEmployee sends padded PIS and short credential', () => {
    const row = toWatchCommSendEmployee({
      name: 'Gustavo Guedes',
      employeeId: '26740847000',
      clockCredential: '000000000099',
    });
    assert.deepEqual(row, {
      pis: '026740847000',
      name: 'Gustavo Guedes',
      credential: '99',
    });
    assert.equal(toWatchCommSendEmployee({ name: 'X', employeeId: '' }), null);
    // Never use PIS as keypad credential
    assert.equal(
      toWatchCommSendEmployee({ name: 'Y', employeeId: '026740847000', clockCredential: null }),
      null
    );
  });
});
