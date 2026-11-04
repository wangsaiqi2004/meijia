import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { db } from './db'

const COOKIE_NAME = 'nail_session'
const SESSION_DAYS = 14
const secureCookie = process.env.COOKIE_SECURE === 'true' ||
  (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production')

export type NailUser = {
  id: string
  username: string
  role: string
  shopId: string | null
  shopName: string | null
}

export async function createSession(userId: string): Promise<void> {
  const id = randomBytes(32).toString('hex')
  await db.session.create({
    data: { id, userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
  })
  const jar = await cookies()
  jar.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  })
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const id = jar.get(COOKIE_NAME)?.value
  if (id) await db.session.deleteMany({ where: { id } })
  jar.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/', maxAge: 0 })
}

export async function getCurrentUser(): Promise<NailUser | null> {
  const jar = await cookies()
  const id = jar.get(COOKIE_NAME)?.value
  if (!id) return null
  const session = await db.session.findUnique({
    where: { id },
    include: { user: { include: { shop: true } } },
  })
  if (!session || session.expiresAt <= new Date() || session.user.status !== 'active' ||
      (session.user.shopId && session.user.shop?.status !== 'active')) {
    await db.session.deleteMany({ where: { id } })
    return null
  }
  return {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role,
    shopId: session.user.shopId,
    shopName: session.user.shop?.name ?? null,
  }
}

export async function requireUser(roles?: string[]): Promise<NailUser> {
  const user = await getCurrentUser()
  if (!user || (roles && !roles.includes(user.role))) {
    throw new Response('Unauthorized', { status: 401 })
  }
  return user
}

export async function login(username: string, password: string): Promise<NailUser | null> {
  const user = await db.user.findUnique({ where: { username: username.trim() }, include: { shop: true } })
  if (!user || user.status !== 'active' || (user.shopId && user.shop?.status !== 'active') ||
      !(await bcrypt.compare(password, user.passwordHash))) return null
  await createSession(user.id)
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    shopId: user.shopId,
    shopName: user.shop?.name ?? null,
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export function newIdempotencyKey(): string {
  return randomUUID()
}
