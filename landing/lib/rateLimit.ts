// Lightweight in-memory rate limiter for Next.js Route Handlers.
// Same rationale/tradeoff as landing/middleware/rateLimit.js (the Express
// equivalent used by the backend API): no external deps, single-instance
// only. If this app is ever deployed across multiple instances/edge regions,
// move this to a shared store (Redis / Upstash) instead.

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart > 10 * 60 * 1000) buckets.delete(key);
  }
}, 60_000);

export function isRateLimited(key: string, windowMs: number, max: number): { limited: boolean; retryAfterSec: number } {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now };
  }
  entry.count += 1;
  buckets.set(key, entry);

  if (entry.count > max) {
    return { limited: true, retryAfterSec: Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000)) };
  }
  return { limited: false, retryAfterSec: 0 };
}

export function clientKeyFromRequest(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}
