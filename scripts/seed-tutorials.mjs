/**
 * Seed published tutorials (pt-BR) into Supabase Postgres.
 *
 * Usage:
 *   node scripts/seed-tutorials.mjs
 *   node scripts/seed-tutorials.mjs --dry-run
 *
 * Requires local Docker container: supabase_db_RH_eletropasso
 */
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { GUIDES } from './tutorials/guides-pt-BR.mjs';

const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_RH_eletropasso';
const AUTHOR = 'RH_Eletropasso';
const dryRun = process.argv.includes('--dry-run');

function dollarQuote(tag, value) {
  // Find a tag that does not appear in value
  let t = tag;
  let i = 0;
  while (value.includes(`$${t}$`)) {
    t = `${tag}${i++}`;
  }
  return `$${t}$${value}$${t}$`;
}

function buildSql() {
  const lines = [
    '-- Seed RH_Eletropasso tutorials (pt-BR)',
    'BEGIN;',
    // Replace previous seed pack by slug (idempotent upsert)
    `DELETE FROM public.tutorials WHERE slug = ANY(ARRAY[${GUIDES.map((g) => `'${g.slug.replace(/'/g, "''")}'`).join(',')}]::text[]);`,
  ];

  const now = new Date().toISOString();

  for (const g of GUIDES) {
    const cols = [
      dollarQuote('t', g.title),
      dollarQuote('c', g.contentHtml.trim()),
      dollarQuote('e', g.excerpt || ''),
      dollarQuote('s', g.slug),
      `'PUBLISHED'`,
      dollarQuote('cat', g.category || 'Geral'),
      dollarQuote('a', AUTHOR),
      String(Number(g.displayOrder) || 0),
      `'${now}'`,
      `'${now}'`,
      `'${now}'`,
    ];
    lines.push(
      `INSERT INTO public.tutorials (title, content, excerpt, slug, status, category, author_name, display_order, published_at, created, updated)
VALUES (${cols.join(', ')});`
    );
  }

  lines.push('COMMIT;');
  lines.push(`SELECT COUNT(*) AS published FROM public.tutorials WHERE status = 'PUBLISHED';`);
  return lines.join('\n');
}

function main() {
  console.log(`[seed-tutorials] ${GUIDES.length} guides → ${DB_CONTAINER}`);
  const sql = buildSql();

  if (dryRun) {
    const out = join(tmpdir(), 'seed-tutorials-dry.sql');
    writeFileSync(out, sql, 'utf8');
    console.log(`[seed-tutorials] dry-run wrote ${out} (${sql.length} chars)`);
    return;
  }

  const sqlPathHost = join(tmpdir(), `seed-tutorials-${Date.now()}.sql`);
  writeFileSync(sqlPathHost, sql, 'utf8');
  const sqlPathContainer = '/tmp/seed-tutorials.sql';

  try {
    execFileSync('docker', ['cp', sqlPathHost, `${DB_CONTAINER}:${sqlPathContainer}`], {
      stdio: 'inherit',
    });
    const out = execFileSync(
      'docker',
      ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', sqlPathContainer],
      { encoding: 'utf8' }
    );
    console.log(out);
    console.log('[seed-tutorials] done.');
  } finally {
    try {
      unlinkSync(sqlPathHost);
    } catch {
      /* ignore */
    }
  }
}

main();
