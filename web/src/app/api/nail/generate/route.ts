import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { db } from '@/lib/nail/db'
import { reserveGeneration, refundExpired, LedgerError } from '@/lib/nail/ledger'
import { runNailGeneration } from '@/lib/nail/jobs'
import { buildNailPrompt } from '@/lib/nail/prompt'
import { isShopUpload, readStoredFile } from '@/lib/nail/storage'
import { shopStyleScope } from '@/lib/nail/shop-styles'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || !user.shopId || !['owner', 'staff'].includes(user.role)) return NextResponse.json({ error: '请先登录店铺账号' }, { status: 401 })
  const form = await request.formData()
  const handPath = String(form.get('handPath') || '').trim()
  const styleId = String(form.get('styleId') || '').trim()
  const uploadedStylePath = String(form.get('uploadedStylePath') || '').trim()
  const userStyleName = String(form.get('styleName') || '').trim()
  const extraPrompt = String(form.get('extraPrompt') || '').trim()
  const mode = form.get('mode') === 'promo' ? 'promo' : 'preview'
  const size = form.get('size') === '4k' ? '4k' : '1k'
  const idempotencyKey = String(form.get('idempotencyKey') || '').trim()
  if (!isShopUpload(handPath, 'hand', user.shopId) || !idempotencyKey) {
    return NextResponse.json({ error: '请先上传顾客手部照片' }, { status: 400 })
  }
  let styleName = ''
  let stylePath = ''
  if (uploadedStylePath) {
    if (!isShopUpload(uploadedStylePath, 'style', user.shopId) || !userStyleName || userStyleName.length > 60) {
      return NextResponse.json({ error: '上传的款式图无效' }, { status: 400 })
    }
    styleName = userStyleName
    stylePath = uploadedStylePath
  } else {
    const style = await db.styleLibrary.findFirst({ where: { id: styleId, ...shopStyleScope(user.shopId) } })
    if (!style) return NextResponse.json({ error: '请选择有效的款式' }, { status: 400 })
    styleName = style.name
    stylePath = style.imagePath
  }
  let filtered = false
  try {
    await readStoredFile(handPath)
    if (uploadedStylePath) await readStoredFile(uploadedStylePath)
    await refundExpired(db)
    const prompt = await buildNailPrompt({ mode, styleName, extraPrompt, size })
    filtered = prompt.filtered
    const generation = await reserveGeneration(db, {
      shopId: user.shopId,
      userId: user.id,
      idempotencyKey,
      mode,
      styleName,
      extraPrompt: prompt.extraPrompt,
      size,
      inputHandPath: handPath,
      inputStylePath: stylePath,
    })
    if (generation.status !== 'pending') return NextResponse.json({ id: generation.id, status: generation.status, filtered })
    const claimed = await db.generation.updateMany({
      where: { id: generation.id, status: 'pending', workerStartedAt: null },
      data: { workerStartedAt: new Date() },
    })
    if (claimed.count) {
      after(() => runNailGeneration({
        id: generation.id,
        handPath,
        stylePath,
        prompt: prompt.prompt,
        size,
        styleName,
        extraPrompt: prompt.extraPrompt,
        mode,
      }))
    }
    return NextResponse.json({ id: generation.id, status: 'pending', filtered })
  } catch (error) {
    const status = error instanceof LedgerError ? 400 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : '生成失败' }, { status })
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user?.shopId || !['owner', 'staff'].includes(user.role)) return NextResponse.json({ error: '未登录' }, { status: 401 })
  await refundExpired(db)
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少任务编号' }, { status: 400 })
  const generation = await db.generation.findFirst({
    where: { id, shopId: user.shopId, deletedAt: null, ...(user.role === 'staff' ? { userId: user.id } : {}) },
    select: { id: true, styleName: true, mode: true, size: true, creditsCost: true, status: true, failReason: true, outputPath: true, notesJson: true, createdAt: true, finishedAt: true, inputHandPath: true, inputStylePath: true, extraPrompt: true },
  })
  if (!generation) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  return NextResponse.json({ generation: { ...generation, notes: generation.notesJson ? JSON.parse(generation.notesJson) : null } })
}
