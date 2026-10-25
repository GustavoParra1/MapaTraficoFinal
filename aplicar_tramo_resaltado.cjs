// Consulta "Recorridos de fuga": al elegir un TRAMO, el tramo se dibuja grueso con cartel "Tramo #N"
// (puntos A y B) y los robos quedan mas finos; el aviso aclara que son varios robos distintos.
// Requiere haber aplicado antes aplicar_fuga_filtrada.cjs
// Uso (desde la carpeta del proyecto):  node aplicar_tramo_resaltado.cjs
const fs = require('fs');
const RUTA = 'public/script.js';
if (!fs.existsSync(RUTA)) { console.log('NO ENCUENTRO ' + RUTA + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
let t = fs.readFileSync(RUTA, 'utf8');
const nl = t.includes('\r\n') ? '\r\n' : '\n';
const fix = s => s.replace(/\r?\n/g, nl);
if (!t.includes('const COLOR = { hallazgo:')) { console.log('ERROR: primero hay que aplicar aplicar_fuga_filtrada.cjs. No se toco nada.'); process.exit(1); }
const cuenta = s => t.split(s).length - 1;
function reemplazar(nombre, ya, antes, despues) {
  if (t.includes(ya)) { console.log('  ya aplicado: ' + nombre); return; }
  const a = fix(antes), n = cuenta(a);
  if (n !== 1) { console.log('ERROR: "' + nombre + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  t = t.replace(a, () => fix(despues));
  console.log('  ok: ' + nombre);
}

reemplazar('firma de pintarSeleccion', 'function pintarSeleccion(ids, detalle, tramo, nTramo)',
  "function pintarSeleccion(ids, detalle) {",
  "function pintarSeleccion(ids, detalle, tramo, nTramo) {");

reemplazar('robos mas finos en modo tramo', 'weight: tramo ? 5 : 8',
  "L.polyline(ll, { color: '#ffffff', weight: 8, opacity: 0.9 }).addTo(barriosDestacadosLayer);",
  "L.polyline(ll, { color: '#ffffff', weight: tramo ? 5 : 8, opacity: 0.9 }).addTo(barriosDestacadosLayer);");
reemplazar('linea del robo en modo tramo', 'weight: tramo ? 3 : 4',
  "L.polyline(ll, { color: col, weight: 4, opacity: 1 })",
  "L.polyline(ll, { color: col, weight: tramo ? 3 : 4, opacity: tramo ? 0.8 : 1 })");

reemplazar('dibujo del tramo resaltado', 'fuga-tramo-etiqueta',
  "        mymap.fitBounds(barriosDestacadosLayer.getBounds(), { padding: [40, 40], maxZoom: 16 });",
  [
"        if (tramo) {",
"          const tl = [[tramo.a.lat, tramo.a.lon], [tramo.b.lat, tramo.b.lon]];",
"          L.polyline(tl, { color: '#ffffff', weight: 13, opacity: 1 }).addTo(barriosDestacadosLayer);",
"          L.polyline(tl, { color: '#7f0000', weight: 7, opacity: 1 })",
"            .bindPopup('<b>Tramo #' + nTramo + '</b><br>' + _escConsulta(tramo.a.dir) + ' ↔ ' + _escConsulta(tramo.b.dir) + '<br>' + ids.length + ' robos pasaron por acá').addTo(barriosDestacadosLayer);",
"          chapa(tramo.a, 'A', '#7f0000').addTo(barriosDestacadosLayer);",
"          chapa(tramo.b, 'B', '#7f0000').addTo(barriosDestacadosLayer);",
"          L.marker([(tramo.a.lat + tramo.b.lat) / 2, (tramo.a.lon + tramo.b.lon) / 2], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'fuga-tramo-etiqueta', iconSize: [0, 0],",
"            html: '<div style=\"transform:translate(-50%,-165%);white-space:nowrap;background:#7f0000;color:#fff;font:bold 12px Arial,sans-serif;padding:3px 8px;border-radius:10px;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5);display:inline-block;\">Tramo #' + nTramo + ' (' + ids.length + ' robos)</div>' }) }).addTo(barriosDestacadosLayer);",
"        }",
"        mymap.fitBounds(barriosDestacadosLayer.getBounds(), { padding: [40, 40], maxZoom: 16 });"
  ].join('\n'));

reemplazar('llamada con datos del tramo', 'pintarSeleccion(top[i].ids, false, top[i], i + 1)',
  "pintarSeleccion(top[i].ids, false);",
  "pintarSeleccion(top[i].ids, false, top[i], i + 1);");

reemplazar('aviso del tramo', 'robos distintos</b>',
  "'Mostrando los ' + top[i].ids.length + ' recorridos que pasaron por el tramo #' + (i + 1) + '. Las flechas indican el sentido.'",
  "'<b>Estás viendo ' + top[i].ids.length + ' robos distintos</b> que pasaron por el tramo #' + (i + 1) + ' (línea gruesa roja oscura entre A y B). Cada línea naranja o violeta es un vehículo robado diferente y cada punto verde es el lugar de su hecho. Para ver un solo robo, elegilo en la lista \"Recorridos\".'");

fs.writeFileSync(RUTA, t, 'utf8');
const H = 'public/index.html';
if (fs.existsSync(H)) {
  let h = fs.readFileSync(H, 'utf8');
  const m = h.match(/script\.js\?v=\d+/g) || [];
  if (m.length === 1 && !h.includes('script.js?v=20261017005')) { h = h.replace(/script\.js\?v=\d+/, 'script.js?v=20261017005'); fs.writeFileSync(H, h, 'utf8'); console.log('  ok: version de script.js'); }
  else console.log('  version de script.js: sin cambios (' + m.length + ' coincidencias)');
}
console.log('Listo. Probalo con Ctrl+F5.');
