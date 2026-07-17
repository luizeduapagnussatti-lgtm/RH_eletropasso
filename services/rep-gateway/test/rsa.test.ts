import assert from 'node:assert/strict';
import {
  constants,
  privateDecrypt,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { describe, it } from 'node:test';
import {
  createRsaPublicKey,
  encryptRsaProbe,
  encryptRsaProbeVariant,
  verifyRsaSignature,
} from '../src/security/rsa.js';

const ACTIVE_PRINTPOINT_MODULUS =
  '916CA83A303938982FC68C1B158E3DB9E34C2CA294F35251154E9B87BF69F1E82E3E0225CFFBB9632609444DA7977A3633471B536395BBE3533506300E10544EBDCFC33FB484FE4B94FD727FA0E857B1B82EE811D6BE84AEB3B1B66DAA85DB329F5E5E74E9D8EA9F929AE781FBF16430D12229B533BEE3921358F4139E4ADBBF';

describe('RSA security primitives', () => {
  it('imports the active PrintPoint modulus and exponent', () => {
    const key = createRsaPublicKey(ACTIVE_PRINTPOINT_MODULUS, '010001');
    assert.equal(key.type, 'public');
    assert.equal(key.asymmetricKeyType, 'rsa');
    assert.equal(key.asymmetricKeyDetails?.modulusLength, 1_024);
    assert.equal(key.asymmetricKeyDetails?.publicExponent, 65_537n);
    assert.equal(
      encryptRsaProbe(Buffer.alloc(0), ACTIVE_PRINTPOINT_MODULUS, '010001').length,
      128,
    );
  });

  it('verifies PKCS#1 SHA-256 signatures over exact raw bytes', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2_048,
      publicExponent: 0x10001,
    });
    const payload = Buffer.from([0, 1, 2, 3, 255, 254, 65, 66]);
    const signature = sign('sha256', payload, {
      key: privateKey,
      padding: constants.RSA_PKCS1_PADDING,
    });

    assert.equal(
      verifyRsaSignature({
        payload,
        signature,
        publicKey,
        hash: 'sha256',
        padding: 'pkcs1',
        pssSaltLength: -1,
      }),
      true,
    );

    assert.equal(
      verifyRsaSignature({
        payload: Buffer.from('different'),
        signature,
        publicKey,
        hash: 'sha256',
        padding: 'pkcs1',
        pssSaltLength: -1,
      }),
      false,
    );
  });

  it('encrypts a PKCS#1 probe that only the matching private key can decrypt', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2_048,
      publicExponent: 0x10001,
    });
    const jwk = publicKey.export({ format: 'jwk' });
    assert.ok(jwk.n);
    assert.ok(jwk.e);

    const encrypted = encryptRsaProbe(
      Buffer.alloc(0),
      Buffer.from(jwk.n, 'base64url').toString('hex'),
      Buffer.from(jwk.e, 'base64url').toString('hex'),
    );
    const decrypted = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
      encrypted,
    );
    assert.equal(decrypted.length, 0);
  });

  it('encodes discovery variants without changing the safe command frame', () => {
    const frame = Buffer.from('f8a170010000d0f0', 'hex');
    const binary = encryptRsaProbeVariant(
      frame,
      ACTIVE_PRINTPOINT_MODULUS,
      '010001',
      'pkcs1-binary',
    );
    const hex = encryptRsaProbeVariant(
      frame,
      ACTIVE_PRINTPOINT_MODULUS,
      '010001',
      'pkcs1-hex',
    );
    const base64 = encryptRsaProbeVariant(
      frame,
      ACTIVE_PRINTPOINT_MODULUS,
      '010001',
      'pkcs1-base64',
    );
    assert.equal(binary.length, 128);
    assert.equal(hex.length, 256);
    assert.equal(base64.length, 172);
    assert.match(hex.toString('ascii'), /^[0-9a-f]{256}$/);
  });
});
