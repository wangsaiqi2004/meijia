import type { Prisma, PrismaClient } from '@prisma/client'
import { isShopUpload } from './storage'

export class StyleError extends Error {}

export function shopStyleScope(shopId: string, includeHidden = false): Prisma.StyleLibraryWhereInput {
  return {
    enabled: true,
    OR: [{ shopId: null }, { shopId }],
    ...(includeHidden ? {} : { hiddenBy: { none: { shopId } } }),
  }
}

export async function listShopStyles(db: PrismaClient, shopId: string, includeHidden = false) {
  const rows = await db.styleLibrary.findMany({
    where: shopStyleScope(shopId, includeHidden),
    include: { hiddenBy: { where: { shopId }, select: { shopId: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(({ hiddenBy, ...style }) => ({ ...style, hidden: hiddenBy.length > 0 }))
}

async function requireOwner(tx: Prisma.TransactionClient, userId: string, shopId: string) {
  const owner = await tx.user.findFirst({
    where: { id: userId, shopId, role: 'owner', status: 'active', shop: { status: 'active' } },
    select: { id: true },
  })
  if (!owner) throw new StyleError('仅店老板可管理本店款式')
}

export async function addShopStyle(db: PrismaClient, input: {
  userId: string; shopId: string; name: string; category: string; tags: string; imagePath: string
}) {
  const name = input.name.trim()
  const category = input.category.trim() || '日常'
  if (!name || name.length > 60 || category.length > 40 || input.tags.length > 200 ||
      !isShopUpload(input.imagePath, 'library', input.shopId)) throw new StyleError('款式名称或图片无效')
  return db.$transaction(async tx => {
    await requireOwner(tx, input.userId, input.shopId)
    return tx.styleLibrary.create({
      data: { shopId: input.shopId, name, category, tags: input.tags.trim(), imagePath: input.imagePath },
    })
  })
}

export async function changeShopStyle(db: PrismaClient, input: {
  userId: string; shopId: string; styleId: string; restore?: boolean
}) {
  return db.$transaction(async tx => {
    await requireOwner(tx, input.userId, input.shopId)
    const style = await tx.styleLibrary.findFirst({ where: { id: input.styleId, ...shopStyleScope(input.shopId, true) } })
    if (!style) throw new StyleError('款式不存在')
    if (input.restore) {
      await tx.shopHiddenStyle.deleteMany({ where: { shopId: input.shopId, styleId: style.id } })
    } else {
      await tx.shopHiddenStyle.upsert({
        where: { shopId_styleId: { shopId: input.shopId, styleId: style.id } },
        create: { shopId: input.shopId, styleId: style.id },
        update: {},
      })
    }
  })
}
