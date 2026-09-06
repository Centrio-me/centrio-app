import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Added 2026-09-06: the build server is a small VPS (3.8GB RAM). Next.js's
  // default build parallelism spawns one worker per CPU core for static page
  // generation — with 65+ pages across 5 locales, the combined worker memory
  // footprint (~3.5GB+ resident, independent of NODE_OPTIONS' V8 heap cap,
  // which only bounds a single process) repeatedly triggered the kernel OOM
  // killer mid-build (dmesg: "Out of memory: Killed process ... (node)"),
  // leaving a half-written .next/ missing prerender-manifest.json and put
  // the site into an infinite crash-restart loop under pm2. Capping build
  // concurrency to 1 worker trades build time for staying inside memory —
  // the only reliable fix on hardware this small.
  experimental: { cpus: 1 },
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
