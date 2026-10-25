// Arreglo: las consultas de recorridos usan su propia funcion de distancia
// (calcularDistancia no esta disponible desde ahi).
// Uso (desde la carpeta del proyecto):  node aplicar_arreglo_distancia.cjs
const fs = require('fs');
const RUTA = 'public/script.js';
if (!fs.existsSync(RUTA)) { console.log('NO ENCUENTRO ' + RUTA + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
let t = fs.readFileSync(RUTA, 'utf8');
const nl = t.includes('\r\n') ? '\r\n' : '\n';
const fix = s => s.replace(/\r?\n/g, nl);
const cambios = [
  { n: 'funcion de distancia propia', ya: 'function _distanciaMetrosFuga',
    a: 'function _camarasPorNumero() {',
    nuevo: [
      'function _distanciaMetrosFuga(lat1, lon1, lat2, lon2) {',
      '    const R = 6371000, rad = Math.PI / 180;',
      '    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;',
      '    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);',
      '    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));',
      '}',
      '',
      'function _camarasPorNumero() {'].join('\n') },
  { n: 'uso de la funcion propia', ya: 'km += _distanciaMetrosFuga(',
    a: 'km += calcularDistancia(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon) / 1000;',
    nuevo: 'km += _distanciaMetrosFuga(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon) / 1000;' }
];
for (const c of cambios) {
  if (t.includes(c.ya)) { console.log('  ya aplicado: ' + c.n); continue; }
  const a = fix(c.a);
  const n = t.split(a).length - 1;
  if (n !== 1) { console.log('ERROR: "' + c.n + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  t = t.replace(a, () => fix(c.nuevo));
  console.log('  ok: ' + c.n);
}
fs.writeFileSync(RUTA, t, 'utf8');
// version del script en index.html para que el navegador no use la copia vieja
const H = 'public/index.html';
if (fs.existsSync(H)) {
  let h = fs.readFileSync(H, 'utf8');
  const m = h.match(/script\.js\?v=\d+/g) || [];
  if (m.length === 1 && !h.includes('script.js?v=20261017003')) { h = h.replace(/script\.js\?v=\d+/, 'script.js?v=20261017003'); fs.writeFileSync(H, h, 'utf8'); console.log('  ok: version de script.js'); }
  else console.log('  version de script.js: sin cambios (' + m.length + ' coincidencias)');
}
console.log('Listo. Probalo con Ctrl+F5.');
