import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Цены и тарифы — Free, Pro, Team',
  description:
    'Centrio Free — навсегда бесплатно. Pro от 199 ₽/мес: неограниченно мессенджеров, облачная синхронизация, папки. Оплата картой РФ, СБП или криптовалютой.',
  keywords: [
    'centrio цена', 'centrio pro', 'стоимость подписки',
    'мессенджер подписка', 'centrio бесплатно', 'centrio тарифы',
    'агрегатор мессенджеров цена', 'сколько стоит программа для мессенджеров',
    'программа для нескольких мессенджеров купить', 'подписка на мессенджер с vpn',
    'аналог rambox цена', 'аналог franz цена',
  ],
  alternates: { canonical: 'https://centrio.me/pricing' },
  openGraph: {
    title: 'Цены Centrio — Free навсегда, Pro от 199 ₽/мес',
    description: 'Выберите подходящий план. Free — бесплатно, Pro — полный доступ ко всем функциям.',
    url: 'https://centrio.me/pricing',
    images: [DEFAULT_OG_IMAGE],
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
