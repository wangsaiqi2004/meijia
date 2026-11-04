import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { nailPrisma?: PrismaClient }

export const db = globalForPrisma.nailPrisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.nailPrisma = db
