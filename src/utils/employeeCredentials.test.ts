import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePis,
  validatePis,
  validateCpf,
  formatCpfDisplay,
  formatPisDisplay,
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
});
