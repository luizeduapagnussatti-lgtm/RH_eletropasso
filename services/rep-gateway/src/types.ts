export type SanitizedHeaders = Record<string, string | string[] | undefined>;

export type SecurityResult =
  | { status: 'not-attempted'; reason: string }
  | { status: 'valid'; algorithm: string }
  | { status: 'invalid'; reason: string };

export interface CapturedRequest {
  id: string;
  receivedAt: string;
  method: string;
  url: string;
  sourceIp: string;
  headers: SanitizedHeaders;
  contentType: string | null;
  bodyBytes: number;
  bodySha256: string;
  bodyBase64: string;
  bodyUtf8Preview: string | null;
  deviceSerial: string;
  security: SecurityResult;
}

export interface NormalizedPunch {
  employeeId: string;
  punchedAt: string;
  direction: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END' | 'UNKNOWN';
  deviceId: string;
  nsr: string;
  raw: Record<string, unknown>;
}

export interface IngestResult {
  success: boolean;
  inserted: number;
  upserted: number;
  affectedDates: string[];
}
