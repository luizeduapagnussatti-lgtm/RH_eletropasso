import { supabase, isSupabaseConfigured, getSupabaseSignedUrl } from './supabase';
import { apiClient } from './api.client';
import { Punch, PunchDirection, PunchIgnoreSource, PunchSource } from '../types';
import { convertToWebP } from '../utils/imageConvert';

/** Window for auto-ignoring accidental double CLOCK punches (keep first). */
export const PUNCH_PROXIMITY_DEDUP_MINUTES = 10;

const PWA_PUNCH_SELFIE_BUCKET = 'selfies';

/** Storage path from APP punch raw_payload (if present). */
export function appPunchSelfiePath(punch: Punch): string | null {
  const raw = punch.rawPayload?.selfiePath;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

const mapPunch = (r: any): Punch => ({
  id: r.id,
  organizationId: r.organization_id,
  employeeId: r.employee_id,
  punchedAt: r.punched_at,
  direction: r.direction,
  source: r.source,
  deviceId: r.device_id || undefined,
  nsr: r.nsr || undefined,
  rawPayload: r.raw_payload || undefined,
  timesheetDayId: r.timesheet_day_id || undefined,
  ignoredForCalc: !!r.ignored_for_calc,
  ignoreSource: (r.ignore_source as PunchIgnoreSource | null) || undefined,
  ignoredAt: r.ignored_at || undefined,
  ignoredBy: r.ignored_by || undefined,
});

export interface PunchDaySummary {
  employeeId: string;
  date: string;
  firstIn?: string;
  lastOut?: string;
  punches: Punch[];
}

/** Up to two IN/OUT pairs for mirror display (presentation only — not payroll calc). */
export interface PunchDaySlots {
  entry1?: string;
  exit1?: string;
  entry2?: string;
  exit2?: string;
  overflow: Punch[];
  allPunches: Punch[];
}

export interface ProximityAutoIgnorePlan {
  /** Punch ids that should be ignored with ignore_source=AUTO */
  toIgnore: string[];
  /** Punch ids currently AUTO-ignored that should be cleared */
  toClear: string[];
}

/** Calendar day in the browser's local timezone (YYYY-MM-DD). */
export function punchLocalDateKey(punchedAt: string): string {
  const d = new Date(punchedAt);
  if (Number.isNaN(d.getTime())) {
    return punchedAt.includes('T') ? punchedAt.slice(0, 10) : punchedAt.slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build timestamptz ISO from a work date + local HH:MM (store wall-clock). */
export function localWorkDateTimeToIso(workDate: string, timeHhMm: string): string {
  const dateParts = workDate.split('-').map(Number);
  const timeParts = timeHhMm.split(':').map(Number);
  const y = dateParts[0];
  const mo = dateParts[1];
  const d = dateParts[2];
  const hh = timeParts[0];
  const mm = timeParts[1];
  if (!y || !mo || !d || hh == null || mm == null) {
    throw new Error('Invalid work date or time');
  }
  return new Date(y, mo - 1, d, hh, mm, 0, 0).toISOString();
}

function punchDateKey(punchedAt: string): string {
  return punchLocalDateKey(punchedAt);
}

/** Punches that count for mirror slots and day calculation. */
export function punchesForApuration(punches: Punch[]): Punch[] {
  return punches.filter(p => !p.ignoredForCalc);
}

/**
 * Slots on the PDF / mirror grid: hide only punches the manager intentionally
 * ignored (ignore_source=MANUAL). AUTO proximity flags must not blank Entrada/Saída
 * when org-wide listPunches previously poisoned coworkers' CLOCK rows.
 */
export function punchesForDisplaySlots(punches: Punch[]): Punch[] {
  return punches.filter(p => !(p.ignoredForCalc && p.ignoreSource === 'MANUAL'));
}

function minutesBetweenIso(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

/**
 * Plan AUTO proximity ignores: keep first CLOCK/IMPORT in a &lt;window cluster
 * **per employee**. Never mix employees on the same calendar day (org-wide
 * listPunches used to collapse everyone into one timeline and wrongly ignore
 * valid punches within 10 minutes of a coworker).
 * Never mutate punches with ignore_source=MANUAL.
 */
export function planProximityAutoIgnores(
  punches: Punch[],
  date: string,
  windowMinutes: number = PUNCH_PROXIMITY_DEDUP_MINUTES,
): ProximityAutoIgnorePlan {
  const day = punches
    .filter(p => punchDateKey(p.punchedAt) === date)
    .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));

  const byEmployee = new Map<string, Punch[]>();
  for (const p of day) {
    const key = p.employeeId || '_';
    const list = byEmployee.get(key) ?? [];
    list.push(p);
    byEmployee.set(key, list);
  }

  const toIgnore: string[] = [];
  const toClear: string[] = [];

  for (const empPunches of byEmployee.values()) {
    const eligible = empPunches.filter(p => p.source === 'CLOCK' || p.source === 'IMPORT');
    const shouldIgnore = new Set<string>();
    let lastKept: Punch | null = null;

    for (const p of eligible) {
      if (p.ignoreSource === 'MANUAL') {
        if (!p.ignoredForCalc) lastKept = p;
        continue;
      }
      if (!lastKept) {
        lastKept = p;
        continue;
      }
      if (minutesBetweenIso(lastKept.punchedAt, p.punchedAt) <= windowMinutes) {
        shouldIgnore.add(p.id);
      } else {
        lastKept = p;
      }
    }

    for (const p of eligible) {
      if (p.ignoreSource === 'MANUAL') continue;
      const want = shouldIgnore.has(p.id);
      const currentlyAuto =
        !!p.ignoredForCalc && (p.ignoreSource === 'AUTO' || !p.ignoreSource);
      if (want && !currentlyAuto) toIgnore.push(p.id);
      if (!want && currentlyAuto) toClear.push(p.id);
    }
  }

  return { toIgnore, toClear };
}

/**
 * APP punches fill holes only: if any CLOCK/IMPORT exists within the proximity
 * window for the same employee/day, ignore the APP (CLOCK wins). Never touches
 * MANUAL ignore decisions. Late CLOCK ingest + recalc re-runs this plan.
 */
export function planAppVsClockIgnores(
  punches: Punch[],
  date: string,
  windowMinutes: number = PUNCH_PROXIMITY_DEDUP_MINUTES,
): ProximityAutoIgnorePlan {
  const day = punches
    .filter(p => punchDateKey(p.punchedAt) === date)
    .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));

  const byEmployee = new Map<string, Punch[]>();
  for (const p of day) {
    const key = p.employeeId || '_';
    const list = byEmployee.get(key) ?? [];
    list.push(p);
    byEmployee.set(key, list);
  }

  const toIgnore: string[] = [];
  const toClear: string[] = [];

  for (const empPunches of byEmployee.values()) {
    const clockish = empPunches.filter(p => p.source === 'CLOCK' || p.source === 'IMPORT');
    const apps = empPunches.filter(p => p.source === 'APP');

    for (const app of apps) {
      if (app.ignoreSource === 'MANUAL') continue;
      const superseded = clockish.some(
        c => minutesBetweenIso(c.punchedAt, app.punchedAt) <= windowMinutes,
      );
      const currentlyAuto =
        !!app.ignoredForCalc && (app.ignoreSource === 'AUTO' || !app.ignoreSource);
      if (superseded && !currentlyAuto) toIgnore.push(app.id);
      if (!superseded && currentlyAuto) toClear.push(app.id);
    }
  }

  return { toIgnore, toClear };
}

