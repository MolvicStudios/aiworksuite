// MolvicStudios Analytics Snippet v2.0
// Auto-generado — no editar manualmente
// SITE se reemplaza automáticamente al integrar en cada web

;(function () {
  var SITE     = 'aiworksuite.pro'
  var ENDPOINT = 'https://molvicstudios-analytics.josemmolera.workers.dev/track'
  var USER_KEY = 'ms_uid'

  // No trackear en desarrollo ni en bots
  if (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.endsWith('.pages.dev') ||
    /bot|crawl|spider|slurp|bingbot|googlebot/i.test(navigator.userAgent)
  ) return

  // Detectar usuario nuevo vs recurrente
  var isNewUser = !localStorage.getItem(USER_KEY)
  if (isNewUser) localStorage.setItem(USER_KEY, '1')

  // Sesión — tracking de actividad
  var sessionStart = Date.now()
  var lastActivity = Date.now()
  document.addEventListener('mousemove',  function(){ lastActivity = Date.now() }, { passive: true })
  document.addEventListener('keydown',    function(){ lastActivity = Date.now() }, { passive: true })
  document.addEventListener('touchstart', function(){ lastActivity = Date.now() }, { passive: true })

  function send(eventName, extra) {
    var payload = {
      site:        SITE,
      page:        location.pathname,
      event:       eventName || 'pageview',
      referrer:    document.referrer,
      is_new_user: isNewUser
    }
    if (extra) Object.assign(payload, extra)
    fetch(ENDPOINT, {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(payload),
      keepalive: true
    }).catch(function(){})
  }

  // Pageview al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ send('pageview') })
  } else {
    send('pageview')
  }

  // Tiempo en página al salir
  window.addEventListener('beforeunload', function () {
    var duration = Math.round((Date.now() - sessionStart) / 1000)
    var activeTime = Math.min(duration, Math.round((lastActivity - sessionStart) / 1000))
    if (activeTime > 2) {
      send('session_end', { duration: activeTime })
    }
  })

  // Función global para eventos personalizados
  // Uso: window.molvicTrack('doc_generated')
  window.molvicTrack = function(eventName) {
    send(eventName)
  }

})()
