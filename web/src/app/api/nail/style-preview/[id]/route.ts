import { NextResponse } from 'next/server'
import { db } from '@/lib/nail/db'
import { nailSwatchSvg } from '@/lib/nail/styles'
import { readStyleReference } from '@/lib/nail/image-provider'
import { getCurrentUser } from '@/lib/nail/auth'
import { shopStyleScope } from '@/lib/nail/shop-styles'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (user.role !== 'admin' && !user.shopId) return new NextResponse('Not found', { status: 404 })
  const style = await db.styleLibrary.findFirst({ where: {
    id,
    ...(user.role === 'admin' ? { shopId: null } : shopStyleScope(user.shopId!, user.role === 'owner')),
  } })
  if (!style) return new NextResponse('Not found', { status: 404 })
  try {
    const svg = style.imagePath.startsWith('swatch:')
    const body = svg ? nailSwatchSvg(id) : new Uint8Array(await readStyleReference(style.imagePath))
    return new NextResponse(body, {
      headers: { 'Content-Type': svg ? 'image/svg+xml' : 'image/png', 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch { return new NextResponse('Not found', { status: 404 }) }
}
