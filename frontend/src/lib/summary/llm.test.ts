// ABOUTME: Tests for the OpenAI-compatible LLM chat completion client.
// ABOUTME: Validates request building, response parsing, error handling, and streaming SSE parsing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatCompletion, chatCompletionStream, type LlmConfig } from './llm'

const CONFIG: LlmConfig = {
  base_url: 'https://openrouter.ai/api/v1',
  api_key: 'test-key',
  model: 'anthropic/claude-sonnet-4',
}

/** Build a ReadableStream that emits SSE-formatted chunks, simulating an OpenAI streaming response. */
function mockSseStream(tokens: string[], includeEmptyDeltas = false): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const lines: string[] = []

  for (const token of tokens) {
    if (includeEmptyDeltas) {
      lines.push(`data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`)
    }
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`)
  }
  lines.push('data: [DONE]\n\n')

  let idx = 0
  return new ReadableStream({
    pull(controller) {
      if (idx < lines.length) {
        controller.enqueue(encoder.encode(lines[idx]))
        idx++
      } else {
        controller.close()
      }
    },
  })
}

describe('chatCompletion', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as ReturnType<typeof vi.spyOn>
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

    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(opts.body as string)
    expect(body.model).toBe('anthropic/claude-sonnet-4')
    expect(body.messages).toEqual([{ role: 'user', content: 'Say hello' }])
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key')
  })

  it('works without api_key (local LLM)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'Local response' } }],
    }), { status: 200 }))

    const localConfig: LlmConfig = { base_url: 'http://localhost:11434/v1', api_key: null, model: 'llama3' }
    const result = await chatCompletion([{ role: 'user', content: 'Hi' }], localConfig)

    expect(result).toBe('Local response')
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>)['Authorization']).toBeUndefined()
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

describe('chatCompletionStream', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as ReturnType<typeof vi.spyOn>
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends stream:true in request body', async () => {
    const stream = mockSseStream(['Hi'])
    fetchSpy.mockResolvedValueOnce(new Response(stream, { status: 200 }))

    const result = chatCompletionStream(
      [{ role: 'user', content: 'test' }],
      CONFIG,
    )
    await result.fullText

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(opts.body as string)
    expect(body.stream).toBe(true)
  })

  it('fullText resolves to concatenated tokens', async () => {
    const stream = mockSseStream(['Hello', ' ', 'world'])
    fetchSpy.mockResolvedValueOnce(new Response(stream, { status: 200 }))

    const result = chatCompletionStream(
      [{ role: 'user', content: 'test' }],
      CONFIG,
    )
    const text = await result.fullText
    expect(text).toBe('Hello world')
  })

  it('calls onToken for each token', async () => {
    const stream = mockSseStream(['a', 'b', 'c'])
    fetchSpy.mockResolvedValueOnce(new Response(stream, { status: 200 }))

    const tokens: string[] = []
    const result = chatCompletionStream(
      [{ role: 'user', content: 'test' }],
      CONFIG,
      { onToken: (t) => tokens.push(t) },
    )
    await result.fullText
    expect(tokens).toEqual(['a', 'b', 'c'])
  })

  it('async iterator yields tokens in order', async () => {
    const stream = mockSseStream(['x', 'y', 'z'])
    fetchSpy.mockResolvedValueOnce(new Response(stream, { status: 200 }))

    const result = chatCompletionStream(
      [{ role: 'user', content: 'test' }],
      CONFIG,
    )

    const collected: string[] = []
    for await (const token of result.tokens) {
      collected.push(token)
    }
    expect(collected).toEqual(['x', 'y', 'z'])
  })

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Server Error', { status: 500 }))

    const result = chatCompletionStream(
      [{ role: 'user', content: 'test' }],
      CONFIG,
    )
    await expect(result.fullText).rejects.toThrow('LLM request failed (500): Server Error')
  })

  it('skips empty delta content gracefully', async () => {
    const stream = mockSseStream(['Hello', ' world'], true)
    fetchSpy.mockResolvedValueOnce(new Response(stream, { status: 200 }))

    const result = chatCompletionStream(
      [{ role: 'user', content: 'test' }],
      CONFIG,
    )
    const text = await result.fullText
    expect(text).toBe('Hello world')
  })

  it('handles stream ending without [DONE] marker', async () => {
    // Build a stream that ends without [DONE]
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' } }] })}\n\n`))
        controller.close()
      },
    })
    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const result = chatCompletionStream(
      [{ role: 'user', content: 'test' }],
      CONFIG,
    )
    const text = await result.fullText
    expect(text).toBe('partial')
  })

  it('fullText resolves even if nobody iterates tokens', async () => {
    const stream = mockSseStream(['eager', ' ', 'drive'])
    fetchSpy.mockResolvedValueOnce(new Response(stream, { status: 200 }))

    const result = chatCompletionStream(
      [{ role: 'user', content: 'test' }],
      CONFIG,
    )
    // Do NOT iterate tokens — just await fullText
    const text = await result.fullText
    expect(text).toBe('eager drive')
  })
})
