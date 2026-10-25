// Informe por barrio: pestaña nueva "Respuesta policial y Robo Auto" con
// franja horaria, dia de la semana, tiempo de arribo, esquinas con mayor demora, evolucion mensual,
// tendencias, recorridos de fuga, ¿hacia donde se van? y donde se pierde el rastro.
// Tambien queda incluida en el PDF del informe.
// Requiere haber aplicado antes: aplicar_fuga_filtrada.cjs y aplicar_hacia_donde_van.cjs
// Uso (desde la carpeta del proyecto):  node aplicar_informe_policial_robo.cjs
const fs = require('fs');
for (const f of ['public/index.html', 'public/script.js']) {
  if (!fs.existsSync(f)) { console.log('NO ENCUENTRO ' + f + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
}
const s = fs.readFileSync('public/script.js', 'utf8');
if (!s.includes('function _rumboFuga') || !s.includes('async function cargarRecorridosFuga(opts)')) {
  console.log('ERROR: primero hay que aplicar aplicar_fuga_filtrada.cjs y aplicar_hacia_donde_van.cjs. No se toco nada.'); process.exit(1);
}
const BLOQUE = String.raw`  // ============================================================
  // TAB: RESPUESTA POLICIAL Y ROBO AUTOMOTOR (por barrio)
  // Reutiliza las funciones de las consultas del panel (script.js).
  // ============================================================
  window._cachePolicialInforme = window._cachePolicialInforme || {};

  async function _prepararPolicialRobo(nombre) {
    const out = { ok: false, ev: null, fuga: null };
    window._cachePolicialInforme[nombre] = out;
    const feat = (typeof barriosData !== 'undefined' && barriosData && barriosData.features) ? barriosData.features.find(f => f.properties.soc_fomen === nombre) : null;
    if (!feat) return out;
    const coords = feat.geometry.coordinates;
    const dentro = function (lat, lon) { return isLatLngInMultiPolygon(L.latLng(lat, lon), coords); };
    const et = function (i) { return _MESES_CONS[i % 12] + ' ' + Math.floor(i / 12); };
    const idx = function (e) { const a = parseInt(e['año'], 10), m = parseInt(e['mes'], 10); return (isNaN(a) || isNaN(m)) ? null : a * 12 + m - 1; };

    // ---------- EVENTOS ----------
    let todos = [];
    try { todos = await cargarEventosParaConsulta(); } catch (e) { console.warn('Informe: no se pudieron cargar los eventos', e); }
    if (todos.length) {
      const evs = filtrarEventosPorBarrio(todos, feat);
      const ev = { total: evs.length, periodo: _periodoEventosTexto(evs) };

      // franja horaria
      const porHora = new Array(24).fill(0); let conHora = 0;
      evs.forEach(function (e) {
        const m = /^(\d{1,2}):/.exec(e['hora'] || ''); if (!m) return;
        const h = parseInt(m[1], 10); if (h > 23) return;
        porHora[h]++; conHora++;
      });
      ev.conHora = conHora;
      ev.franjas = [['Madrugada (00–06 hs)', 0, 6], ['Mañana (06–12 hs)', 6, 12], ['Tarde (12–18 hs)', 12, 18], ['Noche (18–24 hs)', 18, 24]].map(function (f) {
        return { nombre: f[0], cant: porHora.slice(f[1], f[2]).reduce(function (x, y) { return x + y; }, 0) };
      });
      ev.horasPico = porHora.map(function (v, h) { return { h: h, v: v }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 3).filter(function (x) { return x.v > 0; })
        .map(function (x) { return String(x.h).padStart(2, '0') + ':00'; });

      // dia de la semana (promedio por dia, con las fechas de toda la ciudad)
      const fechasPorDia = {}; _DIAS_CONS.forEach(function (d) { fechasPorDia[d] = new Set(); });
      todos.forEach(function (e) { if (e['dia_semana'] && fechasPorDia[e['dia_semana']] && e['fecha']) fechasPorDia[e['dia_semana']].add(e['fecha']); });
      const cuenta = {}; _DIAS_CONS.forEach(function (d) { cuenta[d] = 0; });
      let conDia = 0;
      evs.forEach(function (e) { if (cuenta[e['dia_semana']] !== undefined) { cuenta[e['dia_semana']]++; conDia++; } });
      ev.conDia = conDia;
      ev.dias = _DIAS_CONS.map(function (d) {
        const nd = fechasPorDia[d].size || 1;
        return { nombre: _DIAS_CONS_ACENTO[d], prom: Math.round(cuenta[d] / nd * 10) / 10, total: cuenta[d], dias: nd };
      });
      const sumaDias = function (lista) { return lista.reduce(function (s, d) { return s + cuenta[d]; }, 0); };
      const sumaFechas = function (lista) { return lista.reduce(function (s, d) { return s + fechasPorDia[d].size; }, 0) || 1; };
      ev.laborable = sumaDias(['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']) / sumaFechas(['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']);
      ev.finde = sumaDias(['Sabado', 'Domingo']) / sumaFechas(['Sabado', 'Domingo']);

      // tiempo de arribo: barrio vs ciudad
      const arr = function (lista) { return lista.map(function (e) { return parseInt(e['min_arribo'], 10); }).filter(function (v) { return !isNaN(v); }); };
      const ab = arr(evs), ac = arr(todos);
      ev.arribo = { n: ab.length, med: ab.length ? _percentilConsulta(ab, 0.5) : null, p90: ab.length ? _percentilConsulta(ab, 0.9) : null,
                    nCiudad: ac.length, medCiudad: ac.length ? _percentilConsulta(ac, 0.5) : null, p90Ciudad: ac.length ? _percentilConsulta(ac, 0.9) : null };

      // esquinas con mayor demora policial (minimo 5 eventos con arribo)
      const grupos = {};
      evs.forEach(function (e) {
        const v = parseInt(e['min_arribo'], 10), dir = e['Direccion 0'];
        if (isNaN(v) || !dir || String(dir).indexOf(' y ') === -1) return;
        const k = _claveEsquinaConsulta(dir);
        const g = grupos[k] = grupos[k] || { dir: dir, vals: [] };
        g.vals.push(v);
      });
      ev.esquinas = Object.keys(grupos).map(function (k) { return grupos[k]; }).filter(function (g) { return g.vals.length >= 5; })
        .map(function (g) { return { dir: g.dir, n: g.vals.length, med: _percentilConsulta(g.vals, 0.5), p90: _percentilConsulta(g.vals, 0.9) }; })
        .sort(function (a, b) { return b.med - a.med || b.p90 - a.p90; }).slice(0, 5);

      // evolucion mensual (2025 en adelante)
      const porMes = {};
      evs.forEach(function (e) {
        const a = parseInt(e['año'], 10), m = parseInt(e['mes'], 10);
        if (isNaN(a) || isNaN(m) || a < 2025) return;
        const i = a * 12 + m - 1; porMes[i] = (porMes[i] || 0) + 1;
      });
      ev.meses = Object.keys(porMes).map(Number).sort(function (a, b) { return a - b; }).map(function (i) {
        const prev = porMes[i - 1];
        return { periodo: et(i), cant: porMes[i], delta: prev ? (porMes[i] - prev) * 100 / prev : null };
      }).slice(-12);

      // tendencia: ultimos 3 meses contra los 3 anteriores
      const mesesSet = new Set(todos.map(idx).filter(function (i) { return i !== null; }));
      if (mesesSet.size) {
        const N = 3, fin = Math.max.apply(null, Array.from(mesesSet));
        const vAct = [], vPrev = [];
        for (let k = 0; k < N; k++) { vAct.push(fin - k); vPrev.push(fin - N - k); }
        const nA = vAct.filter(function (i) { return mesesSet.has(i); }).length, nP = vPrev.filter(function (i) { return mesesSet.has(i); }).length;
        const valido = function (e) { return idx(e) !== null && isFinite(e._lat) && isFinite(e._lon) && e['estado_coordenada'] !== 'revisar'; };
        const contar = function (lista) { let a = 0, p = 0; lista.forEach(function (e) { if (!valido(e)) return; const i = idx(e); if (vAct.indexOf(i) >= 0) a++; else if (vPrev.indexOf(i) >= 0) p++; }); return { a: a, p: p }; };
        const resumen = function (c) { const ra = nA ? c.a / nA : 0, rp = nP ? c.p / nP : 0; return { a: c.a, p: c.p, ra: ra, rp: rp, d: rp ? (ra - rp) * 100 / rp : null }; };
        const cats = {};
        const focos = {};
        evs.forEach(function (e) {
          if (!valido(e)) return;
          const i = idx(e), act = vAct.indexOf(i) >= 0, prev = vPrev.indexOf(i) >= 0;
          if (!act && !prev) return;
          const t = e['Tipo de Evento'] || 'Sin tipo';
          const o = cats[t] = cats[t] || { t: t, a: 0, p: 0 };
          if (act) o.a++; else o.p++;
          if (/suicid|genero|género/i.test(t)) return;
          const dir = e['Direccion 0'] || e['Direccion'], k = _claveEsquinaConsulta(dir);
          if (k) { const f = focos[k] = focos[k] || { dir: dir, a: 0, p: 0 }; if (act) f.a++; else f.p++; }
        });
        ev.tend = {
          N: N, nA: nA, nP: nP, incompleto: nA < N || nP < N,
          actual: et(fin - N + 1) + ' a ' + et(fin), previo: et(fin - 2 * N + 1) + ' a ' + et(fin - N),
          barrio: resumen(contar(evs)), ciudad: resumen(contar(todos)),
          cats: Object.keys(cats).map(function (k) { return cats[k]; }).filter(function (o) { return o.a + o.p >= 6; })
            .map(function (o) { const ra = nA ? o.a / nA : 0, rp = nP ? o.p / nP : 0; return { t: o.t, ra: ra, rp: rp, d: rp ? (ra - rp) * 100 / rp : null, tot: o.a + o.p }; })
            .sort(function (x, y) { return y.tot - x.tot; }).slice(0, 6),
          focos: Object.keys(focos).map(function (k) { return focos[k]; }).filter(function (f) { return f.a >= 3 && f.p === 0; }).sort(function (x, y) { return y.a - x.a; }).slice(0, 5)
        };
      }
      out.ev = ev;
    }

    // ---------- ROBO AUTOMOTOR: FUGAS QUE ARRANCARON EN EL BARRIO ----------
    try {
      const rf = await cargarRecorridosFuga({ sinBarrio: true });
      const NOMBRES = ['Norte', 'Noreste', 'Este', 'Sudeste', 'Sur', 'Sudoeste', 'Oeste', 'Noroeste'];
      const sel = [];
      rf.rutas.forEach(function (r) {
        if (!isFinite(r.evLat) || !isFinite(r.evLon) || !dentro(r.evLat, r.evLon)) return;
        const ult = r.pts[r.pts.length - 1];
        r.distFin = _distanciaMetrosFuga(r.evLat, r.evLon, ult.lat, ult.lon);
        r.dirTxt = r.distFin < 300 ? 'Quedó en la zona (menos de 300 m)' : NOMBRES[Math.round(_rumboFuga(r.evLat, r.evLon, ult.lat, ult.lon) / 45) % 8];
        sel.push(r);
      });
      sel.sort(function (a, b) { return b.distFin - a.distFin; });
      const f = { totalCiudad: rf.rutas.length, n: sel.length };
      if (sel.length) {
        f.nHall = sel.filter(function (r) { return r.tipo === 'hallazgo'; }).length;
        f.nSeg = sel.length - f.nHall;
        f.camProm = sel.reduce(function (s, r) { return s + r.pts.length; }, 0) / sel.length;
        f.medKm = _percentilConsulta(sel.map(function (r) { return r.km; }), 0.5);
        f.medFin = _percentilConsulta(sel.map(function (r) { return r.distFin / 1000; }), 0.5);
        const porDir = {};
        sel.forEach(function (r) { porDir[r.dirTxt] = (porDir[r.dirTxt] || 0) + 1; });
        f.porDir = Object.keys(porDir).map(function (k) { return { nombre: k, cant: porDir[k] }; }).sort(function (a, b) { return b.cant - a.cant; });
        const porBarrio = {};
        sel.forEach(function (r) { const b = _barrioDeCamara(r.pts[r.pts.length - 1]); porBarrio[b] = (porBarrio[b] || 0) + 1; });
        f.barrios = Object.keys(porBarrio).map(function (k) { return { nombre: k, cant: porBarrio[k] }; }).sort(function (a, b) { return b.cant - a.cant; }).slice(0, 5);
        const camFin = {};
        sel.forEach(function (r) { const c = r.pts[r.pts.length - 1]; const g = camFin[c.n] = camFin[c.n] || { dir: c.dir, cant: 0 }; g.cant++; });
        f.camFin = Object.keys(camFin).map(function (k) { return camFin[k]; }).sort(function (a, b) { return b.cant - a.cant; }).slice(0, 5);
        const porCam = {};
        sel.forEach(function (r) {
          const vistas = {};
          r.pts.forEach(function (c) { if (vistas[c.n]) return; vistas[c.n] = true; const g = porCam[c.n] = porCam[c.n] || { dir: c.dir, cant: 0 }; g.cant++; });
        });
        f.camPaso = Object.keys(porCam).map(function (k) { return porCam[k]; }).sort(function (a, b) { return b.cant - a.cant; }).slice(0, 5);
        const tr = {};
        sel.forEach(function (r) {
          for (let i = 1; i < r.pts.length; i++) {
            const a = r.pts[i - 1], b = r.pts[i], k = Math.min(a.n, b.n) + '-' + Math.max(a.n, b.n);
            const t = tr[k] = tr[k] || { a: a.dir, b: b.dir, ids: [] };
            if (t.ids.indexOf(r) < 0) t.ids.push(r);
          }
        });
        f.tramos = Object.keys(tr).map(function (k) { return { a: tr[k].a, b: tr[k].b, cant: tr[k].ids.length }; }).filter(function (t) { return t.cant >= 2; }).sort(function (a, b) { return b.cant - a.cant; }).slice(0, 5);
        f.casos = sel.map(function (r) { return { dir: r.dir || 'sin dirección', fecha: r.fecha || '', tipo: r.tipo, cams: r.pts.length, km: r.km, hacia: r.dirTxt, fin: _barrioDeCamara(r.pts[r.pts.length - 1]) }; });
      }
      out.fuga = f;
    } catch (e) { console.warn('Informe: no se pudieron cargar los recorridos de fuga', e); }

    out.ok = !!(out.ev || out.fuga);
    return out;
  }

  function _htmlPolicialRobo(d) {
    const c = (window._cachePolicialInforme || {})[d.nombre];
    const esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
    const peq = function (x) { return '<span style="font-size:11px;color:#94a3b8;">' + x + '</span>'; };
    const nota = function (x) { return '<p style="font-size:12px;color:#94a3b8;margin:10px 0 0;">' + x + '</p>'; };
    const vacio = function (x) { return '<p style="color:#94a3b8;font-size:13px;margin:0;">' + x + '</p>'; };
    const varTxt = function (v) { return v === null || v === undefined ? '—' : '<b style="color:' + (v > 0 ? '#b91c1c' : (v < 0 ? '#15803d' : '#64748b')) + ';">' + (v >= 0 ? '+' : '') + v.toFixed(0) + '%</b>'; };
    const th = function (t, der) { return '<th' + (der ? ' style="text-align:right"' : '') + '>' + t + '</th>'; };
    if (!c || !c.ok) {
      return '<div class="informe-card">' + vacio('No se pudieron cargar los datos de eventos y recorridos de fuga. Verificá que eventos.csv y robo_automotor.csv estén disponibles y recargá el informe.') + '</div>';
    }
    let h = '';
    const ev = c.ev;

    // ---------------- EVENTOS ----------------
    h += '<h3 style="margin:0 0 12px;font-size:17px;color:#1a2332;">⏱️ Eventos: horarios y respuesta policial</h3>';
    if (!ev) {
      h += '<div class="informe-card">' + vacio('No se pudieron cargar los eventos (eventos.csv).') + '</div>';
    } else {
      const ar = ev.arribo;
      let tendMetric = '—', tendColor = '#64748b';
      if (ev.tend && ev.tend.barrio.d !== null && ev.tend.barrio.a + ev.tend.barrio.p >= 10) {
        const dd = ev.tend.barrio.d; tendMetric = (dd >= 0 ? '+' : '') + dd.toFixed(0) + '%'; tendColor = dd > 0 ? '#b91c1c' : '#15803d';
      }
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:20px;">' +
        _metric('📌', 'Eventos en el barrio', ev.total, '', '#1d4ed8') +
        _metric('🚓', 'Arribo policial (mediana)', ar.med != null ? (Math.round(ar.med * 10) / 10) : 's/d', ar.med != null ? 'min' : '', '#b91c1c') +
        _metric('📈', 'Tendencia (3 meses)', tendMetric, '', tendColor) +
        _metric('🚗', 'Fugas de vehículos robados', c.fuga ? c.fuga.n : 's/d', '', '#7c3aed') + '</div>';

      // franja + dia
      const maxF = Math.max.apply(null, [1].concat(ev.franjas.map(function (f) { return f.cant; })));
      const topF = ev.franjas.slice().sort(function (a, b) { return b.cant - a.cant; })[0];
      const maxD = Math.max.apply(null, [0.1].concat(ev.dias.map(function (x) { return x.prom; })));
      const topD = ev.dias.slice().sort(function (a, b) { return b.prom - a.prom; })[0];
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">' +
        '<div class="informe-card"><h4>🕒 Franja horaria con más eventos</h4>' +
        (ev.conHora ? ev.franjas.map(function (f) { return _causaBar(esc(f.nombre), f.cant, maxF, f === topF ? '#b91c1c' : '#d97706'); }).join('') +
          '<p style="font-size:13px;color:#334155;margin:10px 0 0;"><b>Franja con más eventos:</b> ' + esc(topF.nombre) + '<br><b>Horas pico:</b> ' + esc(ev.horasPico.join(', ')) + '</p>' +
          nota('Calculado con ' + ev.conHora + ' de ' + ev.total + ' eventos que tienen hora registrada.') : vacio('Sin eventos con hora registrada en este barrio.')) + '</div>' +
        '<div class="informe-card"><h4>📅 Día de la semana con más eventos</h4>' +
        (ev.conDia ? ev.dias.map(function (x) { return _causaBar(esc(x.nombre), x.prom, maxD, x === topD ? '#b91c1c' : '#1d4ed8'); }).join('') +
          '<p style="font-size:13px;color:#334155;margin:10px 0 0;"><b>Día con más eventos:</b> ' + esc(topD.nombre) + '<br><b>Laborables:</b> ' + ev.laborable.toFixed(1) + ' por día · <b>Fin de semana:</b> ' + ev.finde.toFixed(1) + ' por día</p>' +
          nota('Promedio por día (total ÷ cantidad de fechas con datos de ese día en la ciudad).') : vacio('Sin eventos con día registrado en este barrio.')) + '</div></div>';

      // arribo + esquinas
      h += '<div class="informe-card"><h4>🚓 Tiempo de arribo policial</h4>';
      if (ar.n) {
        const dif = ar.medCiudad != null ? ar.med - ar.medCiudad : null;
        h += '<table class="informe-tabla"><thead><tr><th></th>' + th('Eventos con arribo', true) + th('Mediana', true) + th('9 de cada 10 llegan en', true) + '</tr></thead><tbody>' +
          '<tr><td><b>' + esc(d.nombre) + '</b></td><td style="text-align:right;">' + ar.n + '</td><td style="text-align:right;font-weight:700;">' + ar.med.toFixed(0) + ' min</td><td style="text-align:right;">≤ ' + ar.p90.toFixed(0) + ' min</td></tr>' +
          '<tr><td>Toda la ciudad</td><td style="text-align:right;">' + ar.nCiudad + '</td><td style="text-align:right;">' + ar.medCiudad.toFixed(0) + ' min</td><td style="text-align:right;">≤ ' + ar.p90Ciudad.toFixed(0) + ' min</td></tr></tbody></table>';
        if (dif !== null) h += '<p style="font-size:13px;color:#334155;margin:10px 0 0;">' + (Math.abs(dif) < 0.5 ? 'La demora es similar a la del promedio de la ciudad.' : 'La mediana del barrio es <b style="color:' + (dif > 0 ? '#b91c1c' : '#15803d') + ';">' + Math.abs(dif).toFixed(0) + ' min ' + (dif > 0 ? 'mayor' : 'menor') + '</b> que la de la ciudad.') + '</p>';
        if (ar.n < 30) h += nota('⚠️ Solo ' + ar.n + ' eventos con arribo registrado: tomalo como orientativo.');
      } else h += vacio('No hay eventos con tiempo de arribo registrado en este barrio.');
      h += '<h4 style="margin-top:18px;">⏱️ Esquinas con mayor demora policial</h4>';
      if (ev.esquinas.length) {
        h += '<table class="informe-tabla"><thead><tr><th>#</th><th>Esquina</th>' + th('Eventos', true) + th('Mediana', true) + th('90% llega en', true) + '</tr></thead><tbody>' +
          ev.esquinas.map(function (g, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(g.dir) + '</td><td style="text-align:right;">' + g.n + '</td><td style="text-align:right;font-weight:700;">' + g.med.toFixed(0) + ' min</td><td style="text-align:right;">≤ ' + g.p90.toFixed(0) + ' min</td></tr>'; }).join('') + '</tbody></table>';
      } else h += vacio('Ninguna esquina del barrio reúne 5 o más eventos con arribo registrado.');
      h += nota('Minutos desde el inicio del evento hasta el arribo policial. Incluye robo automotor de 2025 en adelante.') + '</div>';

      // evolucion + tendencias
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">' +
        '<div class="informe-card"><h4>📈 Evolución mensual de eventos</h4>';
      if (ev.meses.length) {
        h += '<table class="informe-tabla"><thead><tr><th>Mes</th>' + th('Eventos', true) + th('Vs. mes anterior', true) + '</tr></thead><tbody>' +
          ev.meses.map(function (m) { return '<tr><td>' + esc(m.periodo) + '</td><td style="text-align:right;font-weight:700;color:#1d4ed8;">' + m.cant + '</td><td style="text-align:right;">' + varTxt(m.delta) + '</td></tr>'; }).join('') + '</tbody></table>' +
          nota('Últimos 12 meses con datos. Solo cuenta eventos con coordenadas.');
      } else h += vacio('Sin eventos desde 2025 en este barrio.');
      h += '</div><div class="informe-card"><h4>📊 Tendencia: ¿está empeorando?</h4>';
      const T = ev.tend;
      if (!T) h += vacio('No hay datos mensuales suficientes.');
      else if (!T.nP) h += vacio('No hay datos en el período anterior (' + esc(T.previo) + ').');
      else {
        const b = T.barrio, ci = T.ciudad;
        h += '<table class="informe-tabla"><thead><tr><th></th>' + th('Antes (prom/mes)', true) + th('Ahora (prom/mes)', true) + th('Variación', true) + '</tr></thead><tbody>' +
          '<tr><td><b>' + esc(d.nombre) + '</b></td><td style="text-align:right;">' + b.rp.toFixed(1) + '</td><td style="text-align:right;">' + b.ra.toFixed(1) + '</td><td style="text-align:right;">' + varTxt(b.d) + '</td></tr>' +
          '<tr><td>Toda la ciudad</td><td style="text-align:right;">' + ci.rp.toFixed(1) + '</td><td style="text-align:right;">' + ci.ra.toFixed(1) + '</td><td style="text-align:right;">' + varTxt(ci.d) + '</td></tr></tbody></table>' +
          '<p style="font-size:12px;color:#64748b;margin:8px 0 0;">Ahora: ' + esc(T.actual) + ' · Antes: ' + esc(T.previo) + '</p>';
        if (b.a + b.p < 10) h += nota('⚠️ Solo ' + (b.a + b.p) + ' hechos entre ambos períodos: el porcentaje no es confiable.');
        if (T.incompleto) h += nota('⚠️ Faltan meses sin cargar en uno de los períodos: se comparan promedios mensuales de los meses con datos.');
        if (T.cats.length) {
          h += '<h4 style="margin-top:14px;">Por categoría</h4><table class="informe-tabla"><thead><tr><th>Categoría</th>' + th('Antes', true) + th('Ahora', true) + th('Var.', true) + '</tr></thead><tbody>' +
            T.cats.map(function (o) { return '<tr><td>' + esc(o.t) + '</td><td style="text-align:right;">' + o.rp.toFixed(1) + '</td><td style="text-align:right;">' + o.ra.toFixed(1) + '</td><td style="text-align:right;">' + varTxt(o.d) + '</td></tr>'; }).join('') + '</tbody></table>';
        }
        if (T.focos.length) {
          h += '<h4 style="margin-top:14px;">Focos nuevos (3 o más hechos ahora, ninguno antes)</h4><table class="informe-tabla"><tbody>' +
            T.focos.map(function (f) { return '<tr><td>' + esc(f.dir) + '</td><td style="text-align:right;font-weight:700;">' + f.a + '</td></tr>'; }).join('') + '</tbody></table>';
        }
      }
      h += '</div></div>';
    }

    // ---------------- ROBO AUTOMOTOR ----------------
    h += '<h3 style="margin:24px 0 12px;font-size:17px;color:#1a2332;">🚗 Robo automotor: recorridos y destinos</h3>';
    const f = c.fuga;
    if (!f) {
      h += '<div class="informe-card">' + vacio('No se pudieron cargar los recorridos de vehículos robados.') + '</div>';
    } else if (!f.n) {
      h += '<div class="informe-card">' + vacio('No hay recorridos de fuga (Hallazgo Automotor o Seguimiento del Evento con 2 o más cámaras) con origen en este barrio. En toda la ciudad hay ' + f.totalCiudad + ' recorridos de ese tipo desde 2025.') + '</div>';
    } else {
      let aviso = '';
      if (f.n < 5) aviso = '<p style="font-size:13px;color:#b91c1c;margin:0 0 12px;"><b>⚠️ Solo ' + f.n + ' caso(s):</b> tomalo como orientativo, no como una probabilidad.</p>';
      else if (f.n < 10) aviso = '<p style="font-size:13px;color:#92400e;margin:0 0 12px;">Pocos casos (' + f.n + '): la tendencia es una pista, no una certeza.</p>';
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:20px;">' +
        _metric('🚗', 'Recorridos de fuga', f.n, 'de ' + f.totalCiudad + ' en la ciudad', '#7c3aed') +
        _metric('📷', 'Cámaras por recorrido', f.camProm.toFixed(1), '', '#1d4ed8') +
        _metric('📏', 'Distancia mediana', f.medKm.toFixed(1), 'km', '#b91c1c') + '</div>' + aviso;
      const maxP = Math.max.apply(null, [1].concat(f.porDir.map(function (x) { return x.cant; })));
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">' +
        '<div class="informe-card"><h4>🧭 ¿Hacia dónde se van?</h4>' +
        f.porDir.map(function (x, i) { return _causaBar(esc(x.nombre), x.cant, maxP, i === 0 ? '#b91c1c' : '#d97706'); }).join('') +
        nota('Dirección desde el lugar del hecho hasta la última cámara que vio al vehículo (en línea recta). Distancia mediana: ' + f.medFin.toFixed(1) + ' km.') + '</div>' +
        '<div class="informe-card"><h4>📍 ¿Dónde se pierde el rastro?</h4>' +
        '<table class="informe-tabla"><thead><tr><th>Barrio donde termina</th>' + th('Casos', true) + '</tr></thead><tbody>' +
        f.barrios.map(function (b) { return '<tr><td>' + esc(b.nombre) + '</td><td style="text-align:right;font-weight:700;">' + b.cant + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<h4 style="margin-top:14px;">Cámaras donde más recorridos terminan</h4><table class="informe-tabla"><tbody>' +
        f.camFin.map(function (g) { return '<tr><td>' + esc(g.dir) + '</td><td style="text-align:right;font-weight:700;">' + g.cant + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      h += '<div class="informe-card"><h4>🛣️ Corredores: cámaras y tramos más usados</h4>' +
        '<table class="informe-tabla"><thead><tr><th>Cámara por donde más pasaron</th>' + th('Recorridos', true) + '</tr></thead><tbody>' +
        f.camPaso.map(function (g) { return '<tr><td>' + esc(g.dir) + '</td><td style="text-align:right;font-weight:700;">' + g.cant + '</td></tr>'; }).join('') + '</tbody></table>' +
        (f.tramos.length ? '<h4 style="margin-top:14px;">Tramos repetidos</h4><table class="informe-tabla"><tbody>' + f.tramos.map(function (t) { return '<tr><td>' + esc(t.a) + ' ↔ ' + esc(t.b) + '</td><td style="text-align:right;font-weight:700;">' + t.cant + '</td></tr>'; }).join('') + '</tbody></table>' : '') + '</div>';
      const MAXC = 10;
      h += '<div class="informe-card"><h4>📋 Recorridos de fuga con origen en el barrio</h4>' +
        '<table class="informe-tabla"><thead><tr><th>Hecho</th><th>Resultado</th><th>Hacia</th><th>Termina en</th>' + th('Cám.', true) + th('Dist.', true) + '</tr></thead><tbody>' +
        f.casos.slice(0, MAXC).map(function (x) {
          return '<tr><td>' + esc(x.dir) + '<br>' + peq(esc(x.fecha)) + '</td><td>' + (x.tipo === 'hallazgo' ? 'Hallazgo automotor' : 'Seguimiento del evento') + '</td><td>' + esc(x.hacia) + '</td><td>' + esc(x.fin) + '</td><td style="text-align:right;">' + x.cams + '</td><td style="text-align:right;">' + x.km.toFixed(1) + ' km</td></tr>';
        }).join('') + '</tbody></table>' +
        (f.casos.length > MAXC ? nota('Se muestran los ' + MAXC + ' de mayor distancia, de ' + f.casos.length + ' casos.') : '') +
        nota('Solo se cuentan fugas reales (Hallazgo Automotor y Seguimiento del Evento: ' + f.nHall + ' y ' + f.nSeg + ' en este barrio). Los recorridos son entre cámaras, no el trayecto exacto por las calles, y solo hay datos desde 2025.') + '</div>';
    }
    return h;
  }

`;

let t = fs.readFileSync('public/index.html', 'utf8');
const nl = t.includes('\r\n') ? '\r\n' : '\n';
const fix = x => x.replace(/\r?\n/g, nl);
const pend = [];
function plan(nombre, ya, antes, despues) {
  if (t.includes(ya)) { console.log('  ya aplicado: ' + nombre); return; }
  const a = fix(antes), n = t.split(a).length - 1;
  if (n !== 1) { console.log('ERROR: "' + nombre + '" aparece ' + n + ' veces. No se toco nada.'); process.exit(1); }
  pend.push({ nombre: nombre, a: a, b: fix(despues) });
}

plan('codigo de la pestaña', 'function _prepararPolicialRobo',
  '  function _datosVacios(nombre) {',
  BLOQUE + '  function _datosVacios(nombre) {');
plan('mostrar la pestaña', "case 'policial':",
  "      case 'eventos':         cont.innerHTML=_htmlEventos(d);         break;",
  "      case 'eventos':         cont.innerHTML=_htmlEventos(d);         break;\n      case 'policial':        cont.innerHTML=_htmlPolicialRobo(d);    break;");
plan('calcular al abrir el informe', 'await _prepararPolicialRobo(barrio)',
  "    const datos = _calcularDatosBarrio(barrio);\n    _mostrarBadgeCriticidad(datos.criticidad);",
  "    try { await _prepararPolicialRobo(barrio); } catch (errPol) { console.warn('Informe: pestaña policial', errPol); }\n    const datos = _calcularDatosBarrio(barrio);\n    _mostrarBadgeCriticidad(datos.criticidad);");
plan('lista de paginas del PDF', "'eventos', 'policial', 'movilidad'",
  "const tabs = ['resumen', 'siniestros', 'camaras', 'escolares', 'eventos', 'movilidad', 'recomendaciones'];\n      const titulos = {\n        resumen: 'Resumen General',\n        siniestros: 'Siniestros',\n        camaras: 'Cámaras y Cobertura',\n        escolares: 'Corredores Escolares',\n        eventos: 'Eventos',\n        movilidad: 'Colectivos y Aforos',",
  "const tabs = ['resumen', 'siniestros', 'camaras', 'escolares', 'eventos', 'policial', 'movilidad', 'recomendaciones'];\n      const titulos = {\n        resumen: 'Resumen General',\n        siniestros: 'Siniestros',\n        camaras: 'Cámaras y Cobertura',\n        escolares: 'Corredores Escolares',\n        eventos: 'Eventos',\n        policial: 'Respuesta Policial y Robo Automotor',\n        movilidad: 'Colectivos y Aforos',");
plan('datos del PDF', 'if (!(window._cachePolicialInforme',
  "      const datos = _calcularDatosBarrio(_informeBarrioActual);\n\n      // --- Pedir el análisis",
  "      try { if (!(window._cachePolicialInforme || {})[_informeBarrioActual]) await _prepararPolicialRobo(_informeBarrioActual); } catch (errPol) { console.warn('PDF: pestaña policial', errPol); }\n      const datos = _calcularDatosBarrio(_informeBarrioActual);\n\n      // --- Pedir el análisis");

// boton de la pestaña: se inserta una linea nueva despues del boton "Eventos" del informe de barrio
let hecho = t.includes('data-tab="policial"');
let lineas = null, idxBtn = -1;
if (hecho) console.log('  ya aplicado: boton de la pestaña');
else {
  lineas = t.split(/\r?\n/);
  const idx = [];
  lineas.forEach((l, i) => { if (l.includes("switchInformeTab('eventos',this)")) idx.push(i); });
  if (idx.length !== 1) { console.log('ERROR: boton de pestaña "Eventos" aparece ' + idx.length + ' veces. No se toco nada.'); process.exit(1); }
  idxBtn = idx[0];
}

for (const p of pend) { t = t.replace(p.a, () => p.b); console.log('  ok: ' + p.nombre); }
if (!hecho) {
  lineas = t.split(/\r?\n/);
  const i2 = lineas.findIndex(l => l.includes("switchInformeTab('eventos',this)"));
  const sangria = /^\s*/.exec(lineas[i2])[0];
  lineas.splice(i2 + 1, 0, sangria + '<button class="informe-tab"         data-tab="policial"        onclick="switchInformeTab(\'policial\',this)">🚓 Respuesta policial y Robo Auto</button>');
  t = lineas.join(nl);
  console.log('  ok: boton de la pestaña');
}
fs.writeFileSync('public/index.html', t, 'utf8');
console.log('Listo. Abri el sitio con Ctrl+F5, entra a Informe por Barrio y elegi un barrio: nueva pestaña "Respuesta policial y Robo Auto".');
