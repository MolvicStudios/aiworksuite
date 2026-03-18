/**
 * Cloudflare Pages Function — /api/chat
 * Proxy seguro para Groq API. La clave NUNCA llega al cliente.
 *
 * Variables de entorno requeridas (CF Pages → Settings → Environment variables):
 *   GROQ_API_KEY = gsk_...   (Production + Preview)
 *
 * Rate limiting opcional (requiere KV namespace):
 *   1. CF Workers & Pages → KV → Crear namespace "RATE_KV"
 *   2. CF Pages → Settings → Functions → KV namespace bindings → añadir RATE_KV
 *   Sin el binding el proxy funciona igual pero sin límite de llamadas.
 */

const ALLOWED_ORIGINS = [
  'https://aiworksuite.pro',
  'https://www.aiworksuite.pro',
];

const ALLOWED_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
];

export async function onRequestPost(context) {
  const { request, env } = context;

  // Validar origin (same-site requests no envían Origin, se permiten)
  const origin = request.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  // Verificar que la clave existe
  if (!env.GROQ_API_KEY) {
    return new Response('Service unavailable', { status: 503 });
  }

  // Rate limiting por IP usando Cloudflare KV (opcional)
  // Límite: 25 mensajes por IP por hora
  if (env.RATE_KV) {
    const ip     = request.headers.get('CF-Connecting-IP') || 'anon';
    const rlKey  = 'rl:' + ip;
    const count  = parseInt(await env.RATE_KV.get(rlKey) || '0');
    if (count >= 25) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait before trying again.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' } }
      );
    }
    // Incrementar contador en background (no bloquea la respuesta)
    context.waitUntil(
      env.RATE_KV.put(rlKey, String(count + 1), { expirationTtl: 3600 })
    );
  }


  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Validar campos mínimos
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response('Bad Request', { status: 400 });
  }

  // Sanitizar: solo whitelist de modelos y cap de tokens
  const model = ALLOWED_MODELS.includes(body.model)
    ? body.model
    : 'llama-3.3-70b-versatile';

  const max_tokens = Math.min(Number(body.max_tokens) || 500, 1000);

  // Llamada a Groq con la clave del entorno (NUNCA expuesta al cliente)
  let groqRes;
  try {
    groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens,
        messages: body.messages,
      }),
    });
  } catch {
    return new Response('Bad Gateway', { status: 502 });
  }

  const data = await groqRes.json();

  return new Response(JSON.stringify(data), {
    status: groqRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Preflight CORS (por si se llama desde localhost en desarrollo)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
