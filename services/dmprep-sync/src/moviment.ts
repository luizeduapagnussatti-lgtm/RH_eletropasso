/** Fixed-width MOVIMENT.txt line emitted by DMP REP after collecting punches. */
export interface MovimentRecord {
  line: string;
  prefix: string;
  credential: string;
  punchedAt: string;
  nsr: string;
}

const LINE_LENGTH = 28;
const MOVIMENT_LINE = /^(\d{4})(\d{12})(\d{8})(\d{4})$/;

export function parseMovimentLine(line: string, deviceSerial: string): MovimentRecord | null {
  const trimmed = line.trim();
  if (trimmed.length !== LINE_LENGTH) return null;

  const match = MOVIMENT_LINE.exec(trimmed);
  if (!match) return null;

  const prefix = match[1]!;
  const credential = match[2]!;
  const ddmmyyyy = match[3]!;
  const hhmm = match[4]!;
  const day = ddmmyyyy.slice(0, 2);
  const month = ddmmyyyy.slice(2, 4);
  const year = ddmmyyyy.slice(4, 8);
  const hour = hhmm.slice(0, 2);
  const minute = hhmm.slice(2, 4);

  const punchedAt = `${year}-${month}-${day}T${hour}:${minute}:00-03:00`;
  if (!Number.isFinite(Date.parse(punchedAt))) return null;

  return {
    line: trimmed,
    prefix,
    credential,
    punchedAt,
    nsr: `${deviceSerial}:${credential}:${ddmmyyyy}${hhmm}`,
  };
}

export function parseMovimentFile(
  content: string,
  deviceSerial: string,
  skipRecords = 0,
): { records: MovimentRecord[]; totalRecords: number } {
  const allRecords: MovimentRecord[] = [];
  for (const line of content.split(/\r?\n/)) {
    const record = parseMovimentLine(line, deviceSerial);
    if (record) allRecords.push(record);
  }

  return {
    records: allRecords.slice(skipRecords),
    totalRecords: allRecords.length,
  };
}
