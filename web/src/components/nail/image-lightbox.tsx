"use client"

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Maximize2, X } from 'lucide-react'

type Preview = { src: string; title: string } | null

export function ImageLightbox({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    setZoomed(false)
  }, [preview?.src])

  return <Dialog.Root open={Boolean(preview)} onOpenChange={open => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed inset-0 z-[101] flex h-dvh w-screen flex-col bg-[#101311] text-white outline-none"
        onEscapeKeyDown={onClose}
      >
        <Dialog.Title className="sr-only">{preview ? `放大查看：${preview.title}` : '图片预览'}</Dialog.Title>
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
          <p className="min-w-0 truncate text-sm font-medium">{preview?.title}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setZoomed(value => !value)}
              aria-label={zoomed ? '缩小图片' : '放大图片'}
              aria-pressed={zoomed}
              title={zoomed ? '缩小图片' : '放大图片'}
              className="grid size-9 place-items-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
            >
              <Maximize2 className="size-4" />
            </button>
            <Dialog.Close
              type="button"
              aria-label="关闭图片预览"
              title="关闭"
              className="grid size-9 place-items-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-4 sm:px-6"
          onClick={event => { if (event.target === event.currentTarget) onClose() }}
        >
          {preview ? <div className={zoomed ? 'flex min-h-full w-max min-w-full items-center justify-center' : 'flex h-full w-full items-center justify-center'}>
            <img
              src={preview.src}
              alt={preview.title}
              onClick={() => setZoomed(value => !value)}
              className={zoomed
                ? 'h-auto w-[125vw] max-w-none shrink-0 cursor-zoom-out object-contain sm:w-[min(125vw,1600px)]'
                : 'max-h-[calc(100dvh-5rem)] max-w-full cursor-zoom-in object-contain'}
            />
          </div> : null}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
