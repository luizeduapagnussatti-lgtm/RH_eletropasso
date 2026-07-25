/**
 * Export OpenHR profiles → DMPREP DIMEP.MDB Funcionario table.
 * Biometrics remain manual on the clock (DMPREP → Operações REP).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SyncConfig } from '../config.js';
import { employeeIdFromPis } from './credentials.js';

export interface ExportEmployeeRow {
  id: string;
  employee_id: string;
  name: string;
  designation: string | null;
  joining_date: string | null;
  clock_onboarding_status: string;
}

export interface EmployeeExportResult {
  exported: number;
  failed: number;
  skipped: number;
  total: number;
  errors: string[];
}

interface ProfileExportPayload {
  pis: string;
  credencial: string;
  nome: string;
  cargo: string;
  dtAdmissao: string | null;
}

function runMdbUpsert(mdbPath: string, rows: ProfileExportPayload[]): { ok: boolean; error?: string } {
  const tmpFile = join(tmpdir(), `dmprep-export-${Date.now()}.json`);
  writeFileSync(tmpFile, JSON.stringify(rows), 'utf8');

  const py = spawnSync(
    'python',
    [
      '-c',
      `
import json, sys, os
try:
    import pyodbc
except ImportError:
    print(json.dumps({"ok": False, "error": "pyodbc not installed — pip install pyodbc + Microsoft Access Driver"}))
    sys.exit(0)

mdb = sys.argv[1]
payload_path = sys.argv[2]
rows = json.load(open(payload_path, encoding='utf-8'))

conn_str = (
    r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};'
    r'DBQ=' + mdb + ';'
)
try:
    conn = pyodbc.connect(conn_str)
except Exception as e:
    print(json.dumps({"ok": False, "error": "MDB locked or driver missing: " + str(e)}))
    sys.exit(0)

cur = conn.cursor()
exported = 0
for row in rows:
    pis = row['pis']
    cred = row['credencial']
    nome = row['nome']
    cargo = row.get('cargo') or ''
    dt = row.get('dtAdmissao')
    # Try update by PIS
    cur.execute("SELECT COUNT(*) FROM Funcionario WHERE PIS = ?", (pis,))
    cnt = cur.fetchone()[0]
    if cnt > 0:
        cur.execute(
            "UPDATE Funcionario SET Nome = ?, Cargo = ?, Credencial = ? WHERE PIS = ?",
            (nome, cargo, cred, pis),
        )
    else:
        try:
            cur.execute(
                "INSERT INTO Funcionario (PIS, Credencial, Nome, Cargo, DtAdmissao) VALUES (?, ?, ?, ?, ?)",
                (pis, cred, nome, cargo, dt),
            )
        except Exception:
            cur.execute(
                "INSERT INTO Funcionario (PIS, Credencial, Nome, Cargo) VALUES (?, ?, ?, ?)",
                (pis, cred, nome, cargo),
            )
    exported += 1
conn.commit()
conn.close()
print(json.dumps({"ok": True, "exported": exported}))
`.trim(),
      mdbPath,
      tmpFile,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );

  try {
    unlinkSync(tmpFile);
  } catch {
    /* ignore */
  }

  if (py.status !== 0 && !py.stdout?.trim()) {
    return { ok: false, error: py.stderr || 'Python export failed' };
  }

  try {
    const result = JSON.parse(py.stdout.trim() || '{}');
    if (!result.ok) return { ok: false, error: result.error || 'Export failed' };
    return { ok: true };
  } catch {
    return { ok: false, error: py.stdout || py.stderr || 'Invalid export response' };
  }
}

