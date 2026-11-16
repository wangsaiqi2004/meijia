import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { db } from '@/lib/nail/db'
import { readStoredFile } from '@/lib/nail/storage'
import {
  createRedeemCodes,
  createShopAccount,
  LedgerError,
  manualCredit,
  clearProviderApiKey,
  resetPrices,
  setProviderSettings,
  setPrices,
  setShopStatus,
  setShopVip,
} from '@/lib/nail/ledger'
import { getPricingConfig, getPublicProviderSettings } from '@/lib/nail/system-config'
import { validatePriceTable } from '@/lib/nail/contracts'

export async function GET() {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return NextResponse.json({ error: '没有管理权限' }, { status: 403 })
  const [shops, today, totals, styles, codes, shopUsage, config, provider] = await Promise.all([
    db.shop.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, generations: true } } },
    }),
    db.generation.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    db.generation.groupBy({ by: ['status'], _count: { _all: true }, _sum: { apiCostCents: true } }),
    db.styleLibrary.findMany({ where: { shopId: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.redeemCode.count({ where: { usedAt: null } }),
    db.generation.groupBy({
      by: ['shopId', 'status'],
      _count: { _all: true },
      _sum: { creditsCost: true, apiCostCents: true },
    }),
    getPricingConfig(),
    getPublicProviderSettings(),
  ])
  return NextResponse.json({
    shops: shops.map(shop => {
      const usage = shopUsage.filter(row => row.shopId === shop.id)
      return {
        ...shop,
        failed: usage.find(row => row.status === 'refunded')?._count._all || 0,
        consumed: usage.filter(row => row.status === 'success').reduce((sum, row) => sum + (row._sum.creditsCost || 0), 0),
        apiCostCents: usage.reduce((sum, row) => sum + (row._sum.apiCostCents || 0), 0),
      }
    }),
    today, totals, styles, unusedCodes: codes, config: { ...config, provider },
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return NextResponse.json({ error: '没有管理权限' }, { status: 403 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const action = String(body?.action || '')
  try {
    if (action === 'create-shop') {
      const result = await createShopAccount(db, {
        adminId: user.id,
        name: String(body?.name || ''),
        city: String(body?.city || ''),
        contact: String(body?.contact || ''),
        username: String(body?.username || ''),
        password: String(body?.password || ''),
        initialCredits: Number(body?.initialCredits || 0),
      })
      return NextResponse.json(result)
    }
    if (action === 'manual-credit') {
      const orderId = String(body?.orderId || '')
      if (!/^[a-f0-9-]{16,80}$/.test(orderId)) throw new LedgerError('缺少充值请求编号')
      await manualCredit(db, {
        shopId: String(body?.shopId || ''),
        points: Number(body?.points),
        operatorId: user.id,
        orderId,
        remark: String(body?.remark || ''),
      })
      return NextResponse.json({ ok: true })
    }
    if (action === 'vip') {
      await setShopVip(db, { adminId: user.id, shopId: String(body?.shopId || ''), isVip: Boolean(body?.isVip) })
      return NextResponse.json({ ok: true })
    }
    if (action === 'status') {
      await setShopStatus(db, {
        adminId: user.id,
        shopId: String(body?.shopId || ''),
        status: body?.status === 'disabled' ? 'disabled' : 'active',
      })
      return NextResponse.json({ ok: true })
    }
    if (action === 'redeem-codes') {
      const points = Number(body?.points)
      const count = Number(body?.count)
      const codes = await createRedeemCodes(db, { points, count, operatorId: user.id })
      return NextResponse.json({ codes })
    }
    if (action === 'save-style') {
      const id = String(body?.id || '')
      if (id && await db.styleLibrary.findFirst({ where: { id, shopId: { not: null } } })) throw new LedgerError('店铺专属款式由店老板管理')
      const name = String(body?.name || '').trim()
      const category = String(body?.category || '').trim()
      const imagePath = String(body?.imagePath || '').trim()
      if (!name || name.length > 80 || !category || category.length > 40 || !imagePath || imagePath.length > 500) {
        throw new LedgerError('款式信息无效')
      }
      if (!/^(swatch:[a-z0-9-]+|public:styles\/[a-z0-9-]+\.png|uploads\/library\/shared\/[a-z0-9-]+\.png)$/.test(imagePath)) {
        throw new LedgerError('请上传有效的款式图片')
      }
      if (imagePath.startsWith('uploads/')) await readStoredFile(imagePath)
      const style = await db.styleLibrary.upsert({
        where: { id: id || `style-${crypto.randomUUID()}` },
        update: {
          name, category, imagePath, tags: String(body?.tags || '').slice(0, 200),
          enabled: body?.enabled !== false, sortOrder: Math.max(0, Number(body?.sortOrder) || 0),
        },
        create: {
          id: id || `style-${crypto.randomUUID()}`,
          name, category, imagePath, tags: String(body?.tags || '').slice(0, 200),
          enabled: body?.enabled !== false, sortOrder: Math.max(0, Number(body?.sortOrder) || 0),
        },
      })
      return NextResponse.json({ style })
    }
    if (action === 'delete-style') {
      await db.styleLibrary.deleteMany({ where: { id: String(body?.id || ''), shopId: null } })
      return NextResponse.json({ ok: true })
    }
    if (action === 'save-prices') {
      const checked = validatePriceTable(body?.prices)
      if (!checked.ok) throw new LedgerError(checked.message)
      await setPrices(db, { adminId: user.id, operatorName: user.username, prices: checked.prices })
      return NextResponse.json({ ok: true })
    }
    if (action === 'reset-prices') {
      await resetPrices(db, { adminId: user.id, operatorName: user.username })
      return NextResponse.json({ ok: true })
    }
    if (action === 'save-provider-settings') {
      await setProviderSettings(db, {
        adminId: user.id,
        operatorName: user.username,
        apiBaseUrl: body?.apiBaseUrl,
        imageModel: body?.imageModel,
        textModel: body?.textModel,
        apiKey: body?.apiKey,
      })
      return NextResponse.json({ ok: true })
    }
    if (action === 'clear-provider-key') {
      await clearProviderApiKey(db, { adminId: user.id, operatorName: user.username })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch (error) {
    // 内部异常固定文案，避免 Prisma 报错把请求体或密钥带进响应。
    const status = error instanceof LedgerError ? 400 : 500
    const message = error instanceof LedgerError ? error.message : '操作失败，请稍后重试'
    return NextResponse.json({ error: message }, { status })
  }
}
