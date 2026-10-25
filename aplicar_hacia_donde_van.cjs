// Consulta nueva: "¿Hacia dónde se van? (clic en el mapa)".
// Elegís un punto en el mapa + radio (o el barrio del punto) y muestra por dónde escaparon los casos reales de esa zona.
// Requiere haber aplicado antes aplicar_fuga_filtrada.cjs
// Uso (desde la carpeta del proyecto):  node aplicar_hacia_donde_van.cjs
const fs = require('fs');
for (const f of ['public/index.html', 'public/script.js']) {
  if (!fs.existsSync(f)) { console.log('NO ENCUENTRO ' + f + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
}
const HELPERS = String.raw`function _rumboFuga(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180, f1 = lat1 * rad, f2 = lat2 * rad, dl = (lon2 - lon1) * rad;
    const y = Math.sin(dl) * Math.cos(f2);
    const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return (Math.atan2(y, x) / rad + 360) % 360;
}

function _flechaFuga(a, b, color) {
    const pa = mymap.project(L.latLng(a.lat, a.lon), 15), pb = mymap.project(L.latLng(b.lat, b.lon), 15);
    const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI;
    const icon = L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10],
        html: '<svg width="20" height="20" viewBox="0 0 20 20" style="display:block;transform:rotate(' + ang.toFixed(0) + 'deg);"><path d="M2 3 L18 10 L2 17 L6 10 Z" fill="' + color + '" stroke="#ffffff" stroke-width="1.2"/></svg>' });
    return L.marker([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2], { icon: icon, interactive: false, keyboard: false });
}

function _chapaFuga(c, txt, bg) {
    const icon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
        html: '<div style="width:22px;height:22px;border-radius:50%;background:' + bg + ';color:#fff;border:2px solid #fff;font:bold 11px/18px Arial,sans-serif;text-align:center;box-shadow:0 0 3px rgba(0,0,0,.5);">' + txt + '</div>' });
    return L.marker([c.lat, c.lon], { icon: icon, keyboard: false, bubblingMouseEvents: false }).bindPopup('<b>' + _escConsulta(c.dir) + '</b><br>Cámara ' + c.n);
}

`;
const CASO = String.raw`    case 'robos_hacia_donde_van': {
      const prev = window.__fugaOpts || {};
      const O = window.__fugaOpts = { radio: prev.radio || 1000, modo: prev.modo || 'radio', todos: !!prev.todos, punto: null };
      const NOMBRES = ['Norte', 'Noreste', 'Este', 'Sudeste', 'Sur', 'Sudoeste', 'Oeste', 'Noroeste'];
      const COL = { hallazgo: '#7b3294', seguimiento: '#e66101', otro: '#6c757d' };
      const ETIQ = { hallazgo: 'Hallazgo automotor', seguimiento: 'Seguimiento del evento', otro: 'Interceptado (Asiste Policía y Libera, etc.)' };
      const th = 'padding:6px;border-bottom:2px solid #adb5bd;background:#f1f3f5;';
      const titulo = '<h5>🧭 ¿Hacia dónde se van? Casos parecidos al punto elegido</h5>';
      let sel = [], barrioPunto = null, seleccionada = null;

      function controles() {
        const radios = [500, 1000, 1500, 2000].map(function (m) {
          return '<option value="' + m + '"' + (O.radio === m ? ' selected' : '') + '>' + (m < 1000 ? m + ' m' : (m / 1000) + ' km') + '</option>';
        }).join('');
        return '<div style="background:#eef3fb;padding:10px;border-radius:5px;margin-bottom:12px;font-size:0.9em;line-height:2;">' +
          '<b>Zona de origen:</b> <select id="fuga-modo"><option value="radio"' + (O.modo === 'radio' ? ' selected' : '') + '>Radio alrededor del punto</option><option value="barrio"' + (O.modo === 'barrio' ? ' selected' : '') + '>Barrio del punto</option></select> ' +
          '<span' + (O.modo === 'barrio' ? ' style="display:none;"' : '') + '><b>Radio:</b> <select id="fuga-radio">' + radios + '</select></span><br>' +
          '<label><input type="checkbox" id="fuga-todos"' + (O.todos ? ' checked' : '') + '> Incluir casos interceptados por la policía (muestran por dónde arrancan, no dónde terminan)</label></div>';
      }
      function enlazarControles() {
        const m = resultadosDiv.querySelector('#fuga-modo'), r = resultadosDiv.querySelector('#fuga-radio'), t = resultadosDiv.querySelector('#fuga-todos');
        if (m) m.addEventListener('change', function () { O.modo = m.value; refrescar(); });
        if (r) r.addEventListener('change', function () { O.radio = parseInt(r.value, 10); refrescar(); });
        if (t) t.addEventListener('change', function () { O.todos = t.checked; refrescar(); });
      }
      function refrescar() { if (O.punto) calcular(); else mostrarInicio(); }
      function mostrarInicio() {
        resultadosDiv.innerHTML = titulo + controles() + _cajaConsulta('👆 <b>Hacé clic en el mapa</b> en el lugar donde ocurrió (o podría ocurrir) el robo. Después podés cambiar el radio o la zona sin volver a hacer clic, o hacer otro clic para mover el punto.');
        enlazarControles();
      }

      function pintar(ids, detalle) {
        const p = O.punto;
        barriosDestacadosLayer.clearLayers();
        if (O.modo === 'barrio' && barrioPunto) {
          L.geoJSON(barrioPunto, { style: { color: '#0a58ca', weight: 2, dashArray: '6,6', fillOpacity: 0.06 }, interactive: false }).addTo(barriosDestacadosLayer);
        } else {
          L.circle([p.lat, p.lon], { radius: O.radio, color: '#0a58ca', weight: 2, dashArray: '6,6', fillOpacity: 0.06, interactive: false }).addTo(barriosDestacadosLayer);
        }
        ids.forEach(function (i) {
          const r = sel[i], col = COL[r.tipo];
          const pts = [{ lat: r.evLat, lon: r.evLon }].concat(r.pts);
          const ll = pts.map(function (c) { return [c.lat, c.lon]; });
          L.polyline(ll, { color: '#ffffff', weight: detalle ? 8 : 5, opacity: 0.85, interactive: false }).addTo(barriosDestacadosLayer);
          L.polyline(ll, { color: col, weight: detalle ? 4 : 2.5, opacity: detalle ? 1 : (r.tipo === 'otro' ? 0.55 : 0.85), bubblingMouseEvents: false })
            .bindTooltip('<b>' + _escConsulta(ETIQ[r.tipo]) + '</b><br>Hecho: ' + _escConsulta(r.dir || 'sin dirección') + '<br>' + _escConsulta(r.fecha) + '<br>Hacia: ' + _escConsulta(r.dirTxt), { sticky: true })
            .on('click', function () { elegir(i); })
            .addTo(barriosDestacadosLayer);
          for (let k = 1; k < pts.length; k++) _flechaFuga(pts[k - 1], pts[k], col).addTo(barriosDestacadosLayer);
          L.circleMarker([r.evLat, r.evLon], { radius: detalle ? 7 : 4, color: '#ffffff', weight: 2, fillColor: '#1a9641', fillOpacity: 1, bubblingMouseEvents: false })
            .bindPopup('<b>Lugar del hecho</b><br>' + _escConsulta(r.dir || 'sin dirección') + '<br>' + _escConsulta(r.fecha)).addTo(barriosDestacadosLayer);
          const ult = r.pts[r.pts.length - 1];
          L.circleMarker([ult.lat, ult.lon], { radius: detalle ? 7 : 4, color: '#ffffff', weight: 2, fillColor: '#d7191c', fillOpacity: 1, bubblingMouseEvents: false })
            .bindPopup('<b>Última cámara</b><br>' + _escConsulta(ult.dir) + '<br>Barrio: ' + _escConsulta(_barrioDeCamara(ult))).addTo(barriosDestacadosLayer);
          if (detalle) r.pts.forEach(function (c, k) { _chapaFuga(c, String(k + 1), '#343a40').addTo(barriosDestacadosLayer); });
        });
        L.marker([p.lat, p.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 26], html: '<div style="font-size:26px;line-height:26px;">📍</div>' }) }).addTo(barriosDestacadosLayer);
        mymap.fitBounds(barriosDestacadosLayer.getBounds(), { padding: [40, 40], maxZoom: 16 });
      }
      function elegir(i) {
        resultadosDiv.querySelectorAll('[data-fuga-i]').forEach(function (f) { f.style.background = ''; });
        const aviso = resultadosDiv.querySelector('#fuga-aviso');
        if (i === null || i === seleccionada) {
          seleccionada = null;
          pintar(sel.map(function (x, k) { return k; }), false);
          if (aviso) aviso.innerHTML = 'Mostrando los ' + sel.length + ' casos. Tocá una fila (o una línea del mapa) para ver solo ese robo.';
          return;
        }
        seleccionada = i;
        const fila = resultadosDiv.querySelector('[data-fuga-i="' + i + '"]');
        if (fila) { fila.style.background = '#ffe3e3'; }
        pintar([i], true);
        if (aviso) aviso.innerHTML = 'Mostrando solo ese robo: verde = lugar del hecho, números = cámaras en orden, rojo = última cámara. Las flechas indican el sentido.';
      }

      async function calcular() {
        const p = O.punto;
        resultadosDiv.innerHTML = titulo + controles() + '<em>Calculando...</em>';
        enlazarControles();
        const rf = await cargarRecorridosFuga({ todos: O.todos, sinBarrio: true });
        const ll = L.latLng(p.lat, p.lon);
        barrioPunto = null;
        if (typeof barriosData !== 'undefined' && barriosData && barriosData.features) {
          for (let i = 0; i < barriosData.features.length; i++) {
            const b = barriosData.features[i];
            if (isLatLngInMultiPolygon(ll, b.geometry.coordinates)) { barrioPunto = b; break; }
          }
        }
        if (O.modo === 'barrio' && !barrioPunto) {
          barriosDestacadosLayer.clearLayers();
          resultadosDiv.innerHTML = titulo + controles() + _cajaConsulta('⚠️ El punto elegido no cae dentro de ningún barrio. Hacé otro clic o usá la zona por radio.');
          enlazarControles();
          return;
        }
        sel = [];
        rf.rutas.forEach(function (r) {
          if (!isFinite(r.evLat) || !isFinite(r.evLon)) return;
          const enZona = (O.modo === 'barrio')
            ? isLatLngInMultiPolygon(L.latLng(r.evLat, r.evLon), barrioPunto.geometry.coordinates)
            : (_distanciaMetrosFuga(p.lat, p.lon, r.evLat, r.evLon) <= O.radio);
          if (!enZona) return;
          const ult = r.pts[r.pts.length - 1];
          r.distFin = _distanciaMetrosFuga(r.evLat, r.evLon, ult.lat, ult.lon);
          r.dirTxt = r.distFin < 300 ? 'Quedó en la zona (menos de 300 m)' : NOMBRES[Math.round(_rumboFuga(r.evLat, r.evLon, ult.lat, ult.lon) / 45) % 8];
          sel.push(r);
        });
        sel.sort(function (a, b) { return b.distFin - a.distFin; });
        seleccionada = null;
        const zonaTxt = (O.modo === 'barrio') ? ('en el barrio ' + _escConsulta(barrioPunto.properties.soc_fomen)) : ('a menos de ' + (O.radio < 1000 ? O.radio + ' m' : (O.radio / 1000) + ' km') + ' del punto');
        const barrioTxt = barrioPunto ? ('<b>Barrio del punto:</b> ' + _escConsulta(barrioPunto.properties.soc_fomen) + '<br>') : '';
        if (!sel.length) {
          barriosDestacadosLayer.clearLayers();
          pintar([], false);
          mymap.addLayer(barriosDestacadosLayer);
          resultadosDiv.innerHTML = titulo + controles() + _cajaConsulta(barrioTxt + '<b>Casos con recorrido de cámaras ' + zonaTxt + ':</b> 0<br>No hay casos parecidos en esa zona. Probá con un radio mayor, con "Barrio del punto" o incluyendo los casos interceptados.');
          enlazarControles();
          return;
        }
        const nFuga = sel.filter(function (r) { return r.tipo !== 'otro'; }).length;
        const porDir = {};
        sel.forEach(function (r) { porDir[r.dirTxt] = (porDir[r.dirTxt] || 0) + 1; });
        const filasDir = Object.keys(porDir).map(function (k) { return { etiqueta: k, valor: porDir[k], extra: ' caso(s) (' + Math.round(porDir[k] * 100 / sel.length) + '%)' }; })
          .sort(function (a, b) { return b.valor - a.valor; });
        const porBarrio = {};
        sel.forEach(function (r) { const b = _barrioDeCamara(r.pts[r.pts.length - 1]); porBarrio[b] = (porBarrio[b] || 0) + 1; });
        const barriosTop = Object.keys(porBarrio).map(function (k) { return [k, porBarrio[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
        const porCam = {};
        sel.forEach(function (r) {
          const vistas = {};
          r.pts.forEach(function (c) { if (vistas[c.n]) return; vistas[c.n] = true; const g = porCam[c.n] = porCam[c.n] || { c: c, n: 0 }; g.n++; });
        });
        const camTop = Object.keys(porCam).map(function (k) { return porCam[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
        const medKm = _percentilConsulta(sel.map(function (r) { return r.distFin / 1000; }), 0.5);
        let aviso = '';
        if (sel.length < 5) aviso = '<br><span style="color:#b02a37;"><b>⚠️ Solo ' + sel.length + ' caso(s):</b> tomalo como orientativo, no como una probabilidad.</span>';
        else if (sel.length < 10) aviso = '<br><span style="color:#856404;">Pocos casos (' + sel.length + '): la tendencia es una pista, no una certeza.</span>';
        let filasCasos = '';
        sel.forEach(function (r, i) {
          filasCasos += '<tr data-fuga-i="' + i + '" style="cursor:pointer;"><td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:left;">' + _escConsulta(r.dir || 'sin dirección') + '<br><span style="color:#6c757d;font-size:0.9em;">' + _escConsulta(r.fecha) + '</span></td>' +
            '<td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:left;"><span style="color:' + COL[r.tipo] + ';font-weight:bold;">●</span> ' + _escConsulta(ETIQ[r.tipo]) + '</td>' +
            '<td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:left;">' + _escConsulta(r.dirTxt) + '</td>' +
            '<td style="padding:5px 6px;border-bottom:1px solid #dee2e6;text-align:right;">' + (r.distFin / 1000).toFixed(1) + ' km</td></tr>';
        });
        resultadosDiv.innerHTML = titulo + controles() +
          _cajaConsulta(barrioTxt + '<b>Casos con recorrido de cámaras ' + zonaTxt + ':</b> ' + sel.length + ' (' + nFuga + ' fugas' + (O.todos ? ' + ' + (sel.length - nFuga) + ' interceptados' : '') + ')<br><b>Distancia mediana desde el hecho hasta la última cámara:</b> ' + medKm.toFixed(1) + ' km<br><b>Período:</b> ' + _periodoRoboTexto() + aviso) +
          '<h5>Hacia dónde se fueron</h5>' + _barrasConsultaHTML(filasDir) +
          '<h5 style="margin-top:14px;">Barrios donde terminó el seguimiento</h5>' +
          _tablaConsultaHTML(['Barrio', 'Casos', '%'], barriosTop.map(function (b) { return [_escConsulta(b[0]), b[1], Math.round(b[1] * 100 / sel.length) + '%']; })) +
          '<h5 style="margin-top:14px;">Cámaras por donde más pasaron</h5>' +
          _tablaConsultaHTML(['Cámara (ubicación)', 'Casos'], camTop.map(function (g) { return [_escConsulta(g.c.dir), g.n]; })) +
          '<h5 style="margin-top:14px;">Casos</h5>' +
          '<div id="fuga-aviso" style="font-size:0.88em;color:#0a3d62;margin-bottom:8px;">Mostrando los ' + sel.length + ' casos. Tocá una fila (o una línea del mapa) para ver solo ese robo.</div>' +
          '<button id="fuga-ver-todos" style="font-size:0.85em;padding:4px 10px;margin-bottom:8px;cursor:pointer;">Ver todos en el mapa</button>' +
          '<div style="max-height:240px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.88em;"><thead><tr><th style="text-align:left;' + th + '">Hecho</th><th style="text-align:left;' + th + '">Resultado</th><th style="text-align:left;' + th + '">Hacia</th><th style="text-align:right;' + th + '">Dist.</th></tr></thead><tbody>' + filasCasos + '</tbody></table></div>' +
          '<p style="font-size:0.8em;color:#6c757d;margin-top:10px;">La dirección sale de unir el lugar del hecho con la última cámara que vio al vehículo (en línea recta, no por las calles). Si el recorrido termina porque la policía lo interceptó, indica por dónde arrancó la fuga, no su destino. Solo hay recorridos desde 2025.</p>';
        enlazarControles();
        resultadosDiv.querySelectorAll('[data-fuga-i]').forEach(function (tr) {
          tr.addEventListener('click', function () { elegir(parseInt(tr.getAttribute('data-fuga-i'), 10)); });
        });
        const bt = resultadosDiv.querySelector('#fuga-ver-todos');
        if (bt) bt.addEventListener('click', function () { elegir(null); });
        pintar(sel.map(function (x, k) { return k; }), false);
        mymap.addLayer(barriosDestacadosLayer);
      }

      if (window.__fugaClick) mymap.off('click', window.__fugaClick);
      window.__fugaClick = function (ev) {
        const panel = document.getElementById('consulta-results-panel');
        if (window.__ultimaConsulta !== 'robos_hacia_donde_van' || !panel || panel.style.display === 'none') {
          mymap.off('click', window.__fugaClick);
          window.__fugaClick = null;
          mymap.getContainer().style.cursor = '';
          return;
        }
        O.punto = { lat: ev.latlng.lat, lon: ev.latlng.lng };
        calcular();
      };
      barriosDestacadosLayer.clearLayers();
      mymap.addLayer(barriosDestacadosLayer);
      mymap.on('click', window.__fugaClick);
      mymap.getContainer().style.cursor = 'crosshair';
      mostrarInicio();
      break;
    }

`;

let t = fs.readFileSync('public/script.js', 'utf8');
const nl = t.includes('\r\n') ? '\r\n' : '\n';
const fix = s => s.replace(/\r?\n/g, nl);
if (!t.includes('const COLOR = { hallazgo:')) { console.log('ERROR: primero hay que aplicar aplicar_fuga_filtrada.cjs. No se toco nada.'); process.exit(1); }
let h = fs.readFileSync('public/index.html', 'utf8');
const nlh = h.includes('\r\n') ? '\r\n' : '\n';

const pend = [];
function plan(nombre, ya, antes, despues) {
  if (t.includes(ya)) { console.log('  ya aplicado: ' + nombre); return; }
  const a = fix(antes), n = t.split(a).length - 1;
  if (n !== 1) { console.log('ERROR: "' + nombre + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  pend.push({ nombre: nombre, a: a, b: fix(despues) });
}
plan('funciones auxiliares y opciones de la carga', 'function _rumboFuga',
  'async function cargarRecorridosFuga() {',
  HELPERS + 'async function cargarRecorridosFuga(opts) {');
plan('ignorar filtro de barrio si se pide', 'opts && opts.sinBarrio',
  "    const bf = getSelectedBarrioFeatureCombinada();\n    const rutas = [];",
  "    const bf = (opts && opts.sinBarrio) ? null : getSelectedBarrioFeatureCombinada();\n    const rutas = [];");
plan('incluir interceptados si se pide', "tipo: tipo || 'otro'",
  "        if (!tipo) { excluidas++; return; }\n        rutas.push({ tipo: tipo,",
  "        if (!tipo && !(opts && opts.todos)) { excluidas++; return; }\n        rutas.push({ tipo: tipo || 'otro',");
plan('tamaño de ventana', "'robos_hacia_donde_van': 'medium'",
  "  'robos_ultima_camara': 'medium',",
  "  'robos_ultima_camara': 'medium',\n  'robos_hacia_donde_van': 'medium',");
plan('la consulta', "case 'robos_hacia_donde_van'",
  "    case 'robos_ultima_camara': {",
  CASO + "    case 'robos_ultima_camara': {");

// boton del menu: se inserta una linea nueva despues del boton de "robos_ultima_camara"
let hNuevo = h, hHecho = h.includes('data-consulta="robos_hacia_donde_van"');
if (hHecho) console.log('  ya aplicado: boton del menu');
else {
  const lineas = h.split(/\r?\n/);
  const idx = [];
  lineas.forEach((l, i) => { if (l.includes('data-consulta="robos_ultima_camara"')) idx.push(i); });
  if (idx.length !== 1) { console.log('ERROR: boton "robos_ultima_camara" aparece ' + idx.length + ' veces en index.html. No se toco nada.'); process.exit(1); }
  const sangria = /^\s*/.exec(lineas[idx[0]])[0];
  lineas.splice(idx[0] + 1, 0, sangria + '<button class="consulta-btn" data-consulta="robos_hacia_donde_van">🧭 ¿Hacia dónde se van? (clic en el mapa)</button>');
  hNuevo = lineas.join(nlh);
}

// todo validado: recien ahora se escribe
for (const p of pend) { t = t.replace(p.a, () => p.b); console.log('  ok: ' + p.nombre); }
fs.writeFileSync('public/script.js', t, 'utf8');
if (!hHecho) { console.log('  ok: boton del menu'); }
const VER = 'script.js?v=20261017006';
if (!hNuevo.includes(VER)) {
  const m = hNuevo.match(/script\.js\?v=\d+/g) || [];
  if (m.length === 1) { hNuevo = hNuevo.replace(/script\.js\?v=\d+/, VER); console.log('  ok: version de script.js'); }
  else console.log('AVISO: no pude actualizar la version de script.js (' + m.length + ' coincidencias). Usa Ctrl+F5 al probar.');
}
fs.writeFileSync('public/index.html', hNuevo, 'utf8');
console.log('Listo. Abri el sitio con Ctrl+F5: Consultas > Robo automotor: recorridos y destinos > ¿Hacia dónde se van?');
