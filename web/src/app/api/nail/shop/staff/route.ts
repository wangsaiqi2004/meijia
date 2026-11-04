import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { db } from '@/lib/nail/db'
import { createStaffAccount, LedgerError } from '@/lib/nail/ledger'

export async function GET() {
  const user = await getCurrentUser()
  if (user?.role !== 'owner' || !user.shopId) return NextResponse.json({ error: '没有管理权限' }, { status: 403 })
  const staff = await db.user.findMany({
    where: { shopId: user.shopId, role: 'staff' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, username: true, status: true, createdAt: true },
  })
  return NextResponse.json({ staff })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (user?.role !== 'owner' || !user.shopId) return NextResponse.json({ error: '没有管理权限' }, { status: 403 })
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null
  try {
    await createStaffAccount(db, {
      ownerId: user.id,
      shopId: user.shopId,
      username: String(body?.username || ''),
      password: String(body?.password || ''),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建店员失败' }, { status: error instanceof LedgerError ? 400 : 500 })
  }
}
