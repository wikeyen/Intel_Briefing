// ABOUTME: Root application component — composes Layout with all configuration pages.
// ABOUTME: Each page section is rendered in a single scrollable column with anchor links.
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
        <ApiKeys showToast={showToast} />
        <div style={{ height: 1, background: 'var(--border-soft)' }} />
        <Sensors showToast={showToast} />
        <div style={{ height: 1, background: 'var(--border-soft)' }} />
        <Schedule showToast={showToast} />
        <div style={{ height: 1, background: 'var(--border-soft)' }} />
        <PoliticsAccounts showToast={showToast} />
        <div style={{ height: 1, background: 'var(--border-soft)' }} />
        <Topics showToast={showToast} />
        <div style={{ height: 1, background: 'var(--border-soft)' }} />
        <Filters showToast={showToast} />
        <div style={{ height: 1, background: 'var(--border-soft)' }} />
        <Output showToast={showToast} />
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: 'var(--ink)',
          color: 'var(--canvas)',
          fontSize: '0.8125rem',
          padding: '0.75rem 1.25rem',
          borderRadius: 2,
          boxShadow: '0 4px 24px rgba(28,26,23,0.18)',
          zIndex: 51,
        }}>
          {toast}
        </div>
      )}
    </Layout>
  )
}

export default App
