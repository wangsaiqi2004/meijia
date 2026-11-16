/**
 * 生图价格的前后端共享契约。
 * 纯 TypeScript：不得引入 db、@prisma/client、node:* 等服务端模块，
 * 否则客户端组件会把 Prisma 打进浏览器 bundle。
 */

export type Size = '1k' | '4k'

export type PriceTier = { regular: number; vip: number }

export type PriceTable = Record<Size, PriceTier>

export type PriceSource = 'database' | 'default'

export type PricingConfig = {
  prices: PriceTable
  priceSource: PriceSource
}

export type ProviderSettings = {
  apiBaseUrl: string
  imageModel: string
  textModel: string
  hasApiKey: boolean
  configValid: boolean
}

export const PRICE_KEYS: readonly Size[] = ['1k', '4k']

/** 默认价格的唯一真相源；数据库不预置配置行，靠它保证 DB 行 > 代码默认的回退链。 */
export const DEFAULT_PRICES: PriceTable = {
  '1k': { regular: 10, vip: 5 },
  '4k': { regular: 30, vip: 15 },
}

export const PRICE_MIN = 1
export const PRICE_MAX = 10000

export type PriceValidation =
  | { ok: true; prices: PriceTable }
  | { ok: false; message: string }

const INVALID_PRICE_MESSAGE = '档位点数须为 1 至 10000 的整数'

function isPriceValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= PRICE_MIN && value <= PRICE_MAX
}

function invalid(): { ok: false; message: string } {
  return { ok: false, message: INVALID_PRICE_MESSAGE }
}

/** 校验整张价格表，成功时返回深拷贝。 */
export function validatePriceTable(input: unknown): PriceValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid()
  const table = input as Record<string, unknown>
  const prices: PriceTable = {
    '1k': { regular: 0, vip: 0 },
    '4k': { regular: 0, vip: 0 },
  }
  for (const key of PRICE_KEYS) {
    const tier = table[key]
    if (!tier || typeof tier !== 'object' || Array.isArray(tier)) return invalid()
    const candidate = tier as Record<string, unknown>
    const regular: unknown = candidate.regular
    const vip: unknown = candidate.vip
    if (!isPriceValue(regular) || !isPriceValue(vip)) return invalid()
    prices[key] = { regular, vip }
  }
  return { ok: true, prices }
}
