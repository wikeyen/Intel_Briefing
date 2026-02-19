// ABOUTME: Console page — surfaces sensor errors and warnings from the last pipeline run.
// ABOUTME: Wraps the Console component in the standard config padding layout.
import { Console } from '@/components/Console'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }

export default function ConsolePage() {
  return <div style={CONFIG_PADDING}><Console /></div>
}
