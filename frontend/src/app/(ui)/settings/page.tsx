// ABOUTME: Unified settings page — sources, limits, schedule, and filters.
// ABOUTME: Wraps the Settings component in the standard config padding layout.
import { Settings } from '@/components/Settings'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }

export default function SettingsPage() {
  return <div style={CONFIG_PADDING}><Settings /></div>
}
