// ABOUTME: Status dashboard page — shows pipeline health and last run outcomes.
// ABOUTME: Wraps the Status component in the standard config padding layout.
import { Status } from '@/components/Status'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }

export default function StatusPage() {
  return <div className="page-padding" style={CONFIG_PADDING}><Status /></div>
}
