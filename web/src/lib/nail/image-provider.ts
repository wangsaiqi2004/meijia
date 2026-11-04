import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { saveGeneratedImage, readStoredFile } from './storage'
import { nailSwatchSvg } from './styles'
import sharp from 'sharp'

const configuredBase = (process.env.IMAGE_API_BASE_URL || 'https://api.codexing.cn/v1').replace(/\/+$/, '')
const IMAGE_BASE_URL = configuredBase.endsWith('/v1') ? configuredBase : `${configuredBase}/v1`
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gpt-image-2.5-sunburst'
const TEXT_MODEL = process.env.TEXT_MODEL || 'gpt-4o-mini'

function fakeImage(styleName: string): Buffer {
  const safe = styleName.replace(/[<>&"]/g, '').slice(0, 24)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4ede3"/><stop offset="1" stop-color="#d9c2b2"/></linearGradient><linearGradient id="nail" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e7c6b2"/><stop offset=".55" stop-color="#d4948e"/><stop offset="1" stop-color="#80606b"/></linearGradient></defs><rect width="1024" height="1536" fill="url(#bg)"/><ellipse cx="512" cy="780" rx="280" ry="560" fill="#c99077" opacity=".55"/><g fill="url(#nail)" stroke="#6f4c52" stroke-width="10">${[0,1,2,3,4].map(i => `<rect x="${270 + i * 88}" y="${360 + (i % 2) * 12}" width="58" height="300" rx="29"/>`).join('')}</g><text x="512" y="1220" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#513f42">${safe}</text><text x="512" y="1280" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#6f5c5c">本地演示图 · 接入接口后生成真实效果</text></svg>`
  return Buffer.from(svg)
}

export async function readStyleReference(path: string): Promise<Buffer> {
  if (path.startsWith('swatch:')) return sharp(Buffer.from(nailSwatchSvg(path.slice('swatch:'.length)))).ensureAlpha().png().toBuffer()
  if (path.startsWith('public:')) {
    const relative = normalize(path.slice('public:'.length)).replace(/^[/\\]+/, '')
    if (relative.startsWith('..')) throw new Error('款式图片路径无效')
    return readFile(join(process.cwd(), 'public', relative))
  }
  return readStoredFile(path)
}

async function readImageResult(data: Record<string, unknown>): Promise<Buffer> {
  if (typeof data.b64_json === 'string') return Buffer.from(data.b64_json, 'base64')
  if (typeof data.url === 'string') {
    const response = await fetch(data.url, {
      headers: new URL(data.url).origin === new URL(IMAGE_BASE_URL).origin ? { Authorization: `Bearer ${process.env.IMAGE_API_KEY || ''}` } : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`图片下载失败：${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }
  throw new Error('接口未返回图片')
}

export async function editNailImage(input: {
  handPath: string
  stylePath: string
  prompt: string
  size: '1k' | '4k'
  styleName: string
  mode?: 'preview' | 'promo'
}): Promise<{ outputPath: string; apiCostCents: number }> {
  if (!process.env.IMAGE_API_KEY) {
    if (process.env.NODE_ENV === 'production' || process.env.NAIL_MOCK_IMAGES !== 'true') {
      throw new Error('生图服务尚未配置，请联系管理员；点数已自动退回')
    }
    const path = await saveGeneratedImage(fakeImage(input.styleName))
    return { outputPath: path, apiCostCents: 0 }
  }
  const form = new FormData()
  form.append('model', IMAGE_MODEL)
  form.append('prompt', input.prompt)
  form.append('n', '1')
  form.append('size', input.size === '4k' ? '2160x3840' : '1024x1536')
  form.append('quality', 'max')
  form.append('output_format', 'png')
  form.append('response_format', 'b64_json')
  form.append('image', new Blob([new Uint8Array(await readStoredFile(input.handPath))], { type: 'image/png' }), 'hand.png')
  form.append('image', new Blob([new Uint8Array(await readStyleReference(input.stylePath))], { type: 'image/png' }), 'style.png')
  const response = await fetch(`${IMAGE_BASE_URL}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.IMAGE_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(100_000),
  })
  const body = await response.json().catch(() => ({})) as { data?: Record<string, unknown>[]; error?: { message?: string } }
  if (!response.ok) throw new Error(`生图接口暂时不可用（${response.status}），点数会自动退回`)
  const item = body.data?.[0]
  if (!item) throw new Error('接口没有返回图片')
  const outputPath = await saveGeneratedImage(await readImageResult(item))
  return { outputPath, apiCostCents: input.size === '4k' ? 10 : 1 }
}

export async function createCraftNotes(styleName: string, extraPrompt: string): Promise<Record<string, unknown> | null> {
  if (!process.env.IMAGE_API_KEY || !process.env.TEXT_MODEL) return null
  const response = await fetch(`${IMAGE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.IMAGE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: `为美甲师输出 JSON 施工说明。款式：${styleName}。补充：${extraPrompt}。只允许常见甲油胶、猫眼胶、贴饰和手绘工艺，保留顾客原甲型与长度。字段：materials, steps, estimated_minutes, difficulty, warnings。` }],
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => ({})) as { choices?: { message?: { content?: string } }[] }
  const content = body.choices?.[0]?.message?.content
  if (!content) return null
  try {
    const notes = JSON.parse(content)
    if (!notes || typeof notes !== 'object') return null
    const list = (value: unknown) => Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 12).map(item => item.slice(0, 240))
      : []
    return {
      materials: list(notes.materials), steps: list(notes.steps), warnings: list(notes.warnings),
      estimated_minutes: typeof notes.estimated_minutes === 'number' && Number.isFinite(notes.estimated_minutes)
        ? Math.max(0, Math.min(240, Math.round(notes.estimated_minutes))) : null,
      difficulty: typeof notes.difficulty === 'string' ? notes.difficulty.slice(0, 40) : '',
    }
  } catch { return null }
}

export async function loadSystemPrompt(): Promise<string> {
  const candidates = [
    process.env.SYSTEM_PROMPT_PATH,
    join(process.cwd(), 'prompts', 'system-prompt.md'),
    join(process.cwd(), '..', 'prompts', 'system-prompt.md'),
  ].filter((path): path is string => Boolean(path))
  for (const path of candidates) {
    try {
      return await readFile(path, 'utf8')
    } catch {}
  }
  return ''
}
