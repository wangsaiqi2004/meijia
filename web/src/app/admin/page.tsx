"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Crown, Download, ImageIcon, LoaderCircle, Pencil, Plus, RefreshCw, Shield, Store, ToggleLeft, ToggleRight, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { NailPageFrame } from '@/components/nail/nail-page-frame'
import { SystemSettings } from '@/components/nail/system-settings'
import { formatDate, formatPoints, nailFetch, requestKey, styleImageUrl } from '@/lib/nail/client'
import type { PricingConfig, ProviderSettings } from '@/lib/nail/contracts'

type Shop = {
  id: string
  name: string
  city: string
  contact: string
  credits: number
  isVip: boolean
  status: string
  createdAt: string
  _count: { users: number; generations: number }
  failed: number
  consumed: number
  apiCostCents: number
}
type Style = { id: string; name: string; category: string; imagePath: string; tags: string; sortOrder: number; enabled: boolean }
type Dashboard = {
  shops: Shop[]
  today: number
  totals: { status: string; _count: { _all: number }; _sum: { apiCostCents: number | null } }[]
  styles: Style[]
  unusedCodes: number
  config: PricingConfig & { provider: ProviderSettings }
}

function AdminContent() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [busy, setBusy] = useState('')
  const [newShop, setNewShop] = useState(false)
  const [shopForm, setShopForm] = useState({ name: '', city: '', contact: '', username: '', password: '', initialCredits: '0' })
  const [credit, setCredit] = useState({ shopId: '', points: '100', remark: '管理员充值' })
  const [codeForm, setCodeForm] = useState({ points: '100', count: '10' })
  const [codes, setCodes] = useState<string[]>([])
  const [codesCopied, setCodesCopied] = useState(false)
  const [styleForm, setStyleForm] = useState({ id: '', name: '', category: '日常', tags: '', imagePath: '', sortOrder: '0' })
  const creditRequest = useRef({ signature: '', key: '' })
  const actionLock = useRef(false)

  const load = useCallback(async () => {
    const result = await nailFetch<Dashboard>('/api/nail/admin')
    setDashboard(result)
    setCredit(current => ({ ...current, shopId: current.shopId || result.shops[0]?.id || '' }))
  }, [])

  useEffect(() => { void load().catch(error => toast.error(error instanceof Error ? error.message : '加载管理数据失败')) }, [load])

  async function action(body: Record<string, unknown>, success: string) {
    if (actionLock.current) throw new Error('操作正在提交')
    actionLock.current = true
    setBusy(String(body.action || 'action'))
    try {
      await nailFetch('/api/nail/admin', { method: 'POST', body: JSON.stringify(body) })
      toast.success(success)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败')
      throw error
    } finally {
      actionLock.current = false
      setBusy('')
    }
  }

  async function createShop(event: React.FormEvent) {
    event.preventDefault()
    try {
      await action({ action: 'create-shop', ...shopForm, initialCredits: Number(shopForm.initialCredits) }, '店铺和老板账号已开通')
      setNewShop(false)
      setShopForm({ name: '', city: '', contact: '', username: '', password: '', initialCredits: '0' })
    } catch {}
  }

  async function manualCredit(event: React.FormEvent) {
    event.preventDefault()
    try {
      const signature = JSON.stringify(credit)
      if (creditRequest.current.signature !== signature) creditRequest.current = { signature, key: requestKey() }
      await action({ action: 'manual-credit', ...credit, points: Number(credit.points), orderId: creditRequest.current.key }, '点数已到账')
      creditRequest.current = { signature: '', key: '' }
    } catch {}
  }

  async function makeCodes(event: React.FormEvent) {
    event.preventDefault()
    if (actionLock.current) return
    actionLock.current = true
    setBusy('redeem-codes')
    try {
      const result = await nailFetch<{ codes: string[] }>('/api/nail/admin', { method: 'POST', body: JSON.stringify({ action: 'redeem-codes', points: Number(codeForm.points), count: Number(codeForm.count) }) })
      setCodes(result.codes)
      setCodesCopied(false)
      toast.success(`已生成 ${result.codes.length} 个兑换码`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成兑换码失败')
    } finally {
      actionLock.current = false
      setBusy('')
    }
  }

  async function saveStyle(event: React.FormEvent) {
    event.preventDefault()
    if (!styleForm.imagePath) return toast.error('请先上传款式图片')
    await action({ action: 'save-style', ...styleForm, id: styleForm.id || `custom-${requestKey()}`, sortOrder: Number(styleForm.sortOrder) }, '款式已保存')
    setStyleForm({ id: '', name: '', category: '日常', tags: '', imagePath: '', sortOrder: '0' })
  }

  async function uploadStyle(file: File) {
    setBusy('upload-style')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', 'library')
      const result = await nailFetch<{ path: string }>('/api/nail/upload', { method: 'POST', body: form })
      setStyleForm(current => ({ ...current, imagePath: result.path }))
      toast.success('款式图片已上传')
    } catch (error) { toast.error(error instanceof Error ? error.message : '上传失败') }
    finally { setBusy('') }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCodesCopied(true)
      toast.success('兑换码已复制')
    } catch {
      downloadCodes()
      toast('已下载兑换码文件')
    }
  }

  function downloadCodes() {
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `nail-redeem-codes-${Date.now()}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!dashboard) return <div className="grid min-h-56 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--app-secondary)]" /></div>
  const total = dashboard.totals.reduce((sum, item) => sum + item._count._all, 0)
  const failed = dashboard.totals.find(item => item.status === 'refunded')?._count._all || 0
  const apiCost = dashboard.totals.reduce((sum, item) => sum + (item._sum.apiCostCents || 0), 0)
  const failureRate = total ? Math.round(failed / total * 100) : 0

  return <div className="mx-auto max-w-[1200px]">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-medium text-[var(--app-ink)] sm:text-[28px]">管理后台</h1><p className="mt-3 text-sm text-[var(--app-secondary)]">店铺、点数、兑换码与款式库</p></div>
      <button type="button" onClick={() => void load()} className="flex h-9 items-center gap-2 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs font-medium text-[var(--app-secondary)]"><RefreshCw className="size-4" />刷新</button>
    </div>

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: '今日生成', value: formatPoints(dashboard.today), icon: ImageIcon },
        { label: '累计任务', value: formatPoints(total), icon: RefreshCw },
        { label: '失败率', value: `${failureRate}%`, icon: Shield },
        { label: '估算 API 成本', value: `¥${(apiCost / 100).toFixed(2)}`, icon: Store },
      ].map(item => <div key={item.label} className="rounded-lg border border-[var(--app-border)] bg-white p-4 sm:p-4"><div className="flex items-center justify-between text-xs text-[var(--app-muted)]"><span>{item.label}</span><item.icon className="size-4 text-[#78917d]" /></div><p className="mt-2 text-[22px] leading-none font-medium text-[var(--app-ink)]">{item.value}</p></div>)}
    </section>

    <SystemSettings config={dashboard.config} busy={Boolean(busy)} onAction={action} />

    <section className="mt-4 rounded-lg border border-[var(--app-border)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><Store className="size-4 text-[var(--app-secondary)]" /><h2 className="text-sm font-medium">店铺</h2><span className="rounded-sm bg-[var(--app-raised)] px-2 py-0.5 text-xs text-[var(--app-secondary)]">{dashboard.shops.length}</span></div><p className="mt-1 text-xs text-[var(--app-muted)]">创建账号、调整点数及管理店铺状态。</p></div><button type="button" onClick={() => setNewShop(value => !value)} className="flex h-9 items-center gap-2 rounded-md bg-[#173b32] px-3 text-xs font-medium text-white"><Plus className="size-4" />开通店铺</button></div>
      {newShop ? <form onSubmit={event => void createShop(event)} className="grid gap-3 border-b border-[var(--app-border)] bg-[var(--app-page)] p-4 sm:grid-cols-3 sm:p-5">
        <input required value={shopForm.name} onChange={event => setShopForm({ ...shopForm, name: event.target.value })} placeholder="店铺名称" className="h-10 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" />
        <input value={shopForm.city} onChange={event => setShopForm({ ...shopForm, city: event.target.value })} placeholder="城市（选填）" className="h-10 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" />
        <input value={shopForm.contact} onChange={event => setShopForm({ ...shopForm, contact: event.target.value })} placeholder="联系方式（选填）" className="h-10 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" />
        <input required value={shopForm.username} onChange={event => setShopForm({ ...shopForm, username: event.target.value })} placeholder="老板登录账号" className="h-10 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" />
        <input required minLength={12} type="password" autoComplete="new-password" value={shopForm.password} onChange={event => setShopForm({ ...shopForm, password: event.target.value })} placeholder="老板初始密码，至少 12 位" className="h-10 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" />
        <div className="flex gap-2"><input type="number" min="0" step="1" value={shopForm.initialCredits} onChange={event => setShopForm({ ...shopForm, initialCredits: event.target.value })} aria-label="初始点数" className="h-10 min-w-0 flex-1 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" /><button disabled={Boolean(busy)} className="h-10 rounded-md bg-[#52765d] px-4 text-xs font-medium text-white disabled:opacity-50">确认开通</button><button type="button" aria-label="取消开通" onClick={() => setNewShop(false)} className="grid size-10 place-items-center rounded-md border border-[var(--app-border)] text-[var(--app-muted)]"><X className="size-4" /></button></div>
      </form> : null}
      {dashboard.shops.length ? <div className="divide-y divide-[var(--app-border)]">
        {dashboard.shops.map(shop => <article key={shop.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_auto] sm:items-center sm:px-5">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium text-[var(--app-ink)]">{shop.name}</h3>{shop.isVip ? <span className="flex items-center gap-1 rounded-sm bg-[#f5efdf] px-1.5 py-0.5 text-xs font-medium text-[#987a39]"><Crown className="size-3" />VIP</span> : null}<span className={`rounded-sm px-1.5 py-0.5 text-xs ${shop.status === 'active' ? 'bg-[var(--app-raised)] text-[#52765d]' : 'bg-[#f4e9e6] text-[#9b6858]'}`}>{shop.status === 'active' ? '营业中' : '已停用'}</span></div><p className="mt-1 truncate text-xs text-[#8d9990]">{[shop.city, shop.contact, formatDate(shop.createdAt)].filter(Boolean).join(' · ')}</p><p className="mt-1 flex items-center gap-3 text-xs text-[var(--app-muted)]"><span className="flex items-center gap-1"><Users className="size-3" />{shop._count.users} 账号</span><span>{shop._count.generations} 次生成</span></p></div>
          <div className="sm:text-right"><p className="text-xs text-[var(--app-muted)]">剩余点数</p><p className="mt-1 text-[17px] font-medium text-[#365b43]">{formatPoints(shop.credits)}</p><p className="mt-1 text-xs text-[var(--app-muted)]">已用 {formatPoints(shop.consumed)} 点 · 失败 {shop.failed} 次</p><p className="mt-1 text-xs text-[var(--app-muted)]">估算成本 ¥{(shop.apiCostCents / 100).toFixed(2)}</p></div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button type="button" title={shop.isVip ? '取消 VIP' : '设为 VIP'} aria-label={shop.isVip ? `取消 ${shop.name} VIP` : `设为 ${shop.name} VIP`} disabled={Boolean(busy)} onClick={() => void action({ action: 'vip', shopId: shop.id, isVip: !shop.isVip }, '店铺权益已更新').catch(() => undefined)} className="grid size-9 place-items-center rounded-md border border-[#e1e6df] bg-white text-[#8c7745] disabled:opacity-50"><Crown className="size-4" /></button>
            <button type="button" title={shop.status === 'active' ? '停用店铺' : '启用店铺'} aria-label={shop.status === 'active' ? `停用 ${shop.name}` : `启用 ${shop.name}`} disabled={Boolean(busy)} onClick={() => void action({ action: 'status', shopId: shop.id, status: shop.status === 'active' ? 'disabled' : 'active' }, '店铺状态已更新').catch(() => undefined)} className="grid size-9 place-items-center rounded-md border border-[#e1e6df] bg-white text-[#73847a] disabled:opacity-50">{shop.status === 'active' ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}</button>
          </div>
        </article>)}
      </div> : <div className="py-10 text-center text-xs text-[var(--app-muted)]">暂时没有店铺。开通店铺后，老板可以自行创建店员账号。</div>}
    </section>

    <section className="mt-4 grid gap-4 lg:grid-cols-2">
      <form onSubmit={event => void manualCredit(event)} className="rounded-lg border border-[var(--app-border)] bg-white p-4 sm:p-5">
        <h2 className="text-sm font-medium">手动充值</h2><p className="mt-1 text-xs text-[var(--app-muted)]">系统会记录操作人、点数和备注。</p>
        <div className="mt-4 grid gap-2"><select required value={credit.shopId} onChange={event => setCredit({ ...credit, shopId: event.target.value })} className="h-10 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs"><option value="" disabled>选择店铺</option>{dashboard.shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select><div className="grid grid-cols-[0.7fr_1.3fr] gap-2"><input type="number" min="1" step="1" required value={credit.points} onChange={event => setCredit({ ...credit, points: event.target.value })} aria-label="充值点数" className="h-10 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" /><input required value={credit.remark} onChange={event => setCredit({ ...credit, remark: event.target.value })} placeholder="充值备注" className="h-10 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" /></div><button disabled={Boolean(busy) || !dashboard.shops.length} className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#173b32] text-xs font-medium text-white disabled:opacity-50">确认充值</button></div>
      </form>
      <form onSubmit={event => void makeCodes(event)} className="rounded-lg border border-[var(--app-border)] bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-medium">生成兑换码</h2><p className="mt-1 text-xs text-[var(--app-muted)]">仅店主可兑换，兑换成功后自动记账。</p></div><span className="text-xs text-[var(--app-muted)]">未使用 {dashboard.unusedCodes}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><label className="text-xs text-[var(--app-muted)]">每码点数<input type="number" min="1" step="1" value={codeForm.points} onChange={event => setCodeForm({ ...codeForm, points: event.target.value })} className="mt-2 h-10 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-xs text-[var(--app-ink)]" /></label><label className="text-xs text-[var(--app-muted)]">生成数量<input type="number" min="1" max="500" step="1" value={codeForm.count} onChange={event => setCodeForm({ ...codeForm, count: event.target.value })} className="mt-2 h-10 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-xs text-[var(--app-ink)]" /></label></div>
        <button disabled={Boolean(busy)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--app-border)] bg-white text-xs font-medium text-[var(--app-secondary)] disabled:opacity-50"><Plus className="size-4" />生成兑换码</button>
        {codes.length ? <div className="mt-3 rounded-md border border-[var(--app-border)] bg-[#f5f8f4] p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium text-[#607267]">本次生成 · {codes.length} 个</span><div className="flex gap-1"><button type="button" title="复制全部" aria-label="复制全部兑换码" onClick={() => void copyCodes()} className="grid size-8 place-items-center rounded-md text-[var(--app-secondary)] hover:bg-white">{codesCopied ? <Check className="size-4" /> : <Copy className="size-4" />}</button><button type="button" title="下载兑换码" aria-label="下载兑换码" onClick={downloadCodes} className="grid size-8 place-items-center rounded-md text-[var(--app-secondary)] hover:bg-white"><Download className="size-4" /></button></div></div><div className="max-h-32 overflow-auto font-mono text-xs leading-5 text-[var(--app-secondary)]">{codes.map(item => <div key={item}>{item}</div>)}</div></div> : null}
      </form>
    </section>

    <section className="mt-4 rounded-lg border border-[var(--app-border)] bg-white">
      <div className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><ImageIcon className="size-4 text-[var(--app-secondary)]" /><h2 className="text-sm font-medium">款式库</h2><span className="rounded-sm bg-[var(--app-raised)] px-2 py-0.5 text-xs text-[var(--app-secondary)]">{dashboard.styles.length}</span></div><p className="mt-1 text-xs text-[var(--app-muted)]">上传参考图片，管理款式和展示顺序</p></div>
      <form onSubmit={event => void saveStyle(event).catch(() => undefined)} className="grid gap-2 border-b border-[var(--app-border)] bg-[var(--app-page)] p-4 sm:grid-cols-[1.1fr_0.8fr_1.3fr_auto] sm:items-end">
        <label className="text-xs text-[var(--app-muted)]">款式名称<input required value={styleForm.name} onChange={event => setStyleForm({ ...styleForm, name: event.target.value })} className="mt-2 h-9 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-xs text-[var(--app-ink)]" /></label>
        <label className="text-xs text-[var(--app-muted)]">分类<select value={styleForm.category} onChange={event => setStyleForm({ ...styleForm, category: event.target.value })} className="mt-2 h-9 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-xs text-[var(--app-ink)]">{['日常', '猫眼', '法式', '秋冬', '低饱和', '手绘', '渐变', '轻奢'].map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs text-[var(--app-muted)]">标签<input value={styleForm.tags} onChange={event => setStyleForm({ ...styleForm, tags: event.target.value })} placeholder="猫眼,短甲,通勤" className="mt-2 h-9 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-xs text-[var(--app-ink)]" /></label>
        <label className="text-xs text-[var(--app-muted)]">排序<input type="number" min="0" value={styleForm.sortOrder} onChange={event => setStyleForm({ ...styleForm, sortOrder: event.target.value })} className="mt-2 h-9 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" /></label>
        <label className="min-w-0 text-xs text-[var(--app-muted)]">款式图片<input type="file" accept="image/*" disabled={Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadStyle(file) }} className="mt-2 block w-full text-xs" /><span className="block mt-1">{styleForm.imagePath ? '已选择图片' : '请选择图片'}</span></label>
        <button disabled={Boolean(busy)} className="flex h-9 items-center justify-center gap-2 rounded-md bg-[#52765d] px-3 text-xs font-medium text-white disabled:opacity-50"><Check className="size-4" />{styleForm.id ? '保存款式' : '添加款式'}</button>
      </form>
      {dashboard.styles.length ? <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3 sm:p-4">{dashboard.styles.map(style => <article key={style.id} className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--app-border)] bg-white p-3">
        <img src={styleImageUrl(style.id)} alt="" className="size-14 shrink-0 rounded-sm bg-[var(--app-raised)] object-cover" />
        <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-[var(--app-ink)]">{style.name}</div><div className="mt-1 truncate text-xs text-[var(--app-muted)]">{style.category} · {style.tags || '无标签'}</div><div className="mt-1 text-xs text-[#a0aaa2]">排序 {style.sortOrder} · {style.enabled ? '展示中' : '已隐藏'}</div></div>
        <div className="flex shrink-0 gap-0.5"><button type="button" title="编辑款式" aria-label={`编辑${style.name}`} onClick={() => setStyleForm({ ...style, sortOrder: String(style.sortOrder) })} className="grid size-8 place-items-center text-[var(--app-secondary)]"><Pencil className="size-4" /></button><button type="button" title={style.enabled ? '隐藏款式' : '显示款式'} aria-label={style.enabled ? `隐藏${style.name}` : `显示${style.name}`} disabled={Boolean(busy)} onClick={() => void action({ action: 'save-style', ...style, enabled: !style.enabled }, '款式状态已更新').catch(() => undefined)} className="grid size-8 place-items-center rounded-sm text-[var(--app-secondary)] hover:bg-[#f2f5f1]">{style.enabled ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}</button><button type="button" title="删除款式" aria-label={`删除${style.name}`} disabled={Boolean(busy)} onClick={() => { if (window.confirm(`删除「${style.name}」？`)) void action({ action: 'delete-style', id: style.id }, '款式已删除').catch(() => undefined) }} className="grid size-8 place-items-center rounded-sm text-[#a18475] hover:bg-[#fff3ed]"><X className="size-4" /></button></div>
      </article>)}</div> : <div className="py-8 text-center text-xs text-[var(--app-muted)]">款式库为空</div>}
    </section>
  </div>
}

export default function AdminPage() {
  return <NailPageFrame roles={['admin']}>{() => <AdminContent />}</NailPageFrame>
}
