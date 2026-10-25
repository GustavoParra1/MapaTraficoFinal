// Consulta "Recorridos de fuga": solo Hallazgo Automotor y Seguimiento del Evento (sin "Asiste Policia y Libera"),
// tabla seleccionable (ver una sola ruta), lista desplegable y flechas de sentido.
// Tambien aplica el mismo filtro a "Donde se pierde el rastro".
// Uso (desde la carpeta del proyecto):  node aplicar_fuga_filtrada.cjs
const fs = require('fs');
const RUTA = 'public/script.js';
if (!fs.existsSync(RUTA)) { console.log('NO ENCUENTRO ' + RUTA + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
let t = fs.readFileSync(RUTA, 'utf8');
const nl = t.includes('\r\n') ? '\r\n' : '\n';
const fix = s => s.replace(/\r?\n/g, nl);
const cuenta = (s) => t.split(s).length - 1;
const BLOQUE = fix(String.raw`    case 'robos_recorridos_fuga': {
      const rf = await cargarRecorridosFuga();
      const rutas = rf.rutas, bf = rf.filtroBarrio;
      if (!rutas.length) { resultadosDiv.innerHTML = '⚠️ No hay recorridos de fuga (Hallazgo Automotor o Seguimiento del Evento con 2 o más cámaras)' + (bf ? ' en este barrio.' : '.') + ' Los recorridos existen desde 2025; si filtraste el año de Robo Automotor, probá con 2025 o 2026.'; return; }
      const COLOR = { hallazgo: '#7b3294', seguimiento: '#e66101' };
      const ETIQ = { hallazgo: 'Hallazgo automotor', seguimiento: 'Seguimiento del evento' };
      rutas.sort(function (a, b) { return (b.pts.length - a.pts.length) || (b.km - a.km); });
      const tramos = {};
      rutas.forEach(function (r, ri) {
        for (let i = 1; i < r.pts.length; i++) {
          const a = r.pts[i - 1], b = r.pts[i];
          const k = Math.min(a.n, b.n) + '-' + Math.max(a.n, b.n);
          const t = tramos[k] = tramos[k] || { a: a, b: b, ids: [] };
          if (t.ids.indexOf(ri) < 0) t.ids.push(ri);
        }
      });
      const top = Object.keys(tramos).map(function (k) { return tramos[k]; }).sort(function (x, y) { return y.ids.length - x.ids.length; }).slice(0, 10);

      function angulo(a, b) {
        const pa = mymap.project(L.latLng(a.lat, a.lon), 15), pb = mymap.project(L.latLng(b.lat, b.lon), 15);
        return Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI;
      }
      function flecha(a, b, color) {
        const icon = L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10],
          html: '<svg width="20" height="20" viewBox="0 0 20 20" style="display:block;transform:rotate(' + angulo(a, b).toFixed(0) + 'deg);"><path d="M2 3 L18 10 L2 17 L6 10 Z" fill="' + color + '" stroke="#ffffff" stroke-width="1.2"/></svg>' });
        return L.marker([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2], { icon: icon, interactive: false, keyboard: false });
      }
      function chapa(c, txt, bg) {
        const icon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
          html: '<div style="width:22px;height:22px;border-radius:50%;background:' + bg + ';color:#fff;border:2px solid #fff;font:bold 11px/18px Arial,sans-serif;text-align:center;box-shadow:0 0 3px rgba(0,0,0,.5);">' + txt + '</div>' });
        return L.marker([c.lat, c.lon], { icon: icon, keyboard: false }).bindPopup('<b>' + _escConsulta(c.dir) + '</b><br>Cámara ' + c.n);
      }
      function textoRuta(r) {
        return '<b>' + _escConsulta(ETIQ[r.tipo]) + '</b><br>Hecho: ' + _escConsulta(r.dir || 'sin dirección') + '<br>' + _escConsulta(r.fecha) + (r.hora ? ' ' + _escConsulta(r.hora) : '') + '<br>' + r.pts.length + ' cámaras, ' + r.km.toFixed(1) + ' km';
      }
      function pintarTodas() {
        barriosDestacadosLayer.clearLayers();
        rutas.forEach(function (r, ri) {
          L.polyline(r.pts.map(function (c) { return [c.lat, c.lon]; }), { color: COLOR[r.tipo], weight: 3, opacity: 0.5 })
            .bindTooltip(textoRuta(r), { sticky: true })
            .on('click', function () { seleccionar('r:' + ri); })
            .addTo(barriosDestacadosLayer);
          if (isFinite(r.evLat) && isFinite(r.evLon)) {
            L.circleMarker([r.evLat, r.evLon], { radius: 3, color: '#ffffff', weight: 1, fillColor: '#1a9641', fillOpacity: 0.9 }).addTo(barriosDestacadosLayer);
          }
        });
      }
      function pintarSeleccion(ids, detalle) {
        barriosDestacadosLayer.clearLayers();
        ids.forEach(function (ri) {
          const r = rutas[ri], col = COLOR[r.tipo];
          const ll = r.pts.map(function (c) { return [c.lat, c.lon]; });
          L.polyline(ll, { color: '#ffffff', weight: 8, opacity: 0.9 }).addTo(barriosDestacadosLayer);
          L.polyline(ll, { color: col, weight: 4, opacity: 1 }).bindPopup(textoRuta(r)).addTo(barriosDestacadosLayer);
          for (let i = 1; i < r.pts.length; i++) flecha(r.pts[i - 1], r.pts[i], col).addTo(barriosDestacadosLayer);
          if (isFinite(r.evLat) && isFinite(r.evLon)) {
            L.polyline([[r.evLat, r.evLon], ll[0]], { color: '#1a9641', weight: 2, dashArray: '4,6', opacity: 0.9 }).addTo(barriosDestacadosLayer);
            L.circleMarker([r.evLat, r.evLon], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#1a9641', fillOpacity: 1 })
              .bindPopup('<b>Lugar del hecho</b><br>' + _escConsulta(r.dir || 'sin dirección') + '<br>' + _escConsulta(r.fecha) + (r.hora ? ' ' + _escConsulta(r.hora) : '')).addTo(barriosDestacadosLayer);
          }
          if (detalle) r.pts.forEach(function (c, i) {
            chapa(c, String(i + 1), i === 0 ? '#1a9641' : (i === r.pts.length - 1 ? '#d7191c' : '#343a40')).addTo(barriosDestacadosLayer);
          });
        });
        mymap.fitBounds(barriosDestacadosLayer.getBounds(), { padding: [40, 40], maxZoom: 16 });
      }
      let seleccionActual = null;
      function seleccionar(clave) {
        const filas = resultadosDiv.querySelectorAll('[data-fuga]');
        filas.forEach(function (f) { f.style.background = ''; });
        const aviso = resultadosDiv.querySelector('#fuga-aviso');
        if (!clave || clave === seleccionActual) {
          seleccionActual = null;
          pintarTodas();
          if (aviso) aviso.innerHTML = 'Mostrando los ' + rutas.length + ' recorridos. Tocá una fila (o una línea del mapa) para ver solo esa ruta.';
          mymap.fitBounds(barriosDestacadosLayer.getBounds());
          return;
        }
        seleccionActual = clave;
        const fila = resultadosDiv.querySelector('[data-fuga="' + clave + '"]');
        if (fila) fila.style.background = '#ffe3e3';
        const p = clave.split(':'), i = parseInt(p[1], 10);
        if (p[0] === 'r') {
          pintarSeleccion([i], true);
          if (aviso) aviso.innerHTML = 'Mostrando solo el recorrido seleccionado: verde = primera cámara, rojo = última. Las flechas indican el sentido.';
        } else {
          pintarSeleccion(top[i].ids, false);
          if (aviso) aviso.innerHTML = 'Mostrando los ' + top[i].ids.length + ' recorridos que pasaron por el tramo #' + (i + 1) + '. Las flechas indican el sentido.';
        }
      }

      const kms = rutas.map(function (r) { return r.km; });
      const camProm = rutas.reduce(function (s, r) { return s + r.pts.length; }, 0) / rutas.length;
      const nHall = rutas.filter(function (r) { return r.tipo === 'hallazgo'; }).length;
      const nSeg = rutas.length - nHall;
      const MOSTRAR = 10;
      let filasRutas = '';
      rutas.forEach(function (r, ri) {
        filasRutas += '<tr data-fuga="r:' + ri + '" class="' + (ri >= MOSTRAR ? 'fuga-extra' : '') + '" style="cursor:pointer;' + (ri >= MOSTRAR ? 'display:none;' : '') + '">' +
          '<td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:left;">' + (ri + 1) + '. ' + _escConsulta(r.dir || 'sin dirección') + '<br><span style="color:#6c757d;font-size:0.9em;">' + _escConsulta(r.fecha) + (r.hora ? ' ' + _escConsulta(r.hora) : '') + '</span></td>' +
          '<td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:left;"><span style="color:' + COLOR[r.tipo] + ';font-weight:bold;">●</span> ' + _escConsulta(ETIQ[r.tipo]) + '</td>' +
          '<td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:right;">' + r.pts.length + '</td>' +
          '<td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:right;">' + r.km.toFixed(1) + ' km</td></tr>';
      });
      let filasTramos = '';
      top.forEach(function (t, i) {
        filasTramos += '<tr data-fuga="t:' + i + '" style="cursor:pointer;"><td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:left;">' + (i + 1) + '. ' + _escConsulta(t.a.dir) + ' ↔ ' + _escConsulta(t.b.dir) + '</td><td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:right;">' + t.ids.length + '</td></tr>';
      });
      const th = 'padding:6px;border-bottom:2px solid #adb5bd;background:#f1f3f5;';
      resultadosDiv.innerHTML = '<h5>🛣️ Recorridos de fuga de vehículos robados' + (bf ? ' — Barrio: ' + _escConsulta(bf.properties.soc_fomen) : '') + '</h5>' +
        _cajaConsulta('<b>Recorridos de fuga:</b> ' + rutas.length + ' (<span style="color:' + COLOR.hallazgo + ';">●</span> Hallazgo Automotor ' + nHall + ' · <span style="color:' + COLOR.seguimiento + ';">●</span> Seguimiento del Evento ' + nSeg + ')<br><b>Cámaras por recorrido (promedio):</b> ' + camProm.toFixed(1) + '<br><b>Distancia mediana entre la primera y la última cámara:</b> ' + _percentilConsulta(kms, 0.5).toFixed(1) + ' km<br><b>Período:</b> ' + _periodoRoboTexto() + '<br><span style="color:#6c757d;">Se excluyen ' + rf.excluidas + ' recorridos con otro resultado (Asiste Policía y Libera, etc.), que no son fugas.</span>') +
        '<div id="fuga-aviso" style="font-size:0.88em;color:#0a3d62;margin-bottom:8px;">Mostrando los ' + rutas.length + ' recorridos. Tocá una fila (o una línea del mapa) para ver solo esa ruta.</div>' +
        '<button id="fuga-ver-todos" style="font-size:0.85em;padding:4px 10px;margin-bottom:8px;cursor:pointer;">Ver todos en el mapa</button>' +
        '<h5 style="margin-top:6px;">Recorridos</h5>' +
        '<div id="fuga-lista"><table style="width:100%;border-collapse:collapse;font-size:0.88em;"><thead><tr><th style="text-align:left;' + th + '">Hecho</th><th style="text-align:left;' + th + '">Resultado</th><th style="text-align:right;' + th + '">Cám.</th><th style="text-align:right;' + th + '">Dist.</th></tr></thead><tbody>' + filasRutas + '</tbody></table></div>' +
        (rutas.length > MOSTRAR ? '<button id="fuga-desplegar" style="width:100%;margin-top:6px;padding:5px;cursor:pointer;">▼ Ver los ' + rutas.length + ' recorridos</button>' : '') +
        '<h5 style="margin-top:14px;">Tramos más recorridos</h5>' +
        '<table style="width:100%;border-collapse:collapse;font-size:0.88em;"><thead><tr><th style="text-align:left;' + th + '">Tramo entre cámaras</th><th style="text-align:right;' + th + '">Recorridos</th></tr></thead><tbody>' + filasTramos + '</tbody></table>' +
        '<p style="font-size:0.8em;color:#6c757d;margin-top:10px;">Al seleccionar un recorrido se ve solo esa ruta con las cámaras numeradas en el orden registrado y flechas de sentido; al seleccionar un tramo se ven los recorridos que pasaron por él. Es el recorrido entre cámaras, no el trayecto exacto por las calles. Solo hay datos desde 2025 y con el barrio elegido se filtra por el lugar del hecho.</p>';
      resultadosDiv.querySelectorAll('[data-fuga]').forEach(function (tr) {
        tr.addEventListener('click', function () { seleccionar(tr.getAttribute('data-fuga')); });
      });
      const btnTodos = resultadosDiv.querySelector('#fuga-ver-todos');
      if (btnTodos) btnTodos.addEventListener('click', function () { seleccionar(null); });
      const btnDesp = resultadosDiv.querySelector('#fuga-desplegar');
      if (btnDesp) btnDesp.addEventListener('click', function () {
        const lista = resultadosDiv.querySelector('#fuga-lista');
        const abrir = btnDesp.getAttribute('data-abierto') !== '1';
        resultadosDiv.querySelectorAll('.fuga-extra').forEach(function (f) { f.style.display = abrir ? '' : 'none'; });
        lista.style.maxHeight = abrir ? '320px' : '';
        lista.style.overflowY = abrir ? 'auto' : '';
        btnDesp.setAttribute('data-abierto', abrir ? '1' : '0');
        btnDesp.textContent = abrir ? '▲ Ver solo los primeros ' + MOSTRAR : '▼ Ver los ' + rutas.length + ' recorridos';
      });
      pintarTodas();
      mymap.addLayer(barriosDestacadosLayer);
      mymap.fitBounds(barriosDestacadosLayer.getBounds());
      break;
    }

`);

function reemplazar(nombre, ya, antes, despues) {
  if (t.includes(ya)) { console.log('  ya aplicado: ' + nombre); return; }
  const a = fix(antes), n = cuenta(a);
  if (n !== 1) { console.log('ERROR: "' + nombre + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  t = t.replace(a, () => fix(despues));
  console.log('  ok: ' + nombre);
}

// 1) filtro por resultado en cargarRecorridosFuga
reemplazar('contador de excluidas', 'let excluidas = 0;',
  "    const rutas = [];\n    datosRoboConsulta().forEach(function (r) {",
  "    const rutas = [];\n    let excluidas = 0;\n    const _normRes = function (s) { return String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim(); };\n    datosRoboConsulta().forEach(function (r) {");
reemplazar('filtro por resultado', "tipo: tipo,",
  "        rutas.push({ pts: pts, evLat: evLat,",
  "        const rn = _normRes(r['Resultado']);\n        const tipo = (rn.indexOf('hallazgo') === 0 || rn.indexOf('hallasgo') === 0) ? 'hallazgo' : (rn.indexOf('se realiza seguimiento') === 0 ? 'seguimiento' : null);\n        if (!tipo) { excluidas++; return; }\n        rutas.push({ tipo: tipo, pts: pts, evLat: evLat,");
reemplazar('devolver excluidas', 'filtroBarrio: bf, excluidas',
  "return { rutas: rutas, filtroBarrio: bf };",
  "return { rutas: rutas, filtroBarrio: bf, excluidas: excluidas };");

// 2) bloque completo de la consulta
if (t.includes('const COLOR = { hallazgo:')) console.log('  ya aplicado: nueva consulta de recorridos');
else {
  const ini = "    case 'robos_recorridos_fuga': {", fin = "    case 'robos_ultima_camara': {";
  if (cuenta(ini) !== 1 || cuenta(fin) !== 1) { console.log('ERROR: no encuentro el bloque de la consulta. No se toco nada.'); process.exit(1); }
  const i0 = t.indexOf(ini), i1 = t.indexOf(fin);
  if (i1 < i0) { console.log('ERROR: orden inesperado de bloques. No se toco nada.'); process.exit(1); }
  t = t.slice(0, i0) + BLOQUE + t.slice(i1);
  console.log('  ok: nueva consulta de recorridos');
}

// 3) aclaracion en "Donde se pierde el rastro"
reemplazar('aclaracion en ultima camara', 'solo fugas: Hallazgo Automotor o Seguimiento)',
  "' (con 2 o más cámaras)<br><b>Cámaras distintas",
  "' (con 2 o más cámaras; solo fugas: Hallazgo Automotor o Seguimiento)<br><b>Cámaras distintas");

fs.writeFileSync(RUTA, t, 'utf8');
const H = 'public/index.html';
if (fs.existsSync(H)) {
  let h = fs.readFileSync(H, 'utf8');
  const m = h.match(/script\.js\?v=\d+/g) || [];
  if (m.length === 1 && !h.includes('script.js?v=20261017004')) { h = h.replace(/script\.js\?v=\d+/, 'script.js?v=20261017004'); fs.writeFileSync(H, h, 'utf8'); console.log('  ok: version de script.js'); }
  else console.log('  version de script.js: sin cambios (' + m.length + ' coincidencias)');
}
console.log('Listo. Probalo con Ctrl+F5.');
