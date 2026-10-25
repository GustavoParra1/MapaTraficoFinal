// "¿Hacia dónde se van?": usa SOLO los recorridos de fuga (Hallazgo Automotor + Seguimiento del Evento).
// Saca la casilla de "incluir interceptados".
// Requiere haber aplicado antes aplicar_hacia_donde_van.cjs
// Uso (desde la carpeta del proyecto):  node aplicar_solo_fugas.cjs
const fs = require('fs');
const RUTA = 'public/script.js';
if (!fs.existsSync(RUTA)) { console.log('NO ENCUENTRO ' + RUTA + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
let t = fs.readFileSync(RUTA, 'utf8');
const nl = t.includes('\r\n') ? '\r\n' : '\n';
const fix = s => s.replace(/\r?\n/g, nl);
if (!t.includes("case 'robos_hacia_donde_van'")) { console.log('ERROR: primero hay que aplicar aplicar_hacia_donde_van.cjs. No se toco nada.'); process.exit(1); }
const pend = [];
function plan(nombre, ya, antes, despues) {
  if (t.includes(ya)) { console.log('  ya aplicado: ' + nombre); return; }
  const a = fix(antes), n = t.split(a).length - 1;
  if (n !== 1) { console.log('ERROR: "' + nombre + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  pend.push({ nombre: nombre, a: a, b: despues });
}
// casilla: se busca con expresion regular (una sola vez)
const reCasilla = /<br>' \+\r?\n\s*'<label><input type="checkbox" id="fuga-todos"[^\r\n]*<\/label><\/div>';/;
if (reCasilla.test(t)) { pend.push({ nombre: 'sacar la casilla de interceptados', re: reCasilla, b: "</div>';" }); }
else if (t.includes('id="fuga-todos"')) { console.log('ERROR: no encuentro la casilla con el formato esperado. No se toco nada.'); process.exit(1); }
else console.log('  ya aplicado: sacar la casilla de interceptados');
plan('solo fugas', 'todos: false, punto: null', 'todos: !!prev.todos, punto: null', 'todos: false, punto: null');
plan('mensaje sin casos', 'con "Barrio del punto".\');', ' Probá con un radio mayor, con "Barrio del punto" o incluyendo los casos interceptados.', ' Probá con un radio mayor o con "Barrio del punto".');
plan('nota al pie', t.includes(' Si el recorrido termina porque la policía lo interceptó') ? '__pendiente__' : t, ' Si el recorrido termina porque la policía lo interceptó, indica por dónde arrancó la fuga, no su destino.', '');
for (const p of pend) { if (p.re) t = t.replace(p.re, () => p.b); else t = t.replace(p.a, () => fix(p.b)); console.log('  ok: ' + p.nombre); }
fs.writeFileSync(RUTA, t, 'utf8');
const H = 'public/index.html';
if (fs.existsSync(H)) {
  let h = fs.readFileSync(H, 'utf8');
  const m = h.match(/script\.js\?v=\d+/g) || [];
  if (m.length === 1 && !h.includes('script.js?v=20261017007')) { h = h.replace(/script\.js\?v=\d+/, 'script.js?v=20261017007'); fs.writeFileSync(H, h, 'utf8'); console.log('  ok: version de script.js'); }
  else console.log('  version de script.js: sin cambios (' + m.length + ' coincidencias)');
}
console.log('Listo. Probalo con Ctrl+F5.');
