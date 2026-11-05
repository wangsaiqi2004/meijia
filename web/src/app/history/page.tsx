"use client"

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Download, ImageIcon, LoaderCircle, Maximize2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { NailPageFrame } from '@/components/nail/nail-page-frame'
import { formatDate, formatPoints, generationImageUrl, nailFetch, type NailUser } from '@/lib/nail/client'
import { ImageLightbox } from '@/components/nail/image-lightbox'

type HistoryItem = {
  id: string
  styleName: string
  mode: string
  size: string
  creditsCost: number
  status: string
  failReason: string | null
  outputPath: string | null
  createdAt: string
}

function HistoryContent({ user }: { user: NailUser }) {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [deleting, setDeleting] = useState('')
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await nailFetch<{ items: HistoryItem[] }>('/api/nail/history')
      setItems(data.items)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  const visible = items.filter(item => filter === 'all' || item.status === filter)

  async function remove(item: HistoryItem) {
    if (!window.confirm(`删除「${item.styleName}」这条生成记录？图片也会立即删除。`)) return
    setDeleting(item.id)
    try {
      await nailFetch(`/api/nail/history/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      setItems(current => current.filter(row => row.id !== item.id))
      toast.success('记录和图片已删除')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting('')
    }
  }

  return <div className="mx-auto max-w-[1100px]">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-medium text-[var(--app-ink)] sm:text-[28px]">生成记录</h1><p className="mt-3 text-sm text-[var(--app-secondary)]">{user.role === 'owner' ? '本店生成的美甲预览' : '你生成的美甲预览'}</p></div>
      <button type="button" onClick={() => void load()} className="flex h-9 items-center gap-2 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs font-medium text-[var(--app-secondary)]"><RefreshCw className="size-4" />刷新</button>
    </div>

    <div className="mb-4 flex gap-2 overflow-x-auto">
      {[['all', '全部'], ['success', '已完成'], ['pending', '生成中'], ['refunded', '失败已退款']].map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`h-8 shrink-0 rounded-md px-3 text-xs font-medium ${filter === value ? 'bg-[#173b32] text-white' : 'bg-[var(--app-raised)] text-[var(--app-secondary)]'}`}>{label}</button>)}
    </div>

    {loading ? <div className="grid min-h-48 place-items-center rounded-lg border border-[var(--app-border)] bg-white"><LoaderCircle className="size-5 animate-spin text-[var(--app-secondary)]" /></div> : visible.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--app-border)] bg-white px-5 text-center"><ImageIcon className="size-8 text-[#a7b4a8]" /><p className="mt-3 text-sm font-medium text-[var(--app-secondary)]">还没有生成记录</p><p className="mt-1 text-xs text-[var(--app-muted)]">生成的效果图会出现在这里</p></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map(item => <article key={item.id} className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-white">
        {item.status === 'success' ? <button type="button" aria-label={`放大查看${item.styleName}效果图`} onClick={() => setLightbox({ src: generationImageUrl(item.id, 'result', 'detail'), title: `${item.styleName}效果图` })} className="relative block w-full"><img src={`${generationImageUrl(item.id)}&v=${encodeURIComponent(item.createdAt)}`} alt={`${item.styleName}效果图`} className="aspect-[4/3] w-full bg-[var(--app-raised)] object-contain" /><span className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-md bg-black/55 text-white"><Maximize2 className="size-4" /></span></button> : <div className="grid aspect-[4/3] place-items-center bg-[var(--app-raised)]">{item.status === 'pending' ? <LoaderCircle className="size-6 animate-spin text-[var(--app-secondary)]" /> : <AlertCircle className="size-6 text-[#b47e60]" />}</div>}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2"><h2 className="min-w-0 truncate text-sm font-medium text-[var(--app-ink)]">{item.styleName}</h2><span className={`shrink-0 rounded-sm px-2 py-1 text-xs font-medium ${item.status === 'success' ? 'bg-[#e7f0e7] text-[#47745b]' : item.status === 'pending' ? 'bg-[#edf0e9] text-[var(--app-secondary)]' : 'bg-[#fff1e9] text-[#a5674d]'}`}>{item.status === 'success' ? '已完成' : item.status === 'pending' ? '生成中' : '失败已退点'}</span></div>
          <p className="mt-2 text-xs text-[var(--app-muted)]">{formatDate(item.createdAt)} · {item.size.toUpperCase()} · {item.mode === 'promo' ? '宣传版' : '真实沟通版'}</p>
          {item.failReason && item.status === 'refunded' ? <p className="mt-2 line-clamp-2 text-xs leading-4 text-[#a5674d]">{item.failReason}</p> : null}
          <div className="mt-3 flex items-center justify-between border-t border-[var(--app-border)] pt-2.5"><span className="text-xs text-[var(--app-muted)]">消耗 {formatPoints(item.creditsCost)} 点</span><div className="flex gap-1">
            {item.status === 'success' ? <a href={`${generationImageUrl(item.id)}&download=1`} className="grid size-8 place-items-center rounded-md text-[var(--app-secondary)] hover:bg-[var(--app-raised)]" title="下载图片"><Download className="size-4" /></a> : null}
            {item.status !== 'pending' ? <button type="button" disabled={deleting === item.id} onClick={() => void remove(item)} className="grid size-8 place-items-center rounded-md text-[#8a8580] hover:bg-[#fff0e9] hover:text-[#aa674a] disabled:opacity-50" aria-label="删除记录">{deleting === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button> : null}
          </div></div>
          {item.status === 'success' ? <button type="button" onClick={() => router.push(`/?task=${encodeURIComponent(item.id)}`)} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--app-raised)] text-xs font-medium text-[var(--app-secondary)] hover:bg-[#e4ebe3]"><RefreshCw className="size-4" />查看详情或再次生成</button> : null}
        </div>
      </article>)}
    </div>}
    <ImageLightbox preview={lightbox} onClose={() => setLightbox(null)} />
  </div>
}

export default function HistoryPage() {
  return <NailPageFrame roles={['owner', 'staff']}>{user => <HistoryContent user={user} />}</NailPageFrame>
}
