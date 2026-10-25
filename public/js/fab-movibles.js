/* =====================================================================
   fab-movibles.js  (CIMU)
   Hace arrastrables los botones flotantes del mapa:
     - #btn-start-tour          (GUÍA DE NAVEGACIÓN)
     - #toggle-events-panel-btn (📋 seguimiento de eventos)
   Características:
     - Arrastre con mouse y touch (Pointer Events).
     - Un arrastre NO dispara el click (no se abre la guía al soltar).
     - Se limita al área libre del mapa: nunca queda encima de los paneles
       izquierdo/derecho.
     - Recuerda la posición en localStorage.
     - Posición por defecto: la guía abajo-izquierda del mapa y el 📋
       abajo, justo a la izquierda del panel derecho.
   Para volver a la posición original: CIMU_resetFlotantes() en la consola.
   Cargar DESPUÉS de tour-fix-cimu.js.
   ===================================================================== */
(function () {
  'use strict';

  var MARGIN = 12;       // separación mínima con los bordes del área libre
  var DRAG_THRESHOLD = 5; // px antes de considerar que es un arrastre
  var STORAGE_PREFIX = 'cimu.fab.pos.';

  var FABS = [
    { id: 'btn-start-tour',          key: 'guia',    grip: true,  anchor: 'left',  fallback: { w: 190, h: 44 } },
    { id: 'toggle-events-panel-btn', key: 'eventos', grip: false, anchor: 'right', fallback: { w: 60,  h: 60 } }
  ];

  /* ---------- estilos ---------- */
  var css = [
    '#btn-start-tour, #toggle-events-panel-btn {',
    '  position: fixed !important; margin: 0 !important; transform: none !important;',
    '  touch-action: none; user-select: none; -webkit-user-select: none;',
    '}',
    '#btn-start-tour { cursor: grab; z-index: 1500 !important; }',
    '#toggle-events-panel-btn { cursor: grab; }',
    '.fab-movible.fab-arrastrando { cursor: grabbing !important; opacity: .9; transition: none !important;',
    '  box-shadow: 0 8px 22px rgba(0,0,0,.35) !important; }',
    '.fab-grip { display: inline-block; margin-right: 8px; opacity: .7; letter-spacing: -2px;',
    '  font-weight: 700; line-height: 1; pointer-events: none; }'
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.id = 'fab-movibles-css';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- utilidades ---------- */
  function visible(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    if (getComputedStyle(el).display === 'none') return null;
    return r;
  }

  // Área del mapa que no está tapada por los paneles laterales.
  function areaLibre(w, h) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var minX = 0, maxX = vw;
    var ls = visible(document.getElementById('left-sidebar'));
    var rp = visible(document.getElementById('right-panel'));
    if (ls) minX = Math.max(minX, ls.right);
    if (rp && rp.left < vw) maxX = Math.min(maxX, rp.left);
    // En pantallas chicas, si no entra, usar toda la ventana.
    if (maxX - minX < w + 2 * MARGIN) { minX = 0; maxX = vw; }
    return { minX: minX + MARGIN, maxX: maxX - MARGIN, minY: MARGIN, maxY: vh - MARGIN };
  }

  function medidas(el, fb) {
    return { w: el.offsetWidth || fb.w, h: el.offsetHeight || fb.h };
  }

  function limitar(el, cfg, x, y) {
    var m = medidas(el, cfg.fallback);
    var a = areaLibre(m.w, m.h);
    return {
      x: Math.min(Math.max(x, a.minX), Math.max(a.minX, a.maxX - m.w)),
      y: Math.min(Math.max(y, a.minY), Math.max(a.minY, a.maxY - m.h))
    };
  }

  function colocar(el, x, y) {
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('left', Math.round(x) + 'px', 'important');
    el.style.setProperty('top', Math.round(y) + 'px', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
  }

  function posPorDefecto(el, cfg) {
    var m = medidas(el, cfg.fallback);
    var a = areaLibre(m.w, m.h);
    var y = a.maxY - m.h - 8;
    var x = cfg.anchor === 'right' ? a.maxX - m.w : a.minX;
    return { x: x, y: y };
  }

  function leer(key) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return (typeof p.x === 'number' && typeof p.y === 'number') ? p : null;
    } catch (e) { return null; }
  }
  function guardar(key, x, y) {
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ x: x, y: y })); } catch (e) {}
  }
  function borrar(key) {
    try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (e) {}
  }

  /* ---------- arrastre ---------- */
  var ultimoArrastre = 0;

  // Si el gesto fue un arrastre, se anula el click que el navegador dispara al soltar.
  window.addEventListener('click', function (e) {
    if (Date.now() - ultimoArrastre > 350) return;
    var t = e.target && e.target.closest && e.target.closest('.fab-movible');
    if (t) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  function hacerMovible(el, cfg) {
    if (!el || el.dataset.fabInit === '1') return;
    el.dataset.fabInit = '1';
    el.classList.add('fab-movible');

    if (cfg.grip && !el.querySelector('.fab-grip')) {
      var g = document.createElement('span');
      g.className = 'fab-grip';
      g.setAttribute('aria-hidden', 'true');
      g.textContent = '\u22EE\u22EE';
      el.insertBefore(g, el.firstChild);
    }
    el.title = (el.title ? el.title + ' · ' : '') + 'Arrastrá para mover';

    // posición inicial: guardada o por defecto
    var guardada = leer(cfg.key);
    var ini = guardada || posPorDefecto(el, cfg);
    var lim = limitar(el, cfg, ini.x, ini.y);
    colocar(el, lim.x, lim.y);

    var arrastrando = false, movido = false;
    var sx = 0, sy = 0, ox = 0, oy = 0;

    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var r = el.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY;
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      arrastrando = true; movido = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });

    el.addEventListener('pointermove', function (e) {
      if (!arrastrando) return;
      if (!movido) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < DRAG_THRESHOLD) return;
        movido = true;
        el.classList.add('fab-arrastrando');
      }
      var p = limitar(el, cfg, e.clientX - ox, e.clientY - oy);
      colocar(el, p.x, p.y);
      e.preventDefault();
    });

    function terminar(e) {
      if (!arrastrando) return;
      arrastrando = false;
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      el.classList.remove('fab-arrastrando');
      if (movido) {
        ultimoArrastre = Date.now();
        var r = el.getBoundingClientRect();
        guardar(cfg.key, r.left, r.top);
      }
    }
    el.addEventListener('pointerup', terminar);
    el.addEventListener('pointercancel', terminar);
  }

  /* ---------- init / mantenimiento ---------- */
  function init() {
    FABS.forEach(function (cfg) { hacerMovible(document.getElementById(cfg.id), cfg); });
  }

  // Reencuadrar al cambiar el tamaño de la ventana o abrir/cerrar paneles.
  function reencuadrar() {
    FABS.forEach(function (cfg) {
      var el = document.getElementById(cfg.id);
      if (!el || el.dataset.fabInit !== '1') return;
      var r = el.getBoundingClientRect();
      if (!r.width) return; // oculto: se reencuadra cuando se muestre
      var p = limitar(el, cfg, r.left, r.top);
      colocar(el, p.x, p.y);
    });
  }
  var t;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(reencuadrar, 120); });

  // Si otro script reemplaza el botón, se vuelve a enganchar.
  new MutationObserver(init).observe(document.body, { childList: true });

  window.CIMU_resetFlotantes = function () {
    FABS.forEach(function (cfg) {
      borrar(cfg.key);
      var el = document.getElementById(cfg.id);
      if (!el) return;
      var d = posPorDefecto(el, cfg);
      var p = limitar(el, cfg, d.x, d.y);
      colocar(el, p.x, p.y);
    });
  };

  init();
  window.addEventListener('load', function () { init(); reencuadrar(); });
})();
