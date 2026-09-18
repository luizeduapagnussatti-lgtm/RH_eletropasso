/**
 * Module-level punch-collect session — survives Comunicação unmount so the user
 * can navigate while WatchComm finishes. Polls GET /status for busy + lastPunchCycle.
 */
import type {
  DmprepPunchCycleStatus,
  DmprepSyncResponse,
  DmprepSyncScope,
  DmprepSyncStatusResponse,
} from './dmprepSync.service';

export type ClockCollectPhase = 'idle' | 'starting' | 'running' | 'success' | 'error';

export type ClockCollectState = {
  phase: ClockCollectPhase;
  scope: Extract<DmprepSyncScope, 'punches' | 'all'> | null;
  startedAt: string | null;
  /** Human summary for success toast / panel */
  summary: string | null;
  errorMessage: string | null;
  lastCycle: DmprepPunchCycleStatus | null;
};

type Listener = (state: ClockCollectState) => void;

const SESSION_TIMEOUT_MS = 6 * 60 * 1000;
const POLL_MS = 4_000;

let state: ClockCollectState = {
  phase: 'idle',
  scope: null,
  startedAt: null,
  summary: null,
  errorMessage: null,
  lastCycle: null,
};

const listeners = new Set<Listener>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let getStatusFn: (() => Promise<DmprepSyncStatusResponse>) | null = null;
let formatSuccessFn: ((cycle: DmprepPunchCycleStatus) => string) | null = null;
let formatFailureFn: ((message: string) => string) | null = null;

function emit() {
  const snapshot = { ...state };
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function setState(patch: Partial<ClockCollectState>) {
  state = { ...state, ...patch };
  emit();
}

function clearTimers() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (timeoutTimer != null) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}

function finishSuccess(cycle: DmprepPunchCycleStatus, summary: string) {
  clearTimers();
  setState({
    phase: 'success',
    summary,
    errorMessage: null,
    lastCycle: cycle,
  });
}

function finishError(message: string, cycle?: DmprepPunchCycleStatus | null) {
  clearTimers();
  setState({
    phase: 'error',
    summary: null,
    errorMessage: message,
    lastCycle: cycle ?? state.lastCycle,
  });
}

async function pollOnce() {
  if (!getStatusFn || state.phase !== 'running' || !state.startedAt) return;
  try {
    const status = await getStatusFn();
    const cycle = status.lastPunchCycle ?? null;
    const startedMs = Date.parse(state.startedAt);
    const finishedMs = cycle?.finishedAt ? Date.parse(cycle.finishedAt) : NaN;
    const finishedAfterStart =
      Number.isFinite(startedMs) &&
      Number.isFinite(finishedMs) &&
      finishedMs + 500 >= startedMs; // small clock skew tolerance

    if (status.busy) {
      return;
    }

    // Lock released — look for a cycle completed after we started.
    if (finishedAfterStart && cycle) {
      if (cycle.error || cycle.success === false) {
        const raw = cycle.error || 'collect_failed';
        finishError(formatFailureFn ? formatFailureFn(raw) : raw, cycle);
        return;
      }
      const summary = formatSuccessFn
        ? formatSuccessFn(cycle)
        : `inserted=${cycle.inserted ?? 0}`;
      finishSuccess(cycle, summary);
      return;
    }

    // Not busy but no finished cycle yet — keep polling until session timeout.
  } catch {
    // Transient status errors while collect runs: keep polling.
  }
}

function startPolling() {
  clearTimers();
  pollTimer = setInterval(() => void pollOnce(), POLL_MS);
  timeoutTimer = setTimeout(() => {
    if (state.phase === 'running') {
      finishError(
        formatFailureFn
          ? formatFailureFn('collect_timeout')
          : 'collect_timeout',
      );
    }
  }, SESSION_TIMEOUT_MS);
  void pollOnce();
}

export function getClockCollectState(): ClockCollectState {
  return state;
}

export function subscribeClockCollect(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function isClockCollectActive(phase: ClockCollectPhase = state.phase): boolean {
  return phase === 'starting' || phase === 'running';
}

export function configureClockCollectFormatters(opts: {
  formatSuccess: (cycle: DmprepPunchCycleStatus) => string;
  formatFailure: (message: string) => string;
}) {
  formatSuccessFn = opts.formatSuccess;
  formatFailureFn = opts.formatFailure;
}

/**
 * Kick off async punch collect. `trigger` should return accepted/202 or legacy sync body.
 * Polling uses `getStatus` until busy clears and lastPunchCycle is newer than startedAt.
 */
export async function startClockCollect(opts: {
  scope: Extract<DmprepSyncScope, 'punches' | 'all'>;
  trigger: () => Promise<DmprepSyncResponse & { accepted?: boolean; startedAt?: string }>;
  getStatus: () => Promise<DmprepSyncStatusResponse>;
}): Promise<'started' | 'busy' | 'error'> {
  if (isClockCollectActive()) {
    return 'busy';
  }

  getStatusFn = opts.getStatus;
  setState({
    phase: 'starting',
    scope: opts.scope,
    startedAt: new Date().toISOString(),
    summary: null,
    errorMessage: null,
    lastCycle: null,
  });

  try {
    const before = await opts.getStatus().catch(() => null);
    if (before?.busy) {
      setState({ phase: 'idle', scope: null, startedAt: null });
      return 'busy';
    }

    const result = await opts.trigger();
    // 202 Accepted includes busy:true (work started). Only treat as conflict when
    // the server refused without accepting (e.g. HTTP 409 body).
    if (result.busy && !result.accepted) {
      setState({ phase: 'idle', scope: null, startedAt: null });
      return 'busy';
    }

    // Prefer server startedAt; keep client time if missing so finishedAt comparison still works.
    const startedAt = result.startedAt || state.startedAt || new Date().toISOString();
    setState({
      phase: 'running',
      startedAt,
      scope: opts.scope,
    });
    startPolling();
    return 'started';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // If the HTTP call failed but the service already accepted / is busy, poll instead of failing.
    try {
      const status = await opts.getStatus();
      if (status.busy) {
        setState({
          phase: 'running',
          startedAt: state.startedAt || new Date().toISOString(),
          scope: opts.scope,
          errorMessage: null,
        });
        startPolling();
        return 'started';
      }
    } catch {
      /* fall through */
    }
    finishError(formatFailureFn ? formatFailureFn(message) : message);
    return 'error';
  }
}

/** Reset success/error back to idle (keeps history on server). */
export function acknowledgeClockCollectResult() {
  if (state.phase === 'success' || state.phase === 'error') {
    setState({
      phase: 'idle',
      scope: null,
      startedAt: null,
      summary: null,
      errorMessage: null,
    });
  }
}
