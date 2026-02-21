// ABOUTME: Tests for the LLM retry-with-verification loop.
// ABOUTME: Validates retry on bad refs, max retries, correction message format, and passthrough on success.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { summarizeWithVerification } from './retry-with-verification'
import type { BriefingRef } from '../models'
import * as llm from './llm'
import * as refVerifier from './ref-verifier'

afterEach(() => {
  vi.restoreAllMocks()
})

const llmConfig = { base_url: 'https://test.ai/v1', api_key: 'k', model: 'm' }

describe('summarizeWithVerification', () => {
  it('returns immediately when all refs verify on first attempt', async () => {
    const chatSpy = vi.spyOn(llm, 'chatCompletion').mockResolvedValue('{"summary":"ok","items":[]}')
    vi.spyOn(refVerifier, 'verifyRefs').mockResolvedValue({
      verified: [],
      failures: [],
    })

    const result = await summarizeWithVerification({
      messages: [{ role: 'user', content: 'test' }],
      llmConfig,
      parseFn: (raw) => ({ raw, refs: [] as BriefingRef[] }),
      knownUrls: new Set(),
      extractRefs: (parsed) => parsed.refs,
      applyVerified: (parsed, refs) => ({ ...parsed, refs }),
    })

    expect(chatSpy).toHaveBeenCalledTimes(1)
    expect(result.raw).toBe('{"summary":"ok","items":[]}')
  })

  it('retries when refs fail verification', async () => {
    const chatSpy = vi.spyOn(llm, 'chatCompletion')
      .mockResolvedValueOnce('attempt-1')
      .mockResolvedValueOnce('attempt-2')

    vi.spyOn(refVerifier, 'verifyRefs')
      .mockResolvedValueOnce({
        verified: [{ title: 'Good', url: 'https://good.com', verified: true }],
        failures: [{ title: 'Bad', url: 'https://fake.com', verified: false }],
      })
      .mockResolvedValueOnce({
        verified: [
          { title: 'Good', url: 'https://good.com', verified: true },
          { title: 'Fixed', url: 'https://real.com', verified: true },
        ],
        failures: [],
      })

    const parseFn = vi.fn()
      .mockReturnValueOnce({
        refs: [
          { title: 'Good', url: 'https://good.com' },
          { title: 'Bad', url: 'https://fake.com' },
        ],
      })
      .mockReturnValueOnce({
        refs: [
          { title: 'Good', url: 'https://good.com' },
          { title: 'Fixed', url: 'https://real.com' },
        ],
      })

    await summarizeWithVerification({
      messages: [{ role: 'user', content: 'test' }],
      llmConfig,
      parseFn,
      knownUrls: new Set(['https://good.com', 'https://real.com']),
      extractRefs: (parsed) => parsed.refs,
      applyVerified: (parsed, refs) => ({ ...parsed, refs }),
    })

    expect(chatSpy).toHaveBeenCalledTimes(2)
    // Verify correction message was sent
    const secondCallMessages = chatSpy.mock.calls[1][0]
    expect(secondCallMessages).toContainEqual(
      expect.objectContaining({ role: 'assistant', content: 'attempt-1' }),
    )
    expect(secondCallMessages).toContainEqual(
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('https://fake.com'),
      }),
    )
  })

  it('stops after maxRetries and marks remaining failures', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('bad-output')

    vi.spyOn(refVerifier, 'verifyRefs').mockResolvedValue({
      verified: [],
      failures: [{ title: 'Always Bad', url: 'https://fake.com', verified: false }],
    })

    const parseFn = vi.fn().mockReturnValue({
      refs: [{ title: 'Always Bad', url: 'https://fake.com' }],
    })

    const result = await summarizeWithVerification({
      messages: [{ role: 'user', content: 'test' }],
      llmConfig,
      parseFn,
      knownUrls: new Set(),
      extractRefs: (parsed) => parsed.refs,
      applyVerified: (parsed, refs) => ({ ...parsed, refs }),
      maxRetries: 3,
    })

    // 1 initial + 3 retries = 4 calls
    expect(llm.chatCompletion).toHaveBeenCalledTimes(4)
    // Failed refs should be in the result with verified=false
    expect(result.refs).toContainEqual(
      expect.objectContaining({ url: 'https://fake.com', verified: false }),
    )
  })

  it('passes signal through to chatCompletion', async () => {
    const chatSpy = vi.spyOn(llm, 'chatCompletion').mockResolvedValue('ok')
    vi.spyOn(refVerifier, 'verifyRefs').mockResolvedValue({ verified: [], failures: [] })

    const controller = new AbortController()
    await summarizeWithVerification({
      messages: [{ role: 'user', content: 'test' }],
      llmConfig,
      parseFn: (raw) => ({ raw, refs: [] as BriefingRef[] }),
      knownUrls: new Set(),
      extractRefs: (parsed) => parsed.refs,
      applyVerified: (parsed, refs) => ({ ...parsed, refs }),
      signal: controller.signal,
    })

    expect(chatSpy).toHaveBeenCalledWith(
      expect.anything(),
      llmConfig,
      controller.signal,
    )
  })

  it('includes valid URLs in correction message', async () => {
    const chatSpy = vi.spyOn(llm, 'chatCompletion')
      .mockResolvedValueOnce('attempt-1')
      .mockResolvedValueOnce('attempt-2')

    vi.spyOn(refVerifier, 'verifyRefs')
      .mockResolvedValueOnce({
        verified: [],
        failures: [{ title: 'Bad', url: 'https://fake.com', verified: false }],
      })
      .mockResolvedValueOnce({ verified: [], failures: [] })

    const parseFn = vi.fn()
      .mockReturnValueOnce({ refs: [{ title: 'Bad', url: 'https://fake.com' }] })
      .mockReturnValueOnce({ refs: [] })

    await summarizeWithVerification({
      messages: [{ role: 'user', content: 'test' }],
      llmConfig,
      parseFn,
      knownUrls: new Set(['https://valid1.com', 'https://valid2.com']),
      extractRefs: (parsed) => parsed.refs,
      applyVerified: (parsed, refs) => ({ ...parsed, refs }),
    })

    // The correction message should list available valid URLs
    const secondCallMessages = chatSpy.mock.calls[1][0]
    const correctionMsg = secondCallMessages.find(
      (m: { role: string; content: string }, idx: number) => m.role === 'user' && idx > 0,
    )
    expect(correctionMsg?.content).toContain('https://valid1.com')
    expect(correctionMsg?.content).toContain('https://valid2.com')
  })

  it('calls onRetry callback on each retry', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('output')
    vi.spyOn(refVerifier, 'verifyRefs').mockResolvedValue({
      verified: [],
      failures: [{ title: 'Bad', url: 'https://fake.com', verified: false }],
    })

    const parseFn = vi.fn().mockReturnValue({
      refs: [{ title: 'Bad', url: 'https://fake.com' }],
    })

    const onRetry = vi.fn()

    await summarizeWithVerification({
      messages: [{ role: 'user', content: 'test' }],
      llmConfig,
      parseFn,
      knownUrls: new Set(),
      extractRefs: (parsed) => parsed.refs,
      applyVerified: (parsed, refs) => ({ ...parsed, refs }),
      maxRetries: 2,
      onRetry,
    })

    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledWith(1, 2, 1) // attempt 1, max 2, 1 failure
    expect(onRetry).toHaveBeenCalledWith(2, 2, 1) // attempt 2, max 2, 1 failure
  })
})
