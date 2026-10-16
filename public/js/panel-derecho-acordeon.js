/* Panel derecho plegable (acordeón) - CIMU
 * No modifica ni mueve ningún id: solo envuelve el contenido que sigue a cada <h3>
 * dentro de un contenedor que se muestra/oculta. Los eventos existentes siguen igual.
 */
(function () {
  'use strict';

  // true  = al abrir una sección se cierra la anterior (el panel nunca se alarga)
  // false = se pueden tener varias abiertas a la vez
  var SOLO_UNA_ABIERTA = true;

  function init() {
    var panel = document.getElementById('right-panel');
    if (!panel || panel.dataset.accInit) return;

    // Busca los <h3> en cualquier nivel del panel (no solo hijos directos)
    var headers = Array.prototype.filter.call(panel.querySelectorAll('h3'), function (el) {
      return !el.closest('.acc-section');
    });
    if (!headers.length) { console.warn('[acordeon] no se encontraron <h3> en #right-panel'); return; }
    panel.dataset.accInit = '1';
    console.log('[acordeon] iniciado con ' + headers.length + ' secciones');
    var sections = [];

    headers.forEach(function (h3) {
      // Todo lo que está entre este h3 y el siguiente h3
      var nodes = [];
      var n = h3.nextSibling;
      while (n && !(n.nodeType === 1 && n.tagName === 'H3')) {
        nodes.push(n);
        n = n.nextSibling;
      }

      var section = document.createElement('div');
      section.className = 'acc-section';
      var body = document.createElement('div');
      body.className = 'acc-body';

      h3.parentNode.insertBefore(section, h3);
      section.appendChild(h3);
      section.appendChild(body);
      nodes.forEach(function (node) { body.appendChild(node); });

      // Encabezado clickeable
      h3.classList.add('acc-header');
      h3.setAttribute('role', 'button');
      h3.setAttribute('tabindex', '0');
      h3.setAttribute('aria-expanded', 'false');
      var text = document.createElement('span');
      text.className = 'acc-title';
      while (h3.firstChild) text.appendChild(h3.firstChild);
      var right = document.createElement('span');
      right.className = 'acc-right';
      right.innerHTML = '<span class="acc-badge"></span><span class="acc-chevron">›</span>';
      h3.appendChild(text);
      h3.appendChild(right);

      function toggle() {
        var abrir = !section.classList.contains('open');
        if (abrir && SOLO_UNA_ABIERTA) {
          sections.forEach(function (s) { if (s !== section) setOpen(s, false); });
        }
        setOpen(section, abrir);
      }
      h3.addEventListener('click', toggle);
      h3.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });

      sections.push(section);
    });

    // El botón PREGUNTAS / AYUDA no pertenece a ninguna sección: va suelto arriba de todo
    var btnAyuda = document.getElementById('btn-open-consultas');
    if (btnAyuda && sections.length && sections[0].contains(btnAyuda)) {
      sections[0].parentNode.insertBefore(btnAyuda, sections[0]);
    }

    function setOpen(section, open) {
      section.classList.toggle('open', open);
      section.firstElementChild.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    // Badge con cantidad de capas activas por sección
    function refreshBadges() {
      sections.forEach(function (s) {
        var n = s.querySelectorAll('.acc-body input[type="checkbox"]:checked').length;
        var badge = s.querySelector('.acc-badge');
        badge.textContent = n;
        s.classList.toggle('has-active', n > 0);
      });
    }
    panel.addEventListener('change', refreshBadges);
    panel.addEventListener('click', function () { setTimeout(refreshBadges, 0); });
    refreshBadges();

    // API por si otro script (ej. el tour guiado) necesita abrir una sección
    window.cimuPanelDerecho = {
      abrir: function (idElemento) {
        var el = document.getElementById(idElemento);
        var s = el && el.closest('.acc-section');
        if (!s) return;
        if (SOLO_UNA_ABIERTA) sections.forEach(function (x) { if (x !== s) setOpen(x, false); });
        setOpen(s, true);
      },
      cerrarTodas: function () { sections.forEach(function (s) { setOpen(s, false); }); },
      actualizarBadges: refreshBadges
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', function () { init(); setTimeout(init, 1500); });
})();
