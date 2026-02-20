// ABOUTME: Tests for the LLM connection test function.
// ABOUTME: Validates success with latency, and error reporting on failure.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { testLlmConnection } from './test-connection'
import * as llm from './llm'

describe('testLlmConnection', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns ok with latency on success', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('OK')

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    const result = await testLlmConnection(config)

    expect(result.ok).toBe(true)
    expect(result.latency_ms).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeUndefined()
    expect(llm.chatCompletion).toHaveBeenCalledOnce()
  })

  it('returns error message on failure', async () => {
    vi.spyOn(llm, 'chatCompletion').mockRejectedValue(new Error('LLM request failed: 401 Unauthorized'))

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'bad', model: 'm' }
    const result = await testLlmConnection(config)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('LLM request failed: 401 Unauthorized')
    expect(result.latency_ms).toBeUndefined()
  })

  it('sends a minimal test prompt', async () => {
    const spy = vi.spyOn(llm, 'chatCompletion').mockResolvedValue('OK')

    const config = { base_url: 'http://localhost:11434/v1', api_key: null, model: 'llama3' }
    await testLlmConnection(config)

    const messages = spy.mock.calls[0][0]
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    // Prompt should be short/cheap
    expect(messages[0].content.length).toBeLessThan(50)
  })
})
