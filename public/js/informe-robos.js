/* "Generar informe de robos": arma un PDF con lo que esta impactando en el mapa de Robo Automotor.
   Modelo hibrido:
   - Las CIFRAS, tablas, graficos y reglas salen del codigo, con los mismos calculos que ya muestran los paneles
     (Panorama de robos, Zonas con mas robos, Hallazgos). Nada de eso lo escribe la IA.
   - La IA (opcional) solo REDACTA un analisis a partir de esas cifras ya calculadas. Si falla o no esta habilitada,
     el PDF se genera igual, con el texto armado por reglas.
   Requisitos: cargar DESPUES de panorama-robos.js, zonas-robos.js, mes-robos.js y hallazgos-layer.js (parchados con
   obtener()/resumen()), y con jsPDF, html2canvas y PdfX (index.html) ya disponibles. */
(function () {
  'use strict';

  var IA_URL = (typeof window !== 'undefined' && window.CIMU_INFORME_ROBOS_IA_URL) || 'https://us-central1-seguridad-mdp-v2.cloudfunctions.net/generarInformeIA';
  var IA_TIMEOUT_MS = 45000;
  var DIA3 = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
  var DIA_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var DIF_MIN = 3;            // diferencia minima de hechos para hablar de suba o baja (con menos es ruido)
  var MUESTRA_CHICA = 30;     // menos robos que esto: se avisa que las conclusiones son debiles

  var CONSIGNA_IA =
    'Redactá en español rioplatense un análisis breve para un equipo de seguridad urbana, usando EXCLUSIVAMENTE las cifras del JSON. ' +
    'No inventes ni calcules cifras nuevas, no menciones barrios ni calles que no estén en los datos. ' +
    'Si una tendencia se apoya en menos de 8 hechos, llamala "alerta" y no "prueba". ' +
    'Recordá que la hora es la del aviso, que el cruce robos/hallazgos es por zona y no por patente, y que los sitios LPR son candidatos a validar en terreno. ' +
    'Formato: "## " para subtítulos, "- " para viñetas, "> " para una advertencia. Secciones: Lectura general, Qué priorizar, Qué validar antes de decidir. Máximo 350 palabras.';

  function $(id) { return document.getElementById(id); }
  function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : 0; }
  function coma(x) { return String(x).replace('.', ','); }
  function pl(n, s, p) { return n === 1 ? s : p; }
  function suma(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function metros(a, b, c, d) { var dx = (d - b) * 111320 * Math.cos(((a + c) / 2) * Math.PI / 180), dy = (c - a) * 111320; return Math.sqrt(dx * dx + dy * dy); }

  /* ======================= 1. Reunir lo que hay en pantalla ======================= */
  function reunir() {
    var P = window.CIMUPanoramaRobos, Z = window.CIMUZonasRobos, H = window.HallazgosLayer;
    if (!P || !P.obtener) return Promise.reject(new Error('Falta panorama-robos.js (con obtener())'));
    if (!Z || !Z.obtener) return Promise.reject(new Error('Falta zonas-robos.js (con obtener())'));
    return P.obtener().then(function (pan) {
      var zon = Z.obtener(), hal = null;
      try { hal = (H && H.resumen) ? H.resumen() : null; } catch (e) { hal = null; }
      var r = pan.r, res = $('robo-resultado-filter');
      var s = {
        generado: new Date().toISOString(),
        filtros: {
          texto: pan.periodo.texto, anio: pan.periodo.anio || '', mes: pan.periodo.mes || 0,
          resultado: res && res.value ? res.value : 'Todos los Resultados',
          barrios: hal ? hal.barrios : [], radioZona: zon.radio, radioLPR: pan.radio
        },
        robos: {
          n: r.n, det: r.det, detPct: pct(r.det, r.n), hora: r.hora, conHora: r.conHora, dia: r.dia, conDia: r.conDia,
          mensual: zon.general ? { valores: zon.general, etiquetas: zon.ref.etiquetas, referencia: zon.ref.etiqueta, anterior: zon.ref.mesAnterior, elegido: zon.ref.elegido, enCurso: zon.ref.enCurso } : null
        },
        zonas: zon.zonas.map(function (z, i) { return { pos: i + 1, dir: z.dir, n: z.n, lat: z.lat, lon: z.lon, res: (z.res || []).slice(0, 2), serie: z.serie }; }),
        zonasMin: zon.calMin,
        esquinas: zon.esquinas,
        hallazgosPanorama: { H: r.H, L: r.L, S: r.S, total: r.H + r.L + r.S, porCien: r.n ? Math.round(1000 * (r.H + r.L + r.S) / r.n) / 10 : 0 },
        hallazgosMapa: hal,
        lpr: { cubiertos: r.cubiertos, pct: pct(r.cubiertos, r.n), lectores: pan.lectores, radio: pan.radio,
               sitios: r.sitios.map(function (x, i) { return { pos: i + 1, dir: x.dir || (x.lat.toFixed(4) + ', ' + x.lon.toFixed(4)), n: x.n }; }) }
      };
      s.zonas.forEach(function (z) { z.tendencia = tendencia(z.serie, zon.ref); });
      s.an = analizar(s);
      return s;
    });
  }

  /* ======================= 2. Reglas (todo calculado, nada de IA) ======================= */
  function tendencia(serie, ref) {
    if (!serie || !ref) return { tipo: 'sd', rotulo: 'Sin dato', texto: 'No hay serie mensual para esta zona.', debil: true };
    var cur = serie[11], prev = serie[10], t;
    if (ref.elegido) {
      var d = cur - prev;
      t = { tipo: d >= DIF_MIN ? 'sube' : (d <= -DIF_MIN ? 'baja' : 'estable'), a: cur, b: prev, debil: (cur + prev) < 6 };
      t.texto = ref.mesAnterior.split(' ')[0] + ': ' + prev + ' | ' + ref.etiqueta.split(' ')[0] + ': ' + cur + ' (' + (d > 0 ? '+' : '') + d + ')';
    } else {
      var u3 = serie[9] + serie[10] + serie[11], a3 = serie[6] + serie[7] + serie[8], dd = u3 - a3;
      var sube = dd >= DIF_MIN && (a3 === 0 || u3 >= 1.5 * a3), baja = dd <= -DIF_MIN && u3 <= a3 / 1.5;
      t = { tipo: sube ? 'sube' : (baja ? 'baja' : 'estable'), a: u3, b: a3, debil: (u3 + a3) < 8 };
      t.texto = 'Últimos 3 meses: ' + u3 + ' vs ' + a3 + ' antes' + (a3 ? ' (' + (dd > 0 ? '+' : '') + Math.round(dd * 100 / a3) + '%)' : '');
    }
    t.rotulo = { sube: 'Sube', baja: 'Baja', estable: 'Estable' }[t.tipo] + (t.debil && t.tipo !== 'estable' ? ' (señal débil)' : '');
    return t;
  }

  function franjaPico(h) {
    var mejor = 0, n = -1;
    for (var i = 0; i < 24; i++) { var t = h[i] + h[(i + 1) % 24] + h[(i + 2) % 24]; if (t > n) { n = t; mejor = i; } }
    var tot = suma(h);
    return { desde: mejor, hasta: (mejor + 3) % 24, n: n, total: tot, share: tot ? n / tot : 0 };
  }

  function analizar(s) {
    var r = s.robos, an = {};
    an.muestraChica = r.n < MUESTRA_CHICA;
    var f = franjaPico(r.hora);
    an.franja = (r.conHora >= 20 && f.share >= 0.1875) ? f : null;
    an.franjaMejor = f;
    an.noche = r.conHora ? pct(suma(r.hora.slice(18)), r.conHora) : 0;
    var orden = r.dia.map(function (v, i) { return { i: i, v: v }; }).sort(function (a, b) { return b.v - a.v; });
    an.dias = (r.conDia >= 20 && orden[0].v / r.conDia >= 0.2) ? orden.filter(function (x) { return x.v / r.conDia >= 0.2; }).map(function (x) { return x.i; }) : [];
    an.diaTop = orden[0];
    an.suben = s.zonas.filter(function (z) { return z.tendencia.tipo === 'sube'; });
    an.bajan = s.zonas.filter(function (z) { return z.tendencia.tipo === 'baja'; });
    an.lprBaja = s.lpr.pct < 10;
    // zonas de robo que coinciden con zonas de hallazgo (posible corredor de paso o descarte)
    an.coinciden = [];
    if (s.hallazgosMapa && s.hallazgosMapa.zonas) {
      s.zonas.forEach(function (z) {
        s.hallazgosMapa.zonas.forEach(function (h) {
          if (metros(z.lat, z.lon, h.lat, h.lon) <= s.filtros.radioZona + s.hallazgosMapa.radio) an.coinciden.push({ robo: z, hallazgo: h });
        });
      });
    }
    return an;
  }

  function textoFranja(an) { return an.franja ? an.franja.desde + ' a ' + an.franja.hasta + ' h' : null; }
  function textoDias(an) { return an.dias.length ? an.dias.map(function (i) { return DIA_LARGO[i]; }).join(' y ') : null; }

  function recomendaciones(s) {
    var an = s.an, out = [], fr = textoFranja(an), dias = textoDias(an);
    var focos = an.suben.length ? an.suben : s.zonas.slice(0, 2);
    if (focos.length) {
      out.push({
        prio: 'Alta', plazo: 'Inmediato',
        accion: 'Patrullaje dirigido en ' + focos.slice(0, 3).map(function (z) { return z.dir; }).join('; ') + (fr ? ', en la franja de ' + fr : ''),
        porque: an.suben.length ? 'Son las zonas cuya tendencia sube con los filtros actuales.' : 'Son las zonas con más robos del período (no se detectó una zona en suba clara).'
      });
    }
    if (dias) out.push({ prio: 'Alta', plazo: 'Inmediato', accion: 'Reforzar el servicio los ' + dias, porque: 'Concentra una parte mayor a la esperable de los robos con día registrado.' });
    if (an.lprBaja && s.lpr.sitios.length) {
      out.push({
        prio: 'Alta', plazo: '30 a 60 días',
        accion: 'Validar en terreno y priorizar lector LPR en ' + s.lpr.sitios[0].dir + (s.lpr.sitios[1] ? ' y luego en ' + s.lpr.sitios[1].dir : ''),
        porque: 'Solo ' + coma(s.lpr.pct) + '% de los robos ocurrió a ' + s.lpr.radio + ' m o menos de un lector; el primer sitio sumaría ' + s.lpr.sitios[0].n + ' robos de cobertura.'
      });
    }
    an.coinciden.slice(0, 2).forEach(function (c) {
      out.push({ prio: 'Media', plazo: '30 a 60 días', accion: 'Evaluar controles móviles de vehículos en el corredor ' + c.robo.dir, porque: 'La zona de robos coincide con una zona de hallazgos (' + c.hallazgo.dir + '): puede ser una ruta de paso o descarte.' });
    });
    var emergentes = an.suben.filter(function (z) { return z.tendencia.debil; });
    if (emergentes.length) out.push({ prio: 'Media', plazo: 'Seguimiento mensual', accion: 'Monitorear como foco emergente: ' + emergentes.slice(0, 3).map(function (z) { return z.dir; }).join('; '), porque: 'Subieron, pero con pocos hechos: es una alerta, no una prueba.' });
    if (s.robos.n >= 10 && s.robos.detPct < 5) out.push({ prio: 'Media', plazo: '60 a 90 días', accion: 'Revisar los protocolos de respuesta inmediata ante un aviso de robo', porque: 'Solo ' + coma(s.robos.detPct) + '% de los robos terminó con detención.' });
    if (s.esquinas.length && s.esquinas[0].n >= 3) out.push({ prio: 'Media', plazo: '60 a 90 días', accion: 'Prevención situacional (iluminación, poda, cámaras) en ' + s.esquinas.slice(0, 2).map(function (e) { return e.dir; }).join('; '), porque: 'Son las esquinas con más robos individuales.' });
    if (an.bajan.length) out.push({ prio: 'Baja', plazo: 'Seguimiento mensual', accion: 'Sostener presencia mínima en ' + an.bajan.slice(0, 2).map(function (z) { return z.dir; }).join('; '), porque: 'La tendencia bajó: conviene confirmar que no se está desplazando a otra zona.' });
    return out;
  }

  function plan(s) {
    var an = s.an, fr = textoFranja(an), dias = textoDias(an);
    return s.zonas.slice(0, 6).map(function (z) {
      var t = z.tendencia.tipo, alta = t === 'sube' || z.pos <= 2 && t !== 'baja';
      var prio = alta ? 'Alta' : (t === 'baja' ? 'Baja' : 'Media');
      return {
        zona: z.dir, prio: prio, dias: dias ? dias.replace(/^./, function (c) { return c.toUpperCase(); }) : 'Sin día destacado',
        franja: fr || 'Sin franja destacada', modalidad: prio === 'Alta' ? 'Móvil fijo + recorrida' : (prio === 'Media' ? 'Recorrida periódica' : 'Pasadas puntuales')
      };
    });
  }

  function limitaciones(s) {
    var an = s.an, l = [];
    l.push('Los CSV no tienen patente: el cruce robos/hallazgos es por zona, no por vehículo. "Hallazgos cada 100 robos" no es una tasa de recupero.');
    l.push('El horario es el del aviso, no necesariamente el del hecho. Los años anteriores a 2025 no traen hora.');
    l.push('Las zonas dependen del tamaño elegido (' + s.filtros.radioZona + ' m) y del período: cambian si se cambia cualquiera de los dos. No son puntos fijos.');
    l.push('Los puntos son eventos de monitoreo tipificados como robo automotor, no robos confirmados.');
    if (an.muestraChica) l.push('Con ' + s.robos.n + ' robos la muestra es chica: una diferencia de 2 o 3 hechos mueve mucho los porcentajes. Las tendencias son alertas, no pruebas.');
    if (s.robos.mensual && s.robos.mensual.enCurso) l.push('El último mes es el mes en curso y puede estar incompleto.');
    if (s.hallazgosMapa) l.push('Los hallazgos del mapa usan su propio filtro de año y mes y ' + (s.hallazgosMapa.barrios.length ? 'el barrio elegido' : 'todo el mapa') + '; el panorama de robos cuenta hallazgos por período, sin filtrar por barrio. Por eso las cifras de ambos pueden diferir.');
    if (s.hallazgosMapa && s.hallazgosMapa.excluidos) l.push(s.hallazgosMapa.excluidos + ' hallazgos tienen la ubicación a revisar y no se cuentan en las zonas.');
    l.push('Los sitios sugeridos para lectores LPR son candidatos: hay que validar calles, accesos, energía, conectividad y ángulo de captura.');
    return l;
  }

  /* ======================= 3. Analisis redactado por IA (opcional) ======================= */
  function paraIA(s) {
    return {
      filtros: s.filtros, robos: { n: s.robos.n, detenciones: s.robos.det, porcentajeDetencion: s.robos.detPct, horaPicoAviso: s.an.franja ? { desde: s.an.franja.desde, hasta: s.an.franja.hasta, porcentaje: Math.round(s.an.franja.share * 1000) / 10 } : null, diasPico: s.an.dias.map(function (i) { return DIA_LARGO[i]; }), mensual: s.robos.mensual },
      zonas: s.zonas.map(function (z) { return { dir: z.dir, robos: z.n, tendencia: z.tendencia.tipo, detalle: z.tendencia.texto, senalDebil: z.tendencia.debil }; }),
      esquinas: s.esquinas.slice(0, 5), hallazgos: s.hallazgosPanorama, lpr: s.lpr,
      coincidenciasRoboHallazgo: s.an.coinciden.map(function (c) { return { zonaRobo: c.robo.dir, zonaHallazgo: c.hallazgo.dir }; }),
      muestraChica: s.an.muestraChica
    };
  }

  /* Devuelve el texto de la IA o null (si falla, el informe sigue sin ese apartado). Solo se acepta una respuesta marcada tipo "robos":
     si la funcion en la nube todavia no conoce este modo, contestaria sobre barrios y se descarta. */
  function pedirIA(s) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null, timer = ctrl ? setTimeout(function () { ctrl.abort(); }, IA_TIMEOUT_MS) : null;
    return fetch(IA_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({ tipo: 'robos', datos: paraIA(s), consigna: CONSIGNA_IA, observaciones: '' })
    }).then(function (r) { if (!r.ok) throw new Error('IA ' + r.status); return r.json(); })
      .then(function (j) { return (j && j.tipo === 'robos' && typeof j.texto === 'string' && j.texto.trim().length > 40) ? j.texto : null; })
      .catch(function (e) { console.warn('Informe de robos: sin análisis de IA', e); return null; })
      .then(function (t) { if (timer) clearTimeout(timer); return t; });
  }

  /* ======================= 4. PDF (usa PdfX de index.html) ======================= */
  function capturarMapa() {
    return Promise.resolve().then(function () {
      var m = window.mymap; if (!m || !window.html2canvas) return null;
      return window.html2canvas(m.getContainer(), { scale: 1, useCORS: true, backgroundColor: '#ffffff', logging: false }).then(function (cv) {
        cv.toDataURL('image/jpeg', 0.5);       // si el lienzo quedo "contaminado" por mosaicos sin CORS, esto falla y se omite el mapa
        return cv;
      });
    }).catch(function (e) { console.warn('Informe de robos: no se pudo capturar el mapa', e); return null; });
  }

  function armarPDF(s, textoIA, mapa) {
    var X = (typeof PdfX !== 'undefined') ? PdfX : window.PdfX, C = X.COL, lim = X.limpiar, fmt = X.fmt;
    var jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    var pdf = new jsPDF('p', 'mm', 'a4');
    var ctx = X.crear(pdf, { titulo: 'CIMU · Informe de robo automotor' });
    var an = s.an, r = s.robos, fecha = new Date(s.generado).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
    var filtrosTxt = s.filtros.texto + (s.filtros.resultado !== 'Todos los Resultados' ? ' · Resultado: ' + s.filtros.resultado : '') + (s.filtros.barrios.length ? ' · Barrio: ' + (s.filtros.barrios.length <= 3 ? s.filtros.barrios.join(', ') : s.filtros.barrios.length + ' barrios') : '');

    /* --- portada --- */
    ctx.setF(C.navy); pdf.rect(0, 0, ctx.pageW, 118, 'F');
    ctx.setF(C.blue); pdf.rect(0, 0, 8, 118, 'F');
    ctx.fuente(11, 'bold', C.pale); pdf.text('CIMU · MAR DEL PLATA', 20, 30);
    ctx.fuente(30, 'bold', C.white); pdf.text('Informe de robo', 20, 56); pdf.text('automotor', 20, 68);
    ctx.fuente(11.5, 'normal', C.pale); pdf.text(pdf.splitTextToSize(lim(filtrosTxt), ctx.pageW - 40), 20, 84);
    ctx.fuente(9.5, 'normal', C.pale); pdf.text('Generado el ' + lim(fecha), 20, 108);
    ctx.st.y = 128;
    ctx.tarjetas([
      { v: fmt(r.n), l: 'Robos', n: 'con los filtros actuales', color: C.red },
      { v: coma(r.detPct) + '%', l: 'Con detención', n: r.det + ' de ' + r.n, color: C.amber },
      { v: coma(s.lpr.pct) + '%', l: 'Cobertura LPR', n: 'a ' + s.lpr.radio + ' m de un lector', color: s.lpr.pct < 10 ? C.red : C.green },
      { v: fmt(s.hallazgosPanorama.total), l: 'Hallazgos', n: 'por zona, no por vehículo', color: C.blue }
    ]);
    ctx.parrafo('Este informe resume lo que muestra el mapa con los filtros elegidos. Las cifras, tablas y reglas se calculan con los mismos datos de los paneles; el apartado de análisis redactado (si figura) usa inteligencia artificial sobre esas cifras. Es un borrador de trabajo para validar en terreno.', { size: 9.5, color: C.gray });

    /* --- en un minuto --- */
    ctx.nuevaPagina(); ctx.st.seccion = 'En un minuto';
    ctx.titulo1('En un minuto');
    var n = 1;
    var tend = r.mensual ? (r.mensual.valores[11] + ' ' + pl(r.mensual.valores[11], 'robo', 'robos') + ' en ' + r.mensual.referencia + (r.mensual.valores[10] ? ' (mes anterior: ' + r.mensual.valores[10] + ')' : '')) : '';
    ctx.puntoClave(n++, 'Volumen', r.n + ' ' + pl(r.n, 'robo', 'robos') + ' con los filtros actuales.' + (tend ? ' ' + tend + '.' : '') + (an.muestraChica ? ' Muestra chica: leer las variaciones con cautela.' : ''), C.red);
    var cuando = [];
    if (an.franja) cuando.push('la franja de ' + textoFranja(an) + ' concentra ' + coma(Math.round(an.franja.share * 1000) / 10) + '% de los avisos');
    if (an.dias.length) cuando.push('se destacan los ' + textoDias(an));
    ctx.puntoClave(n++, 'Cuándo', cuando.length ? cuando.join('; ') + '.' : 'Ninguna franja ni día se destaca con claridad en esta selección.', C.amber);
    var donde = s.zonas.length ? 'La zona con más robos es ' + s.zonas[0].dir + ' (' + s.zonas[0].n + '). ' + (an.suben.length ? 'Con tendencia en suba: ' + an.suben.slice(0, 3).map(function (z) { return z.dir; }).join('; ') + '.' : 'Ninguna zona muestra una suba clara.') : 'No hay zonas de ' + s.filtros.radioZona + ' m con ' + s.zonasMin + ' o más robos.';
    ctx.puntoClave(n++, 'Dónde', donde, C.blue);
    ctx.puntoClave(n++, 'Tecnología', 'Cobertura LPR de ' + coma(s.lpr.pct) + '% (' + s.lpr.lectores + ' lectores).' + (s.lpr.sitios.length ? ' Primer sitio candidato: ' + s.lpr.sitios[0].dir + ' (+' + s.lpr.sitios[0].n + ' robos).' : ''), C.purple);
    var recs = recomendaciones(s);
    ctx.puntoClave(n++, 'Qué hacer primero', recs.length ? recs[0].accion + '.' : 'Con esta selección hay pocos datos para recomendar acciones.', C.green);

    ctx.nuevaPagina(); ctx.st.y = ctx.BOT;     // pagina reservada para el indice

    /* --- 1. panorama --- */
    ctx.banner(1, 'Panorama del período', filtrosTxt);
    ctx.caja('info', 'QUÉ ESTAMOS VIENDO', 'Cantidad de robos automotor con los filtros del mapa, cuántos terminaron con detención y cómo evolucionó el último año.');
    if (r.mensual) {
      ctx.titulo2('Robos por mes (últimos 12 meses)');
      ctx.columnas(r.mensual.valores.map(function (v, i) { return { v: v, l: r.mensual.etiquetas[i].replace(' ', ' ') }; }), { colores: r.mensual.valores.map(function (v, i) { return i === 11 ? C.red : C.pale; }), altura: 36 });
      ctx.leyenda('La barra roja es ' + (r.mensual.elegido ? 'el mes elegido' : 'el último mes con datos') + '. Se cuentan los robos con ubicación y con el filtro de resultado, sin importar el año elegido.' + (r.mensual.enCurso ? ' Es el mes en curso: puede estar incompleto.' : ''));
    }
    ctx.caja('ok', 'EN PALABRAS SIMPLES', r.n + ' ' + pl(r.n, 'robo', 'robos') + ' en el período, con ' + r.det + ' ' + pl(r.det, 'detención', 'detenciones') + ' (' + coma(r.detPct) + '%).' + (an.muestraChica ? ' Son pocos casos: conviene mirar la evolución en períodos más largos.' : ''));

    /* --- 2. cuando --- */
    ctx.banner(2, 'Cuándo ocurren', 'Horario del aviso y día de la semana');
    if (r.conHora) {
      var b3 = [], i;
      for (i = 0; i < 8; i++) b3.push({ v: r.hora[3 * i] + r.hora[3 * i + 1] + r.hora[3 * i + 2], l: (3 * i) + '-' + (3 * i + 3) });
      ctx.titulo2('Robos por franja horaria (' + r.conHora + ' con hora registrada)');
      ctx.columnas(b3, { color: C.amber, altura: 34 });
      ctx.leyenda('Horas del día en bloques de 3 horas. Si los casos se repartieran parejos, cada bloque tendría 12,5%.');
    } else ctx.parrafo('No hay hora registrada en este período (los años anteriores a 2025 no la traen).', { color: C.gray });
    if (r.conDia) {
      ctx.titulo2('Robos por día de la semana');
      ctx.columnas(r.dia.map(function (v, k) { return { v: v, l: DIA3[k] }; }), { colores: r.dia.map(function (v, k) { return an.dias.indexOf(k) >= 0 ? C.red : C.blue; }), altura: 34 });
    }
    ctx.caja('ok', 'EN PALABRAS SIMPLES', (an.franja ? 'La franja de ' + textoFranja(an) + ' reúne ' + coma(Math.round(an.franja.share * 1000) / 10) + '% de los avisos (con un reparto parejo sería 12,5%). ' : 'Ninguna franja de 3 horas se destaca claramente. ') + (an.dias.length ? 'Los ' + textoDias(an) + ' tienen más robos que el resto.' : 'Ningún día se destaca con claridad.'));
    ctx.caja('warn', 'OJO CON ESTO', 'Es la hora del aviso, no siempre la del hecho. Entre 18 y 24 h se concentra el ' + coma(an.noche) + '% de los avisos con hora.');

    /* --- 3. donde --- */
    ctx.banner(3, 'Dónde se concentran', 'Zonas de ' + s.filtros.radioZona + ' m y esquinas con más robos');
    if (mapa) { ctx.titulo2('Mapa con los filtros actuales'); ctx.imagen(mapa, []); ctx.leyenda('Captura del mapa en el momento de generar el informe. Se ven las capas que estaban activadas.'); }
    if (s.zonas.length) {
      ctx.tabla(['#', 'Zona (esquina más cercana al centro)', 'Robos', 'Tendencia', 'Detalle'],
        s.zonas.map(function (z) { return [z.pos, z.dir, z.n, z.tendencia.rotulo, z.tendencia.texto]; }), [0.06, 0.34, 0.09, 0.18, 0.33], { negritaPrimera: false });
      ctx.leyenda('Cada zona suma todos los robos dentro de ' + s.filtros.radioZona + ' m de su centro. Se listan zonas con ' + s.zonasMin + ' robos o más, sin superponerse.');
    } else ctx.parrafo('No hay zonas de ' + s.filtros.radioZona + ' m con ' + s.zonasMin + ' o más robos con estos filtros. Probá con una zona más grande o con otro período.', { color: C.gray });
    if (s.esquinas.length) {
      ctx.titulo2('Esquinas con más robos');
      ctx.barras(s.esquinas.slice(0, 8).map(function (e) { return { l: e.dir, v: e.n }; }), { labelW: 78, color: C.red });
    }
    ctx.caja('warn', 'OJO CON ESTO', 'Una zona con muchos robos acumulados puede estar enfriándose, y una con pocos puede estar creciendo. La columna Tendencia compara ' + (r.mensual && r.mensual.elegido ? 'el mes elegido con el anterior' : 'los últimos 3 meses con los 3 anteriores') + '; con menos de ' + DIF_MIN + ' hechos de diferencia se considera estable.');

    /* --- 4. hallazgos --- */
    ctx.banner(4, 'Hallazgos de vehículos', 'Dónde se detectaron autos recuperados o secuestrados');
    var hp = s.hallazgosPanorama;
    ctx.tarjetas([
      { v: fmt(hp.H), l: 'Hallazgo automotor', color: C.amber }, { v: fmt(hp.L), l: 'Recuperado por LPR', color: C.purple },
      { v: fmt(hp.S), l: 'Secuestro de vehículo', color: C.green }, { v: coma(hp.porCien), l: 'Hallazgos c/100 robos', n: 'por zona, no por vehículo', color: C.blue }
    ]);
    if (s.hallazgosMapa && s.hallazgosMapa.zonas.length) {
      ctx.titulo2('Zonas con más hallazgos (' + s.hallazgosMapa.radio + ' m) · ' + s.hallazgosMapa.periodo);
      ctx.tabla(['#', 'Zona', 'Hallazgos', 'Composición'], s.hallazgosMapa.zonas.map(function (z, k) { return [k + 1, z.dir, z.n, z.tipos.H + ' automotor, ' + z.tipos.L + ' LPR, ' + z.tipos.S + ' secuestro']; }), [0.06, 0.44, 0.14, 0.36], { negritaPrimera: false });
    } else ctx.parrafo('El mapa de hallazgos no tiene zonas con 3 casos o más con la selección actual, o la capa no está activa.', { color: C.gray });
    if (an.coinciden.length) ctx.caja('info', 'COINCIDENCIAS ENTRE ROBOS Y HALLAZGOS', an.coinciden.slice(0, 3).map(function (c) { return 'La zona de robos de ' + c.robo.dir + ' coincide con la zona de hallazgos de ' + c.hallazgo.dir + '.'; }).concat('Puede indicar un corredor de paso o descarte; se confirma con trabajo en terreno.'));
    ctx.caja('warn', 'OJO CON ESTO', 'En los hallazgos, la dirección puede ser el lugar del robo o el del hallazgo. Un robo y el hallazgo de ese auto no se pueden unir porque los datos no traen patente.');

    /* --- 5. LPR --- */
    ctx.banner(5, 'Lectores de patentes (LPR)', 'Cobertura actual y sitios candidatos');
    ctx.tarjetas([
      { v: coma(s.lpr.pct) + '%', l: 'Robos con lector cerca', n: 'a ' + s.lpr.radio + ' m o menos', color: an.lprBaja ? C.red : C.green },
      { v: fmt(s.lpr.cubiertos), l: 'Robos cubiertos', n: 'de ' + r.n, color: C.blue }, { v: fmt(s.lpr.lectores), l: 'Lectores en el mapa', color: C.purple }
    ]);
    if (s.lpr.sitios.length) {
      ctx.tabla(['#', 'Sitio sugerido', 'Robos que sumaría'], s.lpr.sitios.map(function (x) { return [x.pos, x.dir, '+' + x.n]; }), [0.07, 0.68, 0.25], { negritaPrimera: false });
    } else ctx.parrafo('No hay sitios que sumen cobertura con esta selección.', { color: C.gray });
    ctx.caja('warn', 'OJO CON ESTO', 'Los sitios son candidatos calculados con los robos del período: hay que validarlos en terreno (calles, accesos, energía, conectividad y ángulo de captura). Más cámaras en un lugar dan más detecciones, no necesariamente menos robos.');

    /* --- 6. recomendaciones --- */
    ctx.banner(6, 'Recomendaciones priorizadas', 'Se recalculan con cada selección');
    if (recs.length) ctx.tabla(['Prioridad', 'Acción', 'Por qué', 'Plazo'], recs.map(function (x) { return [x.prio, x.accion, x.porque, x.plazo]; }), [0.1, 0.38, 0.35, 0.17]);
    else ctx.parrafo('Con esta selección hay muy pocos casos para sugerir acciones. Ampliá el período.', { color: C.gray });
    ctx.caja('info', 'CÓMO SE ARMAN', 'Salen de reglas fijas aplicadas a las cifras de este informe (tendencias, franja pico, cobertura LPR, coincidencias). Son hipótesis de trabajo que deben evaluar quienes conocen la operación en la calle.');

    /* --- 7. plan --- */
    ctx.banner(7, 'Plan de patrullaje sugerido', 'Zonas, días y franjas');
    var pl7 = plan(s);
    if (pl7.length) {
      ctx.tabla(['Zona', 'Prioridad', 'Días', 'Franja', 'Modalidad'], pl7.map(function (x) { return [x.zona, x.prio, x.dias, x.franja, x.modalidad]; }), [0.34, 0.12, 0.17, 0.15, 0.22]);
      ctx.caja('warn', 'OJO CON ESTO', 'Los días y la franja se calculan sobre todos los robos del filtro, no zona por zona. La modalidad es una referencia de partida: la dotación real la define la operación.');
    } else ctx.parrafo('No hay zonas para armar un plan con esta selección.', { color: C.gray });

    /* --- 8. IA --- */
    if (textoIA) {
      ctx.banner(8, 'Análisis redactado con IA', 'Sobre las cifras de este informe');
      ctx.caja('warn', 'LEER CON CRITERIO', 'Este apartado lo redactó una inteligencia artificial a partir de las cifras anteriores. Puede contener errores de interpretación: contrastarlo con las tablas y revisarlo antes de usarlo.');
      if (X.ia) X.ia(ctx, textoIA); else ctx.parrafo(textoIA);
    }

    /* --- limitaciones --- */
    ctx.banner(textoIA ? 9 : 8, 'Limitaciones y cómo leer los números', 'Para no sacar conclusiones equivocadas');
    ctx.lista(limitaciones(s));

    /* --- indice y pies --- */
    var st = ctx.st, previa = ctx.pagina(), yPrev = st.y;
    pdf.setPage(3); st.y = ctx.TOP;
    ctx.fuente(20, 'bold', C.navy); pdf.text('Índice', ctx.M, st.y + 6); st.y += 16;
    st.toc.forEach(function (e) {
      ctx.fuente(11.5, 'normal', C.ink); pdf.text(lim(e.texto), ctx.M + 2, st.y);
      ctx.fuente(11.5, 'bold', C.navy); pdf.text(String(e.pagina), ctx.M + ctx.W - 2, st.y, { align: 'right' });
      try { pdf.link(ctx.M, st.y - 5, ctx.W, 7, { pageNumber: e.pagina }); } catch (x) { /* sin links */ }
      st.y += 8.5;
    });
    st.y = yPrev; pdf.setPage(previa);
    ctx.pies('Informe de robo automotor · CIMU · borrador a validar en terreno');
    return pdf;
  }

  /* ======================= 5. Boton ======================= */
  function nombreArchivo(s) {
    var t = s.filtros.texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return 'Informe_Robos_' + t + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
  }

  function generar() {
    var btn = $('informe-robos-btn'), usarIA = $('informe-robos-ia') ? $('informe-robos-ia').checked : false;
    var rotulo = btn.textContent;
    function paso(t) { btn.textContent = t; }
    btn.disabled = true; paso('Reuniendo datos…');
    return reunir().then(function (s) {
      if (!s.robos.n) throw new Error('No hay robos con los filtros actuales.');
      paso('Capturando el mapa…');
      return capturarMapa().then(function (mapa) {
        paso(usarIA ? 'Redactando análisis…' : 'Armando PDF…');
        return (usarIA ? pedirIA(s) : Promise.resolve(null)).then(function (txt) {
          paso('Armando PDF…');
          var pdf = armarPDF(s, txt, mapa);
          pdf.save(nombreArchivo(s));
          if (usarIA && !txt) alert('El informe se generó sin el apartado de IA (no hubo respuesta del servicio).');
        });
      });
    }).catch(function (e) { console.error('Informe de robos:', e); alert('No pude generar el informe: ' + (e && e.message ? e.message : e)); })
      .then(function () { btn.disabled = false; btn.textContent = rotulo; });
  }

  function crearBoton() {
    if ($('informe-robos-btn')) return;
    var ancla = $('panorama-robos-checkbox'), nodo = ancla && ((ancla.closest && ancla.closest('div')) || ancla.parentNode);
    nodo = nodo || $('zonas-robos-opc') || $('robo-info');
    if (!nodo) return;
    nodo.insertAdjacentHTML('afterend',
      '<div id="informe-robos-caja" style="margin-top:8px;">' +
      '<button type="button" id="informe-robos-btn" style="width:100%;padding:7px 8px;cursor:pointer;background:#14365f;color:#fff;border:0;border-radius:4px;font:inherit;font-size:12px;font-weight:bold;">Generar informe de robos (PDF)</button>' +
      '<label style="display:block;margin-top:3px;font-size:11px;"><input type="checkbox" id="informe-robos-ia" checked> Incluir análisis redactado con IA</label></div>');
    $('informe-robos-btn').addEventListener('click', generar);
  }

  function iniciar() { crearBoton(); }
  window.CIMUInformeRobos = { reunir: reunir, armarPDF: armarPDF, recomendaciones: recomendaciones, plan: plan, limitaciones: limitaciones, tendencia: tendencia, analizar: analizar, paraIA: paraIA, consigna: CONSIGNA_IA };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
    window.addEventListener('load', crearBoton);
  }
})();
