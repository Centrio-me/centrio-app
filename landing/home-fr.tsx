import LandingPage from './page'
import { LangProvider } from '@/lib/i18n'

export default function FrHomePage() {
  return (
    <LangProvider forced="fr">
      <LandingPage />
    </LangProvider>
  )
}
