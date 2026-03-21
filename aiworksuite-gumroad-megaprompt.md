# AIWorkSuite v4 — Mega-prompt: Integración Gumroad + Sistema de Tiers Premium
## Para VS Code + GitHub Copilot (Claude Sonnet)
### MolvicStudios · marzo 2026

---

## CONTEXTO DEL PROYECTO

Estás trabajando en **AIWorkSuite v4** (`aiworksuite.pro`), una SPA en vanilla HTML5 + CSS + JavaScript ES Modules sin frameworks ni bundler, desplegada en Cloudflare Pages con Supabase Auth.

**Stack confirmado:**
- Frontend: HTML5 + CSS + JS vanilla (sin React, sin Vue, sin bundler)
- Auth: Supabase (`@supabase/supabase-js` CDN)
- Backend serverless: Cloudflare Pages Functions (`functions/api/`)
- Hosting: Cloudflare Pages
- Monetización: Gumroad (Merchant of Record, webhook → Supabase)
- Dominio tienda: `shop.aiworksuite.pro` (CNAME → domains.gumroad.com)

**Tiers definidos:**
| Tier | Precio | Seats | Gumroad Product |
|------|--------|-------|-----------------|
| Free | $0 | 1 | — |
| Pro | $19/mes · $180/año | 1 | `aiworksuite-pro` |
| Agency | $49/mes · $468/año | hasta 5 | `aiworksuite-agency` |

**Módulos premium (bloqueados en Free):**
- CRM completo (pipeline 7 etapas + chat IA por fase) → Pro + Agency
- Generador de Propuestas con IA → Pro + Agency
- Equipos IA (lanzador 4 pasos) → Pro + Agency
- Biblioteca de Prompts ilimitada (Free: máx 5 prompts) → Pro + Agency

---

## INSTRUCCIONES GENERALES PARA COPILOT

- Escribe código **vanilla JS ES Modules** — sin imports de npm, sin bundler
- Usa `async/await` siempre, nunca `.then().catch()` encadenado
- Variables CSS existentes del proyecto para colores — no hardcodees hex
- Todos los textos en **español e inglés** usando el sistema i18n existente del proyecto
- Maneja siempre errores con try/catch y muestra feedback visual al usuario
- Compatible con el Service Worker existente (no romper caché offline)
- Sigue el patrón RLS de Supabase ya establecido en el proyecto
- **NO uses** localStorage para datos de sesión de pago — usa Supabase siempre
- Código listo para producción: sin console.log de debug, sin TODO sin resolver

---

## TAREA 1 de 5 — SQL: Tabla `subscriptions` en Supabase

**Archivo a crear:** `supabase-gumroad.sql`

Crea el SQL completo para ejecutar en Supabase SQL Editor. Debe incluir:

### Tabla principal

```sql
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email               text NOT NULL,
  plan                text NOT NULL CHECK (plan IN ('free', 'pro', 'agency')),
  billing_cycle       text CHECK (billing_cycle IN ('monthly', 'yearly')),
  status              text NOT NULL DEFAULT 'active' 
                      CHECK (status IN ('active', 'cancelled', 'expired', 'trialing')),
  seats               integer NOT NULL DEFAULT 1,
  gumroad_sale_id     text UNIQUE,
  gumroad_product_id  text,
  gumroad_subscriber_id text,
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
```

### Tabla de seats para Agency

```sql
CREATE TABLE IF NOT EXISTS public.subscription_seats (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id  uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             text DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_at       timestamptz DEFAULT now(),
  accepted_at      timestamptz
);
```

### RLS Policies

