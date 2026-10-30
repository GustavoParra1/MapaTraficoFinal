/* "Zonas con mas robos": las 10 zonas con mas robos de automotor, con comparativa y evolucion mensual.
   - Usa los mismos filtros de la capa de robos (año, mes, resultado, barrio): se actualiza sola al cambiarlos.
   - Casilla "Zonas con mas robos" debajo de "Mapa de Calor (Robos)"; la lista va en una ventana que se arrastra.
   - Para cada zona muestra los ultimos 12 meses y la comparacion con el mes anterior.
   - Se engancha a processAndDisplayRobos (script.js) sin modificarlo. */
(function () {
  'use strict';
  var CAL_MIN = 5, CAL_MAX_ZONAS = 10;
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  // Mismas categorias que usa script.js en applyRoboAutomotorFilters (si se cambian alla, cambiarlas aca tambien)
  var CATEGORIAS = {
    'Intervención Policial': ['Detencion', 'Persecucion Y Detencion', 'Secuestro De Vehiculo'],
    'Policia Asiste y Libera': ['Asiste Policia y Libera', 'Asiste Prefectura'],
    'Hallasgo de Automotor': ['Hallazgo Automotor'],
    'Sin recurso Policial': ['No Asiste'],
    'Seguimiento LPR': ['LPR - Se realiza seguimiento del vehiculo'],
    'LPR Detencion': ['LPR - Vehiculo Interceptado'],
    'Seguimiento del evento': ['Se Realiza Seguimiento del Evento']
  };
  var datosActuales = [];       // robos que quedaron con los filtros actuales
  var capa = null, zonas = [], cerrada = false;

  function $(id) { return document.getElementById(id); }
  function mapa() { return window.mymap || (typeof mymap !== 'undefined' ? mymap : null); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function plural(n, s, p) { return n === 1 ? s : p; }

  function metros(lat1, lon1, lat2, lon2) {
    var dx = (lon2 - lon1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180), dy = (lat2 - lat1) * 111320;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Robos con coordenadas validas (la columna trae primero la longitud y despues la latitud) */
  function puntos(data) {
    var out = [];
    (data || []).forEach(function (it) {
      var p = String(it['Longitud y Latitud'] || '').split(',').map(function (s) { return s.trim(); });
      if (p.length !== 2) return;
      var lon = parseFloat(p[0]), lat = parseFloat(p[1]);
      if (isNaN(lat) || isNaN(lon)) return;
      out.push({ lat: lat, lon: lon, dir: [it['Direccion 0'], it['Direccion']].filter(Boolean).join(' y '), res: String(it.Resultado || 'Sin dato').trim() });
    });
    return out;
  }

  /* Busca las zonas (circulos de "radio" metros) con mas robos, sin que se superpongan entre si.
     Usa una grilla para que siga siendo rapido con miles de robos. */
  function calcular(pts, radio) {
    if (!pts.length) return [];
    var lat0 = pts[0].lat, dLat = radio / 111320, dLon = radio / (111320 * Math.cos(lat0 * Math.PI / 180));
    var grilla = {};
    pts.forEach(function (p, i) { var k = Math.floor(p.lat / dLat) + ',' + Math.floor(p.lon / dLon); (grilla[k] = grilla[k] || []).push(i); });
    function dentro(lat, lon) {
      var gi = Math.floor(lat / dLat), gj = Math.floor(lon / dLon), res = [];
      for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) {
        var celda = grilla[(gi + a) + ',' + (gj + b)];
        if (celda) celda.forEach(function (i) { if (metros(lat, lon, pts[i].lat, pts[i].lon) <= radio) res.push(pts[i]); });
      }
      return res;
    }
    var vistos = {}, cands = [];
    pts.forEach(function (p) {
      var k = p.lat + ',' + p.lon; if (vistos[k]) return; vistos[k] = true;
      var d = dentro(p.lat, p.lon), la = 0, lo = 0;
      d.forEach(function (q) { la += q.lat; lo += q.lon; });
      var lat = la / d.length, lon = lo / d.length;               // la zona se centra en el medio de sus casos
      cands.push({ lat: lat, lon: lon, n: dentro(lat, lon).length });
    });
    cands.sort(function (a, b) { return b.n - a.n; });
    var elegidas = [];
    for (var i = 0; i < cands.length && elegidas.length < CAL_MAX_ZONAS; i++) {
      var c = cands[i];
      if (c.n < CAL_MIN) break;
      if (elegidas.every(function (z) { return metros(z.lat, z.lon, c.lat, c.lon) >= radio * 2; })) elegidas.push(c);
    }
    elegidas.forEach(function (z) {
      var d = dentro(z.lat, z.lon), dirs = {}, ress = {}, mejor = '', nm = 0;
      var cerca = Infinity;
      d.forEach(function (q) {
        ress[q.res] = (ress[q.res] || 0) + 1;
        /* El nombre es la esquina MAS CERCANA AL CENTRO del circulo (antes era la mas repetida de toda la zona,
           que en zonas con muchos robos repartidos podia quedar lejos del centro). */
        if (q.dir) { var m = metros(z.lat, z.lon, q.lat, q.lon); if (m < cerca) { cerca = m; mejor = q.dir; } }
      });
      z.dir = mejor || ('Zona ' + z.lat.toFixed(4) + ', ' + z.lon.toFixed(4));
      z.res = Object.keys(ress).map(function (k) { return { r: k, n: ress[k] }; }).sort(function (a, b) { return b.n - a.n; });
    });
    return elegidas;
  }

  function color(n, nMax) { var f = nMax ? n / nMax : 0; return f >= 0.75 ? '#b00020' : (f >= 0.5 ? '#d9480f' : '#c77d00'); }

  function periodoTexto() {
    var y = $('robo-automotor-year-filter'), r = $('robo-resultado-filter');
    var anio = y && y.value && y.value !== 'all' ? 'año ' + y.value : 'todos los años';
    var res = r && r.value && r.value !== 'Todos los Resultados' ? ', resultado: ' + r.value : '';
    return anio + res + (window.CIMUMesRobos ? window.CIMUMesRobos.texto() : '');
  }

  /* ---------- evolucion mensual: comparativa con el mes anterior y ultimos 12 meses ---------- */
  function todosLosRobos() {
    try { return (typeof allRoboAutomotorData !== 'undefined' && Array.isArray(allRoboAutomotorData)) ? allRoboAutomotorData : null; } catch (e) { return null; }
  }

  /* anio*12 + (mes-1) de un robo, o -1 si no se puede saber (acepta mes 3, "03", "Marzo" o la fecha) */
  function claveMes(it) {
    var a = parseInt(it['año'], 10), v = String(it.mes != null ? it.mes : '').trim(), m = 0;
    var f = String(it.fecha || it.Fecha || '').trim(), x;
    if (v) {
      var n = Number(v);
      if (isFinite(n) && n === Math.floor(n) && n >= 1 && n <= 12) m = n;
      else { var t = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 3); for (var i = 0; i < 12; i++) if (MESES[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 3) === t) m = i + 1; }
    }
    if (!m && f) {
      x = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(f);
      if (x) { a = a || parseInt(x[1], 10); m = parseInt(x[2], 10); }
      else { x = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/.exec(f); if (x) { a = a || parseInt(x[3], 10); m = parseInt(x[2], 10); } }
    }
    return (isNaN(a) || m < 1 || m > 12) ? -1 : a * 12 + m - 1;
  }

  /* Todos los robos (con el filtro de resultado y de barrio de la capa, sin filtrar año ni mes) con su mes y ubicacion */
  function baseEvolucion() {
    var todos = todosLosRobos();
    if (!todos || !todos.length) return null;
    var r = $('robo-resultado-filter'), sel = r ? r.value : 'Todos los Resultados', cat = CATEGORIAS[sel], otros = (sel === 'Otros resultados'), conocidos = [], barrio = null;
    Object.keys(CATEGORIAS).forEach(function (k) { conocidos = conocidos.concat(CATEGORIAS[k]); });
    try { if (typeof getSelectedBarrioFeatureCombinada === 'function') barrio = getSelectedBarrioFeatureCombinada(); } catch (e) { barrio = null; }
    var out = [];
    todos.forEach(function (it) {
      if (otros) { if (it.Resultado && conocidos.indexOf(String(it.Resultado).trim()) >= 0) return; }
      else if (cat && !(it.Resultado && cat.indexOf(String(it.Resultado).trim()) >= 0)) return;
      var k = claveMes(it); if (k < 0) return;
      var p = String(it['Longitud y Latitud'] || '').split(',').map(function (s) { return s.trim(); });
      if (p.length !== 2) return;
      var lon = parseFloat(p[0]), lat = parseFloat(p[1]); if (isNaN(lat) || isNaN(lon)) return;
      if (barrio && !isLatLngInMultiPolygon(L.latLng(lat, lon), barrio.geometry.coordinates)) return;
      out.push({ k: k, lat: lat, lon: lon });
    });
    return out;
  }

  /* Mes de referencia: el elegido (año + mes) o, si no, el ultimo mes con datos */
  function referencia(base) {
    var y = $('robo-automotor-year-filter'), mm = $('robo-mes-filter');
    var anio = (y && y.value !== 'all') ? parseInt(y.value, 10) : 0, mes = mm ? (parseInt(mm.value, 10) || 0) : 0;
    if (anio && mes) return { k: anio * 12 + mes - 1, elegido: true };
    var max = -1;
    base.forEach(function (b) { if ((!anio || Math.floor(b.k / 12) === anio) && b.k > max) max = b.k; });
    return max >= 0 ? { k: max, elegido: false } : null;
  }

  function nombreMes(k) { return MESES[k % 12] + ' ' + Math.floor(k / 12); }
  function corto(k) { return MES3[k % 12] + ' ' + String(Math.floor(k / 12)).slice(2); }

  function serie(base, ref, z, radio) {
    var s = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], desde = ref.k - 11;
    base.forEach(function (b) {
      var i = b.k - desde;
      if (i < 0 || i > 11) return;
      if (z && metros(z.lat, z.lon, b.lat, b.lon) > radio) return;
      s[i]++;
    });
    return s;
  }

  function variacion(a, b) {   // a = valor actual, b = anterior; devuelve texto con color
    var d = a - b, col = d > 0 ? '#b00020' : (d < 0 ? '#1b7f3b' : '#5b6b82');
    return '<b style="color:' + col + ';">' + (d > 0 ? '+' : '') + d + '</b>';
  }

  /* Texto de comparativa de una zona (a partir de su serie de 12 meses) */
  function comparativa(s, ref) {
    if (ref.elegido) {
      var cur = s[11], prev = s[10];
      if (!prev && cur) return 'Sin robos en ' + MESES[(ref.k - 1) % 12] + ' → zona nueva este mes';
      return 'vs ' + MESES[(ref.k - 1) % 12] + ': ' + prev + ' → ' + cur + ' (' + variacion(cur, prev) + ')';
    }
    var u3 = s[9] + s[10] + s[11], a3 = s[6] + s[7] + s[8];
    if (!a3 && u3) return 'Últimos 3 meses: ' + u3 + ' (antes: ninguno)';
    var pct = a3 ? Math.round((u3 - a3) * 100 / a3) : 0;
    return 'Últimos 3 meses: ' + u3 + ' vs ' + a3 + ' antes (<b style="color:' + (pct > 0 ? '#b00020' : (pct < 0 ? '#1b7f3b' : '#5b6b82')) + ';">' + (pct > 0 ? '+' : '') + pct + '%</b>)';
  }

  function minigrafico(s, col, ref) {
    var max = Math.max.apply(null, s.concat([1])), bw = 7, gap = 2, h = 22, W = 12 * (bw + gap);
    var out = '<svg width="' + W + '" height="' + (h + 2) + '" viewBox="0 0 ' + W + ' ' + (h + 2) + '" role="img" aria-label="Robos por mes en esta zona, últimos 12 meses">';
    s.forEach(function (v, i) {
      var bh = v ? Math.max(2, Math.round(v / max * h)) : 1;
      out += '<rect x="' + (i * (bw + gap)) + '" y="' + (h + 1 - bh) + '" width="' + bw + '" height="' + bh + '" rx="1" fill="' + (i === 11 ? col : '#b8c4d6') + '"><title>' + nombreMes(ref.k - 11 + i) + ': ' + v + '</title></rect>';
    });
    return out + '</svg>';
  }

  function graficoGeneral(s, ref) {
    var max = Math.max.apply(null, s.concat([1])), bw = 22, gap = 6, top = 12, h = 44, W = 12 * (bw + gap);
    var out = '<svg width="100%" viewBox="0 0 ' + W + ' ' + (top + h + 14) + '" role="img" aria-label="Robos por mes, últimos 12 meses" style="max-width:' + W + 'px;">';
    s.forEach(function (v, i) {
      var bh = v ? Math.max(2, Math.round(v / max * h)) : 1, x = i * (bw + gap), k = ref.k - 11 + i;
      out += '<rect x="' + x + '" y="' + (top + h - bh) + '" width="' + bw + '" height="' + bh + '" rx="2" fill="' + (i === 11 ? '#a3151f' : '#b8c4d6') + '"/>' +
        '<text x="' + (x + bw / 2) + '" y="' + (top + h - bh - 2) + '" font-size="9" text-anchor="middle" fill="#14233a">' + v + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (top + h + 11) + '" font-size="8" text-anchor="middle" fill="#5b6b82">' + MES3[k % 12] + '</text>';
    });
    return out + '</svg>';
  }

  function resumenGeneral(s, ref) {
    var cur = s[11], prev = s[10], hoy = new Date(), enCurso = (hoy.getFullYear() * 12 + hoy.getMonth()) === ref.k;
    var t = '<b>' + nombreMes(ref.k) + ':</b> ' + cur + ' ' + plural(cur, 'robo', 'robos');
    if (prev) t += ' (' + (cur >= prev ? '+' : '') + Math.round((cur - prev) * 100 / prev) + '% vs ' + MESES[(ref.k - 1) % 12] + ': ' + prev + ')';
    else if (cur) t += ' (' + MESES[(ref.k - 1) % 12] + ' sin robos registrados)';
    return '<div style="margin:0 0 10px;padding:8px 10px;background:#f4f7fb;border-radius:8px;">' +
      '<div style="font-weight:600;margin-bottom:4px;">Evolución de robos por mes</div>' + graficoGeneral(s, ref) +
      '<div style="font-size:12px;margin-top:4px;">' + t + '</div>' +
      '<div style="font-size:11px;color:#5b6b82;margin-top:2px;">' + (ref.elegido ? 'Mes elegido en el filtro. ' : 'Último mes con datos. ') + (enCurso ? 'Es el mes en curso: puede estar incompleto. ' : '') +
        'Se cuentan los robos con ubicación, con el filtro de resultado' + ($('robo-resultado-filter') && $('robo-resultado-filter').value !== 'Todos los Resultados' ? ' (' + esc($('robo-resultado-filter').value) + ')' : '') + ', sin importar el año elegido.</div></div>';
  }

  /* ---------- ventana flotante (se arrastra con mouse, dedo o flechas del teclado) ---------- */
  function estilos() {
    if ($('zonas-robos-estilos')) return;
    var st = document.createElement('style');
    st.id = 'zonas-robos-estilos';
    st.textContent =
      '#zonas-robos-flot{position:fixed;z-index:19000;display:none;flex-direction:column;width:min(400px,calc(100vw - 16px));max-height:72vh;background:#fff;color:#14233a;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.4);font-family:inherit;}' +
      '#zonas-robos-asa{cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;align-items:center;gap:10px;padding:9px 12px;background:#a3151f;color:#fff;}' +
      '#zonas-robos-asa:focus{outline:2px solid #fff;outline-offset:-4px;}' +
      '#zonas-robos-asa h2{margin:0;font-size:14px;flex:1;color:#fff;}' +
      '#zonas-robos-asa button{width:30px;height:30px;font-size:18px;border:0;border-radius:6px;background:rgba(255,255,255,.2);color:#fff;cursor:pointer;}' +
      '#zonas-robos-cuerpo{overflow-y:auto;font-size:13px;padding:10px 14px 12px;}' +
      '.zr-item{cursor:pointer;padding:7px 4px;border-bottom:1px solid #e3e9f2;line-height:1.3;}' +
      '.zr-item:hover,.zr-item:focus{background:#fbeff0;outline:none;}' +
      '@media (max-width:760px){#zonas-robos-flot{left:8px !important;right:8px;top:auto !important;bottom:8px;width:auto;max-height:55vh;}#zonas-robos-asa{cursor:default;}}';
    document.head.appendChild(st);
  }

  function mover(caja, x, y) {
    var r = caja.getBoundingClientRect();
    x = Math.max(0, Math.min(x, window.innerWidth - (r.width || 400)));
    y = Math.max(0, Math.min(y, window.innerHeight - 40));
    caja.style.left = x + 'px'; caja.style.top = y + 'px'; caja._pos = { x: x, y: y };
  }

  function crearVentana() {
    estilos();
    var caja = document.createElement('div');
    caja.id = 'zonas-robos-flot';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-label', 'Zonas con más robos de automotor');
    caja.innerHTML =
      '<div id="zonas-robos-asa" tabindex="0" title="Arrastrá para mover" aria-label="Zonas con más robos. Con las flechas del teclado se mueve la ventana">' +
        '<span aria-hidden="true">&#8942;&#8942;</span><h2>Zonas con más robos</h2>' +
        '<button type="button" id="zonas-robos-cerrar" aria-label="Cerrar">&times;</button></div>' +
      '<div id="zonas-robos-cuerpo"></div>';
    document.body.appendChild(caja);
    var asa = $('zonas-robos-asa'), arr = null;
    asa.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      var r = caja.getBoundingClientRect(); arr = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { asa.setPointerCapture(e.pointerId); } catch (x) {}
    });
    asa.addEventListener('pointermove', function (e) { if (arr) mover(caja, e.clientX - arr.dx, e.clientY - arr.dy); });
    asa.addEventListener('pointerup', function () { arr = null; });
    asa.addEventListener('pointercancel', function () { arr = null; });
    asa.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key];
      if (!d) return; e.preventDefault();
      var r = caja.getBoundingClientRect(), b = caja._pos || { x: r.left, y: r.top }; mover(caja, b.x + d[0], b.y + d[1]);
    });
    $('zonas-robos-cerrar').addEventListener('click', function () { cerrada = true; cerrarVentana(); });
    return caja;
  }
  function abrirVentana() {
    var caja = $('zonas-robos-flot') || crearVentana();
    caja.style.display = 'flex';
    var p = caja._pos || { x: Math.max(8, window.innerWidth - 620), y: 120 };
    mover(caja, p.x, p.y);
  }
  function cerrarVentana() { var c = $('zonas-robos-flot'); if (c) c.style.display = 'none'; }

  /* ---------- capa en el mapa + lista ---------- */
  function limpiar() {
    var m = mapa();
    if (m && capa) m.removeLayer(capa);
    capa = null; zonas = [];
    var r = $('zonas-robos-resumen'); if (r) r.innerHTML = '';
  }

  function actualizar() {
    var cb = $('zonas-robos-checkbox'), m = mapa();
    if (!cb) return;
    limpiar();
    var opc = $('zonas-robos-opc'); if (opc) opc.style.display = cb.checked ? 'block' : 'none';
    var robo = $('robo-automotor-checkbox');
    if (!cb.checked || !m || (robo && !robo.checked)) { cerrarVentana(); return; }
    var radio = parseInt($('zonas-robos-radio').value, 10) || 500;
    var pts = puntos(datosActuales);
    zonas = calcular(pts, radio);
    var nMax = zonas.length ? zonas[0].n : 0, periodo = periodoTexto();

    // evolucion (si se pueden leer todos los robos de script.js)
    var base = null, ref = null, general = null;
    try { base = baseEvolucion(); ref = base && base.length ? referencia(base) : null; } catch (e) { console.error('Zonas con más robos: evolución', e); base = null; ref = null; }
    if (ref) {
      general = serie(base, ref, null, 0);
      zonas.forEach(function (z) { z.serie = serie(base, ref, z, radio); });
    }

    capa = L.layerGroup();
    zonas.forEach(function (z, i) {
      var col = color(z.n, nMax);
      var c = L.circle([z.lat, z.lon], { radius: radio, color: col, weight: 2.5, fillColor: col, fillOpacity: 0.16, bubblingMouseEvents: false });
      z.circulo = c;
      c.bindTooltip('<b>' + (i + 1) + '. ' + esc(z.dir) + '</b><br>' + z.n + ' ' + plural(z.n, 'robo', 'robos') + ' en ' + radio + ' m', { sticky: true });
      c.bindPopup('<b>#' + (i + 1) + ' ' + esc(z.dir) + '</b><br><b>' + z.n + '</b> ' + plural(z.n, 'robo', 'robos') + ' de automotor en ' + radio + ' m' +
        '<br><span style="font-size:12px;">' + z.res.slice(0, 4).map(function (x) { return esc(x.r) + ': ' + x.n; }).join('<br>') + '</span>' +
        (z.serie ? '<br><span style="font-size:12px;">' + comparativa(z.serie, ref) + '</span><br>' + minigrafico(z.serie, col, ref) + '<br><span style="font-size:10px;color:#666;">' + corto(ref.k - 11) + ' a ' + corto(ref.k) + '</span>' : '') +
        '<br><span style="font-size:11px;color:#666;">Período: ' + esc(periodo) + '</span>');
      c.addTo(capa);
      L.marker([z.lat, z.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13],
        html: '<div style="width:26px;height:26px;border-radius:50%;background:' + col + ';color:#fff;border:2px solid #fff;font:bold 13px/22px Arial,sans-serif;text-align:center;box-shadow:0 0 4px rgba(0,0,0,.55);">' + (i + 1) + '</div>' }) }).addTo(capa);
    });
    capa.addTo(m);

    var r = $('zonas-robos-resumen');
    if (r) {
      r.innerHTML = '<div style="margin-top:4px;">' + (zonas.length ? zonas.length + (zonas.length === 1 ? ' zona encontrada' : ' zonas encontradas') : 'Sin zonas con ' + CAL_MIN + ' o más robos') + '</div>' +
        '<button type="button" id="zonas-robos-abrir" style="margin:4px 0 0;width:100%;padding:5px 8px;cursor:pointer;background:#1f5fbf;color:#fff;border:0;border-radius:4px;font:inherit;font-size:12px;">Ver lista de zonas</button>';
      $('zonas-robos-abrir').addEventListener('click', function () { cerrada = false; abrirVentana(); });
    }

    var cuerpo = ($('zonas-robos-flot') || crearVentana()) && $('zonas-robos-cuerpo');
    var encabezado = general ? resumenGeneral(general, ref) : '';
    if (!zonas.length) {
      cuerpo.innerHTML = encabezado + '<p style="margin:0;">No hay zonas de ' + radio + ' m con ' + CAL_MIN + ' o más robos con estos filtros. Probá con una zona más grande o con otro año o mes.</p>';
    } else {
      cuerpo.innerHTML = encabezado + '<p style="margin:0 0 8px;font-size:12px;color:#5b6b82;">Las ' + zonas.length + ' zonas de ' + radio + ' m con más robos. Período: ' + esc(periodo) + '. A diferencia del Top 10 por esquina, cada zona suma todos los robos cercanos. ' +
        (ref ? 'Debajo de cada zona: los últimos 12 meses (la barra roja es ' + (ref.elegido ? 'el mes elegido' : 'el último mes con datos') + ') y la comparación. ' : '') + 'Tocá una zona para acercarte.</p>' +
        zonas.map(function (z, i) {
          var col = color(z.n, nMax);
          return '<div class="zr-item" role="button" tabindex="0" data-i="' + i + '">' +
            '<span style="display:inline-block;min-width:22px;height:22px;border-radius:50%;background:' + col + ';color:#fff;font:bold 12px/22px Arial,sans-serif;text-align:center;margin-right:8px;">' + (i + 1) + '</span>' +
            '<b>' + esc(z.dir) + '</b><br><span style="color:#5b6b82;margin-left:30px;">' + z.n + ' ' + plural(z.n, 'robo', 'robos') + ' (' + esc(z.res.slice(0, 2).map(function (x) { return x.r + ' ' + x.n; }).join(', ')) + ')</span>' +
            (z.serie ? '<div style="margin:3px 0 0 30px;display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;">' + minigrafico(z.serie, col, ref) + '<span style="font-size:12px;">' + comparativa(z.serie, ref) + '</span></div>' : '') + '</div>';
        }).join('');
      Array.prototype.forEach.call(cuerpo.querySelectorAll('.zr-item'), function (el) {
        var ir = function () {
          var z = zonas[parseInt(el.getAttribute('data-i'), 10)]; if (!z) return;
          m.fitBounds(L.latLng(z.lat, z.lon).toBounds(radio * 2.6));
          z.circulo.openPopup();
        };
        el.addEventListener('click', ir);
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
      });
    }
    if (!cerrada) abrirVentana();
  }

  /* ---------- casilla en el panel de Robo Automotor ---------- */
  function crearCasilla() {
    var heat = $('robo-heatmap-checkbox');
    if (!heat || $('zonas-robos-checkbox')) return;
    var lab = (heat.closest && heat.closest('label')) || heat.parentNode;
    lab.insertAdjacentHTML('afterend',
      '<div style="margin-top:4px;"><label><input type="checkbox" id="zonas-robos-checkbox"> Zonas con más robos</label></div>' +
      '<div id="zonas-robos-opc" style="display:none;margin:4px 0 0 24px;font-size:12px;">Tamaño de zona: ' +
        '<select id="zonas-robos-radio"><option value="300">300 m</option><option value="500" selected>500 m</option><option value="1000">1000 m</option></select>' +
        '<div id="zonas-robos-resumen"></div></div>');
    $('zonas-robos-checkbox').addEventListener('change', function () { cerrada = false; actualizar(); });
    $('zonas-robos-radio').addEventListener('change', actualizar);
    var robo = $('robo-automotor-checkbox');
    if (robo) robo.addEventListener('change', function () {
      if (!robo.checked) { $('zonas-robos-checkbox').checked = false; limpiar(); cerrarVentana(); var o = $('zonas-robos-opc'); if (o) o.style.display = 'none'; }
    });
  }

  /* ---------- enganche: cada vez que se filtran los robos, se recalculan las zonas ---------- */
  function enganchar() {
    var f = window.processAndDisplayRobos;
    if (typeof f !== 'function') return false;
    if (f.__zonasRobos) return true;
    var nuevo = function (data) {
      datosActuales = data || [];
      var res = f.apply(this, arguments);
      try { actualizar(); } catch (e) { console.error('Zonas con más robos:', e); }
      return res;
    };
    nuevo.__zonasRobos = true;
    window.processAndDisplayRobos = nuevo;
    return true;
  }

  function iniciar() {
    crearCasilla();
    if (!enganchar()) console.warn('Zonas con más robos: no encuentro processAndDisplayRobos (script.js)');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
  window.addEventListener('load', function () { crearCasilla(); enganchar(); });
})();