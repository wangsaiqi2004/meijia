"use client"

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { History, LogOut, Scissors, Settings2, Sparkles, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { nailFetch, type NailUser } from '@/lib/nail/client'

const links = [
  { href: '/', label: '开始设计', icon: Sparkles, roles: ['admin', 'owner', 'staff'] },
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
    <div className="min-h-dvh bg-[#f3f5f2] text-[#182b26]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[#dfe6df] bg-[#fbfcf9] px-5 py-6 lg:flex">
        <Link href="/" className="mb-9 flex items-center gap-3" aria-label="Nail Note 首页">
          <span className="grid size-10 place-items-center rounded-lg bg-[#173b32] text-white"><Scissors className="size-5" /></span>
          <span><span className="block text-[15px] font-bold tracking-[0.08em]">NAIL NOTE</span><span className="mt-0.5 block text-[10px] tracking-[0.16em] text-[#798b80]">REAL HAND · REAL NAIL</span></span>
        </Link>

        <div className="mb-3 px-3 text-[10px] font-semibold tracking-[0.16em] text-[#98a49c]">工作区</div>
        <nav className="flex flex-col gap-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
            return <Link key={href} href={href} className={`flex h-11 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition ${active ? 'bg-[#e8f0e9] text-[#173b32]' : 'text-[#627269] hover:bg-[#f0f3ef] hover:text-[#20362d]'}`}><Icon className="size-[17px]" />{label}</Link>
          })}
        </nav>

        <div className="mt-auto border-t border-[#e4e9e3] pt-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <span className="grid size-9 place-items-center rounded-full bg-[#f5e5dc] text-sm font-semibold text-[#965f47]">{(user.shopName || '管').slice(0, 1)}</span>
            <span className="min-w-0"><span className="block truncate text-xs font-semibold">{user.shopName || '平台管理'}</span><span className="block truncate text-[11px] text-[#849187]">{user.username}</span></span>
          </div>
          <button type="button" disabled={loggingOut} onClick={() => void logout()} className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-xs text-[#68776e] hover:bg-[#f0f3ef] disabled:opacity-50"><LogOut className="size-4" />{loggingOut ? '正在退出…' : '退出登录'}</button>
          <a href="https://github.com/wangsaiqi2004/meijia" target="_blank" rel="noreferrer" className="mt-2 block px-3 text-[10px] text-[#849187]">项目源码与开源声明</a>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#dfe6df] bg-[#fbfcf9]/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-[#173b32] text-white"><Scissors className="size-4" /></span>
          <span className="text-sm font-bold tracking-[0.07em]">NAIL NOTE</span>
        </Link>
        <span className="max-w-[45%] truncate text-xs text-[#718077]">{user.shopName || user.username}</span>
        <button type="button" aria-label="退出登录" disabled={loggingOut} onClick={() => void logout()} className="grid size-9 place-items-center rounded-md text-[#607168] hover:bg-[#eef2ed]"><LogOut className="size-4" /></button>
      </header>

      <main className="mx-auto min-h-[calc(100dvh-56px)] max-w-[1440px] px-4 pb-[calc(92px+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-7 lg:ml-[248px] lg:min-h-dvh lg:px-9 lg:pb-12 lg:pt-8">
        {children}
        <a href="https://github.com/wangsaiqi2004/meijia" target="_blank" rel="noreferrer" className="mt-8 block text-center text-[10px] text-[#849187] lg:hidden">项目源码与开源声明</a>
      </main>

      <nav aria-label="主导航" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[#dfe6df] bg-[#fbfcf9]/95 px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
          return <Link key={href} href={href} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium ${active ? 'text-[#173b32]' : 'text-[#819087]'}`}><Icon className={`size-[19px] ${active ? 'stroke-[2.3]' : ''}`} />{label}</Link>
        })}
      </nav>
    </div>
  )
}
