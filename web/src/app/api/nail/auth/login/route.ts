import { NextResponse } from 'next/server'
import { login } from '@/lib/nail/auth'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null
  const username = String(body?.username || '').trim()
  const password = String(body?.password || '')
  if (!username || !password || username.length > 80 || password.length > 200) {
    return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 })
  }
  const user = await login(username, password)
  if (!user) return NextResponse.json({ error: '账号或密码不正确' }, { status: 401 })
  return NextResponse.json({ user })
}
