// IndexNow key-verification file. IndexNow (jointly run by Bing and
// Yandex — both matter here since Yandex is our primary search engine) asks
// for a key hosted at https://<site>/<key>.txt returning the raw key as
// plain text, to prove we control the domain before it'll accept push
// notifications for that key. The folder name below IS the key value
// (Next.js App Router allows dots in route segment names), so this file's
// deployed path (see deploy-frontend.js) doubles as the verification URL.
//
// Submission script: scripts/indexnow-submit.js (uses this same key).
export const KEY = 'd551cf74fb5d05ca3e40986dd9a78353'

export async function GET() {
  return new Response(KEY, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
