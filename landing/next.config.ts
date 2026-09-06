import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Added 2026-08-03: /download/windows|macos|linux used to be client-side
  // ('use client' + useEffect(() => location.replace(...))) redirect stubs —
  // that means Google indexes a thin "Переходим..." page before JS runs,
  // and users see a flash of empty content. A real HTTP redirect is faster
  // and consolidates SEO signal onto the canonical /download page.
  async redirects() {
    return [
      { source: '/download/windows', destination: '/download', permanent: true },
      { source: '/download/macos',   destination: '/download', permanent: true },
      { source: '/download/linux',   destination: '/download', permanent: true },
    ]
  },
};

export default nextConfig;
