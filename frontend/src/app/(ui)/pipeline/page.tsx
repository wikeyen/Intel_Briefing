// ABOUTME: Pipeline configuration page.
// ABOUTME: Wraps the Pipeline component in the standard config padding layout.
import { Pipeline } from '@/components/Pipeline'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', paddingLeft: '3rem', paddingRight: '3rem' }

export default function PipelinePage() {
  return <div className="page-padding" style={CONFIG_PADDING}><Pipeline /></div>
}
