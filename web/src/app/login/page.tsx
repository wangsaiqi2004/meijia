"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LoaderCircle, Scissors } from 'lucide-react'
import { toast } from 'sonner'
import { nailFetch, type NailUser } from '@/lib/nail/client'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!username.trim() || !password) {
      toast.error('请输入账号和密码')
      return
    }
    setSubmitting(true)
    try {
      const { user } = await nailFetch<{ user: NailUser }>('/api/nail/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      router.replace(user.role === 'admin' ? '/admin' : '/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="nail-login grid min-h-dvh bg-[var(--app-page)] lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
      <section className="hidden min-h-dvh flex-col border-r border-[var(--app-border)] bg-white px-12 py-12 lg:flex">
        <div className="flex items-center gap-3 text-[#173b32]"><Scissors className="size-[18px]" /><span className="text-lg font-medium">Nail Note</span></div>
        <div className="my-auto py-12">
          <h1 className="text-[32px] leading-[1.3] font-medium text-[var(--app-ink)]">先看上手效果，再定款式</h1>
          <p className="mt-4 text-sm leading-6 text-[var(--app-secondary)]">用顾客的手部照片，试一款店里的美甲</p>
          <img src="/images/nail-studio-cover.webp" alt="自然窗光下的短甲法式美甲，手边放着裸粉甲油和三色甲片" width={1920} height={1080} fetchPriority="high" className="mt-8 aspect-video w-full object-cover" />
          <p className="mt-3 text-xs text-[var(--app-muted)]">短甲法式 · 场景示意</p>
        </div>
        <p className="text-xs text-[var(--app-muted)]">店铺专属工作区 · 仅授权账号可进入</p>
      </section>

      <section className="flex min-h-dvh items-center justify-center bg-[var(--app-page)] px-5 py-10 sm:px-8">
        <div className="w-full max-w-[408px]">
          <div className="mb-8 flex items-center gap-3 text-[#173b32] lg:hidden"><Scissors className="size-[18px]" /><span className="text-lg font-medium">Nail Note</span></div>
          <img src="/images/nail-studio-cover.webp" alt="自然光下的法式美甲与甲片色卡" width={1920} height={1080} className="mb-8 aspect-[2/1] w-full object-cover lg:hidden" />
          <p className="text-sm font-medium text-[var(--app-secondary)]">美甲工作室</p>
          <h2 className="mt-3 text-[30px] leading-tight font-medium text-[var(--app-ink)]">登录工作区</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-secondary)]">使用店铺分配的账号和密码</p>

          <div className="mt-8 space-y-6">
            <label className="block text-sm font-medium text-[var(--app-ink)]" htmlFor="username">账号
              <input id="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} onKeyDown={event => event.key === 'Enter' && void submit()} className="mt-2 h-12 w-full rounded-md border border-[var(--app-border)] bg-white px-4 text-[16px] outline-none transition placeholder:text-[var(--app-muted)] focus:border-[#668b76] focus:ring-2 focus:ring-[#668b76]/15" placeholder="请输入账号" />
            </label>
            <label className="block text-sm font-medium text-[var(--app-ink)]" htmlFor="password">密码
              <span className="relative mt-2 block">
                <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && void submit()} className="h-12 w-full rounded-md border border-[var(--app-border)] bg-white px-4 pr-12 text-[16px] outline-none transition placeholder:text-[var(--app-muted)] focus:border-[#668b76] focus:ring-2 focus:ring-[#668b76]/15" placeholder="请输入密码" />
                <button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[var(--app-muted)]">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </span>
            </label>
            <button type="button" disabled={submitting} onClick={() => void submit()} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#173b32] px-4 text-sm font-medium text-white transition hover:bg-[#245344] disabled:cursor-wait disabled:opacity-60">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}{submitting ? '正在登录…' : '进入工作区'}
            </button>
          </div>
          <p className="mt-8 text-center text-xs text-[var(--app-muted)]">没有账号？请联系平台管理员开通</p>
        </div>
      </section>
    </main>
  )
}
