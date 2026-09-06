import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Centrio vs Wavebox: сравнение агрегаторов мессенджеров 2026',
  description: 'Centrio против Wavebox — детальное сравнение. Wavebox стоит $19/мес, нет VPN, нет русского интерфейса. Centrio — 199 ₽/мес, встроенный VPN, 5 языков.',
  alternates: { canonical: 'https://centrio.me/blog/vs-wavebox' },
  openGraph: {
    title: 'Centrio vs Wavebox 2026: полное сравнение',
    description: 'Wavebox дорогой и без VPN. Centrio дешевле, быстрее и со встроенным VPN.',
    url: 'https://centrio.me/blog/vs-wavebox',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