```sql
-- Activar RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_seats ENABLE ROW LEVEL SECURITY;

-- subscriptions: el usuario solo ve la suya
CREATE POLICY "users_see_own_subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- subscriptions: solo el webhook (service_role) puede insertar/actualizar
CREATE POLICY "service_role_manage_subscriptions"
  ON public.subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- seats: el owner ve todos los seats de su suscripción
CREATE POLICY "owner_sees_team_seats"
  ON public.subscription_seats FOR SELECT TO authenticated
  USING (
    subscription_id IN (
      SELECT id FROM public.subscriptions WHERE user_id = auth.uid()
    )
  );

-- seats: service_role gestiona todo
CREATE POLICY "service_role_manage_seats"
  ON public.subscription_seats FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### Función helper + trigger updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vista helper para saber el tier activo de un usuario
CREATE OR REPLACE VIEW public.user_active_tier AS
SELECT 
  user_id,
  plan,
  status,
  seats,
  billing_cycle,
  trial_ends_at,
  current_period_end,
  CASE 
    WHEN status = 'trialing' AND trial_ends_at > now() THEN true
    WHEN status = 'active' THEN true
    ELSE false
  END AS is_active
FROM public.subscriptions;
```

### Grant para la vista

```sql
GRANT SELECT ON public.user_active_tier TO authenticated;

CREATE POLICY "users_see_own_tier"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
```

---

## TAREA 2 de 5 — Cloudflare Function: Webhook Gumroad

**Archivo a crear:** `functions/api/gumroad-webhook.js`

Este endpoint recibe el POST de Gumroad cuando se produce una venta, cancela una suscripción o hay un fallo de pago. Escribe en Supabase usando `service_role` key.

### Requisitos:
- Verificar firma HMAC-SHA256 del webhook de Gumroad (header `X-Gumroad-Signature`)
- Manejar los eventos: `sale`, `subscription_cancelled`, `subscription_failed`  
- Buscar el usuario en Supabase por email del comprador
- Insertar o actualizar en `public.subscriptions`
- Para plan Agency: crear el primer seat (owner) en `subscription_seats`
- Responder siempre 200 a Gumroad (incluso en errores internos, para evitar reintentos)
- Loguear errores con suficiente contexto para debug

### Variables de entorno necesarias (Cloudflare Pages → Settings → Variables):
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  (service_role, NO anon)
GUMROAD_WEBHOOK_SECRET=tu_secret_de_gumroad
GUMROAD_PRODUCT_PRO_ID=id_del_producto_pro_en_gumroad
GUMROAD_PRODUCT_AGENCY_ID=id_del_producto_agency_en_gumroad
```

### Código completo:

```javascript
// functions/api/gumroad-webhook.js
// Cloudflare Pages Function — recibe webhooks de Gumroad

export async function onRequestPost({ request, env }) {
  // Siempre responder 200 a Gumroad para evitar reintentos
  const respond = (msg, status = 200) =>
    new Response(JSON.stringify({ message: msg }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });

  try {
    // 1. Parsear body como FormData (Gumroad envía application/x-www-form-urlencoded)
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries());

    // 2. Verificar firma HMAC si el secret está configurado
    if (env.GUMROAD_WEBHOOK_SECRET) {
      const signature = request.headers.get('X-Gumroad-Signature');
      if (!signature) return respond('Missing signature', 200); // 200 pero logueamos
      
      const isValid = await verifyGumroadSignature(
        await request.text(), // necesitamos el body raw
        signature,
        env.GUMROAD_WEBHOOK_SECRET
      );
      if (!isValid) return respond('Invalid signature');
    }

    const event = payload.resource_name; // 'sale', 'subscription_cancelled', etc.
    const email = payload.email?.toLowerCase().trim();
    const saleId = payload.sale_id;
    const productId = payload.product_id;
    const subscriberId = payload.subscriber_id;

    if (!email) return respond('No email in payload');

    // 3. Determinar plan según product_id de Gumroad
    let plan = 'free';
    if (productId === env.GUMROAD_PRODUCT_AGENCY_ID) plan = 'agency';
    else if (productId === env.GUMROAD_PRODUCT_PRO_ID) plan = 'pro';

    // 4. Determinar billing_cycle (mensual/anual)
    const recurrence = payload.recurrence; // 'monthly' | 'yearly'
    const billingCycle = recurrence === 'yearly' ? 'yearly' : 'monthly';

    // 5. Calcular current_period_end
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    // 6. Buscar user_id en Supabase por email
    const userId = await getUserIdByEmail(email, env);

    // 7. Procesar según tipo de evento
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
        env
      });

    } else if (event === 'subscription_cancelled') {
      await updateSubscriptionStatus(email, 'cancelled', env);

    } else if (event === 'subscription_failed') {
      await updateSubscriptionStatus(email, 'expired', env);
    }

    return respond('OK');

  } catch (err) {
    // Loguear pero responder 200 para evitar reintentos de Gumroad
    console.error('[gumroad-webhook] Error:', err.message, err.stack);
    return respond('Internal error handled');
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function verifyGumroadSignature(body, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = hexToBytes(signature);
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body));
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

