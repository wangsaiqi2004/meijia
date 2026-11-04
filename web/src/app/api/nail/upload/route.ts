import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { isShopUpload, readStoredFile, saveUploadedImage } from '@/lib/nail/storage'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user?.shopId) return new NextResponse('Unauthorized', { status: 401 })
  const path = new URL(request.url).searchParams.get('path') || ''
  if (!['hand', 'style', 'library'].some(kind => isShopUpload(path, kind as 'hand' | 'style' | 'library', user.shopId!))) {
    return new NextResponse('Not found', { status: 404 })
  }
  try {
    return new NextResponse(new Uint8Array(await readStoredFile(path)), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' },
    })
  } catch { return new NextResponse('Not found', { status: 404 }) }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || (!user.shopId && user.role !== 'admin')) {
    return NextResponse.json({ error: '请先登录店铺账号' }, { status: 401 })
  }
  const form = await request.formData()
  const file = form.get('file')
  const kind = form.get('kind')
  const allowedKinds = user.role === 'admin' ? ['library'] : user.role === 'owner' ? ['hand', 'style', 'library'] : ['hand', 'style']
  if (!(file instanceof File) || !allowedKinds.includes(String(kind))) {
    return NextResponse.json({ error: '上传参数无效' }, { status: 400 })
  }
  try {
    const path = await saveUploadedImage(file, kind as 'hand' | 'style' | 'library', user.shopId || 'shared')
    return NextResponse.json({ path })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '上传失败' }, { status: 400 })
  }
}
