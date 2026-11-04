import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { DEFAULT_STYLES } from '../src/lib/nail/styles'

const db = new PrismaClient()

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME?.trim()
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminUsername || !adminPassword || adminPassword.length < 12) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 12 characters) before seeding.')
  }
  const adminHash = await bcrypt.hash(adminPassword, 12)
  const existingAdmin = await db.user.findUnique({ where: { username: adminUsername } })
  if (existingAdmin && existingAdmin.role !== 'admin') {
    throw new Error('ADMIN_USERNAME is already assigned to a non-admin account.')
  }
  const admin = existingAdmin || await db.user.create({
    data: { username: adminUsername, passwordHash: adminHash, role: 'admin' },
  })
  for (const [index, style] of DEFAULT_STYLES.entries()) {
    await db.styleLibrary.upsert({
      where: { id: style.id },
      update: {},
      create: { id: style.id, name: style.name, category: style.category, tags: style.tags, imagePath: style.imagePath, enabled: true, sortOrder: index },
    })
  }
  console.log(`Seeded administrator ${admin.username} and ${DEFAULT_STYLES.length} styles.`)
}

main().finally(() => db.$disconnect())
