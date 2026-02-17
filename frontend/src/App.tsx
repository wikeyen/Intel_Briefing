// ABOUTME: Root application component — composes Layout with all configuration page sections.
// ABOUTME: Toaster wraps everything so toast notifications overlay sidebar and content alike.
import { Layout } from './components/Layout'
import { Toaster } from './components/Toaster'
import { Status } from './pages/Status'
import { ApiKeys } from './pages/ApiKeys'
import { Sensors } from './pages/Sensors'
import { Schedule } from './pages/Schedule'
import { PoliticsAccounts } from './pages/PoliticsAccounts'
import { Topics } from './pages/Topics'
import { Filters } from './pages/Filters'
import { Output } from './pages/Output'

function App() {
  return (
    <Toaster>
      {(showToast) => (
        <Layout showToast={showToast}>
          <div style={{ maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }}>
            <Status showToast={showToast} />
            <ApiKeys showToast={showToast} />
            <Sensors showToast={showToast} />
            <Schedule showToast={showToast} />
            <PoliticsAccounts showToast={showToast} />
            <Topics showToast={showToast} />
            <Filters showToast={showToast} />
            <Output showToast={showToast} />
          </div>
        </Layout>
      )}
    </Toaster>
  )
}

export default App
