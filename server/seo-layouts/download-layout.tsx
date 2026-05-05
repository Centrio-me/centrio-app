import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Скачать Centrio — Windows, macOS, Linux',
  description:
    'Скачайте Centrio бесплатно. Windows 10/11 (x64) · macOS 12 Monterey+ · Ubuntu/Debian/Arch. Установка за 30 секунд. Версия 1.6.6.',
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
  },
}

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
