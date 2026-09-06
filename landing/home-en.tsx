import LandingPage from './page'
import { LangProvider } from '@/lib/i18n'

// Locale-pinned wrapper around the shared homepage component — see
// LangProvider in lib/i18n.ts for why this exists (forces server-rendered
// English instead of always rendering 'ru' first).
export default function EnHomePage() {
  return (
    <LangProvider forced="en">
      <LandingPage />
    </LangProvider>
  )
}
