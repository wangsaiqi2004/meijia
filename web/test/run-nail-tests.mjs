// Always use a disposable database, even when DATABASE_URL points at a real shop.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cwd = process.cwd()
const testDir = mkdtempSync(join(tmpdir(), 'nail-tests-'))
const dbPath = join(testDir, 'ledger.db')
writeFileSync(dbPath, '')
const dbUrl = `file:${dbPath.replaceAll('\\', '/')}`
process.env.DATABASE_URL = dbUrl
const env = { ...process.env, DATABASE_URL: dbUrl }

const TEST_FILES = [
  'test/nail-ledger.test.ts',
  'test/nail-storage.test.ts',
  'test/nail-image-provider.test.ts',
  'test/nail-config.test.ts',
]

try {
  execFileSync(
    process.execPath,
    [join(cwd, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    { cwd, env, stdio: 'pipe', timeout: 120_000 },
  )
} catch (error) {
  const detail = error?.stderr?.toString?.() || (error instanceof Error ? error.message : String(error))
  console.error(`[test:nail] prisma migrate deploy 失败 (${dbUrl})：\n${detail}`)
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [join(cwd, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', ...TEST_FILES],
  { cwd, env, stdio: 'inherit' },
)
if (result.error) {
  console.error('[test:nail] 启动测试进程失败：', result.error.message)
  process.exit(1)
}
rmSync(testDir, { recursive: true, force: true })
process.exit(result.status ?? 1)
