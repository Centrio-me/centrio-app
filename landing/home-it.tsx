import LandingPage from './page'
import { LangProvider } from '@/lib/i18n'

export default function ItHomePage() {
  return (
    <LangProvider forced="it">
      <LandingPage />
    </LangProvider>
  )
}
