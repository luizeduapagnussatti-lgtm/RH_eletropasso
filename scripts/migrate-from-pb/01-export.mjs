/**
 * Phase 7 — Step 1: Export PocketBase SQLite backup to JSON files
 *
 * Reads directly from the local SQLite backup — no PB server required.
 *
 * Usage:
 *   node scripts/migrate-from-pb/01-export.mjs
 *
 * Output: exports/ directory with one JSON file per collection.
 * Existing export files are skipped (delete to re-export).
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = join(__dirname, '../../exports');
const DB_PATH = join(__dirname, '@auto_pb_backup_open_hr_app_20260513000000/data.db');

if (!existsSync(DB_PATH)) {
  console.error(`SQLite backup not found at: ${DB_PATH}`);
  process.exit(1);
}

mkdirSync(EXPORTS_DIR, { recursive: true });

const db = new Database(DB_PATH, { readonly: true });

const COLLECTIONS = [
  'organizations',
  'users',
  'teams',
  'shifts',
  'settings',
  'attendance',
  'leaves',
  'announcements',
  'notifications',
  'review_cycles',
  'performance_reviews',
  'upgrade_requests',
  'blog_posts',
  'tutorials',
  'reports_queue',
  'self_assessment',
];

function exportTable(table) {
  const outFile = join(EXPORTS_DIR, `${table}.json`);
  if (existsSync(outFile)) {
    console.log(`  skip ${table} (already exported)`);
    return;
  }

  let rows;
  try {
    rows = db.prepare(`SELECT * FROM ${table} ORDER BY created`).all();
  } catch (e) {
    console.warn(`  WARN: ${table} — ${e.message} (skipped)`);
    return;
  }

  writeFileSync(outFile, JSON.stringify(rows, null, 2));
  console.log(`  ✓ ${table}: ${rows.length} records → exports/${table}.json`);
}

console.log(`Reading SQLite backup: ${DB_PATH}\n`);
for (const col of COLLECTIONS) {
  exportTable(col);
}

db.close();
console.log('\nDone. Run 02-import.mjs next.');
