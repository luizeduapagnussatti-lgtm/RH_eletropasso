/**
 * Production build with LAN Supabase URL from .env / .env.production.
 * Prevents baking http://127.0.0.1:54321 when the machine has a stale VITE_SUPABASE_URL.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const merged = {
  ...parseEnvFile(path.join(root, '.env')),
  ...parseEnvFile(path.join(root, '.env.production')),
};

for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_LAN_SHARE_URL']) {
  if (merged[key]) process.env[key] = merged[key];
}

const url = process.env.VITE_SUPABASE_URL || '';
if (!url || url.includes('127.0.0.1') || url.includes('localhost')) {
  console.error(
    '[build-production] VITE_SUPABASE_URL must point to https://api-rh.eletropasso.local (see .env.production). Got:',
    url || '(empty)'
  );
  process.exit(1);
}

console.log('[build-production] VITE_SUPABASE_URL=', url);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const post = spawnSync(npm, ['exec', 'vite', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (post.status !== 0) process.exit(post.status ?? 1);

for (const script of ['scripts/generate-sitemap.mjs', 'scripts/generate-feed.mjs']) {
  const r = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
