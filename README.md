# AIWorkSuite v4

> Suite IA para freelances — CRM · Propuestas · Equipos IA · Biblioteca de Prompts  
> by [MolvicStudios](https://molvicstudios.pro)

## Stack

- HTML5 + CSS + JavaScript vanilla (sin frameworks, sin bundler)
- Lemon Squeezy (licencias Pro — monthly/annual)
- BYOK: Anthropic · OpenAI · Groq · OpenRouter · Gemini · Mistral · DeepSeek · Together · Cohere · xAI
- Cloudflare Pages · dominio `aiworksuite.pro`
- PWA offline-first con Service Worker

## Archivos del proyecto

```
index.html             → SPA principal (renombrado de aiworksuite-launch.html)
manifest.json          → PWA manifest
sw.js                  → Service Worker (cache-first, offline-first)
offline.html           → Pantalla sin conexión
favicon.svg            → Icono SVG (crear manualmente — color #f0a500)
favicon-32x32.png      → 32×32px PNG
favicon-192x192.png    → 192×192px PNG (PWA)
favicon-512x512.png    → 512×512px PNG (PWA)
apple-touch-icon.png   → 180×180px (iOS)
og-image.png           → 1200×630px Open Graph
```

## Configuración antes de desplegar

### 1. Variables de entorno — Cloudflare Pages

En Cloudflare Pages → Settings → Environment variables, añadir:

| Variable | Descripción |
|----------|-------------|
| `LEMONSQUEEZY_API_KEY` | API Key de Lemon Squeezy (test o live) |
| `GROQ_API_KEY` | API Key de Groq (ya configurada) |

### 2. Cloudflare Pages

- Subir carpeta completa como "Upload assets" o conectar repositorio Git
- El archivo principal debe llamarse `index.html`
- Custom domain: `aiworksuite.pro`
- Añadir `LEMONSQUEEZY_API_KEY` en Settings → Environment variables (Production + Preview)

## Iconos PWA — crear manualmente

Los iconos necesitan crearse con herramientas externas (Figma, Canva, etc.):
- Base: fondo `#0c0d0f`, isotipo `AI` en color `#f0a500`, fuente Syne 800
- Generar todos los tamaños desde [PWA Asset Generator](https://www.pwabuilder.com/imageGenerator)
- `og-image.png` (1200×630): screenshot del dashboard o diseño de marca

## Checklist de lanzamiento

- [ ] `LEMONSQUEEZY_API_KEY` configurada en Cloudflare Pages
- [ ] `GROQ_API_KEY` configurada en Cloudflare Pages
- [ ] Iconos PWA creados (192, 512, apple-touch, og-image)
- [ ] API key de un proveedor configurada y probada (Groq recomendado)
- [ ] PWA instalable verificada en Chrome DevTools → Application → Manifest
- [ ] Modo offline probado (DevTools → Network → Offline)
- [ ] Banner de cookies visible en primera visita
- [ ] Modo claro y oscuro funcionan correctamente
- [ ] Toggle de idioma ES/EN funciona en toda la UI
- [ ] Licencia de test de Lemon Squeezy verificada end-to-end

## Proveedor IA recomendado para empezar

**[Groq](https://console.groq.com)** → modelo `llama-3.3-70b-versatile`  
✓ Clave gratuita · sin tarjeta · límite generoso · ultra rápido

## Estructura de módulos

| Módulo | Vista | Descripción |
|--------|-------|-------------|
| Dashboard | `view-dash` | KPIs, pipeline visual, actividad reciente |
| CRM | `view-crm` | Pipeline 7 etapas + chat IA por fase |
| Propuestas | `view-prop` | Generador con IA conectado al CRM |
| Biblioteca | `view-lib` | Prompts reutilizables con categorías |
| Equipos IA | `view-teams` | Lanzador con configurador 4 pasos |
| Workspace | `view-ws` | Multi-chat con modos y system prompt |
| Configuración | `view-settings` | API, perfil, datos, export/import |

## Contacto

molvicstudios@outlook.com · [molvicstudios.pro](https://molvicstudios.pro)
