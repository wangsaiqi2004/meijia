"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Camera, Check, CircleAlert, Download, ImagePlus, LoaderCircle, Maximize2, RefreshCw, Upload, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'
import { toast } from 'sonner'
import { formatPoints, generationImageUrl, nailFetch, requestKey, styleImageUrl, uploadImageUrl, type NailUser } from '@/lib/nail/client'
import type { PriceTable, PriceSource } from '@/lib/nail/contracts'
import { ImageLightbox } from '@/components/nail/image-lightbox'
import { ShopStyleManager } from '@/components/nail/shop-style-manager'

type Style = { id: string; shopId?: string | null; name: string; category: string; tags: string; imagePath: string; enabled: boolean }
type Generation = {
  id: string
  styleName: string
  mode: string
  size: string
  creditsCost: number
  status: string
  failReason: string | null
  outputPath: string | null
  inputHandPath?: string | null
  inputStylePath?: string | null
  extraPrompt?: string
  notes?: { materials?: string[]; steps?: string[]; estimated_minutes?: number; difficulty?: string; warnings?: string[] } | null
}

function PageTitle({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-8"><h1 className="text-2xl leading-tight font-medium text-[var(--app-ink)] sm:text-[28px]">{title}</h1><p className="mt-3 text-sm leading-6 text-[var(--app-secondary)]">{detail}</p></div>
}

function FileTile({ title, description, accept, capture, preview, busy, onChange, onRemove }: {
  title: string
  description: string
  accept: string
  capture?: 'environment'
  preview: string | null
  busy: boolean
  onChange: (file: File) => void
  onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="min-w-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <div><h3 className="text-sm font-medium text-[var(--app-ink)]">{title}</h3><p className="mt-0.5 text-xs leading-4 text-[var(--app-muted)]">{description}</p></div>
      {preview ? <button type="button" onClick={onRemove} aria-label={`移除${title}`} className="grid size-8 shrink-0 place-items-center rounded-md text-[var(--app-muted)] hover:bg-[#edf1ec]"><X className="size-4" /></button> : null}
    </div>
    <input ref={input} type="file" accept={accept} className="sr-only" onChange={event => {
      const file = event.target.files?.[0]
      if (file) onChange(file)
      event.currentTarget.value = ''
    }} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border text-left transition ${preview ? 'border-[var(--app-border)] bg-[var(--app-raised)]' : 'border-dashed border-[var(--app-border)] bg-[var(--app-page)] hover:border-[#8fa895] hover:bg-white'}`}>
      {preview ? <motion.img src={preview} alt={title} initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="size-full object-contain" /> : <span className="flex flex-col items-center px-3 text-center"><span className="mb-2 grid size-10 place-items-center rounded-md bg-[#e7eee7] text-[#426a55]">{capture ? <Camera className="size-[18px]" /> : <Upload className="size-[18px]" />}</span><span className="text-xs font-medium text-[var(--app-secondary)]">{capture ? '拍照或从相册选择' : '选择款式参考图'}</span><span className="mt-1 text-xs text-[var(--app-muted)]">{busy ? '正在上传…' : 'PNG / JPG，最大 4MB'}</span></span>}
      {busy ? <span className="absolute inset-0 grid place-items-center bg-[#f5f8f4]/80"><LoaderCircle className="size-5 animate-spin text-[#426a55]" /></span> : null}
    </button>
    {capture ? <label className="mt-2 flex min-h-9 cursor-pointer items-center justify-center gap-1 text-xs text-[var(--app-secondary)]"><Camera className="size-4" />拍摄手部照片<input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) onChange(file); event.currentTarget.value = '' }} /></label> : null}
  </div>
}

function EnlargedImage({ src, alt, onZoom, className, layoutId }: {
  src: string; alt: string; onZoom: () => void; className: string; layoutId: string
}) {
  return <button type="button" onClick={onZoom} aria-label={`放大查看${alt}`} title="点击放大查看" className="group relative block w-full overflow-hidden">
    <motion.img layoutId={layoutId} src={src} alt={alt} className={className} />
    <span className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-md bg-black/55 text-white opacity-80 transition group-hover:opacity-100"><Maximize2 className="size-4" /></span>
  </button>
}

export function NailWorkbench({ user }: { user: NailUser }) {
  const searchParams = useSearchParams()
  const [styles, setStyles] = useState<Style[]>([])
  const [category, setCategory] = useState('全部')
  const [styleId, setStyleId] = useState('')
  const [styleName, setStyleName] = useState('')
  const [handPath, setHandPath] = useState('')
  const [stylePath, setStylePath] = useState('')
  const [handPreview, setHandPreview] = useState<string | null>(null)
  const [stylePreview, setStylePreview] = useState<string | null>(null)
  const [extraPrompt, setExtraPrompt] = useState('')
  const [mode, setMode] = useState<'preview' | 'promo'>('preview')
  const [size, setSize] = useState<'1k' | '4k'>('1k')
  const [balance, setBalance] = useState<number | null>(null)
  const [isVip, setIsVip] = useState(false)
  const [prices, setPrices] = useState<PriceTable | null>(null)
  const [uploadingHand, setUploadingHand] = useState(false)
  const [uploadingStyle, setUploadingStyle] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationId, setGenerationId] = useState('')
  const [generation, setGeneration] = useState<Generation | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; title: string; layoutId: string } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const handledTask = useRef('')
  const submitLock = useRef(false)
  const submission = useRef({ signature: '', key: '' })
  const categories = ['全部', ...new Set(styles.map(item => item.category))]
  const priceFor = (s: '1k' | '4k') => prices ? prices[s][isVip ? 'vip' : 'regular'] : null
  const price = priceFor(size)

  const filteredStyles = useMemo(() => styles.filter(item => category === '全部' || item.category === category), [styles, category])

  function onStylesChange(rows: Style[]) {
    setStyles(rows)
    if (!stylePath && !rows.some(item => item.id === styleId)) {
      setStyleId(rows[0]?.id || '')
      setStyleName(rows[0]?.name || '')
    }
    if (category !== '全部' && !rows.some(item => item.category === category)) setCategory('全部')
  }

  useEffect(() => {
    void nailFetch<{ styles: Style[] }>('/api/nail/styles').then(({ styles: rows }) => {
      setStyles(rows)
      if (rows[0]) {
        setStyleId(rows[0].id)
        setStyleName(rows[0].name)
      }
    }).catch(error => toast.error(error instanceof Error ? error.message : '加载款式失败'))
    void nailFetch<{ shop: { credits: number; isVip: boolean }; prices: PriceTable; priceSource: PriceSource }>('/api/nail/shop')
      .then(({ shop, prices: rows }) => { setBalance(shop.credits); setIsVip(shop.isVip); setPrices(rows) })
      .catch(() => undefined)
  }, [])

  const activeTask = useRef('')
  const loadTask = useCallback(async (id: string) => {
    const data = await nailFetch<{ generation: Generation }>(`/api/nail/generate?id=${encodeURIComponent(id)}`)
    if (activeTask.current === id) setGeneration(data.generation)
    return data.generation
  }, [])

  useEffect(() => {
    const task = searchParams.get('task')
    if (!task || handledTask.current === task) return
    handledTask.current = task
    activeTask.current = task
    setGenerationId(task)
    void loadTask(task).then(item => {
      if (item.inputHandPath) { setHandPath(item.inputHandPath); setHandPreview(uploadImageUrl(item.inputHandPath)) }
      if (item.inputStylePath?.startsWith('uploads/style/')) {
        setStylePath(item.inputStylePath); setStylePreview(uploadImageUrl(item.inputStylePath)); setStyleId('')
      }
      setStyleName(item.styleName)
      setExtraPrompt(item.extraPrompt || '')
      setMode(item.mode === 'promo' ? 'promo' : 'preview')
      setSize(item.size === '4k' ? '4k' : '1k')
      if (item.status === 'pending') { submitLock.current = true; setGenerating(true) }
    }).catch(() => toast.error('没有找到这条生成任务'))
  }, [loadTask, searchParams])

  useEffect(() => {
    if (!searchParams.get('task') || !generation?.inputStylePath) return
    const savedStyle = styles.find(item => item.imagePath === generation.inputStylePath)
    if (savedStyle) {
      setStyleId(savedStyle.id)
      setStyleName(savedStyle.name)
    }
  }, [generation?.inputStylePath, searchParams, styles])

  useEffect(() => {
    if (!generationId) return
    if (generation?.status === 'success' || generation?.status === 'refunded') {
      setGenerating(false)
      submitLock.current = false
      return
    }
    let active = true
    const started = Date.now()
    let polling = false
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
      if (polling) return
      polling = true
      void loadTask(generationId).then(item => {
        if (!active) return
        if (item.status === 'success' || item.status === 'refunded') {
          window.clearInterval(timer)
          setGenerating(false)
          submitLock.current = false
          void nailFetch<{ shop: { credits: number }; prices: PriceTable; priceSource: PriceSource }>('/api/nail/shop')
            .then(({ shop, prices: rows }) => { setBalance(shop.credits); setPrices(rows) })
            .catch(() => undefined)
          if (item.status === 'refunded') toast.error(item.failReason || '生成失败，点数已退回')
          else document.getElementById('generation-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }).catch(() => undefined).finally(() => { polling = false })
    }, 1800)
    return () => { active = false; window.clearInterval(timer) }
  }, [generation?.status, generationId, loadTask])

  async function upload(file: File, kind: 'hand' | 'style') {
    if (file.size > 4 * 1024 * 1024) {
      toast.error('图片需小于 4MB')
      return
    }
    const preview = URL.createObjectURL(file)
    if (kind === 'hand') {
      setHandPath('')
      if (handPreview) URL.revokeObjectURL(handPreview)
      setHandPreview(preview)
      setUploadingHand(true)
    } else {
      setStylePath('')
      if (stylePreview) URL.revokeObjectURL(stylePreview)
      setStylePreview(preview)
      setUploadingStyle(true)
      setStyleId('')
      setStyleName(file.name.replace(/\.[^.]+$/, '').slice(0, 60) || '自选款式')
    }
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    try {
      const result = await nailFetch<{ path: string }>('/api/nail/upload', { method: 'POST', body: form })
      if (kind === 'hand') setHandPath(result.path)
      else setStylePath(result.path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败')
      if (kind === 'hand') {
        setHandPath('')
        setHandPreview(null)
      } else {
        setStylePath('')
        setStylePreview(null)
      }
    } finally {
      if (kind === 'hand') setUploadingHand(false)
      else setUploadingStyle(false)
    }
  }

  function chooseStyle(item: Style) {
    setStyleId(item.id)
    setStyleName(item.name)
    setStylePath('')
    if (stylePreview) URL.revokeObjectURL(stylePreview)
    setStylePreview(null)
  }

  async function generate(repeat = false) {
    if (submitLock.current) return
    if (!repeat && !handPath) return toast.error('请先上传顾客的手部照片')
    if (!repeat && !styleId && !stylePath) return toast.error('请选择款式或上传参考图')
    if (uploadingHand || uploadingStyle) return toast.error('图片仍在上传，请稍等')
    submitLock.current = true
    setGenerating(true)
    const originalId = repeat ? generationId : ''
    activeTask.current = ''
    setGenerationId('')
    setGeneration(null)
    setElapsed(0)
    try {
      // 提交前重拉价格与余额；不能依赖 setState 后的异步 price。
      const fresh = await nailFetch<{ shop: { credits: number; isVip: boolean }; prices: PriceTable; priceSource: PriceSource }>('/api/nail/shop')
      const latestPrice = fresh.prices[size][fresh.shop.isVip ? 'vip' : 'regular']
      setBalance(fresh.shop.credits)
      setIsVip(fresh.shop.isVip)
      setPrices(fresh.prices)
      if (price !== null && latestPrice !== price) throw new Error(`价格已更新为 ${latestPrice} 点，请确认后重新生成`)
      if (fresh.shop.credits < latestPrice) throw new Error('点数不足，请先兑换充值码')
      const form = new FormData()
      form.set('handPath', handPath)
      form.set('styleId', styleId)
      form.set('uploadedStylePath', stylePath)
      form.set('styleName', styleName)
      form.set('extraPrompt', extraPrompt)
      form.set('mode', mode)
      form.set('size', size)
      const signature = JSON.stringify([originalId, handPath, styleId, stylePath, styleName, extraPrompt, mode, size])
      if (submission.current.signature !== signature) submission.current = { signature, key: requestKey() }
      form.set('idempotencyKey', submission.current.key)
      const started = await nailFetch<{ id: string; status: string; filtered?: boolean }>(
        originalId ? `/api/nail/history/${encodeURIComponent(originalId)}` : '/api/nail/generate',
        { method: 'POST', body: originalId ? JSON.stringify({ idempotencyKey: submission.current.key, size }) : form },
      )
      submission.current = { signature: '', key: '' }
      activeTask.current = started.id
      setGenerationId(started.id)
      window.history.replaceState(null, '', `/?task=${encodeURIComponent(started.id)}`)
      if (started.filtered) toast('已移除不适合效果预览的描述词，保留款式相关要求')
      await loadTask(started.id).catch(() => {
        toast('任务已提交，正在重新获取进度')
      })
      void nailFetch<{ shop: { credits: number } }>('/api/nail/shop')
        .then(({ shop }) => setBalance(shop.credits)).catch(() => undefined)
      if (started.status !== 'pending') {
        setGenerating(false)
        submitLock.current = false
      }
    } catch (error) {
      setGenerating(false)
      submitLock.current = false
      toast.error(error instanceof Error ? error.message : '暂时无法开始生成')
    }
  }

  function reset() {
    activeTask.current = ''
    setGeneration(null)
    setGenerationId('')
    setGenerating(false)
    submitLock.current = false
    window.history.replaceState(null, '', '/')
  }

  return <MotionConfig reducedMotion="user" transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
    <LayoutGroup id="nail-workbench">
    <div className="nail-workbench mx-auto max-w-[1280px]">
    <PageTitle title="试一款美甲" detail="拍下顾客的手，选一款喜欢的美甲，先看看上手效果" />

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-8">
        <section className="border-b border-[var(--app-border)] pb-8">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-3"><span className="text-xs tabular-nums text-[var(--app-muted)]">01</span><h2 className="text-base font-medium">准备照片</h2></div><p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">手部照片保存 7 天，到期自动清理</p></div>
            {handPath ? <span className="flex items-center gap-1 text-xs font-medium text-[#47745b]"><Check className="size-4" />照片已就绪</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <FileTile title="顾客手部照片" description="正上方拍摄，手指自然放松" accept="image/*" capture="environment" preview={handPreview} busy={uploadingHand} onChange={file => void upload(file, 'hand')} onRemove={() => { setHandPath(''); setHandPreview(null) }} />
            <FileTile title="款式参考图" description="可选，上传想参考的款式" accept="image/*" preview={stylePreview} busy={uploadingStyle} onChange={file => void upload(file, 'style')} onRemove={() => { setStylePath(''); setStylePreview(null); setStyleName(''); setStyleId('') }} />
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--app-secondary)]"><Camera className="mt-0.5 size-4 shrink-0 text-[var(--app-secondary)]" /><span>拍摄时手掌放平、镜头正对手背；让甲面清楚入镜。预览以保留原手和皮肤瑕疵为优先。</span></p>
        </section>

        <section className="border-b border-[var(--app-border)] pb-8">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="flex items-center gap-3"><span className="text-xs tabular-nums text-[var(--app-muted)]">02</span><h2 className="text-base font-medium">选择款式</h2></div><p className="mt-2 break-words text-xs leading-5 text-[var(--app-muted)]">{stylePath ? `参考图：${styleName}` : '选一款店内常用款式，或上传参考图'}</p></div>
            <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs font-medium text-[var(--app-secondary)] hover:border-[#8fa895]">
              <ImagePlus className="size-4" />上传款式图
              <input type="file" accept="image/*" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file, 'style'); event.currentTarget.value = '' }} />
            </label>
          </div>
          {stylePath ? <div className="mb-4 flex items-center gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-page)] p-3"><img src={stylePreview || ''} alt="已上传的款式参考图" className="size-14 rounded object-cover" /><span className="min-w-0 flex-1 truncate text-xs font-medium">{styleName}</span><button type="button" onClick={() => { setStylePath(''); setStylePreview(null); setStyleId('') }} className="grid size-8 place-items-center rounded-md text-[var(--app-muted)] hover:bg-white" aria-label="移除款式图"><X className="size-4" /></button></div> : null}
          {user.role === 'owner' ? <ShopStyleManager onStylesChange={onStylesChange} /> : null}
          <div className="hide-scrollbar -mx-1 mb-3 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} className={`h-8 shrink-0 rounded-md px-3 text-xs font-medium transition ${category === item ? 'bg-[#173b32] text-white' : 'bg-[var(--app-raised)] text-[var(--app-secondary)] hover:bg-[#e5ebe4]'}`}>{item}</button>)}
          </div>
          {filteredStyles.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3">
            {filteredStyles.map(item => {
              const selected = styleId === item.id
              return <article key={item.id} className={`relative overflow-hidden rounded-md border transition ${selected ? 'border-[#47745b] ring-2 ring-[#47745b]/15' : 'border-[var(--app-border)] hover:border-[#a6b9a8]'}`}>
                <button type="button" aria-pressed={selected} onClick={() => chooseStyle(item)} className="group block w-full text-left">
                  <span className="relative block aspect-[4/3] overflow-hidden bg-[var(--app-raised)]"><motion.img layoutId={`style-${item.id}`} src={styleImageUrl(item.id)} alt="" className="size-full object-cover" />{selected ? <motion.span layoutId="selected-style-indicator" className="absolute right-2 top-2 grid size-6 place-items-center rounded bg-[#173b32] text-white"><Check className="size-4" /></motion.span> : null}</span>
                  <span className="block p-3 pr-9"><span className="block truncate text-xs font-medium text-[var(--app-ink)]">{item.name}</span><span className="mt-1 block truncate text-xs text-[var(--app-muted)]">{item.tags.split(',').slice(0, 2).join(' · ')}</span></span>
                </button>
                <button type="button" title="放大款式图片" aria-label={`放大查看${item.name}`} onClick={() => setLightbox({ src: styleImageUrl(item.id), title: item.name, layoutId: `style-${item.id}` })} className="absolute right-1 bottom-2 grid size-8 place-items-center rounded-sm text-[var(--app-secondary)] transition-colors duration-150 hover:bg-[#e8eee7]"><Maximize2 className="size-4" /></button>
              </article>
            })}
          </div> : <div className="rounded-md border border-dashed border-[var(--app-border)] py-8 text-center text-xs text-[var(--app-muted)]">这个分类暂时没有款式</div>}
        </section>

        <section className="border-b border-[var(--app-border)] pb-8">
          <div className="flex items-center gap-3"><span className="text-xs tabular-nums text-[var(--app-muted)]">03</span><h2 className="text-base font-medium">补充要求</h2><span className="text-xs text-[var(--app-muted)]">选填</span></div>
          <label htmlFor="extra-prompt" className="sr-only">给款式补充描述</label>
          <textarea id="extra-prompt" value={extraPrompt} maxLength={200} onChange={event => setExtraPrompt(event.target.value)} rows={3} placeholder="例如：秋冬奶茶风，低饱和猫眼；想要短甲日常款，无名指加两颗小钻" className="mt-4 min-h-24 w-full resize-y rounded-md border border-[var(--app-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--app-ink)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-[#78957d] focus:ring-2 focus:ring-[#78957d]/15" />
          <div className="mt-2 flex justify-between gap-3 text-xs leading-5 text-[var(--app-muted)]"><span>可以补充颜色、甲面工艺和配饰</span><span className="shrink-0 tabular-nums">{extraPrompt.length}/200</span></div>
        </section>

        <section className="border-b border-[var(--app-border)] pb-8">
          <div className="mb-4 flex items-center gap-3"><span className="text-xs tabular-nums text-[var(--app-muted)]">04</span><h2 className="text-base font-medium">预览设置</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="mb-2 text-xs font-medium text-[var(--app-secondary)]">使用场景</p><div className="grid grid-cols-2 rounded-md bg-[var(--app-raised)] p-1">
              {(['preview', 'promo'] as const).map((value, index) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`relative h-9 rounded-sm text-xs font-medium transition-colors duration-150 ${mode === value ? 'text-[#244938]' : 'text-[var(--app-secondary)]'}`}>{mode === value ? <motion.span layoutId="mode-indicator" className="absolute inset-0 rounded-sm bg-white shadow-sm" /> : null}<span className="relative">{index === 0 ? '真实沟通版' : '宣传展示版'}</span></button>)}
            </div></div>
            <div><p className="mb-2 text-xs font-medium text-[var(--app-secondary)]">图片尺寸</p><div className="grid grid-cols-2 rounded-md bg-[var(--app-raised)] p-1">
              {(['1k', '4k'] as const).map((value, index) => <button key={value} type="button" aria-pressed={size === value} onClick={() => setSize(value)} className={`relative h-9 rounded-sm text-xs font-medium transition-colors duration-150 ${size === value ? 'text-[#244938]' : 'text-[var(--app-secondary)]'}`}>{size === value ? <motion.span layoutId="size-indicator" className="absolute inset-0 rounded-sm bg-white shadow-sm" /> : null}<span className="relative">{index === 0 ? `标准 1K · ${priceFor('1k') ?? '—'} 点` : `高清 4K · ${priceFor('4k') ?? '—'} 点`}</span></button>)}
            </div></div>
          </div>
          {balance !== null ? <p className="mt-3 text-xs text-[var(--app-muted)]">店铺可用 {formatPoints(balance)} 点{user.role === 'staff' ? ' · 与店主共用点数' : ''}</p> : null}
          <button type="button" disabled={generating || uploadingHand || uploadingStyle || !handPath || (!styleId && !stylePath) || price === null} onClick={() => void generate()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#173b32] px-4 text-sm font-medium text-white transition hover:bg-[#245344] disabled:cursor-not-allowed disabled:bg-[#9eafa3]">
            {generating ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            {generating ? `生成中 · 已等待 ${elapsed} 秒` : `生成效果预览 · ${price ?? '—'} 点`}
          </button>
          {balance !== null && price !== null && balance < price ? <p className="mt-2 flex items-center gap-1 text-xs text-[#ad6a4d]"><CircleAlert className="size-4" />点数不足，请联系店主兑换充值码</p> : null}
        </section>

        {generation ? <section className="scroll-mt-20 border-b border-[var(--app-border)] pb-8" id="generation-result">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">上手效果</h2>
            {generation.status === 'success' ? <div className="flex gap-2"><a href={`${generationImageUrl(generation.id)}&download=1`} className="flex h-9 items-center gap-2 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs font-medium text-[var(--app-secondary)] hover:border-[#8fa895]"><Download className="size-4" />下载</a><button type="button" onClick={reset} className="flex h-9 items-center gap-2 rounded-md bg-[#173b32] px-3 text-xs font-medium text-white hover:bg-[#245344]"><RefreshCw className="size-4" />换个款式</button></div> : null}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={generation.status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
              {generation.status === 'pending' ? <div className="grid min-h-48 place-items-center rounded-md bg-[var(--app-raised)]"><div className="text-center"><LoaderCircle className="mx-auto size-6 animate-spin text-[#47745b]" /><p className="mt-3 text-sm font-medium text-[var(--app-secondary)]">正在生成这只手的款式效果</p><p className="mt-1 text-xs text-[var(--app-muted)]">通常约 30 秒，请稍候</p></div></div> : generation.status === 'success' ? <div className="grid gap-3 sm:grid-cols-2">
              <figure className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-raised)]"><figcaption className="px-3 py-2 text-xs font-medium text-[var(--app-secondary)]">顾客原手</figcaption><EnlargedImage layoutId={`generation-${generation.id}-hand`} src={generationImageUrl(generation.id, 'hand')} alt="顾客原手部照片" onZoom={() => setLightbox({ src: generationImageUrl(generation.id, 'hand'), title: '顾客原手部照片', layoutId: `generation-${generation.id}-hand` })} className="aspect-[4/3] w-full object-contain" /></figure>
              <figure className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-raised)]"><figcaption className="px-3 py-2 text-xs font-medium text-[var(--app-secondary)]">款式效果 · {generation.styleName}</figcaption><EnlargedImage layoutId={`generation-${generation.id}-result`} src={generationImageUrl(generation.id)} alt={`${generation.styleName}美甲效果预览`} onZoom={() => setLightbox({ src: generationImageUrl(generation.id, 'result', 'detail'), title: `${generation.styleName}美甲效果预览`, layoutId: `generation-${generation.id}-result` })} className="aspect-[4/3] w-full object-contain" /></figure>
            </div> : <div className="rounded-md border border-[#f0d8cb] bg-[#fff7f2] p-4 text-sm text-[#98674f]">{generation.failReason || '生成失败，点数已退回'}</div>}
            </motion.div>
          </AnimatePresence>
          {generation.status === 'success' && generation.notes ? <div className="mt-4 border-t border-[var(--app-border)] pt-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-medium text-[var(--app-ink)]">施工参考</h3><span className="text-xs text-[var(--app-muted)]">{generation.notes.difficulty || '难度未标'} · {generation.notes.estimated_minutes ? `${generation.notes.estimated_minutes} 分钟` : ''}</span></div>
            {generation.notes.materials?.length ? <p className="mt-2 text-xs leading-5 text-[var(--app-secondary)]">材料：{generation.notes.materials.join('、')}</p> : null}
            {generation.notes.steps?.length ? <ol className="mt-2 grid gap-2 text-xs leading-5 text-[var(--app-secondary)] sm:grid-cols-2">{generation.notes.steps.map((step, index) => <li key={`${index}-${step}`}><span className="mr-1.5 font-medium text-[var(--app-secondary)]">{index + 1}.</span>{step}</li>)}</ol> : null}
            {generation.notes.warnings?.length ? <p className="mt-2 text-xs leading-5 text-[#a3664b]">留意：{generation.notes.warnings.join('；')}</p> : null}
          </div> : null}
          {generation.status === 'success' ? <button type="button" disabled={generating || !handPath || !generation.inputStylePath} onClick={() => void generate(true)} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--app-border)] bg-white text-xs font-medium disabled:opacity-50"><RefreshCw className="size-4" />同款再生成 · {price ?? '—'} 点</button> : null}
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--app-muted)]"><CircleAlert className="mt-0.5 size-4 shrink-0" />图片用于与顾客沟通款式方向，实际施工前请美甲师根据甲面和现有材料确认细节。</p>
        </section> : null}
      </div>

      <ImageLightbox preview={lightbox} onClose={() => setLightbox(null)} />
      <aside className="hidden xl:block">
        <div className="sticky top-8 space-y-4">
          <div className="border-b border-[var(--app-border)] pb-6">
            <p className="text-xs text-[var(--app-muted)]">当前店铺</p>
            <p className="mt-2 truncate text-sm font-medium">{user.shopName}</p>
            <div className="mt-6 flex items-end justify-between"><span className="text-xs text-[var(--app-muted)]">可用点数</span><span className="text-[28px] leading-none font-medium tabular-nums text-[#244938]">{balance === null ? '—' : formatPoints(balance)}</span></div>
          </div>
          <div className="border-b border-[var(--app-border)] py-4">
            <p className="text-sm font-medium">拍照时留意</p>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-[var(--app-secondary)]"><li>手掌自然放平，手指不要用力绷直</li><li>镜头正对手背，手指不要重叠</li><li>让每片指甲清楚、完整地入镜</li><li>保留原光线，关闭美颜和滤镜</li></ul>
          </div>
          <div className="py-4 text-xs leading-6 text-[var(--app-secondary)]">
            <p className="text-sm font-medium text-[var(--app-ink)]">对照原手确认</p>
            <p className="mt-3">预览优先保留原手型、肤色和甲长。完成后再对照原图，与顾客一起确认细节。</p>
          </div>
        </div>
      </aside>
    </div>
    </div>
    </LayoutGroup>
  </MotionConfig>
}
