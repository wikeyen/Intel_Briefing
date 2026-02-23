// ABOUTME: API route for intelligence analysis data — serves cached LLM analysis of trends, topics, accounts.
// ABOUTME: GET returns the latest intelligence report from the pipeline cache.
import { NextResponse } from 'next/server'
import { readIntelligence } from '@/lib/pipeline/intelligence-cache'

export async function GET() {
  const intelligence = await readIntelligence()
  return NextResponse.json({ intelligence })
}
