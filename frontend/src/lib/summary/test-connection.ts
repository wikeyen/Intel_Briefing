// ABOUTME: LLM connection test — sends a minimal prompt to verify the API config.
// ABOUTME: Returns ok + latency on success, or an error message on failure.
import { chatCompletion, type LlmConfig } from './llm'

export interface TestResult {
  ok: boolean
  latency_ms?: number
  error?: string
}

/** Send a tiny test prompt to the configured LLM and measure latency. */
export async function testLlmConnection(config: LlmConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    await chatCompletion([{ role: 'user', content: 'Say OK' }], config)
    return { ok: true, latency_ms: Date.now() - start }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
