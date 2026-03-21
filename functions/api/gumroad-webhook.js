/**
 * Cloudflare Pages Function — /api/gumroad-webhook
 * Recibe webhooks de Gumroad (sale, subscription_cancelled, subscription_failed)
 * y escribe en Supabase usando service_role key.
 *
 * Variables de entorno requeridas (CF Pages → Settings → Environment variables):
 *   SUPABASE_URL              = https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY = eyJ... (service_role, NO anon)
 *   GUMROAD_PRODUCT_PRO_ID    = xozxj
 *   GUMROAD_PRODUCT_AGENCY_ID = juowa
 *   GUMROAD_WEBHOOK_SECRET    = (opcional, para verificar firma HMAC)
 */

export async function onRequestPost({ request, env }) {
  // Siempre responder 200 a Gumroad para evitar reintentos
  const respond = (msg) =>
    new Response(JSON.stringify({ message: msg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    // 1. Leer body como texto (se consume una sola vez)
    const rawBody = await request.text();

    // 2. Verificar firma HMAC si el secret está configurado
    if (env.GUMROAD_WEBHOOK_SECRET) {
      const signature = request.headers.get('X-Gumroad-Signature');
      if (!signature) {
        console.error('[gumroad-webhook] Missing signature header');
        return respond('Missing signature');
      }
      const isValid = await verifyGumroadSignature(
        rawBody,
        signature,
        env.GUMROAD_WEBHOOK_SECRET
      );
      if (!isValid) {
        console.error('[gumroad-webhook] Invalid signature');
        return respond('Invalid signature');
      }
    }

    // 3. Parsear form data desde el texto raw (application/x-www-form-urlencoded)
    const payload = Object.fromEntries(new URLSearchParams(rawBody));

    const event = payload.resource_name; // 'sale' | 'subscription_cancelled' | ...
    const email = payload.email?.toLowerCase().trim();
    const saleId = payload.sale_id;
    const productId = payload.product_id;
    const subscriberId = payload.subscriber_id;

    if (!email) return respond('No email in payload');

    // 4. Determinar plan según product_id
    let plan = 'free';
    if (productId === env.GUMROAD_PRODUCT_AGENCY_ID) plan = 'agency';
    else if (productId === env.GUMROAD_PRODUCT_PRO_ID) plan = 'pro';

    // 5. Determinar billing_cycle
    const recurrence = payload.recurrence; // 'monthly' | 'yearly'
    const billingCycle = recurrence === 'yearly' ? 'yearly' : 'monthly';

    // 6. Calcular current_period_end
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    // 7. Buscar user_id en Supabase por email
    const userId = await getUserIdByEmail(email, env);

    // 8. Procesar según tipo de evento
    if (event === 'sale') {
      await upsertSubscription({
        userId,
        email,
        plan,
        billingCycle,
        status: 'active',
        seats: plan === 'agency' ? 5 : 1,
        gumroadSaleId: saleId,
        gumroadProductId: productId,
        gumroadSubscriberId: subscriberId,
        currentPeriodEnd: periodEnd.toISOString(),
        env,
      });
    } else if (event === 'subscription_cancelled') {
      await updateSubscriptionStatus(email, 'cancelled', env);
    } else if (event === 'subscription_failed') {
      await updateSubscriptionStatus(email, 'expired', env);
    }

    return respond('OK');
  } catch (err) {
    console.error('[gumroad-webhook] Error:', err.message, err.stack);
    return respond('Internal error handled');
  }
}

// ── Verificación de firma ───────────────────────────────────────────────────

async function verifyGumroadSignature(body, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = hexToBytes(signature);
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body));
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// ── Supabase helpers ────────────────────────────────────────────────────────

async function supabaseRequest(path, method, body, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${path} failed: ${err}`);
  }
  return res.json();
}

async function getUserIdByEmail(email, env) {
  const res = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`,
    {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  // La Admin API devuelve { users: [...] } — filtrar por email
  const user = data.users?.find(
    (u) => u.email?.toLowerCase() === email
  );
  return user?.id ?? null;
}

async function upsertSubscription({
  userId,
  email,
  plan,
  billingCycle,
  status,
  seats,
  gumroadSaleId,
  gumroadProductId,
  gumroadSubscriberId,
  currentPeriodEnd,
  env,
}) {
  const record = {
    email,
    plan,
    billing_cycle: billingCycle,
    status,
    seats,
    gumroad_sale_id: gumroadSaleId,
    gumroad_product_id: gumroadProductId,
    gumroad_subscriber_id: gumroadSubscriberId,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  // Solo incluir user_id si encontramos al usuario
  if (userId) record.user_id = userId;

  // Upsert por gumroad_sale_id
  await supabaseRequest(
    '/subscriptions?on_conflict=gumroad_sale_id',
    'POST',
    record,
    env
  );

  // Si es Agency y tenemos user_id, crear seat owner
  if (plan === 'agency' && userId) {
    const subs = await supabaseRequest(
      `/subscriptions?email=eq.${encodeURIComponent(email)}&select=id&order=created_at.desc&limit=1`,
      'GET',
      null,
      env
    );
    const subId = subs[0]?.id;
    if (subId) {
      // Comprobar si ya existe el seat owner para evitar duplicados
      const existing = await supabaseRequest(
        `/subscription_seats?subscription_id=eq.${subId}&role=eq.owner&select=id&limit=1`,
        'GET',
        null,
        env
      );
      if (existing.length === 0) {
        await supabaseRequest('/subscription_seats', 'POST', {
          subscription_id: subId,
          user_id: userId,
          email,
          role: 'owner',
          accepted_at: new Date().toISOString(),
        }, env);
      }
    }
  }
}

async function updateSubscriptionStatus(email, status, env) {
  const body = { status, updated_at: new Date().toISOString() };
  if (status === 'cancelled') body.cancelled_at = new Date().toISOString();

  await supabaseRequest(
    `/subscriptions?email=eq.${encodeURIComponent(email)}`,
    'PATCH',
    body,
    env
  );
}
