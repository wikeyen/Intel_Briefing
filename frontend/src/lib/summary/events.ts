// ABOUTME: In-memory pub/sub event bus for streaming summary tokens and state changes to SSE clients.
// ABOUTME: Singleton lifecycle — one active bus at a time, used by trigger routes and the SSE endpoint.

export type SummaryEvent =
  | { type: 'token'; sensor: string; token: string }
  | { type: 'state'; sensor: string; state: string; label: string; error: string | null }
  | { type: 'done' }

export type SummaryEventListener = (event: SummaryEvent) => void

export class SummaryEventBus {
  private listeners = new Set<SummaryEventListener>()
  private active = true

  /** Subscribe to events. Returns an unsubscribe function. */
  subscribe(listener: SummaryEventListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Emit a token event for a sensor. */
  emitToken(sensor: string, token: string): void {
    if (!this.active) return
    const event: SummaryEvent = { type: 'token', sensor, token }
    for (const listener of this.listeners) listener(event)
  }

  /** Emit a state change event for a sensor. */
  emitState(sensor: string, state: string, label: string, error: string | null): void {
    if (!this.active) return
    const event: SummaryEvent = { type: 'state', sensor, state, label, error }
    for (const listener of this.listeners) listener(event)
  }

  /** Emit the done event, marking this bus as inactive. */
  emitDone(): void {
    if (!this.active) return
    this.active = false
    const event: SummaryEvent = { type: 'done' }
    for (const listener of this.listeners) listener(event)
    this.listeners.clear()
  }

  /** Whether this bus is still accepting and emitting events. */
  get isActive(): boolean {
    return this.active
  }
}

// Module-level singleton
let activeBus: SummaryEventBus | null = null

/** Get the currently active bus, or null if none is running. */
export function getActiveBus(): SummaryEventBus | null {
  // Clean up stale inactive buses
  if (activeBus && !activeBus.isActive) {
    activeBus = null
  }
  return activeBus
}

/** Create a fresh bus, replacing any existing one. */
export function createBus(): SummaryEventBus {
  // Mark the old bus as done if it's still active
  if (activeBus?.isActive) {
    activeBus.emitDone()
  }
  activeBus = new SummaryEventBus()
  return activeBus
}
