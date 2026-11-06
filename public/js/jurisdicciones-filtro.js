/* Filtro "Comisaría" (jurisdicciones policiales). Funciona igual que "Filtrar por Barrio":
   - Agrega la lista "Filtrar por Comisaría" debajo de la de barrios (selección múltiple con Ctrl).
   - No toca script.js: reemplaza getSelectedBarrioFeatureCombinada() por una versión que también tiene en cuenta
     la comisaría. Como TODAS las capas y consultas (siniestros, robos, eventos, hallazgos, aforos, cámaras,
     panorama, zonas, informe...) ya usan esa función, el filtro llega a todas.
   - Barrio + comisaría a la vez = la parte del barrio que cae dentro de la comisaría (intersección).
   - Al cambiar la comisaría se dispara 'change' en #barrio-filter, para que corra la misma lógica de siempre
     (resaltar, hacer zoom, volver a aplicar todos los filtros).
   Requisitos: cargar DESPUES de script.js, eventos-layer.js y hallazgos-layer.js. Usa jurisdicciones.geojson (misma carpeta que barrios.geojson)
   y Turf.js (ya cargado en index.html) solo para la intersección barrio+comisaría. */
(function () {
  'use strict';

  var URL_GEOJSON = 'jurisdicciones.geojson';
  var datos = null;                 // FeatureCollection de jurisdicciones
  var cache = { clave: null, feature: null };
  var capaLimites = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- selección ---------- */
  function seleccionadas() {
    var sel = $('comisaria-filter');
    if (!sel) return [];
    return Array.prototype.slice.call(sel.selectedOptions || [])
      .map(function (o) { return o.value; })
      .filter(function (v) { return v && v !== 'all'; });
  }
  function firma() { return seleccionadas().slice().sort(function (a, b) { return a - b; }).join('|'); }
  function nombres() { return seleccionadas().map(function (n) { return 'Comisaría ' + n; }); }
  function texto() { var n = nombres(); return n.length ? (n.length <= 2 ? n.join(' y ') : n.length + ' comisarías') : ''; }

  /* ---------- geometría ---------- */
  function featureComisarias() {
    var sel = seleccionadas();
    if (!sel.length || !datos) return null;
    var feats = datos.features.filter(function (f) { return sel.indexOf(String(f.properties.numero)) >= 0; });
    if (!feats.length) return null;
    if (feats.length === 1) return feats[0];
    var coords = [];
    feats.forEach(function (f) { f.geometry.coordinates.forEach(function (p) { coords.push(p); }); });
    return { type: 'Feature', properties: { soc_fomen: nombres().join(', ') }, geometry: { type: 'MultiPolygon', coordinates: coords } };
  }

  /* Cuadradito de ~1 m: se usa si barrio y comisaría no se tocan, para que el zoom y las capas no fallen y no quede nada adentro. */
  function vacio(ref) {
    var c = ref.geometry.coordinates[0][0][0], d = 0.00001;
    return { type: 'Feature', properties: { soc_fomen: 'Sin coincidencia' },
      geometry: { type: 'MultiPolygon', coordinates: [[[[c[0], c[1]], [c[0] + d, c[1]], [c[0] + d, c[1] + d], [c[0], c[1] + d], [c[0], c[1]]]]] } };
  }

  function nombresBarrios() {
    var sel = $('barrio-filter');
    if (!sel) return [];
    return Array.prototype.slice.call(sel.selectedOptions || []).map(function (o) { return o.value; }).filter(function (v) { return v && v !== 'all'; });
  }

  function combinada(original) {
    var barrio = original();
    var clave = nombresBarrios().sort().join('|') + '#' + firma();
    if (cache.clave === clave && cache.feature !== undefined) return cache.feature;
    var com = featureComisarias(), res;
    if (!com) res = barrio;
    else if (!barrio) res = com;
    else {
      res = null;
      try {
        var x = window.turf && window.turf.intersect(barrio, com);
        if (x && x.geometry) {
          var g = x.geometry;
          res = { type: 'Feature', properties: { soc_fomen: (barrio.properties.soc_fomen || '') + ' ∩ ' + nombres().join(', ') },
                  geometry: g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [g.coordinates] } : g };
        }
      } catch (e) { console.warn('Comisaría: no pude cruzar barrio y comisaría', e); }
      if (!res) res = vacio(com);
    }
    cache = { clave: clave, feature: res };
    return res;
  }

  /* ---------- interfaz ---------- */
  function crearUI() {
    if ($('comisaria-filter')) return true;
    var b = $('barrio-filter');
    var grupo = b && ((b.closest && b.closest('.filter-group')) || b.parentNode);
    if (!grupo) return false;
    grupo.insertAdjacentHTML('afterend',
      '<div class="filter-group" id="comisaria-filter-group">' +
        '<h4>Filtrar por Comisaría:</h4>' +
        '<select id="comisaria-filter" multiple size="6"><option value="all" selected>Todas las Comisarías</option></select>' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:0.85em;margin-top:4px;"><input type="checkbox" id="comisaria-limites"> Mostrar límites de comisarías</label>' +
        '<div style="font-size:0.75em;color:#666;margin-top:3px;">Funciona como el filtro de barrios y se puede combinar con él: se muestra lo que está dentro de ambos.</div>' +
      '</div>');
    return true;
  }

  function llenar() {
    var sel = $('comisaria-filter');
    if (!sel || !datos) return;
    datos.features.map(function (f) { return f.properties.numero; }).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var o = document.createElement('option');
      o.value = String(n); o.textContent = 'Comisaría ' + n;
      sel.appendChild(o);
    });
  }

  function alCambiar() {
    var sel = $('comisaria-filter'), ops = Array.prototype.slice.call(sel.options);
    var todas = ops.filter(function (o) { return o.value === 'all'; })[0];
    if (todas && todas.selected && ops.some(function (o) { return o.value !== 'all' && o.selected; })) {
      ops.forEach(function (o) { o.selected = (o.value === 'all'); });   // "Todas" actua como reinicio, igual que en barrios
    }
    avisarCambio();
  }

  /* Dispara la misma logica que corre al cambiar el barrio (resaltado, zoom y re-aplicar todos los filtros) */
  function avisarCambio() {
    var b = $('barrio-filter');
    if (b) b.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function limites(mostrar) {
    var m = window.mymap;
    if (!m || !datos || !window.L) return;
    if (capaLimites) { m.removeLayer(capaLimites); capaLimites = null; }
    if (!mostrar) return;
    capaLimites = L.geoJSON(datos, {
      style: { color: '#6d28d9', weight: 2, dashArray: '6 4', fillOpacity: 0.03 },
      onEachFeature: function (f, layer) {
        layer.bindTooltip('<b>Comisaría ' + esc(f.properties.numero) + '</b>', { sticky: true });
      }
    }).addTo(m);
    capaLimites.bringToBack();
  }

  function reiniciar() {
    var sel = $('comisaria-filter');
    if (!sel) return;
    Array.prototype.forEach.call(sel.options, function (o) { o.selected = (o.value === 'all'); });
    cache = { clave: null, feature: undefined };
  }

  function iniciar() {
    if (typeof window.getSelectedBarrioFeatureCombinada !== 'function') {
      console.warn('Comisarías: no encuentro getSelectedBarrioFeatureCombinada (script.js)');
      return;
    }
    if (!window.getSelectedBarrioFeatureCombinada._comisarias) {
      var original = window.getSelectedBarrioFeatureCombinada;
      var nuevo = function () { return combinada.call(this, original); };
      nuevo._comisarias = true;
      window.getSelectedBarrioFeatureCombinada = nuevo;
    }
    if (!crearUI()) { console.warn('Comisarías: no encuentro #barrio-filter'); return; }
    $('comisaria-filter').addEventListener('change', alCambiar);
    $('comisaria-limites').addEventListener('change', function (e) { limites(e.target.checked); });
    // "Limpiar filtros" debe vaciar tambien la comisaria ANTES de que script.js re-aplique los filtros (por eso va en la fase de captura)
    var limpiar = $('clear-filters-btn');
    if (limpiar) limpiar.addEventListener('click', reiniciar, true);
    fetch(URL_GEOJSON).then(function (r) {
      if (!r.ok) throw new Error(URL_GEOJSON + ' (' + r.status + ')');
      return r.json();
    }).then(function (d) { datos = d; llenar(); })
      .catch(function (e) { console.error('Comisarías: error al cargar las jurisdicciones', e); var s = $('comisaria-filter'); if (s) s.disabled = true; });
  }

  window.CIMUJurisdicciones = {
    seleccionadas: seleccionadas, firma: firma, nombres: nombres, texto: texto,
    datos: function () { return datos; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
