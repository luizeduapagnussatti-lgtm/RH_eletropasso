/**
 * Duration HH:mm helpers.
 * Run: npx vite-node scripts/test-duration-hm.mjs
 */
import assert from 'node:assert/strict';
import { minutesToHm, minutesToDisplay, hmToMinutes } from '../src/utils/durationHm.ts';

assert.equal(minutesToHm(240), '04:00');
assert.equal(minutesToHm(225), '03:45');
assert.equal(minutesToHm(5), '00:05');
assert.equal(minutesToHm(1320), '22:00');
assert.equal(minutesToHm(0), '00:00');
assert.equal(minutesToHm(-90), '-01:30');

assert.equal(minutesToDisplay(0), '—');
assert.equal(minutesToDisplay(208), '03:28');
assert.equal(minutesToDisplay(-15), '-00:15');

assert.equal(hmToMinutes('03:45'), 225);
assert.equal(hmToMinutes('3:45'), 225);
assert.equal(hmToMinutes('22:00'), 1320);
assert.equal(hmToMinutes('00:05'), 5);
assert.equal(hmToMinutes('04:00'), 240);
assert.equal(hmToMinutes('-01:30'), -90);
assert.equal(hmToMinutes(''), null);
assert.equal(hmToMinutes('99:99'), null);
assert.equal(hmToMinutes('abc'), null);
assert.equal(hmToMinutes('12'), null);

console.log('durationHm OK');
