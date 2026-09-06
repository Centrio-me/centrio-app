import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Скачать Centrio — Windows, macOS, Linux',
  description:
    'Скачайте Centrio бесплатно. Windows 10/11 (x64) · macOS 12 Monterey+ · Ubuntu/Debian/Arch. Установка за 30 секунд. Версия 2.5.2.',
  keywords: [
    'скачать centrio', 'centrio download', 'centrio windows',
    'centrio macos', 'centrio linux', 'установить мессенджер',
    'centrio exe', 'centrio dmg', 'centrio appimage',
  ],
  alternates: { canonical: 'https://centrio.me/download' },
  openGraph: {
    title: 'Скачать Centrio — Windows, macOS, Linux',
    description: 'Бесплатное приложение для всех платформ. Установка за 30 секунд.',
    url: 'https://centrio.me/download',
    images: [DEFAULT_OG_IMAGE],
  },
}

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
