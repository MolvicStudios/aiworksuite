# AIWorkSuite v4 — Mega-prompt v2: Integración Gumroad + Sistema de Tiers Premium
## Para VS Code + GitHub Copilot (Claude Sonnet)
## MolvicStudios · marzo 2026
## ⚠️ v2 — Corrige bugs críticos del webhook respecto a v1

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
- Supabase project: `wyewytqeswunhugoncat` · región `eu-west-1`

**Tiers definidos:**
| Tier | Precio | Seats | Gumroad Product ID |
|------|--------|-------|--------------------|
| Free | $0 | 1 | — |
| Pro | $19/mes · $180/año | 1 | `xozxj` |
| Agency | $49/mes · $468/año | hasta 5 | `juowa` |

**Módulos premium (bloqueados en Free):**
- CRM completo (pipeline 7 etapas + chat IA por fase) → Pro + Agency
- Generador de Propuestas con IA → Pro + Agency
- Equipos IA (lanzador 4 pasos) → Pro + Agency
- Biblioteca de Prompts ilimitada (Free: máx 5 prompts) → Pro + Agency

**Estado actual de implementación:**
- ✅ TAREA 1 completada: tablas `subscriptions` + `subscription_seats` + RLS + vista `user_active_tier` creadas en Supabase
- ✅ TAREA 2 completada: `functions/api/gumroad-webhook.js` creado y corregido
- ⏳ TAREA 3 pendiente: `tierSystem` en index.html
- ⏳ TAREA 4 pendiente: guards + modal upgrade
- ⏳ TAREA 5 pendiente: vista pricing

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

## REFERENCIA: TAREA 2 CORREGIDA (ya implementada — solo referencia)

El archivo `functions/api/gumroad-webhook.js` fue corregido por Copilot con estos 5 fixes:

### Fix 1 — Bug de doble consumo del body
```javascript
// ❌ INCORRECTO (v1) — body consumido dos veces
const formData = await request.formData();
// ... más abajo ...
const isValid = await verifyGumroadSignature(await request.text(), ...);

// ✅ CORRECTO (v2) — leer raw una sola vez
const rawBody = await request.text();
const payload = Object.fromEntries(new URLSearchParams(rawBody).entries());
```

### Fix 2 — Prefer header para upsert correcto
```javascript
// ✅ Añadir en el upsert de subscriptions:
'Prefer': 'return=representation,resolution=merge-duplicates'
```

### Fix 3 — Evitar duplicación de seats Agency
```javascript
// ✅ Antes de insertar seat owner, comprobar si ya existe:
const existingSeats = await supabaseRequest(
  `/subscription_seats?subscription_id=eq.${subId}&role=eq.owner`,
  'GET', null, env
);
if (!existingSeats.length) {
  await supabaseRequest('/subscription_seats', 'POST', { ... }, env);
}
```

### Fix 4 — cancelled_at timestamp automático
```javascript
// ✅ Al recibir subscription_cancelled:
await updateSubscriptionStatus(email, 'cancelled', env);
// updateSubscriptionStatus incluye cancelled_at: new Date().toISOString()
```

### Fix 5 — getUserIdByEmail con Admin API correcta
```javascript
// ✅ Paginación + filtro en JS (la Admin API no filtra por email en query params)
async function getUserIdByEmail(email, env) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const user = data.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
  return user?.id ?? null;
}
```

**Endpoint resultante:** `POST https://aiworksuite.pro/api/gumroad-webhook`

---

## TAREA 3 de 5 — JS: Sistema de Tiers en el Frontend

**Archivo a modificar:** `index.html` — añadir al módulo de auth existente

Crea el módulo `tierSystem` como IIFE que se inicialice tras el login de Supabase.

