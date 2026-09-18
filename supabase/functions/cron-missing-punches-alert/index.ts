// OpenHR — Weekly missing punches alert
// Schedule: 0 9 * * 1 (Monday 09:00 UTC ≈ 06:00 America/Sao_Paulo)
//
// For each active org, inspect the previous Mon–Sun week and notify
// clock-punching employees who missed expected work days (no punches).
// Skips: ADMIN, SUPER_ADMIN, MANAGEMENT, PJ, INACTIVE, holidays, approved leaves,
// days already marked ABSENT, and OFF roster days.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toLocalDateStr(date: Date, tz: string): string {
  try {
    return date.toLocaleString('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayNameUtcNoon(iso: string): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(`${iso}T12:00:00Z`).getDay()];
}

/** Previous calendar week Mon–Sun relative to org-local "today". */
function previousWeekRange(todayIso: string): { start: string; end: string; yearWeek: string } {
  const today = new Date(`${todayIso}T12:00:00Z`);
  const dow = today.getUTCDay(); // 0=Sun … 1=Mon
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() + mondayOffset);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
  const start = prevMonday.toISOString().slice(0, 10);
  const end = prevSunday.toISOString().slice(0, 10);
  const yw = `${start.slice(0, 4)}W${start.slice(5, 7)}${start.slice(8, 10)}`;
  return { start, end, yearWeek: yw };
}

function eachDateInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

function isTimesheetExempt(role?: string | null, employmentType?: string | null): boolean {
  if (String(employmentType || '').toUpperCase() === 'PJ') return true;
  const r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'MANAGEMENT';
}

