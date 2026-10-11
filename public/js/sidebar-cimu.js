/* CIMU - Panel izquierdo con secciones plegables.
   No cambia IDs ni listeners: solo agrupa visualmente y permite plegar.
   Cargar al final del body, DESPUES de script.js */
(function () {
  'use strict';

  var STORE_KEY = 'cimu-sidebar-state';
  var state = {};
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { state = {}; }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function setOpen(section, open) {
    section.classList.toggle('sb-collapsed', !open);
    state[section.dataset.sbId] = open;
    save();
  }

  function makeSection(section, header, id, defaultOpen) {
    section.classList.add('sb-section');
    section.dataset.sbId = id;
    header.classList.add('sb-header');
    var open = (id in state) ? !!state[id] : defaultOpen;
    section.classList.toggle('sb-collapsed', !open);
    header.addEventListener('click', function () {
      setOpen(section, section.classList.contains('sb-collapsed'));
    });
    return section;
  }

  function wrap(first, nodes) {
    var w = document.createElement('div');
    first.parentNode.insertBefore(w, first);
    nodes.forEach(function (n) { w.appendChild(n); });
    return w;
  }

  function init() {
    var sidebar = document.getElementById('left-sidebar');
    if (!sidebar || sidebar.dataset.sbReady) return;
    sidebar.dataset.sbReady = '1';

    // 1) Grupos simples (el h4 ya es el primer hijo): [id de un elemento interno, id de seccion, abierto por defecto]
    [
      ['base-map-selector', 'mapabase', false],
      ['streetview-btn', 'streetview', false],
      ['search-container', 'direcciones', true],
      ['camera-search-container', 'camaras', true]
    ].forEach(function (cfg) {
      var el = document.getElementById(cfg[0]);
      if (!el) return;
      var group = el.classList.contains('filter-group') ? el : el.closest('.filter-group');
      var h4 = group && group.querySelector(':scope > h4');
      if (group && h4) makeSection(group, h4, cfg[1], cfg[2]);
    });

    // 2) Panel de capas: Capas / Filtros / Estilo de trafico
    var cp = document.getElementById('control-panel');
    if (cp) {
      var kids = Array.prototype.slice.call(cp.children);
      var hCapas = kids.filter(function (e) { return e.tagName === 'H4' && /capas/i.test(e.textContent); })[0];
      var hTraf  = kids.filter(function (e) { return e.tagName === 'H4' && /fico/i.test(e.textContent); })[0];
      var firstFilter = kids.filter(function (e) { return e.classList.contains('filter-group'); })[0];
      var clearBtn = document.getElementById('clear-filters-btn');

      var iCapas = hCapas ? kids.indexOf(hCapas) : -1;
      var iFilt  = firstFilter ? kids.indexOf(firstFilter) : -1;
      var iClear = clearBtn ? kids.indexOf(clearBtn) : -1;
      var iTraf  = hTraf ? kids.indexOf(hTraf) : -1;

      // Se arman las listas ANTES de mover nada
      var capasNodes = (iCapas >= 0 && iFilt > iCapas) ? kids.slice(iCapas, iFilt) : null;
      var filtNodes  = (iFilt >= 0 && iClear >= iFilt) ? kids.slice(iFilt, iClear + 1) : null;
      var trafNodes  = (iTraf >= 0) ? kids.slice(iTraf) : null;

      if (capasNodes) {
        var wC = wrap(capasNodes[0], capasNodes);
        makeSection(wC, hCapas, 'capas', true);
      }
      if (filtNodes) {
        var hF = document.createElement('h4');
        hF.textContent = '\uD83D\uDD0E Filtros';
        var wF = wrap(filtNodes[0], filtNodes);
        wF.insertBefore(hF, wF.firstChild);
        makeSection(wF, hF, 'filtros', false);
      }
      if (trafNodes) {
        var wT = wrap(trafNodes[0], trafNodes);
        makeSection(wT, hTraf, 'trafico', false);
      }
    }

    // 3) Filtro por zona
    var zone = sidebar.querySelector('.zone-filter-group');
    var zh = zone && zone.querySelector(':scope > h4');
    if (zone && zh) makeSection(zone, zh, 'zona', false);

    // 4) El tour guiado resalta elementos: si estan en una seccion plegada, se abre
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var el = m.target;
        if (!el.classList || !el.classList.contains('tour-highlight')) return;
        var sec = el.closest('.sb-section.sb-collapsed');
        if (sec) {
          sec.classList.remove('sb-collapsed'); // sin guardar: es temporal
          setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
        }
      });
    }).observe(sidebar, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
