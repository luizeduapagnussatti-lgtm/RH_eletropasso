/**
 * Gera PDF do espelho de ponto de um colaborador e valida totais vs DB.
 * Uso: npx vite-node scripts/export-magdiel-mirror-pdf.mjs [year] [month] [nameSubstring]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { pairPunchesToSlots, groupPunchesByDate } from '../src/services/punch.service.ts';
import { displayAbsenceMinutes } from '../src/utils/timesheetDisplay.ts';

const env = loadEnv('development', process.cwd(), '');
const year = Number(process.argv[2] || 2026);
const month = Number(process.argv[3] || 7);
const nameSub = String(process.argv[4] || 'Magdiel');

const SUPABASE_URL = env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = ANON_KEY;

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);
const authSb = createClient(SUPABASE_URL, ANON_KEY);

const { data: login, error: loginErr } = await authSb.auth.signInWithPassword({
  email: 'eletropasso@eletropasso.loja',
  password: 'Eletropasso_320*',
});
if (loginErr) {
  console.error('Login failed:', loginErr.message);
  process.exit(1);
}

const { supabase } = await import('../src/services/supabase.ts');
await supabase.auth.setSession({
  access_token: login.session.access_token,
  refresh_token: login.session.refresh_token,
});

const { apiClient } = await import('../src/services/api.client.ts');
const { timesheetService } = await import('../src/services/timesheet.service.ts');
const { employeeService } = await import('../src/services/employee.service.ts');
const { punchService } = await import('../src/services/punch.service.ts');
const { timesheetPdfExportService } = await import('../src/services/timesheetPdfExport.service.ts');

const profile = await adminSb.from('profiles').select('organization_id').eq('id', login.user.id).single();
const orgId = profile.data?.organization_id;
if (!orgId) {
  console.error('No organization_id');
  process.exit(1);
}
apiClient.setOrganizationId(orgId);

const employees = (await employeeService.getEmployees()).filter(
  (e) => e.role !== 'SUPER_ADMIN' && String(e.name || '').toLowerCase().includes(nameSub.toLowerCase()),
);
if (!employees.length) {
  console.error(`Employee not found: ${nameSub}`);
  process.exit(1);
}
const employee = employees[0];
const punchKey = employee.employeeId || employee.id;
console.log('employee', employee.name, punchKey);

const period = await timesheetService.getOrCreatePeriod(year, month);
console.log('period', period.year, period.month, period.status, period.startDate, period.endDate);

const days = await timesheetService.listDays(period.id, punchKey);
const punches = await punchService.listPunches({
  employeeId: punchKey,
  startDate: period.startDate,
  endDate: period.endDate,
});
const reviews = await timesheetService.listEmployeeReviews(period.id);

const acked = days.filter((d) => d.managerAck).length;
console.log(`days=${days.length} managerAck=${acked}/${days.length} punches=${punches.length}`);

const totals = {
  worked: days.reduce((s, d) => s + d.workedMinutes, 0),
  overtime: days.reduce((s, d) => s + d.overtimeMinutes, 0),
  late: days.reduce((s, d) => s + d.lateMinutes, 0),
  absence: days.reduce((s, d) => s + displayAbsenceMinutes(d), 0),
};
console.log('totals', totals);

const punchesByDate = groupPunchesByDate(punches);
const sampleDates = ['2026-06-29', '2026-07-08', '2026-07-10'];
for (const d of sampleDates) {
  const day = days.find((x) => x.workDate === d);
  if (!day) continue;
  const slots = pairPunchesToSlots(punchesByDate.get(d) ?? [], d);
  console.log('sample', d, {
    status: day.status,
    worked: day.workedMinutes,
    absence: displayAbsenceMinutes(day),
    slots: [slots.entry1, slots.exit1, slots.entry2, slots.exit2].map((iso) =>
      iso ? iso.slice(11, 16) : '—',
    ),
    managerAck: day.managerAck,
  });
}

const labels = {
  title: 'Espelho de ponto — PTRP',
  periodRange: 'Competência',
  employeeSection: 'Dados do colaborador',
  name: 'Nome',
  employeeId: 'Matrícula (PIS)',
  cpf: 'CPF',
  department: 'Departamento',
  designation: 'Cargo',
  reviewStatus: 'Aprovação do gestor',
  reviewApproved: 'Aprovado',
  reviewPending: 'Pendente',
  reviewPartial: 'Parcial ({{done}}/{{total}})',
  managerAckSummary: 'Dias com OK do gestor',
  metricsSection: 'Totais da competência',
  periodStatus: 'Status da competência',
  colDay: 'Data',
  colEntry1: 'Entrada 1',
  colExit1: 'Saída 1',
  colEntry2: 'Entrada 2',
  colExit2: 'Saída 2',
  colWorked: 'Trabalhado',
  colOvertime: 'HE',
  colLate: 'Atraso',
  colAbsence: 'Falta',
  colStatus: 'Situação',
  colEmployee: 'Colaborador',
  metricWorked: 'Total trabalhado',
  metricOvertime: 'Total HE',
  metricLate: 'Total atraso',
  metricAbsence: 'Total falta',
  summarySection: 'Resumo',
  generatedBy: 'Gerado em {{date}} — {{app}}',
  page: 'Página {{current}} de {{total}}',
  notAvailable: '—',
  notesSection: 'Observações e batidas extras',
  extraPunchesLine: '{{date}} — batidas extras: {{times}}',
  remarksLine: '{{date}} — {{text}}',
  signatureEmployee: 'Colaborador',
  signatureManager: 'Gestor / RH',
  totalsRow: 'Totais',
};

const dayStatusLabel = (s) =>
  ({
    OK: 'Normal',
    LATE: 'Atraso',
    ABSENT: 'Ausente',
    INCOMPLETE: 'Incompleto',
    LEAVE: 'Licença',
    HOLIDAY: 'Feriado',
    ADJUSTED: 'Ajustado',
  })[s] || s;

const periodStatusLabel = (s) =>
  ({
    OPEN: 'Aberto',
    IN_REVIEW: 'Em revisão',
    APPROVED: 'Aprovado',
    LOCKED: 'Bloqueado',
  })[s] || s;

const { blob, filename } = await timesheetPdfExportService.exportMirrorPdf({
  period,
  employeeFilter: employee.id,
  employees: [employee],
  days,
  punches,
  reviews,
  labels,
  dayStatusLabel,
  reviewStatusLabel: (code) =>
    ({
      OPEN: 'Aberto',
      IN_REVIEW: 'Em revisão',
      EMPLOYEE_SIGNED: 'Assinado pelo colaborador',
      APPROVED: 'Aprovado',
    })[code] || 'Pendente',
  periodStatusLabel,
});

console.log('department', employee.department, 'designation', employee.designation);
const review = reviews.find((r) => r.employeeId === punchKey || r.profileId === employee.id);
console.log('review', review?.status, 'managerAck', acked);

const outDir = path.join(process.cwd(), 'tmp');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, filename);
const buf = Buffer.from(await blob.arrayBuffer());
fs.writeFileSync(outPath, buf);
console.log('wrote', outPath, `(${buf.length} bytes)`);

if (buf.slice(0, 4).toString() !== '%PDF') {
  console.error('ERROR: output is not a PDF');
  process.exit(1);
}
console.log('PDF header OK');
