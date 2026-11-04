import { NextResponse } from 'next/server'
import { db } from '@/lib/nail/db'
import { cleanupExpiredUploads, deleteStoredFile } from '@/lib/nail/storage'
import { refundExpired } from '@/lib/nail/ledger'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const refunded = await refundExpired(db)
  if (new URL(request.url).searchParams.get('daily') !== '1') return NextResponse.json({ refunded })
  const cutoff = new Date(Date.now() - 7 * 86_400_000)
  const old = await db.generation.findMany({
    where: { status: { not: 'pending' }, createdAt: { lte: cutoff }, OR: [{ inputHandPath: { not: null } }, { inputStylePath: { not: null } }] },
    select: { id: true, inputHandPath: true, inputStylePath: true },
    take: 500,
  })
  for (const item of old) {
    await db.generation.update({
      where: { id: item.id },
      data: { inputHandPath: null, inputStylePath: null },
    })
    for (const path of [item.inputHandPath, item.inputStylePath]) {
      if (!path || !path.startsWith('uploads/hand/') && !path.startsWith('uploads/style/')) continue
      const refs = await db.generation.count({ where: { OR: [{ inputHandPath: path }, { inputStylePath: path }] } })
      if (!refs) await deleteStoredFile(path)
    }
  }
  const live = await db.generation.findMany({ select: { inputHandPath: true, inputStylePath: true } })
  const protectedPaths = new Set(live.flatMap(item => [item.inputHandPath, item.inputStylePath]).filter((path): path is string => Boolean(path)))
  const deletedOrphans = await cleanupExpiredUploads(7, protectedPaths)
  await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } })
  return NextResponse.json({ refunded, deletedOriginals: old.length, deletedOrphanUploads: deletedOrphans })
}
