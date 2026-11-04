import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { PrismaClient } from '@prisma/client'
import {
  createRedeemCodes,
  finishGeneration,
  LedgerError,
  manualCredit,
  redeemCode,
  refundExpired,
  reserveGeneration,
} from '../src/lib/nail/ledger'

const db = new PrismaClient()
const adminId = randomUUID()

before(async () => {
  await db.user.create({
    data: { id: adminId, username: `admin-${adminId}`, passwordHash: 'test-only', role: 'admin' },
  })
})

after(async () => {
  await db.$disconnect()
})

async function fixture(vip = false) {
  const id = randomUUID()
  const shop = await db.shop.create({ data: { id, name: '测试店', isVip: vip } })
  const user = await db.user.create({
    data: { username: `owner-${id}`, passwordHash: 'test-only', role: 'owner', shopId: id },
  })
  return { shop, user }
}

async function credit(shopId: string, points: number, orderId = randomUUID()) {
  await manualCredit(db, { shopId, points, operatorId: adminId, remark: '测试充值', orderId })
}

function request(shopId: string, userId: string, key: string, size: '1k' | '4k' = '1k') {
  return {
    shopId, userId, idempotencyKey: key, size,
    mode: 'preview' as const, styleName: '奶茶猫眼', extraPrompt: '日常通勤',
    inputHandPath: 'hand.png', inputStylePath: 'style.png',
  }
}

test('manual credit is transactional on duplicate order', async () => {
  const { shop } = await fixture()
  const orderId = randomUUID()
  await credit(shop.id, 100, orderId)
  await assert.rejects(credit(shop.id, 50, orderId))
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 100)
  assert.equal(await db.rechargeOrder.count({ where: { shopId: shop.id } }), 1)
})

test('concurrent redeem is credited exactly once', async () => {
  const { shop, user } = await fixture()
  const [code] = await createRedeemCodes(db, { points: 30, count: 1, operatorId: adminId })
  const outcomes = await Promise.allSettled(
    Array.from({ length: 5 }, () => redeemCode(db, { shopId: shop.id, operatorId: user.id, code })),
  )
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 30)
  assert.equal(await db.rechargeOrder.count({ where: { shopId: shop.id, channel: 'code' } }), 1)
})

test('same request reserves only once and cannot change parameters', async () => {
  const { shop, user } = await fixture()
  await credit(shop.id, 100)
  const input = request(shop.id, user.id, randomUUID())
  const first = await reserveGeneration(db, input)
  assert.equal((await reserveGeneration(db, input)).id, first.id)
  await assert.rejects(reserveGeneration(db, { ...input, size: '4k' }), LedgerError)
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 90)
})

test('simultaneous identical submissions return the same task even at zero balance', async () => {
  const { shop, user } = await fixture()
  await credit(shop.id, 10)
  const input = request(shop.id, user.id, randomUUID())
  const tasks = await Promise.all(Array.from({ length: 5 }, () => reserveGeneration(db, input)))
  assert.equal(new Set(tasks.map(task => task.id)).size, 1)
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 0)
  assert.equal(await db.generation.count({ where: { shopId: shop.id } }), 1)
})

test('concurrent reservations cannot exceed two active tasks', async () => {
  const { shop, user } = await fixture()
  await credit(shop.id, 100)
  const outcomes = await Promise.allSettled(
    Array.from({ length: 4 }, () => reserveGeneration(db, request(shop.id, user.id, randomUUID()))),
  )
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 2)
  assert.equal(await db.generation.count({ where: { shopId: shop.id, status: 'pending' } }), 2)
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 80)
})

test('VIP pricing, failure, timeout and late success preserve balance', async () => {
  const { shop, user } = await fixture(true)
  await credit(shop.id, 30)
  const first = await reserveGeneration(db, request(shop.id, user.id, randomUUID(), '4k'))
  assert.equal(first.creditsCost, 15)
  assert.equal(await finishGeneration(db, first.id, { success: false, reason: '上游失败' }), true)
  assert.equal(await finishGeneration(db, first.id, { success: false, reason: '重复退款' }), false)
  const second = await reserveGeneration(db, request(shop.id, user.id, randomUUID(), '4k'))
  await db.generation.update({ where: { id: second.id }, data: { createdAt: new Date(Date.now() - 180_000) } })
  assert.ok(await refundExpired(db) >= 1)
  assert.equal((await db.generation.findUniqueOrThrow({ where: { id: second.id } })).status, 'refunded')
  assert.equal(await finishGeneration(db, second.id, { success: true, outputPath: 'late.png' }), false)
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 30)
})

test('insufficient balance rejects without creating a task', async () => {
  const { shop, user } = await fixture()
  await assert.rejects(reserveGeneration(db, request(shop.id, user.id, randomUUID())), /点数不足/)
  assert.equal(await db.generation.count({ where: { shopId: shop.id } }), 0)
})

test('actors cannot charge or redeem for another shop or use admin functions', async () => {
  const first = await fixture()
  const second = await fixture()
  await credit(first.shop.id, 30)
  const [code] = await createRedeemCodes(db, { points: 20, count: 1, operatorId: adminId })
  await assert.rejects(
    reserveGeneration(db, request(first.shop.id, second.user.id, randomUUID())), /没有权限/,
  )
  await assert.rejects(
    redeemCode(db, { shopId: first.shop.id, operatorId: second.user.id, code }), /没有权限/,
  )
  await assert.rejects(
    manualCredit(db, {
      shopId: second.shop.id, points: 100, operatorId: second.user.id, remark: '尝试充值', orderId: randomUUID(),
    }), /没有权限/,
  )
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: first.shop.id } })).credits, 30)
  assert.equal((await db.redeemCode.findUniqueOrThrow({ where: { code } })).usedAt, null)
})
