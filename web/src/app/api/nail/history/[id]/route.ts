import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/nail/auth'
import { db } from '@/lib/nail/db'
import { deleteStoredFile, readStoredFile } from '@/lib/nail/storage'
import { after } from 'next/server'
import { buildNailPrompt } from '@/lib/nail/prompt'
import { runNailGeneration } from '@/lib/nail/jobs'
import { LedgerError, refundExpired, reserveGeneration } from '@/lib/nail/ledger'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user?.shopId || !['owner', 'staff'].includes(user.role)) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await context.params
  const original = await db.generation.findFirst({
    where: {
      id,
      shopId: user.shopId,
      deletedAt: null,
      ...(user.role === 'staff' ? { userId: user.id } : {}),
    },
    select: { mode: true, styleName: true, extraPrompt: true, size: true, inputHandPath: true, inputStylePath: true },
  })
  if (!original || !original.inputHandPath || !original.inputStylePath) {
    return NextResponse.json({ error: '原始照片已清理或记录不存在，请重新上传照片' }, { status: 404 })
  }
  if (original.size !== '1k' && original.size !== '4k') return NextResponse.json({ error: '原任务尺寸无效' }, { status: 400 })
  try {
    const body = await request.json().catch(() => null)
    const idempotencyKey = String(body?.idempotencyKey || '')
    if (!idempotencyKey || idempotencyKey.length > 128) throw new LedgerError('缺少请求编号')
    await readStoredFile(original.inputHandPath)
    await refundExpired(db)
    const mode = original.mode === 'promo' ? 'promo' : 'preview'
    const size = original.size
    const prompt = await buildNailPrompt({ mode, styleName: original.styleName, extraPrompt: original.extraPrompt, size })
    const generation = await reserveGeneration(db, {
      shopId: user.shopId,
      userId: user.id,
      idempotencyKey,
      mode,
      styleName: original.styleName,
      extraPrompt: prompt.extraPrompt,
      size,
      inputHandPath: original.inputHandPath,
      inputStylePath: original.inputStylePath,
    })
    const claimed = await db.generation.updateMany({
      where: { id: generation.id, status: 'pending', workerStartedAt: null },
      data: { workerStartedAt: new Date() },
    })
    if (claimed.count) {
      after(() => runNailGeneration({
        id: generation.id,
        handPath: original.inputHandPath!,
        stylePath: original.inputStylePath!,
        prompt: prompt.prompt,
        size,
        styleName: original.styleName,
        extraPrompt: prompt.extraPrompt,
        mode,
      }))
    }
    return NextResponse.json({ id: generation.id, status: generation.status, filtered: prompt.filtered })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无法重新生成' },
      { status: error instanceof LedgerError ? 400 : 500 },
    )
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user?.shopId || !['owner', 'staff'].includes(user.role)) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await context.params
  const item = await db.generation.findFirst({
    where: { id, shopId: user.shopId, ...(user.role === 'staff' ? { userId: user.id } : {}) },
    select: { id: true, status: true, inputHandPath: true, inputStylePath: true, outputPath: true },
  })
  if (!item) return NextResponse.json({ error: '记录不存在' }, { status: 404 })
  if (item.status === 'pending') return NextResponse.json({ error: '生成任务完成后才能删除' }, { status: 409 })
  await db.generation.updateMany({
    where: { id, shopId: user.shopId, ...(user.role === 'staff' ? { userId: user.id } : {}) },
    data: { deletedAt: new Date(), inputHandPath: null, inputStylePath: null, outputPath: null },
  })
  const [handRefs, styleRefs] = await Promise.all([
    item.inputHandPath ? db.generation.count({ where: { inputHandPath: item.inputHandPath } }) : 0,
    item.inputStylePath ? db.generation.count({ where: { inputStylePath: item.inputStylePath } }) : 0,
  ])
  await Promise.all([
    handRefs ? Promise.resolve() : deleteStoredFile(item.inputHandPath),
    styleRefs || !item.inputStylePath?.startsWith('uploads/style/') ? Promise.resolve() : deleteStoredFile(item.inputStylePath),
    deleteStoredFile(item.outputPath),
  ])
  return NextResponse.json({ ok: true })
}
