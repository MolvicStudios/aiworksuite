/**
 * Cloudflare Pages Function — /api/webhook
 * Receives Lemon Squeezy webhook events
 *
 * Environment variable required:
 *   LS_WEBHOOK_SECRET = signing secret from LS dashboard
 */

export async function onRequestPost({ request, env }) {
  const body      = await request.text();
  const signature = request.headers.get('x-signature') || '';

  // Verify signature
  const secret = env.LS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[AIWorkSuite Webhook] LS_WEBHOOK_SECRET not configured');
    return new Response('Server misconfigured', { status: 500 });
  }

  const valid = await verifySignature(body, signature, secret);
  if (!valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventType = event.meta?.event_name;
  const data      = event.data?.attributes;

  // Log event type for debugging
  console.log(`[AIWorkSuite Webhook] Event: ${eventType}`);

  switch (eventType) {
    case 'order_created':
    case 'subscription_created': {
      // License key is sent by email to user automatically by LS
      // No action needed server-side — client activates via validate-license
      console.log(`[AIWorkSuite] New subscription: ${data?.user_email}`);
      break;
    }
    case 'subscription_updated': {
      console.log(`[AIWorkSuite] Subscription updated: ${data?.user_email} → ${data?.status}`);
      break;
    }
    case 'subscription_cancelled':
    case 'subscription_expired': {
      // Cannot revoke localStorage from server — user will lose Pro on next validation
      console.log(`[AIWorkSuite] Subscription cancelled: ${data?.user_email}`);
      break;
    }
  }

  return new Response('OK', { status: 200 });
}

// Webhook is server-to-server (Lemon Squeezy) — no CORS needed
export async function onRequestOptions() {
  return new Response(null, { status: 405 });
}

async function verifySignature(body, signature, secret) {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = hexToBytes(signature);
    return await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body));
  } catch {
    return false;
  }
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
