import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { db } from '@/lib/nail/db'
import { readStoredFile } from '@/lib/nail/storage'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser()
  if (!user?.shopId) return new NextResponse('Unauthorized', { status: 401 })
  const path = (await context.params).path.join('/')
  const allowed = await db.generation.findFirst({
    where: { shopId: user.shopId, ...(user.role === 'staff' ? { userId: user.id } : {}), OR: [{ outputPath: path }, { inputHandPath: path }, { inputStylePath: path }] },
    select: { id: true },
  })
  if (!allowed) return new NextResponse('Not found', { status: 404 })
  try {
    const buffer = await readStoredFile(path)
    return new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
