export type NailStyle = {
  id: string
  name: string
  category: string
  tags: string
  imagePath: string
  enabled: boolean
}

export const DEFAULT_STYLES: NailStyle[] = [
  { id: 'style-milk-tea', name: '秋冬奶茶棕', category: '日常', tags: '低饱和,通勤,暖色', imagePath: 'public:styles/style-milk-tea.png', enabled: true },
  { id: 'style-cat-eye', name: '低饱和猫眼', category: '猫眼', tags: '猫眼,单侧光带,日常', imagePath: 'public:styles/style-cat-eye.png', enabled: true },
  { id: 'style-french', name: '短甲奶油法式', category: '法式', tags: '短甲,法式,干净', imagePath: 'public:styles/style-french.png', enabled: true },
  { id: 'style-wine', name: '酒红微闪', category: '秋冬', tags: '酒红,细闪,成熟', imagePath: 'public:styles/style-wine.png', enabled: true },
  { id: 'style-matcha', name: '抹茶灰绿', category: '低饱和', tags: '灰绿,哑光,清冷', imagePath: 'public:styles/style-matcha.png', enabled: true },
  { id: 'style-pink', name: '裸粉透亮', category: '日常', tags: '裸粉,透亮,短甲', imagePath: 'public:styles/style-pink.png', enabled: true },
  { id: 'style-blue', name: '雾霾蓝猫眼', category: '猫眼', tags: '雾霾蓝,猫眼,冷色', imagePath: 'public:styles/style-blue.png', enabled: true },
  { id: 'style-chocolate', name: '巧克力跳色', category: '秋冬', tags: '巧克力,跳色,日常', imagePath: 'public:styles/style-chocolate.png', enabled: true },
  { id: 'style-pearl', name: '珍珠白细闪', category: '轻奢', tags: '珍珠,细闪,婚礼', imagePath: 'public:styles/style-pearl.png', enabled: true },
  { id: 'style-olive', name: '橄榄绿线条', category: '手绘', tags: '橄榄绿,线条,自然', imagePath: 'public:styles/style-olive.png', enabled: true },
  { id: 'style-apricot', name: '杏仁奶渐变', category: '渐变', tags: '杏仁,渐变,温柔', imagePath: 'public:styles/style-apricot.png', enabled: true },
  { id: 'style-black', name: '细线黑法式', category: '法式', tags: '黑色,细线,利落', imagePath: 'public:styles/style-black.png', enabled: true },
]

import type { PrismaClient } from '@prisma/client'

export async function listEnabledStyles(db: PrismaClient): Promise<NailStyle[]> {
  const rows = await db.styleLibrary.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
  return rows
}

const PALETTES: Record<string, [string, string, string]> = {
  'style-milk-tea': ['#f5e6d5', '#b97d63', '#70463d'],
  'style-cat-eye': ['#ead4db', '#aa6680', '#573e6e'],
  'style-french': ['#f6eee7', '#d9bfa9', '#fffaf5'],
  'style-wine': ['#e9c4c3', '#8b344b', '#431e31'],
  'style-matcha': ['#d3dfc8', '#73856d', '#3c514a'],
  'style-pink': ['#f7dce3', '#d69aab', '#fff4f5'],
  'style-blue': ['#d7e4ee', '#708cae', '#394c77'],
  'style-chocolate': ['#d9bca6', '#8c5b42', '#503129'],
  'style-pearl': ['#fff6ed', '#e8d4cf', '#d6b2c4'],
  'style-olive': ['#d8dec8', '#8b986e', '#596747'],
  'style-apricot': ['#fae5d2', '#da9e83', '#a95e62'],
  'style-black': ['#d8d2d0', '#544b4c', '#211c1f'],
}

export function nailSwatchSvg(id: string): string {
  const [light, mid, dark] = PALETTES[id.startsWith('style-') ? id : `style-${id}`] || PALETTES['style-milk-tea']
  const catEye = id.includes('cat-eye') || id.includes('blue')
  const french = id.includes('french')
  const shimmer = id.includes('pearl') || id.includes('wine')
  const nails = [0, 1, 2, 3, 4].map((index) => {
    const x = 36 + index * 51
    const y = index === 0 || index === 4 ? 93 : 68
    const h = index === 0 || index === 4 ? 186 : 216
    return `<g transform="rotate(${(index - 2) * 3} ${x + 22} ${y + h / 2})"><rect x="${x}" y="${y}" width="42" height="${h}" rx="21" fill="url(#polish)" stroke="${dark}" stroke-opacity=".25" stroke-width="2"/><ellipse cx="${x + 14}" cy="${y + 42}" rx="4" ry="${h * .27}" fill="#fff" opacity=".54"/>${catEye ? `<path d="M${x + 7} ${y + 35} Q${x + 22} ${y + 72} ${x + 35} ${y + h - 20}" stroke="#fff" stroke-width="6" opacity=".55" fill="none"/>` : ''}${french ? `<path d="M${x + 3} ${y + h - 43} Q${x + 21} ${y + h - 25} ${x + 39} ${y + h - 43} L${x + 39} ${y + h - 21} Q${x + 21} ${y + h - 7} ${x + 3} ${y + h - 21}Z" fill="#fffaf4"/>` : ''}${shimmer ? `<circle cx="${x + 28}" cy="${y + 95}" r="3" fill="#fff"/><circle cx="${x + 16}" cy="${y + 128}" r="2" fill="#fff" opacity=".8"/>` : ''}</g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 320 400"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${mid}" stop-opacity=".45"/></linearGradient><linearGradient id="polish" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient><radialGradient id="glow"><stop stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="320" height="400" fill="url(#bg)"/><ellipse cx="160" cy="185" rx="140" ry="164" fill="url(#glow)"/>${nails}<text x="160" y="350" text-anchor="middle" fill="${dark}" font-family="Arial,sans-serif" font-size="13" letter-spacing="1">NAIL STYLE STUDY</text></svg>`
}
