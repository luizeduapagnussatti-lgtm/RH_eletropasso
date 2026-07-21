import {
  constants,
  createPublicKey,
  publicEncrypt,
  verify,
  type KeyObject,
} from 'node:crypto';
import type { GatewayConfig } from '../config.js';
import type { SecurityResult } from '../types.js';

export function createRsaPublicKey(modulusHex: string, exponentHex: string): KeyObject {
  if (!/^[0-9a-f]+$/i.test(modulusHex) || modulusHex.length % 2 !== 0) {
    throw new Error('RSA modulus must be an even-length hexadecimal string');
  }
  if (!/^[0-9a-f]+$/i.test(exponentHex) || exponentHex.length % 2 !== 0) {
    throw new Error('RSA exponent must be an even-length hexadecimal string');
  }

  return createPublicKey({
    format: 'jwk',
    key: {
      kty: 'RSA',
      n: Buffer.from(modulusHex, 'hex').toString('base64url'),
      e: Buffer.from(exponentHex, 'hex').toString('base64url'),
    },
  });
}

export interface VerifyRsaInput {
  payload: Buffer;
  signature: Buffer;
  publicKey: KeyObject;
  hash: GatewayConfig['security']['hash'];
  padding: GatewayConfig['security']['padding'];
  pssSaltLength: number;
}

/**
 * Generic RSA signature primitive.
 *
 * This intentionally does not guess where the PrintPoint signature lives or
 * which bytes are canonical. The protocol capture must establish those facts
 * before REP_SECURITY_MODE=verify is enabled.
 */
export function verifyRsaSignature(input: VerifyRsaInput): boolean {
  const key =
    input.padding === 'pss'
      ? {
          key: input.publicKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: input.pssSaltLength,
        }
      : {
          key: input.publicKey,
          padding: constants.RSA_PKCS1_PADDING,
        };

  return verify(input.hash, input.payload, key, input.signature);
}

/**
 * Discovery-only probe for the observed Client Rest handshake.
 * The device owns the matching private key, so a successful decrypt confirms
 * key direction and PKCS#1 v1.5 padding. It does not authenticate requests.
 */
export function encryptRsaProbe(
  plaintext: Buffer,
  modulusHex: string,
  exponentHex: string,
): Buffer {
  return publicEncrypt(
    {
      key: createRsaPublicKey(modulusHex, exponentHex),
      padding: constants.RSA_PKCS1_PADDING,
    },
    plaintext,
  );
}

export function encryptRsaProbeVariant(
  plaintext: Buffer,
  modulusHex: string,
  exponentHex: string,
  variant: string,
): Buffer {
  const [scheme, encoding = 'binary'] = variant.split('-');
  const littleEndianModulus = scheme?.includes('le') ?? false;
  const effectiveModulusHex = littleEndianModulus
    ? Buffer.from(modulusHex, 'hex').reverse().toString('hex')
    : modulusHex;
  const key = createRsaPublicKey(effectiveModulusHex, exponentHex);
  const modulusBytes = modulusHex.length / 2;
  let input = plaintext;
  let options: Parameters<typeof publicEncrypt>[0] = {
    key,
    padding: constants.RSA_PKCS1_PADDING,
  };

  if (scheme === 'oaep1' || scheme === 'oaep1le') {
    options = { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' };
  } else if (scheme === 'oaep256' || scheme === 'oaep256le') {
    options = { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };
  } else if (scheme === 'nopadleft') {
    input = Buffer.concat([Buffer.alloc(modulusBytes - plaintext.length), plaintext]);
    options = { key, padding: constants.RSA_NO_PADDING };
  } else if (scheme === 'nopadright') {
    input = Buffer.concat([
      Buffer.from([0]),
      plaintext,
      Buffer.alloc(modulusBytes - plaintext.length - 1),
    ]);
    options = { key, padding: constants.RSA_NO_PADDING };
  } else if (
    scheme !== 'pkcs1'
    && scheme !== 'pkcs1rev'
    && scheme !== 'pkcs1le'
    && scheme !== 'pkcs1lerev'
  ) {
    throw new Error(`Unsupported RSA probe variant: ${variant}`);
  }

  let ciphertext = publicEncrypt(options, input);
  if (scheme === 'pkcs1rev' || scheme === 'pkcs1lerev') {
    ciphertext = Buffer.from(ciphertext).reverse();
  }
  if (encoding === 'hex') return Buffer.from(ciphertext.toString('hex'), 'ascii');
  if (encoding === 'base64') return Buffer.from(ciphertext.toString('base64'), 'ascii');
  if (encoding !== 'binary') throw new Error(`Unsupported RSA probe encoding: ${encoding}`);
  return ciphertext;
}

export function evaluateRequestSignature(
  body: Buffer,
  headers: Record<string, unknown>,
  security: GatewayConfig['security'],
): SecurityResult {
  if (security.mode === 'discovery') {
    return {
      status: 'not-attempted',
      reason: 'Discovery mode: wire-level signature location/padding is not yet proven',
    };
  }

  const encodedSignature = headerValue(headers[security.signatureHeader]);
  if (!encodedSignature) {
    return { status: 'invalid', reason: `Missing ${security.signatureHeader} header` };
  }
  if (!security.modulusHex) {
    return { status: 'invalid', reason: 'RSA modulus is not configured' };
  }

  try {
    const publicKey = createRsaPublicKey(security.modulusHex, security.exponentHex);
    const signature = decodeSignature(encodedSignature, security.signatureEncoding);
    const valid = verifyRsaSignature({
      payload: body,
      signature,
      publicKey,
      hash: security.hash,
      padding: security.padding,
      pssSaltLength: security.pssSaltLength,
    });
    return valid
      ? { status: 'valid', algorithm: `RSA-${security.hash}-${security.padding}` }
      : { status: 'invalid', reason: 'RSA signature mismatch' };
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'RSA verification failed',
    };
  }
}

function decodeSignature(value: string, encoding: BufferEncoding | 'base64url'): Buffer {
  if (encoding === 'hex' && (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0)) {
    throw new Error('Signature is not valid hexadecimal');
  }
  return Buffer.from(value, encoding);
}

function headerValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}