```javascript
// ─────────────────────────────────────────────────────────────────────────────
// TIER SYSTEM — Añadir dentro del bloque <script> de index.html
// justo después de la inicialización de Supabase Auth
// ─────────────────────────────────────────────────────────────────────────────

const tierSystem = (() => {
  let _tier = 'free';
  let _seats = 1;
  let _status = 'active';
  let _periodEnd = null;

  const CACHE_KEY = 'aiws_tier_cache';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  // ── Carga el tier desde Supabase ──────────────────────────────────────────
  async function load(supabaseClient) {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) { _reset(); return; }

      // Intentar cache reciente (evita queries en cada navegación)
      const cached = _readCache();
      if (cached) { _apply(cached); return; }

      const { data, error } = await supabaseClient
        .from('subscriptions')
        .select('plan, status, seats, billing_cycle, current_period_end, trial_ends_at')
        .eq('user_id', user.id)
        .single();

      if (error || !data) { _reset(); return; }

      // Validar vigencia
      const isActive =
        data.status === 'active' ||
        (data.status === 'trialing' && new Date(data.trial_ends_at) > new Date());

      const tierData = {
        plan: isActive ? data.plan : 'free',
        seats: isActive ? (data.seats ?? 1) : 1,
        status: data.status,
        periodEnd: data.current_period_end,
        cachedAt: Date.now()
      };

      _writeCache(tierData);
      _apply(tierData);

    } catch (err) {
      console.error('[tierSystem] load error:', err);
      _reset();
    }
  }

  function _reset() {
    _tier = 'free'; _seats = 1; _status = 'active'; _periodEnd = null;
    _updateUI();
  }

  function _apply({ plan, seats, status, periodEnd }) {
    _tier = plan ?? 'free';
    _seats = seats ?? 1;
    _status = status ?? 'active';
    _periodEnd = periodEnd ?? null;
    _updateUI();
  }

  function _readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.cachedAt > CACHE_TTL) return null;
      return parsed;
    } catch { return null; }
  }

  function _writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); }
    catch { /* sessionStorage lleno */ }
  }

  function clearCache() {
    sessionStorage.removeItem(CACHE_KEY);
  }

  // ── Actualiza UI con el tier activo ───────────────────────────────────────
  function _updateUI() {
    // data-attribute en body para CSS targeting
    document.body.dataset.tier = _tier;

    // Badge en nav si existe
    const badge = document.getElementById('tier-badge');
    if (badge) {
      badge.textContent = _tier.toUpperCase();
      badge.className = `tier-badge tier-badge--${_tier}`;
    }

    // Mostrar/ocultar indicadores de lock en módulos premium
    document.querySelectorAll('[data-requires-tier]').forEach(el => {
      const required = el.dataset.requiresTier;
      const tiers = { free: 0, pro: 1, agency: 2 };
      const hasAccess = (tiers[_tier] ?? 0) >= (tiers[required] ?? 1);
      el.querySelector('.premium-lock')?.classList.toggle('hidden', hasAccess);
    });
  }

  // ── Guard principal ───────────────────────────────────────────────────────
  /**
   * Llama esto al inicio de cada función de módulo premium.
   * @param {'pro'|'agency'} minTier
   * @param {string} featureName - nombre para el modal
   * @returns {boolean} true = tiene acceso, false = muestra modal y bloquea
   */
  function requiresTier(minTier, featureName = '') {
    const tiers = { free: 0, pro: 1, agency: 2 };
    const userLevel = tiers[_tier] ?? 0;
    const requiredLevel = tiers[minTier] ?? 1;
    if (userLevel >= requiredLevel) return true;
    showUpgradeModal(featureName, minTier);
    return false;
  }

  // ── API pública ───────────────────────────────────────────────────────────
  return {
    load,
    clearCache,
    requiresTier,
    isPro:      () => _tier === 'pro' || _tier === 'agency',
    isAgency:   () => _tier === 'agency',
    isFree:     () => _tier === 'free',
    getTier:    () => _tier,
    getSeats:   () => _seats,
    getPeriodEnd: () => _periodEnd
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// Integrar con el listener onAuthStateChange EXISTENTE
// Busca el onAuthStateChange que ya tienes y añade estas líneas dentro:
// ─────────────────────────────────────────────────────────────────────────────

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    await tierSystem.load(supabase);
    // ... resto de tu código existente de SIGNED_IN
  }
  if (event === 'SIGNED_OUT') {
    tierSystem.clearCache();
    document.body.dataset.tier = 'free';
    // ... resto de tu código existente de SIGNED_OUT
  }
});

// Cargar en arranque si ya hay sesión activa
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await tierSystem.load(supabase);
})();
```

