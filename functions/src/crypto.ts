import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function encrypt(plaintext: string, keyHex: string): string {
  if (keyHex.length !== 64) {
    throw new Error('Invalid key: must be a 64-character hex string (32 bytes)')
  }
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decrypt(encoded: string, keyHex: string): string {
  if (keyHex.length !== 64) {
    throw new Error('Invalid key: must be a 64-character hex string (32 bytes)')
  }
  const key = Buffer.from(keyHex, 'hex')
  const data = Buffer.from(encoded, 'base64')
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encoded data: too short')
  }
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch (err) {
    console.error('[crypto] Decryption failed:', err instanceof Error ? err.message : err)
    throw new Error('Decryption failed: invalid key or corrupted data')
  }
}
