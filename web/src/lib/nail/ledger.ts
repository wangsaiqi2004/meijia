import { Prisma, type Generation, type PrismaClient } from '@prisma/client'
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import {
  DEFAULT_PRICES,
  PRICE_KEYS,
  validatePriceTable,
  type PriceTable,
  type Size,
} from './contracts'
import {
  CONFIG_KEYS,
  createStoredProviderConfig,
  getProviderConfig,
  getPrices,
  makeStoredProviderConfig,
  providerConfigAuditValue,
  readConfigRow,
  validateProviderInput,
} from './system-config'

type Transaction = Prisma.TransactionClient
type CreditChannel = 'manual' | 'code'

export class LedgerError extends Error {}

let writeTail: Promise<void> = Promise.resolve()

function positivePoints(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1_000_000_000) {
    throw new LedgerError('点数必须是有效的正整数')
  }
}

function required(value: string, name: string, limit = 200): string {
  const result = value.trim()
  if (!result || result.length > limit) throw new LedgerError(`${name}无效`)
  return result
}

async function requireActor(tx: Transaction, userId: string, roles: string[], shopId?: string): Promise<void> {
  const user = await tx.user.findFirst({
    where: { id: userId, status: 'active', role: { in: roles }, ...(shopId ? { shopId } : {}) },
    select: { id: true },
  })
  if (!user) throw new LedgerError('没有权限执行此操作')
}

export async function createShopAccount(
  db: PrismaClient,
  input: {
    adminId: string
    name: string
    city?: string
    contact?: string
    username: string
    password: string
    initialCredits?: number
  },
): Promise<{ shopId: string }> {
  const name = required(input.name, '店铺名称', 80)
  const username = required(input.username, '老板账号', 80)
  const password = required(input.password, '老板密码', 200)
  if (password.length < 12) throw new LedgerError('初始密码至少12位')
  const credits = input.initialCredits || 0
  if (credits) positivePoints(credits)
  const passwordHash = await bcrypt.hash(password, 12)
  const shopId = randomUUID()
  await transact(db, async tx => {
    await requireActor(tx, input.adminId, ['admin'])
    await tx.shop.create({
      data: {
        id: shopId,
        name,
        city: String(input.city || '').trim().slice(0, 80),
        contact: String(input.contact || '').trim().slice(0, 120),
      },
    })
    const owner = await tx.user.create({
      data: { username, passwordHash, role: 'owner', shopId },
    })
    if (credits) await creditAccount(tx, shopId, credits, 'manual', input.adminId, '建店初始点数', `opening:${shopId}`)
    void owner
  })
  return { shopId }
}

export async function createStaffAccount(
  db: PrismaClient,
  input: { ownerId: string; shopId: string; username: string; password: string },
): Promise<void> {
  const username = required(input.username, '店员账号', 80)
  const password = required(input.password, '店员密码', 200)
  if (password.length < 12) throw new LedgerError('初始密码至少12位')
  const passwordHash = await bcrypt.hash(password, 12)
  await transact(db, async tx => {
    await requireActor(tx, input.ownerId, ['owner'], input.shopId)
    await tx.user.create({ data: { username, passwordHash, role: 'staff', shopId: input.shopId } })
  })
}

export async function setShopVip(
  db: PrismaClient,
  input: { adminId: string; shopId: string; isVip: boolean },
): Promise<void> {
  await transact(db, async tx => {
    await requireActor(tx, input.adminId, ['admin'])
    await tx.shop.update({
      where: { id: input.shopId },
      data: { isVip: input.isVip, vipGrantedAt: input.isVip ? new Date() : null },
    })
  })
}

export async function setShopStatus(
  db: PrismaClient,
  input: { adminId: string; shopId: string; status: 'active' | 'disabled' },
): Promise<void> {
  await transact(db, async tx => {
    await requireActor(tx, input.adminId, ['admin'])
    await tx.shop.update({ where: { id: input.shopId }, data: { status: input.status } })
  })
}

async function transact<T>(
  db: PrismaClient,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const previous = writeTail
  let release!: () => void
  writeTail = new Promise<void>(resolve => { release = resolve })
  await previous
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await db.$transaction(work, { maxWait: 10000, timeout: 15000 })
      } catch (error) {
        const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : ''
        const message = error instanceof Error ? error.message : ''
        const retryable = ['P1008', 'P2028', 'P2034'].includes(code) ||
          /database is locked|database is busy/i.test(message)
        if (!retryable || attempt >= 3) throw error
        await new Promise(resolve => setTimeout(resolve, 75 * (attempt + 1)))
      }
    }
  } finally {
    release()
  }
}

