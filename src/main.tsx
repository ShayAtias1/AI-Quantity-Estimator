import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/pdfjsSetup'
import { initAnalytics } from './lib/analytics'
import App from './App.tsx'
import { isLanguage, syncDocumentLanguage, useLanguageStore, type Language } from './i18n'

// Before the first render: consumes UTM / bc_internal params and strips them from the address bar.
initAnalytics()

/**
 * Development-only overrides for exercising the real app in another language or direction before
 * there is a language selector. `?lang=en` runs the English dictionary (and with it `lang="en"` and
 * `dir="ltr"` from the language's metadata); `?dir=ltr` / `?dir=rtl` additionally forces the page
 * direction, e.g. to see Hebrew in LTR. Neither is persisted, and both are compiled out of production
 * builds — which always open in the saved language, Hebrew by default. Exports are written in the
 * language the UI is showing, so under `?lang=en` they are English too.
 */
function devOverrides(): { language: Language | null; direction: 'rtl' | 'ltr' | null } {
  if (!import.meta.env.DEV) return { language: null, direction: null };
  const params = new URLSearchParams(window.location.search);
  const language = params.get('lang');
  const direction = params.get('dir');
  return {
    language: isLanguage(language) ? language : null,
    direction: direction === 'ltr' || direction === 'rtl' ? direction : null,
  };
}

const overrides = devOverrides();
if (overrides.language) useLanguageStore.setState({ language: overrides.language });
syncDocumentLanguage(overrides.direction);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
