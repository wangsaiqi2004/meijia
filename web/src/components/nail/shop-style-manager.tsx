"use client"

import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, ImagePlus, LoaderCircle, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { nailFetch, styleImageUrl } from '@/lib/nail/client'

type Style = {
  id: string
  shopId: string | null
  name: string
  category: string
  tags: string
  imagePath: string
  enabled: boolean
  hidden: boolean
}

export function ShopStyleManager({ onStylesChange }: { onStylesChange: (styles: Style[]) => void }) {
  const [open, setOpen] = useState(false)
  const [styles, setStyles] = useState<Style[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('日常')
  const [tags, setTags] = useState('')
  const [imagePath, setImagePath] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function reload() {
    setLoading(true)
    try {
      const result = await nailFetch<{ styles: Style[] }>('/api/nail/styles?manage=1')
      setStyles(result.styles)
      onStylesChange(result.styles.filter(item => !item.hidden))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载款式失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void reload()
  }, [open])

  async function upload(file: File) {
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) {
      toast.error('请选择 4MB 以内的图片')
      return
    }
    setSaving(true)
    const localPreview = URL.createObjectURL(file)
    setImagePreview(previous => {
      if (previous.startsWith('blob:')) URL.revokeObjectURL(previous)
      return localPreview
    })
    setImagePath('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', 'library')
      const result = await nailFetch<{ path: string }>('/api/nail/upload', { method: 'POST', body: form })
      setImagePath(result.path)
      toast.success('款式图片已上传')
    } catch (error) {
      URL.revokeObjectURL(localPreview)
      setImagePreview('')
      toast.error(error instanceof Error ? error.message : '图片上传失败')
    } finally {
      setSaving(false)
    }
  }

  async function addStyle(event: React.FormEvent) {
    event.preventDefault()
    if (!imagePath) return toast.error('请先选择并上传款式图片')
    setSaving(true)
    try {
      await nailFetch('/api/nail/styles', {
        method: 'POST',
        body: JSON.stringify({ name, category, tags, imagePath }),
      })
      setName('')
      setCategory('日常')
      setTags('')
      setImagePath('')
      if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
      setImagePreview('')
      setAdding(false)
      await reload()
      toast.success('款式已加入本店款式库')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加款式失败')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(style: Style) {
    setSaving(true)
    try {
      await nailFetch('/api/nail/styles', {
        method: style.hidden ? 'PATCH' : 'DELETE',
        body: JSON.stringify({ id: style.id }),
      })
      await reload()
      toast.success(style.hidden ? '款式已恢复' : '款式已从本店移除')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新款式失败')
    } finally {
      setSaving(false)
    }
  }

  return <div className="mt-3 border-y border-[var(--app-border)]">
    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
      <div className="min-w-0">
        <h3 className="text-xs font-medium text-[var(--app-ink)]">本店款式管理</h3>
        <p className="mt-1 text-xs leading-4 text-[var(--app-muted)]">仅本店生效</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => { setOpen(value => !value); setAdding(false) }}
          aria-expanded={open}
          className="flex h-8 items-center gap-2 rounded-md border border-[var(--app-border)] px-3 text-xs font-medium text-[var(--app-secondary)] hover:bg-[var(--app-page)]"
        >
          {open ? <X className="size-4" /> : <Eye className="size-4" />}
          {open ? '收起' : '管理款式'}
        </button>
        {open ? <button
          type="button"
          onClick={() => setAdding(value => !value)}
          className="flex h-8 items-center gap-2 rounded-md bg-[#173b32] px-3 text-xs font-medium text-white hover:bg-[#245344]"
        >
          <Plus className="size-4" />添加
        </button> : null}
      </div>
    </div>
    {open ? <>
      {adding ? <form onSubmit={event => void addStyle(event)} className="grid gap-2 border-t border-[var(--app-border)] bg-[var(--app-page)] p-3 sm:grid-cols-2">
        <input required maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="款式名称，例如：奶茶色细闪" className="h-9 min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" />
        <input maxLength={40} value={category} onChange={event => setCategory(event.target.value)} placeholder="分类，例如：日常、猫眼、法式" className="h-9 min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" />
        <input maxLength={200} value={tags} onChange={event => setTags(event.target.value)} placeholder="标签，逗号分隔（选填）" className="h-9 min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 text-xs" />
        <div className="flex min-w-0 items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={event => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
            event.currentTarget.value = ''
          }} />
          <button type="button" disabled={saving} onClick={() => fileRef.current?.click()} className="flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-[#bfcdbf] bg-white px-2 text-xs text-[var(--app-secondary)] disabled:opacity-50">
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
            <span className="truncate">{imagePath ? '已上传，点击更换' : '上传款式图（最大 4MB）'}</span>
          </button>
          {imagePreview ? <img src={imagePreview} alt="款式图片预览" className="size-9 rounded-sm border border-[var(--app-border)] object-cover" /> : null}
          <button type="submit" disabled={saving || !imagePath} className="grid size-9 shrink-0 place-items-center rounded-md bg-[#52765d] text-white disabled:opacity-50" title="保存本店款式" aria-label="保存本店款式">
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
          </button>
        </div>
      </form> : null}
      {loading ? <div className="grid min-h-24 place-items-center border-t border-[var(--app-border)]"><LoaderCircle className="size-4 animate-spin text-[var(--app-secondary)]" /></div> : <div className="grid gap-2 border-t border-[var(--app-border)] p-3 sm:grid-cols-2">
        {styles.map(style => <article key={style.id} className={`flex min-w-0 items-center gap-3 rounded-sm border p-2 ${style.hidden ? 'border-dashed border-[var(--app-border)] bg-[#f7f8f5] opacity-70' : 'border-[var(--app-border)] bg-white'}`}>
          <img src={styleImageUrl(style.id)} alt="" className="size-12 shrink-0 rounded-sm bg-[var(--app-raised)] object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-[var(--app-ink)]">{style.name}</p>
            <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{style.category}{style.shopId ? ' · 本店添加' : ' · 内置款式'}{style.hidden ? ' · 已隐藏' : ''}</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void toggle(style)}
            title={style.hidden ? '恢复款式' : '从本店移除款式'}
            aria-label={`${style.hidden ? '恢复' : '移除'}${style.name}`}
            className={`grid size-8 shrink-0 place-items-center rounded-sm disabled:opacity-50 ${style.hidden ? 'text-[var(--app-secondary)] hover:bg-[var(--app-raised)]' : 'text-[#9a7561] hover:bg-[#fff1e9]'}`}
          >
            {style.hidden ? <RotateCcw className="size-4" /> : style.shopId ? <Trash2 className="size-4" /> : <EyeOff className="size-4" />}
          </button>
        </article>)}
        {!styles.length ? <div className="col-span-full py-5 text-center text-xs text-[var(--app-muted)]"><ImagePlus className="mx-auto mb-2 size-5" />还没有可管理的款式</div> : null}
      </div>}
    </> : null}
  </div>
}
