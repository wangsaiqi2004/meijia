import { NextResponse } from 'next/server'
import { db } from '@/lib/nail/db'
import { getCurrentUser } from '@/lib/nail/auth'
import { addShopStyle, changeShopStyle, listShopStyles, StyleError } from '@/lib/nail/shop-styles'
import { readStoredFile } from '@/lib/nail/storage'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user?.shopId || !['owner', 'staff'].includes(user.role)) return NextResponse.json({ error: '请先登录店铺账号' }, { status: 401 })
  const includeHidden = user.role === 'owner' && new URL(request.url).searchParams.get('manage') === '1'
  const styles = await listShopStyles(db, user.shopId, includeHidden)
  return NextResponse.json({ styles })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user?.shopId || user.role !== 'owner') return NextResponse.json({ error: '仅店老板可管理款式' }, { status: 403 })
  const body = await request.json().catch(() => null)
  try {
    const input = {
      userId: user.id, shopId: user.shopId,
      name: String(body?.name || ''), category: String(body?.category || ''), tags: String(body?.tags || ''),
      imagePath: String(body?.imagePath || ''),
    }
    if (!input.imagePath.startsWith(`uploads/library/${user.shopId}/`)) throw new StyleError('请先上传本店款式图片')
    await readStoredFile(input.imagePath)
    const style = await addShopStyle(db, input)
    return NextResponse.json({ style }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof StyleError ? error.message : '款式保存失败，请重新上传图片' }, { status: 400 })
  }
}

async function update(request: Request, restore: boolean) {
  const user = await getCurrentUser()
  if (!user?.shopId || user.role !== 'owner') return NextResponse.json({ error: '仅店老板可管理款式' }, { status: 403 })
  const body = await request.json().catch(() => null)
  try {
    await changeShopStyle(db, { userId: user.id, shopId: user.shopId, styleId: String(body?.id || ''), restore })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof StyleError ? error.message : '款式更新失败' }, { status: 400 })
  }
}

export async function DELETE(request: Request) { return update(request, false) }
export async function PATCH(request: Request) { return update(request, true) }
