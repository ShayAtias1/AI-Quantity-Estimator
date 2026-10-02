import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/pdfjsSetup'
import { initAnalytics } from './lib/analytics'
import App from './App.tsx'
import { syncDocumentLanguage } from './i18n'

// Before the first render: consumes UTM / bc_internal params and strips them from the address bar.
initAnalytics()

/**
 * Development-only direction override for exercising the UI in LTR before a left-to-right language
 * exists: open the dev server with `?dir=ltr`. The language stays Hebrew; only `<html dir>` changes,
 * so the real direction-aware layout is what gets tested. Compiled out of production builds, and
 * exports never read the page direction (they are laid out RTL explicitly).
 */
function devDirectionOverride(): 'rtl' | 'ltr' | null {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(window.location.search).get('dir');
  return value === 'ltr' || value === 'rtl' ? value : null;
}

syncDocumentLanguage(devDirectionOverride());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
