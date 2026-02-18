// ABOUTME: Next.js instrumentation hook — runs once on server startup.
// ABOUTME: Initialises the SQLite database so it's ready before any request.

export async function register() {
  // Only initialise SQLite in the Node.js runtime — the Edge runtime
  // (used by middleware) doesn't support file: URLs.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDb } = await import('@/lib/db')
    await initDb()
  }
}
