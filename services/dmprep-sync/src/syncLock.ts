let locked = false;

export function isSyncLocked(): boolean {
  return locked;
}

/** Acquire lock without running work. Caller must releaseSyncLock() when done. */
export function tryAcquireSyncLock(): boolean {
  if (locked) return false;
  locked = true;
  return true;
}

export function releaseSyncLock(): void {
  locked = false;
}

export async function withSyncLock<T>(
  fn: () => Promise<T>,
): Promise<T | { busy: true }> {
  if (!tryAcquireSyncLock()) return { busy: true };
  try {
    return await fn();
  } finally {
    releaseSyncLock();
  }
}