export async function exportEmployeesToDmprep(
  config: SyncConfig,
  options?: { profileIds?: string[]; admin?: SupabaseClient },
): Promise<EmployeeExportResult> {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error('Supabase credentials required for employee export');
  }
  if (!config.mdbPath) {
    throw new Error('DMPREP_MDB_PATH is not configured');
  }
  if (!existsSync(config.mdbPath)) {
    throw new Error(`DIMEP.MDB not found: ${config.mdbPath}`);
  }

  const supabase =
    options?.admin ??
    createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  let query = supabase
    .from('profiles')
    .select('id, employee_id, name, designation, joining_date, clock_onboarding_status')
    .eq('organization_id', config.ingest.organizationId)
    .in('clock_onboarding_status', ['PENDING_EXPORT', 'ERROR']);

  if (options?.profileIds?.length) {
    query = supabase
      .from('profiles')
      .select('id, employee_id, name, designation, joining_date, clock_onboarding_status')
      .in('id', options.profileIds);
  }

  const { data: profiles, error } = await query;
  if (error) throw error;

  const rows = (profiles ?? []).filter(
    (p: ExportEmployeeRow) => p.employee_id && String(p.employee_id).replace(/\D/g, ''),
  ) as ExportEmployeeRow[];

  if (rows.length === 0) {
    return { exported: 0, failed: 0, skipped: 0, total: 0, errors: [] };
  }

  const payload: ProfileExportPayload[] = rows.map(p => {
    const pis = employeeIdFromPis(p.employee_id);
    return {
      pis,
      credencial: pis,
      nome: p.name || '',
      cargo: p.designation || '',
      dtAdmissao: p.joining_date || null,
    };
  });

  const mdbResult = runMdbUpsert(config.mdbPath, payload);
  const errors: string[] = [];
  let exported = 0;
  let failed = 0;

  if (!mdbResult.ok) {
    for (const p of rows) {
      await supabase
        .from('profiles')
        .update({
          clock_onboarding_status: 'ERROR',
          clock_onboarding_notes: mdbResult.error?.slice(0, 500) || 'Export failed',
          clock_onboarding_at: new Date().toISOString(),
        })
        .eq('id', p.id);
    }
    return {
      exported: 0,
      failed: rows.length,
      skipped: 0,
      total: rows.length,
      errors: [mdbResult.error || 'Unknown export error'],
    };
  }

  const now = new Date().toISOString();
  for (const p of rows) {
    const { error: upErr } = await supabase
      .from('profiles')
      .update({
        clock_onboarding_status: 'PENDING_BIO',
        clock_onboarding_at: now,
        clock_onboarding_notes: 'Exportado para DMPREP — cadastre biometria no relógio pelo PIS',
      })
      .eq('id', p.id);
    if (upErr) {
      failed++;
      errors.push(`${p.id}: ${upErr.message}`);
    } else {
      exported++;
    }
  }

  return {
    exported,
    failed,
    skipped: 0,
    total: rows.length,
    errors,
  };
}

function runMdbDischarge(mdbPath: string, pisList: string[]): { ok: boolean; error?: string } {
  const tmpFile = join(tmpdir(), `dmprep-discharge-${Date.now()}.json`);
  writeFileSync(tmpFile, JSON.stringify(pisList), 'utf8');

  const py = spawnSync(
    'python',
    [
      '-c',
      `
import json, sys
try:
    import pyodbc
except ImportError:
    print(json.dumps({"ok": False, "error": "pyodbc not installed"}))
    sys.exit(0)

mdb = sys.argv[1]
payload_path = sys.argv[2]
pis_list = json.load(open(payload_path, encoding='utf-8'))
conn_str = r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=' + mdb + ';'
try:
    conn = pyodbc.connect(conn_str)
except Exception as e:
    print(json.dumps({"ok": False, "error": "MDB locked or driver missing: " + str(e)}))
    sys.exit(0)
cur = conn.cursor()
for pis in pis_list:
    try:
        cur.execute("DELETE FROM Funcionario WHERE PIS = ?", (pis,))
    except Exception:
        try:
            cur.execute("UPDATE Funcionario SET Nome = Nome + ' (INATIVO)' WHERE PIS = ?", (pis,))
        except Exception:
            pass
conn.commit()
conn.close()
print(json.dumps({"ok": True}))
`.trim(),
      mdbPath,
      tmpFile,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );

  try {
    unlinkSync(tmpFile);
  } catch {
    /* ignore */
  }

  if (py.status !== 0 && !py.stdout?.trim()) {
    return { ok: false, error: py.stderr || 'Python discharge failed' };
  }

  try {
    const result = JSON.parse(py.stdout.trim() || '{}');
    if (!result.ok) return { ok: false, error: result.error || 'Discharge failed' };
    return { ok: true };
  } catch {
    return { ok: false, error: py.stdout || py.stderr || 'Invalid discharge response' };
  }
}

/** Remove or inactivate employee in DMPREP MDB before OpenHR account deletion. */
export async function exportEmployeeDischargeFromDmprep(
  config: SyncConfig,
  options?: { profileIds?: string[]; admin?: SupabaseClient },
): Promise<EmployeeExportResult> {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error('Supabase credentials required for employee discharge export');
  }
  if (!config.mdbPath || !existsSync(config.mdbPath)) {
    throw new Error('DIMEP.MDB not configured or not found');
  }

  const supabase =
    options?.admin ??
    createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  if (!options?.profileIds?.length) {
    return { exported: 0, failed: 0, skipped: 0, total: 0, errors: [] };
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, employee_id')
    .in('id', options.profileIds);

  if (error) throw error;

  const rows = (profiles ?? []).filter(
    (p: { employee_id?: string }) => p.employee_id && String(p.employee_id).replace(/\D/g, ''),
  );

  if (rows.length === 0) {
    return { exported: 0, failed: 0, skipped: 0, total: 0, errors: [] };
  }

  const pisList = rows.map((p: { employee_id: string }) => employeeIdFromPis(p.employee_id));
  const mdbResult = runMdbDischarge(config.mdbPath, pisList);

  if (!mdbResult.ok) {
    return {
      exported: 0,
      failed: rows.length,
      skipped: 0,
      total: rows.length,
      errors: [mdbResult.error || 'Discharge export failed'],
    };
  }

  return {
    exported: rows.length,
    failed: 0,
    skipped: 0,
    total: rows.length,
    errors: [],
  };
}
