// ABOUTME: Root application component — manages view state across all top-level pages.
// ABOUTME: Toaster wraps everything so toast notifications overlay sidebar and content alike.
import { useState, useEffect } from 'react'
import { Layout } from './components/Layout'
import { Toaster } from './components/Toaster'
import { Status } from './pages/Status'
import { ApiKeys } from './pages/ApiKeys'
import { Sensors } from './pages/Sensors'
import { Pipeline } from './pages/Pipeline'
import { Data } from './pages/Data'

export type View = 'status' | 'data' | 'api-keys' | 'sensors' | 'pipeline'

const CONFIG_PADDING = { maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }

const _STORAGE_KEY = 'intel_view'

function App() {
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem(_STORAGE_KEY)
    return (saved as View) || 'status'
  })

  useEffect(() => {
    localStorage.setItem(_STORAGE_KEY, view)
  }, [view])

  return (
    <Toaster>
      {(showToast) => (
        <Layout showToast={showToast} view={view} onViewChange={setView}>
          {view === 'status'   ? <div style={{ maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }}><Status showToast={showToast} /></div>
          : view === 'data'    ? <Data />
          : view === 'api-keys'? <div style={CONFIG_PADDING}><ApiKeys showToast={showToast} /></div>
          : view === 'sensors' ? <div style={CONFIG_PADDING}><Sensors showToast={showToast} /></div>
          : view === 'pipeline'? <div style={CONFIG_PADDING}><Pipeline showToast={showToast} /></div>
          : null}
        </Layout>
      )}
    </Toaster>
  )
}

export default App
