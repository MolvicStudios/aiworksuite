/*!
 * molvic-assistant.js — Asistente IA MolvicStudios
 * Groq llama-3.3-70b-versatile + EmailJS leads
 * Deploy: molvicstudios.pro / aiworksuite.pro
 * ─────────────────────────────────────────────
 * CONFIGURACIÓN — edita solo este bloque:
 */
const MOLVIC_CONFIG = {
  emailjsPublicKey:'kvi-LqAhTnXY8j4Oj',
  emailjsServiceId:'service_47c8fie',
  emailjsTemplateId:'template_9h8t9sa',
  leadEmail:       'molvicstudios@outlook.com',
  siteName:        document.title || 'MolvicStudios',
};
/* ─────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ── SYSTEM PROMPT ── */
  const SYSTEM_PROMPT = `Eres el asistente oficial de MolvicStudios, una marca digital especializada en servicios de IA, automatización y desarrollo web para profesionales y el mercado LATAM/España. Tu nombre es Molvic.

ECOSISTEMA MOLVICSTUDIOS:
- Web principal: molvicstudios.pro — servicios de IA, automatización, ingeniería de prompts, forense IA, desarrollo web
- AIWorkSuite (aiworksuite.pro) — suite SaaS de herramientas IA para freelancers: generador de propuestas, CV, contratos, y más
- artefactos.pro — 50 experiencias interactivas con IA (llama-3.3-70b)
- propuestas.pro — generador de propuestas comerciales con IA
- cvgenio.pro — generador de CVs profesionales con IA
- contratosexpress.pro — contratos freelance con IA
- promptgenius.pro — herramienta de ingeniería de prompts
- tueditor.online — editor editorial con IA (para escritores y autores)
- myia.pro — portal de recursos IA

SERVICIOS PRINCIPALES (molvicstudios.pro):
1. Automatización de procesos — flujos, bots, integraciones (desde 150€)
2. Ingeniería de Prompts — diseño de prompts profesionales, mega-prompts para desarrollo (desde 80€)
3. Forense IA / Criptolectura — análisis y auditoría de sistemas IA (consultar precio)
4. Desarrollo Web con IA — sites, landing pages, apps vanilla JS + Cloudflare Pages (desde 200€)
5. Consultoría IA — estrategia, implementación, formación (desde 100€/h)

STACK TECNOLÓGICO: HTML5 vanilla + CSS + JS ES Modules, Groq API (llama-3.3-70b-versatile), Cloudflare Pages, Supabase (auth), Google AdSense.

CONTACTO: molvicstudios@outlook.com | WhatsApp: +34600055882 | Telegram: @molvicstudios

REGLAS DE COMPORTAMIENTO:
- Responde SIEMPRE en el idioma del usuario (español o inglés, detecta automáticamente)
- Sé conciso, profesional y cercano
- Si el usuario quiere presupuesto o contactar, activa el formulario de lead diciendo exactamente: [SHOW_LEAD_FORM]
- Si mencionan un producto específico, enlaza a su URL
- No inventes precios — da rangos orientativos o di "consultar presupuesto"
- Máximo 3 párrafos por respuesta`;

  /* ── ESTILOS ── */
  const CSS = `
#molvic-widget *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',system-ui,sans-serif}
#molvic-toggle{position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:#0f172a;border:none;cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;transition:transform .2s,background .2s}
#molvic-toggle:hover{background:#1e293b;transform:scale(1.07)}
#molvic-toggle svg{width:24px;height:24px}
#molvic-bubble{position:fixed;bottom:88px;right:24px;width:360px;max-height:580px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;z-index:9998;display:flex;flex-direction:column;overflow:hidden;transition:opacity .2s,transform .2s;opacity:0;transform:translateY(12px) scale(.97);pointer-events:none}
#molvic-bubble.open{opacity:1;transform:none;pointer-events:all}
#molvic-header{background:#0f172a;padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
#molvic-header .avatar{width:34px;height:34px;border-radius:50%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#93c5fd;flex-shrink:0}
#molvic-header .info{flex:1}
#molvic-header .name{color:#f1f5f9;font-size:14px;font-weight:600}
#molvic-header .status{color:#94a3b8;font-size:11px;display:flex;align-items:center;gap:4px}
#molvic-header .dot{width:6px;height:6px;border-radius:50%;background:#22c55e}
#molvic-close{background:none;border:none;cursor:pointer;color:#94a3b8;padding:4px;border-radius:6px;display:flex}
#molvic-close:hover{color:#f1f5f9;background:rgba(255,255,255,.1)}
#molvic-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:0}
#molvic-msgs::-webkit-scrollbar{width:4px}
#molvic-msgs::-webkit-scrollbar-track{background:transparent}
#molvic-msgs::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
.molvic-msg{max-width:85%;padding:9px 13px;border-radius:12px;font-size:13.5px;line-height:1.55;word-break:break-word}
.molvic-msg.bot{background:#f1f5f9;color:#1e293b;align-self:flex-start;border-bottom-left-radius:4px}
.molvic-msg.user{background:#0f172a;color:#f1f5f9;align-self:flex-end;border-bottom-right-radius:4px}
.molvic-msg a{color:#3b82f6;text-decoration:underline}
.molvic-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px}
.molvic-chip{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:5px 12px;font-size:12px;color:#475569;cursor:pointer;transition:background .15s,color .15s}
.molvic-chip:hover{background:#0f172a;color:#f1f5f9;border-color:#0f172a}
#molvic-footer{padding:12px;border-top:1px solid #f1f5f9;display:flex;gap:8px;flex-shrink:0}
#molvic-input{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;font-size:13.5px;outline:none;resize:none;max-height:80px;line-height:1.4;color:#1e293b;background:#fff}
#molvic-input:focus{border-color:#94a3b8}
#molvic-send{background:#0f172a;border:none;border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}
#molvic-send:hover{background:#1e293b}
#molvic-send:disabled{background:#cbd5e1;cursor:default}
.molvic-typing{display:flex;align-items:center;gap:4px;padding:9px 13px;background:#f1f5f9;border-radius:12px;border-bottom-left-radius:4px;align-self:flex-start}
.molvic-typing span{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:molvic-bounce .9s infinite}
.molvic-typing span:nth-child(2){animation-delay:.15s}
.molvic-typing span:nth-child(3){animation-delay:.3s}
@keyframes molvic-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
#molvic-lead-form{padding:12px 16px;border-top:1px solid #f1f5f9;background:#fafafa;flex-shrink:0}
#molvic-lead-form .lead-title{font-size:12px;font-weight:600;color:#475569;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em}
#molvic-lead-form input,#molvic-lead-form textarea{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;color:#1e293b;background:#fff;outline:none;margin-bottom:7px;font-family:inherit}
#molvic-lead-form input:focus,#molvic-lead-form textarea:focus{border-color:#94a3b8}
#molvic-lead-form textarea{resize:none;height:58px;line-height:1.4}
#molvic-lead-form .lead-row{display:flex;gap:6px}
#molvic-lead-form .lead-row input{margin-bottom:0}
#molvic-lead-submit{width:100%;background:#0f172a;color:#fff;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:600;cursor:pointer;margin-top:4px;transition:background .15s}
#molvic-lead-submit:hover{background:#1e293b}
#molvic-lead-submit:disabled{background:#94a3b8;cursor:default}
@media(max-width:400px){#molvic-bubble{width:calc(100vw - 20px);right:10px;bottom:80px}}
`;

  /* ── HTML ── */
  const HTML = `
<button id="molvic-toggle" aria-label="Abrir asistente">
  <svg id="molvic-icon-open" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
  <svg id="molvic-icon-close" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
</button>

<div id="molvic-bubble" role="dialog" aria-label="Asistente MolvicStudios">
  <div id="molvic-header">
    <div class="avatar">MS</div>
    <div class="info">
      <div class="name">Molvic Assistant</div>
      <div class="status"><span class="dot"></span><span id="molvic-status-text">En línea</span></div>
    </div>
    <button id="molvic-close" aria-label="Cerrar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>

  <div id="molvic-msgs"></div>

  <div id="molvic-chips">
    <button class="molvic-chip" data-msg="¿Qué servicios ofreces?">Servicios</button>
    <button class="molvic-chip" data-msg="Cuéntame sobre AIWorkSuite">AIWorkSuite</button>
    <button class="molvic-chip" data-msg="Quiero un presupuesto">Presupuesto</button>
    <button class="molvic-chip" data-msg="What services do you offer?">English</button>
  </div>

  <div id="molvic-lead-form" style="display:none">
    <div class="lead-title" id="molvic-lead-title">Déjanos tus datos</div>
    <div class="lead-row">
      <input type="text" id="molvic-lead-name" placeholder="Nombre" autocomplete="name"/>
      <input type="email" id="molvic-lead-email" placeholder="Email" autocomplete="email"/>
    </div>
    <textarea id="molvic-lead-msg" placeholder="¿En qué podemos ayudarte?"></textarea>
    <button id="molvic-lead-submit">Enviar →</button>
  </div>

  <div id="molvic-footer">
    <textarea id="molvic-input" rows="1" placeholder="Escribe un mensaje..." aria-label="Mensaje"></textarea>
    <button id="molvic-send" disabled aria-label="Enviar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </button>
  </div>
</div>`;

  /* ── INIT ── */
  function init() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'molvic-widget';
    wrap.innerHTML = HTML;
    document.body.appendChild(wrap);

    // EmailJS
    const ejsScript = document.createElement('script');
    ejsScript.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    ejsScript.onload = () => emailjs.init(MOLVIC_CONFIG.emailjsPublicKey);
    document.head.appendChild(ejsScript);

    bindEvents();
    showWelcome();
  }

  /* ── STATE ── */
  let history = [];
  let isOpen = false;
  let isThinking = false;
  let leadFormVisible = false;

  /* ── EVENTOS ── */
  function bindEvents() {
    const toggle  = document.getElementById('molvic-toggle');
    const bubble  = document.getElementById('molvic-bubble');
    const closeBtn= document.getElementById('molvic-close');
    const input   = document.getElementById('molvic-input');
    const send    = document.getElementById('molvic-send');
    const chips   = document.querySelectorAll('.molvic-chip');
    const leadSubmit = document.getElementById('molvic-lead-submit');

    toggle.addEventListener('click', () => toggleChat());
    closeBtn.addEventListener('click', () => toggleChat(false));

    input.addEventListener('input', () => {
      send.disabled = !input.value.trim() || isThinking;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    send.addEventListener('click', sendMessage);

    chips.forEach(c => c.addEventListener('click', () => {
      hideChips();
      sendMessage(c.dataset.msg);
    }));

    leadSubmit.addEventListener('click', submitLead);
  }

  function toggleChat(force) {
    isOpen = (force !== undefined) ? force : !isOpen;
    document.getElementById('molvic-bubble').classList.toggle('open', isOpen);
    document.getElementById('molvic-icon-open').style.display  = isOpen ? 'none' : 'block';
    document.getElementById('molvic-icon-close').style.display = isOpen ? 'block' : 'none';
  }

  function hideChips() {
    document.getElementById('molvic-chips').style.display = 'none';
  }

  /* ── MENSAJES ── */
  function addMsg(text, role) {
    const msgs = document.getElementById('molvic-msgs');
    const div = document.createElement('div');
    div.className = 'molvic-msg ' + role;
    div.innerHTML = text.replace(/\n/g, '<br>').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function showTyping() {
    const msgs = document.getElementById('molvic-msgs');
    const div = document.createElement('div');
    div.className = 'molvic-typing';
    div.id = 'molvic-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('molvic-typing');
    if (el) el.remove();
  }

  function showWelcome() {
    const hour = new Date().getHours();
    const greet = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    addMsg(`${greet} 👋 Soy <strong>Molvic</strong>, el asistente de MolvicStudios.<br>¿En qué puedo ayudarte hoy?`, 'bot');
  }

  /* ── GROQ ── */
  async function sendMessage(presetText) {
    const input = document.getElementById('molvic-input');
    const text = presetText || input.value.trim();
    if (!text || isThinking) return;

    if (!presetText) { input.value = ''; input.style.height = 'auto'; }
    document.getElementById('molvic-send').disabled = true;
    hideChips();

    addMsg(text, 'user');
    history.push({ role: 'user', content: text });

    isThinking = true;
    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 500,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history.slice(-10)
          ]
        })
      });

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || 'Lo siento, hubo un error. Inténtalo de nuevo.';

      removeTyping();

      if (reply.includes('[SHOW_LEAD_FORM]')) {
        const clean = reply.replace('[SHOW_LEAD_FORM]', '').trim();
        if (clean) addMsg(clean, 'bot');
        showLeadForm();
        history.push({ role: 'assistant', content: clean || reply });
      } else {
        addMsg(reply, 'bot');
        history.push({ role: 'assistant', content: reply });
      }

    } catch (err) {
      removeTyping();
      addMsg('Error de conexión. Por favor, inténtalo de nuevo.', 'bot');
      console.error('[MolvicAssistant]', err);
    }

    isThinking = false;
  }

  /* ── LEAD FORM ── */
  function showLeadForm() {
    if (leadFormVisible) return;
    leadFormVisible = true;
    const form = document.getElementById('molvic-lead-form');
    form.style.display = 'block';
    // Detectar idioma del último mensaje
    const lastUser = [...history].reverse().find(m => m.role === 'user');
    const isEn = lastUser && /[a-z]/i.test(lastUser.content) && !/[áéíóúñ]/i.test(lastUser.content);
    if (isEn) {
      document.getElementById('molvic-lead-title').textContent = 'Leave your details';
      document.getElementById('molvic-lead-name').placeholder = 'Name';
      document.getElementById('molvic-lead-msg').placeholder = 'How can we help you?';
      document.getElementById('molvic-lead-submit').textContent = 'Send →';
    }
    document.getElementById('molvic-msgs').scrollTop = 9999;
  }

  async function submitLead() {
    const name  = document.getElementById('molvic-lead-name').value.trim();
    const email = document.getElementById('molvic-lead-email').value.trim();
    const msg   = document.getElementById('molvic-lead-msg').value.trim();

    if (!name || !email) {
      alert('Por favor completa nombre y email.');
      return;
    }

    const btn = document.getElementById('molvic-lead-submit');
    btn.disabled = true;
    btn.textContent = '...';

    try {
      await emailjs.send(
        MOLVIC_CONFIG.emailjsServiceId,
        MOLVIC_CONFIG.emailjsTemplateId,
        {
          name,
          email,
          message: msg || '(sin mensaje)',
          time: new Date().toLocaleString('es-ES'),
          site: MOLVIC_CONFIG.siteName,
        }
      );

      document.getElementById('molvic-lead-form').style.display = 'none';
      addMsg('✅ ¡Gracias! Hemos recibido tus datos. Te contactaremos pronto en <strong>' + email + '</strong>', 'bot');
      leadFormVisible = false;

    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Enviar →';
      addMsg('No se pudo enviar. Por favor contáctanos directamente en molvicstudios@outlook.com', 'bot');
      console.error('[MolvicAssistant EmailJS]', err);
    }
  }

  /* ── ARRANQUE ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
