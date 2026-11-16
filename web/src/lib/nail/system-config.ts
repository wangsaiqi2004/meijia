import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from './db'
import {
  DEFAULT_PRICES,
  validatePriceTable,
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
} as const

type DbClient = PrismaClient | Prisma.TransactionClient

export type ConfigRow = { value: string; updatedAt: Date; updatedBy: string | null }

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