function punchLocalDateKey(punchedAt: string, tz: string): string {
  try {
    return new Date(punchedAt).toLocaleString('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return punchedAt.slice(0, 10);
  }
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return jsonResponse(401, { success: false, message: 'Unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);
  const now = new Date();

  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name')
    .neq('subscription_status', 'SUSPENDED');

  let notified = 0;
  let skipped = 0;
  let orgsProcessed = 0;

  for (const org of orgs ?? []) {
    if (org.name === '__SYSTEM__' || org.name === 'Platform') continue;
    orgsProcessed++;

    const { data: cfgRow } = await admin
      .from('settings')
      .select('value')
      .eq('organization_id', org.id)
      .eq('key', 'app_config')
      .maybeSingle();

    let cfg: Record<string, unknown> = {};
    try {
      cfg = cfgRow?.value
        ? typeof cfgRow.value === 'string'
          ? JSON.parse(cfgRow.value)
          : (cfgRow.value as Record<string, unknown>)
        : {};
    } catch {
      continue;
    }

    const timezone = (cfg.timezone as string) || 'America/Sao_Paulo';
    const workingDays = (cfg.workingDays as string[]) || [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ];
    const todayIso = toLocalDateStr(now, timezone);
    const { start, end, yearWeek } = previousWeekRange(todayIso);
    const weekDates = eachDateInclusive(start, end);

    const { data: holRow } = await admin
      .from('settings')
      .select('value')
      .eq('organization_id', org.id)
      .eq('key', 'holidays')
      .maybeSingle();

    let holidays: Array<{ date: string }> = [];
    try {
      holidays = holRow?.value
        ? typeof holRow.value === 'string'
          ? JSON.parse(holRow.value)
          : (holRow.value as Array<{ date: string }>)
        : [];
    } catch {
      holidays = [];
    }
    const holidaySet = new Set((holidays || []).map(h => h.date));

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, employee_id, clock_credential, role, employment_type, status, name')
      .eq('organization_id', org.id)
      .eq('status', 'ACTIVE');

    const clockStaff = (profiles ?? []).filter(
      p => !isTimesheetExempt(p.role, p.employment_type) && p.employee_id,
    );
    if (clockStaff.length === 0) continue;

    const employeeKeys = new Set<string>();
    for (const p of clockStaff) {
      if (p.employee_id) employeeKeys.add(p.employee_id);
      if (p.clock_credential) employeeKeys.add(String(p.clock_credential));
      employeeKeys.add(p.id);
    }

    const { data: punches } = await admin
      .from('punches')
      .select('employee_id, punched_at, ignored_for_calc')
      .eq('organization_id', org.id)
      .gte('punched_at', `${start}T00:00:00.000-03:00`)
      .lte('punched_at', `${end}T23:59:59.999-03:00`)
      .limit(20000);

    const punchedDaysByKey = new Map<string, Set<string>>();
    for (const punch of punches ?? []) {
      if (punch.ignored_for_calc) continue;
      const day = punchLocalDateKey(punch.punched_at, timezone);
      const set = punchedDaysByKey.get(punch.employee_id) || new Set<string>();
      set.add(day);
      punchedDaysByKey.set(punch.employee_id, set);
    }

    const { data: leaves } = await admin
      .from('leaves')
      .select('employee_id, start_date, end_date, status')
      .eq('organization_id', org.id)
      .eq('status', 'APPROVED')
      .lte('start_date', end)
      .gte('end_date', start);

    const leaveDaysByEmp = new Map<string, Set<string>>();
    for (const leave of leaves ?? []) {
      const set = leaveDaysByEmp.get(leave.employee_id) || new Set<string>();
      for (const d of weekDates) {
        if (d >= leave.start_date && d <= leave.end_date) set.add(d);
      }
      leaveDaysByEmp.set(leave.employee_id, set);
    }

    const { data: absents } = await admin
      .from('attendance')
      .select('employee_id, date')
      .eq('organization_id', org.id)
      .eq('status', 'ABSENT')
      .gte('date', start)
      .lte('date', end);

    const absentDaysByEmp = new Map<string, Set<string>>();
    for (const a of absents ?? []) {
      const set = absentDaysByEmp.get(a.employee_id) || new Set<string>();
      set.add(a.date);
      absentDaysByEmp.set(a.employee_id, set);
    }

    const { data: offRoster } = await admin
      .from('work_roster_assignments')
      .select('employee_id, work_date, status')
      .eq('organization_id', org.id)
      .eq('status', 'OFF')
      .gte('work_date', start)
      .lte('work_date', end);

    const offDaysByEmp = new Map<string, Set<string>>();
    for (const r of offRoster ?? []) {
      const set = offDaysByEmp.get(r.employee_id) || new Set<string>();
      set.add(r.work_date);
      offDaysByEmp.set(r.employee_id, set);
    }

    for (const profile of clockStaff) {
      const keys = [profile.employee_id, profile.clock_credential, profile.id]
        .filter(Boolean)
        .map(String);

      const punched = new Set<string>();
      for (const k of keys) {
        const s = punchedDaysByKey.get(k);
        if (s) for (const d of s) punched.add(d);
      }

      const onLeave = new Set<string>();
      for (const k of keys) {
        const s = leaveDaysByEmp.get(k);
        if (s) for (const d of s) onLeave.add(d);
      }

      const absent = new Set<string>();
      for (const k of keys) {
        const s = absentDaysByEmp.get(k);
        if (s) for (const d of s) absent.add(d);
      }

      const off = new Set<string>();
      for (const k of keys) {
        const s = offDaysByEmp.get(k);
        if (s) for (const d of s) off.add(d);
      }

      const missing: string[] = [];
      for (const d of weekDates) {
        const wd = weekdayNameUtcNoon(d);
        if (!workingDays.includes(wd)) continue;
        if (holidaySet.has(d)) continue;
        if (onLeave.has(d)) continue;
        if (absent.has(d)) continue;
        if (off.has(d)) continue;
        if (punched.has(d)) continue;
        missing.push(d);
      }

      if (missing.length === 0) {
        skipped++;
        continue;
      }

      const referenceId = `missing_punches_alert_${yearWeek}_${profile.employee_id}`;
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('organization_id', org.id)
        .eq('reference_id', referenceId)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }

      const title = 'Dias sem batida de ponto';
      const message =
        missing.length === 1
          ? `Você não registrou ponto em ${missing[0]} (semana ${start} a ${end}). Toque para solicitar ajuste.`
          : `Você tem ${missing.length} dias sem batida na semana ${start} a ${end}. Toque para justificar.`;

      const { error } = await admin.from('notifications').insert({
        user_id: profile.id,
        organization_id: org.id,
        type: 'ATTENDANCE',
        title,
        message,
        is_read: false,
        priority: 'HIGH',
        action_url: 'punch-corrections',
        reference_id: referenceId,
        reference_type: 'MISSING_PUNCHES_ALERT',
        metadata: {
          missingDates: missing,
          weekStart: start,
          weekEnd: end,
          yearWeek,
        },
      });

      if (error) {
        console.error('[cron-missing-punches-alert] insert failed', profile.id, error.message);
        continue;
      }
      notified++;
    }
  }

  return jsonResponse(200, {
    success: true,
    orgsProcessed,
    notified,
    skipped,
  });
});
