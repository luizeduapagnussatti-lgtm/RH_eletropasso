import type { GatewayConfig } from '../config.js';
import type { IngestResult, NormalizedPunch } from '../types.js';

export async function forwardPunches(
  punches: NormalizedPunch[],
  config: GatewayConfig['forward'],
): Promise<IngestResult> {
  if (!config.enabled || !config.url || !config.apiKey || !config.organizationId) {
    throw new Error('Punch forwarding is not fully configured');
  }
  if (punches.length === 0) {
    return { success: true, inserted: 0, upserted: 0, affectedDates: [] };
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ingest-key': config.apiKey,
    },
    body: JSON.stringify({
      organizationId: config.organizationId,
      deviceSerial: punches[0]?.deviceId,
      punches,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`ingest-punches returned ${response.status}: ${responseText.slice(0, 300)}`);
  }

  return JSON.parse(responseText) as IngestResult;
}
