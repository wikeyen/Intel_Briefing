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

const TIMEOUT_MS = 120_000

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * Returns the assistant's message content as a string.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  config: LlmConfig,
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = config.base_url.replace(/\/+$/, '')
  const url = `${baseUrl}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.api_key) {
    headers['Authorization'] = `Bearer ${config.api_key}`
  }

  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS)

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
    }),
    signal: combinedSignal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text
    try {
      const json = JSON.parse(text)
      const msg = json?.error?.message ?? json?.error ?? json?.message
      if (typeof msg === 'string') detail = msg
    } catch { /* not JSON, use raw text */ }
    throw new Error(`LLM request failed (${res.status}): ${detail}`.trim())
  }

  const data: ChatCompletionResponse = await res.json()

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No content in LLM response')
  }

  return content
}
