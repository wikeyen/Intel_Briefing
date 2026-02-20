// ABOUTME: AI Summary configuration page — LLM provider, model, and connection test.
// ABOUTME: Wraps the AiSummary component in the standard config padding layout.
import { AiSummary } from '@/components/AiSummary'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }

export default function AiSummaryPage() {
  return <div className="page-padding" style={CONFIG_PADDING}><AiSummary /></div>
}
