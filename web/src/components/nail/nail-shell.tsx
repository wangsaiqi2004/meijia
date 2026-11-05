"use client"

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { History, LogOut, Palette, Scissors, Settings2, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { nailFetch, type NailUser } from '@/lib/nail/client'

const links = [
  { href: '/', label: '开始设计', icon: Palette, roles: ['admin', 'owner', 'staff'] },
  { href: '/history', label: '生成记录', icon: History, roles: ['owner', 'staff'] },
  { href: '/shop', label: '店铺与点数', icon: Store, roles: ['owner', 'staff'] },
  { href: '/admin', label: '管理后台', icon: Settings2, roles: ['admin'] },
]

export function NailShell({ children, user }: { children: React.ReactNode; user: NailUser }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)
  const nav = links.filter(item => item.roles.includes(user.role))

  useEffect(() => {
    setLoggingOut(false)
  }, [pathname])

  async function logout() {
    setLoggingOut(true)
    try {
      await nailFetch('/api/nail/auth/logout', { method: 'POST' })
      router.replace('/login')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退出失败')
      setLoggingOut(false)
    }
  }

  return (
    <div className="nail-app min-h-dvh bg-[var(--app-page)] text-[var(--app-ink)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[var(--app-border)] bg-white px-5 py-8 lg:flex">
        <Link href="/" className="mb-10 flex items-center gap-3 px-3" aria-label="Nail Note 首页">
          <Scissors className="size-[18px] text-[#173b32]" />
          <span><span className="block text-lg font-medium">Nail Note</span><span className="mt-2 block text-xs text-[var(--app-secondary)]">美甲工作室</span></span>
        </Link>

        <div className="mb-2 px-3 text-xs text-[var(--app-muted)]">工作区</div>
        <nav aria-label="主导航" className="flex flex-col gap-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
            return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex h-9 items-center gap-3 rounded px-3 text-sm font-medium transition-colors duration-150 ${active ? 'bg-[var(--app-raised)] text-[#173b32]' : 'text-[var(--app-secondary)] hover:bg-[var(--app-raised)] hover:text-[var(--app-ink)]'}`}><Icon className="size-[18px] shrink-0" />{label}</Link>
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--app-border)] pt-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <span className="grid size-9 shrink-0 place-items-center rounded bg-[var(--app-raised)] text-sm font-medium text-[#365344]">{(user.shopName || '管').slice(0, 1)}</span>
            <span className="min-w-0"><span className="block truncate text-xs font-medium">{user.shopName || '平台管理'}</span><span className="block truncate text-xs text-[var(--app-muted)]">{user.username}</span></span>
          </div>
          <button type="button" disabled={loggingOut} onClick={() => void logout()} className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-xs text-[var(--app-secondary)] hover:bg-[var(--app-raised)] disabled:opacity-50"><LogOut className="size-4" />{loggingOut ? '正在退出…' : '退出登录'}</button>
          <a href="https://github.com/wangsaiqi2004/meijia" target="_blank" rel="noreferrer" className="mt-2 block px-3 text-xs text-[var(--app-muted)]">项目源码与开源声明</a>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-[var(--app-border)] bg-white px-4 lg:hidden">
        <Link href="/" className="flex items-center gap-3">
          <Scissors className="size-[18px] shrink-0 text-[#173b32]" />
          <span className="whitespace-nowrap text-base font-medium">Nail Note</span>
        </Link>
        <span className="max-w-[45%] truncate text-xs text-[var(--app-secondary)]">{user.shopName || user.username}</span>
        <button type="button" aria-label="退出登录" disabled={loggingOut} onClick={() => void logout()} className="grid size-9 place-items-center rounded-md text-[var(--app-secondary)] hover:bg-[var(--app-raised)]"><LogOut className="size-4" /></button>
      </header>

      <main className="mx-auto min-h-[calc(100dvh-56px)] max-w-[1600px] px-4 pb-[calc(92px+env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pt-8 lg:ml-[248px] lg:min-h-dvh lg:px-10 lg:pb-12 lg:pt-10">
        {children}
        <a href="https://github.com/wangsaiqi2004/meijia" target="_blank" rel="noreferrer" className="mt-8 block text-center text-xs text-[var(--app-muted)] lg:hidden">项目源码与开源声明</a>
      </main>

      <nav aria-label="主导航" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[var(--app-border)] bg-white px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] lg:hidden">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded text-xs font-medium ${active ? 'text-[#173b32]' : 'text-[var(--app-muted)]'}`}><Icon className="size-[18px]" />{label}</Link>
        })}
      </nav>
    </div>
  )
}
