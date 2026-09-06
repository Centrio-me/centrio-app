import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Centrio vs Rambox: сравнение агрегаторов мессенджеров 2026',
  description: 'Подробное сравнение Centrio и Rambox — двух популярных агрегаторов мессенджеров. Цены, функции, производительность, поддерживаемые сервисы. Что выбрать в 2026 году?',
  alternates: { canonical: 'https://centrio.me/blog/vs-rambox' },
  openGraph: {
    title: 'Centrio vs Rambox 2026: полное сравнение',
    description: 'Centrio против Rambox — кто победит? Сравниваем цены, функции и производительность двух агрегаторов мессенджеров.',
    url: 'https://centrio.me/blog/vs-rambox',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
