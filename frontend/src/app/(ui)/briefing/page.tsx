// ABOUTME: Briefing page — shows the AI-generated intelligence summary.
// ABOUTME: Wraps the Briefing component in the standard config padding layout.
import { Briefing } from '@/components/Briefing'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }

export default function BriefingPage() {
  return <div className="page-padding" style={CONFIG_PADDING}><Briefing /></div>
}
