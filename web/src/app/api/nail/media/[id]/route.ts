import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { db } from '@/lib/nail/db'
import { readStoredFile, readStoredPreview } from '@/lib/nail/storage'
import { readStyleReference } from '@/lib/nail/image-provider'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user?.shopId) return new NextResponse('Unauthorized', { status: 401 })
  const { id } = await context.params
  const kind = new URL(request.url).searchParams.get('kind') || 'result'
  const generation = await db.generation.findFirst({
    where: { id, shopId: user.shopId, ...(user.role === 'staff' ? { userId: user.id } : {}) },
    select: { outputPath: true, inputHandPath: true, inputStylePath: true, deletedAt: true },
  })
  if (!generation || generation.deletedAt) return new NextResponse('Not found', { status: 404 })
  const path = kind === 'hand' ? generation.inputHandPath : kind === 'style' ? generation.inputStylePath : generation.outputPath
  if (!path) return new NextResponse('Not found', { status: 404 })
  try {
    const download = new URL(request.url).searchParams.get('download') === '1'
    const preview = kind !== 'hand' && kind !== 'style' && !download
    const bytes = new Uint8Array(await (kind === 'style' ? readStyleReference(path) : preview ? readStoredPreview(path) : readStoredFile(path)))
    const headers = new Headers({
      'Content-Type': preview ? 'image/webp' : 'image/png',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    if (download) {
      headers.set('Content-Disposition', `attachment; filename="nail-preview-${id}.png"`)
    }
    return new NextResponse(bytes, { headers })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
