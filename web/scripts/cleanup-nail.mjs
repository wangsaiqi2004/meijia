const appUrl = process.env.NAIL_APP_URL || 'http://app:3000'
const secret = process.env.CRON_SECRET
const intervalMs = 60 * 1000
let lastDaily = 0

async function cleanup() {
  if (!secret) throw new Error('CRON_SECRET is required for image cleanup')
  const daily = Date.now() - lastDaily >= 24 * 60 * 60 * 1000
  const response = await fetch(`${appUrl}/api/nail/cron/cleanup${daily ? '?daily=1' : ''}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Cleanup endpoint returned ${response.status}`)
  if (daily) lastDaily = Date.now()
  const result = await response.json()
  if (daily || result.refunded) console.log(`Task maintenance: ${JSON.stringify(result)}`)
}

for (;;) {
  try {
    await cleanup()
  } catch (error) {
    console.error('Original image cleanup failed:', error)
  }
  await new Promise(resolve => setTimeout(resolve, intervalMs))
}
