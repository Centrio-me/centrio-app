import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited, clientKeyFromRequest } from '../../../lib/rateLimit';

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY!;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const PLANS: Record<string, { amount: number; label: string }> = {
  month: { amount: 2.99,  label: 'Centrio Pro — 1 месяц' },
  year:  { amount: 19.99, label: 'Centrio Pro — 1 год' },
};

// Resolve the authenticated user server-side instead of trusting a
// client-supplied userId (fixes IDOR: anyone could previously pass any
// victim's userId and, once the invoice was paid, get Pro activated
// on the victim's account).
async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;
  try {
    const res = await fetch(`${API_URL}/api/user/profile`, {
      headers: { Authorization: authHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const profile = await res.json();
    return profile?.id || null;
  } catch (e) {
    console.error('[create-crypto-payment] auth check failed:', e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // SECURITY: no rate limit previously — an authenticated user (or anyone
    // with a stolen/valid session) could spam invoice creation against the
    // NOWPayments API without limit.
    const rl = isRateLimited(`create-crypto-payment:${clientKeyFromRequest(req)}`, 5 * 60 * 1000, 10);
    if (rl.limited) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
    }

    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan } = await req.json();

    if (!plan || !PLANS[plan]) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }

    const { amount, label } = PLANS[plan];
    const orderId = `${userId}_${plan}_${Date.now()}`;

    const res = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: 'usd',
        order_id: orderId,
        order_description: label,
        ipn_callback_url: 'https://centrio.me/api/crypto-webhook',
        success_url: 'https://centrio.me/payment-success',
        cancel_url: 'https://centrio.me/pricing',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[NOWPayments] invoice error:', err);
      return NextResponse.json({ error: 'Payment service error' }, { status: 502 });
    }

    const invoice = await res.json();
    return NextResponse.json({ payment_url: invoice.invoice_url, order_id: orderId });
  } catch (e) {
    console.error('[create-crypto-payment]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
