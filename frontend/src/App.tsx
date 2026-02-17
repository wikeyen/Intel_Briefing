// ABOUTME: Root application component — composes Layout with all configuration page sections.
// ABOUTME: Manages save toasts; sections scroll independently from the sidebar.
import { useState } from 'react'
import { Layout } from './components/Layout'
import { ApiKeys } from './pages/ApiKeys'
import { Sensors } from './pages/Sensors'
import { Schedule } from './pages/Schedule'
import { PoliticsAccounts } from './pages/PoliticsAccounts'
import { Topics } from './pages/Topics'
import { Filters } from './pages/Filters'
import { Output } from './pages/Output'

function App() {
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <Layout>
      {/* Content wrapper — horizontal padding and max-width */}
      <div style={{ padding: '0 4rem', maxWidth: 1080, minWidth: 0 }}>
        <ApiKeys showToast={showToast} />
        <Sensors showToast={showToast} />
        <Schedule showToast={showToast} />
        <PoliticsAccounts showToast={showToast} />
        <Topics showToast={showToast} />
        <Filters showToast={showToast} />
        <Output showToast={showToast} />
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: 'var(--ink)',
          color: '#FFFFFF',
          fontSize: '0.875rem',
          fontWeight: 500,
          padding: '0.875rem 1.25rem',
          borderRadius: 4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 51,
          letterSpacing: '0.01em',
        }}>
          {toast}
        </div>
      )}
    </Layout>
  )
}

export default App