---

## TAREA 4 de 5 — Guards en módulos premium + Modal de Upgrade

### 4A — Guards (añadir al inicio de cada función de módulo)

```javascript
// ── CRM ──────────────────────────────────────────────────────────────────────
// Busca la función que carga la vista del CRM (probablemente showView('crm')
// o loadCrmView() o similar) y añade al inicio:
function loadCrmView() {
  if (!tierSystem.requiresTier('pro', 'CRM Inteligente')) return;
  // ... resto del código existente sin cambios
}

// ── Propuestas ────────────────────────────────────────────────────────────────
function loadProposalsView() {
  if (!tierSystem.requiresTier('pro', 'Generador de Propuestas')) return;
  // ... resto del código existente sin cambios
}

// ── Equipos IA ────────────────────────────────────────────────────────────────
function loadTeamsView() {
  if (!tierSystem.requiresTier('pro', 'Equipos IA')) return;
  // ... resto del código existente sin cambios
}

// ── Biblioteca — límite soft en Free (no bloqueo total) ──────────────────────
function canAddPrompt() {
  if (tierSystem.isFree()) {
    const prompts = getPromptsFromStorage(); // usa tu función existente
    if (prompts.length >= 5) {
      tierSystem.requiresTier('pro', 'Biblioteca ilimitada de Prompts');
      return false;
    }
  }
  return true;
}
// Llama canAddPrompt() antes de guardar un nuevo prompt
```

### 4B — Modal de Upgrade

