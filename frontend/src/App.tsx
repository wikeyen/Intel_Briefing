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
      <div className="flex flex-col gap-12">
        <ApiKeys showToast={showToast} />
        <hr className="border-gray-800" />
        <Sensors showToast={showToast} />
        <hr className="border-gray-800" />
        <Schedule showToast={showToast} />
        <hr className="border-gray-800" />
        <PoliticsAccounts showToast={showToast} />
        <hr className="border-gray-800" />
        <Topics showToast={showToast} />
        <hr className="border-gray-800" />
        <Filters showToast={showToast} />
        <hr className="border-gray-800" />
        <Output showToast={showToast} />
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-800 border border-gray-700 text-sm text-white px-4 py-3 rounded shadow-lg z-50">
          {toast}
        </div>
      )}
    </Layout>
  )
}

export default App
