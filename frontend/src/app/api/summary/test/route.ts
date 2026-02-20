// ABOUTME: LLM connection test endpoint — POST /api/summary/test.
// ABOUTME: Reads LLM config and sends a minimal test prompt to verify connectivity.
import { NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { testLlmConnection } from '@/lib/summary/test-connection'

export async function POST(): Promise<NextResponse> {
  const config = await loadConfig()

  if (!config.summary_provider) {
    return NextResponse.json(
      { ok: false, error: 'No LLM provider configured' },
      { status: 400 },
    )
  }

  const result = await testLlmConnection({
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_model,
  })

  return NextResponse.json(result)
}