/** Chronological slots from displayable punches: Entrada1…Saída2; extras in overflow. */
export function pairPunchesToSlots(punches: Punch[], date: string): PunchDaySlots {
  const dayPunches = punchesForDisplaySlots(punches)
    .filter(p => punchDateKey(p.punchedAt) === date)
    .filter(p => p.direction !== 'BREAK_START' && p.direction !== 'BREAK_END')
    .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));

  const slotTimes: (string | undefined)[] = [undefined, undefined, undefined, undefined];
  const overflow: Punch[] = [];

  for (let i = 0; i < dayPunches.length; i++) {
    const p = dayPunches[i]!;
    if (i < 4) slotTimes[i] = p.punchedAt;
    else overflow.push(p);
  }

  return {
    entry1: slotTimes[0],
    exit1: slotTimes[1],
    entry2: slotTimes[2],
    exit2: slotTimes[3],
    overflow,
    allPunches: dayPunches,
  };
}

export function groupPunchesByDate(punches: Punch[]): Map<string, Punch[]> {
  const map = new Map<string, Punch[]>();
  for (const p of punches) {
    const date = punchDateKey(p.punchedAt);
    const list = map.get(date) ?? [];
    list.push(p);
    map.set(date, list);
  }
  for (const [date, list] of map) {
    map.set(date, [...list].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt)));
  }
  return map;
}

