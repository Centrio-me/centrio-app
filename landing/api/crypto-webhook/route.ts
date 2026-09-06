import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isRateLimited, clientKeyFromRequest } from '../../../lib/rateLimit';

const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const INTERNAL_WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET;

// This Next.js route has no direct DB access — it forwards the (already
// signature-verified) activation to the Express backend's internal
// crypto-activate endpoint, which does the actual Prisma write. Throws on
// failure so the caller can return a non-2xx and let NOWPayments retry the
// IPN instead of silently dropping the payment.
async function activatePro(userId: string, plan: string, providerPayId: string, amount?: number, currency?: string) {
  if (!INTERNAL_WEBHOOK_SECRET) {
    throw new Error('INTERNAL_WEBHOOK_SECRET is not configured — cannot activate Pro');
  }

  const res = await fetch(`${API_URL}/api/payments/crypto-activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ userId, plan, providerPayId, amount, currency }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`crypto-activate backend call failed: ${res.status} ${body}`);
  }

  const data = await res.json().catch(() => ({}));
  console.log(`[Crypto] Activate Pro OK: userId=${userId} plan=${plan}`, data);
}

export async function POST(req: NextRequest) {
  try {
    // SECURITY: this endpoint was previously wide open to unlimited requests.
    // Even though invalid signatures get rejected below, an attacker could
    // still flood it with junk bodies and burn CPU on JSON.parse + HMAC.
    const rl = isRateLimited(`crypto-webhook:${clientKeyFromRequest(req)}`, 60 * 1000, 120);
    if (rl.limited) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
    }

    // Fail closed: without a configured secret we cannot verify authenticity,
    // so refuse to process any webhook rather than trusting it blindly.
    if (!IPN_SECRET) {
      console.error('[Webhook] NOWPAYMENTS_IPN_SECRET is not configured — rejecting request');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const raw = await req.text();

    // Verify NOWPayments signature
    const sig = req.headers.get('x-nowpayments-sig') || '';
    const sorted = JSON.stringify(
      Object.keys(JSON.parse(raw)).sort().reduce((acc: Record<string, unknown>, k) => {
        acc[k] = JSON.parse(raw)[k];
        return acc;
      }, {})
    );
    const expected = crypto.createHmac('sha512', IPN_SECRET).update(sorted).digest('hex');

    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const isValid = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
    if (!isValid) {
      console.warn('[Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payment = JSON.parse(raw);
    console.log('[Webhook] status:', payment.payment_status, 'order:', payment.order_id);

    if (payment.payment_status === 'finished' || payment.payment_status === 'confirmed') {
      const parts = (payment.order_id as string).split('_');
      const userId = parts[0];
      const plan = parts[1];
      const providerPayId = String(payment.payment_id || payment.order_id);
      try {
        await activatePro(userId, plan, providerPayId, payment.price_amount, payment.price_currency);
      } catch (e) {
        console.error('[crypto-webhook] activatePro failed:', e);
        // Non-2xx so NOWPayments retries the IPN instead of the payment
        // silently vanishing without the user's plan being upgraded.
        return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crypto-webhook]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
