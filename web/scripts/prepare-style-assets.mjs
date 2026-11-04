import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/prepare-style-assets.mjs contact-sheet.png')
const names = ['milk-tea', 'cat-eye', 'french', 'wine', 'matcha', 'pink', 'blue', 'chocolate', 'pearl', 'olive', 'apricot', 'black']
const { width, height } = await sharp(source).metadata()
await mkdir('public/styles', { recursive: true })
for (const [index, name] of names.entries()) {
  const left = Math.round(index % 3 * width / 3) + 3
  const top = Math.round(Math.floor(index / 3) * height / 4) + 3
  const right = Math.round((index % 3 + 1) * width / 3) - 3
  const bottom = Math.round((Math.floor(index / 3) + 1) * height / 4) - 3
  await sharp(source).extract({ left, top, width: right - left, height: bottom - top })
    .resize(512, 512).png().toFile(`public/styles/style-${name}.png`)
}
console.log('Prepared 12 nail reference images.')
