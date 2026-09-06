import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Условия использования',
  description:
    'Условия использования Centrio: правила подписки Pro, лицензия на ПО, ограничения ответственности и порядок расторжения.',
  alternates: { canonical: 'https://centrio.me/terms' },
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