/** Pair punches for a calendar day (local date YYYY-MM-DD) — ignores ignored_for_calc. */
export function consolidatePunchesForDay(punches: Punch[], date: string): PunchDaySummary {
  const dayPunches = punchesForApuration(punches)
    .filter(p => punchDateKey(p.punchedAt) === date)
    .filter(p => p.direction !== 'BREAK_START' && p.direction !== 'BREAK_END')
    .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));

  // Prefer last punch of the last complete chronological pair (not an early midday OUT
  // when afternoon punches still exist).
  const pairCount = Math.floor(dayPunches.length / 2);
  const lastOut =
    pairCount > 0
      ? dayPunches[pairCount * 2 - 1]?.punchedAt
      : dayPunches.length > 1
        ? dayPunches[dayPunches.length - 1]?.punchedAt
        : undefined;

  return {
    employeeId: dayPunches[0]?.employeeId || '',
    date,
    firstIn: dayPunches[0]?.punchedAt,
    lastOut,
    punches: dayPunches,
  };
}

export const punchService = {
  async listPunches(opts: {
    employeeId?: string;
    startDate: string;
    endDate: string;
  }): Promise<Punch[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    // America/Sao_Paulo offset so evening punches near UTC midnight stay in-range.
    const buildQuery = () => {
      let q = supabase
        .from('punches')
        .select('*')
        .eq('organization_id', orgId)
        .gte('punched_at', `${opts.startDate}T00:00:00.000-03:00`)
        .lte('punched_at', `${opts.endDate}T23:59:59.999-03:00`)
        .order('punched_at', { ascending: true })
        .limit(5000);
      if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
      return q;
    };

    const { data, error } = await buildQuery();
    if (error) throw error;
    let mapped = (data ?? []).map(mapPunch);

    // Auto-mark near-duplicate CLOCK punches so the mirror slots update without a full period recalc.
    const dates = [...new Set(mapped.map(p => punchLocalDateKey(p.punchedAt)))];
    let changed = false;
    for (const date of dates) {
      const proximity = planProximityAutoIgnores(mapped, date);
      const appVsClock = planAppVsClockIgnores(mapped, date);
      const plan: ProximityAutoIgnorePlan = {
        toIgnore: [...new Set([...proximity.toIgnore, ...appVsClock.toIgnore])],
        toClear: [...new Set([...proximity.toClear, ...appVsClock.toClear])],
      };
      if (plan.toIgnore.length > 0 || plan.toClear.length > 0) {
        await punchService.applyProximityAutoIgnorePlan(plan);
        changed = true;
      }
    }
    if (changed) {
      const { data: again, error: err2 } = await buildQuery();
      if (err2) throw err2;
      mapped = (again ?? []).map(mapPunch);
    }
    return mapped;
  },

  /**
   * Manager override: ignore/include a punch for apuration only (CLOCK stays in audit).
   * Uses SECURITY DEFINER RPC — does not open generic CLOCK updates.
   */
  async setPunchIgnoredForCalc(id: string, ignored: boolean): Promise<Punch> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('set_punch_ignored_for_calc', {
      p_id: id,
      p_ignored: ignored,
    });
    if (error) throw error;
    apiClient.notify();
    return mapPunch(data);
  },

  /**
   * Apply AUTO proximity plan without touching MANUAL decisions.
   * Uses SECURITY DEFINER RPC for CLOCK rows.
   */
  async applyProximityAutoIgnorePlan(plan: ProximityAutoIgnorePlan): Promise<void> {
    if (!isSupabaseConfigured()) return;
    if (plan.toIgnore.length === 0 && plan.toClear.length === 0) return;

    const { error } = await supabase.rpc('apply_punch_proximity_auto_ignore', {
      p_ignore_ids: plan.toIgnore,
      p_clear_ids: plan.toClear,
    });
    if (error) throw error;
    apiClient.notify();
  },

  async createManualPunch(input: {
    employeeId: string;
    punchedAt: string;
    direction: PunchDirection;
    remarks?: string;
  }): Promise<Punch> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const { data: authData } = await supabase.auth.getUser();
    const actorId = authData.user?.id;

    const payload = {
      organization_id: orgId,
      employee_id: input.employeeId,
      punched_at: input.punchedAt,
      direction: input.direction,
      source: 'MANUAL' as PunchSource,
      raw_payload: {
        ...(input.remarks ? { remarks: input.remarks } : {}),
        ...(actorId ? { createdBy: actorId } : {}),
      },
    };

    const { data, error } = await supabase.from('punches').insert(payload).select().single();
    if (error) throw error;
    apiClient.notify();
    return mapPunch(data);
  },

  /**
   * Employee PWA punch — only when profiles.allow_pwa_punch.
   * Writes source=APP; never mutates CLOCK. Selfie + GPS required.
   */
  async createAppPunch(input: {
    selfieDataUrl: string;
    location: { lat: number; lng: number; accuracy?: number; address?: string };
    direction?: PunchDirection;
  }): Promise<Punch> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('Not authenticated');

    if (!input.selfieDataUrl) throw new Error('selfieRequired');
    if (
      input.location == null ||
      !Number.isFinite(input.location.lat) ||
      !Number.isFinite(input.location.lng)
    ) {
      throw new Error('locationRequired');
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, organization_id, employee_id, allow_pwa_punch, status')
      .eq('id', userId)
      .single();
    if (profileErr) throw profileErr;
    if (!profile?.allow_pwa_punch) throw new Error('pwaPunchDisabled');
    if (!profile.employee_id) throw new Error('pwaPunchNoEmployeeId');
    if (profile.status && profile.status !== 'ACTIVE') throw new Error('pwaPunchInactive');

    const punchKey = String(profile.employee_id);
    const today = punchLocalDateKey(new Date().toISOString());
    const existingToday = await punchService.listPunches({
      employeeId: punchKey,
      startDate: today,
      endDate: today,
    });
    const activeToday = punchesForApuration(existingToday).sort((a, b) =>
      a.punchedAt.localeCompare(b.punchedAt),
    );
    const last = activeToday[activeToday.length - 1];
    let direction: PunchDirection = input.direction || 'IN';
    if (!input.direction) {
      if (!last || last.direction === 'OUT' || last.direction === 'BREAK_END') {
        direction = 'IN';
      } else {
        direction = 'OUT';
      }
    }

    const selfieBlob = await convertToWebP(input.selfieDataUrl, 0.65, 720);
    const selfiePath = `${userId}/pwa-punches/${Date.now()}.webp`;
    const { error: upErr } = await supabase.storage
      .from(PWA_PUNCH_SELFIE_BUCKET)
      .upload(selfiePath, selfieBlob, { upsert: false, contentType: 'image/webp' });
    if (upErr) throw upErr;

    const punchedAt = new Date().toISOString();
    const payload = {
      organization_id: orgId,
      employee_id: punchKey,
      punched_at: punchedAt,
      direction,
      source: 'APP' as PunchSource,
      device_id: 'PWA',
      raw_payload: {
        lat: input.location.lat,
        lng: input.location.lng,
        accuracy: input.location.accuracy ?? null,
        address: input.location.address ?? null,
        selfiePath,
        createdBy: userId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
    };

    const { data, error } = await supabase.from('punches').insert(payload).select().single();
    if (error) throw error;
    apiClient.notify();
    return mapPunch(data);
  },

  async getAppPunchSelfieUrl(path?: string | null): Promise<string | null> {
    if (!path || !isSupabaseConfigured()) return null;
    return getSupabaseSignedUrl(PWA_PUNCH_SELFIE_BUCKET, path, 3600);
  },

  async updateManualPunch(
    id: string,
    input: { punchedAt?: string; direction?: PunchDirection; remarks?: string },
  ): Promise<Punch> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: existing, error: fetchErr } = await supabase
      .from('punches')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;
    if (!existing || existing.source !== 'MANUAL') {
      throw new Error('Only MANUAL punches can be edited');
    }

    const payload: Record<string, unknown> = {
      updated: new Date().toISOString(),
    };
    if (input.punchedAt !== undefined) payload.punched_at = input.punchedAt;
    if (input.direction !== undefined) payload.direction = input.direction;
    if (input.remarks !== undefined) {
      payload.raw_payload = input.remarks
        ? { ...(existing.raw_payload || {}), remarks: input.remarks }
        : existing.raw_payload;
    }

    const { data, error } = await supabase
      .from('punches')
      .update(payload)
      .eq('id', id)
      .eq('source', 'MANUAL')
      .select()
      .single();
    if (error) throw error;
    apiClient.notify();
    return mapPunch(data);
  },

  async deletePunch(id: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: existing, error: fetchErr } = await supabase
      .from('punches')
      .select('id, source')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;
    if (!existing || existing.source !== 'MANUAL') {
      throw new Error('Only MANUAL punches can be deleted');
    }

    const { error } = await supabase.from('punches').delete().eq('id', id).eq('source', 'MANUAL');
    if (error) throw error;
    apiClient.notify();
  },

  /**
   * Insert MANUAL BREAK_START/BREAK_END for a fixed shift window.
   * Refuses if the employee already has CLOCK break punches that day.
   * Replaces existing MANUAL break punches when replaceManual is true.
   */
  async applyFixedBreakPunches(input: {
    employeeId: string;
    workDate: string;
    breakStartHm: string;
    breakEndHm: string;
    existingPunches: Punch[];
    replaceManual?: boolean;
  }): Promise<Punch[]> {
    const dayPunches = input.existingPunches.filter(
      (p) => punchLocalDateKey(p.punchedAt) === input.workDate,
    );
    const clockBreaks = dayPunches.filter(
      (p) =>
        (p.direction === 'BREAK_START' || p.direction === 'BREAK_END') &&
        p.source === 'CLOCK',
    );
    if (clockBreaks.length > 0) {
      throw new Error('CLOCK_BREAK_EXISTS');
    }

    const manualBreaks = dayPunches.filter(
      (p) =>
        (p.direction === 'BREAK_START' || p.direction === 'BREAK_END') &&
        p.source === 'MANUAL',
    );
    if (manualBreaks.length > 0 && !input.replaceManual) {
      throw new Error('MANUAL_BREAK_EXISTS');
    }
    for (const p of manualBreaks) {
      await this.deletePunch(p.id);
    }

    const startIso = localWorkDateTimeToIso(input.workDate, input.breakStartHm);
    const endIso = localWorkDateTimeToIso(input.workDate, input.breakEndHm);
    if (new Date(endIso) <= new Date(startIso)) {
      throw new Error('Invalid fixed break window');
    }

    const created: Punch[] = [];
    created.push(
      await this.createManualPunch({
        employeeId: input.employeeId,
        punchedAt: startIso,
        direction: 'BREAK_START',
        remarks: 'Fixed break (shift)',
      }),
    );
    created.push(
      await this.createManualPunch({
        employeeId: input.employeeId,
        punchedAt: endIso,
        direction: 'BREAK_END',
        remarks: 'Fixed break (shift)',
      }),
    );
    return created;
  },
};
