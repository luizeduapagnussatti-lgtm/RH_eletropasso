import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyOvertimeMinutes, isSundayDate } from './overtimeClassification.service.ts';

describe('overtimeClassification', () => {
  it('isSundayDate detects Sunday', () => {
    assert.equal(isSundayDate('2026-07-26'), true);
    assert.equal(isSundayDate('2026-07-27'), false);
  });

  it('weekday overtime goes to 50%', () => {
    const r = classifyOvertimeMinutes({
      workDate: '2026-07-27',
      overtimeMinutes: 120,
      isHoliday: false,
    });
    assert.equal(r.extra50Minutes, 120);
    assert.equal(r.extra100Minutes, 0);
  });

  it('Saturday half-day overtime goes to 50%', () => {
    const r = classifyOvertimeMinutes({
      workDate: '2026-07-25',
      overtimeMinutes: 45,
      isHoliday: false,
    });
    assert.equal(r.extra50Minutes, 45);
    assert.equal(r.extra100Minutes, 0);
  });

  it('Sunday overtime goes to 100%', () => {
    const r = classifyOvertimeMinutes({
      workDate: '2026-07-26',
      overtimeMinutes: 60,
      isHoliday: false,
    });
    assert.equal(r.extra50Minutes, 0);
    assert.equal(r.extra100Minutes, 60);
  });

  it('holiday overtime goes to 100%', () => {
    const r = classifyOvertimeMinutes({
      workDate: '2026-07-20',
      overtimeMinutes: 90,
      isHoliday: true,
    });
    assert.equal(r.extra50Minutes, 0);
    assert.equal(r.extra100Minutes, 90);
  });

  it('zero overtime returns zeros', () => {
    const r = classifyOvertimeMinutes({
      workDate: '2026-07-26',
      overtimeMinutes: 0,
      isHoliday: true,
    });
    assert.equal(r.extra50Minutes, 0);
    assert.equal(r.extra100Minutes, 0);
  });
});
