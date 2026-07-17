import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CapturedRequest } from '../types.js';

export interface QuarantineStore {
  save(capture: CapturedRequest, body: Buffer): Promise<{ metadataPath: string; bodyPath: string }>;
}

export class FileQuarantineStore implements QuarantineStore {
  private lastCleanupAt = 0;
  private cleanupPromise: Promise<void> | null = null;

  constructor(
    private readonly rootDir: string,
    private readonly policy: { retentionDays: number; maxFiles: number } = {
      retentionDays: 30,
      maxFiles: 10_000,
    },
  ) {}

  async save(
    capture: CapturedRequest,
    body: Buffer,
  ): Promise<{ metadataPath: string; bodyPath: string }> {
    const day = capture.receivedAt.slice(0, 10);
    const dayDir = path.join(this.rootDir, day);
    await mkdir(dayDir, { recursive: true, mode: 0o700 });

    const safeId = capture.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const metadataPath = path.join(dayDir, `${safeId}.json`);
    const bodyPath = path.join(dayDir, `${safeId}.bin`);

    await atomicWrite(bodyPath, body);
    await atomicWrite(metadataPath, Buffer.from(`${JSON.stringify(capture, null, 2)}\n`, 'utf8'));
    this.scheduleCleanup();

    return { metadataPath, bodyPath };
  }

  async cleanup(now = Date.now()): Promise<void> {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const dayEntries = await readdir(this.rootDir, { withFileTypes: true });
    const metadata: Array<{ path: string; mtimeMs: number }> = [];

    for (const dayEntry of dayEntries) {
      if (!dayEntry.isDirectory()) continue;
      const dayDir = path.join(this.rootDir, dayEntry.name);
      const files = await readdir(dayDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json')) continue;
        const filePath = path.join(dayDir, file.name);
        try {
          const fileStat = await stat(filePath);
          metadata.push({ path: filePath, mtimeMs: fileStat.mtimeMs });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }

    metadata.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const cutoff = now - this.policy.retentionDays * 24 * 60 * 60 * 1_000;
    const expired = metadata.filter(
      (file, index) => file.mtimeMs < cutoff || index >= this.policy.maxFiles,
    );
    await Promise.all(
      expired.flatMap((file) => {
        const bodyPath = file.path.replace(/\.json$/, '.bin');
        return [
          rm(file.path, { force: true }),
          rm(bodyPath, { force: true }),
        ];
      }),
    );
    this.lastCleanupAt = now;
  }

  private scheduleCleanup(): void {
    if (Date.now() - this.lastCleanupAt < 60 * 60 * 1_000 || this.cleanupPromise) return;
    this.cleanupPromise = this.cleanup()
      .catch(() => undefined)
      .finally(() => {
        this.cleanupPromise = null;
      });
  }
}

async function atomicWrite(destination: string, data: Buffer): Promise<void> {
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, data, { mode: 0o600, flag: 'wx' });
  await rename(temporary, destination);
}
