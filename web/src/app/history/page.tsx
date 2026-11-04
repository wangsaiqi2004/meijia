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
      <div><p className="text-[10px] font-semibold tracking-[0.16em] text-[#8a9c91]">GENERATION HISTORY</p><h1 className="mt-2 text-[24px] font-semibold text-[#20372e] sm:text-[28px]">生成记录</h1><p className="mt-2 text-[13px] text-[#718077]">{user.role === 'owner' ? '查看本店生成记录。' : '查看你创建的生成记录。'}</p></div>
      <button type="button" onClick={() => void load()} className="flex h-9 items-center gap-2 rounded-md border border-[#d8e0d8] bg-[#fbfcf9] px-3 text-xs font-medium text-[#586c5e]"><RefreshCw className="size-3.5" />刷新</button>
    </div>

    <div className="mb-4 flex gap-1.5 overflow-x-auto">
      {[['all', '全部'], ['success', '已完成'], ['pending', '生成中'], ['refunded', '失败已退款']].map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`h-8 shrink-0 rounded-md px-3 text-[11px] font-semibold ${filter === value ? 'bg-[#173b32] text-white' : 'bg-[#e9eee8] text-[#69796f]'}`}>{label}</button>)}
    </div>

    {loading ? <div className="grid min-h-48 place-items-center rounded-lg border border-[#dfe6df] bg-[#fbfcf9]"><LoaderCircle className="size-5 animate-spin text-[#668571]" /></div> : visible.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-[#ced9cf] bg-[#fbfcf9] px-5 text-center"><ImageIcon className="size-8 text-[#a7b4a8]" /><p className="mt-3 text-sm font-semibold text-[#586c5e]">还没有生成记录</p><p className="mt-1 text-xs text-[#8c9990]">生成的效果图会出现在这里</p></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map(item => <article key={item.id} className="overflow-hidden rounded-lg border border-[#dfe6df] bg-[#fbfcf9]">
        {item.status === 'success' ? <button type="button" aria-label={`放大查看${item.styleName}效果图`} onClick={() => setLightbox({ src: generationImageUrl(item.id, 'result', 'detail'), title: `${item.styleName}效果图` })} className="relative block w-full"><img src={`${generationImageUrl(item.id)}&v=${encodeURIComponent(item.createdAt)}`} alt={`${item.styleName}效果图`} className="aspect-[4/3] w-full bg-[#edf0eb] object-contain" /><span className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-md bg-black/55 text-white"><Maximize2 className="size-3.5" /></span></button> : <div className="grid aspect-[4/3] place-items-center bg-[#eef2ed]">{item.status === 'pending' ? <LoaderCircle className="size-6 animate-spin text-[#668571]" /> : <AlertCircle className="size-6 text-[#b47e60]" />}</div>}
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-2"><h2 className="min-w-0 truncate text-[13px] font-semibold text-[#30463a]">{item.styleName}</h2><span className={`shrink-0 rounded-sm px-2 py-1 text-[9px] font-semibold ${item.status === 'success' ? 'bg-[#e7f0e7] text-[#47745b]' : item.status === 'pending' ? 'bg-[#edf0e9] text-[#75826f]' : 'bg-[#fff1e9] text-[#a5674d]'}`}>{item.status === 'success' ? '已完成' : item.status === 'pending' ? '生成中' : '失败已退点'}</span></div>
          <p className="mt-1.5 text-[10px] text-[#88968c]">{formatDate(item.createdAt)} · {item.size.toUpperCase()} · {item.mode === 'promo' ? '宣传版' : '真实沟通版'}</p>
          {item.failReason && item.status === 'refunded' ? <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[#a5674d]">{item.failReason}</p> : null}
          <div className="mt-3 flex items-center justify-between border-t border-[#e7ebe5] pt-2.5"><span className="text-[10px] text-[#819087]">消耗 {formatPoints(item.creditsCost)} 点</span><div className="flex gap-1">
            {item.status === 'success' ? <a href={`${generationImageUrl(item.id)}&download=1`} className="grid size-8 place-items-center rounded-md text-[#708075] hover:bg-[#edf2ec]" title="下载图片"><Download className="size-4" /></a> : null}
            {item.status !== 'pending' ? <button type="button" disabled={deleting === item.id} onClick={() => void remove(item)} className="grid size-8 place-items-center rounded-md text-[#8a8580] hover:bg-[#fff0e9] hover:text-[#aa674a] disabled:opacity-50" aria-label="删除记录">{deleting === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button> : null}
          </div></div>
          {item.status === 'success' ? <button type="button" onClick={() => router.push(`/?task=${encodeURIComponent(item.id)}`)} className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#edf2ec] text-[11px] font-semibold text-[#526b59] hover:bg-[#e4ebe3]"><RefreshCw className="size-3.5" />查看详情或再次生成</button> : null}
        </div>
      </article>)}
    </div>}
    <ImageLightbox preview={lightbox} onClose={() => setLightbox(null)} />
  </div>
}

export default function HistoryPage() {
  return <NailPageFrame roles={['owner', 'staff']}>{user => <HistoryContent user={user} />}</NailPageFrame>
}