async function supabaseRequest(path, method, body, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${path} failed: ${err}`);
  }
  return res.json();
}

async function getUserIdByEmail(email, env) {
  // Buscar en auth.users via Admin API de Supabase
  const res = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.users?.[0]?.id ?? null;
}

async function upsertSubscription({
  userId, email, plan, billingCycle, status,
  seats, gumroadSaleId, gumroadProductId,
  gumroadSubscriberId, currentPeriodEnd, env
}) {
  const record = {
    user_id: userId,
    email,
    plan,
    billing_cycle: billingCycle,
    status,
    seats,
    gumroad_sale_id: gumroadSaleId,
    gumroad_product_id: gumroadProductId,
    gumroad_subscriber_id: gumroadSubscriberId,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString()
  };

  // Upsert por gumroad_sale_id
  await supabaseRequest(
    '/subscriptions?on_conflict=gumroad_sale_id',
    'POST',
    record,
    env
  );

  // Si es Agency y tenemos user_id, crear seat owner
  if (plan === 'agency' && userId) {
    const subRes = await supabaseRequest(
      `/subscriptions?email=eq.${encodeURIComponent(email)}&select=id`,
      'GET', null, env
    );
    const subId = subRes[0]?.id;
    if (subId) {
      await supabaseRequest('/subscription_seats', 'POST', {
        subscription_id: subId,
        user_id: userId,
        email,
        role: 'owner',
        accepted_at: new Date().toISOString()
      }, env);
    }
  }
}

async function updateSubscriptionStatus(email, status, env) {
  await supabaseRequest(
    `/subscriptions?email=eq.${encodeURIComponent(email)}`,
    'PATCH',
    { status, updated_at: new Date().toISOString() },
    env
  );
}
```

---

## TAREA 3 de 5 — JS: Sistema de Tiers en el Frontend

**Archivo a crear/modificar:** sección `<script>` en `index.html` — añadir al módulo de auth existente

Crea un módulo `tierSystem` que se inicialice tras el login de Supabase. Debe:

### Función `loadUserTier(userId)`

```javascript
// Añadir dentro del bloque <script> de index.html,
// justo después de la inicialización de Supabase Auth

const tierSystem = (() => {
  // Cache en memoria (sessionStorage solo para UX, fuente de verdad = Supabase)
  let _tier = 'free';
  let _seats = 1;
  let _status = 'active';
  let _periodEnd = null;

  const TIER_CACHE_KEY = 'aiws_tier_cache';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  async function load(supabaseClient) {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) { _tier = 'free'; return; }

      // Intentar cache reciente
      const cached = _readCache();
      if (cached) { _applyTier(cached); return; }

      // Consultar Supabase
      const { data, error } = await supabaseClient
        .from('subscriptions')
        .select('plan, status, seats, billing_cycle, current_period_end, trial_ends_at')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        _tier = 'free'; _seats = 1;
        return;
      }

      // Validar que la suscripción sigue vigente
      const isActive = data.status === 'active' ||
        (data.status === 'trialing' && new Date(data.trial_ends_at) > new Date());

      const tierData = {
        plan: isActive ? data.plan : 'free',
        seats: isActive ? data.seats : 1,
        status: data.status,
        periodEnd: data.current_period_end,
        cachedAt: Date.now()
      };

      _writeCache(tierData);
      _applyTier(tierData);

    } catch (err) {
      console.error('[tierSystem] Error loading tier:', err);
      _tier = 'free';
    }
  }

  function _applyTier({ plan, seats, status, periodEnd }) {
    _tier = plan || 'free';
    _seats = seats || 1;
    _status = status || 'active';
    _periodEnd = periodEnd;
    _updateUI();
  }

  function _readCache() {
    try {
      const raw = sessionStorage.getItem(TIER_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
      return parsed;
    } catch { return null; }
  }

  function _writeCache(data) {
    try { sessionStorage.setItem(TIER_CACHE_KEY, JSON.stringify(data)); }
    catch { /* sessionStorage lleno — ignorar */ }
  }

  function clearCache() {
    sessionStorage.removeItem(TIER_CACHE_KEY);
  }

  function _updateUI() {
    // Añadir data-attribute al body para CSS
    document.body.dataset.tier = _tier;
    // Badge en el sidebar/nav si existe
    const badge = document.getElementById('tier-badge');
    if (badge) {
      badge.textContent = _tier.toUpperCase();
      badge.className = `tier-badge tier-badge--${_tier}`;
    }
  }

  // API pública
  function isPro() { return _tier === 'pro' || _tier === 'agency'; }
  function isAgency() { return _tier === 'agency'; }
  function isFree() { return _tier === 'free'; }
  function getTier() { return _tier; }
  function getSeats() { return _seats; }
  function getPeriodEnd() { return _periodEnd; }

  /**
   * Guard function — úsala al inicio de cada feature premium
   * @param {'pro'|'agency'} minTier - Tier mínimo requerido
   * @param {string} featureName - Nombre para el modal de upgrade
   * @returns {boolean} true si tiene acceso, false si no (y muestra modal)
   */
  function requiresTier(minTier, featureName = '') {
    const tiers = { free: 0, pro: 1, agency: 2 };
    const userLevel = tiers[_tier] ?? 0;
    const requiredLevel = tiers[minTier] ?? 1;

    if (userLevel >= requiredLevel) return true;

    // Mostrar modal de upgrade
    showUpgradeModal(featureName, minTier);
    return false;
  }

  return { load, isPro, isAgency, isFree, getTier, getSeats,
           getPeriodEnd, requiresTier, clearCache };
})();
```

### Llamada al cargar la sesión

```javascript
// Dentro del listener onAuthStateChange existente, añadir:
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    await tierSystem.load(supabase);
  }
  if (event === 'SIGNED_OUT') {
    tierSystem.clearCache();
    document.body.dataset.tier = 'free';
  }
});

// También cargar en el arranque si ya hay sesión activa:
const { data: { session } } = await supabase.auth.getSession();
if (session) await tierSystem.load(supabase);
```

---

## TAREA 4 de 5 — Guards en módulos premium + Modal de Upgrade

**Archivo a modificar:** `index.html` — las funciones de navegación/carga de cada módulo premium

### Patrón de guard (aplicar a cada módulo bloqueado)

```javascript
// ANTES de cargar cada módulo premium, añadir este guard al inicio:

// Ejemplo para CRM:
function loadCrmView() {
  if (!tierSystem.requiresTier('pro', 'CRM Inteligente')) return;
  // ... resto del código existente de loadCrmView
}

// Ejemplo para Propuestas:
function loadProposalsView() {
  if (!tierSystem.requiresTier('pro', 'Generador de Propuestas')) return;
  // ... resto del código existente
}

// Ejemplo para Equipos IA:
function loadTeamsView() {
  if (!tierSystem.requiresTier('pro', 'Equipos IA')) return;
  // ... resto del código existente
}

// Ejemplo para Biblioteca (límite en Free, no bloqueo total):
function canAddPrompt() {
  if (tierSystem.isFree()) {
    // Contar prompts actuales del usuario
    const prompts = getPromptsFromStorage(); // función existente
    if (prompts.length >= 5) {
      tierSystem.requiresTier('pro', 'Biblioteca ilimitada');
      return false;
    }
  }
  return true;
}
```

### Modal de Upgrade

```javascript
// Añadir esta función al script de index.html:

function showUpgradeModal(featureName = '', minTier = 'pro') {
  // Eliminar modal previo si existe
  document.getElementById('upgrade-modal')?.remove();

  const isAgencyRequired = minTier === 'agency';
  const proUrl = 'https://shop.aiworksuite.pro/l/aiworksuite-pro';
  const agencyUrl = 'https://shop.aiworksuite.pro/l/aiworksuite-agency';

  const modal = document.createElement('div');
  modal.id = 'upgrade-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Upgrade a Pro');

  modal.innerHTML = `
    <div class="upgrade-modal__backdrop" id="upgrade-modal-backdrop"></div>
    <div class="upgrade-modal__card">
      <button class="upgrade-modal__close" id="upgrade-modal-close" aria-label="Cerrar">✕</button>
      
      <div class="upgrade-modal__icon">⚡</div>
      <h2 class="upgrade-modal__title">
        ${featureName ? `<strong>${featureName}</strong> es una función Pro` : 'Función exclusiva Pro'}
      </h2>
      <p class="upgrade-modal__subtitle">
        Desbloquea todas las herramientas y lleva tu flujo de trabajo al siguiente nivel.
      </p>

      <ul class="upgrade-modal__features">
        <li>✅ CRM completo con pipeline de 7 etapas</li>
        <li>✅ Propuestas con IA ilimitadas</li>
        <li>✅ Equipos IA configurables</li>
        <li>✅ Biblioteca de prompts ilimitada</li>
        <li>✅ 14 días de prueba gratuita</li>
      </ul>

      <div class="upgrade-modal__ctas">
        <a href="${proUrl}" target="_blank" rel="noopener" class="btn btn--primary btn--lg">
          ⚡ Probar Pro gratis 14 días — $19/mes
        </a>
        ${!isAgencyRequired ? `
        <a href="${agencyUrl}" target="_blank" rel="noopener" class="btn btn--ghost">
          👥 Agency (hasta 5 usuarios) — $49/mes
        </a>` : `
        <a href="${agencyUrl}" target="_blank" rel="noopener" class="btn btn--primary btn--lg">
          👥 Agency (hasta 5 usuarios) — $49/mes
        </a>`}
      </div>

      <p class="upgrade-modal__footnote">
        Garantía de devolución 14 días · Sin permanencia · Cancela cuando quieras
      </p>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('upgrade-modal--visible'));

  // Cerrar
  const close = () => {
    modal.classList.remove('upgrade-modal--visible');
    setTimeout(() => modal.remove(), 300);
  };
  document.getElementById('upgrade-modal-close').addEventListener('click', close);
  document.getElementById('upgrade-modal-backdrop').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });
}
```

### CSS del modal (añadir al `<style>` de index.html)

```css
/* ── Upgrade Modal ── */
#upgrade-modal {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.3s ease;
}
#upgrade-modal.upgrade-modal--visible { opacity: 1; }

