// ABOUTME: Tests for the SummaryEventBus pub/sub system.
// ABOUTME: Validates subscription, emission, singleton lifecycle, and done semantics.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SummaryEventBus, createBus, getActiveBus, type SummaryEvent } from './events'

describe('SummaryEventBus', () => {
  it('delivers token events to subscribers', () => {
    const bus = new SummaryEventBus()
    const received: SummaryEvent[] = []
    bus.subscribe((evt) => received.push(evt))

    bus.emitToken('hacker_news', 'Hello')
    bus.emitToken('hacker_news', ' world')

    expect(received).toEqual([
      { type: 'token', sensor: 'hacker_news', token: 'Hello' },
      { type: 'token', sensor: 'hacker_news', token: ' world' },
    ])
  })

  it('delivers state events to subscribers', () => {
    const bus = new SummaryEventBus()
    const received: SummaryEvent[] = []
    bus.subscribe((evt) => received.push(evt))

    bus.emitState('arxiv', 'running', 'ArXiv', null)
    bus.emitState('arxiv', 'failed', 'ArXiv', 'timeout')

    expect(received).toEqual([
      { type: 'state', sensor: 'arxiv', state: 'running', label: 'ArXiv', error: null },
      { type: 'state', sensor: 'arxiv', state: 'failed', label: 'ArXiv', error: 'timeout' },
    ])
  })

  it('emitDone marks bus inactive and clears listeners', () => {
    const bus = new SummaryEventBus()
    const received: SummaryEvent[] = []
    bus.subscribe((evt) => received.push(evt))

    expect(bus.isActive).toBe(true)
    bus.emitDone()
    expect(bus.isActive).toBe(false)
    expect(received).toEqual([{ type: 'done' }])

    // Further emissions are silently ignored
    bus.emitToken('test', 'ignored')
    expect(received).toHaveLength(1)
  })

  it('unsubscribe removes the listener', () => {
    const bus = new SummaryEventBus()
    const received: SummaryEvent[] = []
    const unsub = bus.subscribe((evt) => received.push(evt))

    bus.emitToken('a', 'x')
    unsub()
    bus.emitToken('a', 'y')

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ type: 'token', sensor: 'a', token: 'x' })
  })

  it('supports multiple subscribers', () => {
    const bus = new SummaryEventBus()
    const a: SummaryEvent[] = []
    const b: SummaryEvent[] = []
    bus.subscribe((evt) => a.push(evt))
    bus.subscribe((evt) => b.push(evt))

    bus.emitToken('s', 't')

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('emitDone is idempotent', () => {
    const bus = new SummaryEventBus()
    const listener = vi.fn()
    bus.subscribe(listener)

    bus.emitDone()
    bus.emitDone() // second call should be a no-op
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('singleton lifecycle', () => {
  beforeEach(() => {
    // Ensure clean state — create and immediately done
    const existing = getActiveBus()
    if (existing?.isActive) existing.emitDone()
  })

  it('getActiveBus returns null when no bus exists', () => {
    expect(getActiveBus()).toBeNull()
  })

  it('createBus establishes a new active bus', () => {
    const bus = createBus()
    expect(bus.isActive).toBe(true)
    expect(getActiveBus()).toBe(bus)
    bus.emitDone()
  })

  it('createBus replaces an existing active bus', () => {
    const bus1 = createBus()
    const bus2 = createBus()
    expect(bus1.isActive).toBe(false) // old bus was marked done
    expect(bus2.isActive).toBe(true)
    expect(getActiveBus()).toBe(bus2)
    bus2.emitDone()
  })

  it('getActiveBus returns null after bus emits done', () => {
    const bus = createBus()
    bus.emitDone()
    expect(getActiveBus()).toBeNull()
  })
})
