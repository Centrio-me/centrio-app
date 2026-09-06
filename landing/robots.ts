import type { MetadataRoute } from 'next'

// Dynamic robots.txt — replaces public/robots.txt, which lived only on the
// server (uploaded once by hand, untracked in git, easy to lose on a fresh
// deploy). Next.js serves this at /robots.txt automatically.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/auth/', '/admin/', '/payment/'],
    },
    sitemap: 'https://centrio.me/sitemap.xml',
  }
}
