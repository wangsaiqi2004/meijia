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
    <main className="grid min-h-dvh bg-[#173b32] lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
      <section className="relative hidden min-h-dvh overflow-hidden px-14 py-12 text-[#f3f5f2] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-25" aria-hidden="true">
          <div className="absolute left-[15%] top-[18%] h-[580px] w-[400px] -rotate-12 rounded-[48%] border border-[#c8dac9]/40" />
          <div className="absolute left-[20%] top-[23%] h-[520px] w-[340px] -rotate-12 rounded-[48%] border border-[#c8dac9]/35" />
          <div className="absolute left-[25%] top-[28%] h-[460px] w-[280px] -rotate-12 rounded-[48%] border border-[#c8dac9]/30" />
          <div className="absolute bottom-[-10%] right-[-5%] size-[540px] rounded-full border border-[#f0a887]/40" />
        </div>
        <div className="relative flex items-center gap-3"><span className="grid size-10 place-items-center rounded-md bg-[#f0a887] text-[#173b32]"><Scissors className="size-5" /></span><span className="text-sm font-bold tracking-[0.1em]">NAIL NOTE</span></div>
        <div className="relative max-w-[600px] pb-14">
          <p className="mb-5 text-[11px] font-semibold tracking-[0.2em] text-[#c2d7ca]">DESIGNED FOR REAL SALON WORK</p>
          <h1 className="max-w-[560px] text-[42px] leading-[1.22] font-semibold">让顾客先看见<br />适合自己的那一款。</h1>
          <p className="mt-6 max-w-[440px] text-[15px] leading-7 text-[#c4d3ca]">保留真实手部特征，预览普通美甲师也能落地的设计。</p>
        </div>
        <p className="relative text-xs text-[#a9c0b2]">店铺专属工作区 · 仅授权账号可进入</p>
      </section>

      <section className="flex min-h-dvh items-center justify-center bg-[#f3f5f2] px-5 py-10 sm:px-8">
        <div className="w-full max-w-[408px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden"><span className="grid size-10 place-items-center rounded-md bg-[#173b32] text-white"><Scissors className="size-5" /></span><span className="text-sm font-bold tracking-[0.1em]">NAIL NOTE</span></div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8b9b90]">SALON STUDIO</p>
          <h2 className="mt-3 text-[30px] leading-tight font-semibold text-[#20362d]">登录工作区</h2>
          <p className="mt-2 text-sm leading-6 text-[#718077]">使用店铺分配的账号和密码进入。</p>

          <div className="mt-8 space-y-5">
            <label className="block text-sm font-medium text-[#35483e]" htmlFor="username">账号
              <input id="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} onKeyDown={event => event.key === 'Enter' && void submit()} className="mt-2 h-12 w-full rounded-md border border-[#d8e0d8] bg-white px-3.5 text-[16px] outline-none transition placeholder:text-[#abb6ae] focus:border-[#668b76] focus:ring-2 focus:ring-[#668b76]/15" placeholder="请输入账号" />
            </label>
            <label className="block text-sm font-medium text-[#35483e]" htmlFor="password">密码
              <span className="relative mt-2 block">
                <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && void submit()} className="h-12 w-full rounded-md border border-[#d8e0d8] bg-white px-3.5 pr-12 text-[16px] outline-none transition placeholder:text-[#abb6ae] focus:border-[#668b76] focus:ring-2 focus:ring-[#668b76]/15" placeholder="请输入密码" />
                <button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#809087]">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </span>
            </label>
            <button type="button" disabled={submitting} onClick={() => void submit()} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#173b32] px-4 text-sm font-semibold text-white transition hover:bg-[#245344] disabled:cursor-wait disabled:opacity-60">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}{submitting ? '正在登录…' : '进入工作区'}
            </button>
          </div>
          <p className="mt-7 text-center text-xs text-[#94a097]">没有账号？请联系平台管理员开通</p>
        </div>
      </section>
    </main>
  )
}
