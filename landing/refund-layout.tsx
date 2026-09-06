import type { Metadata } from 'next'

// Fixed 2026-08-03: title was 'Политика возврата | Centrio' here, but the
// root layout's title.template ('%s | Centrio') appends the suffix again,
// so the live <title> rendered as "Политика возврата | Centrio | Centrio".
// Matches the pattern used by privacy/layout.tsx (bare title, no suffix).
export const metadata: Metadata = {
  title: 'Политика возврата',
  description: 'Условия возврата средств за подписку Centrio Pro. 14-дневная гарантия возврата для годовых подписок.',
  alternates: { canonical: 'https://centrio.me/refund' },
}

export default function RefundLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
