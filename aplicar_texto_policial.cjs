// Mejora el texto del bloque "Respuesta policial" (cuantos casos y que porcentaje).
// Uso (desde la carpeta del proyecto):  node aplicar_texto_policial.cjs
const fs = require('fs');
const RUTA = 'public/index.html';
if (!fs.existsSync(RUTA)) { console.log('NO ENCUENTRO ' + RUTA + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
let t = fs.readFileSync(RUTA, 'utf8');
const cambios = [
  { n: 'franja horaria', ya: "' casos (' + Math.round(s.nFranja / s.nHora * 100)",
    a: "peq(s.nFranja + ' de ' + s.nHora + ' con hora')",
    nuevo: "peq(s.nFranja + ' casos (' + Math.round(s.nFranja / s.nHora * 100) + '% de los ' + s.nHora + ' con hora)')" },
  { n: 'arribo', ya: "peq('calculado con '",
    a: "peq(s.nArribo + ' de ' + s.total + ' casos')",
    nuevo: "peq('calculado con ' + s.nArribo + ' de ' + s.total + ' casos')" },
  { n: 'resultado', ya: "peq(s.nResultado + ' casos (' + s.pctResultado + '%)')",
    a: "peq(s.pctResultado + '% (' + s.nResultado + ')')",
    nuevo: "peq(s.nResultado + ' casos (' + s.pctResultado + '%)')" }
];
for (const c of cambios) {
  if (t.includes(c.ya)) { console.log('  ya aplicado: ' + c.n); continue; }
  const n = t.split(c.a).length - 1;
  if (n !== 1) { console.log('ERROR: "' + c.n + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  t = t.replace(c.a, () => c.nuevo);
  console.log('  ok: ' + c.n);
}
fs.writeFileSync(RUTA, t, 'utf8');
console.log('Listo. Probalo con Ctrl+F5 en el informe de un barrio.');
