import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

test('4K originals keep their resolution while previews stay small and delete together', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'nail-storage-'))
  process.env.NAIL_DATA_DIR = folder
  const { saveGeneratedImage, readStoredPreview, readStoredFile, deleteStoredFile } = await import('../src/lib/nail/storage')
  try {
    const input = await sharp({ create: { width: 2160, height: 3840, channels: 3, background: '#b88074' } }).png().toBuffer()
    const path = await saveGeneratedImage(input)
    const original = await sharp(await readStoredFile(path)).metadata()
    assert.deepEqual([original.width, original.height, original.format], [2160, 3840, 'png'])
    await rm(join(folder, `${path}.preview.webp`))
    const previews = await Promise.all([readStoredPreview(path), readStoredPreview(path)])
    const preview = await sharp(previews[0]).metadata()
    assert.deepEqual([preview.width, preview.height, preview.format], [648, 1152, 'webp'])
    assert.deepEqual(previews[0], previews[1])
    await deleteStoredFile(path)
    await assert.rejects(readStoredFile(path), { code: 'ENOENT' })
    await assert.rejects(readFile(join(folder, `${path}.preview.webp`)), { code: 'ENOENT' })
  } finally {
    delete process.env.NAIL_DATA_DIR
    await rm(folder, { recursive: true, force: true })
  }
})
