/* =====================================================
   CIMU - Ajuste de posicion de los globos de la Guia de navegacion
   -----------------------------------------------------
   Problema: los pasos que apuntan a elementos del panel izquierdo
   (o derecho) quedaban tapados o fuera de pantalla, porque:
   - el elemento estaba dentro de una seccion plegada (medida 0), y
   - la posicion se calculaba antes de terminar el scroll del panel.
   Solucion (sin tocar script.js): despues de cada paso
   1) abre la seccion plegada que contiene el elemento,
   2) lo trae a la vista dentro del panel,
   3) pone el globo AFUERA del panel (a la derecha del izquierdo,
      a la izquierda del derecho) y lo mantiene dentro de la pantalla.
   Para volver atras: borrar la linea <script ... tour-fix-cimu.js>
   en index.html.
   ===================================================== */
(function () {
  'use strict';

  var GAP = 12;     // separacion entre el globo y el panel
  var MARGIN = 8;   // margen minimo contra el borde de la pantalla

  function byId(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return Math.max(min, Math.min(v, max)); }

  function reposition() {
    var tip = byId('tour-tooltip');
    if (!tip || tip.classList.contains('hidden')) return;

    var target = document.querySelector('.tour-highlight');
    var left = byId('left-sidebar');
    var right = byId('right-panel');
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;

    var inLeft  = !!(target && left  && left.contains(target));
    var inRight = !!(target && right && right.contains(target));
    var x, y;

    if (inLeft || inRight) {
      var panel = inLeft ? left : right;

      // 1) Abrir la seccion plegada que contiene el elemento
      var sec = target.closest('.sb-section');
      if (sec && sec.classList.contains('sb-collapsed')) {
        sec.classList.remove('sb-collapsed');
      }

      // 2) Traerlo a la vista dentro del panel (scroll instantaneo)
      var pr = panel.getBoundingClientRect();
      var r = target.getBoundingClientRect();
      if (r.top < pr.top || r.bottom > pr.bottom) {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
        r = target.getBoundingClientRect();
      }
      pr = panel.getBoundingClientRect();

      // 3) Globo afuera del panel, centrado en vertical con el elemento
      if (r.width === 0 && r.height === 0) {
        x = (vw - w) / 2;
        y = (vh - h) / 2;
      } else {
        x = inLeft ? pr.right + GAP : pr.left - w - GAP;
        y = r.top + r.height / 2 - h / 2;
      }
    } else {
      // Otros destinos: solo asegurar que el globo no se salga de la pantalla
      var cur = tip.getBoundingClientRect();
      x = cur.left;
      y = cur.top;
    }

    x = clamp(x, MARGIN, Math.max(MARGIN, vw - w - MARGIN));
    y = clamp(y, MARGIN, Math.max(MARGIN, vh - h - MARGIN));
    tip.style.left = (x + window.scrollX) + 'px';
    tip.style.top  = (y + window.scrollY) + 'px';
  }

  // Se corrige despues de que script.js arma el paso, y otra vez
  // cuando termina el scroll suave / la transicion del globo.
  function schedule() {
    setTimeout(reposition, 0);
    setTimeout(reposition, 450);
  }

  function init() {
    ['tour-next', 'tour-prev'].forEach(function (id) {
      var el = byId(id);
      if (el) el.addEventListener('click', schedule);
    });
    document.querySelectorAll('.tour-option').forEach(function (opt) {
      opt.addEventListener('click', schedule);
    });
    window.addEventListener('resize', reposition);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
