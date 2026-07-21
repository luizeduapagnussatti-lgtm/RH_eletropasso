let locked = false;

export function isSyncLocked(): boolean {
  return locked;
}

export async function withSyncLock<T>(
  fn: () => Promise<T>,
): Promise<T | { busy: true }> {
  if (locked) return { busy: true };
  locked = true;
  try {
    return await fn();
  } finally {
    locked = false;
  }
}
