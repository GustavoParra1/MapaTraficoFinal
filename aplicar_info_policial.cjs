// Informe por barrio / cruce: aclara los periodos de Robos automotor y Eventos
// y agrega el bloque "Respuesta policial" (arribo, franja horaria, resultado).
// Uso (desde la carpeta del proyecto):  node aplicar_info_policial.cjs
const fs = require('fs');
const RUTA = 'public/index.html';
if (!fs.existsSync(RUTA)) { console.log('NO ENCUENTRO ' + RUTA + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
let t = fs.readFileSync(RUTA, 'utf8');
const nl = t.includes('\r\n') ? '\r\n' : '\n';
const fix = s => s.replace(/\r?\n/g, nl);

const HELPERS = `  // ---------- Respuesta policial (eventos + robo automotor) ----------
  function _periodosFuentes() {
    const rango = (arr) => {
      const ys = (arr || []).map(r => parseInt(r['año'], 10)).filter(y => !isNaN(y));
      if (!ys.length) return '';
      const a = Math.min(...ys), b = Math.max(...ys);
      return a === b ? String(a) : a + '–' + b;
    };
    const ev = (window.EventosLayer && window.EventosLayer.datos && window.EventosLayer.datos()) || [];
    return { robos: rango(typeof allRoboAutomotorData !== 'undefined' ? allRoboAutomotorData : []) || 's/d', eventos: rango(ev) || 's/d' };
  }
  function _statsPolicial(lista) {
    const total = lista.length;
    const arr = lista.map(e => parseFloat(e['min_arribo'])).filter(v => !isNaN(v) && v >= 0).sort((a, b) => a - b);
    let arribo = null;
    if (arr.length) { const m = Math.floor(arr.length / 2); arribo = arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2; }
    const bloques = {}; let conHora = 0;
    lista.forEach(e => {
      const m = /^(\\d{1,2}):/.exec(e['hora'] || '');
      if (!m) return;
      const h = parseInt(m[1], 10); if (h > 23) return;
      const ini = h - (h % 2); bloques[ini] = (bloques[ini] || 0) + 1; conHora++;
    });
    let franja = null, nFranja = 0;
    Object.keys(bloques).forEach(k => { if (bloques[k] > nFranja) { nFranja = bloques[k]; franja = String(k).padStart(2, '0') + ':00 – ' + String((+k + 2) % 24).padStart(2, '0') + ':00'; } });
    const res = {};
    lista.forEach(e => { const r = (e['Resultado'] || '').trim(); if (r) res[r] = (res[r] || 0) + 1; });
    const top = Object.entries(res).sort((a, b) => b[1] - a[1])[0];
    const conRes = Object.values(res).reduce((s, v) => s + v, 0);
    return { total, arribo, nArribo: arr.length, franja, nFranja, nHora: conHora,
             resultado: top ? top[0] : null, nResultado: top ? top[1] : 0, pctResultado: conRes ? Math.round(top[1] / conRes * 100) : 0 };
  }
  function _resumenPolicial(eventosLista, robosLista) {
    const robosAnio = {};
    (robosLista || []).forEach(r => { const y = r['año']; if (y) robosAnio[y] = (robosAnio[y] || 0) + 1; });
    return {
      eventos: _statsPolicial(eventosLista || []),
      robos: _statsPolicial(robosLista || []),
      robosPorAnio: Object.entries(robosAnio).sort((a, b) => a[0].localeCompare(b[0])).map(([anio, cant]) => ({ anio, cant }))
    };
  }
  function _htmlPolicial(d) {
    const p = d.policial; if (!p) return '';
    const per = _periodosFuentes();
    const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const peq = (x) => '<span style="font-size:11px;color:#94a3b8;">' + x + '</span>';
    const fila = (titulo, per_, s) => {
      if (!s.total) return '<tr><td>' + titulo + '<br>' + peq(per_) + '</td><td colspan="4" style="color:#94a3b8;">Sin casos en esta zona</td></tr>';
      const nd = '<span style="color:#94a3b8;">sin datos</span>';
      return '<tr><td>' + titulo + '<br>' + peq(per_) + '</td>' +
        '<td style="text-align:right;font-weight:700;">' + s.total + '</td>' +
        '<td style="text-align:right;">' + (s.arribo != null ? '<b>' + (Math.round(s.arribo * 10) / 10) + ' min</b><br>' + peq(s.nArribo + ' de ' + s.total + ' casos') : nd) + '</td>' +
        '<td>' + (s.franja ? '<b>' + s.franja + '</b><br>' + peq(s.nFranja + ' de ' + s.nHora + ' con hora') : nd) + '</td>' +
        '<td>' + (s.resultado ? esc(s.resultado) + '<br>' + peq(s.pctResultado + '% (' + s.nResultado + ')') : nd) + '</td></tr>';
    };
    const porAnio = (p.robosPorAnio || []).map(a => a.anio + ': <b>' + a.cant + '</b>').join(' · ');
    return \`
      <div class="informe-card">
        <h4>🚓 Respuesta policial</h4>
        <table class="informe-tabla">
          <thead><tr><th>Tipo</th><th style="text-align:right">Casos</th><th style="text-align:right">Arribo (mediana)</th><th>Franja más frecuente</th><th>Resultado más frecuente</th></tr></thead>
          <tbody>
            \${fila('Eventos', per.eventos, p.eventos)}
            \${fila('Robo automotor', per.robos, p.robos)}
          </tbody>
        </table>
        \${porAnio ? '<p style="font-size:12px;color:#64748b;margin:8px 0 0;">Robos automotor por año: ' + porAnio + '</p>' : ''}
        <p style="font-size:12px;color:#94a3b8;margin:6px 0 0;">Hora y minutos de arribo solo existen en parte de los casos (en robo automotor, desde 2025). Cada cifra indica con cuántos casos se calculó.</p>
      </div>\`;
  }

`;

const cambios = [
  { n: 'funciones nuevas', ya: 'function _resumenPolicial', a: '  function _resumirEventos(lista, cargado) {', nuevo: HELPERS + '  function _resumirEventos(lista, cargado) {' },
  { n: 'datos del barrio', ya: 'policial:_resumenPolicial(eventosBarrio', a: ',eventos:eventosInfo};', nuevo: ',eventos:eventosInfo,policial:_resumenPolicial(eventosBarrio,robosBarrio)};' },
  { n: 'datos del cruce', ya: 'policial: _resumenPolicial((_evtDatosC', a: '      eventos: eventosCruceInfo,', nuevo: '      eventos: eventosCruceInfo,\n      policial: _resumenPolicial((_evtDatosC||[]).filter(e => dentroDelRadio(e._lat, e._lon)), robosCruce),' },
  { n: 'resumen barrio: periodo robos', ya: "'Robos automotor ('+_periodosFuentes().robos+')',d.robos,'','#b91c1c'", a: "${_metric('🚗','Robos automotor',d.robos,'','#b91c1c')}", nuevo: "${_metric('🚗','Robos automotor ('+_periodosFuentes().robos+')',d.robos,'','#b91c1c')}" },
  { n: 'resumen barrio: periodo eventos', ya: "'Eventos ('+_periodosFuentes().eventos", a: "${_metric('📌','Eventos',(d.eventos&&d.eventos.total)||0,'','#1d4ed8')}", nuevo: "${_metric('📌','Eventos ('+_periodosFuentes().eventos+')',(d.eventos&&d.eventos.total)||0,'','#1d4ed8')}" },
  { n: 'resumen barrio: bloque policial', ya: '${_htmlPolicial(d)}\n      <div class="informe-card" style="background:#fffbeb', a: '      <div class="informe-card" style="background:#fffbeb;border-color:#fbbf24;">', nuevo: '      ${_htmlPolicial(d)}\n      <div class="informe-card" style="background:#fffbeb;border-color:#fbbf24;">' },
  { n: 'resumen cruce: periodo robos', ya: "'Robos automotor ('+_periodosFuentes().robos+')',d.robos,'','#1a2332'", a: "${_metric('🚗','Robos automotor',d.robos,'','#1a2332')}", nuevo: "${_metric('🚗','Robos automotor ('+_periodosFuentes().robos+')',d.robos,'','#1a2332')}" },
  { n: 'resumen cruce: bloque policial', ya: '${_htmlPolicial(d)}\n      <div class="informe-card">\n        <h4>🚗 Robos de automotor por año</h4>', a: '      <div class="informe-card">\n        <h4>🚗 Robos de automotor por año</h4>', nuevo: '      ${_htmlPolicial(d)}\n      <div class="informe-card">\n        <h4>🚗 Robos de automotor por año</h4>' },
  { n: 'nota desactualizada de robos', ya: 'Los robos de 2023–2024 solo traen el año', a: 'El dataset de robos de automotor solo trae el año del hecho, no mes ni día.', nuevo: 'Los robos de 2023–2024 solo traen el año; desde 2025 incluyen mes, hora y respuesta policial.' }
];
for (const c of cambios) {
  if (t.includes(fix(c.ya))) { console.log('  ya aplicado: ' + c.n); continue; }
  const a = fix(c.a);
  const n = t.split(a).length - 1;
  if (n !== 1) { console.log('ERROR: "' + c.n + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  t = t.replace(a, () => fix(c.nuevo));
  console.log('  ok: ' + c.n);
}
fs.writeFileSync(RUTA, t, 'utf8');
console.log('Listo. Probalo con Ctrl+F5 abriendo el informe de un barrio.');
