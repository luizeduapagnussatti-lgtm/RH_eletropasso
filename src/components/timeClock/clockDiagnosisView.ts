/**
 * Helpers to present WatchComm diagnosis payloads in HR-friendly labels.
 */

export type HealthTone = 'ok' | 'warn' | 'error' | 'idle';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** Depth-first search for the first non-empty scalar matching any of the keys (case-insensitive). */
export function findScalar(
  root: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  if (root == null || depth > 6) return undefined;
  if (typeof root === 'string' || typeof root === 'number' || typeof root === 'boolean') {
    return String(root);
  }
  const obj = asRecord(root);
  if (!obj) return undefined;

  const want = new Set(keys.map((k) => k.toLowerCase()));
  for (const [k, v] of Object.entries(obj)) {
    if (!want.has(k.toLowerCase())) continue;
    if (v == null || v === '') continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      return String(v);
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const nested = findScalar(v, keys, depth + 1);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function findBool(root: unknown, keys: string[]): boolean | undefined {
  const raw = findScalar(root, keys);
  if (raw == null) return undefined;
  const n = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'sim', 'on'].includes(n)) return true;
  if (['false', '0', 'no', 'nao', 'não', 'off'].includes(n)) return false;
  return undefined;
}

export function readError(data: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

export interface DiagnosisSummaryRow {
  id: string;
  tone: HealthTone;
  titleKey: string;
  detailKey?: string;
  detailParams?: Record<string, string>;
}

export function summarizeIdentity(data: Record<string, unknown> | undefined): {
  serial?: string;
  firmware?: string;
  mac?: string;
  memory?: string;
  message?: string;
  error?: string;
  tone: HealthTone;
} {
  if (!data) return { tone: 'idle' };
  const error =
    readError(data, [
      'serialNumberError',
      'serialAndMemoryError',
      'firmwareVersionError',
      'macError',
      'error',
    ]) || undefined;
  const serial =
    findScalar(data, ['serialNumber', 'SerialNumber', 'serial', 'Serial']) ||
    findScalar(data.serialAndMemory, ['SerialNumber', 'serialNumber', 'Serial']);
  const firmware = findScalar(data, [
    'firmwareVersion',
    'FirmwareVersion',
    'firmware',
    'Firmware',
  ]);
  const mac = findScalar(data, ['mac', 'MAC', 'Mac', 'MacAddress']);
  const serialMem = data.serialAndMemory ?? data;
  const memory = findScalar(serialMem, [
    'SerialNumberPlot',
    'Memory',
    'memory',
    'MemorySize',
  ]);
  const message = findScalar(serialMem, [
    'LongMessage',
    'Message',
    'StatusMessage',
  ]);
  if (error && !serial) return { error, tone: 'error' };
  if (serial) return { serial, firmware, mac, memory, message, error, tone: error ? 'warn' : 'ok' };
  return { firmware, mac, memory, message, error, tone: error ? 'error' : 'warn' };
}

export function summarizeEmployer(data: Record<string, unknown> | undefined): {
  type?: string;
  document?: string;
  name?: string;
  address?: string;
  cei?: string;
  error?: string;
  tone: HealthTone;
} {
  if (!data) return { tone: 'idle' };
  if (data.supported === false) {
    return {
      error: typeof data.error === 'string' ? data.error : undefined,
      tone: 'error',
    };
  }
  const error = readError(data, ['employerError', 'error']);
  const type = findScalar(data, ['EmployerType', 'employerType', 'Type', 'type']);
  const document = findScalar(data, [
    'CNPJ',
    'Cnpj',
    'cnpj',
    'CPF',
    'Cpf',
    'cpf',
    'Document',
    'document',
    'Id',
    'idNumber',
  ]);
  const name = findScalar(data, [
    'Name',
    'name',
    'EmployerName',
    'employerName',
    'RazaoSocial',
    'CompanyName',
  ]);
  const address = findScalar(data, ['Address', 'address', 'Endereco', 'endereco']);
  const cei = findScalar(data, ['CEI', 'Cei', 'cei', 'CAEPF', 'Caepf']);
  if (error && !name && !document) return { error, tone: 'error' };
  if (name || document) return { type, document, name, address, cei, error, tone: error ? 'warn' : 'ok' };
  return { type, document, name, address, cei, error, tone: error ? 'error' : 'warn' };
}

export function summarizeStatus(data: Record<string, unknown> | undefined): {
  deviceId?: string;
  authentication?: string;
  employeeCapacity?: string;
  cardEnabled?: boolean;
  keyboardEnabled?: boolean;
  biometricHint?: string;
  printPointError?: string;
  immediateError?: string;
  tone: HealthTone;
  flags: Array<{ key: string; ok: boolean | undefined; labelKey: string }>;
} {
  if (!data) {
    return { tone: 'idle', flags: [] };
  }
  const printPointError = readError(data, ['printPointStatusError']);
  const immediateError = readError(data, ['immediateStatusError']);
  const root = data.printPointStatus ?? data.immediateStatus ?? data;

  const deviceId = findScalar(root, ['DeviceID', 'DeviceId', 'deviceId', 'Id']);
  const authentication = findScalar(root, ['Authentication', 'authentication', 'AuthMode']);
  const employeeCapacity = findScalar(root, [
    'EmployeeCapacity',
    'employeeCapacity',
    'Capacity',
    'MaxEmployees',
  ]);
  const cardEnabled = findBool(root, ['Card_Enabled', 'CardEnabled', 'cardEnabled']);
  const keyboardEnabled = findBool(root, ['Keyboard_Enabled', 'KeyboardEnabled', 'keyboardEnabled']);
  const biometricHint = findScalar(root, [
    'Biometric',
    'Fingerprint',
    'UseBiometric',
    'BiometricEnabled',
  ]);

  const flags = [
    { key: 'card', ok: cardEnabled, labelKey: 'diagnosis.flagCard' },
    { key: 'keyboard', ok: keyboardEnabled, labelKey: 'diagnosis.flagKeyboard' },
  ];

  let tone: HealthTone = 'ok';
  if (printPointError && immediateError) tone = 'error';
  else if (printPointError || immediateError) tone = 'warn';
  else if (!deviceId && !employeeCapacity && cardEnabled == null) tone = 'warn';

  return {
    deviceId,
    authentication,
    employeeCapacity,
    cardEnabled,
    keyboardEnabled,
    biometricHint,
    printPointError,
    immediateError,
    tone,
    flags,
  };
}
