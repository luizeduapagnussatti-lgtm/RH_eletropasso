import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { employeeIdFromPis, importEmailFromPis, pisLookupKeys } from '../src/employees/credentials.js';

describe('DMPREP credentials', () => {
  it('normalizes PIS to 12 digits', () => {
    assert.equal(employeeIdFromPis('26740847000'), '026740847000');
    assert.equal(employeeIdFromPis('026740847000'), '026740847000');
  });

  it('builds lookup keys for ingest matching', () => {
    const keys = pisLookupKeys('026740847000');
    assert.ok(keys.includes('026740847000'));
    assert.ok(keys.includes('26740847000'));
  });

  it('builds import email slug', () => {
    assert.equal(importEmailFromPis('026740847000'), 'rep.026740847000@import.eletropasso.local');
  });
});
