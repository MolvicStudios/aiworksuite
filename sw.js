// ═══════════════════════════════════════════════════════════════════════
// AIWorkSuite — Service Worker v4
// Estrategia: Cache-first para assets estáticos, red siempre para APIs
// ═══════════════════════════════════════════════════════════════════════

const SW_VERSION    = 'v5.0.1';
const CACHE_STATIC  = `aws-static-${SW_VERSION}`;
const CACHE_DYNAMIC = `aws-dynamic-${SW_VERSION}`;

// Assets a cachear durante la instalación
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-32x32.png',
  '/favicon-192x192.png',
  '/favicon-512x512.png',
  '/offline.html',
];

// Dominios que NUNCA se cachean — siempre pasan por la red
const NEVER_CACHE = [
  'api.anthropic.com',
  'api.openai.com',
  'api.groq.com',
  'openrouter.ai',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'static.cloudflareinsights.com',
];

// ── INSTALL ──────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log(`[SW] Instalando ${SW_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.warn('[SW] Error cacheando assets:', err));
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW] Activando ${SW_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => {
            console.log('[SW] Eliminando caché antigua:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;
  const url = new URL(event.request.url);

  // Nunca interceptar llamadas a APIs externas
  if (NEVER_CACHE.some(domain => url.hostname.includes(domain))) return;

  // Nunca interceptar requests de escritura
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(event.request.method)) return;

  // Estrategia: Cache First → Red → Offline fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaqueredirect' || response.redirected) {
            return response;
          }
          if (response.type !== 'opaque' && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_DYNAMIC).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.destination === 'document') {
            return caches.match('/offline.html');
          }
          return new Response('', { status: 503 });
        });
    })
  );
});

// ── MENSAJES DESDE LA APP ─────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: SW_VERSION });
});
