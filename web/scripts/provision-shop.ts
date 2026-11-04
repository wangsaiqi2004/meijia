import { PrismaClient } from '@prisma/client'
import { createShopAccount } from '../src/lib/nail/ledger'

const db = new PrismaClient()
try {
  const admin = await db.user.findUniqueOrThrow({ where: { username: process.env.ADMIN_USERNAME } })
  const username = process.env.OWNER_USERNAME || 'salon'
  if (!await db.user.findUnique({ where: { username } })) {
    if (!process.env.OWNER_PASSWORD) throw new Error('OWNER_PASSWORD is required.')
    await createShopAccount(db, {
      adminId: admin.id, username, password: process.env.OWNER_PASSWORD,
      name: process.env.SHOP_NAME || '我的美甲店', initialCredits: 100,
    })
  }
  console.log('Owner account is ready.')
} finally { await db.$disconnect() }
