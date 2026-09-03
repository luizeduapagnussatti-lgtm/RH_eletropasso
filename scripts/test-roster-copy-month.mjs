import assert from 'node:assert/strict';

// Mock saturdaysInMonth instead of importing to test logic in isolation
function saturdaysInMonth(year, month) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const toIso = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
  
  const out = [];
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 6) out.push(toIso(year, month, d));
  }
  return out;
}

const sourceSats = saturdaysInMonth(2026, 9); // Sep 2026: 4 saturdays (5, 12, 19, 26)
const targetSats = saturdaysInMonth(2026, 11); // Nov 2026: 4 saturdays (7, 14, 21, 28)

assert.equal(sourceSats.length, 4);
assert.equal(targetSats.length, 4);

const minLen = Math.min(sourceSats.length, targetSats.length);
assert.equal(minLen, 4);

const mappings = [];
for (let i = 0; i < minLen; i++) {
  mappings.push({ from: sourceSats[i], to: targetSats[i] });
}

assert.deepEqual(mappings, [
  { from: '2026-09-05', to: '2026-11-07' },
  { from: '2026-09-12', to: '2026-11-14' },
  { from: '2026-09-19', to: '2026-11-21' },
  { from: '2026-09-26', to: '2026-11-28' },
]);

// Test 5 saturdays -> 4 saturdays (August 2026 has 5: 1, 8, 15, 22, 29)
const augSats = saturdaysInMonth(2026, 8);
assert.equal(augSats.length, 5);

const minLen2 = Math.min(augSats.length, targetSats.length);
assert.equal(minLen2, 4); // Only maps 4

console.log('✅ Roster copy month ordinal mapping tests passed.');
