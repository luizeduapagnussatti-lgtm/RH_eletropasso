import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SyncConfig } from '../config.js';
import { employeeIdFromPis, importEmailFromPis, pisLookupKeys } from './credentials.js';

export interface DmprepFuncionarioRow {
  PIS?: string | number | null;
  Nome?: string | null;
  Cargo?: string | null;
  DtAdmissao?: string | null;
}

export interface EmployeeImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
}

interface ProfileRow {
  id: string;
  employee_id: string | null;
  email: string | null;
  name: string | null;
}

function parseDate(value: unknown): string | null {
  if (!value || String(value).includes('Empty')) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function loadFuncionariosFromMdb(mdbPath: string): DmprepFuncionarioRow[] {
  if (!existsSync(mdbPath)) {
    throw new Error(`DIMEP.MDB not found: ${mdbPath}`);
  }

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
    throw new Error(
      `Failed to read DIMEP.MDB (install access-parser): ${py.stderr || py.stdout}`,
    );
  }

  return JSON.parse(py.stdout) as DmprepFuncionarioRow[];
}

function buildProfileIndex(profiles: ProfileRow[]): Map<string, ProfileRow> {
  const index = new Map<string, ProfileRow>();
  for (const profile of profiles) {
    for (const key of pisLookupKeys(profile.employee_id)) {
      index.set(key, profile);
    }
  }
  return index;
}

export async function importEmployeesFromDmprep(
  config: SyncConfig,
  admin?: SupabaseClient,
): Promise<EmployeeImportResult> {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error('Supabase credentials are required for employee import');
  }
  if (!config.mdbPath) {
    throw new Error('DMPREP_MDB_PATH is not configured');
  }

  const supabase =
    admin ??
    createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  const employees = loadFuncionariosFromMdb(config.mdbPath);
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, employee_id, email, name')
    .eq('organization_id', config.ingest.organizationId);
  if (profileError) throw profileError;

  const index = buildProfileIndex((profiles ?? []) as ProfileRow[]);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of employees) {
    const employeeId = employeeIdFromPis(String(row.PIS ?? ''));
    const name = String(row.Nome ?? '').trim();
    const designation = String(row.Cargo ?? '').trim() || null;
    const joiningDate = parseDate(row.DtAdmissao);

    if (!employeeId || !name) {
      failed++;
      continue;
    }

    const existing = pisLookupKeys(employeeId)
      .map((key) => index.get(key))
      .find(Boolean);

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
        failed++;
      } else {
        updated++;
      }
      skipped++;
      continue;
    }

    const email = importEmailFromPis(employeeId);
    const { data: authData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: config.importTempPassword,
      email_confirm: true,
      user_metadata: { name, source: 'dmprep-import' },
    });

    if (createErr || !authData.user) {
      failed++;
      continue;
    }

    const userId = authData.user.id;
    const { error: upsertErr } = await supabase.from('profiles').upsert({
      id: userId,
      organization_id: config.ingest.organizationId,
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
      await supabase.auth.admin.deleteUser(userId);
      failed++;
      continue;
    }

    for (const key of pisLookupKeys(employeeId)) {
      index.set(key, { id: userId, employee_id: employeeId, email, name });
    }
    created++;
  }

  return { created, updated, skipped, failed, total: employees.length };
}
