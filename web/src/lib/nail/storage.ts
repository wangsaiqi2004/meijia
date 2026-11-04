import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

export const DATA_DIR = process.env.NAIL_DATA_DIR || join(process.cwd(), '..', 'data')
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')

function safeRelative(value: string): string {
  if (value.includes(':') || value.split(/[/\\]/).some(part => part === '..' || part === '.')) {
    throw new Error('非法文件路径')
  }
  const normalized = normalize(value).replace(/^([/\\])+/, '')
  if (!normalized || normalized.startsWith('..') || normalized.includes(`..${'/'}`) || normalized.includes(`..${'\\'}`)) {
    throw new Error('非法文件路径')
  }
  return normalized
}

export function isShopUpload(path: string, kind: 'hand' | 'style', shopId: string): boolean {
  const match = /^uploads\/(hand|style)\/([^/]+)\/\d+-[a-f0-9-]+\.png$/.exec(path)
  return Boolean(match && match[1] === kind && match[2] === shopId)
}

export async function saveUploadedImage(file: File, kind: 'hand' | 'style' | 'library', shopId: string): Promise<string> {
  if (!file || !file.size || file.size > 4 * 1024 * 1024) throw new Error('图片需小于 4MB')
  if (!file.type.startsWith('image/')) throw new Error('请上传图片文件')
  const buffer = Buffer.from(await file.arrayBuffer())
  const meta = await sharp(buffer, { failOn: 'warning' }).metadata()
  if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) throw new Error('图片尺寸无效')
  let png: Buffer = Buffer.alloc(0)
  for (const width of [1280, 1024, 896, 768, 640]) {
    png = await sharp(buffer, { failOn: 'warning', limitInputPixels: 40_000_000 })
      .rotate()
      .resize(width, 1920, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer()
    if (png.length < 4 * 1024 * 1024) break
  }
  if (png.length >= 4 * 1024 * 1024) throw new Error('图片过于复杂，请换一张较小的照片')
  const relativePath = join('uploads', kind, shopId, `${Date.now()}-${randomUUID()}.png`)
  const absolutePath = join(DATA_DIR, relativePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, png)
  return relativePath.replaceAll('\\', '/')
}

export async function saveGeneratedImage(buffer: Buffer): Promise<string> {
  const png = await sharp(buffer, { failOn: 'warning' }).png().toBuffer()
  const relativePath = join('uploads', 'results', `${Date.now()}-${randomUUID()}.png`)
  const absolutePath = join(DATA_DIR, relativePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, png)
  const storedPath = relativePath.replaceAll('\\', '/')
  try {
    await readStoredPreview(storedPath)
    return storedPath
  } catch (error) {
    await deleteStoredFile(storedPath)
    throw error
  }
}

const previewJobs = new Map<string, Promise<Buffer>>()

export async function readStoredPreview(path: string): Promise<Buffer> {
  const absolutePath = join(DATA_DIR, safeRelative(path))
  const previewPath = `${absolutePath}.preview.webp`
  try { return await readFile(previewPath) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const existing = previewJobs.get(absolutePath)
  if (existing) return existing
  const job = (async () => {
    const image = await sharp(absolutePath, { limitInputPixels: 40_000_000 })
      .resize(768, 1152, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer()
    const temporaryPath = `${previewPath}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, image)
      await rename(temporaryPath, previewPath)
      return image
    } finally {
      await rm(temporaryPath, { force: true })
    }
  })()
  previewJobs.set(absolutePath, job)
  try { return await job } finally { previewJobs.delete(absolutePath) }
}

export async function readStoredFile(path: string): Promise<Buffer> {
  return readFile(join(DATA_DIR, safeRelative(path)))
}

export async function deleteStoredFile(path?: string | null): Promise<void> {
  if (!path) return
  const absolutePath = join(DATA_DIR, safeRelative(path))
  await Promise.all([absolutePath, `${absolutePath}.preview.webp`].map(async target => {
    try { await rm(target, { force: true }) } catch {}
  }))
}

export function resolveStoredPath(path: string): string {
  return join(DATA_DIR, safeRelative(path))
}

export function isStoredPath(path: string): boolean {
  const full = resolveStoredPath(path)
  return relative(DATA_DIR, full) === safeRelative(path)
}

async function removeExpiredFiles(folder: string, cutoff: number, protectedPaths: Set<string>): Promise<number> {
  let removed = 0
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      removed += await removeExpiredFiles(path, cutoff, protectedPaths)
      continue
    }
    if (!entry.isFile()) continue
    if (protectedPaths.has(relative(DATA_DIR, path).replaceAll('\\', '/'))) continue
    try {
      if ((await stat(path)).mtimeMs <= cutoff) {
        await rm(path, { force: true })
        removed++
      }
    } catch {}
  }
  return removed
}

export async function cleanupExpiredUploads(days = 7, protectedPaths = new Set<string>()): Promise<number> {
  const cutoff = Date.now() - days * 86_400_000
  let removed = 0
  for (const kind of ['hand', 'style']) {
    removed += await removeExpiredFiles(join(UPLOAD_DIR, kind), cutoff, protectedPaths)
  }
  return removed
}
