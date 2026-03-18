/*!
 * aiws-assistant.js — Soporte técnico AIWorkSuite
 * Groq llama-3.3-70b-versatile + EmailJS soporte
 * Deploy: aiworksuite.pro
 */
const AIWS_CONFIG = {
  emailjsPublicKey: 'kvi-LqAhTnXY8j4Oj',
  emailjsServiceId: 'service_47c8fie',
  emailjsTemplateId:'template_9h8t9sa',
  siteName:         'AIWorkSuite',
};

(function () {
  'use strict';
  const NS = 'aiws';

  const SYSTEM_PROMPT = `Eres Aiden, el asistente de soporte técnico oficial de AIWorkSuite (aiworksuite.pro), una suite SaaS de herramientas de inteligencia artificial para freelancers y profesionales independientes. Tu misión es resolver dudas técnicas, guiar al usuario en el uso de la plataforma, y cuando sea natural, destacar las ventajas del plan Pro.

PLAN FREE (activo):
- Generador de Propuestas IA — crea propuestas comerciales profesionales en segundos
- Generador de CV IA — CVs optimizados para cada oferta o cliente
- Generador de Contratos IA — contratos freelance personalizados
- Acceso a plantillas base
- Límite de generaciones por día (plan gratuito)
- Requiere cuenta gratuita con email

PLAN PRO (próximamente — lista de espera abierta):
- Generaciones ilimitadas en todos los módulos
- Módulos adicionales: gestor de clientes, facturación, seguimiento de proyectos, panel de métricas
- Exportación en múltiples formatos (PDF, DOCX, HTML)
- Personalización de marca (logo, colores, cabeceras propias)
- Soporte prioritario
- Acceso anticipado a nuevas herramientas
- Precio competitivo pensado para freelancers — unirse a la lista de espera en aiworksuite.pro

PROBLEMAS TÉCNICOS COMUNES Y SOLUCIONES:
- "No genera nada" → verificar que la clave Groq está configurada en ajustes, o que hay conexión a internet
- "El texto sale en inglés" → el idioma sigue el idioma del formulario; rellenar en español produce resultado en español
- "No puedo iniciar sesión" → limpiar caché del navegador, verificar que el email está confirmado (revisar spam)
- "Error al exportar" → función disponible en plan Pro; en Free copiar el texto manualmente
- "Las plantillas no cargan" → recargar la página, si persiste contactar soporte
- "¿Puedo usar AIWorkSuite en móvil?" → sí, es responsive y funciona en cualquier navegador móvil moderno
- "¿Mis datos están seguros?" → sí, autenticación con Supabase, datos cifrados, no se comparten con terceros

REGLAS DE COMPORTAMIENTO:
- Responde SIEMPRE en el idioma del usuario (español o inglés automático)
- Tono amigable, técnico y resolutivo — ve directo a la solución
- Máximo 3 párrafos por respuesta
- Cuando el usuario mencione una limitación del plan Free, explica brevemente la solución Free Y menciona que el plan Pro lo resuelve de forma completa, sin ser insistente
- Cuando el usuario pregunte por funciones avanzadas no disponibles en Free, describe el valor del Pro con entusiasmo pero sin presionar
- Si el problema no tiene solución conocida o requiere intervención humana, emite exactamente: [SHOW_SUPPORT_FORM]
- No inventes funcionalidades que no existen`;

  const CSS = `
#${NS}-w *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',system-ui,sans-serif}
#${NS}-btn{position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:#1a1a2e;border:none;cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;transition:transform .2s,background .2s}
#${NS}-btn:hover{background:#16213e;transform:scale(1.07)}
#${NS}-btn svg{width:24px;height:24px}
#${NS}-box{position:fixed;bottom:88px;right:24px;width:360px;max-height:600px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;z-index:9998;display:flex;flex-direction:column;overflow:hidden;transition:opacity .2s,transform .2s;opacity:0;transform:translateY(12px) scale(.97);pointer-events:none}
#${NS}-box.on{opacity:1;transform:none;pointer-events:all}
#${NS}-hd{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
#${NS}-hd .av{width:34px;height:34px;border-radius:50%;background:#0f3460;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#a78bfa;flex-shrink:0;border:1px solid #6d28d9}
#${NS}-hd .nm{color:#f1f5f9;font-size:14px;font-weight:600}
#${NS}-hd .st{color:#94a3b8;font-size:11px;display:flex;align-items:center;gap:4px}
#${NS}-hd .dot{width:6px;height:6px;border-radius:50%;background:#22c55e}
#${NS}-hd .pro-badge{margin-left:auto;background:#7c3aed;color:#ede9fe;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;letter-spacing:.03em}
#${NS}-xbtn{background:none;border:none;cursor:pointer;color:#94a3b8;padding:4px;border-radius:6px;display:flex;margin-left:6px}
#${NS}-xbtn:hover{color:#f1f5f9;background:rgba(255,255,255,.1)}
#${NS}-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:0}
#${NS}-log::-webkit-scrollbar{width:4px}
#${NS}-log::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
.${NS}-m{max-width:85%;padding:9px 13px;border-radius:12px;font-size:13.5px;line-height:1.55;word-break:break-word}
.${NS}-m.bot{background:#f5f3ff;color:#1e1b4b;align-self:flex-start;border-bottom-left-radius:4px;border-left:2px solid #7c3aed}
.${NS}-m.usr{background:#1a1a2e;color:#f1f5f9;align-self:flex-end;border-bottom-right-radius:4px}
.${NS}-m a{color:#7c3aed;text-decoration:underline}
.pro-tip{background:#faf5ff;border:1px solid #ddd6fe;border-radius:10px;padding:8px 12px;font-size:12.5px;color:#5b21b6;align-self:stretch;margin-top:2px}
.pro-tip strong{color:#7c3aed}
#${NS}-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px}
.${NS}-chip{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:20px;padding:5px 12px;font-size:12px;color:#5b21b6;cursor:pointer;transition:background .15s,color .15s}
.${NS}-chip:hover{background:#7c3aed;color:#fff;border-color:#7c3aed}
#${NS}-ft{padding:12px;border-top:1px solid #f1f5f9;display:flex;gap:8px;flex-shrink:0}
#${NS}-inp{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;font-size:13.5px;outline:none;resize:none;max-height:80px;line-height:1.4;color:#1e293b;background:#fff}
#${NS}-inp:focus{border-color:#7c3aed}
#${NS}-snd{background:#7c3aed;border:none;border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}
#${NS}-snd:hover{background:#6d28d9}
#${NS}-snd:disabled{background:#cbd5e1;cursor:default}
.${NS}-dots{display:flex;align-items:center;gap:4px;padding:9px 13px;background:#f5f3ff;border-radius:12px;border-bottom-left-radius:4px;align-self:flex-start}
.${NS}-dots span{width:6px;height:6px;border-radius:50%;background:#a78bfa;animation:${NS}-b .9s infinite}
.${NS}-dots span:nth-child(2){animation-delay:.15s}
.${NS}-dots span:nth-child(3){animation-delay:.3s}
@keyframes ${NS}-b{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
#${NS}-sf{padding:12px 16px;border-top:1px solid #ede9fe;background:#fafafa;flex-shrink:0}
#${NS}-sf .lt{font-size:12px;font-weight:600;color:#5b21b6;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em}
#${NS}-sf input,#${NS}-sf textarea{width:100%;border:1px solid #ddd6fe;border-radius:8px;padding:8px 10px;font-size:13px;color:#1e293b;background:#fff;outline:none;margin-bottom:7px;font-family:inherit}
#${NS}-sf input:focus,#${NS}-sf textarea:focus{border-color:#7c3aed}
#${NS}-sf textarea{resize:none;height:70px;line-height:1.4}
#${NS}-sf .lr{display:flex;gap:6px}
#${NS}-sf .lr input{margin-bottom:0}
#${NS}-ss{width:100%;background:#7c3aed;color:#fff;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:600;cursor:pointer;margin-top:4px;transition:background .15s}
#${NS}-ss:hover{background:#6d28d9}
#${NS}-ss:disabled{background:#a78bfa;cursor:default}
@media(max-width:400px){#${NS}-box{width:calc(100vw - 20px);right:10px;bottom:80px}}`;

  const HTML = `
<button id="${NS}-btn" aria-label="Soporte AIWorkSuite">
  <svg id="${NS}-ico" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  <svg id="${NS}-icx" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
</button>
<div id="${NS}-box" role="dialog">
  <div id="${NS}-hd">
    <div class="av">AI</div>
    <div style="flex:1"><div class="nm">Aiden — AIWorkSuite</div><div class="st"><span class="dot"></span><span>Soporte en línea</span></div></div>
    <span class="pro-badge">PRO soon</span>
    <button id="${NS}-xbtn" aria-label="Cerrar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div id="${NS}-log"></div>
  <div id="${NS}-chips">
    <button class="${NS}-chip" data-msg="¿Cómo funciona el generador de propuestas?">Propuestas</button>
    <button class="${NS}-chip" data-msg="¿Cómo genero mi CV?">CV</button>
    <button class="${NS}-chip" data-msg="¿Qué incluye el plan Pro?">Plan Pro</button>
    <button class="${NS}-chip" data-msg="I have a technical problem">Help</button>
  </div>
  <div id="${NS}-sf" style="display:none">
    <div class="lt" id="${NS}-lt">Contactar soporte</div>
    <div class="lr">
      <input type="text" id="${NS}-ln" placeholder="Nombre" autocomplete="name"/>
      <input type="email" id="${NS}-le" placeholder="Email" autocomplete="email"/>
    </div>
    <textarea id="${NS}-lm" placeholder="Describe tu problema con el mayor detalle posible..."></textarea>
    <button id="${NS}-ss">Enviar al soporte →</button>
  </div>
  <div id="${NS}-ft">
    <textarea id="${NS}-inp" rows="1" placeholder="¿En qué puedo ayudarte?"></textarea>
    <button id="${NS}-snd" disabled><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
  </div>
</div>`;

  let hist = [], open = false, busy = false, sfShown = false;
  const g = x => document.getElementById(`${NS}-${x}`);

  function init() {
    const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    const w = document.createElement('div'); w.id = `${NS}-w`; w.innerHTML = HTML; document.body.appendChild(w);
    const ejs = document.createElement('script');
    ejs.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    ejs.onload = () => emailjs.init(AIWS_CONFIG.emailjsPublicKey);
    document.head.appendChild(ejs);
    bind();
    msg('¡Hola! 👋 Soy <strong>Aiden</strong>, el asistente de soporte de AIWorkSuite.<br>¿Tienes alguna duda técnica o quieres saber más sobre el plan Pro?', 'bot');
  }

  function bind() {
    g('btn').onclick = () => toggle();
    g('xbtn').onclick = () => toggle(false);
    g('inp').addEventListener('input', () => {
      g('snd').disabled = !g('inp').value.trim() || busy;
      g('inp').style.height = 'auto';
      g('inp').style.height = Math.min(g('inp').scrollHeight, 80) + 'px';
    });
    g('inp').addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} });
    g('snd').onclick = () => send();
    g('ss').onclick = submitSupport;
    document.querySelectorAll(`.${NS}-chip`).forEach(c => c.onclick = () => { chips(false); send(c.dataset.msg); });
  }

  function toggle(f) {
    open = f!==undefined ? f : !open;
    g('box').classList.toggle('on', open);
    g('ico').style.display = open ? 'none' : 'block';
    g('icx').style.display = open ? 'block' : 'none';
  }

  function chips(show) { g('chips').style.display = show===false ? 'none' : 'flex'; }

  function msg(text, role) {
    const log = g('log'), d = document.createElement('div');
    d.className = `${NS}-m ${role}`;
    d.innerHTML = text.replace(/\n/g,'<br>').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2" target="_blank">$1</a>');
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }

  function typing(show) {
    if (show) {
      const log=g('log'), d=document.createElement('div');
      d.className=`${NS}-dots`; d.id=`${NS}-td`;
      d.innerHTML='<span></span><span></span><span></span>';
      log.appendChild(d); log.scrollTop=log.scrollHeight;
    } else { const el=g('td'); if(el) el.remove(); }
  }

  async function send(preset) {
    const inp=g('inp'), text=preset||inp.value.trim();
    if (!text||busy) return;
    if (!preset){inp.value='';inp.style.height='auto';}
    g('snd').disabled=true; chips(false);
    msg(text,'usr'); hist.push({role:'user',content:text});
    busy=true; typing(true);
    try {
      const r = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({model:'llama-3.3-70b-versatile',max_tokens:500,messages:[{role:'system',content:SYSTEM_PROMPT},...hist.slice(-10)]})
      });
      const d = await r.json();
      const reply = d.choices?.[0]?.message?.content || 'Lo siento, hubo un error.';
      typing(false);
      if (reply.includes('[SHOW_SUPPORT_FORM]')) {
        const clean = reply.replace('[SHOW_SUPPORT_FORM]','').trim();
        if (clean) msg(clean,'bot');
        showSF(); hist.push({role:'assistant',content:clean||reply});
      } else { msg(reply,'bot'); hist.push({role:'assistant',content:reply}); }
    } catch(e) { typing(false); msg('Error de conexión. Inténtalo de nuevo.','bot'); }
    busy=false;
  }

  function showSF() {
    if (sfShown) return; sfShown=true;
    g('sf').style.display='block';
    const last=[...hist].reverse().find(m=>m.role==='user');
    if (last && /[a-z]/i.test(last.content) && !/[áéíóúñ]/i.test(last.content)) {
      g('lt').textContent='Contact support';
      g('ln').placeholder='Name'; g('le').placeholder='Email';
      g('lm').placeholder='Describe your issue in detail...';
      g('ss').textContent='Send to support →';
    }
    g('log').scrollTop=9999;
  }

  async function submitSupport() {
    const name=g('ln').value.trim(), email=g('le').value.trim(), message=g('lm').value.trim();
    if (!name||!email){alert('Por favor completa nombre y email.');return;}
    const btn=g('ss'); btn.disabled=true; btn.textContent='...';
    try {
      await emailjs.send(AIWS_CONFIG.emailjsServiceId, AIWS_CONFIG.emailjsTemplateId,
        {name, email, message:message||'(sin descripción)', time:new Date().toLocaleString('es-ES'), site:'AIWorkSuite - Soporte'});
      g('sf').style.display='none';
      msg(`Ticket enviado, ${name}. Revisaremos tu caso y te escribiremos a <strong>${email}</strong> lo antes posible.`,'bot');
      sfShown=false;
    } catch(e) {
      btn.disabled=false; btn.textContent='Enviar al soporte →';
      msg('No se pudo enviar. Escríbenos directamente a molvicstudios@outlook.com','bot');
    }
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
