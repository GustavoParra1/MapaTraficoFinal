// Capa "Zonas con mas hallazgos" en public/js/hallazgos-layer.js:
//  - casilla nueva con calor fuerte (amarillo a rojo) sobre todo el mapa, sin hacer clic punto por punto
//  - ranking de las 10 zonas con mas hallazgos (circulos numerados); tocar una abre el cuadro "Zona analizada"
//  - respeta los filtros de tipo, año, mes y barrio de la capa de hallazgos
// Uso (desde la carpeta del proyecto):  node aplicar_zonas_calientes.cjs
const fs = require('fs');
const RUTA = 'public/js/hallazgos-layer.js';
if (!fs.existsSync(RUTA)) { console.log('NO ENCUENTRO ' + RUTA + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
let t = fs.readFileSync(RUTA, 'utf8');
const nl = t.includes('\r\n') ? '\r\n' : '\n';
const fix = x => x.replace(/\r?\n/g, nl);
const FUNCIONES = fix(String.raw`  /* ---------- zonas con mas hallazgos: calor fuerte + ranking (sin hacer clic punto por punto) ---------- */
  var calCapa = null, calCalor = null, calZonas = [];
  var CAL_MIN = 3, CAL_MAX_ZONAS = 10;

  function metrosEntre(lat1, lon1, lat2, lon2) {
    var k = 111320;
    var dx = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    var dy = (lat2 - lat1) * k;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function direccionTipica(pts) {
    var m = {}, mejor = '', n = 0;
    pts.forEach(function (d) {
      var k = String(d['Direccion 0'] || '').trim();
      if (!k) return;
      m[k] = (m[k] || 0) + 1;
      if (m[k] > n) { n = m[k]; mejor = k; }
    });
    return mejor;
  }

  /* Busca las zonas (circulos de "radio" metros) con mas hallazgos, sin que se superpongan entre si */
  function calcularZonasCalientes(lista, radio) {
    var cands = lista.map(function (c) {
      var dentro = lista.filter(function (d) { return metrosEntre(c._lat, c._lon, d._lat, d._lon) <= radio; });
      var la = 0, lo = 0;
      dentro.forEach(function (d) { la += d._lat; lo += d._lon; });
      var lat = la / dentro.length, lon = lo / dentro.length;       // se centra la zona en el medio de sus casos
      var n = lista.filter(function (d) { return metrosEntre(lat, lon, d._lat, d._lon) <= radio; }).length;
      return { lat: lat, lon: lon, n: n };
    });
    cands.sort(function (a, b) { return b.n - a.n; });
    var elegidas = [];
    for (var i = 0; i < cands.length && elegidas.length < CAL_MAX_ZONAS; i++) {
      var c = cands[i];
      if (c.n < CAL_MIN) break;
      var libre = elegidas.every(function (z) { return metrosEntre(z.lat, z.lon, c.lat, c.lon) >= radio * 2; });
      if (libre) elegidas.push(c);
    }
    elegidas.forEach(function (z) {
      var pts = lista.filter(function (d) { return metrosEntre(z.lat, z.lon, d._lat, d._lon) <= radio; });
      z.tipos = { H: 0, L: 0, S: 0 };
      pts.forEach(function (d) { z.tipos[d._tipo]++; });
      z.dir = direccionTipica(pts) || ('Zona ' + z.lat.toFixed(4) + ', ' + z.lon.toFixed(4));
    });
    return elegidas;
  }

  function colorZona(n, nMax) {
    var f = nMax ? n / nMax : 0;
    return f >= 0.75 ? '#c1121f' : (f >= 0.5 ? '#e85d04' : '#d4a017');
  }

  function limpiarCalientes() {
    var mapa = window.mymap;
    if (mapa && calCapa) mapa.removeLayer(calCapa);
    if (mapa && calCalor) mapa.removeLayer(calCalor);
    calCapa = null; calCalor = null; calZonas = [];
    var l = $('hallayer-cal-lista'); if (l) l.innerHTML = '';
  }

  function actualizarCalientes() {
    var mapa = window.mymap, cb = $('hallayer-calientes');
    if (!cb) return;
    limpiarCalientes();
    var opc = $('hallayer-cal-opc'); if (opc) opc.style.display = cb.checked ? 'block' : 'none';
    if (!cb.checked || !mapa || !datos) return;
    var radio = parseInt($('hallayer-cal-radio').value, 10) || 500;
    var lista = filtrados();
    var zonas = calcularZonasCalientes(lista, radio);
    calZonas = zonas;
    var nMax = zonas.length ? zonas[0].n : 0;
    calCapa = L.layerGroup();
    if (L.heatLayer && lista.length) {
      try {
        calCalor = L.heatLayer(lista.map(function (d) { return [d._lat, d._lon]; }), {
          radius: 30, blur: 22, minOpacity: 0.3, max: Math.max(3, Math.round(nMax * 0.6)),
          gradient: { 0.25: '#ffe066', 0.5: '#fcbf49', 0.75: '#f77f00', 1.0: '#d00000' }
        });
        calCalor.addTo(mapa);
      } catch (e) { console.error('Hallazgos: calor de zonas', e); calCalor = null; }
    }
    zonas.forEach(function (z, i) {
      var col = colorZona(z.n, nMax);
      var c = L.circle([z.lat, z.lon], { radius: radio, color: col, weight: 2.5, fillColor: col, fillOpacity: 0.16, bubblingMouseEvents: false });
      c.bindTooltip('<b>' + (i + 1) + '. ' + esc(z.dir) + '</b><br>' + z.n + ' hallazgos en ' + radio + ' m', { sticky: true });
      c.on('click', function () { mostrarZona(L.latLng(z.lat, z.lon), radio); });
      c.addTo(calCapa);
      L.marker([z.lat, z.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13],
        html: '<div style="width:26px;height:26px;border-radius:50%;background:' + col + ';color:#fff;border:2px solid #fff;font:bold 13px/22px Arial,sans-serif;text-align:center;box-shadow:0 0 4px rgba(0,0,0,.55);">' + (i + 1) + '</div>' }) }).addTo(calCapa);
    });
    calCapa.addTo(mapa);

    var l = $('hallayer-cal-lista');
    if (!l) return;
    if (!zonas.length) {
      l.innerHTML = '<div style="margin-top:6px;font-size:12px;">No hay zonas de ' + radio + ' m con ' + CAL_MIN + ' o más hallazgos con estos filtros. Probá con una zona más grande o con más tipos tildados.</div>';
      return;
    }
    l.innerHTML = '<div style="margin-top:6px;font-weight:600;">Las ' + zonas.length + ' zonas con más hallazgos</div>' +
      zonas.map(function (z, i) {
        return '<div class="hallayer-zona-item" data-i="' + i + '" style="cursor:pointer;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.18);line-height:1.25;">' +
               (i + 1) + '. <b>' + esc(z.dir) + '</b> <span style="opacity:.85;">(' + z.n + ')</span></div>';
      }).join('') +
      '<div style="font-size:11px;opacity:.75;margin-top:4px;">Zonas de ' + radio + ' m con ' + CAL_MIN + ' o más hallazgos, sin superponerse. Tocá una para acercarte y ver también cuántos robos hubo ahí.</div>';
    Array.prototype.forEach.call(l.querySelectorAll('.hallayer-zona-item'), function (el) {
      el.addEventListener('click', function () {
        var z = calZonas[parseInt(el.getAttribute('data-i'), 10)];
        if (!z) return;
        var ll = L.latLng(z.lat, z.lon);
        mapa.fitBounds(ll.toBounds(radio * 2.6));
        mostrarZona(ll, radio);
      });
    });
  }

`);
const ya = () => t.includes('function actualizarCalientes');

// ---- se valida todo antes de escribir ----
const cambios = [];
function reemplazo(nombre, yaEsta, antes, despues) {
  if (yaEsta) { console.log('  ya aplicado: ' + nombre); return; }
  const a = fix(antes), n = t.split(a).length - 1;
  if (n !== 1) { console.log('ERROR: "' + nombre + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  cambios.push({ nombre, a, b: fix(despues) });
}
function insertarLinea(nombre, yaEsta, marca, antesDe, nuevaLinea) {
  if (yaEsta) { console.log('  ya aplicado: ' + nombre); return; }
  const lineas = t.split(/\r?\n/), idx = [];
  lineas.forEach((l, i) => { if (l.includes(marca)) idx.push(i); });
  if (idx.length !== 1) { console.log('ERROR: "' + nombre + '" - la marca aparece ' + idx.length + ' veces. No se toco nada.'); process.exit(1); }
  cambios.push({ nombre, linea: idx[0], nueva: nuevaLinea, antesDe });
}

const yaHecho = ya();
reemplazo('funciones de zonas calientes', yaHecho,
  '  var botonAyuda = null;',
  FUNCIONES.replace(/\r?\n$/, '') + nl + nl + '  var botonAyuda = null;');
reemplazo('mostrarZona con radio opcional', t.includes('function mostrarZona(ll, radioForzado)'),
  'function mostrarZona(ll) {', 'function mostrarZona(ll, radioForzado) {');
reemplazo('radio forzado en el cuadro de zona', t.includes('radioForzado || parseInt'),
  "var radio = parseInt($('hallayer-radio').value, 10) || 500;\n    var r = contarZona(ll, radio);",
  "var radio = radioForzado || parseInt($('hallayer-radio').value, 10) || 500;\n    var r = contarZona(ll, radio);");
reemplazo('actualizar al cambiar filtros', t.includes('    actualizarCalientes();'),
  "      catch (e) { console.error('Hallazgos: mapa de calor', e); }\n    }\n",
  "      catch (e) { console.error('Hallazgos: mapa de calor', e); }\n    }\n    actualizarCalientes();\n");
reemplazo('limpiar al apagar la capa', t.includes('limpiarCalientes(); var cc'),
  "    var cz = $('hallayer-zona'); if (cz && cz.checked) { cz.checked = false; activarZona(false); }",
  "    var cz = $('hallayer-zona'); if (cz && cz.checked) { cz.checked = false; activarZona(false); }\n    limpiarCalientes(); var cc = $('hallayer-calientes'); if (cc) cc.checked = false;\n    var oc = $('hallayer-cal-opc'); if (oc) oc.style.display = 'none';\n    if (window.mymap && zonaCirculo) { window.mymap.removeLayer(zonaCirculo); zonaCirculo = null; }");
reemplazo('eventos de la casilla nueva', t.includes("$('hallayer-calientes').addEventListener"),
  "    $('hallayer-calor').addEventListener('change', function (e) {",
  "    if ($('hallayer-calientes')) {\n      $('hallayer-calientes').addEventListener('change', actualizarCalientes);\n      $('hallayer-cal-radio').addEventListener('change', actualizarCalientes);\n    }\n    $('hallayer-calor').addEventListener('change', function (e) {");
insertarLinea('casilla en el panel', t.includes('id="hallayer-calientes"'),
  'id="hallayer-zona"> Analizar una zona', true,
  "      '<label style=\"display:flex;align-items:center;gap:6px;margin-top:4px;\"><input type=\"checkbox\" id=\"hallayer-calientes\"> Zonas con más hallazgos</label>' +\n" +
  "      '<div id=\"hallayer-cal-opc\" style=\"display:none;margin:4px 0 0 24px;\">Tamaño de zona: ' +\n" +
  "        '<select id=\"hallayer-cal-radio\"><option value=\"300\">300 m</option><option value=\"500\" selected>500 m</option><option value=\"1000\">1000 m</option></select>' +\n" +
  "        '<div id=\"hallayer-cal-lista\" style=\"font-size:12px;max-height:230px;overflow-y:auto;\"></div></div>' +");
insertarLinea('texto de ayuda', t.includes('Zonas con más hallazgos</b>'),
  'tildá <b>Analizar una zona</b>', true,
  "      '<p>Con <b>Zonas con más hallazgos</b> el mapa se colorea en amarillo, naranja y rojo según dónde se juntan más hallazgos, y se numeran las 10 zonas con más casos. Respeta los tipos, el año y el mes elegidos. Los colores son relativos: marcan las zonas donde hay más hallazgos que en el resto, aunque en números absolutos sean pocos casos.</p>' +");

// ---- aplicar ----
cambios.filter(c => c.a).forEach(c => { t = t.replace(c.a, () => c.b); console.log('  ok: ' + c.nombre); });
const ins = cambios.filter(c => c.nueva);
if (ins.length) {
  const lineas = t.split(/\r?\n/);
  ins.forEach(c => {
    const i = lineas.findIndex(l => l.includes(c.nombre === 'casilla en el panel' ? 'id="hallayer-zona"> Analizar una zona' : 'tildá <b>Analizar una zona</b>'));
    lineas.splice(i, 0, ...c.nueva.replace(/\n$/, '').split('\n'));
    console.log('  ok: ' + c.nombre);
  });
  t = lineas.join(nl);
}
fs.writeFileSync(RUTA, t, 'utf8');

// version del script en las paginas que lo cargan (si tiene ?v=)
const VER = '20261025';
['public/index.html', 'public/movil.html', 'public/operador-interface.html'].forEach(f => {
  if (!fs.existsSync(f)) return;
  let h = fs.readFileSync(f, 'utf8');
  const m = h.match(/hallazgos-layer\.js\?v=[\w.-]+/g) || [];
  if (m.length === 1 && !h.includes('hallazgos-layer.js?v=' + VER)) { h = h.replace(/hallazgos-layer\.js\?v=[\w.-]+/, 'hallazgos-layer.js?v=' + VER); fs.writeFileSync(f, h, 'utf8'); console.log('  ok: version en ' + f); }
});
console.log('Listo. Abri el sitio con Ctrl+F5, tilda "Hallazgos de vehiculos" y despues "Zonas con mas hallazgos".');
