import { z } from 'zod';
import type { GatewayConfig } from '../config.js';
import type { CapturedRequest, NormalizedPunch } from '../types.js';

const genericPunchSchema = z
  .object({
    employeeId: z.union([z.string(), z.number()]).transform(String),
    punchedAt: z.string().datetime({ offset: true }),
    direction: z
      .enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END', 'UNKNOWN'])
      .default('UNKNOWN'),
    nsr: z.union([z.string(), z.number()]).transform(String).optional(),
    serial: z.string().optional(),
  })
  .strict();

/**
 * Normalizes only explicitly selected, documented profiles.
 *
 * Discovery captures are never interpreted as punches. Once a real packet is
 * captured, add a PrintPoint-specific profile using the exact vendor fields,
 * encoding and timezone rules observed on the wire.
 */
export function normalizeCapture(
  capture: CapturedRequest,
  body: Buffer,
  config: GatewayConfig,
): NormalizedPunch[] {
  if (config.protocolProfile === 'discovery') return [];
  if (capture.security.status !== 'valid') return [];

  const parsedJson = JSON.parse(body.toString('utf8')) as unknown;
  const list = Array.isArray(parsedJson) ? parsedJson : [parsedJson];

  return list.map((item) => {
    const parsed = genericPunchSchema.parse(item);
    if (parsed.serial && parsed.serial !== config.deviceSerial) {
      throw new Error('Payload serial does not match configured REP serial');
    }
    return {
      employeeId: parsed.employeeId,
      punchedAt: parsed.punchedAt,
      direction: parsed.direction,
      deviceId: config.deviceSerial,
      nsr: parsed.nsr ?? `sha256:${capture.bodySha256}`,
      raw: {
        protocol: 'generic-json-v1',
        captureId: capture.id,
        bodySha256: capture.bodySha256,
      },
    };
  });
}
