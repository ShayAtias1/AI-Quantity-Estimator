import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/pdfjsSetup'
import { initAnalytics } from './lib/analytics'
import App from './App.tsx'

// Before the first render: consumes UTM / bc_internal params and strips them from the address bar.
initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
