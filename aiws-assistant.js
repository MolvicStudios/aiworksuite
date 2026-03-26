/*!
 * aiws-assistant.js v2 — Asistente técnico AIWorkSuite
 * Groq llama-3.3-70b-versatile (via /api/chat proxy) + EmailJS
 * Features: contexto dinámico, chips sugeridos, waitlist Pro, persistencia de chat
 */
const AIWS_CONFIG = {
  emailjsPublicKey: 'kvi-LqAhTnXY8j4Oj',
  emailjsServiceId: 'service_47c8fie',
  emailjsTemplateId:'template_9h8t9sa',
  siteName:         'AIWorkSuite',
};

(function () {
  'use strict';
  const NS       = 'aiws';
  const HIST_KEY = 'aiws_chat_v2';
  const MAX_HIST = 10;

  const VIEW_NAMES = {
    dash:'Dashboard', crm:'CRM (Gestión de Clientes)',
    prop:'Generador de Propuestas', lib:'Biblioteca de Prompts',
    teams:'Equipos IA', ws:'Workspace IA', settings:'Configuración'
  };

  /* ── SYSTEM PROMPT ── */
  const SYSTEM_BASE = `Eres Aiden, el asistente técnico oficial de AIWorkSuite (aiworksuite.pro), una suite SaaS de herramientas de IA para freelancers y profesionales independientes.

HERRAMIENTAS DISPONIBLES EN PLAN FREE (activo ahora):
- Generador de Propuestas IA: crea propuestas comerciales profesionales en segundos
- CRM básico: gestión de hasta 5 clientes con pipeline de 7 etapas y chat IA por fase
- Equipos IA: crea hasta 3 equipos de agentes IA especializados con distintos roles
- Workspace IA: chatea con cada equipo lanzado desde una pestaña dedicada
- Biblioteca de Prompts: guarda hasta 10 prompts personalizados y reutilízalos en cualquier módulo
- Clave BYOK (Groq gratis, OpenAI, Anthropic, OpenRouter) configurada en Ajustes → Proveedor IA
- Requiere registro gratuito con email

LÍMITES DEL PLAN FREE:
- Máx. 5 clientes en CRM (Pro: ilimitados)
- Máx. 3 equipos IA · 1 chat por equipo (Pro: ilimitados · 3 chats por equipo)
- Máx. 10 prompts en biblioteca (Pro: ilimitados)
- Sin detección automática de roles IA (Pro: detección IA de roles en equipos)
- Sin personalización de marca (Pro: logo propio, colores, cabeceras)

PLAN PRO — PRÓXIMAMENTE, AÚN NO DISPONIBLE:
El plan Pro está en desarrollo y no se ha lanzado todavía.
Las personas en la lista de espera serán las primeras en acceder con precio especial de lanzamiento.
Incluirá: clientes y equipos ilimitados, 3 chats por equipo, detección IA de roles,
prompts ilimitados, personalización de marca, soporte prioritario, acceso anticipado a nuevas herramientas.

PROBLEMAS TÉCNICOS FRECUENTES Y SOLUCIONES:
- "No genera / botón sin respuesta" → verificar conexión; si usa BYOK comprobar la clave en Ajustes → Proveedor IA
- "El texto sale en inglés" → rellenar el formulario en español, el idioma de salida sigue al idioma de entrada
- "No puedo iniciar sesión" → limpiar caché del navegador; verificar email confirmado (revisar carpeta spam)
- "No se guarda mi trabajo" → revisar que el almacenamiento del navegador no está bloqueado (modo incógnito puede causar esto)
- "Las plantillas / página no cargan" → recargar con Ctrl+F5
- "¿Funciona en móvil?" → sí, totalmente responsive en cualquier navegador moderno
- "¿Mis datos están seguros?" → autenticación Supabase con cifrado; datos no compartidos con terceros
- "¿Puedo usar mi propia clave de IA?" → sí, en Ajustes → Proveedor IA: Groq (gratis), OpenAI, Anthropic o OpenRouter
- "Clave de proveedor IA incorrecta" → verificar que no hay espacios al pegar la clave y que el plan del proveedor tiene crédito activo

REGLAS DE COMPORTAMIENTO:
- Responde SIEMPRE en el idioma del usuario (detecta automáticamente español e inglés)
- Tono amigable, técnico y resolutivo — ve directo a la solución
- Máximo 3 párrafos cortos por respuesta
- Si el usuario pregunta por Pro, precios o funciones Pro: explica que está PRÓXIMAMENTE, que aún no se ha lanzado, y ofrece avisarle por email cuando salga
- Si el usuario quiere apuntarse a la lista de espera → emite exactamente: [SHOW_WAITLIST_FORM]
- Si el problema técnico no tiene solución conocida o requiere intervención humana → emite exactamente: [SHOW_SUPPORT_FORM]
- Al final de cada respuesta donde NO emitas un formulario, sugiere 2 o 3 preguntas de seguimiento breves exactamente así en la última línea: [CHIPS:opción 1|opción 2|opción 3]
- No inventes funcionalidades que no existen`;

  /* ── PROMPT DINÁMICO ── */
  function buildPrompt() {
    const plan     = ((window.USER_PLAN) || 'free').toUpperCase();
    const email    = window.CURRENT_USER && window.CURRENT_USER.email ? window.CURRENT_USER.email : null;
    const viewEl   = document.querySelector('[id^="view-"].active');
    const viewId   = viewEl ? viewEl.id.replace('view-', '') : null;
    const viewName = viewId ? (VIEW_NAMES[viewId] || viewId) : 'Página principal / sin sesión';
    return [
      '[CONTEXTO DEL USUARIO EN ESTE MOMENTO]',
      'Plan activo: ' + plan,
      email ? 'Email: ' + email : 'Sesión: no iniciada',
      'Sección abierta: ' + viewName,
      '---',
      SYSTEM_BASE
    ].join('\n');
  }

  /* ── PERSISTENCIA ── */
  function loadHistory()  { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch(_) { return []; } }
  function saveHistory(h) { try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-MAX_HIST))); } catch(_) {} }

  /* ── SEGURIDAD ── */
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── CSS ── */
  const CSS = `
#${NS}-w *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',system-ui,sans-serif}
#${NS}-btn{display:none!important}
#${NS}-box{position:fixed;bottom:12px;left:56px;width:365px;max-height:610px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;z-index:9998;display:flex;flex-direction:column;overflow:hidden;transition:opacity .2s,transform .2s;opacity:0;transform:translateX(-8px) scale(.97);pointer-events:none;box-shadow:0 8px 40px rgba(0,0,0,.18)}
#${NS}-box.on{opacity:1;transform:none;pointer-events:all}
#${NS}-hd{background:linear-gradient(135deg,#1a1a2e 0%,#0f3460 100%);padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
#${NS}-hd .av{width:34px;height:34px;border-radius:50%;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;border:2px solid #a78bfa}
#${NS}-hd .nm{color:#f1f5f9;font-size:14px;font-weight:600}
#${NS}-hd .st{color:#94a3b8;font-size:11px;display:flex;align-items:center;gap:4px;margin-top:1px}
#${NS}-hd .dot{width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0}
#${NS}-hd .pr{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;letter-spacing:.05em;margin-left:auto;white-space:nowrap}
#${NS}-xbtn{background:none;border:none;cursor:pointer;color:#94a3b8;padding:4px;border-radius:6px;display:flex;margin-left:6px}
#${NS}-xbtn:hover{color:#f1f5f9;background:rgba(255,255,255,.1)}
#${NS}-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:0}
#${NS}-log::-webkit-scrollbar{width:4px}
#${NS}-log::-webkit-scrollbar-thumb{background:#ddd6fe;border-radius:4px}
.${NS}-m{max-width:86%;padding:9px 13px;border-radius:12px;font-size:13.5px;line-height:1.55;word-break:break-word}
.${NS}-m.bot{background:#f5f3ff;color:#1e1b4b;align-self:flex-start;border-bottom-left-radius:3px;border-left:3px solid #7c3aed}
.${NS}-m.usr{background:#1a1a2e;color:#f1f5f9;align-self:flex-end;border-bottom-right-radius:3px}
.${NS}-m a{color:#7c3aed;text-decoration:underline}
#${NS}-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px}
.${NS}-chip{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:20px;padding:5px 12px;font-size:12px;color:#5b21b6;cursor:pointer;transition:background .15s,color .15s,border-color .15s;white-space:nowrap}
.${NS}-chip:hover{background:#7c3aed;color:#fff;border-color:#7c3aed}
#${NS}-ft{padding:12px;border-top:1px solid #f1f5f9;display:flex;gap:8px;flex-shrink:0}
#${NS}-inp{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;font-size:13.5px;outline:none;resize:none;max-height:80px;line-height:1.4;color:#1e293b;background:#fff}
#${NS}-inp:focus{border-color:#7c3aed}
#${NS}-snd{background:#7c3aed;border:none;border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}
#${NS}-snd:hover{background:#6d28d9}
#${NS}-snd:disabled{background:#e2e8f0;cursor:default}
.${NS}-dots{display:flex;align-items:center;gap:4px;padding:9px 13px;background:#f5f3ff;border-radius:12px;border-bottom-left-radius:3px;align-self:flex-start}
.${NS}-dots span{width:6px;height:6px;border-radius:50%;background:#a78bfa;animation:${NS}-b .9s infinite}
.${NS}-dots span:nth-child(2){animation-delay:.15s}
.${NS}-dots span:nth-child(3){animation-delay:.3s}
@keyframes ${NS}-b{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
.${NS}-form{padding:12px 16px;border-top:1px solid #ede9fe;background:#fafafe;flex-shrink:0}
.${NS}-form .ft{font-size:11px;font-weight:700;color:#5b21b6;margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em}
.${NS}-form .fdesc{font-size:12.5px;color:#6d28d9;line-height:1.5;margin-bottom:10px}
.${NS}-form input{width:100%;border:1px solid #ddd6fe;border-radius:8px;padding:8px 10px;font-size:13px;color:#1e293b;background:#fff;outline:none;margin-bottom:7px;font-family:inherit}
.${NS}-form input:focus{border-color:#7c3aed}
.${NS}-form textarea{width:100%;border:1px solid #ddd6fe;border-radius:8px;padding:8px 10px;font-size:13px;color:#1e293b;background:#fff;outline:none;margin-bottom:7px;font-family:inherit;resize:none;height:68px;line-height:1.4}
.${NS}-form textarea:focus{border-color:#7c3aed}
.${NS}-form .fr{display:flex;gap:6px}
.${NS}-form .fr input{margin-bottom:0}
.${NS}-fbtn{width:100%;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:600;cursor:pointer;margin-top:6px;transition:opacity .15s}
.${NS}-fbtn.sup{background:#1a1a2e;color:#fff}
.${NS}-fbtn.sup:hover{background:#16213e}
.${NS}-fbtn.wl{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff}
.${NS}-fbtn.wl:hover{opacity:.88}
.${NS}-fbtn:disabled{opacity:.5;cursor:default}
@media(max-width:400px){#${NS}-box{width:calc(100vw - 20px);right:10px;bottom:80px}}`;

  /* ── HTML ── */
  const HTML = `
<button id="${NS}-btn" aria-label="Soporte AIWorkSuite">
  <svg id="${NS}-ico" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  <svg id="${NS}-icx" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
</button>
<div id="${NS}-box" role="dialog" aria-label="Asistente técnico AIWorkSuite">
  <div id="${NS}-hd">
    <div class="av">AI</div>
    <div style="flex:1">
      <div class="nm">Aiden</div>
      <div class="st"><span class="dot"></span><span>Soporte AIWorkSuite</span></div>
    </div>
    <span class="pr">PRO soon</span>
    <button id="${NS}-xbtn" aria-label="Cerrar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
  <div id="${NS}-log"></div>
  <div id="${NS}-chips">
    <button class="${NS}-chip" data-msg="¿Cómo genero una propuesta?">Propuestas</button>
    <button class="${NS}-chip" data-msg="¿Cómo funcionan los Equipos IA?">Equipos IA</button>
    <button class="${NS}-chip" data-msg="¿Qué incluye el plan Pro?">Plan Pro</button>
    <button class="${NS}-chip" data-msg="Tengo un problema técnico">Soporte</button>
  </div>
  <div id="${NS}-sf" class="${NS}-form" style="display:none">
    <div class="ft" id="${NS}-sft">Contactar soporte</div>
    <div class="fr">
      <input type="text"  id="${NS}-sn" placeholder="Nombre"  autocomplete="name"/>
      <input type="email" id="${NS}-se" placeholder="Email"   autocomplete="email"/>
    </div>
    <textarea id="${NS}-sm" placeholder="Describe tu problema con el mayor detalle posible..."></textarea>
    <button class="${NS}-fbtn sup" id="${NS}-ss">Enviar al soporte \u2192</button>
  </div>
  <div id="${NS}-wf" class="${NS}-form" style="display:none">
    <div class="ft">\uD83D\uDE80 Lista de espera \u2014 Plan Pro</div>
    <div class="fdesc">Te avisamos en cuanto el Pro est\u00E9 disponible. Los primeros en apuntarse tendr\u00E1n precio especial de lanzamiento.</div>
    <div class="fr">
      <input type="text"  id="${NS}-wn" placeholder="Tu nombre"  autocomplete="name"/>
      <input type="email" id="${NS}-we" placeholder="Tu email"   autocomplete="email"/>
    </div>
    <button class="${NS}-fbtn wl" id="${NS}-wb">Avisadme cuando se lance \u2192</button>
  </div>
  <div id="${NS}-ft">
    <textarea id="${NS}-inp" rows="1" placeholder="\u00BFEn qu\u00E9 puedo ayudarte?"></textarea>
    <button id="${NS}-snd" disabled aria-label="Enviar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </button>
  </div>
</div>`;

  /* ── ESTADO ── */
  var hist    = loadHistory();
  var isOpen  = false;
  var busy    = false;
  var sfShown = false;
  var wfShown = false;

  function g(x) { return document.getElementById(NS + '-' + x); }

  /* ── INIT ── */
  function init() {
    var style     = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap   = document.createElement('div');
    wrap.id    = NS + '-w';
    wrap.innerHTML = HTML;
    document.body.appendChild(wrap);

    var ejs    = document.createElement('script');
    ejs.src    = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    ejs.onload = function() { emailjs.init(AIWS_CONFIG.emailjsPublicKey); };
    document.head.appendChild(ejs);

    bind();

    if (hist.length > 0) {
      g('chips').style.display = 'none';
      hist.forEach(function(m) {
        if (m.role === 'user') usrMsg(m.content, false);
        else botMsg(m.content, false);
      });
      g('log').scrollTop = g('log').scrollHeight;
    } else {
      var hour  = new Date().getHours();
      var greet = hour < 13 ? 'Buenos d\u00EDas' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
      addTrustedMsg(greet + ' \uD83D\uDC4B Soy <strong>Aiden</strong>, el asistente t\u00E9cnico de AIWorkSuite.<br>\u00BFEn qu\u00E9 puedo ayudarte hoy?', 'bot');
    }
  }

  /* ── BIND ── */
  function bind() {
    g('btn').onclick  = function() { toggle(); };
    g('xbtn').onclick = function() { toggle(false); };

    var inp = g('inp');
    inp.addEventListener('input', function() {
      g('snd').disabled = !inp.value.trim() || busy;
      inp.style.height  = 'auto';
      inp.style.height  = Math.min(inp.scrollHeight, 80) + 'px';
    });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    g('snd').onclick = function() { send(); };
    g('ss').onclick  = submitSupport;
    g('wb').onclick  = submitWaitlist;

    document.querySelectorAll('.' + NS + '-chip').forEach(function(c) {
      c.addEventListener('click', function() { setChips([]); send(c.dataset.msg); });
    });
  }

  function toggle(force) {
    isOpen = force !== undefined ? force : !isOpen;
    g('box').classList.toggle('on', isOpen);
    g('ico').style.display = isOpen ? 'none'  : 'block';
    g('icx').style.display = isOpen ? 'block' : 'none';
  }

  /* ── CHIPS DINÁMICOS ── */
  function setChips(list) {
    var el = g('chips');
    if (!list || list.length === 0) { el.style.display = 'none'; return; }
    el.innerHTML = '';
    list.forEach(function(text) {
      var btn       = document.createElement('button');
      btn.className = NS + '-chip';
      btn.textContent = text;
      btn.addEventListener('click', function() { setChips([]); send(text); });
      el.appendChild(btn);
    });
    el.style.display = 'flex';
  }

  /* ── MENSAJES ── */
  function addTrustedMsg(html, role, scroll) {
    if (scroll === undefined) scroll = true;
    var log = g('log'), d = document.createElement('div');
    d.className = NS + '-m ' + role;
    d.innerHTML = html;
    log.appendChild(d);
    if (scroll) log.scrollTop = log.scrollHeight;
  }

  function botMsg(text, scroll) {
    if (scroll === undefined) scroll = true;
    var safe = escHtml(text)
      .replace(/\n/g, '<br>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    addTrustedMsg(safe, 'bot', scroll);
  }

  function usrMsg(text, scroll) {
    if (scroll === undefined) scroll = true;
    var log = g('log'), d = document.createElement('div');
    d.className = NS + '-m usr';
    d.textContent = text;
    log.appendChild(d);
    if (scroll) log.scrollTop = log.scrollHeight;
  }

  /* ── TYPING ── */
  function typing(show) {
    if (show) {
      var log = g('log'), d = document.createElement('div');
      d.className = NS + '-dots'; d.id = NS + '-td';
      d.innerHTML = '<span></span><span></span><span></span>';
      log.appendChild(d); log.scrollTop = log.scrollHeight;
    } else {
      var el = g('td'); if (el) el.remove();
    }
  }

  /* ── SEND ── */
  async function send(preset) {
    var inp  = g('inp');
    var text = preset || inp.value.trim();
    if (!text || busy) return;

    if (!preset) { inp.value = ''; inp.style.height = 'auto'; }
    g('snd').disabled = true;
    setChips([]);

    usrMsg(text);
    hist.push({ role: 'user', content: text });
    saveHistory(hist);

    busy = true;
    typing(true);

    try {
      var res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:      'llama-3.3-70b-versatile',
          max_tokens: 600,
          messages:   [
            { role: 'system', content: buildPrompt() },
            ...hist.slice(-10)
          ]
        })
      });

      if (res.status === 429) {
        typing(false);
        addTrustedMsg('Has enviado muchos mensajes seguidos. Por favor espera un momento.', 'bot');
        busy = false;
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);

      var data  = await res.json();
      var raw   = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
                  || 'Lo siento, hubo un error. Int\u00E9ntalo de nuevo.';
      typing(false);

      var reply     = raw;
      var chipsData = [];
      var chipsRx   = /\[CHIPS:([^\]]+)\]\s*$/;
      var chipsHit  = reply.match(chipsRx);
      if (chipsHit) {
        chipsData = chipsHit[1].split('|').map(function(s) { return s.trim(); }).filter(Boolean).slice(0, 3);
        reply     = reply.replace(chipsRx, '').trim();
      }

      if (reply.indexOf('[SHOW_SUPPORT_FORM]') !== -1) {
        var clean = reply.replace('[SHOW_SUPPORT_FORM]', '').trim();
        if (clean) botMsg(clean);
        showSupForm();
        hist.push({ role: 'assistant', content: clean || reply });
      } else if (reply.indexOf('[SHOW_WAITLIST_FORM]') !== -1) {
        var clean2 = reply.replace('[SHOW_WAITLIST_FORM]', '').trim();
        if (clean2) botMsg(clean2);
        showWaitForm();
        hist.push({ role: 'assistant', content: clean2 || reply });
      } else {
        botMsg(reply);
        hist.push({ role: 'assistant', content: reply });
        if (chipsData.length) setChips(chipsData);
      }

      saveHistory(hist);

    } catch(err) {
      typing(false);
      addTrustedMsg('Error de conexi\u00F3n. Por favor int\u00E9ntalo de nuevo.', 'bot');
      console.error('[Aiden]', err);
    }

    busy = false;
  }

  /* ── FORMULARIO SOPORTE ── */
  function showSupForm() {
    if (sfShown) return;
    sfShown = true;
    var form = g('sf');
    form.style.display = 'block';
    if (window.CURRENT_USER && window.CURRENT_USER.email) g('se').value = window.CURRENT_USER.email;
    var lastUser = null;
    for (var i = hist.length - 1; i >= 0; i--) { if (hist[i].role === 'user') { lastUser = hist[i]; break; } }
    if (lastUser && /\b(problem|error|issue|help|not working|cant|cannot)\b/i.test(lastUser.content)
        && !/[áéíóúñ]/i.test(lastUser.content)) {
      g('sft').textContent = 'Contact support';
      g('sn').placeholder  = 'Name'; g('se').placeholder = 'Email';
      g('sm').placeholder  = 'Describe your issue in detail\u2026';
      g('ss').textContent  = 'Send to support \u2192';
    }
    g('log').scrollTop = 99999;
  }

  async function submitSupport() {
    var name    = g('sn').value.trim();
    var email   = g('se').value.trim();
    var message = g('sm').value.trim();
    if (!name || !email) { alert('Por favor completa nombre y email.'); return; }
    var btn = g('ss');
    btn.disabled = true; btn.textContent = 'Enviando\u2026';
    try {
      await emailjs.send(AIWS_CONFIG.emailjsServiceId, AIWS_CONFIG.emailjsTemplateId,
        { name: name, email: email, message: message || '(sin descripci\u00F3n)',
          time: new Date().toLocaleString('es-ES'), site: 'AIWorkSuite \u2014 Soporte t\u00E9cnico' });
      g('sf').style.display = 'none'; sfShown = false;
      addTrustedMsg('\u2705 Ticket enviado, <strong>' + escHtml(name) + '</strong>. Te escribiremos a <strong>' + escHtml(email) + '</strong> lo antes posible.', 'bot');
    } catch(_) {
      btn.disabled = false; btn.textContent = 'Enviar al soporte \u2192';
      addTrustedMsg('No se pudo enviar. Esc\u00EDbenos a <a href="mailto:molvicstudios@outlook.com">molvicstudios@outlook.com</a>', 'bot');
    }
  }

  /* ── FORMULARIO LISTA DE ESPERA PRO ── */
  function showWaitForm() {
    if (wfShown) return;
    wfShown = true;
    var form = g('wf');
    form.style.display = 'block';
    if (window.CURRENT_USER && window.CURRENT_USER.email) {
      g('we').value = window.CURRENT_USER.email;
      var raw  = window.CURRENT_USER.email.split('@')[0];
      var name = raw.replace(/[._\-+]/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }).trim();
      g('wn').value = name;
    }
    g('log').scrollTop = 99999;
  }

  async function submitWaitlist() {
    var name  = g('wn').value.trim();
    var email = g('we').value.trim();
    if (!email) { alert('Por favor introduce tu email.'); return; }
    var btn = g('wb');
    btn.disabled = true; btn.textContent = 'Guardando\u2026';

    // Waitlist stored locally only (Supabase removed)
    try {
      var stored = JSON.parse(localStorage.getItem('aiws_waitlist') || '[]');
      if (!stored.some(function(i) { return i.email === email; })) {
        stored.push({ email: email, name: name || null, date: new Date().toISOString() });
        localStorage.setItem('aiws_waitlist', JSON.stringify(stored));
      }
    } catch(_) {}

    emailjs.send(AIWS_CONFIG.emailjsServiceId, AIWS_CONFIG.emailjsTemplateId,
      { name: name || email, email: email,
        message: 'Se ha apuntado a la lista de espera del Plan Pro desde el asistente.',
        time: new Date().toLocaleString('es-ES'), site: 'AIWorkSuite \u2014 Lista de espera Pro' }
    ).catch(function() {});

    g('wf').style.display = 'none'; wfShown = false;
    addTrustedMsg(
      '\uD83C\uDF89 \u00A1Perfecto' + (name ? ', <strong>' + escHtml(name) + '</strong>' : '') +
      '! Te avisaremos en <strong>' + escHtml(email) + '</strong> en cuanto el plan Pro se lance. Los primeros tendr\u00E1n precio especial \uD83D\uDE80',
      'bot'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.aiwsToggle = function(force) { toggle(force); };
})();
