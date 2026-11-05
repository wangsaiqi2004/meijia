"use client"

import { useCallback, useEffect, useState } from 'react'
import { Crown, Gift, LoaderCircle, Plus, Store, Users } from 'lucide-react'
import { toast } from 'sonner'
import { NailPageFrame } from '@/components/nail/nail-page-frame'
import { formatDate, formatPoints, nailFetch, type NailUser } from '@/lib/nail/client'

type ShopData = {
  shop: { id: string; name: string; city: string; contact: string; credits: number; isVip: boolean; createdAt: string }
  orders: { id: string; channel: string; credits: number; remark: string; createdAt: string }[]
}
type Staff = { id: string; username: string; status: string; createdAt: string }

function ShopContent({ user }: { user: NailUser }) {
  const [data, setData] = useState<ShopData | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await nailFetch<ShopData>('/api/nail/shop')
    setData(result)
  }, [])

  useEffect(() => {
    void load().catch(error => toast.error(error instanceof Error ? error.message : '加载店铺信息失败'))
    if (user.role === 'owner') {
      void nailFetch<{ staff: Staff[] }>('/api/nail/shop/staff').then(result => setStaff(result.staff)).catch(() => undefined)
    }
  }, [load, user.role])

  async function redeem(event: React.FormEvent) {
    event.preventDefault()
    if (!code.trim()) return toast.error('请输入兑换码')
    setBusy(true)
    try {
      const result = await nailFetch<{ credits: number }>('/api/nail/shop', { method: 'POST', body: JSON.stringify({ code }) })
      toast.success(`兑换成功，到账 ${formatPoints(result.credits)} 点`)
      setCode('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '兑换失败')
    } finally {
      setBusy(false)
    }
  }

  async function addStaff(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await nailFetch('/api/nail/shop/staff', { method: 'POST', body: JSON.stringify({ username, password }) })
      toast.success('店员账号已创建')
      setUsername('')
      setPassword('')
      const result = await nailFetch<{ staff: Staff[] }>('/api/nail/shop/staff')
      setStaff(result.staff)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建店员失败')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="grid min-h-56 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--app-secondary)]" /></div>

  return <div className="mx-auto max-w-[1050px]">
    <div className="mb-8"><h1 className="text-2xl font-medium text-[var(--app-ink)] sm:text-[28px]">店铺与点数</h1><p className="mt-3 text-sm text-[var(--app-secondary)]">点数余额、充值与店员账号</p></div>

    <section className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-lg border border-[var(--app-border)] bg-white p-5">
        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs text-[var(--app-muted)]">当前店铺</p><h2 className="mt-2 break-words text-lg font-medium text-[var(--app-ink)]">{data.shop.name}</h2><p className="mt-1 break-words text-xs text-[var(--app-muted)]">{[data.shop.city, data.shop.contact].filter(Boolean).join(' · ') || '店铺信息'}</p></div><Store className="size-[18px] shrink-0 text-[var(--app-secondary)]" /></div>
        <div className="mt-5 grid grid-cols-2 border-t border-[var(--app-border)] pt-4">
          <div><p className="text-xs text-[var(--app-muted)]">可用点数</p><p className="mt-2 text-[28px] leading-none font-medium text-[#244938]">{formatPoints(data.shop.credits)}<span className="ml-1 text-xs font-medium">点</span></p></div>
          <div className="border-l border-[var(--app-border)] pl-5"><p className="text-xs text-[var(--app-muted)]">店铺权益</p><p className="mt-2 flex items-center gap-2 text-sm font-medium text-[var(--app-secondary)]">{data.shop.isVip ? <><Crown className="size-4 text-[#b48b44]" />VIP 店铺</> : '普通店铺'}</p><p className="mt-1 text-xs text-[var(--app-muted)]">{user.role === 'staff' ? '店员与店主共用点数池' : '按当前店铺套餐扣点'}</p></div>
        </div>
      </div>

      <form onSubmit={event => void redeem(event)} className="rounded-lg border border-[var(--app-border)] bg-white p-5">
        <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-md bg-[#f3ebe1] text-[#9b744e]"><Gift className="size-4" /></span><div><h2 className="text-sm font-medium">兑换充值码</h2><p className="mt-0.5 text-xs text-[var(--app-muted)]">联系管理员获取店铺充值码</p></div></div>
        <label htmlFor="redeem-code" className="sr-only">充值兑换码</label><input id="redeem-code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="MJ-XXXX-XXXX-XXXX" autoComplete="off" className="mt-4 h-11 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-sm font-medium tracking-[0.08em] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-[var(--app-muted)] focus:border-[#78957d]" />
        {user.role === 'owner' ? <button type="submit" disabled={busy} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#173b32] text-xs font-medium text-white disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}兑换点数</button> : <p className="mt-2 text-xs text-[var(--app-muted)]">店员请让店主操作充值码</p>}
      </form>
    </section>

    {user.role === 'owner' ? <section className="mt-4 rounded-lg border border-[var(--app-border)] bg-white p-5">
      <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="size-4 text-[var(--app-secondary)]" /><h2 className="text-sm font-medium">店员账号</h2></div><p className="mt-1 text-xs text-[var(--app-muted)]">店员可使用本店共享点数进行预览。</p></div><span className="text-xs text-[var(--app-muted)]">{staff.length} 个账号</span></div>
      <form onSubmit={event => void addStaff(event)} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={username} onChange={event => setUsername(event.target.value)} placeholder="新店员账号" autoComplete="off" required className="h-10 min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 text-sm outline-none focus:border-[#78957d]" />
        <input value={password} onChange={event => setPassword(event.target.value)} placeholder="初始密码，至少 12 位" autoComplete="new-password" minLength={12} required type="password" className="h-10 min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 text-sm outline-none focus:border-[#78957d]" />
        <button type="submit" disabled={busy} className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--app-raised)] px-4 text-xs font-medium text-[#365b43] disabled:opacity-50"><Plus className="size-4" />创建账号</button>
      </form>
      {staff.length ? <div className="mt-4 divide-y divide-[var(--app-border)] border-t border-[var(--app-border)]">{staff.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-xs"><span className="font-medium text-[var(--app-ink)]">{item.username}</span><span className="text-xs text-[var(--app-muted)]">{item.status === 'active' ? '正常' : '已停用'} · {formatDate(item.createdAt)}</span></div>)}</div> : null}
    </section> : null}

    <section className="mt-4 rounded-lg border border-[var(--app-border)] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-4 sm:px-5"><div><h2 className="text-sm font-medium">点数流水</h2><p className="mt-1 text-xs text-[var(--app-muted)]">充值、兑换和生成记录</p></div><span className="text-xs text-[var(--app-muted)]">最近 30 笔</span></div>
      {data.orders.length ? <div className="divide-y divide-[var(--app-border)]">
        {data.orders.map(order => <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5"><div className="min-w-0"><p className="truncate text-xs font-medium text-[var(--app-secondary)]">{order.remark || '点数变动'}</p><p className="mt-1 text-xs text-[var(--app-muted)]">{formatDate(order.createdAt)} · {order.channel}</p></div><span className={`shrink-0 text-sm font-medium ${order.credits > 0 ? 'text-[#47745b]' : 'text-[#a5674d]'}`}>{order.credits > 0 ? '+' : ''}{formatPoints(order.credits)} 点</span></div>)}
      </div> : <div className="px-5 py-10 text-center text-xs text-[var(--app-muted)]">暂时没有点数流水</div>}
    </section>
  </div>
}

export default function ShopPage() {
  return <NailPageFrame roles={['owner', 'staff']}>{user => <ShopContent user={user} />}</NailPageFrame>
}
