import type { NormalizedPunch } from '../types.js';

export class ReplayGuard {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  accept(punches: NormalizedPunch[], now = Date.now()): boolean {
    this.prune(now);
    const keys = punches.map((punch) => `${punch.deviceId}\0${punch.nsr}`);
    if (new Set(keys).size !== keys.length) return false;
    if (keys.some((key) => (this.seen.get(key) ?? 0) > now)) return false;

    const expiresAt = now + this.ttlMs;
    for (const key of keys) this.seen.set(key, expiresAt);
    this.trim();
    return true;
  }

  private prune(now: number): void {
    for (const [key, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(key);
    }
  }

  private trim(): void {
    while (this.seen.size > this.maxEntries) {
      const oldest = this.seen.keys().next().value as string | undefined;
      if (!oldest) return;
      this.seen.delete(oldest);
    }
  }
}
