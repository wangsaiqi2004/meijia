import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import type { PriceTable } from '../src/lib/nail/contracts'

// node --test 会并行执行多个测试文件，账务测试共用 ledger-test.db。
// 本文件单独迁移一份库，避免并行的 generation_prices 行污染默认扣点断言。
const dbName = `nail-config-${process.pid}.db`
const dbUrl = `file:./${dbName}`
process.env.DATABASE_URL = dbUrl

const { PrismaClient } = await import('@prisma/client')
const { db } = await import('../src/lib/nail/db')
const {
  DEFAULT_PRICES,
  PRICE_MAX,
  PRICE_MIN,
  validatePriceTable,
} = await import('../src/lib/nail/contracts')
const {
  CONFIG_KEYS,
  getPrices,
  getPriceSource,
  getPricingConfig,
  readConfigRow,
} = await import('../src/lib/nail/system-config')
const {
  LedgerError,
  finishGeneration,
  reserveGeneration,
  resetPrices,
  setPrices,
} = await import('../src/lib/nail/ledger')

const prisma = new PrismaClient()
const adminId = randomUUID()
const adminName = `config-admin-${adminId}`
const shopIds: string[] = []
const userIds: string[] = []

/** 只清理本文件写的配置行；每个用例与 after() 都调用，保证零残留。 */
async function cleanConfig(): Promise<void> {
  await prisma.configAudit.deleteMany({ where: { configKey: CONFIG_KEYS.prices } })
  await prisma.systemConfig.deleteMany({ where: { key: CONFIG_KEYS.prices } })
}

async function fixture(credits = 1000) {
  const shopId = randomUUID()
  await prisma.shop.create({ data: { id: shopId, name: '配置测试店', credits } })
  shopIds.push(shopId)
  const user = await prisma.user.create({
    data: { username: `owner-${shopId}`, passwordHash: 'test-only', role: 'owner', shopId },
  })
  userIds.push(user.id)
  return { shopId, userId: user.id }
}

before(async () => {
  await writeFile(join(process.cwd(), 'prisma', dbName), '')
  execFileSync(process.execPath, [
    join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
    'migrate', 'deploy',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
    timeout: 120_000,
  })
  await prisma.user.create({ data: { id: adminId, username: adminName, passwordHash: 'test-only', role: 'admin' } })
  await cleanConfig()
})

after(async () => {
  try {
    await cleanConfig()
    await prisma.generation.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.rechargeOrder.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.redeemCode.deleteMany({ where: { usedByShopId: { in: shopIds } } })
    await prisma.user.deleteMany({ where: { id: { in: [...userIds, adminId] } } })
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } })
  } finally {
    await prisma.$disconnect()
    await db.$disconnect()
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      await rm(join(process.cwd(), 'prisma', `${dbName}${suffix}`), { force: true })
    }
  }
})

test('① 无配置行时返回默认价格且来源为 default', async () => {
  await cleanConfig()
  try {
    assert.deepEqual(await getPrices(prisma), DEFAULT_PRICES)
    assert.equal(await getPriceSource(prisma), 'default')
    const config = await getPricingConfig()
    assert.equal(config.priceSource, 'default')
    assert.deepEqual(config.prices, DEFAULT_PRICES)
    assert.deepEqual(Object.keys(config).sort(), ['priceSource', 'prices'])
  } finally { await cleanConfig() }
})

test('② 写入价格行后读取后台价且来源为 database', async () => {
  await cleanConfig()
  try {
    const prices: PriceTable = { '1k': { regular: 7, vip: 3 }, '4k': { regular: 21, vip: 9 } }
    await setPrices(prisma, { adminId, operatorName: adminName, prices })
    assert.deepEqual(await getPrices(prisma), prices)
    assert.equal(await getPriceSource(prisma), 'database')
    assert.equal((await getPricingConfig()).priceSource, 'database')
    const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEYS.prices }, select: { value: true } })
    assert.deepEqual(JSON.parse(row?.value ?? 'null'), prices)
  } finally { await cleanConfig() }
})

