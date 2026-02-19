// ABOUTME: API Keys / Connections configuration page.
// ABOUTME: Wraps the ApiKeys component in the standard config padding layout.
import { ApiKeys } from '@/components/ApiKeys'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }

export default function ApiKeysPage() {
  return <div className="page-padding" style={CONFIG_PADDING}><ApiKeys /></div>
}
