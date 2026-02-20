// ABOUTME: Integration tests for the streaming pipeline — bus singleton + token flow.
// ABOUTME: Validates that createBus/getActiveBus lifecycle and token emission work end-to-end.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBus, getActiveBus, type SummaryEvent } from './events'
import * as llm from './llm'
import * as refVerifier from './ref-verifier'
import { summarizeWithVerification } from './retry-with-verification'

const llmConfig = { base_url: 'https://test.ai/v1', api_key: 'k', model: 'm' }

describe('streaming integration', () => {
  beforeEach(() => {
    // Clean up any existing bus
    const existing = getActiveBus()
    if (existing?.isActive) existing.emitDone()
  })

  it('bus singleton lifecycle: create, active, done, null', () => {
    expect(getActiveBus()).toBeNull()

    const bus = createBus()
    expect(getActiveBus()).toBe(bus)
    expect(bus.isActive).toBe(true)

    bus.emitDone()
    expect(bus.isActive).toBe(false)
    expect(getActiveBus()).toBeNull()
  })

  it('creating a new bus terminates the old one', () => {
    const bus1 = createBus()
    const events1: SummaryEvent[] = []
    bus1.subscribe((e) => events1.push(e))

    const bus2 = createBus()
    expect(bus1.isActive).toBe(false)
    expect(bus2.isActive).toBe(true)
    expect(getActiveBus()).toBe(bus2)

    // bus1 received a done event when replaced
    expect(events1).toContainEqual({ type: 'done' })

    bus2.emitDone()
  })

  it('token flow: bus collects tokens emitted through onToken callback', () => {
    const bus = createBus()
    const collected: SummaryEvent[] = []
    bus.subscribe((e) => collected.push(e))

    // Simulate what summarizer does with onToken
    const onToken = (sensorName: string, token: string) => {
      bus.emitToken(sensorName, token)
    }

    onToken('hacker_news', 'Token1')
    onToken('hacker_news', 'Token2')
    onToken('__overall__', 'OverallToken')
    bus.emitState('hacker_news', 'ok', 'Hacker News', null)
    bus.emitDone()

    expect(collected).toEqual([
      { type: 'token', sensor: 'hacker_news', token: 'Token1' },
      { type: 'token', sensor: 'hacker_news', token: 'Token2' },
      { type: 'token', sensor: '__overall__', token: 'OverallToken' },
      { type: 'state', sensor: 'hacker_news', state: 'ok', label: 'Hacker News', error: null },
      { type: 'done' },
    ])
  })

  it('summarizeWithVerification passes onToken through to chatCompletionStream', async () => {
    // Mock chatCompletionStream to capture that it was called with onToken
    const streamSpy = vi.spyOn(llm, 'chatCompletionStream').mockReturnValue({
      tokens: (async function* () { yield 'tok' })(),
      fullText: Promise.resolve('{"summary":"ok","items":[]}'),
    })
    vi.spyOn(refVerifier, 'verifyRefs').mockResolvedValue({
      verified: [],
      failures: [],
    })

    const tokens: string[] = []
    await summarizeWithVerification({
      messages: [{ role: 'user', content: 'test' }],
      llmConfig,
      parseFn: (raw) => ({ raw, refs: [] }),
      knownUrls: new Set(),
      extractRefs: (parsed) => parsed.refs,
      applyVerified: (parsed, refs) => ({ ...parsed, refs }),
      onToken: (t) => tokens.push(t),
    })

    expect(streamSpy).toHaveBeenCalledTimes(1)
    // Verify onToken was passed in the opts
    const callOpts = streamSpy.mock.calls[0][2]
    expect(callOpts).toBeDefined()
    expect(typeof callOpts!.onToken).toBe('function')

    vi.restoreAllMocks()
  })

  it('summarizeWithVerification uses chatCompletion when onToken is not provided', async () => {
    const chatSpy = vi.spyOn(llm, 'chatCompletion').mockResolvedValue('{"summary":"ok","items":[]}')
    const streamSpy = vi.spyOn(llm, 'chatCompletionStream')
    vi.spyOn(refVerifier, 'verifyRefs').mockResolvedValue({
      verified: [],
      failures: [],
    })

    await summarizeWithVerification({
      messages: [{ role: 'user', content: 'test' }],
      llmConfig,
      parseFn: (raw) => ({ raw, refs: [] }),
      knownUrls: new Set(),
      extractRefs: (parsed) => parsed.refs,
      applyVerified: (parsed, refs) => ({ ...parsed, refs }),
      // No onToken — should use chatCompletion
    })

    expect(chatSpy).toHaveBeenCalledTimes(1)
    expect(streamSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