.upgrade-modal__backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
}

.upgrade-modal__card {
  position: relative; z-index: 1;
  background: var(--bg-card, #1a1b1e);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 16px; padding: 2rem;
  max-width: 480px; width: calc(100% - 2rem);
  text-align: center;
  transform: translateY(20px);
  transition: transform 0.3s ease;
}
#upgrade-modal.upgrade-modal--visible .upgrade-modal__card {
  transform: translateY(0);
}

.upgrade-modal__close {
  position: absolute; top: 1rem; right: 1rem;
  background: none; border: none;
  color: var(--text-muted, #888); cursor: pointer; font-size: 1.25rem;
}

.upgrade-modal__icon { font-size: 2.5rem; margin-bottom: 0.75rem; }

.upgrade-modal__title {
  font-size: 1.25rem; margin-bottom: 0.5rem;
  color: var(--text-primary, #fff);
}

.upgrade-modal__subtitle {
  color: var(--text-muted, #aaa); margin-bottom: 1.25rem; font-size: 0.9rem;
}

.upgrade-modal__features {
  list-style: none; padding: 0; margin: 0 0 1.5rem;
  text-align: left; display: inline-block;
}
.upgrade-modal__features li {
  padding: 0.25rem 0; font-size: 0.9rem;
  color: var(--text-secondary, #ccc);
}

.upgrade-modal__ctas {
  display: flex; flex-direction: column; gap: 0.75rem;
}

.upgrade-modal__footnote {
  margin-top: 1rem; font-size: 0.75rem;
  color: var(--text-muted, #777);
}

/* Badge de tier en nav */
.tier-badge {
  display: inline-block; padding: 2px 8px;
  border-radius: 999px; font-size: 0.65rem;
  font-weight: 700; letter-spacing: 0.05em;
}
.tier-badge--free { background: var(--bg-muted, #333); color: #888; }
.tier-badge--pro { background: #f0a500; color: #000; }
.tier-badge--agency { background: #7c3aed; color: #fff; }

/* CSS para bloquear visualmente módulos en Free */
[data-tier="free"] .premium-indicator { display: flex; }
[data-tier="pro"] .premium-indicator,
[data-tier="agency"] .premium-indicator { display: none; }
```

---

## TAREA 5 de 5 — Vista de Pricing dentro de la app

**Archivo a modificar:** `index.html` — añadir vista `view-pricing` al sistema de vistas existente

### HTML de la sección pricing

```html
<!-- Añadir al menú de navegación lateral (sidebar) -->
<!-- Busca el nav existente y añade este ítem: -->
<button class="nav-item" data-view="pricing" id="nav-pricing">
  <span class="nav-icon">💎</span>
  <span class="nav-label" data-i18n="nav.pricing">Planes</span>
  <span id="tier-badge" class="tier-badge tier-badge--free">FREE</span>
</button>

<!-- Vista completa de pricing -->
<section id="view-pricing" class="view" hidden>
  <div class="view-header">
    <h1 data-i18n="pricing.title">Elige tu plan</h1>
    <p class="view-subtitle" data-i18n="pricing.subtitle">
      14 días de prueba gratuita · Sin tarjeta hasta que decidas · Cancela cuando quieras
    </p>
  </div>

  <!-- Toggle mensual/anual -->
  <div class="pricing-toggle">
    <span data-i18n="pricing.monthly">Mensual</span>
    <button class="toggle-switch" id="billing-toggle" aria-pressed="false">
      <span class="toggle-thumb"></span>
    </button>
    <span data-i18n="pricing.yearly">Anual</span>
    <span class="pricing-badge-save" data-i18n="pricing.save">Ahorra 20%</span>
  </div>

  <!-- Cards de pricing -->
  <div class="pricing-grid">

    <!-- FREE -->
    <div class="pricing-card pricing-card--free">
      <div class="pricing-card__header">
        <h2>Free</h2>
        <div class="pricing-card__price">
          <span class="price-amount">$0</span>
          <span class="price-period" data-i18n="pricing.forever">para siempre</span>
        </div>
      </div>
      <ul class="pricing-card__features">
        <li>✅ Dashboard con KPIs</li>
        <li>✅ Workspace (3 chats)</li>
        <li>✅ Biblioteca (máx. 5 prompts)</li>
        <li>❌ CRM inteligente</li>
        <li>❌ Propuestas con IA</li>
        <li>❌ Equipos IA</li>
        <li>❌ Biblioteca ilimitada</li>
      </ul>
      <div class="pricing-card__cta">
        <button class="btn btn--ghost btn--block" disabled id="current-plan-free">
          Plan actual
        </button>
      </div>
    </div>

    <!-- PRO -->
    <div class="pricing-card pricing-card--pro pricing-card--featured">
      <div class="pricing-card__badge" data-i18n="pricing.popular">Más popular</div>
      <div class="pricing-card__header">
        <h2>Pro</h2>
        <div class="pricing-card__price">
          <span class="price-amount" id="pro-price">$19</span>
          <span class="price-period">/mes</span>
        </div>
        <span class="price-annual-note" id="pro-annual-note" hidden>$180/año · ahorras $48</span>
      </div>
      <ul class="pricing-card__features">
        <li>✅ Todo lo de Free</li>
        <li>✅ CRM pipeline 7 etapas + IA</li>
        <li>✅ Propuestas con IA ilimitadas</li>
        <li>✅ Equipos IA configurables</li>
        <li>✅ Biblioteca ilimitada</li>
        <li>✅ Workspace ilimitado</li>
        <li>✅ 1 usuario</li>
      </ul>
      <div class="pricing-card__cta">
        <a href="https://shop.aiworksuite.pro/l/aiworksuite-pro"
           id="cta-pro"
           target="_blank" rel="noopener"
           class="btn btn--primary btn--block gumroad-button">
          ⚡ Empezar prueba gratuita
        </a>
      </div>
    </div>

    <!-- AGENCY -->
    <div class="pricing-card pricing-card--agency">
      <div class="pricing-card__header">
        <h2>Agency</h2>
        <div class="pricing-card__price">
          <span class="price-amount" id="agency-price">$49</span>
          <span class="price-period">/mes</span>
        </div>
        <span class="price-annual-note" id="agency-annual-note" hidden>$468/año · ahorras $120</span>
      </div>
      <ul class="pricing-card__features">
        <li>✅ Todo lo de Pro</li>
        <li>✅ Hasta 5 usuarios (seats)</li>
        <li>✅ Biblioteca compartida de equipo</li>
        <li>✅ Equipos IA compartidos</li>
        <li>✅ Dashboard de equipo</li>
        <li>✅ Soporte prioritario</li>
      </ul>
      <div class="pricing-card__cta">
        <a href="https://shop.aiworksuite.pro/l/aiworksuite-agency"
           id="cta-agency"
           target="_blank" rel="noopener"
           class="btn btn--secondary btn--block gumroad-button">
          👥 Empezar prueba gratuita
        </a>
      </div>
    </div>

  </div>

  <!-- FAQ mínimo -->
  <div class="pricing-faq">
    <h3 data-i18n="pricing.faq.title">Preguntas frecuentes</h3>
    <details>
      <summary data-i18n="pricing.faq.q1">¿Necesito tarjeta de crédito para la prueba?</summary>
      <p data-i18n="pricing.faq.a1">No. Los 14 días de prueba son completamente gratuitos. Solo se te cobrará si decides continuar.</p>
    </details>
    <details>
      <summary data-i18n="pricing.faq.q2">¿Puedo cancelar en cualquier momento?</summary>
      <p data-i18n="pricing.faq.a2">Sí. Sin permanencia ni penalizaciones. Tu acceso continúa hasta el final del período pagado.</p>
    </details>
    <details>
      <summary data-i18n="pricing.faq.q3">¿Qué pasa con mis datos si cancelo?</summary>
      <p data-i18n="pricing.faq.a3">Tus datos permanecen accesibles en modo Free. Nada se elimina automáticamente.</p>
    </details>
    <details>
      <summary data-i18n="pricing.faq.q4">¿Traéis API key propia (BYOK)?</summary>
      <p data-i18n="pricing.faq.a4">Sí. Conectas tu propia clave de Groq, OpenAI, Anthropic u OpenRouter. AIWorkSuite no almacena ni usa tus claves en nuestros servidores.</p>
    </details>
  </div>
</section>
```

### JS del toggle mensual/anual

```javascript
// Añadir al bloque script de index.html:

document.getElementById('billing-toggle')?.addEventListener('click', function() {
  const isAnnual = this.getAttribute('aria-pressed') === 'true';
  this.setAttribute('aria-pressed', String(!isAnnual));

  const proPrice = document.getElementById('pro-price');
  const agencyPrice = document.getElementById('agency-price');
  const proNote = document.getElementById('pro-annual-note');
  const agencyNote = document.getElementById('agency-annual-note');
  const ctaPro = document.getElementById('cta-pro');
  const ctaAgency = document.getElementById('cta-agency');

  if (!isAnnual) {
    // Cambiar a anual
    if (proPrice) proPrice.textContent = '$15';
    if (agencyPrice) agencyPrice.textContent = '$39';
    if (proNote) proNote.hidden = false;
    if (agencyNote) agencyNote.hidden = false;
    if (ctaPro) ctaPro.href = 'https://shop.aiworksuite.pro/l/aiworksuite-pro?option=yearly';
    if (ctaAgency) ctaAgency.href = 'https://shop.aiworksuite.pro/l/aiworksuite-agency?option=yearly';
  } else {
    // Volver a mensual
    if (proPrice) proPrice.textContent = '$19';
    if (agencyPrice) agencyPrice.textContent = '$49';
    if (proNote) proNote.hidden = true;
    if (agencyNote) agencyNote.hidden = true;
    if (ctaPro) ctaPro.href = 'https://shop.aiworksuite.pro/l/aiworksuite-pro';
    if (ctaAgency) ctaAgency.href = 'https://shop.aiworksuite.pro/l/aiworksuite-agency';
  }
});

// Cargar script de Gumroad overlay para los botones .gumroad-button
const gumroadScript = document.createElement('script');
gumroadScript.src = 'https://gumroad.com/js/gumroad.js';
gumroadScript.async = true;
document.head.appendChild(gumroadScript);
```

---

## CONFIGURACIÓN CLOUDFLARE PAGES — Variables de Entorno

Ve a Cloudflare Pages → aiworksuite → Settings → Environment Variables
y añade estas variables en **Production**:

```
SUPABASE_URL                = https://TU_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY   = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (service_role)
GUMROAD_WEBHOOK_SECRET      = [generar en Gumroad: Settings → Advanced → Webhooks]
GUMROAD_PRODUCT_PRO_ID      = [ID del producto Pro en tu dashboard Gumroad]
GUMROAD_PRODUCT_AGENCY_ID   = [ID del producto Agency en tu dashboard Gumroad]
```

## CONFIGURACIÓN WEBHOOK EN GUMROAD

En Gumroad Dashboard → Settings → Advanced → Webhooks:
- URL: `https://aiworksuite.pro/api/gumroad-webhook`
- Eventos a activar: `sale`, `subscription_cancelled`, `subscription_failed`
- Copiar el secret generado → pegar en variable `GUMROAD_WEBHOOK_SECRET` de Cloudflare

---

## ORDEN DE IMPLEMENTACIÓN RECOMENDADO

1. **Ejecutar SQL** (`supabase-gumroad.sql`) en Supabase SQL Editor
2. **Añadir variables** de entorno en Cloudflare Pages
3. **Crear** `functions/api/gumroad-webhook.js`
4. **Añadir** `tierSystem` al script de `index.html`
5. **Añadir** guards `requiresTier()` a cada módulo premium
6. **Añadir** función `showUpgradeModal()` y su CSS
7. **Añadir** vista `view-pricing` al HTML y su JS de toggle
8. **Configurar webhook** en Gumroad apuntando a `/api/gumroad-webhook`
9. **Test end-to-end**: compra de prueba → verificar que Supabase recibe el tier
10. **Commit y deploy** en Cloudflare Pages

---

## TESTS MÍNIMOS A VERIFICAR ANTES DE COMMIT

- [ ] Usuario Free ve modal de upgrade al clicar CRM
- [ ] Usuario Free puede añadir máx 5 prompts, el 6º dispara modal
- [ ] Badge de tier en nav muestra "FREE" / "PRO" / "AGENCY" correctamente
- [ ] Toggle mensual/anual cambia precios y URLs de Gumroad
- [ ] Webhook recibe POST de prueba (usar Gumroad test sale) y escribe en Supabase
- [ ] Usuario Pro no ve ningún modal de upgrade
- [ ] Modal se cierra con ESC, click en backdrop y botón ✕
- [ ] En mobile el modal no desborda la pantalla

---

*Generado por MolvicStudios · AIWorkSuite v4 · marzo 2026*
*Stack: Vanilla JS · Supabase · Cloudflare Pages · Gumroad*
