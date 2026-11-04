import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'

test('nail image edits request max quality in both modes', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'nail-image-provider-'))
  const previousDataDir = process.env.NAIL_DATA_DIR
  const previousApiKey = process.env.IMAGE_API_KEY
  const previousFetch = globalThis.fetch
  const requests: FormData[] = []

  process.env.NAIL_DATA_DIR = dataDir
  process.env.IMAGE_API_KEY = 'test-key'

  try {
    await mkdir(dataDir, { recursive: true })
    const png = await sharp({
      create: { width: 128, height: 128, channels: 4, background: { r: 220, g: 180, b: 160, alpha: 1 } },
    }).png().toBuffer()
    await writeFile(join(dataDir, 'hand.png'), png)
    await writeFile(join(dataDir, 'style.png'), png)

    globalThis.fetch = (async (_input, init) => {
      requests.push(init?.body as FormData)
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const { editNailImage } = await import('../src/lib/nail/image-provider')
    for (const mode of ['preview', 'promo'] as const) {
      await editNailImage({
        handPath: 'hand.png',
        stylePath: 'style.png',
        prompt: 'realistic nail preview',
        size: '1k',
        styleName: 'test',
        mode,
      })
    }

    assert.equal(requests.length, 2)
    assert.deepEqual(requests.map(request => request.get('quality')), ['max', 'max'])
  } finally {
    globalThis.fetch = previousFetch
    if (previousDataDir === undefined) delete process.env.NAIL_DATA_DIR
    else process.env.NAIL_DATA_DIR = previousDataDir
    if (previousApiKey === undefined) delete process.env.IMAGE_API_KEY
    else process.env.IMAGE_API_KEY = previousApiKey
    await rm(dataDir, { recursive: true, force: true })
  }
})
