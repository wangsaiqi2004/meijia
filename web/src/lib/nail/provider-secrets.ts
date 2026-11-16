import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const CIPHER = 'aes-256-gcm'
const SECRET_VERSION = 'v1'

function encryptionKey(): Buffer {
  const value = process.env.NAIL_CONFIG_ENCRYPTION_KEY || ''
  let key: Buffer
  try {
    key = Buffer.from(value, 'base64')
  } catch {
    throw new Error('服务端 API Key 加密密钥未正确配置')
  }
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('服务端 API Key 加密密钥未正确配置')
  }
  return key
}

export function encryptProviderSecret(value: string): string {
  if (!value) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv(CIPHER, encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [
    SECRET_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function decryptProviderSecret(value: string): string {
  if (!value) return ''
  const [version, encodedIv, encodedTag, encodedValue, extra] = value.split('.')
  if (version !== SECRET_VERSION || !encodedIv || !encodedTag || !encodedValue || extra !== undefined) {
    throw new Error('加密的 API Key 配置无效')
  }
  const decipher = createDecipheriv(CIPHER, encryptionKey(), Buffer.from(encodedIv, 'base64url'))
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encodedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
