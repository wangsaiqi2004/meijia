import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from './db'
import { decryptProviderSecret, encryptProviderSecret } from './provider-secrets'
import {
  DEFAULT_PRICES,
  validatePriceTable,
  type ProviderSettings,
  type PriceSource,
  type PriceTable,
  type PricingConfig,
} from './contracts'

/**
 * 服务端价格配置读取层。
 * 顶层只允许常量与 import：Dockerfile.nail 的 build 阶段有 DATABASE_URL
 * 但没有 nail.db、也没跑 migrate，任何顶层查询都会炸构建。
 */
export const CONFIG_KEYS = {
  prices: 'generation_prices',
  provider: 'image_provider',
} as const

type DbClient = PrismaClient | Prisma.TransactionClient

export type ConfigRow = { value: string; updatedAt: Date; updatedBy: string | null }

const DEFAULT_PROVIDER_BASE = 'https://api.codexing.cn/v1'
const PROVIDER_CONFIG_VERSION = 1
const API_KEY_MAX_LENGTH = 2048

type StoredProviderConfig = {
  version: 1
  apiBaseUrl: string
  imageModel: string
  textModel: string
  encryptedApiKey: string
}

export type ResolvedProvider = ProviderSettings & { apiKey: string }

export async function readConfigRow(client: DbClient, key: string): Promise<ConfigRow | null> {
  return client.systemConfig.findUnique({
    where: { key },
    select: { value: true, updatedAt: true, updatedBy: true },
  })
}

function defaultPrices(): PriceTable {
  return {
    '1k': { ...DEFAULT_PRICES['1k'] },
    '4k': { ...DEFAULT_PRICES['4k'] },
  }
}

async function resolvePrices(client: DbClient): Promise<PricingConfig> {
  const row = await readConfigRow(client, CONFIG_KEYS.prices)
  if (row) {
    try {
      const checked = validatePriceTable(JSON.parse(row.value) as unknown)
      if (checked.ok) return { prices: checked.prices, priceSource: 'database' }
    } catch {}
    throw new Error('生图价格配置无效，请联系管理员')
  }
  return { prices: defaultPrices(), priceSource: 'default' }
}

function normalizeApiBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return null
  try {
    const parsed = new URL(value.trim())
    if (
      (parsed.protocol !== 'https:' && parsed.origin !== 'http://nail-gateway:3000') ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) return null
    const path = parsed.pathname.replace(/\/+$/, '')
    parsed.pathname = path.endsWith('/v1') ? path : `${path}/v1`
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

function validateProviderConfig(input: unknown): StoredProviderConfig | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  const apiBaseUrl = normalizeApiBaseUrl(value.apiBaseUrl)
  if (
    value.version !== PROVIDER_CONFIG_VERSION ||
    !apiBaseUrl ||
    typeof value.imageModel !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value.imageModel.trim()) ||
    typeof value.textModel !== 'string' ||
    value.textModel.length > 120 ||
    (value.textModel.trim() !== '' && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value.textModel.trim())) ||
    typeof value.encryptedApiKey !== 'string' ||
    (value.encryptedApiKey !== '' && !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.encryptedApiKey))
  ) return null

  return {
    version: PROVIDER_CONFIG_VERSION,
    apiBaseUrl,
    imageModel: value.imageModel.trim(),
    textModel: value.textModel.trim(),
    encryptedApiKey: value.encryptedApiKey,
  }
}

function resolveLegacyProvider(): ResolvedProvider {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.IMAGE_API_BASE_URL || DEFAULT_PROVIDER_BASE)
  const imageModel = (process.env.IMAGE_MODEL || 'gpt-image-2.5-sunburst').trim()
  const textModel = (process.env.TEXT_MODEL || '').trim()
  const configValid = Boolean(
    apiBaseUrl &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(imageModel) &&
    (!textModel || /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(textModel)),
  )

  return {
    apiBaseUrl: apiBaseUrl || DEFAULT_PROVIDER_BASE,
    imageModel: configValid ? imageModel : 'gpt-image-2.5-sunburst',
    textModel: configValid ? textModel : 'gpt-4o-mini',
    hasApiKey: configValid && Boolean(process.env.IMAGE_API_KEY),
    apiKey: configValid ? process.env.IMAGE_API_KEY || '' : '',
    configValid,
  }
}

function invalidProviderConfig(): ResolvedProvider {
  return {
    apiBaseUrl: DEFAULT_PROVIDER_BASE,
    imageModel: 'gpt-image-2.5-sunburst',
    textModel: 'gpt-4o-mini',
    hasApiKey: false,
    apiKey: '',
    configValid: false,
  }
}

