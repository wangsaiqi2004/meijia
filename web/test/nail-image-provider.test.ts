import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'

const { PrismaClient } = await import('@prisma/client')
const { CONFIG_KEYS } = await import('../src/lib/nail/system-config')
const { encryptProviderSecret } = await import('../src/lib/nail/provider-secrets')
const prisma = new PrismaClient()
const dataDir = await mkdtemp(join(tmpdir(), 'nail-image-provider-'))
const previousDataDir = process.env.NAIL_DATA_DIR
process.env.NAIL_DATA_DIR = dataDir

test('nail image edits request max quality in both modes', async () => {
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
    if (previousApiKey === undefined) delete process.env.IMAGE_API_KEY
    else process.env.IMAGE_API_KEY = previousApiKey
  }
})

test('image and notes requests use the current encrypted administrator provider settings', async () => {
  const previousEncryptionKey = process.env.NAIL_CONFIG_ENCRYPTION_KEY
  const previousFetch = globalThis.fetch
  const requests: { url: string; authorization: string; body: BodyInit | null | undefined }[] = []
  const apiKey = 'configured-provider-test-key'
  const baseUrl = 'https://configured.example.test/custom/v1'
  const encryptionKey = Buffer.alloc(32, 7).toString('base64')
  process.env.NAIL_CONFIG_ENCRYPTION_KEY = encryptionKey

  try {
    await mkdir(dataDir, { recursive: true })
    const png = await sharp({
      create: { width: 128, height: 128, channels: 4, background: { r: 210, g: 180, b: 160, alpha: 1 } },
    }).png().toBuffer()
    await writeFile(join(dataDir, 'hand.png'), png)
    await writeFile(join(dataDir, 'style.png'), png)
    await prisma.systemConfig.upsert({
      where: { key: CONFIG_KEYS.provider },
      update: { value: JSON.stringify({
        version: 1,
        apiBaseUrl: baseUrl,
        imageModel: 'custom/image-v3',
        textModel: 'custom/text-v2',
        encryptedApiKey: encryptProviderSecret(apiKey),
      }) },
      create: { key: CONFIG_KEYS.provider, value: JSON.stringify({
        version: 1,
        apiBaseUrl: baseUrl,
        imageModel: 'custom/image-v3',
        textModel: 'custom/text-v2',
        encryptedApiKey: encryptProviderSecret(apiKey),
      }) },
    })
    globalThis.fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('authorization') || '',
        body: init?.body,
      })
      if (String(input).endsWith('/images/edits')) {
        return Response.json({ data: [{ b64_json: png.toString('base64') }] })
      }
      if (String(input).endsWith('/chat/completions')) {
        return Response.json({ choices: [{ message: { content: '{"materials":[],"steps":[]}' } }] })
      }
      return Response.json({ data: [{ b64_json: Buffer.from('provider response').toString('base64') }] })
    }) as typeof fetch

    const { editNailImage, createCraftNotes } = await import('../src/lib/nail/image-provider')
    await editNailImage({
      handPath: 'hand.png',
      stylePath: 'style.png',
      prompt: 'custom provider test',
      size: '1k',
      styleName: 'test',
    })
    assert.deepEqual(await createCraftNotes('test', ''), { materials: [], steps: [], warnings: [], estimated_minutes: null, difficulty: '' })
    assert.deepEqual(requests.map(request => request.url), [
      `${baseUrl}/images/edits`,
      `${baseUrl}/chat/completions`,
    ])
    assert.deepEqual(requests.map(request => request.authorization), [
      `Bearer ${apiKey}`,
      `Bearer ${apiKey}`,
    ])
    assert.equal((requests[0].body as FormData).get('model'), 'custom/image-v3')
    assert.equal(JSON.parse(String(requests[1].body)).model, 'custom/text-v2')
    assert.equal((await prisma.systemConfig.findUniqueOrThrow({ where: { key: CONFIG_KEYS.provider } })).value.includes(apiKey), false)
  } finally {
    globalThis.fetch = previousFetch
    if (previousEncryptionKey === undefined) delete process.env.NAIL_CONFIG_ENCRYPTION_KEY
    else process.env.NAIL_CONFIG_ENCRYPTION_KEY = previousEncryptionKey
    await prisma.systemConfig.deleteMany({ where: { key: CONFIG_KEYS.provider } })
    await prisma.configAudit.deleteMany({ where: { configKey: CONFIG_KEYS.provider } })
  }
})

after(async () => {
  await prisma.$disconnect()
  if (previousDataDir === undefined) delete process.env.NAIL_DATA_DIR
  else process.env.NAIL_DATA_DIR = previousDataDir
  await rm(dataDir, { recursive: true, force: true })
})
