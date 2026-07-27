import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeCnpj, validateCnpj, formatCnpjDisplay } from './employerCredentials.ts';

describe('employerCredentials', () => {
  it('normalizeCnpj strips non-digits', () => {
    assert.equal(normalizeCnpj('12.345.678/0001-95'), '12345678000195');
  });

  it('validateCnpj accepts valid CNPJ', () => {
    assert.equal(validateCnpj('11222333000181').ok, true);
  });

  it('validateCnpj rejects invalid', () => {
    assert.equal(validateCnpj('').ok, false);
    assert.equal(validateCnpj('11111111111111').ok, false);
  });

  it('formatCnpjDisplay masks CNPJ', () => {
    assert.equal(formatCnpjDisplay('11222333000181'), '11.222.333/0001-81');
  });
});