test('③ validatePriceTable 拒绝非法值、接受边界并返回深拷贝', () => {
  const boundary: PriceTable = {
    '1k': { regular: PRICE_MIN, vip: PRICE_MAX },
    '4k': { regular: PRICE_MAX, vip: PRICE_MIN },
  }
  const checked = validatePriceTable(boundary)
  assert.equal(checked.ok, true)
  if (checked.ok) {
    assert.deepEqual(checked.prices, boundary)
    assert.notEqual(checked.prices, boundary)
    assert.notEqual(checked.prices['1k'], boundary['1k'])
    assert.notEqual(checked.prices['4k'], boundary['4k'])
  }
  const base: PriceTable = { '1k': { regular: 10, vip: 5 }, '4k': { regular: 30, vip: 15 } }
  const rejects: unknown[] = [
    undefined, null, 1, '10', [], {},
    { '1k': { regular: 10, vip: 5 } },
    { ...base, '1k': { regular: 0, vip: 5 } },
    { ...base, '1k': { regular: 10001, vip: 5 } },
    { ...base, '1k': { regular: 1.5, vip: 5 } },
    { ...base, '1k': { regular: '10', vip: 5 } },
    { ...base, '4k': { regular: 10 } },
    { ...base, '4k': { regular: 10, vip: Number.NaN } },
    { ...base, '4k': { regular: 10, vip: Infinity } },
  ]
  for (const bad of rejects) {
    const result = validatePriceTable(bad)
    assert.equal(result.ok, false, `应拒绝：${JSON.stringify(bad)}`)
    if (!result.ok) assert.equal(result.message, '档位点数须为 1 至 10000 的整数')
  }
})

test('④ setPrices 恰写一条审计，before/after 为合法 JSON', async () => {
  await cleanConfig()
  try {
    const before = await getPrices(prisma)
    const prices: PriceTable = { '1k': { regular: 8, vip: 4 }, '4k': { regular: 24, vip: 12 } }
    await setPrices(prisma, { adminId, operatorName: adminName, prices })
    const audits = await prisma.configAudit.findMany({ where: { configKey: CONFIG_KEYS.prices } })
    assert.equal(audits.length, 1)
    assert.equal(audits[0].action, 'prices.update')
    assert.deepEqual(JSON.parse(audits[0].beforeJson ?? 'null'), before)
    assert.deepEqual(JSON.parse(audits[0].afterJson ?? 'null'), prices)
    assert.equal(audits[0].operatorId, adminId)
    assert.equal(audits[0].operatorName, adminName)
  } finally { await cleanConfig() }
})

test('⑤ 改价后 reserveGeneration 按新价扣点，退款额等于原 creditsCost', async () => {
  await cleanConfig()
  try {
    const { shopId, userId } = await fixture(1000)
    const prices: PriceTable = { '1k': { regular: 7, vip: 3 }, '4k': { regular: 21, vip: 9 } }
    await setPrices(prisma, { adminId, operatorName: adminName, prices })
    const generation = await reserveGeneration(prisma, {
      shopId, userId, idempotencyKey: randomUUID(), size: '1k',
      mode: 'preview', styleName: '奶茶猫眼', extraPrompt: '',
      inputHandPath: 'hand.png', inputStylePath: 'style.png',
    })
    assert.equal(generation.creditsCost, 7)
    assert.equal((await prisma.shop.findUniqueOrThrow({ where: { id: shopId } })).credits, 993)
    await setPrices(prisma, { adminId, operatorName: adminName, prices: DEFAULT_PRICES })
    assert.equal(await finishGeneration(prisma, generation.id, { success: false, reason: '上游失败' }), true)
    assert.equal((await prisma.shop.findUniqueOrThrow({ where: { id: shopId } })).credits, 1000)
    assert.equal((await prisma.generation.findUniqueOrThrow({ where: { id: generation.id } })).creditsCost, 7)
  } finally { await cleanConfig() }
})

