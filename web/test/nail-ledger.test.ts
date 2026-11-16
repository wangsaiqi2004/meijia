import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { PrismaClient } from '@prisma/client'
import { addShopStyle, changeShopStyle, listShopStyles, shopStyleScope } from '../src/lib/nail/shop-styles'
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
  // 共享库可能被上一次调试预置了价格行，先清掉以免污染默认扣点断言。
  await db.systemConfig.deleteMany({ where: { key: 'generation_prices' } })
  await db.configAudit.deleteMany({ where: { configKey: 'generation_prices' } })
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
  await db.generation.update({ where: { id: second.id }, data: { createdAt: new Date(Date.now() - 240_000) } })
  assert.ok(await refundExpired(db) >= 1)
  assert.equal((await db.generation.findUniqueOrThrow({ where: { id: second.id } })).status, 'refunded')
  assert.equal(await finishGeneration(db, second.id, { success: true, outputPath: 'late.png' }), false)
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 30)
})

test('timeout uses worker start time so an active image request is not refunded early', async () => {
  const { shop, user } = await fixture()
  await credit(shop.id, 100)
  const task = await reserveGeneration(db, request(shop.id, user.id, randomUUID()))
  await db.generation.update({
    where: { id: task.id },
    data: { createdAt: new Date(Date.now() - 240_000), workerStartedAt: new Date() },
  })
  await refundExpired(db)
  assert.equal((await db.generation.findUniqueOrThrow({ where: { id: task.id } })).status, 'pending')
  assert.equal(await finishGeneration(db, task.id, { success: true, outputPath: 'completed.png' }), true)
  assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 90)
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

test('shop owners can hide and restore builtin styles without affecting another shop', async () => {
  const { shop: first, user: firstOwner } = await fixture()
  const { shop: second } = await fixture()
  const styleId = randomUUID()
  await db.styleLibrary.create({
    data: { id: styleId, name: '测试内置款', category: '猫眼', imagePath: 'public:styles/style-cat-eye.png' },
  })
  try {
    assert.ok((await listShopStyles(db, first.id)).some(style => style.id === styleId))
    await changeShopStyle(db, { userId: firstOwner.id, shopId: first.id, styleId })
    await changeShopStyle(db, { userId: firstOwner.id, shopId: first.id, styleId })
    assert.equal((await listShopStyles(db, first.id)).some(style => style.id === styleId), false)
    assert.equal((await listShopStyles(db, first.id, true)).find(style => style.id === styleId)?.hidden, true)
    assert.ok((await listShopStyles(db, second.id)).some(style => style.id === styleId))
    assert.equal(await db.styleLibrary.findFirst({ where: { id: styleId, ...shopStyleScope(first.id) } }), null)
    await changeShopStyle(db, { userId: firstOwner.id, shopId: first.id, styleId, restore: true })
    assert.ok((await listShopStyles(db, first.id)).some(style => style.id === styleId))
  } finally {
    await db.styleLibrary.deleteMany({ where: { id: styleId } })
  }
})

test('shop-specific styles remain isolated and existing images survive removal', async () => {
  const { shop, user } = await fixture()
  const imagePath = `uploads/library/${shop.id}/123456-${randomUUID()}.png`
  const style = await addShopStyle(db, {
    userId: user.id, shopId: shop.id, name: '本店奶茶猫眼', category: '猫眼', tags: '短甲', imagePath,
  })
  assert.ok((await listShopStyles(db, shop.id)).some(row => row.id === style.id))
  const other = await fixture()
  assert.equal((await listShopStyles(db, other.shop.id)).some(row => row.id === style.id), false)
  assert.equal(await db.styleLibrary.findFirst({ where: { id: style.id, ...shopStyleScope(other.shop.id) } }), null)
  await changeShopStyle(db, { userId: user.id, shopId: shop.id, styleId: style.id })
  assert.equal((await listShopStyles(db, shop.id)).some(row => row.id === style.id), false)
  assert.equal((await db.styleLibrary.findUniqueOrThrow({ where: { id: style.id } })).imagePath, imagePath)
  assert.equal((await listShopStyles(db, shop.id, true)).find(row => row.id === style.id)?.hidden, true)
  await changeShopStyle(db, { userId: user.id, shopId: shop.id, styleId: style.id, restore: true })
  assert.ok((await listShopStyles(db, shop.id)).some(row => row.id === style.id))
  await assert.rejects(addShopStyle(db, {
    userId: user.id, shopId: shop.id, name: '跨店款', category: '日常', tags: '',
    imagePath: `uploads/library/${other.shop.id}/123-${randomUUID()}.png`,
  }), /无效/)
})

test('only the active shop owner can manage its saved styles', async () => {
  const { shop, user } = await fixture()
  const { shop: otherShop, user: otherOwner } = await fixture()
  const styleId = randomUUID()
  await db.styleLibrary.create({
    data: { id: styleId, shopId: otherShop.id, name: '他店款', category: '日常', imagePath: `uploads/library/${otherShop.id}/123-${randomUUID()}.png` },
  })
  await assert.rejects(changeShopStyle(db, { userId: user.id, shopId: shop.id, styleId }), /不存在/)
  const staff = await db.user.create({ data: { username: `staff-${randomUUID()}`, shopId: otherShop.id, role: 'staff', passwordHash: 'test-only' } })
  await assert.rejects(changeShopStyle(db, { userId: staff.id, shopId: otherShop.id, styleId }), /店老板/)
  await assert.rejects(changeShopStyle(db, { userId: user.id, shopId: otherShop.id, styleId }), /店老板/)
  await db.shop.update({ where: { id: otherShop.id }, data: { status: 'disabled' } })
  await assert.rejects(changeShopStyle(db, { userId: otherOwner.id, shopId: otherShop.id, styleId }), /店老板/)
})

test('no generation_prices row keeps the default 1K price of 10 points', async () => {
  const { shop, user } = await fixture()
  try {
    await db.systemConfig.deleteMany({ where: { key: 'generation_prices' } })
    await credit(shop.id, 100)
    const task = await reserveGeneration(db, request(shop.id, user.id, randomUUID()))
    assert.equal(task.creditsCost, 10)
    assert.equal((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).credits, 90)
  } finally {
    // 用例内自行清理，避免残留价格行影响其它用例的默认定价。
    await db.systemConfig.deleteMany({ where: { key: 'generation_prices' } })
  }
})
