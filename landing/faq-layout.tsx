import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Вопросы и ответы — FAQ',
  description:
    'Часто задаваемые вопросы о Centrio: как установить, как настроить мессенджеры, облачная синхронизация, VPN, подписка Pro и многое другое.',
  keywords: [
    'centrio faq', 'centrio вопросы', 'как установить centrio',
    'centrio поддержка', 'centrio помощь',
    'как объединить мессенджеры вопросы', 'агрегатор мессенджеров faq',
    'безопасно ли использовать агрегатор мессенджеров', 'мессенджер с vpn вопросы',
  ],
  alternates: { canonical: 'https://centrio.me/faq' },
  openGraph: {
    title: 'FAQ — Часто задаваемые вопросы о Centrio',
    description: 'Ответы на популярные вопросы об установке, настройке и функциях Centrio.',
    url: 'https://centrio.me/faq',
    images: [DEFAULT_OG_IMAGE],
  },
}

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
