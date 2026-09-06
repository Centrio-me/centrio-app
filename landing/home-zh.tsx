import LandingPage from './page'
import { LangProvider } from '@/lib/i18n'

export default function ZhHomePage() {
  return (
    <LangProvider forced="zh">
      <LandingPage />
    </LangProvider>
  )
}
