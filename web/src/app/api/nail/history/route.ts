import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { db } from '@/lib/nail/db'

export async function GET() {
  const user = await getCurrentUser()
  if (!user?.shopId || !['owner', 'staff'].includes(user.role)) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const items = await db.generation.findMany({
    where: { shopId: user.shopId, deletedAt: null, ...(user.role === 'owner' ? {} : { userId: user.id }) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, styleName: true, mode: true, size: true, creditsCost: true, status: true, failReason: true, outputPath: true, createdAt: true },
  })
  return NextResponse.json({ items })
}
