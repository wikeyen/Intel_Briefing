// ABOUTME: Cron sidecar for Docker deployment — triggers the pipeline on schedule.
// ABOUTME: Uses node-cron to hit /api/fetch on the frontend container.
import cron from 'node-cron'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://frontend:3000'
const FETCH_TIMES = process.env.FETCH_TIMES ?? process.env.FETCH_TIME ?? '06:30,18:30'
const FETCH_TIMEZONE = process.env.FETCH_TIMEZONE ?? 'Asia/Bangkok'
const FETCH_MODE = process.env.FETCH_MODE ?? 'fetch'

const times = FETCH_TIMES.split(',').map(t => t.trim())

console.log(`Cron sidecar started`)
console.log(`  Schedule: ${times.join(', ')} (${FETCH_TIMEZONE})`)
console.log(`  Mode: ${FETCH_MODE}`)
console.log(`  Target: ${FRONTEND_URL}/api/fetch`)

async function triggerPipeline(): Promise<void> {
  const url = `${FRONTEND_URL}/api/fetch`
  console.log(`[${new Date().toISOString()}] Triggering pipeline (mode=${FETCH_MODE})...`)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: FETCH_MODE }),
      signal: AbortSignal.timeout(300_000),
    })
    const body = await resp.text()
    console.log(`[${new Date().toISOString()}] Pipeline response: ${resp.status} ${body}`)
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Pipeline trigger failed:`, err)
  }
}

for (const time of times) {
  const [hour, minute] = time.split(':')
  const expr = `${minute} ${hour} * * *`
  console.log(`  Registered: ${expr}`)
  cron.schedule(expr, triggerPipeline, { timezone: FETCH_TIMEZONE })
}
