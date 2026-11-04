export type NailUser = {
  id: string
  username: string
  role: 'admin' | 'owner' | 'staff'
  shopId: string | null
  shopName: string | null
}

export async function nailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '请求失败，请稍后再试')
  return result as T
}

export function formatPoints(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function styleImageUrl(id: string): string {
  return `/api/nail/style-preview/${encodeURIComponent(id)}`
}

export function generationImageUrl(id: string, kind: 'result' | 'hand' = 'result'): string {
  return `/api/nail/media/${encodeURIComponent(id)}?kind=${kind}`
}

export function requestKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}

export function uploadImageUrl(path: string): string {
  return `/api/nail/upload?path=${encodeURIComponent(path)}`
}