async function creditAccount(
  tx: Transaction,
  shopId: string,
  points: number,
  channel: CreditChannel,
  operatorId: string,
  remark: string,
  orderId: string,
): Promise<void> {
  positivePoints(points)
  const updated = await tx.shop.updateMany({
    where: { id: shopId, status: 'active', credits: { lte: 2_147_483_647 - points } },
    data: { credits: { increment: points } },
  })
  if (updated.count !== 1) throw new LedgerError('店铺不存在、已停用或点数超过上限')
  await tx.rechargeOrder.create({
    data: { outTradeNo: orderId, shopId, credits: points, channel, operatorId, remark },
  })
}

export async function manualCredit(
  db: PrismaClient,
  input: { shopId: string; points: number; operatorId: string; remark: string; orderId: string },
): Promise<void> {
  const { points } = input
  positivePoints(points)
  const shopId = required(input.shopId, '店铺')
  const operatorId = required(input.operatorId, '操作人')
  const remark = required(input.remark, '充值备注', 500)
  const orderId = required(input.orderId, '订单编号')
  await transact(db, async tx => {
    await requireActor(tx, operatorId, ['admin'])
    const existing = await tx.rechargeOrder.findUnique({ where: { outTradeNo: orderId } })
    if (existing) {
      if (existing.shopId !== shopId || existing.credits !== points || existing.operatorId !== operatorId ||
          existing.remark !== remark || existing.channel !== 'manual') throw new LedgerError('重复充值的参数不一致')
      return
    }
    await creditAccount(tx, shopId, points, 'manual', operatorId, remark, orderId)
  })
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export async function createRedeemCodes(
  db: PrismaClient,
  input: { points: number; count: number; operatorId: string; expiresAt?: Date },
): Promise<string[]> {
  positivePoints(input.points)
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 500) {
    throw new LedgerError('每次生成数量须为1至500')
  }
  const operatorId = required(input.operatorId, '操作人')
  if (input.expiresAt && (Number.isNaN(input.expiresAt.getTime()) || input.expiresAt <= new Date())) {
    throw new LedgerError('有效期必须晚于当前时间')
  }
  return transact(db, async tx => {
    await requireActor(tx, operatorId, ['admin'])
    const codes: string[] = []
    for (let index = 0; index < input.count; index++) {
      // 32 symbols divide 256 exactly, so each character has equal probability.
      const random = randomBytes(12)
      const raw = Array.from(random, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
      const code = `MJ-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`
      await tx.redeemCode.create({
        data: { code, credits: input.points, createdById: operatorId, expiresAt: input.expiresAt },
      })
      codes.push(code)
    }
    return codes
  })
}

export async function redeemCode(
  db: PrismaClient,
  input: { shopId: string; operatorId: string; code: string },
): Promise<number> {
  const shopId = required(input.shopId, '店铺')
  const operatorId = required(input.operatorId, '操作人')
  const code = input.code.trim().toUpperCase()
  if (!/^MJ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) {
    throw new LedgerError('兑换码格式不正确')
  }
  return transact(db, async tx => {
    await requireActor(tx, operatorId, ['owner'], shopId)
    const now = new Date()
    const claim = await tx.redeemCode.updateMany({
      where: { code, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { usedByShopId: shopId, usedAt: now },
    })
    if (claim.count !== 1) throw new LedgerError('兑换码无效、已使用或已过期')
    const redeemed = await tx.redeemCode.findUniqueOrThrow({ where: { code } })
    await creditAccount(tx, shopId, redeemed.credits, 'code', operatorId, '兑换码充值', `code:${redeemed.id}`)
    return redeemed.credits
  })
}

type Reservation = {
  shopId: string
  userId: string
  idempotencyKey: string
  mode: 'preview' | 'promo'
  styleName: string
  extraPrompt: string
  size: Size
  inputHandPath: string
  inputStylePath: string
}

function matches(existing: Generation, input: Reservation): boolean {
  return existing.userId === input.userId && existing.mode === input.mode &&
    existing.size === input.size && existing.styleName === input.styleName &&
    existing.extraPrompt === input.extraPrompt &&
    existing.inputHandPath === input.inputHandPath && existing.inputStylePath === input.inputStylePath
}

export async function reserveGeneration(db: PrismaClient, input: Reservation): Promise<Generation> {
  required(input.shopId, '店铺')
  required(input.userId, '操作人')
  required(input.idempotencyKey, '请求编号', 128)
  required(input.styleName, '款式', 60)
  required(input.inputHandPath, '手部照片', 500)
  required(input.inputStylePath, '款式图片', 500)
  if (!(PRICE_KEYS as readonly string[]).includes(input.size) || !['preview', 'promo'].includes(input.mode) || input.extraPrompt.length > 200) {
    throw new LedgerError('生成参数无效')
  }
  const key = { shopId_idempotencyKey: { shopId: input.shopId, idempotencyKey: input.idempotencyKey } }
  try {
    return await transact(db, async tx => {
      await requireActor(tx, input.userId, ['owner', 'staff'], input.shopId)
      const duplicate = await tx.generation.findUnique({ where: key })
      if (duplicate) {
        if (!matches(duplicate, input)) throw new LedgerError('重复请求的参数不一致')
        return duplicate
      }
      const prices = await getPrices(tx)
      const price = prices[input.size]
      // One conditional write serializes balance and concurrent-task checks on SQLite.
      const changed = await tx.$executeRaw`
        UPDATE "Shop"
        SET "credits" = "credits" - CASE WHEN "isVip" THEN ${price.vip} ELSE ${price.regular} END
        WHERE "id" = ${input.shopId} AND "status" = 'active'
          AND "credits" >= CASE WHEN "isVip" THEN ${price.vip} ELSE ${price.regular} END
          AND (SELECT COUNT(*) FROM "Generation" WHERE "shopId" = ${input.shopId}
               AND "status" = 'pending') < 2
      `
      if (changed !== 1) {
        const shop = await tx.shop.findUnique({ where: { id: input.shopId } })
        if (!shop || shop.status !== 'active') throw new LedgerError('店铺不存在或已停用')
        const count = await tx.generation.count({ where: { shopId: input.shopId, status: 'pending' } })
        if (count >= 2) throw new LedgerError('当前店铺已有两个生成任务')
        throw new LedgerError('点数不足')
      }
      const shop = await tx.shop.findUniqueOrThrow({ where: { id: input.shopId } })
      return tx.generation.create({
        data: { ...input, id: randomUUID(), creditsCost: shop.isVip ? price.vip : price.regular },
      })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await db.generation.findUnique({ where: key })
      if (duplicate && matches(duplicate, input)) return duplicate
      if (duplicate) throw new LedgerError('重复请求的参数不一致')
    }
    throw error
  }
}

export async function finishGeneration(
  db: PrismaClient,
  generationId: string,
  result: { success: true; outputPath: string; apiCostCents?: number } | { success: false; reason: string },
  expiredBefore?: Date,
): Promise<boolean> {
  return transact(db, async tx => {
    const update = await tx.generation.updateMany({
      where: {
        id: generationId,
        status: 'pending',
        ...(expiredBefore ? {
          OR: [
            { workerStartedAt: { lte: expiredBefore } },
            { workerStartedAt: null, createdAt: { lte: expiredBefore } },
          ],
        } : {}),
      },
      data: result.success
        ? { status: 'success', outputPath: required(result.outputPath, '效果图片', 500), apiCostCents: result.apiCostCents, finishedAt: new Date() }
        : { status: 'refunded', failReason: result.reason.slice(0, 500), finishedAt: new Date() },
    })
    if (!update.count) return false
    if (!result.success) {
      const record = await tx.generation.findUniqueOrThrow({ where: { id: generationId } })
      await tx.shop.update({ where: { id: record.shopId }, data: { credits: { increment: record.creditsCost } } })
    }
    return true
  })
}

export async function refundExpired(db: PrismaClient, timeoutMs = 180_000): Promise<number> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new LedgerError('超时时间无效')
  const expiredBefore = new Date(Date.now() - timeoutMs)
  const expired = await db.generation.findMany({
    where: {
      status: 'pending',
      OR: [
        { workerStartedAt: { lte: expiredBefore } },
        { workerStartedAt: null, createdAt: { lte: expiredBefore } },
      ],
    },
    select: { id: true },
  })
  let refunded = 0
  for (const task of expired) {
    if (await finishGeneration(db, task.id, { success: false, reason: '生成超时，点数已退回' }, expiredBefore)) refunded++
  }
  return refunded
}

/**
 * 价格与审计写在同一事务，复用 transact() 的 writeTail 串行与重试。
 */
export async function setPrices(
  db: PrismaClient,
  input: { adminId: string; operatorName: string; prices: PriceTable },
): Promise<void> {
  const checked = validatePriceTable(input.prices)
  if (!checked.ok) throw new LedgerError(checked.message)
  const value = JSON.stringify(checked.prices)
  await transact(db, async tx => {
    await requireActor(tx, input.adminId, ['admin'])
    const before = await readConfigRow(tx, CONFIG_KEYS.prices)
    await tx.systemConfig.upsert({
      where: { key: CONFIG_KEYS.prices },
      update: { value, updatedBy: input.operatorName },
      create: { key: CONFIG_KEYS.prices, value, updatedBy: input.operatorName },
    })
    await tx.configAudit.create({
      data: {
        configKey: CONFIG_KEYS.prices,
        action: 'prices.update',
        beforeJson: before?.value ?? JSON.stringify(DEFAULT_PRICES),
        afterJson: value,
        operatorId: input.adminId,
        operatorName: input.operatorName,
      },
    })
  })
}

/** 删除配置行即回到 DEFAULT_PRICES，不写入默认价格行以免破坏回退链。 */
export async function resetPrices(
  db: PrismaClient,
  input: { adminId: string; operatorName: string },
): Promise<void> {
  await transact(db, async tx => {
    await requireActor(tx, input.adminId, ['admin'])
    const before = await readConfigRow(tx, CONFIG_KEYS.prices)
    await tx.systemConfig.deleteMany({ where: { key: CONFIG_KEYS.prices } })
    await tx.configAudit.create({
      data: {
        configKey: CONFIG_KEYS.prices,
        action: 'prices.reset',
        beforeJson: before?.value ?? JSON.stringify(DEFAULT_PRICES),
        afterJson: JSON.stringify(DEFAULT_PRICES),
        operatorId: input.adminId,
        operatorName: input.operatorName,
      },
    })
  })
}

export async function setProviderSettings(
  db: PrismaClient,
  input: {
    adminId: string
    operatorName: string
    apiBaseUrl: unknown
    imageModel: unknown
    textModel: unknown
    apiKey: unknown
  },
): Promise<void> {
  const checked = validateProviderInput(input)
  if (!checked) throw new LedgerError('接口地址、模型名称或 API Key 格式无效')

  await transact(db, async tx => {
    await requireActor(tx, input.adminId, ['admin'])
    const current = await getProviderConfig(tx)
    const beforeValue = JSON.stringify({
      apiBaseUrl: current.apiBaseUrl,
      imageModel: current.imageModel,
      textModel: current.textModel,
      apiKeyConfigured: current.hasApiKey,
    })
    let config
    try {
      config = await makeStoredProviderConfig(tx, checked)
    } catch (error) {
      if (error instanceof Error && error.message === '请重新填写 API Key 以修复配置') {
        throw new LedgerError(error.message)
      }
      throw error
    }
    const value = JSON.stringify(config)

    await tx.systemConfig.upsert({
      where: { key: CONFIG_KEYS.provider },
      update: { value, updatedBy: input.operatorName },
      create: { key: CONFIG_KEYS.provider, value, updatedBy: input.operatorName },
    })
    await tx.configAudit.create({
      data: {
        configKey: CONFIG_KEYS.provider,
        action: 'provider.update',
        beforeJson: beforeValue,
        afterJson: providerConfigAuditValue(config),
        operatorId: input.adminId,
        operatorName: input.operatorName,
      },
    })
  })
}

export async function clearProviderApiKey(
  db: PrismaClient,
  input: { adminId: string; operatorName: string },
): Promise<void> {
  await transact(db, async tx => {
    await requireActor(tx, input.adminId, ['admin'])
    const current = await getProviderConfig(tx)
    if (!current.configValid) throw new LedgerError('接口配置无效，请先保存有效的接口设置')
    if (!current.hasApiKey) return

    const config = createStoredProviderConfig(current.apiBaseUrl, current.imageModel, current.textModel)
    const value = JSON.stringify(config)
    const beforeValue = JSON.stringify({
      apiBaseUrl: current.apiBaseUrl,
      imageModel: current.imageModel,
      textModel: current.textModel,
      apiKeyConfigured: current.hasApiKey,
    })
    await tx.systemConfig.upsert({
      where: { key: CONFIG_KEYS.provider },
      update: { value, updatedBy: input.operatorName },
      create: { key: CONFIG_KEYS.provider, value, updatedBy: input.operatorName },
    })
    await tx.configAudit.create({
      data: {
        configKey: CONFIG_KEYS.provider,
        action: 'provider.key.clear',
        beforeJson: beforeValue,
        afterJson: providerConfigAuditValue(config),
        operatorId: input.adminId,
        operatorName: input.operatorName,
      },
    })
  })
}
