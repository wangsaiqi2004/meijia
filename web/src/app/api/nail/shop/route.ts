import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { db } from '@/lib/nail/db'
import { redeemCode } from '@/lib/nail/ledger'

export async function GET() {
  const user = await getCurrentUser()
  if (!user?.shopId) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const shop = await db.shop.findUnique({ where: { id: user.shopId }, select: { id: true, name: true, city: true, contact: true, credits: true, isVip: true, createdAt: true } })
  const orders = await db.rechargeOrder.findMany({ where: { shopId: user.shopId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, channel: true, credits: true, remark: true, createdAt: true } })
  const generations = await db.generation.findMany({
    where: { shopId: user.shopId }, orderBy: { createdAt: 'desc' }, take: 30,
    select: { id: true, styleName: true, creditsCost: true, status: true, createdAt: true, finishedAt: true, user: { select: { username: true } } },
  })
  const entries = orders.map(order => ({
    id: order.id, credits: order.credits, remark: order.remark, createdAt: order.createdAt,
    channel: order.channel === 'code' ? '兑换码充值' : '管理员充值',
  }))
  for (const item of generations) {
    entries.push({ id: `charge-${item.id}`, credits: -item.creditsCost, remark: `${item.styleName} · ${item.user.username}`, createdAt: item.createdAt, channel: item.status === 'pending' ? '生成冻结' : '生成扣点' })
    if (item.status === 'refunded') entries.push({ id: `refund-${item.id}`, credits: item.creditsCost, remark: `${item.styleName} · 失败退点`, createdAt: item.finishedAt || item.createdAt, channel: '自动退点' })
  }
  entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return NextResponse.json({ shop, orders: entries.slice(0, 30) })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user?.shopId || user.role !== 'owner') return NextResponse.json({ error: '只有店主可以兑换' }, { status: 403 })
  const body = await request.json().catch(() => null) as { code?: string } | null
  try {
    const credits = await redeemCode(db, { shopId: user.shopId, operatorId: user.id, code: String(body?.code || '') })
    return NextResponse.json({ credits })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '兑换失败' }, { status: 400 })
  }
}
