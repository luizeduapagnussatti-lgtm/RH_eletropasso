/**
 * Import DMP REP employees (Funcionario) into Supabase profiles.
 *
 * Usage:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   DMPREP_ORGANIZATION_ID=7e620d63-0d21-4307-9f4e-1f1fa96cbc74 \
 *   DMPREP_MDB_PATH=C:\xampp\htdocs\RH_eletropasso\data\dmprep-remote\DIMEP.MDB \
 *   TEMP_PASSWORD=ChangeMe123! \
 *   node scripts/import-dmprep-employees.mjs
 *
 * Idempotent: skips employees whose PIS already maps to a profile in the org.
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.DMPREP_ORGANIZATION_ID ?? '7e620d63-0d21-4307-9f4e-1f1fa96cbc74';
const MDB_PATH =
  process.env.DMPREP_MDB_PATH ??
  'C:\\xampp\\htdocs\\RH_eletropasso\\data\\dmprep-remote\\DIMEP.MDB';
const TEMP_PASSWORD = process.env.TEMP_PASSWORD ?? 'DmprepImport2026!';

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!existsSync(MDB_PATH)) {
  console.error(`MDB not found: ${MDB_PATH}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function pisLookupKeys(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return [];
  const keys = new Set([digits, digits.padStart(11, '0'), digits.padStart(12, '0')]);
  if (digits.length === 12 && digits.startsWith('0')) keys.add(digits.slice(1));
  if (digits.length === 11) keys.add(`0${digits}`);
  return [...keys];
}

function employeeIdFromPis(pis) {
  const digits = String(pis ?? '').replace(/\D/g, '');
  return digits ? digits.padStart(12, '0') : '';
}

function slugEmail(pis12) {
  return `rep.${pis12}@import.eletropasso.local`;
}

function loadFuncionarios(mdbPath) {
  const py = spawnSync(
    'python',
    [
      '-c',
      `
from access_parser import AccessParser
import json, sys
db = AccessParser(sys.argv[1])
cols = db.parse_table('Funcionario')
n = max(len(v) for v in cols.values()) if cols else 0
rows = []
for i in range(n):
    row = {k: (cols[k][i] if i < len(cols[k]) else None) for k in cols}
    rows.append(row)
print(json.dumps(rows, ensure_ascii=False, default=str))
`.trim(),
      mdbPath,
    ],
    { encoding: 'utf8' },
  );
  if (py.status !== 0) {
    console.error(py.stderr || py.stdout);
    throw new Error('Failed to read DIMEP.MDB (pip install access-parser)');
  }
  return JSON.parse(py.stdout);
}

function parseDate(value) {
  if (!value || String(value).includes('Empty')) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

async function main() {
  const employees = loadFuncionarios(MDB_PATH);
  console.log(`Loaded ${employees.length} rows from Funcionario`);

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, employee_id, email, name')
    .eq('organization_id', ORG_ID);
  if (profileError) throw profileError;

  const index = new Map();
  for (const profile of profiles ?? []) {
    for (const key of pisLookupKeys(profile.employee_id)) {
      index.set(key, profile);
    }
  }

  let created = 0;
  let skipped = 0;
  let updated = 0;
  let failed = 0;

  for (const row of employees) {
    const pis = String(row.PIS ?? '').replace(/\D/g, '');
    const employeeId = employeeIdFromPis(pis);
    const name = String(row.Nome ?? '').trim();
    const designation = String(row.Cargo ?? '').trim() || null;
    const joiningDate = parseDate(row.DtAdmissao);

    if (!employeeId || !name) {
      console.warn('SKIP invalid row:', row);
      failed++;
      continue;
    }

    const existing = pisLookupKeys(employeeId).map((k) => index.get(k)).find(Boolean);
    if (existing) {
      const { error } = await supabase
        .from('profiles')
        .update({
          name,
          designation,
          joining_date: joiningDate,
          employee_id: employeeId,
          updated: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) {
        console.error('UPDATE failed', name, error.message);
        failed++;
      } else {
        console.log(`UPDATE ${employeeId} ${name}`);
        updated++;
      }
      skipped++;
      continue;
    }

    const email = slugEmail(employeeId);
    const { data: authData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { name, source: 'dmprep-import' },
    });

    if (createErr || !authData.user) {
      console.error('CREATE auth failed', name, createErr?.message);
      failed++;
      continue;
    }

    const userId = authData.user.id;
    const { error: upsertErr } = await supabase.from('profiles').upsert({
      id: userId,
      organization_id: ORG_ID,
      name,
      email,
      role: 'EMPLOYEE',
      employee_id: employeeId,
      designation,
      joining_date: joiningDate,
      verified: false,
      updated: new Date().toISOString(),
    });

    if (upsertErr) {
      console.error('PROFILE upsert failed', name, upsertErr.message);
      await supabase.auth.admin.deleteUser(userId);
      failed++;
      continue;
    }

    for (const key of pisLookupKeys(employeeId)) {
      index.set(key, { id: userId, employee_id: employeeId, email, name });
    }
    console.log(`CREATE ${employeeId} ${name} (${email})`);
    created++;
  }

  console.log(JSON.stringify({ created, updated, skipped, failed, total: employees.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
