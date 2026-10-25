// Agrega 2 consultas sobre robo automotor: "Recorridos de fuga" y "Donde se pierde el rastro".
// Uso (desde la carpeta del proyecto):  node aplicar_recorridos_fuga.cjs
const fs = require('fs');
for (const f of ['public/index.html', 'public/script.js']) {
  if (!fs.existsSync(f)) { console.log('NO ENCUENTRO ' + f + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
}
const HELPERS = String.raw`// ============================================================
// CONSULTAS: recorridos de vehiculos robados (camaras que siguieron al vehiculo)
// ============================================================
function _camarasPorNumero() {
    if (window.__camPorNum && window.__camPorNumDe === allCamerasData) return window.__camPorNum;
    const m = {};
    (allCamerasData || []).forEach(function (c) {
        const n = parseInt(c['N CAMARA'], 10);
        const lat = parseFloat(String(c.Latitud).replace(',', '.'));
        const lon = parseFloat(String(c.Longitud).replace(',', '.'));
        if (isNaN(n) || isNaN(lat) || isNaN(lon) || m[n]) return;
        m[n] = { n: n, lat: lat, lon: lon, dir: String(c['Direccion'] || '').split(',')[0].trim() || ('Camara ' + n) };
    });
    window.__camPorNum = m;
    window.__camPorNumDe = allCamerasData;
    return m;
}

function _barrioDeCamara(c) {
    if (c.barrio !== undefined) return c.barrio;
    c.barrio = 'Sin especificar';
    if (typeof barriosData !== 'undefined' && barriosData && barriosData.features) {
        const ll = L.latLng(c.lat, c.lon);
        for (let i = 0; i < barriosData.features.length; i++) {
            const b = barriosData.features[i];
            if (isLatLngInMultiPolygon(ll, b.geometry.coordinates)) { c.barrio = b.properties.soc_fomen; break; }
        }
    }
    return c.barrio;
}

async function cargarRecorridosFuga() {
    try { await loadRoboAutomotorData(); } catch (e) { console.error('Recorridos: error cargando robo automotor', e); }
    if (typeof baseDataLoaded !== 'undefined' && !baseDataLoaded) {
        skipAutoDisplayCameras = true;
        try { await loadBaseCSVData(); } catch (e) { console.error('Recorridos: error cargando camaras', e); }
        skipAutoDisplayCameras = false;
    }
    const cams = _camarasPorNumero();
    const bf = getSelectedBarrioFeatureCombinada();
    const rutas = [];
    datosRoboConsulta().forEach(function (r) {
        const raw = String(r['Cámaras'] || '').trim();
        if (!raw || /^n\/?a$/i.test(raw)) return;
        const pts = [];
        raw.split(/[\s,;]+/).forEach(function (tok) {
            const m = /^(\d{1,4})/.exec(tok);
            if (!m) return;
            const c = cams[parseInt(m[1], 10)];
            if (c && (!pts.length || pts[pts.length - 1].n !== c.n)) pts.push(c);
        });
        if (pts.length < 2) return;
        const p = String(r['Longitud y Latitud'] || '').split(',');
        const evLon = parseFloat(p[0]), evLat = parseFloat(p[1]);
        if (bf && (isNaN(evLat) || isNaN(evLon) || !isLatLngInMultiPolygon(L.latLng(evLat, evLon), bf.geometry.coordinates))) return;
        let km = 0;
        for (let i = 1; i < pts.length; i++) km += calcularDistancia(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon) / 1000;
        rutas.push({ pts: pts, evLat: evLat, evLon: evLon, km: km, res: r['Resultado'] || 'Sin dato', dir: r['Direccion 0'] || '', fecha: r['fecha'] || '', hora: r['hora'] || '' });
    });
    return { rutas: rutas, filtroBarrio: bf };
}

function _periodoRoboTexto() {
    const sel = document.getElementById('robo-automotor-year-filter');
    return (datosRoboConsulta().length === (allRoboAutomotorData || []).length) ? 'todos los años' : ('año ' + (sel ? sel.value : ''));
}

`;
const CASOS = String.raw`    case 'robos_recorridos_fuga': {
      const rf = await cargarRecorridosFuga();
      const rutas = rf.rutas, bf = rf.filtroBarrio;
      if (!rutas.length) { resultadosDiv.innerHTML = '⚠️ No hay recorridos de vehículos con 2 o más cámaras' + (bf ? ' en este barrio.' : '.') + ' Los recorridos existen desde 2025; si filtraste el año de Robo Automotor, probá con 2025 o 2026.'; return; }
      barriosDestacadosLayer.clearLayers();
      const tramos = {};
      const resCont = {};
      rutas.forEach(function (r) {
        L.polyline(r.pts.map(function (c) { return [c.lat, c.lon]; }), { color: '#d7191c', weight: 3, opacity: 0.4 })
          .bindPopup('<b>Recorrido de vehículo robado</b><br>Hecho: ' + _escConsulta(r.dir || 'sin dirección') + '<br>' + _escConsulta(r.fecha) + (r.hora ? ' ' + _escConsulta(r.hora) : '') + '<br>Resultado: ' + _escConsulta(r.res) + '<br>' + r.pts.length + ' cámaras, ' + r.km.toFixed(1) + ' km')
          .addTo(barriosDestacadosLayer);
        if (isFinite(r.evLat) && isFinite(r.evLon)) {
          L.circleMarker([r.evLat, r.evLon], { radius: 3, color: '#ffffff', weight: 1, fillColor: '#1a9641', fillOpacity: 0.9 }).addTo(barriosDestacadosLayer);
        }
        resCont[r.res] = (resCont[r.res] || 0) + 1;
        for (let i = 1; i < r.pts.length; i++) {
          const a = r.pts[i - 1], b = r.pts[i];
          const k = Math.min(a.n, b.n) + '-' + Math.max(a.n, b.n);
          const t = tramos[k] = tramos[k] || { a: a, b: b, count: 0 };
          t.count++;
        }
      });
      const top = Object.keys(tramos).map(function (k) { return tramos[k]; }).sort(function (x, y) { return y.count - x.count; }).slice(0, 10);
      top.forEach(function (t, i) {
        L.polyline([[t.a.lat, t.a.lon], [t.b.lat, t.b.lon]], { color: '#7f0000', weight: 6, opacity: 0.9 })
          .bindTooltip(String(i + 1), { permanent: true, direction: 'center', className: 'tooltip-top-esquina' })
          .bindPopup('<b>Tramo #' + (i + 1) + '</b><br>' + _escConsulta(t.a.dir) + ' ↔ ' + _escConsulta(t.b.dir) + '<br>' + t.count + ' recorridos')
          .addTo(barriosDestacadosLayer);
      });
      mymap.addLayer(barriosDestacadosLayer);
      mymap.fitBounds(barriosDestacadosLayer.getBounds());
      const kms = rutas.map(function (r) { return r.km; });
      const camProm = rutas.reduce(function (s, r) { return s + r.pts.length; }, 0) / rutas.length;
      const resTop = Object.keys(resCont).map(function (k) { return [k, resCont[k]]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 3)
        .map(function (x) { return _escConsulta(x[0]) + ' (' + x[1] + ')'; }).join(', ');
      resultadosDiv.innerHTML = '<h5>🛣️ Recorridos de fuga de vehículos robados' + (bf ? ' — Barrio: ' + _escConsulta(bf.properties.soc_fomen) : '') + '</h5>' +
        _cajaConsulta('<b>Recorridos con 2 o más cámaras:</b> ' + rutas.length + '<br><b>Cámaras por recorrido (promedio):</b> ' + camProm.toFixed(1) + '<br><b>Distancia mediana entre la primera y la última cámara:</b> ' + _percentilConsulta(kms, 0.5).toFixed(1) + ' km<br><b>Resultados más comunes:</b> ' + resTop + '<br><b>Período:</b> ' + _periodoRoboTexto()) +
        '<h5 style="margin-top:14px;">Tramos más recorridos</h5>' +
        _tablaConsultaHTML(['Tramo entre cámaras', 'Recorridos'], top.map(function (t, i) { return [(i + 1) + '. ' + _escConsulta(t.a.dir) + ' ↔ ' + _escConsulta(t.b.dir), t.count]; })) +
        '<p style="font-size:0.8em;color:#6c757d;margin-top:10px;">Cada línea roja une, en el orden registrado, las cámaras que siguieron al vehículo; los puntos verdes son el lugar del hecho. Las líneas gruesas numeradas son los 10 tramos más repetidos. Es el recorrido entre cámaras, no el trayecto exacto por las calles. Solo hay datos desde 2025 y con el barrio elegido se filtra por el lugar del hecho.</p>';
      break;
    }

    case 'robos_ultima_camara': {
      const rf = await cargarRecorridosFuga();
      const rutas = rf.rutas, bf = rf.filtroBarrio;
      if (!rutas.length) { resultadosDiv.innerHTML = '⚠️ No hay recorridos de vehículos con 2 o más cámaras' + (bf ? ' en este barrio.' : '.') + ' Los recorridos existen desde 2025; si filtraste el año de Robo Automotor, probá con 2025 o 2026.'; return; }
      const ult = {};
      rutas.forEach(function (r) {
        const c = r.pts[r.pts.length - 1];
        const g = ult[c.n] = ult[c.n] || { c: c, count: 0 };
        g.count++;
      });
      const lista = Object.keys(ult).map(function (k) { return ult[k]; }).sort(function (x, y) { return y.count - x.count; });
      const top10 = lista.slice(0, 10);
      const topSet = {};
      top10.forEach(function (g) { topSet[g.c.n] = true; });
      barriosDestacadosLayer.clearLayers();
      lista.forEach(function (g) {
        if (topSet[g.c.n]) return;
        L.circleMarker([g.c.lat, g.c.lon], { radius: Math.min(4 + g.count * 2, 12), color: '#ffffff', weight: 1, fillColor: '#fdae61', fillOpacity: 0.85 })
          .bindPopup('<b>' + _escConsulta(g.c.dir) + '</b><br>Último punto con cámara en ' + g.count + ' recorrido(s)').addTo(barriosDestacadosLayer);
      });
      top10.forEach(function (g, i) {
        L.circleMarker([g.c.lat, g.c.lon], { radius: 12, color: '#ffffff', weight: 2, fillColor: '#d7191c', fillOpacity: 0.9 })
          .bindTooltip(String(i + 1), { permanent: true, direction: 'center', className: 'tooltip-top-esquina' })
          .bindPopup('<b>' + _escConsulta(g.c.dir) + '</b><br>Barrio: ' + _escConsulta(_barrioDeCamara(g.c)) + '<br>Último punto con cámara en ' + g.count + ' recorridos').addTo(barriosDestacadosLayer);
      });
      mymap.addLayer(barriosDestacadosLayer);
      mymap.fitBounds(barriosDestacadosLayer.getBounds());
      const porBarrio = {};
      lista.forEach(function (g) { const b = _barrioDeCamara(g.c); porBarrio[b] = (porBarrio[b] || 0) + g.count; });
      const barriosTop = Object.keys(porBarrio).map(function (k) { return [k, porBarrio[k]]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 5);
      resultadosDiv.innerHTML = '<h5>📍 Dónde se pierde el rastro de los vehículos robados' + (bf ? ' — Barrio: ' + _escConsulta(bf.properties.soc_fomen) : '') + '</h5>' +
        _cajaConsulta('<b>Recorridos analizados:</b> ' + rutas.length + ' (con 2 o más cámaras)<br><b>Cámaras distintas donde terminó el seguimiento:</b> ' + lista.length + '<br><b>Período:</b> ' + _periodoRoboTexto()) +
        '<h5 style="margin-top:14px;">Cámaras donde más recorridos terminan</h5>' +
        _tablaConsultaHTML(['Cámara (ubicación)', 'Barrio', 'Recorridos'], top10.map(function (g, i) { return [(i + 1) + '. ' + _escConsulta(g.c.dir), _escConsulta(_barrioDeCamara(g.c)), g.count]; })) +
        '<h5 style="margin-top:14px;">Barrios donde más termina el seguimiento</h5>' +
        _tablaConsultaHTML(['Barrio', 'Recorridos', '%'], barriosTop.map(function (b) { return [_escConsulta(b[0]), b[1], (b[1] * 100 / rutas.length).toFixed(0) + '%']; })) +
        '<p style="font-size:0.8em;color:#6c757d;margin-top:10px;">Es la última cámara que registró el vehículo: indica hasta dónde llegó el seguimiento y por dónde suele salir de la zona cubierta, no necesariamente dónde lo dejan. Los círculos rojos numerados son las 10 cámaras más repetidas; los naranjas, el resto.</p>';
      break;
    }

`;
function parchar(ruta, cambios) {
  let t = fs.readFileSync(ruta, 'utf8');
  const nl = t.includes('\r\n') ? '\r\n' : '\n';
  const fix = s => s.replace(/\r?\n/g, nl);
  console.log(ruta);
  // 1) validar todo antes de escribir
  for (const c of cambios) {
    if (t.includes(fix(c.ya))) { c.hecho = true; console.log('  ya aplicado: ' + c.n); continue; }
    const n = t.split(fix(c.a)).length - 1;
    if (n !== 1) { console.log('ERROR: "' + c.n + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  }
  for (const c of cambios) {
    if (c.hecho) continue;
    t = t.replace(fix(c.a), () => fix(c.nuevo));
    console.log('  ok: ' + c.n);
  }
  fs.writeFileSync(ruta, t, 'utf8');
}
parchar('public/script.js', [
  { n: 'tamaño de ventana', ya: "'robos_recorridos_fuga': 'medium'",
    a: "  'robos_sin_intervencion': 'medium',",
    nuevo: "  'robos_sin_intervencion': 'medium',\n  'robos_recorridos_fuga': 'medium',\n  'robos_ultima_camara': 'medium'," },
  { n: 'recalcular al cambiar el año', ya: "'robos_recorridos_fuga', 'robos_ultima_camara'].indexOf(c)",
    a: "'robos_sin_intervencion', 'correlacion_camaras_robos'].indexOf(c)",
    nuevo: "'robos_sin_intervencion', 'correlacion_camaras_robos', 'robos_recorridos_fuga', 'robos_ultima_camara'].indexOf(c)" },
  { n: 'funciones auxiliares', ya: 'function cargarRecorridosFuga',
    a: 'async function cargarEventosParaConsulta() {',
    nuevo: HELPERS + 'async function cargarEventosParaConsulta() {' },
  { n: 'las 2 consultas', ya: "case 'robos_recorridos_fuga'",
    a: "    case 'eventos_mes_a_mes': {",
    nuevo: CASOS + "    case 'eventos_mes_a_mes': {" }
]);
parchar('public/index.html', [
  { n: 'botones del menu', ya: 'data-consulta="robos_recorridos_fuga"',
    a: '        <button class="consulta-btn" data-consulta="esquinas_peligrosas_peatones_ciclistas">',
    nuevo: '        <details>\n          <summary>🚗 Robo automotor: recorridos y destinos</summary>\n          <button class="consulta-btn" data-consulta="robos_recorridos_fuga">🛣️ Recorridos de fuga de vehículos robados</button>\n          <button class="consulta-btn" data-consulta="robos_ultima_camara">📍 ¿Dónde se pierde el rastro del vehículo?</button>\n        </details>\n        <button class="consulta-btn" data-consulta="esquinas_peligrosas_peatones_ciclistas">' }
]);
// version del script para que el navegador no use la copia vieja
let h = fs.readFileSync('public/index.html', 'utf8');
const NUEVA = 'script.js?v=20261017002';
if (h.includes(NUEVA)) console.log('  version de script.js: ya actualizada');
else {
  const m = h.match(/script\.js\?v=\d+/g) || [];
  if (m.length !== 1) { console.log('AVISO: no pude actualizar la version de script.js (' + m.length + ' coincidencias). Usa Ctrl+F5 al probar.'); }
  else { h = h.replace(/script\.js\?v=\d+/, NUEVA); fs.writeFileSync('public/index.html', h, 'utf8'); console.log('  ok: version de script.js'); }
}
console.log('Listo. Abri el sitio con Ctrl+F5: Consultas > Analisis de Siniestros y Delitos > Robo automotor: recorridos y destinos.');
