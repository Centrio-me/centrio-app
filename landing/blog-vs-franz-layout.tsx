import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Centrio vs Franz: сравнение агрегаторов мессенджеров 2026',
  description: 'Centrio против Franz — сравнение двух агрегаторов мессенджеров. Встроенный VPN, русский интерфейс, macOS и Linux против платного Franz без VPN.',
  alternates: { canonical: 'https://centrio.me/blog/vs-franz' },
  openGraph: {
    title: 'Centrio vs Franz 2026: полное сравнение',
    description: 'Чем Centrio лучше Franz? Цена, VPN, macOS/Linux поддержка и русский интерфейс.',
    url: 'https://centrio.me/blog/vs-franz',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
