// ABOUTME: SSE endpoint for streaming summary tokens and state changes to the frontend.
// ABOUTME: Subscribes to the SummaryEventBus and pushes events as server-sent events.

import { getActiveBus } from '@/lib/summary/events'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const bus = getActiveBus()

  if (!bus || !bus.isActive) {
    // No active summary — send a one-shot idle event
    const encoder = new TextEncoder()
    const body = encoder.encode('event: idle\ndata: {}\n\n')
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Stream closed — ignore
        }
      }

      const unsubscribe = bus.subscribe((evt) => {
        switch (evt.type) {
          case 'token':
            send('token', { sensor: evt.sensor, token: evt.token })
            break
          case 'state':
            send('state', { sensor: evt.sensor, state: evt.state, label: evt.label, error: evt.error })
            break
          case 'done':
            send('done', {})
            try { controller.close() } catch { /* already closed */ }
            break
        }
      })

      // If the bus is already done by the time we subscribe (race condition), close immediately
      if (!bus.isActive) {
        send('done', {})
        try { controller.close() } catch { /* already closed */ }
        unsubscribe()
        return
      }

      // Clean up when the client disconnects
      controller.enqueue(encoder.encode(': connected\n\n'))

      // Store unsubscribe for cancel handler
      ;(controller as unknown as Record<string, unknown>).__unsub = unsubscribe
    },
    cancel(controller) {
      const unsub = (controller as unknown as Record<string, unknown>).__unsub as (() => void) | undefined
      unsub?.()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
