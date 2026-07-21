import type { SyncConfig } from '../config.js';
import type { MovimentRecord } from '../moviment.js';

export interface IngestPunch {
  employeeId: string;
  punchedAt: string;
  direction: 'UNKNOWN';
  source: 'CLOCK';
  deviceId: string;
  nsr: string;
  raw: Record<string, unknown>;
}

export interface IngestResult {
  success: boolean;
  inserted: number;
  duplicates: number;
  affectedDates: string[];
}

export function toIngestPunch(record: MovimentRecord, deviceSerial: string): IngestPunch {
  return {
    employeeId: record.credential,
    punchedAt: record.punchedAt,
    direction: 'UNKNOWN',
    source: 'CLOCK',
    deviceId: deviceSerial,
    nsr: record.nsr,
    raw: {
      protocol: 'dmprep-moviment-v1',
      movimentLine: record.line,
      prefix: record.prefix,
    },
  };
}

export async function forwardPunches(
  punches: IngestPunch[],
  config: SyncConfig['ingest'],
  deviceSerial: string,
): Promise<IngestResult> {
  if (punches.length === 0) {
    return { success: true, inserted: 0, duplicates: 0, affectedDates: [] };
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ingest-key': config.apiKey,
    },
    body: JSON.stringify({
      organizationId: config.organizationId,
      deviceSerial,
      punches,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`ingest-punches returned ${response.status}: ${responseText.slice(0, 500)}`);
  }

  const body = JSON.parse(responseText) as IngestResult & { upserted?: number };
  return {
    success: body.success,
    inserted: body.inserted ?? 0,
    duplicates: body.duplicates ?? body.upserted ?? 0,
    affectedDates: body.affectedDates ?? [],
  };
}
