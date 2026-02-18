// ABOUTME: Cron sidecar for Docker deployment — triggers the pipeline on schedule.
// ABOUTME: Uses node-cron to hit /api/cron/pipeline on the frontend container.
import cron from 'node-cron'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://frontend:8000'
const CRON_SECRET = process.env.CRON_SECRET ?? ''
const FETCH_TIME = process.env.FETCH_TIME ?? '07:51'
const FETCH_TIMEZONE = process.env.FETCH_TIMEZONE ?? 'Asia/Shanghai'

// Convert HH:MM to cron expression (minute hour * * *)
const [hour, minute] = FETCH_TIME.split(':')
const cronExpression = `${minute} ${hour} * * *`

console.log(`Cron sidecar started`)
console.log(`  Schedule: ${cronExpression} (${FETCH_TIMEZONE})`)
console.log(`  Target: ${FRONTEND_URL}/api/cron/pipeline`)

async function triggerPipeline(): Promise<void> {
  const url = `${FRONTEND_URL}/api/cron/pipeline`
  console.log(`[${new Date().toISOString()}] Triggering pipeline...`)

  try {
    const headers: Record<string, string> = {}
    if (CRON_SECRET) {
      headers['Authorization'] = `Bearer ${CRON_SECRET}`
    }

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(300_000) })
    const body = await resp.text()
    console.log(`[${new Date().toISOString()}] Pipeline response: ${resp.status} ${body}`)
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Pipeline trigger failed:`, err)
  }
}

cron.schedule(cronExpression, triggerPipeline, {
  timezone: FETCH_TIMEZONE,
})
