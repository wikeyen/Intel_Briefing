// ABOUTME: Tests for the OpenAI-compatible LLM chat completion client.
// ABOUTME: Validates request building, response parsing, and error handling.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatCompletion, type LlmConfig } from './llm'

const CONFIG: LlmConfig = {
  base_url: 'https://openrouter.ai/api/v1',
  api_key: 'test-key',
  model: 'anthropic/claude-sonnet-4',
}

describe('chatCompletion', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends correct request format and returns content', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello from LLM' } }],
    }), { status: 200 }))

    const result = await chatCompletion(
      [{ role: 'user', content: 'Say hello' }],
      CONFIG,
    )

    expect(result).toBe('Hello from LLM')
    expect(fetchSpy).toHaveBeenCalledOnce()

    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(opts!.body as string)
    expect(body.model).toBe('anthropic/claude-sonnet-4')
    expect(body.messages).toEqual([{ role: 'user', content: 'Say hello' }])
    expect((opts!.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key')
  })

  it('works without api_key (local LLM)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'Local response' } }],
    }), { status: 200 }))

    const localConfig: LlmConfig = { base_url: 'http://localhost:11434/v1', api_key: null, model: 'llama3' }
    const result = await chatCompletion([{ role: 'user', content: 'Hi' }], localConfig)

    expect(result).toBe('Local response')
    const [, opts] = fetchSpy.mock.calls[0]
    expect((opts!.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('throws on HTTP error with raw text', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }], CONFIG),
    ).rejects.toThrow('LLM request failed (401): Unauthorized')
  })

  it('extracts error message from JSON error body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { message: 'Invalid API key', code: 401 } }),
      { status: 401 },
    ))

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }], CONFIG),
    ).rejects.toThrow('LLM request failed (401): Invalid API key')
  })

  it('extracts string error from JSON error body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      { status: 429 },
    ))

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }], CONFIG),
    ).rejects.toThrow('LLM request failed (429): Rate limit exceeded')
  })

  it('throws on malformed response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }], CONFIG),
    ).rejects.toThrow('No content in LLM response')
  })

  it('strips trailing base_url slash', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'OK' } }],
    }), { status: 200 }))

    const cfg: LlmConfig = { ...CONFIG, base_url: 'https://example.com/v1/' }
    await chatCompletion([{ role: 'user', content: 'Hi' }], cfg)

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://example.com/v1/chat/completions')
  })
})
