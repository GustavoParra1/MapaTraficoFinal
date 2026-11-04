/* "Panorama de robos": resumen visual del periodo elegido (año + mes) en el panel de Robo Automotor.
   - Casilla "Panorama de robos" debajo de "Zonas con mas robos". Abre una ventana que se arrastra.
   - Se recalcula sola al cambiar año, mes o resultado, y al cargar mas meses/años en los CSV (no hay datos fijos).
   - Muestra: robos, hallazgos (hallazgo / LPR / secuestro), cobertura de lectores LPR, horario, dia de la semana
     y los sitios sugeridos para nuevos lectores LPR (tambien dibujados en el mapa).
   - Lee robo_automotor.csv, eventos.csv y Camaras.CSV1 (1).csv por su cuenta (el navegador los reutiliza del cache).
   - Se engancha a processAndDisplayRobos (script.js) sin modificarlo. Cargar DESPUES de mes-robos.js.
   - Los CSV no traen patente: el cruce es por zona, no por vehiculo. Sitios sugeridos = candidatos a validar en terreno. */
(function () {
  'use strict';
  var FUENTES = ['eventos.csv', 'robo_automotor.csv'], CAMARAS = 'Camaras.CSV1 (1).csv';
  var TIPO = { 'hallazgo automotor': 'H', 'lpr - vehiculo recuperado': 'L', 'secuestro de vehiculo': 'S' };
  var DETENCION = ['detencion', 'persecucion y detencion', 'lpr - vehiculo interceptado'];
  var DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'], DIA3 = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var hallazgos = null, lectores = null, cargando = null, robosEntrada = [], capa = null, ultimo = null;

  function $(id) { return document.getElementById(id); }
  function mapa() { return window.mymap || (typeof mymap !== 'undefined' ? mymap : null); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function metros(a, b, c, d) { var dx = (d - b) * 111320 * Math.cos(((a + c) / 2) * Math.PI / 180), dy = (c - a) * 111320; return Math.sqrt(dx * dx + dy * dy); }
  function coords(txt) { var p = String(txt || '').split(','); if (p.length !== 2) return null; var lo = parseFloat(p[0]), la = parseFloat(p[1]); return isNaN(lo) || isNaN(la) ? null : { lat: la, lon: lo }; }

  /* ---------- lectura de CSV ---------- */
  function parseCSV(texto, sep) {
    var filas = [], fila = [], campo = '', q = false;
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (q) { if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
      else if (c === '"') q = true;
      else if (c === sep) { fila.push(campo); campo = ''; }
      else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else if (c !== '\r') campo += c;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    var cab = (filas[0] || []).map(function (h) { return h.trim(); });
    return filas.slice(1).map(function (f) { var o = {}; cab.forEach(function (h, i) { o[h] = (f[i] || '').trim(); }); return o; });
  }
  function leer(url, sep) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' (' + r.status + ')'); return r.text(); }).then(function (t) { return parseCSV(t, sep); }); }

  function cargar() {
    if (hallazgos && lectores) return Promise.resolve();
    if (cargando) return cargando;
    cargando = Promise.all(FUENTES.map(function (u) { return leer(u, ';'); }).concat(leer(CAMARAS, ','))).then(function (res) {
      hallazgos = [];
      res.slice(0, FUENTES.length).forEach(function (filas) {
        filas.forEach(function (o) {
          var t = TIPO[norm(o.Resultado)], p = coords(o['Longitud y Latitud']);
          if (t && p && o.estado_coordenada !== 'revisar') hallazgos.push({ lat: p.lat, lon: p.lon, t: t, anio: String(o['año'] || ''), mes: parseInt(o.mes, 10) || 0 });
        });
      });
      lectores = [];
      res[FUENTES.length].forEach(function (c) {
        var la = parseFloat(String(c.Latitud).replace(',', '.')), lo = parseFloat(String(c.Longitud).replace(',', '.'));
        if (!isNaN(la) && !isNaN(lo) && ((parseInt(c['Cant. Cam. LPR'], 10) || 0) > 0 || c.LPR)) lectores.push({ lat: la, lon: lo, dir: c.Direccion });
      });
    }).catch(function (e) { cargando = null; console.error('Panorama de robos: no pude leer los CSV', e); throw e; });
    return cargando;
  }

  /* ---------- calculo (funcion pura, sin DOM) ---------- */
  function calcular(robosRaw, hall, lect, anio, mes, rad, K) {
    var robos = [];
    robosRaw.forEach(function (it) {
      var p = coords(it['Longitud y Latitud']); if (!p) return;
      var m = parseInt(it.mes, 10) || 0; if (mes && m !== mes) return;
      var h = parseInt(String(it.hora || '').split(':')[0], 10), d = DIAS.indexOf(norm(it.dia_semana));
      robos.push({ lat: p.lat, lon: p.lon, dir: it['Direccion 0'] || '', h: isNaN(h) ? -1 : h, d: d, r: norm(it.Resultado) });
    });
    var hs = hall.filter(function (x) { return (!anio || x.anio === String(anio)) && (!mes || x.mes === mes); });
    var out = { n: robos.length, det: 0, H: 0, L: 0, S: 0, hora: new Array(24).fill(0), conHora: 0, dia: new Array(7).fill(0), conDia: 0, cubiertos: 0, sitios: [], lectores: lect.length };
    hs.forEach(function (x) { out[x.t]++; });
    robos.forEach(function (r) {
      if (DETENCION.indexOf(r.r) >= 0) out.det++;
      if (r.h >= 0 && r.h < 24) { out.hora[r.h]++; out.conHora++; }
      if (r.d >= 0) { out.dia[r.d]++; out.conDia++; }
      r.cub = lect.some(function (l) { return metros(r.lat, r.lon, l.lat, l.lon) <= rad; });
      if (r.cub) out.cubiertos++;
    });
    // sitios sugeridos: esquinas que cubren mas robos todavia sin lector (algoritmo voraz)
    var sin = robos.filter(function (r) { return !r.cub; }), vistos = {}, cands = [];
    sin.forEach(function (r) { var k = r.lat + ',' + r.lon; if (!vistos[k]) { vistos[k] = 1; cands.push(r); } });
    var vecinos = cands.map(function (c) { var v = []; sin.forEach(function (r, i) { if (metros(c.lat, c.lon, r.lat, r.lon) <= rad) v.push(i); }); return v; });
    var tomado = new Array(sin.length).fill(false);
    for (var k = 0; k < K && cands.length; k++) {
      var mejor = -1, g = 0;
      vecinos.forEach(function (v, i) { var n = 0; v.forEach(function (j) { if (!tomado[j]) n++; }); if (n > g) { g = n; mejor = i; } });
      if (mejor < 0 || g < 2) break;
      vecinos[mejor].forEach(function (j) { tomado[j] = true; });
      out.sitios.push({ lat: cands[mejor].lat, lon: cands[mejor].lon, dir: cands[mejor].dir, n: g });
    }
    return out;
  }

  /* ---------- ventana ---------- */
  function periodo() {
    var y = $('robo-automotor-year-filter'), m = $('robo-mes-filter');
    var anio = y && y.value && y.value !== 'all' ? y.value : '', mes = m ? (parseInt(m.value, 10) || 0) : 0;
    return { anio: anio, mes: mes, texto: (anio ? 'Año ' + anio : 'Todos los años') + (mes ? ' · ' + MESES[mes - 1] : ' · todos los meses') };
  }
  function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : 0; }
  function barras(vals, etiq, color, alto) {
    var mx = Math.max.apply(null, vals.concat([1]));
    return '<div style="display:flex;align-items:flex-end;gap:1px;height:' + alto + 'px;">' + vals.map(function (v, i) {
      return '<div title="' + etiq(i) + ': ' + v + '" style="flex:1;background:' + color + ';height:' + Math.max(1, Math.round(alto * v / mx)) + 'px;min-width:2px;"></div>';
    }).join('') + '</div>';
  }
  function ventana() {
    var v = $('panorama-robos-flot'); if (v) return v;
    document.body.insertAdjacentHTML('beforeend',
      '<div id="panorama-robos-flot" style="position:fixed;z-index:19000;display:none;flex-direction:column;width:min(420px,calc(100vw - 16px));max-height:78vh;background:#fff;color:#14233a;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.4);font:13px Arial,sans-serif;left:8px;top:90px;">' +
      '<div id="panorama-robos-asa" style="background:#14365f;color:#fff;padding:9px 12px;font-weight:bold;cursor:move;display:flex;justify-content:space-between;align-items:center;"><span>Panorama de robos</span>' +
      '<button type="button" id="panorama-robos-cerrar" style="border:0;border-radius:6px;background:rgba(255,255,255,.2);color:#fff;font-size:16px;width:28px;height:28px;cursor:pointer;">×</button></div>' +
      '<div id="panorama-robos-cuerpo" style="padding:10px 12px;overflow:auto;"></div></div>');
    v = $('panorama-robos-flot');
    var ox, oy, mov = false, asa = $('panorama-robos-asa');
    asa.addEventListener('mousedown', function (e) { if (e.target.tagName === 'BUTTON') return; mov = true; ox = e.clientX - v.offsetLeft; oy = e.clientY - v.offsetTop; e.preventDefault(); });
    document.addEventListener('mousemove', function (e) { if (mov) { v.style.left = Math.max(0, e.clientX - ox) + 'px'; v.style.top = Math.max(0, e.clientY - oy) + 'px'; } });
    document.addEventListener('mouseup', function () { mov = false; });
    $('panorama-robos-cerrar').addEventListener('click', function () { var cb = $('panorama-robos-checkbox'); if (cb) cb.checked = false; actualizar(); });
    return v;
  }
  function kpi(t, v, s) { return '<div style="flex:1;min-width:92px;background:#f4f7fb;border-radius:8px;padding:6px 8px;"><div style="font-size:11px;color:#5b6b82;">' + t + '</div><div style="font-size:19px;font-weight:bold;">' + v + '</div>' + (s ? '<div style="font-size:11px;color:#5b6b82;">' + s + '</div>' : '') + '</div>'; }

  function dibujar(r, p, rad) {
    var c = $('panorama-robos-cuerpo'), hall = r.H + r.L + r.S, pc = pct(r.cubiertos, r.n);
    var h = '<div style="font-size:12px;color:#5b6b82;margin-bottom:8px;">' + esc(p.texto) + ' · ' + r.n + ' robos con los filtros actuales</div>';
    if (!r.n) { c.innerHTML = h + '<p>No hay robos con estos filtros.</p>'; return; }
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
      kpi('Robos', r.n, r.det + ' con detención (' + pct(r.det, r.n) + '%)') +
      kpi('Hallazgos', hall, r.H + ' automotor · ' + r.L + ' LPR · ' + r.S + ' secuestro') +
      kpi('Hallazgos c/100 robos', Math.round(1000 * hall / r.n) / 10, 'por zona, no por vehículo') +
      kpi('Cobertura LPR', pc + '%', 'a ≤' + rad + ' m de un lector (' + r.lectores + ')') + '</div>';
    h += '<div style="font-weight:bold;margin:6px 0 2px;">Horario del evento <span style="font-weight:normal;color:#5b6b82;font-size:11px;">(' + r.conHora + ' con hora)</span></div>';
    h += r.conHora ? barras(r.hora, function (i) { return i + ' h'; }, '#c0392b', 46) + '<div style="display:flex;justify-content:space-between;font-size:10px;color:#5b6b82;"><span>0 h</span><span>6</span><span>12</span><span>18</span><span>23 h</span></div>' +
      '<div style="font-size:12px;">18 a 23 h concentra el <b>' + pct(r.hora.slice(18).reduce(function (a, b) { return a + b; }, 0), r.conHora) + '%</b> (parejo sería 25%)</div>' : '<div style="font-size:12px;color:#5b6b82;">Sin hora en este período (años anteriores a 2025 no la traen).</div>';
    h += '<div style="font-weight:bold;margin:8px 0 2px;">Día de la semana</div>' + (r.conDia ? barras(r.dia, function (i) { return DIA3[i]; }, '#1f5fbf', 34) + '<div style="display:flex;font-size:10px;color:#5b6b82;">' + DIA3.map(function (d) { return '<span style="flex:1;text-align:center;">' + d + '</span>'; }).join('') + '</div>' : '<div style="font-size:12px;color:#5b6b82;">Sin día en este período.</div>');
    h += '<div style="font-weight:bold;margin:10px 0 4px;">Sitios sugeridos para lectores LPR</div>';
    h += r.sitios.length ? '<ol style="margin:0 0 4px 18px;padding:0;">' + r.sitios.map(function (s, i) { return '<li style="margin-bottom:2px;"><a href="#" data-i="' + i + '" style="color:#1f5fbf;">' + esc(s.dir || (s.lat.toFixed(4) + ', ' + s.lon.toFixed(4))) + '</a> <span style="color:#5b6b82;">+' + s.n + ' robos</span></li>'; }).join('') + '</ol>' : '<div style="font-size:12px;color:#5b6b82;">No hay sitios que sumen cobertura.</div>';
    h += '<div style="margin-top:6px;font-size:12px;"><label><input type="checkbox" id="panorama-lect" ' + (ultimoLect ? 'checked' : '') + '> Ver lectores LPR y su radio</label><br><label><input type="checkbox" id="panorama-sit" ' + (ultimoSit ? 'checked' : '') + '> Ver sitios sugeridos en el mapa</label> ' +
      '<select id="panorama-rad" style="margin-left:6px;"><option value="200">200 m</option><option value="300">300 m</option><option value="500">500 m</option></select></div>';
    h += '<p style="font-size:11px;color:#5b6b82;margin:8px 0 0;">Los CSV no tienen patente: el cruce robos/hallazgos es por zona, no por vehículo. Los sitios son candidatos a validar en terreno (calles, accesos y salidas).</p>';
    c.innerHTML = h;
    $('panorama-rad').value = String(rad);
    $('panorama-rad').addEventListener('change', function () { radio = parseInt(this.value, 10); actualizar(); });
    $('panorama-lect').addEventListener('change', function () { ultimoLect = this.checked; capaMapa(); });
    $('panorama-sit').addEventListener('change', function () { ultimoSit = this.checked; capaMapa(); });
    Array.prototype.forEach.call(c.querySelectorAll('a[data-i]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); var s = ultimo.sitios[+a.getAttribute('data-i')], m = mapa(); if (m && s) m.setView([s.lat, s.lon], 16); });
    });
  }
  var radio = 300, ultimoLect = false, ultimoSit = true;

  function capaMapa() {
    var m = mapa(); if (!m) return;
    if (capa) { m.removeLayer(capa); capa = null; }
    var cb = $('panorama-robos-checkbox'); if (!cb || !cb.checked || !ultimo || !window.L) return;
    capa = L.layerGroup();
    if (ultimoLect) lectores.forEach(function (l) { L.circle([l.lat, l.lon], { radius: radio, color: '#1d4ed8', weight: 1.5, dashArray: '4 3', fillOpacity: 0.06, interactive: false }).addTo(capa); });
    if (ultimoSit) ultimo.sitios.forEach(function (s, i) {
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', iconSize: [26, 26], html: '<div style="width:26px;height:26px;border-radius:50%;background:#f1c40f;border:2px solid #000;font:bold 13px/22px Arial;text-align:center;">' + (i + 1) + '</div>' }) })
        .bindTooltip('#' + (i + 1) + ' ' + esc(s.dir) + ' — suma ' + s.n + ' robos a ' + radio + ' m').addTo(capa);
      L.circle([s.lat, s.lon], { radius: radio, color: '#000', weight: 1.2, dashArray: '5 4', fillOpacity: 0, interactive: false }).addTo(capa);
    });
    capa.addTo(m);
  }

  function actualizar() {
    var cb = $('panorama-robos-checkbox'); if (!cb) return;
    var robo = $('robo-automotor-checkbox'), v = ventana();
    if (!cb.checked || (robo && !robo.checked)) { v.style.display = 'none'; ultimo = null; capaMapa(); return; }
    v.style.display = 'flex';
    $('panorama-robos-cuerpo').innerHTML = hallazgos && lectores ? '' : '<p>Cargando datos…</p>';
    cargar().then(function () {
      var p = periodo();
      ultimo = calcular(robosEntrada, hallazgos, lectores, p.anio, p.mes, radio, 8);
      if (cb.checked) { dibujar(ultimo, p, radio); capaMapa(); }
    }).catch(function () { $('panorama-robos-cuerpo').innerHTML = '<p>No pude leer los CSV de datos.</p>'; });
  }

  /* ---------- casilla y enganche ---------- */
  function crearCasilla() {
    if ($('panorama-robos-checkbox')) return;
    var ancla = $('zonas-robos-opc') || (function () { var h = $('robo-heatmap-checkbox'); return h && ((h.closest && h.closest('label')) || h.parentNode); })();
    if (!ancla) return;
    ancla.insertAdjacentHTML('afterend', '<div style="margin-top:4px;"><label><input type="checkbox" id="panorama-robos-checkbox"> Panorama de robos</label></div>');
    $('panorama-robos-checkbox').addEventListener('change', actualizar);
    var robo = $('robo-automotor-checkbox');
    if (robo) robo.addEventListener('change', actualizar);
    ['robo-automotor-year-filter', 'robo-mes-filter', 'robo-resultado-filter'].forEach(function (id) { var s = $(id); if (s) s.addEventListener('change', function () { setTimeout(actualizar, 50); }); });
  }
  function enganchar() {
    var f = window.processAndDisplayRobos;
    if (typeof f !== 'function') return false;
    if (f.__panoramaRobos) return true;
    var nuevo = function (data) {
      robosEntrada = data || [];
      var res = f.apply(this, arguments);
      try { actualizar(); } catch (e) { console.error('Panorama de robos:', e); }
      return res;
    };
    nuevo.__panoramaRobos = true; window.processAndDisplayRobos = nuevo; return true;
  }
  function iniciar() { crearCasilla(); if (!enganchar()) console.warn('Panorama de robos: no encuentro processAndDisplayRobos (script.js)'); }
  window.CIMUPanoramaRobos = {
    calcular: calcular,
    /* Lo usa informe-robos.js: calcula el panorama con los filtros actuales aunque la ventana este cerrada */
    obtener: function () {
      return cargar().then(function () {
        var p = periodo();
        return { r: calcular(robosEntrada, hallazgos, lectores, p.anio, p.mes, radio, 8), periodo: p, radio: radio, lectores: lectores.length };
      });
    }
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
    window.addEventListener('load', function () { crearCasilla(); enganchar(); });
  }
})();