/** Secret material and database failures stay inside this server-side settings layer. */
export async function getProviderConfig(client: DbClient = db): Promise<ResolvedProvider> {
  const row = await readConfigRow(client, CONFIG_KEYS.provider)
  if (!row) return resolveLegacyProvider()

  try {
    const parsed = JSON.parse(row.value) as unknown
    const config = validateProviderConfig(parsed)
    if (!config) return invalidProviderConfig()
    const apiKey = config.encryptedApiKey ? decryptProviderSecret(config.encryptedApiKey) : ''
    return { ...config, hasApiKey: Boolean(apiKey), apiKey, configValid: true }
  } catch {
    return invalidProviderConfig()
  }
}

export async function getPublicProviderSettings(client: DbClient = db): Promise<ProviderSettings> {
  const settings = await getProviderConfig(client)
  return {
    apiBaseUrl: settings.apiBaseUrl,
    imageModel: settings.imageModel,
    textModel: settings.textModel,
    hasApiKey: settings.hasApiKey,
    configValid: settings.configValid,
  }
}

export function validateProviderInput(input: {
  apiBaseUrl: unknown
  imageModel: unknown
  textModel: unknown
  apiKey: unknown
}): {
  apiBaseUrl: string
  imageModel: string
  textModel: string
  apiKey: string
} | null {
  const apiBaseUrl = normalizeApiBaseUrl(input.apiBaseUrl)
  const imageModel = typeof input.imageModel === 'string' ? input.imageModel.trim() : ''
  const textModel = typeof input.textModel === 'string' ? input.textModel.trim() : ''
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  if (
    !apiBaseUrl ||
    imageModel.length > 120 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(imageModel) ||
    textModel.length > 120 ||
    (textModel !== '' && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(textModel)) ||
    apiKey.length > API_KEY_MAX_LENGTH
  ) return null
  return { apiBaseUrl, imageModel, textModel, apiKey }
}

export async function makeStoredProviderConfig(
  client: DbClient,
  validated: NonNullable<ReturnType<typeof validateProviderInput>>,
): Promise<StoredProviderConfig> {
  const previousRow = await readConfigRow(client, CONFIG_KEYS.provider)
  const legacy = previousRow ? null : resolveLegacyProvider()
  let encryptedApiKey = ''

  if (validated.apiKey) {
    encryptedApiKey = encryptProviderSecret(validated.apiKey)
  } else if (previousRow) {
    let parsed: unknown
    try { parsed = JSON.parse(previousRow.value) } catch {}
    const previous = validateProviderConfig(parsed)
    if (!previous) {
      if (!validated.apiKey) throw new Error('请重新填写 API Key 以修复配置')
    } else {
      if (previous.encryptedApiKey) {
        try { decryptProviderSecret(previous.encryptedApiKey) } catch {
          if (!validated.apiKey) throw new Error('请重新填写 API Key 以修复配置')
        }
      }
      encryptedApiKey = previous.encryptedApiKey
    }
  } else if (legacy?.apiKey) {
    encryptedApiKey = encryptProviderSecret(legacy.apiKey)
  }

  return { version: PROVIDER_CONFIG_VERSION, apiBaseUrl: validated.apiBaseUrl, imageModel: validated.imageModel, textModel: validated.textModel, encryptedApiKey }
}

export function createStoredProviderConfig(
  apiBaseUrl: string,
  imageModel: string,
  textModel: string,
): StoredProviderConfig {
  return { version: PROVIDER_CONFIG_VERSION, apiBaseUrl, imageModel, textModel, encryptedApiKey: '' }
}

export function providerConfigAuditValue(config: StoredProviderConfig): string {
  return JSON.stringify({
    apiBaseUrl: config.apiBaseUrl,
    imageModel: config.imageModel,
    textModel: config.textModel,
    apiKeyConfigured: Boolean(config.encryptedApiKey),
  })
}

/** 价格不走缓存，事务内直读，保证一次扣点用同一份快照。 */
export async function getPrices(client: DbClient): Promise<PriceTable> {
  return (await resolvePrices(client)).prices
}

export async function getPriceSource(client: DbClient): Promise<PriceSource> {
  return (await resolvePrices(client)).priceSource
}

/** 后台「系统设置」展示用，返回值只有价格与来源。 */
export async function getPricingConfig(client: DbClient = db): Promise<PricingConfig> {
  return resolvePrices(client)
}
