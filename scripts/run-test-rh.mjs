#!/usr/bin/env node
/**
 * RH_Eletropasso validation harness — runs critical script tests in sequence.
 * Usage: npm run test:rh
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

const SCRIPTS = [
  'test-timesheet-day-ack-validation.mjs',
  'test-timesheet-coherence.mjs',
  'test-timesheet-review-validation.mjs',
  'test-timesheet-punch-adjust.mjs',
  'test-employment-window-calc.mjs',
];

let failed = 0;

for (const script of SCRIPTS) {
  const scriptPath = path.join(root, script);
  console.log(`\n▶ npx vite-node scripts/${script}`);
  const result = spawnSync('npx', ['vite-node', scriptPath], {
    cwd: path.join(root, '..'),
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    failed++;
    console.error(`✗ ${script} failed (exit ${result.status})`);
  } else {
    console.log(`✓ ${script}`);
  }
}

const dmprepPkg = path.join(root, '..', 'services', 'dmprep-sync', 'package.json');
if (existsSync(dmprepPkg)) {
  console.log('\n▶ services/dmprep-sync npm test');
  const dmp = spawnSync('npm', ['test'], {
    cwd: path.dirname(dmprepPkg),
    stdio: 'inherit',
    shell: true,
  });
  if (dmp.status !== 0) {
    failed++;
    console.error('✗ dmprep-sync tests failed');
  } else {
    console.log('✓ dmprep-sync tests');
  }
}

if (failed > 0) {
  console.error(`\n${failed} suite(s) failed.`);
  process.exit(1);
}

console.log('\nAll RH validation suites passed.');
