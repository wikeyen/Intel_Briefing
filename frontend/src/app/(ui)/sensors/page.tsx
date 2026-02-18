// ABOUTME: Sensors / Sources configuration page.
// ABOUTME: Wraps the Sensors component in the standard config padding layout.
import { Sensors } from '@/components/Sensors'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }

export default function SensorsPage() {
  return <div style={CONFIG_PADDING}><Sensors /></div>
}
