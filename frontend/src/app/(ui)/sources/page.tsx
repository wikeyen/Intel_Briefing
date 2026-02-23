// ABOUTME: Sources configuration page — sensor toggles, limits, and account lists.
// ABOUTME: Wraps the Sensors component in the standard config padding layout.
import { Sensors } from '@/components/Sensors'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', paddingLeft: '3rem', paddingRight: '3rem' }

export default function SourcesPage() {
  return <div className="page-padding" style={CONFIG_PADDING}><Sensors /></div>
}