```javascript
// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE MODAL — Añadir al bloque <script> de index.html
// ─────────────────────────────────────────────────────────────────────────────

function showUpgradeModal(featureName = '', minTier = 'pro') {
  document.getElementById('upgrade-modal')?.remove();

  const PRO_URL    = 'https://shop.aiworksuite.pro/l/xozxj';
  const AGENCY_URL = 'https://shop.aiworksuite.pro/l/juowa';

  const modal = document.createElement('div');
  modal.id = 'upgrade-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Actualizar plan');

  modal.innerHTML = `
    <div class="upm__backdrop" id="upm-backdrop"></div>
    <div class="upm__card">
      <button class="upm__close" id="upm-close" aria-label="Cerrar">✕</button>
      <div class="upm__icon">⚡</div>
      <h2 class="upm__title">
        ${featureName
          ? `<strong>${featureName}</strong> es exclusivo de Pro`
          : 'Función exclusiva Pro'}
      </h2>
      <p class="upm__sub">
        Desbloquea todo AIWorkSuite y lleva tu productividad al siguiente nivel.
      </p>
      <ul class="upm__list">
        <li>✅ CRM inteligente — pipeline 7 etapas</li>
        <li>✅ Propuestas con IA ilimitadas</li>
        <li>✅ Equipos IA configurables</li>
        <li>✅ Biblioteca de prompts ilimitada</li>
        <li>✅ 14 días de prueba gratuita incluidos</li>
      </ul>
      <div class="upm__ctas">
        <a href="${PRO_URL}" target="_blank" rel="noopener"
           class="btn btn--primary btn--block">
          ⚡ Probar Pro gratis — $19/mes
        </a>
        <a href="${AGENCY_URL}" target="_blank" rel="noopener"
           class="btn btn--ghost btn--block">
          👥 Agency (5 usuarios) — $49/mes
        </a>
      </div>
      <p class="upm__fine">
        Garantía 14 días · Sin permanencia · Cancela cuando quieras
      </p>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('upm--visible'));

  const close = () => {
    modal.classList.remove('upm--visible');
    setTimeout(() => modal.remove(), 280);
  };

  document.getElementById('upm-close').addEventListener('click', close);
  document.getElementById('upm-backdrop').addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  }, { once: true });
}
```

### 4C — CSS del modal (añadir al `<style>` de index.html)

```css
/* ── Upgrade Modal ─────────────────────────────────────────────────────────── */
#upgrade-modal {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .28s ease;
  pointer-events: none;
}
#upgrade-modal.upm--visible {
  opacity: 1; pointer-events: all;
}
.upm__backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,.72); backdrop-filter: blur(4px);
}
.upm__card {
  position: relative; z-index: 1;
  background: var(--bg-card, #1a1b1e);
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: 16px; padding: 2rem;
  max-width: 460px; width: calc(100% - 2rem);
  text-align: center;
  transform: translateY(18px);
  transition: transform .28s ease;
}
#upgrade-modal.upm--visible .upm__card { transform: translateY(0); }

.upm__close {
  position: absolute; top: 1rem; right: 1rem;
  background: none; border: none;
  color: var(--text-muted, #888); cursor: pointer; font-size: 1.2rem;
  line-height: 1;
}
.upm__icon  { font-size: 2.4rem; margin-bottom: .6rem; }
.upm__title { font-size: 1.2rem; margin-bottom: .4rem;
              color: var(--text-primary, #fff); }
.upm__sub   { font-size: .875rem; color: var(--text-muted, #aaa);
              margin-bottom: 1.2rem; }
.upm__list  { list-style: none; padding: 0; margin: 0 0 1.4rem;
              text-align: left; display: inline-block; }
.upm__list li { padding: .2rem 0; font-size: .875rem;
                color: var(--text-secondary, #ccc); }
.upm__ctas  { display: flex; flex-direction: column; gap: .6rem; }
.upm__fine  { margin-top: .9rem; font-size: .72rem;
              color: var(--text-muted, #777); }

/* ── Tier badge en nav ──────────────────────────────────────────────────────── */
.tier-badge {
  display: inline-block; padding: 2px 7px;
  border-radius: 999px; font-size: .62rem;
  font-weight: 700; letter-spacing: .05em; vertical-align: middle;
}
.tier-badge--free   { background: var(--bg-muted,#333); color: #888; }
.tier-badge--pro    { background: #f0a500; color: #000; }
.tier-badge--agency { background: #7c3aed; color: #fff; }

/* ── Lock visual en módulos bloqueados ─────────────────────────────────────── */
.premium-lock { display: none; }
[data-tier="free"] .premium-lock { display: flex; }

.hidden { display: none !important; }
```

---

## TAREA 5 de 5 — Vista de Pricing dentro de la app

### 5A — Ítem en el nav lateral (añadir al sidebar existente)

```html
<!-- Busca el nav lateral existente y añade este botón: -->
<button class="nav-item" data-view="pricing" id="nav-pricing">
  <span class="nav-icon">💎</span>
  <span class="nav-label" data-i18n="nav.pricing">Planes</span>
  <span id="tier-badge" class="tier-badge tier-badge--free">FREE</span>
</button>
```

### 5B — Sección completa de pricing

```html
<!-- Añadir junto al resto de vistas (junto a view-dash, view-crm, etc.) -->
<section id="view-pricing" class="view" hidden>

  <div class="view-header">
    <h1 data-i18n="pricing.title">Elige tu plan</h1>
    <p class="view-subtitle" data-i18n="pricing.subtitle">
      14 días de prueba gratis · Sin tarjeta hasta que decidas · Cancela cuando quieras
    </p>
  </div>

  <!-- Toggle mensual / anual -->
  <div class="pricing-toggle">
    <span data-i18n="pricing.monthly">Mensual</span>
    <button class="toggle-switch" id="billing-toggle" aria-pressed="false">
      <span class="toggle-thumb"></span>
    </button>
    <span data-i18n="pricing.yearly">Anual</span>
    <span class="pricing-save-badge" data-i18n="pricing.save">Ahorra 20%</span>
  </div>

  <!-- Cards -->
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
        <li>✅ Dashboard KPIs</li>
        <li>✅ Workspace (3 chats)</li>
        <li>✅ Biblioteca (máx. 5 prompts)</li>
        <li>❌ CRM inteligente</li>
        <li>❌ Propuestas con IA</li>
        <li>❌ Equipos IA</li>
        <li>❌ Biblioteca ilimitada</li>
      </ul>
      <button class="btn btn--ghost btn--block" disabled>Plan actual</button>
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
        <span class="price-note" id="pro-note" hidden>$180/año · ahorras $48</span>
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
      <a href="https://shop.aiworksuite.pro/l/xozxj"
         id="cta-pro" target="_blank" rel="noopener"
         class="btn btn--primary btn--block">
        ⚡ Empezar prueba gratuita
      </a>
    </div>

    <!-- AGENCY -->
    <div class="pricing-card pricing-card--agency">
      <div class="pricing-card__header">
        <h2>Agency</h2>
        <div class="pricing-card__price">
          <span class="price-amount" id="agency-price">$49</span>
          <span class="price-period">/mes</span>
        </div>
        <span class="price-note" id="agency-note" hidden>$468/año · ahorras $120</span>
      </div>
      <ul class="pricing-card__features">
        <li>✅ Todo lo de Pro</li>
        <li>✅ Hasta 5 usuarios (seats)</li>
        <li>✅ Biblioteca compartida de equipo</li>
        <li>✅ Equipos IA compartidos</li>
        <li>✅ Dashboard de equipo</li>
        <li>✅ Soporte prioritario</li>
      </ul>
      <a href="https://shop.aiworksuite.pro/l/juowa"
         id="cta-agency" target="_blank" rel="noopener"
         class="btn btn--secondary btn--block">
        👥 Empezar prueba gratuita
      </a>
    </div>

  </div><!-- /pricing-grid -->

  <!-- FAQ -->
  <div class="pricing-faq">
    <h3 data-i18n="pricing.faq.title">Preguntas frecuentes</h3>
    <details>
      <summary>¿Necesito tarjeta para la prueba gratuita?</summary>
      <p>No. Los 14 días son completamente gratis. Solo se cobra si decides continuar.</p>
    </details>
    <details>
      <summary>¿Puedo cancelar en cualquier momento?</summary>
      <p>Sí. Sin permanencia ni penalizaciones. Acceso hasta fin del período pagado.</p>
    </details>
    <details>
      <summary>¿Qué pasa con mis datos si cancelo?</summary>
      <p>Todo permanece en modo Free. Nada se elimina automáticamente.</p>
    </details>
    <details>
      <summary>¿Funciona con mi propia API key (BYOK)?</summary>
      <p>Sí. Conectas tu clave de Groq, OpenAI, Anthropic u OpenRouter. Nunca la almacenamos en nuestros servidores.</p>
    </details>
  </div>

</section>
```

### 5C — JS del toggle mensual/anual

```javascript
// Añadir al bloque <script> de index.html:

document.getElementById('billing-toggle')?.addEventListener('click', function () {
  const wasAnnual = this.getAttribute('aria-pressed') === 'true';
  const nowAnnual = !wasAnnual;
  this.setAttribute('aria-pressed', String(nowAnnual));

  const q = id => document.getElementById(id);

  if (nowAnnual) {
    if (q('pro-price'))    q('pro-price').textContent    = '$15';
    if (q('agency-price')) q('agency-price').textContent = '$39';
    if (q('pro-note'))     q('pro-note').hidden    = false;
    if (q('agency-note'))  q('agency-note').hidden  = false;
    if (q('cta-pro'))      q('cta-pro').href    = 'https://shop.aiworksuite.pro/l/xozxj?recurrence=yearly';
    if (q('cta-agency'))   q('cta-agency').href = 'https://shop.aiworksuite.pro/l/juowa?recurrence=yearly';
  } else {
    if (q('pro-price'))    q('pro-price').textContent    = '$19';
    if (q('agency-price')) q('agency-price').textContent = '$49';
    if (q('pro-note'))     q('pro-note').hidden    = true;
    if (q('agency-note'))  q('agency-note').hidden  = true;
    if (q('cta-pro'))      q('cta-pro').href    = 'https://shop.aiworksuite.pro/l/xozxj';
    if (q('cta-agency'))   q('cta-agency').href = 'https://shop.aiworksuite.pro/l/juowa';
  }
});

// Cargar script overlay de Gumroad (para los botones de compra)
if (!document.querySelector('script[src*="gumroad.com/js"]')) {
  const s = document.createElement('script');
  s.src = 'https://gumroad.com/js/gumroad.js';
  s.async = true;
  document.head.appendChild(s);
}
```

---

## VARIABLES DE ENTORNO — Cloudflare Pages

Cloudflare Pages → aiworksuite → Settings → Environment Variables → Production:

```
SUPABASE_URL              = https://wyewytqeswunhugoncat.supabase.co   [Text]
SUPABASE_SERVICE_ROLE_KEY = eyJ...                                      [Secret]
GUMROAD_PRODUCT_PRO_ID    = xozxj                                       [Text]
GUMROAD_PRODUCT_AGENCY_ID = juowa                                       [Text]
```

## WEBHOOK EN GUMROAD

Gumroad → Settings → Advanced → Ping:
- URL: `https://aiworksuite.pro/api/gumroad-webhook`
- ✅ Ya configurado

---

## ORDEN DE IMPLEMENTACIÓN — TAREAS RESTANTES

1. ✅ ~~TAREA 1~~ — SQL ejecutado vía MCP
2. ✅ ~~TAREA 2~~ — webhook.js creado y corregido por Copilot
3. **TAREA 3** — Añadir `tierSystem` al index.html + integrar con `onAuthStateChange`
4. **TAREA 4** — Añadir guards `requiresTier()` en los 4 módulos + `showUpgradeModal()` + CSS
5. **TAREA 5** — Añadir ítem nav + sección `view-pricing` + JS toggle
6. **Cloudflare** — Añadir las 4 variables de entorno (tú)
7. **Test E2E** — Compra test en Gumroad → verificar `subscriptions` en Supabase

---

## CHECKLIST FINAL ANTES DE COMMIT

- [ ] Usuario Free ve modal al intentar abrir CRM
- [ ] Usuario Free ve modal al intentar abrir Propuestas
- [ ] Usuario Free ve modal al intentar abrir Equipos IA
- [ ] Usuario Free puede añadir 5 prompts, el 6º dispara modal
- [ ] Badge en nav muestra FREE / PRO / AGENCY según sesión
- [ ] Toggle anual cambia precios correctamente ($19→$15, $49→$39)
- [ ] Modal se cierra con ESC, backdrop y botón ✕
- [ ] Modal no desborda en mobile (max-width + padding)
- [ ] Webhook recibe ping de prueba desde Gumroad sin error 500
- [ ] Registro en `subscriptions` tras compra de prueba
- [ ] Usuario Pro no ve ningún modal de bloqueo
- [ ] Deploy en Cloudflare Pages sin errores de build

---

*AIWorkSuite v4 — Mega-prompt v2 (correcciones webhook aplicadas)*
*MolvicStudios · marzo 2026*
