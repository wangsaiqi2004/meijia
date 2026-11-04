"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Camera, Check, CircleAlert, Download, ImagePlus, LoaderCircle, Maximize2, RefreshCw, Sparkles, Upload, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'
import { toast } from 'sonner'
import { formatPoints, generationImageUrl, nailFetch, requestKey, styleImageUrl, uploadImageUrl, type NailUser } from '@/lib/nail/client'
import { generationPrice } from '@/lib/nail/pricing'
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

function PageTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="mb-6 sm:mb-8"><p className="text-[10px] font-semibold tracking-[0.16em] text-[#8a9c91]">{eyebrow}</p><h1 className="mt-2 text-[24px] leading-tight font-semibold text-[#20372e] sm:text-[28px]">{title}</h1><p className="mt-2 text-[13px] leading-5 text-[#718077]">{detail}</p></div>
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
      <div><h3 className="text-[13px] font-semibold text-[#2a4036]">{title}</h3><p className="mt-0.5 text-[11px] leading-4 text-[#87958c]">{description}</p></div>
      {preview ? <button type="button" onClick={onRemove} aria-label={`移除${title}`} className="grid size-8 shrink-0 place-items-center rounded-md text-[#8a9890] hover:bg-[#edf1ec]"><X className="size-4" /></button> : null}
    </div>
    <input ref={input} type="file" accept={accept} className="sr-only" onChange={event => {
      const file = event.target.files?.[0]
      if (file) onChange(file)
      event.currentTarget.value = ''
    }} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border text-left transition ${preview ? 'border-[#d8e0d8] bg-[#e8ece7]' : 'border-dashed border-[#cbd7cd] bg-[#f7f9f6] hover:border-[#8fa895] hover:bg-white'}`}>
      {preview ? <motion.img src={preview} alt={title} initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="size-full object-contain" /> : <span className="flex flex-col items-center px-3 text-center"><span className="mb-2 grid size-10 place-items-center rounded-md bg-[#e7eee7] text-[#426a55]">{capture ? <Camera className="size-[18px]" /> : <Upload className="size-[18px]" />}</span><span className="text-[12px] font-medium text-[#43584a]">{capture ? '拍照或从相册选择' : '选择款式参考图'}</span><span className="mt-1 text-[10px] text-[#97a39a]">{busy ? '正在上传…' : 'PNG / JPG，最大 4MB'}</span></span>}
      {busy ? <span className="absolute inset-0 grid place-items-center bg-[#f5f8f4]/80"><LoaderCircle className="size-5 animate-spin text-[#426a55]" /></span> : null}
    </button>
    {capture ? <label className="mt-2 flex min-h-9 cursor-pointer items-center justify-center gap-1 text-xs text-[#52675a]"><Camera className="size-3.5" />拍摄手部照片<input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) onChange(file); event.currentTarget.value = '' }} /></label> : null}
  </div>
}

function EnlargedImage({ src, alt, onZoom, className, layoutId }: {
  src: string; alt: string; onZoom: () => void; className: string; layoutId: string
}) {
  return <button type="button" onClick={onZoom} aria-label={`放大查看${alt}`} title="点击放大查看" className="group relative block w-full overflow-hidden">
    <motion.img layoutId={layoutId} src={src} alt={alt} className={className} />
    <span className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-md bg-black/55 text-white opacity-80 transition group-hover:opacity-100"><Maximize2 className="size-3.5" /></span>
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
  const price = generationPrice(size, isVip)

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
    void nailFetch<{ shop: { credits: number; isVip: boolean } }>('/api/nail/shop').then(({ shop }) => { setBalance(shop.credits); setIsVip(shop.isVip) }).catch(() => undefined)
  }, [])

  const loadTask = useCallback(async (id: string) => {
    const data = await nailFetch<{ generation: Generation }>(`/api/nail/generate?id=${encodeURIComponent(id)}`)
    setGeneration(data.generation)
    setGenerationId(data.generation.id)
    return data.generation
  }, [])

  useEffect(() => {
    const task = searchParams.get('task')
    if (!task || handledTask.current === task) return
    handledTask.current = task
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
    if (!generationId || generation?.status === 'success' || generation?.status === 'refunded') return
    let active = true
    const started = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
      void loadTask(generationId).then(item => {
        if (!active) return
        if (item.status === 'success' || item.status === 'refunded') {
          window.clearInterval(timer)
          setGenerating(false)
          submitLock.current = false
          void nailFetch<{ shop: { credits: number } }>('/api/nail/shop').then(({ shop }) => setBalance(shop.credits)).catch(() => undefined)
          if (item.status === 'refunded') toast.error(item.failReason || '生成失败，点数已退回')
          else document.getElementById('generation-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }).catch(() => undefined)
      if (Date.now() - started > 125_000) {
        window.clearInterval(timer)
        setGenerating(false)
        submitLock.current = false
        toast.error('等待时间较长，请到生成记录中查看任务状态')
      }
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
    if (balance !== null && balance < price) return toast.error('点数不足，请先兑换充值码')
    if (!handPath) return toast.error('请先上传顾客的手部照片')
    if (!styleId && !stylePath) return toast.error('请选择款式或上传参考图')
    if (uploadingHand || uploadingStyle) return toast.error('图片仍在上传，请稍等')
    submitLock.current = true
    setGenerating(true)
    const originalId = repeat ? generationId : ''
    setGeneration(null)
    setElapsed(0)
    try {
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
        { method: 'POST', body: originalId ? JSON.stringify({ idempotencyKey: submission.current.key }) : form },
      )
      submission.current = { signature: '', key: '' }
      setGenerationId(started.id)
      window.history.replaceState(null, '', `/?task=${encodeURIComponent(started.id)}`)
      if (started.filtered) toast('已移除不适合效果预览的描述词，保留款式相关要求')
      await loadTask(started.id)
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
    setGeneration(null)
    setGenerationId('')
    setGenerating(false)
    submitLock.current = false
    window.history.replaceState(null, '', '/')
  }

  return <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
    <LayoutGroup id="nail-workbench">
    <div className="nail-workbench mx-auto max-w-[1050px]">
    <PageTitle eyebrow="SALON DESIGN WORKSPACE" title="美甲效果预览" detail="按顾客真实手部和原甲条件，生成可沟通、可施工的款式参考。" />

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-lg border border-[#dfe6df] bg-[#fbfcf9] p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-[#e8f0e9] text-[11px] font-bold text-[#426a55]">1</span><h2 className="text-[14px] font-semibold">准备照片</h2></div><p className="mt-1 pl-8 text-[11px] text-[#87958c]">手部照片只用于本次预览，7 天后自动清理</p></div>
            {handPath ? <span className="flex items-center gap-1 text-[11px] font-medium text-[#47745b]"><Check className="size-3.5" />照片已就绪</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <FileTile title="顾客手部照片" description="正上方拍摄，手指自然放松" accept="image/*" capture="environment" preview={handPreview} busy={uploadingHand} onChange={file => void upload(file, 'hand')} onRemove={() => { setHandPath(''); setHandPreview(null) }} />
            <FileTile title="款式参考图" description="可选，上传想参考的款式" accept="image/*" preview={stylePreview} busy={uploadingStyle} onChange={file => void upload(file, 'style')} onRemove={() => { setStylePath(''); setStylePreview(null); setStyleName(''); setStyleId('') }} />
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-[#7c8c82]"><Camera className="mt-0.5 size-3.5 shrink-0 text-[#668571]" /><span>拍摄时手掌放平、镜头正对手背；让甲面清楚入镜。预览以保留原手和皮肤瑕疵为优先。</span></p>
        </section>

        <section className="rounded-lg border border-[#dfe6df] bg-[#fbfcf9] p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-[#e8f0e9] text-[11px] font-bold text-[#426a55]">2</span><h2 className="text-[14px] font-semibold">选择款式</h2></div><p className="mt-1 pl-8 text-[11px] text-[#87958c]">{stylePath ? `参考图：${styleName}` : '从常用款式开始，按需上传顾客参考图'}</p></div>
            <label className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[#d8e0d8] bg-white px-2.5 text-[11px] font-medium text-[#52675a] hover:border-[#8fa895]">
              <ImagePlus className="size-3.5" />上传款式图
              <input type="file" accept="image/*" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file, 'style'); event.currentTarget.value = '' }} />
            </label>
          </div>
          {stylePath ? <div className="mb-4 flex items-center gap-3 rounded-md border border-[#e1e8e1] bg-[#f6f8f4] p-2.5"><img src={stylePreview || ''} alt="已上传的款式参考图" className="size-14 rounded object-cover" /><span className="min-w-0 flex-1 truncate text-xs font-medium">{styleName}</span><button type="button" onClick={() => { setStylePath(''); setStylePreview(null); setStyleId('') }} className="grid size-8 place-items-center rounded-md text-[#819087] hover:bg-white" aria-label="移除款式图"><X className="size-4" /></button></div> : null}
          {user.role === 'owner' ? <ShopStyleManager onStylesChange={onStylesChange} /> : null}
          <div className="hide-scrollbar -mx-1 mb-3 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} className={`h-8 shrink-0 rounded-md px-3 text-[11px] font-medium transition ${category === item ? 'bg-[#173b32] text-white' : 'bg-[#eff3ee] text-[#697a6f] hover:bg-[#e5ebe4]'}`}>{item}</button>)}
          </div>
          {filteredStyles.length ? <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {filteredStyles.map(item => {
              const selected = styleId === item.id
              return <article key={item.id} className={`relative overflow-hidden rounded-md border transition ${selected ? 'border-[#47745b] ring-2 ring-[#47745b]/15' : 'border-[#e2e8e1] hover:border-[#a6b9a8]'}`}>
                <button type="button" aria-pressed={selected} onClick={() => chooseStyle(item)} className="group block w-full text-left">
                  <span className="relative block aspect-[4/3] overflow-hidden bg-[#edf0eb]"><motion.img layoutId={`style-${item.id}`} src={styleImageUrl(item.id)} alt="" className="size-full object-cover transition duration-200 group-hover:scale-[1.02]" />{selected ? <motion.span layoutId="selected-style-indicator" className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[#173b32] text-white"><Check className="size-3.5" /></motion.span> : null}</span>
                  <span className="block p-2.5 pr-9"><span className="block truncate text-[12px] font-semibold text-[#34483b]">{item.name}</span><span className="mt-1 block truncate text-[10px] text-[#8b998f]">{item.tags.split(',').slice(0, 2).join(' · ')}</span></span>
                </button>
                <button type="button" title="放大款式图片" aria-label={`放大查看${item.name}`} onClick={() => setLightbox({ src: styleImageUrl(item.id), title: item.name, layoutId: `style-${item.id}` })} className="absolute right-1 bottom-2 grid size-8 place-items-center rounded-sm text-[#6f8275] transition-colors duration-150 hover:bg-[#e8eee7]"><Maximize2 className="size-3.5" /></button>
              </article>
            })}
          </div> : <div className="rounded-md border border-dashed border-[#d7e0d7] py-8 text-center text-xs text-[#8b998f]">这个分类暂时没有款式</div>}
        </section>

        <section className="rounded-lg border border-[#dfe6df] bg-[#fbfcf9] p-4 sm:p-5">
          <div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-[#e8f0e9] text-[11px] font-bold text-[#426a55]">3</span><h2 className="text-[14px] font-semibold">补充一点感觉</h2><span className="text-[10px] text-[#a0aba3]">选填</span></div>
          <label htmlFor="extra-prompt" className="sr-only">给款式补充描述</label>
          <textarea id="extra-prompt" value={extraPrompt} maxLength={200} onChange={event => setExtraPrompt(event.target.value)} rows={3} placeholder="例如：秋冬奶茶风，低饱和猫眼；想要短甲日常款，无名指加两颗小钻" className="mt-4 min-h-24 w-full resize-y rounded-md border border-[#d8e0d8] bg-white px-3.5 py-3 text-[14px] leading-6 text-[#33473a] outline-none transition placeholder:text-[#a2ada4] focus:border-[#78957d] focus:ring-2 focus:ring-[#78957d]/15" />
          <div className="mt-1.5 flex justify-between gap-3 text-[10px] text-[#9aa69d]"><span>描述颜色、工艺或想要的感觉即可，手部保真规则始终生效</span><span className="shrink-0">{extraPrompt.length}/200</span></div>
        </section>

        <section className="rounded-lg border border-[#dfe6df] bg-[#fbfcf9] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-[#e8f0e9] text-[11px] font-bold text-[#426a55]">4</span><h2 className="text-[14px] font-semibold">预览设置</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="mb-2 text-[11px] font-medium text-[#718077]">使用场景</p><div className="grid grid-cols-2 rounded-md bg-[#eef2ed] p-1">
              {(['preview', 'promo'] as const).map((value, index) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`relative h-9 rounded-sm text-[11px] font-semibold transition-colors duration-150 ${mode === value ? 'text-[#244938]' : 'text-[#78877e]'}`}>{mode === value ? <motion.span layoutId="mode-indicator" className="absolute inset-0 rounded-sm bg-white shadow-sm" /> : null}<span className="relative">{index === 0 ? '真实沟通版' : '宣传展示版'}</span></button>)}
            </div></div>
            <div><p className="mb-2 text-[11px] font-medium text-[#718077]">图片尺寸</p><div className="grid grid-cols-2 rounded-md bg-[#eef2ed] p-1">
              {(['1k', '4k'] as const).map((value, index) => <button key={value} type="button" aria-pressed={size === value} onClick={() => setSize(value)} className={`relative h-9 rounded-sm text-[11px] font-semibold transition-colors duration-150 ${size === value ? 'text-[#244938]' : 'text-[#78877e]'}`}>{size === value ? <motion.span layoutId="size-indicator" className="absolute inset-0 rounded-sm bg-white shadow-sm" /> : null}<span className="relative">{index === 0 ? `标准 1K · ${generationPrice('1k', isVip)} 点` : `高清 4K · ${generationPrice('4k', isVip)} 点`}</span></button>)}
            </div></div>
          </div>
          {balance !== null ? <p className="mt-3 text-[11px] text-[#85938a]">店铺可用 {formatPoints(balance)} 点{user.role === 'staff' ? ' · 与店主共用点数' : ''}</p> : null}
          <button type="button" disabled={generating || uploadingHand || uploadingStyle || !handPath || (!styleId && !stylePath) || balance !== null && balance < price} onClick={() => void generate()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#173b32] px-4 text-sm font-semibold text-white transition hover:bg-[#245344] disabled:cursor-not-allowed disabled:bg-[#9eafa3]">
            {generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {generating ? `生成中 · 已等待 ${elapsed} 秒` : `生成效果预览 · ${price} 点`}
          </button>
          {balance !== null && balance < price ? <p className="mt-2 flex items-center gap-1 text-[11px] text-[#ad6a4d]"><CircleAlert className="size-3.5" />点数不足，请联系店主兑换充值码</p> : null}
        </section>

        {generation ? <section className="scroll-mt-20 rounded-lg border border-[#dfe6df] bg-[#fbfcf9] p-4 sm:p-5" id="generation-result">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-semibold tracking-[0.12em] text-[#8a9c91]">RESULT</p><h2 className="mt-1 text-[15px] font-semibold">效果预览</h2></div>
            {generation.status === 'success' ? <div className="flex gap-2"><a href={`${generationImageUrl(generation.id)}&download=1`} className="flex h-9 items-center gap-1.5 rounded-md border border-[#d8e0d8] bg-white px-3 text-[11px] font-semibold text-[#53685a] hover:border-[#8fa895]"><Download className="size-3.5" />下载</a><button type="button" onClick={reset} className="flex h-9 items-center gap-1.5 rounded-md bg-[#173b32] px-3 text-[11px] font-semibold text-white hover:bg-[#245344]"><RefreshCw className="size-3.5" />换个款式</button></div> : null}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={generation.status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
              {generation.status === 'pending' ? <div className="grid min-h-48 place-items-center rounded-md bg-[#f1f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-6 animate-spin text-[#47745b]" /><p className="mt-3 text-sm font-medium text-[#475a4c]">正在生成这只手的款式效果</p><p className="mt-1 text-xs text-[#8b998f]">通常约 30 秒，请稍候</p></div></div> : generation.status === 'success' ? <div className="grid gap-3 sm:grid-cols-2">
              <figure className="overflow-hidden rounded-md border border-[#e3e9e2] bg-[#f1f4ef]"><figcaption className="px-3 py-2 text-[11px] font-medium text-[#748279]">顾客原手</figcaption><EnlargedImage layoutId={`generation-${generation.id}-hand`} src={generationImageUrl(generation.id, 'hand')} alt="顾客原手部照片" onZoom={() => setLightbox({ src: generationImageUrl(generation.id, 'hand'), title: '顾客原手部照片', layoutId: `generation-${generation.id}-hand` })} className="aspect-[4/3] w-full object-contain" /></figure>
              <figure className="overflow-hidden rounded-md border border-[#e3e9e2] bg-[#f1f4ef]"><figcaption className="px-3 py-2 text-[11px] font-medium text-[#748279]">款式效果 · {generation.styleName}</figcaption><EnlargedImage layoutId={`generation-${generation.id}-result`} src={generationImageUrl(generation.id)} alt={`${generation.styleName}美甲效果预览`} onZoom={() => setLightbox({ src: generationImageUrl(generation.id, 'result', 'detail'), title: `${generation.styleName}美甲效果预览`, layoutId: `generation-${generation.id}-result` })} className="aspect-[4/3] w-full object-contain" /></figure>
            </div> : <div className="rounded-md border border-[#f0d8cb] bg-[#fff7f2] p-4 text-sm text-[#98674f]">{generation.failReason || '生成失败，点数已退回'}</div>}
            </motion.div>
          </AnimatePresence>
          {generation.status === 'success' && generation.notes ? <div className="mt-4 border-t border-[#e4e9e3] pt-4">
            <div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold text-[#30483a]">施工参考</h3><span className="text-[10px] text-[#87958c]">{generation.notes.difficulty || '难度未标'} · {generation.notes.estimated_minutes ? `${generation.notes.estimated_minutes} 分钟` : ''}</span></div>
            {generation.notes.materials?.length ? <p className="mt-2 text-[11px] leading-5 text-[#64756a]">材料：{generation.notes.materials.join('、')}</p> : null}
            {generation.notes.steps?.length ? <ol className="mt-2 grid gap-1.5 text-[11px] leading-5 text-[#64756a] sm:grid-cols-2">{generation.notes.steps.map((step, index) => <li key={`${index}-${step}`}><span className="mr-1.5 font-semibold text-[#668571]">{index + 1}.</span>{step}</li>)}</ol> : null}
            {generation.notes.warnings?.length ? <p className="mt-2 text-[11px] leading-5 text-[#a3664b]">留意：{generation.notes.warnings.join('；')}</p> : null}
          </div> : null}
          {generation.status === 'success' ? <button type="button" disabled={generating || !handPath || !generation.inputStylePath} onClick={() => void generate(true)} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#d8e0d8] bg-white text-xs font-semibold disabled:opacity-50"><RefreshCw className="size-3.5" />同款再生成 · {price} 点</button> : null}
          <p className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-[#8b998f]"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />图片用于与顾客沟通款式方向，实际施工前请美甲师根据甲面和现有材料确认细节。</p>
        </section> : null}
      </div>

      <ImageLightbox preview={lightbox} onClose={() => setLightbox(null)} />
      <aside className="hidden xl:block">
        <div className="sticky top-8 space-y-4">
          <div className="rounded-lg border border-[#dfe6df] bg-[#fbfcf9] p-4">
            <p className="text-[10px] font-semibold tracking-[0.13em] text-[#8a9c91]">当前店铺</p>
            <p className="mt-2 truncate text-[14px] font-semibold">{user.shopName}</p>
            <div className="mt-4 flex items-end justify-between border-t border-[#e5eae4] pt-3"><span className="text-[11px] text-[#839087]">可用点数</span><span className="text-[22px] leading-none font-semibold text-[#244938]">{balance === null ? '—' : formatPoints(balance)}</span></div>
          </div>
          <div className="rounded-lg border border-[#e6d9cf] bg-[#fffaf5] p-4">
            <p className="text-[12px] font-semibold text-[#735c4c]">拍摄更容易出好效果</p>
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-[#8b7767]"><li>手掌自然放平，避免手指用力绷直</li><li>镜头尽量正对手背，手指不要重叠</li><li>让指甲清晰、完整地进入画面</li><li>保持原光线，避免美颜和强滤镜</li></ul>
          </div>
          <div className="rounded-lg border border-[#dfe6df] bg-[#fbfcf9] p-4 text-[11px] leading-5 text-[#7c8b81]">
            <p className="font-semibold text-[#506457]">效果保真</p>
            <p className="mt-1.5">以原手型、肤色、甲长和皮肤瑕疵为优先。生成后请对照原图确认细节。</p>
          </div>
        </div>
      </aside>
    </div>
    </div>
    </LayoutGroup>
  </MotionConfig>
}
