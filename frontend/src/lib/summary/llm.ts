// ABOUTME: Thin OpenAI-compatible chat completion client for LLM summarization.
// ABOUTME: Works with OpenRouter, Ollama, LM Studio, vLLM, and any OpenAI-compatible endpoint.

export interface LlmConfig {
  base_url: string
  api_key: string | null
  model: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices: { message: { content: string } }[]
}

/** Result of a streaming chat completion — async token iterator plus full-text promise. */
export interface StreamResult {
  /** Yields individual content tokens as they arrive. */
  tokens: AsyncIterable<string>
  /** Resolves to the full concatenated text once the stream is complete. */
  fullText: Promise<string>
}

const DEFAULT_TIMEOUT_MS = 120_000

/** Build shared fetch options for both streaming and non-streaming requests. */
function buildFetchOptions(
  messages: ChatMessage[],
  config: LlmConfig,
  signal: AbortSignal | undefined,
  stream: boolean,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): { url: string; init: RequestInit } {
  const baseUrl = config.base_url.replace(/\/+$/, '')
  const url = `${baseUrl}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.api_key) {
    headers['Authorization'] = `Bearer ${config.api_key}`
  }

  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs)

  return {
    url,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        ...(stream ? { stream: true } : {}),
      }),
      signal: combinedSignal,
    },
  }
}

/** Handle non-ok HTTP responses with detailed error extraction. */
async function handleHttpError(res: Response): Promise<never> {
  const text = await res.text().catch(() => '')
  let detail = text
  try {
    const json = JSON.parse(text)
    const msg = json?.error?.message ?? json?.error ?? json?.message
    if (typeof msg === 'string') detail = msg
  } catch { /* not JSON, use raw text */ }
  throw new Error(`LLM request failed (${res.status}): ${detail}`.trim())
}

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * Returns the assistant's message content as a string.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  config: LlmConfig,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<string> {
  const { url, init } = buildFetchOptions(messages, config, signal, false, timeoutMs)

  const res = await fetch(url, init)

  if (!res.ok) {
    await handleHttpError(res)
  }

  const data: ChatCompletionResponse = await res.json()

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No content in LLM response')
  }

  return content
}

/**
 * Streaming variant of chatCompletion — returns tokens as they arrive via SSE.
 *
 * Parses the OpenAI SSE format:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 *
 * The stream is eagerly driven so `fullText` resolves even if nobody iterates `tokens`.
 */
export function chatCompletionStream(
  messages: ChatMessage[],
  config: LlmConfig,
  opts?: { onToken?: (token: string) => void; signal?: AbortSignal; timeoutMs?: number },
): StreamResult {
  const tokenQueue: string[] = []
  let streamDone = false
  let streamError: Error | null = null
  let notifyWaiter: (() => void) | null = null

  // fullText accumulator — resolved when stream ends
  let resolveFullText: (text: string) => void
  let rejectFullText: (err: Error) => void
  const fullText = new Promise<string>((resolve, reject) => {
    resolveFullText = resolve
    rejectFullText = reject
  })

  // Eagerly drive the stream in the background
  const drive = async () => {
    const { url, init } = buildFetchOptions(messages, config, opts?.signal, true, opts?.timeoutMs)
    const res = await fetch(url, init)

    if (!res.ok) {
      await handleHttpError(res)
    }

    const body = res.body
    if (!body) {
      throw new Error('No response body for streaming request')
    }

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let accumulated = ''

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep last incomplete line in buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          if (!trimmed.startsWith('data: ')) continue

          const payload = trimmed.slice(6)
          if (payload === '[DONE]') {
            streamDone = true
            notifyWaiter?.()
            return accumulated
          }

          try {
            const parsed = JSON.parse(payload)
            const content = parsed.choices?.[0]?.delta?.content
            if (typeof content === 'string' && content.length > 0) {
              accumulated += content
              tokenQueue.push(content)
              opts?.onToken?.(content)
              notifyWaiter?.()
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      // Stream ended without [DONE] — still return what we got
      streamDone = true
      notifyWaiter?.()
      return accumulated
    } finally {
      reader.releaseLock()
    }
  }

  const drivePromise = drive().then(
    (text) => {
      streamDone = true
      notifyWaiter?.()
      resolveFullText!(text)
    },
    (err) => {
      streamError = err instanceof Error ? err : new Error(String(err))
      streamDone = true
      notifyWaiter?.()
      rejectFullText!(streamError)
    },
  )
  // Prevent unhandled rejection when nobody awaits fullText
  drivePromise.catch(() => {})

  // Async iterator that yields tokens from the queue
  const tokens: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<string>> {
          while (tokenQueue.length === 0 && !streamDone) {
            await new Promise<void>((resolve) => {
              notifyWaiter = resolve
            })
          }
          if (tokenQueue.length > 0) {
            return { done: false, value: tokenQueue.shift()! }
          }
          if (streamError) throw streamError
          return { done: true, value: undefined }
        },
      }
    },
  }

  return { tokens, fullText }
}
