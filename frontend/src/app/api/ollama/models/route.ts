// ABOUTME: API route that proxies Ollama's model list endpoint to avoid browser CORS issues.
// ABOUTME: Returns a simplified list of locally available Ollama models with metadata.
import { NextResponse } from 'next/server'

interface OllamaModel {
  name: string
  model: string
  size: number
  details: {
    parameter_size: string
    family: string
    quantization_level: string
  }
}

interface OllamaTagsResponse {
  models: OllamaModel[]
}

export interface OllamaModelInfo {
  name: string
  size: string
  family: string
  quantization: string
}

const OLLAMA_TIMEOUT = 5_000

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const baseUrl = searchParams.get('base_url') || 'http://localhost:11434'

  // Ollama's model list API is at /api/tags (not the OpenAI-compatible /v1/models)
  const ollamaApiUrl = baseUrl.replace(/\/v1\/?$/, '') + '/api/tags'

  try {
    const resp = await fetch(ollamaApiUrl, {
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT),
    })

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Ollama returned ${resp.status}`, models: [] },
        { status: 502 },
      )
    }

    const data = (await resp.json()) as OllamaTagsResponse
    const models: OllamaModelInfo[] = (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.details?.parameter_size ?? '',
      family: m.details?.family ?? '',
      quantization: m.details?.quantization_level ?? '',
    }))

    // Sort by name
    models.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ models })
  } catch {
    return NextResponse.json(
      { error: 'Could not connect to Ollama', models: [] },
      { status: 502 },
    )
  }
}
