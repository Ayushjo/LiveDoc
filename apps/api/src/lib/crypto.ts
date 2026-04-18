/**
 * AES-256-GCM encryption utilities for storing OAuth tokens at rest.
 *
 * Format of encrypted string:  <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
 * Generate one with:  openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

if (!process.env.TOKEN_ENCRYPTION_KEY) {
  throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set');
}
if (process.env.TOKEN_ENCRYPTION_KEY.length !== 64) {
  throw new Error(
    'TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)',
  );
}

const KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');

/**
 * Encrypts a plaintext string.
 * Returns a colon-delimited string: <iv>:<authTag>:<ciphertext>
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV — recommended for GCM
  const cipher = createCipheriv(ALGORITHM, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 128-bit authentication tag

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts a string produced by encrypt().
 * Throws if the ciphertext has been tampered with (GCM auth tag mismatch).
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, dataHex] = parts as [string, string, string];

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  );
}
