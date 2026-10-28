/* Boton "GUIA DE NAVEGACION" (#btn-start-tour) movible.
   - Se arrastra con el mouse o con el dedo; si solo se hace clic, funciona igual que siempre (abre la guia).
   - Recuerda la posicion en este navegador. Clic derecho sobre el boton: vuelve a su lugar de origen.
   - Nunca queda fuera de la pantalla (si se achica la ventana, se acomoda). */
(function () {
  'use strict';
  var ID = 'btn-start-tour';
  var CLAVE = 'cimu_guia_pos_v1';
  var UMBRAL = 6;            // pixeles que hay que mover para que cuente como arrastre y no como clic
  var arr = null;            // arrastre en curso
  var suprimirClic = false;

  function boton() { return document.getElementById(ID); }

  function leer() {
    try {
      var v = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      return (v && isFinite(v.x) && isFinite(v.y)) ? v : null;
    } catch (e) { return null; }
  }
  function guardar(p) {
    try { if (p) localStorage.setItem(CLAVE, JSON.stringify(p)); else localStorage.removeItem(CLAVE); } catch (e) {}
  }

  var PROPS = ['position', 'left', 'top', 'right', 'bottom', 'transform'];
  var originales = null;     // estilos en linea que tenia el boton antes de moverlo

  function poner(btn, x, y) {
    if (!originales) {
      originales = {};
      PROPS.forEach(function (p) { originales[p] = { v: btn.style.getPropertyValue(p), pr: btn.style.getPropertyPriority(p) }; });
    }
    var r = btn.getBoundingClientRect();
    var w = r.width || btn.offsetWidth || 160, h = r.height || btn.offsetHeight || 40;
    x = Math.max(0, Math.min(x, window.innerWidth - w));
    y = Math.max(0, Math.min(y, window.innerHeight - h));
    btn.style.setProperty('position', 'fixed', 'important');
    btn.style.setProperty('left', x + 'px', 'important');
    btn.style.setProperty('top', y + 'px', 'important');
    btn.style.setProperty('right', 'auto', 'important');
    btn.style.setProperty('bottom', 'auto', 'important');
    btn.style.setProperty('transform', 'none', 'important');
    return { x: x, y: y };
  }

  function volverAlOrigen(btn) {
    PROPS.forEach(function (p) {
      var o = originales && originales[p];
      if (o && o.v) btn.style.setProperty(p, o.v, o.pr); else btn.style.removeProperty(p);
    });
    originales = null;
  }

  function restaurar() {
    var btn = boton(), p = leer();
    if (btn && p) poner(btn, p.x, p.y);
  }

  function estilos() {
    if (document.getElementById('guia-movible-estilos')) return;
    var st = document.createElement('style');
    st.id = 'guia-movible-estilos';
    st.textContent = '#' + ID + '{cursor:grab;touch-action:none;}#' + ID + '.guia-arrastrando{cursor:grabbing !important;opacity:.85;}';
    document.head.appendChild(st);
  }

  function iniciar() {
    estilos();
    var btn = boton();
    if (btn && !btn.getAttribute('title')) btn.setAttribute('title', 'Arrastrá para moverlo. Clic derecho para volver a su lugar.');
    restaurar();
  }

  document.addEventListener('pointerdown', function (e) {
    var btn = boton();
    if (!btn || !btn.contains(e.target)) return;
    if (e.button !== undefined && e.button !== 0) return;
    var r = btn.getBoundingClientRect();
    arr = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, mov: false, id: e.pointerId, pos: null };
    try { btn.setPointerCapture(e.pointerId); } catch (x) {}
  });

  document.addEventListener('pointermove', function (e) {
    if (!arr) return;
    var btn = boton(); if (!btn) return;
    if (!arr.mov && Math.abs(e.clientX - arr.x0) + Math.abs(e.clientY - arr.y0) < UMBRAL) return;
    arr.mov = true;
    arr.pos = poner(btn, e.clientX - arr.dx, e.clientY - arr.dy);
    btn.classList.add('guia-arrastrando');
    if (e.cancelable) e.preventDefault();
  });

  function fin() {
    if (!arr) return;
    var a = arr, btn = boton();
    arr = null;
    if (btn) {
      try { btn.releasePointerCapture(a.id); } catch (x) {}
      btn.classList.remove('guia-arrastrando');
    }
    if (a.mov && a.pos) {
      guardar(a.pos);
      suprimirClic = true;                                  // el clic que sigue al arrastre no debe abrir la guia
      setTimeout(function () { suprimirClic = false; }, 60);
    }
  }
  document.addEventListener('pointerup', fin);
  document.addEventListener('pointercancel', fin);

  document.addEventListener('click', function (e) {
    var btn = boton();
    if (suprimirClic && btn && btn.contains(e.target)) {
      suprimirClic = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('contextmenu', function (e) {
    var btn = boton();
    if (btn && btn.contains(e.target) && leer()) {
      e.preventDefault();
      volverAlOrigen(btn);
      guardar(null);
    }
  });

  window.addEventListener('resize', restaurar);
  window.addEventListener('load', restaurar);
  window.CIMUGuiaMovible = { restablecer: function () { var b = boton(); if (b) volverAlOrigen(b); guardar(null); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();