test('⑥ resetPrices 删除价格行、恢复默认并写 prices.reset 审计', async () => {
  await cleanConfig()
  try {
    const prices: PriceTable = { '1k': { regular: 9, vip: 6 }, '4k': { regular: 27, vip: 18 } }
    await setPrices(prisma, { adminId, operatorName: adminName, prices })
    assert.equal(await getPriceSource(prisma), 'database')
    await resetPrices(prisma, { adminId, operatorName: adminName })
    assert.equal(await getPriceSource(prisma), 'default')
    assert.deepEqual(await getPrices(prisma), DEFAULT_PRICES)
    assert.equal(await prisma.systemConfig.count({ where: { key: CONFIG_KEYS.prices } }), 0)
    const audits = await prisma.configAudit.findMany({ where: { action: 'prices.reset' } })
    assert.equal(audits.length, 1)
    assert.deepEqual(JSON.parse(audits[0].beforeJson ?? 'null'), prices)
    assert.deepEqual(JSON.parse(audits[0].afterJson ?? 'null'), DEFAULT_PRICES)
  } finally { await cleanConfig() }
})

test('⑦ 非管理员改价抛权限错误且配置与审计均无变化', async () => {
  await cleanConfig()
  try {
    const { userId } = await fixture()
    await assert.rejects(
      setPrices(prisma, {
        adminId: userId, operatorName: 'owner',
        prices: { '1k': { regular: 1, vip: 1 }, '4k': { regular: 1, vip: 1 } },
      }),
      (error: unknown) => error instanceof LedgerError && error.message === '没有权限执行此操作',
    )
    assert.equal(await getPriceSource(prisma), 'default')
    assert.deepEqual(await getPrices(prisma), DEFAULT_PRICES)
    assert.equal(await prisma.configAudit.count({ where: { configKey: CONFIG_KEYS.prices } }), 0)
  } finally { await cleanConfig() }
})

test('配置库不可用时拒绝读取价格，不能按默认价扣点', async () => {
  await cleanConfig()
  const broken = new PrismaClient({ datasources: { db: { url: 'file:./prisma/__missing_dir__/no-such.db' } } })
  try {
    await assert.rejects(readConfigRow(broken, CONFIG_KEYS.prices))
    await assert.rejects(getPrices(broken))
    await assert.rejects(getPriceSource(broken))
  } finally {
    await broken.$disconnect()
    await cleanConfig()
  }
})

test('损坏的价格行阻止扣点和任务创建', async () => {
  await cleanConfig()
  const { shopId, userId } = await fixture(1000)
  try {
    await prisma.systemConfig.create({ data: { key: CONFIG_KEYS.prices, value: '{"1k":{}}' } })
    await assert.rejects(reserveGeneration(prisma, {
      shopId, userId, idempotencyKey: randomUUID(), size: '1k',
      mode: 'preview', styleName: 'test', extraPrompt: '',
      inputHandPath: 'hand.png', inputStylePath: 'style.png',
    }), /价格配置无效/)
    assert.equal((await prisma.shop.findUniqueOrThrow({ where: { id: shopId } })).credits, 1000)
    assert.equal(await prisma.generation.count({ where: { shopId } }), 0)
  } finally { await cleanConfig() }
})

test('直接调用调价服务也拒绝非法价格', async () => {
  await cleanConfig()
  await assert.rejects(setPrices(prisma, {
    adminId, operatorName: adminName,
    prices: { '1k': { regular: -10, vip: 0 }, '4k': { regular: 30, vip: 15 } },
  }), LedgerError)
  assert.equal(await prisma.systemConfig.count(), 0)
})

test('管理员可以覆盖或重置损坏的配置', async () => {
  await cleanConfig()
  try {
    await prisma.systemConfig.create({ data: { key: CONFIG_KEYS.prices, value: 'broken' } })
    await setPrices(prisma, { adminId, operatorName: adminName, prices: DEFAULT_PRICES })
    assert.deepEqual(await getPrices(prisma), DEFAULT_PRICES)
    await prisma.systemConfig.update({ where: { key: CONFIG_KEYS.prices }, data: { value: 'broken' } })
    await resetPrices(prisma, { adminId, operatorName: adminName })
    assert.equal(await getPriceSource(prisma), 'default')
  } finally { await cleanConfig() }
})
