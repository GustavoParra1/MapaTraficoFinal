/* Capa "Hallazgos de vehiculos" del mapa (independiente de Robo Automotor y de Eventos).
   Lee public/eventos.csv y public/robo_automotor.csv y muestra solo los registros cuyo
   resultado es hallazgo automotor, vehiculo recuperado por LPR o secuestro de vehiculo,
   con filtros por tipo, año y mes.
   Cargar DESPUES de eventos-layer.js (usa window.mymap, Leaflet, markercluster y heat).
   El bloque de filtros se crea solo y se inserta debajo del bloque de Eventos
   (si no encuentra ese bloque, usa un panel flotante sobre el mapa).
   Los CSV no traen patente: no se puede unir un robo con el hallazgo del mismo auto. */
(function () {
  'use strict';

  var FUENTES = ['eventos.csv', 'robo_automotor.csv'];
  var MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
               'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var TIPOS = {
    H: { nombre: 'Hallazgo automotor', color: '#92400e', resultado: 'hallazgo automotor' },
    L: { nombre: 'Recuperado por lectura de patente (LPR)', color: '#0f766e', resultado: 'lpr - vehiculo recuperado' },
    S: { nombre: 'Secuestro de vehículo', color: '#78716c', resultado: 'secuestro de vehiculo' }
  };

  var datos = null;            // hallazgos con coordenadas confiables
  var robos = [];              // robos de automotor (solo ubicacion, año y mes) para analizar una zona
  var excluidos = 0;           // hallazgos con coordenada "revisar" (no se dibujan)
  var tiposActivos = null;     // Set con las claves tildadas (H, L, S)
  var capa = null;             // markerClusterGroup
  var calor = null;            // heatLayer
  var cargando = false;
  var etiquetas = {};          // clave -> { txt, lab }
  var firmaAplicada = null;    // seleccion de barrios con la que se calculo _enBarrio

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
  var CLAVE_POR_RESULTADO = {};
  Object.keys(TIPOS).forEach(function (k) { CLAVE_POR_RESULTADO[TIPOS[k].resultado] = k; });

  /* ---------- filtro por barrio (igual que eventos-layer.js) ---------- */
  function barriosSeleccionados() {
    var sel = $('barrio-filter');
    if (!sel) return [];
    return Array.prototype.slice.call(sel.selectedOptions || [])
      .map(function (o) { return o.value; })
      .filter(function (v) { return v && v !== 'all'; });
  }
  function firmaBarrio() { return barriosSeleccionados().slice().sort().join('|'); }

  function aplicarBarrio() {
    if (!datos) return;
    var firma = firmaBarrio();
    if (firma === firmaAplicada) return;
    var f = null;
    if (firma && typeof getSelectedBarrioFeatureCombinada === 'function' && typeof isLatLngInMultiPolygon === 'function') {
      f = getSelectedBarrioFeatureCombinada();
    }
    if (!f || !f.geometry) {
      datos.forEach(function (d) { d._enBarrio = true; });
      firmaAplicada = firma ? null : firma;
      return;
    }
    var coords = f.geometry.coordinates;
    datos.forEach(function (d) { d._enBarrio = isLatLngInMultiPolygon(L.latLng(d._lat, d._lon), coords); });
    firmaAplicada = firma;
  }

  function sincronizarBarrio() {
    var mapa = window.mymap;
    if (!datos || !capa || !mapa || !mapa.hasLayer(capa)) return;
    if (firmaBarrio() !== firmaAplicada) refrescar();
  }

  /* ---------- CSV (separador ;, soporta comillas) ---------- */
  function parseCSV(texto) {
    var filas = [], fila = [], campo = '', enComillas = false, i, c;
    texto = texto.replace(/^\uFEFF/, '');
    for (i = 0; i < texto.length; i++) {
      c = texto[i];
      if (enComillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; } else { enComillas = false; }
        } else { campo += c; }
      } else if (c === '"') { enComillas = true; }
      else if (c === ';') { fila.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.length > 1 || fila[0] !== '') filas.push(fila);
        fila = [];
      } else { campo += c; }
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  /* Lee un CSV y devuelve solo las filas de hallazgo/recupero/secuestro */
  function leerFuente(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('No se pudo leer ' + url + ' (' + r.status + ')');
      return r.text();
    }).then(function (texto) {
      var filas = parseCSV(texto);
      var cab = filas[0].map(function (h) { return h.trim(); });
      var salida = [], sinUbicar = 0, robosArchivo = [];
      var esRobo = /robo_automotor/i.test(url);
      filas.slice(1).forEach(function (f) {
        var o = {};
        cab.forEach(function (h, i) { o[h] = (f[i] || '').trim(); });
        if (esRobo) {
          var q = (o['Longitud y Latitud'] || '').split(',');
          var rlon = parseFloat(q[0]), rlat = parseFloat(q[1]);
          if (q.length === 2 && !isNaN(rlat) && !isNaN(rlon) && o['estado_coordenada'] !== 'revisar') {
            robosArchivo.push({ _lat: rlat, _lon: rlon, 'año': o['año'], 'mes': o['mes'] });
          }
        }
        var clave = CLAVE_POR_RESULTADO[norm(o['Resultado'])];
        if (!clave) return;
        var p = (o['Longitud y Latitud'] || '').split(',');
        var lon = parseFloat(p[0]), lat = parseFloat(p[1]);
        if (p.length !== 2 || isNaN(lat) || isNaN(lon)) { sinUbicar++; return; }
        if (o['estado_coordenada'] === 'revisar') { sinUbicar++; return; }   // ubicacion dudosa: no se dibuja
        o._lat = lat; o._lon = lon; o._enBarrio = true; o._tipo = clave;
        salida.push(o);
      });
      return { filas: salida, sinUbicar: sinUbicar, robos: robosArchivo };
    });
  }

  function cargarDatos() {
    if (datos) return Promise.resolve();
    if (cargando) return cargando;
    cargando = Promise.all(FUENTES.map(leerFuente)).then(function (res) {
      datos = []; robos = []; excluidos = 0;
      res.forEach(function (r) { datos = datos.concat(r.filas); robos = robos.concat(r.robos); excluidos += r.sinUbicar; });
      firmaAplicada = null;
      armarFiltros();
    }).catch(function (e) {
      cargando = false;
      console.error('Hallazgos: error al cargar datos', e);
      var info = $('hallayer-info');
      if (info) info.textContent = 'No se pudieron cargar los hallazgos.';
      throw e;
    });
    return cargando;
  }

  /* ---------- filtros ---------- */
  function contar(campo) {
    var m = {};
    datos.forEach(function (d) { var v = d[campo]; if (v) m[v] = (m[v] || 0) + 1; });
    return m;
  }

  function armarFiltros() {
    tiposActivos = new Set(Object.keys(TIPOS));
    var cont = $('hallayer-tipos');
    cont.innerHTML = '';
    etiquetas = {};
    Object.keys(TIPOS).forEach(function (k) {
      var lab = document.createElement('label');
      lab.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true; cb.value = k;
      cb.addEventListener('change', function () {
        if (cb.checked) tiposActivos.add(k); else tiposActivos.delete(k);
        refrescar();
      });
      var punto = document.createElement('span');
      punto.style.cssText = 'width:12px;height:12px;border-radius:50%;flex:none;box-sizing:border-box;border:2px solid #ffffff;background:' + TIPOS[k].color;
      var txt = document.createElement('span');
      etiquetas[k] = { txt: txt, lab: lab };
      lab.appendChild(cb); lab.appendChild(punto); lab.appendChild(txt);
      cont.appendChild(lab);
    });

    var anios = Object.keys(contar('año')).sort(function (a, b) { return b - a; });
    var selA = $('hallayer-anio');
    selA.innerHTML = '<option value="all">Todos los Años</option>';
    anios.forEach(function (a) { selA.insertAdjacentHTML('beforeend', '<option value="' + esc(a) + '">' + esc(a) + '</option>'); });

    actualizarMeses();
  }

  function actualizarMeses() {
    var anio = $('hallayer-anio').value;
    var selM = $('hallayer-mes');
    var actual = selM.value;
    var m = {};
    datos.forEach(function (d) {
      if ((anio === 'all' || d['año'] === anio) && d['mes']) m[d['mes']] = true;
    });
    var meses = Object.keys(m).sort(function (a, b) { return a - b; });
    selM.innerHTML = '<option value="all">Todos los Meses</option>';
    meses.forEach(function (x) {
      selM.insertAdjacentHTML('beforeend', '<option value="' + esc(x) + '">' + esc(MESES[+x] || x) + '</option>');
    });
    selM.value = (actual !== 'all' && m[actual]) ? actual : 'all';
  }

  /* Cantidad por tipo segun año, mes y barrio (sin contar el filtro por tipo) */
  function actualizarConteos() {
    var anio = $('hallayer-anio').value, mes = $('hallayer-mes').value, c = {};
    datos.forEach(function (d) {
      if (d._enBarrio !== false && (anio === 'all' || d['año'] === anio) && (mes === 'all' || d['mes'] === mes)) {
        c[d._tipo] = (c[d._tipo] || 0) + 1;
      }
    });
    Object.keys(etiquetas).forEach(function (k) {
      var n = c[k] || 0;
      etiquetas[k].txt.textContent = TIPOS[k].nombre + ' (' + n + ')';
      etiquetas[k].lab.style.opacity = n ? '1' : '0.45';
    });
  }

  function filtrados() {
    var anio = $('hallayer-anio').value, mes = $('hallayer-mes').value;
    return datos.filter(function (d) {
      return d._enBarrio !== false &&
             tiposActivos.has(d._tipo) &&
             (anio === 'all' || d['año'] === anio) &&
             (mes === 'all' || d['mes'] === mes);
    });
  }

  /* ---------- dibujo ---------- */
  function popup(d) {
    var t = TIPOS[d._tipo];
    var dia = { Miercoles: 'Miércoles', Sabado: 'Sábado' }[d['dia_semana']] || d['dia_semana'] || '';
    var fecha = d['fecha'] ? ((dia ? dia + ' ' : '') + d['fecha'])
                           : ((MESES[+d['mes']] || d['mes'] || '') + ' ' + (d['año'] || ''));
    var h = '<b style="color:' + t.color + '">' + esc(t.nombre) + '</b><br>' +
            '<b>Dirección:</b> ' + esc(d['Direccion 0'] || 'No especificada') + '<br>' +
            '<b>Fecha:</b> ' + esc(fecha.trim() || 'No especificada') + '<br>' +
            '<b>Tipo de evento:</b> ' + esc(d['Tipo de Evento'] || 'No especificado') + '<br>' +
            '<b>Origen:</b> ' + esc(d['Origen'] || 'No especificado');
    if (d['hora']) h += '<br><b>Hora:</b> ' + esc(d['hora']) + ' hs';
    if (d['Cámaras']) h += '<br><b>Cámaras:</b> ' + esc(d['Cámaras']);
    return h;
  }

  function refrescar() {
    if (!datos || !capa) return;
    aplicarBarrio();
    actualizarConteos();
    var lista = filtrados();
    var nb = barriosSeleccionados();
    $('hallayer-info').textContent = lista.length + (lista.length === 1 ? ' hallazgo' : ' hallazgos') + ' en el mapa' +
      (nb.length ? ' (' + (nb.length <= 2 ? nb.join(' y ') : nb.length + ' barrios') + ')' : '') +
      (excluidos ? '. ' + excluidos + ' con ubicación a revisar no se muestran.' : '');
    capa.clearLayers();
    var marcadores = lista.map(function (d) {
      var m = L.circleMarker([d._lat, d._lon], {
        radius: 7, color: '#ffffff', weight: 1.5, fillColor: TIPOS[d._tipo].color, fillOpacity: 0.9, bubblingMouseEvents: false
      });
      m.bindPopup(popup(d));
      return m;
    });
    capa.addLayers(marcadores);
    if (calor) {
      try { calor.setLatLngs(lista.map(function (d) { return [d._lat, d._lon]; })); }
      catch (e) { console.error('Hallazgos: mapa de calor', e); }
    }
    actualizarCalientes();
  }

  /* ---------- activar / desactivar ---------- */
  function activar() {
    var mapa = window.mymap;
    if (!mapa) { console.error('Hallazgos: no existe window.mymap'); return; }
    if (!capa) capa = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    if (!calor && L.heatLayer) calor = L.heatLayer([], { radius: 25 });
    $('hallayer-info').textContent = 'Cargando...';
    $('hallayer-filtros').style.display = 'block';
    abrirFlotante();
    cargarDatos().then(function () {
      mapa.addLayer(capa);
      refrescar();
    }).catch(function (e) { console.error('Hallazgos: error al mostrar la capa', e); });
  }

  function desactivar() {
    var mapa = window.mymap;
    if (mapa && capa && mapa.hasLayer(capa)) mapa.removeLayer(capa);
    if (mapa && calor && mapa.hasLayer(calor)) mapa.removeLayer(calor);
    var h = $('hallayer-calor'); if (h) h.checked = false;
    var cz = $('hallayer-zona'); if (cz && cz.checked) { cz.checked = false; activarZona(false); }
    limpiarCalientes(); var cc = $('hallayer-calientes'); if (cc) cc.checked = false;
    var oc = $('hallayer-cal-opc'); if (oc) oc.style.display = 'none';
    if (window.mymap && zonaCirculo) { window.mymap.removeLayer(zonaCirculo); zonaCirculo = null; }
    $('hallayer-filtros').style.display = 'none';
    cerrarFlotante();
  }

  /* ---------- bloque HTML (se crea solo) ---------- */
  var HTML_BLOQUE =
    '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;">' +
      '<input type="checkbox" id="hallayer-checkbox"> Hallazgos de vehículos</label>' +
    '<button type="button" id="hallayer-datos" style="margin:4px 0 0;width:100%;padding:6px 8px;cursor:pointer;background:#1f5fbf;color:#fff;border:0;border-radius:4px;font:inherit;font-size:13px;">Ver datos y medidas</button>' +
    '<button type="button" id="hallayer-ayuda" style="margin:4px 0 0;width:100%;padding:6px 8px;cursor:pointer;background:#1f5fbf;color:#fff;border:0;border-radius:4px;font:inherit;font-size:13px;">Cómo interpretar este mapa</button>' +
    '<div id="hallayer-filtros" style="display:none;margin-top:6px;font-size:13px;">' +
      '<div id="hallayer-tipos"></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;margin:6px 0;">' +
        '<select id="hallayer-anio" style="width:100%;"><option value="all">Todos los Años</option></select>' +
        '<select id="hallayer-mes" style="width:100%;"><option value="all">Todos los Meses</option></select>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="hallayer-calor"> Mapa de calor</label>' +
      '<label style="display:flex;align-items:center;gap:6px;margin-top:4px;"><input type="checkbox" id="hallayer-calientes"> Zonas con más hallazgos</label>' +
      '<div id="hallayer-cal-opc" style="display:none;margin:4px 0 0 24px;">Tamaño de zona: ' +
        '<select id="hallayer-cal-radio"><option value="300">300 m</option><option value="500" selected>500 m</option><option value="1000">1000 m</option></select>' +
        '<div id="hallayer-cal-lista" style="font-size:12px;"></div></div>' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:4px;">' +
        '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="hallayer-zona"> Analizar una zona (clic en el mapa)</label>' +
        '<div id="hallayer-zona-opc" style="display:none;margin-left:24px;white-space:nowrap;">Radio: ' +
          '<select id="hallayer-radio"><option value="300">300 m</option><option value="500" selected>500 m</option><option value="1000">1000 m</option></select></div>' +
      '</div>' +
      '<div id="hallayer-info" style="margin-top:4px;opacity:.8;"></div>' +
    '</div>';

  function construirUI() {
    if ($('hallayer-checkbox')) return true;           // ya estaba en index.html
    var ancla = $('evtlayer-filtros');
    if (ancla && ancla.parentNode) {
      var bloque = document.createElement('div');
      bloque.id = 'hallayer-bloque';
      bloque.style.cssText = 'margin:8px 0;';
      bloque.innerHTML = HTML_BLOQUE;
      ancla.parentNode.insertBefore(bloque, ancla.nextSibling);
      return true;
    }
    // Sin bloque de Eventos: panel flotante sobre el mapa
    var mapa = window.mymap;
    if (mapa && window.L && L.control) {
      var Panel = L.Control.extend({
        onAdd: function () {
          var div = L.DomUtil.create('div', 'leaflet-bar');
          div.id = 'hallayer-bloque';
          div.style.cssText = 'background:#fff;color:#14233a;padding:8px 10px;border-radius:6px;max-width:260px;';
          div.innerHTML = HTML_BLOQUE;
          L.DomEvent.disableClickPropagation(div);
          L.DomEvent.disableScrollPropagation(div);
          return div;
        }
      });
      new Panel({ position: 'bottomleft' }).addTo(mapa);
      return true;
    }
    console.warn('Hallazgos: no se pudo crear el bloque de filtros (falta window.mymap)');
    return false;
  }



  /* ---------- analizar una zona: clic en el mapa y se cuentan robos y hallazgos alrededor ---------- */
  var zonaActiva = false, zonaCirculo = null, zonaPunto = null;

  function etiquetaPeriodo() {
    var a = $('hallayer-anio').value, m = $('hallayer-mes').value;
    if (a === 'all' && m === 'all') return 'todo el período cargado';
    if (m === 'all') return 'año ' + a;
    return (MESES[+m] || m) + (a === 'all' ? ' (todos los años)' : ' de ' + a);
  }

  function contarZona(ll, radio) {
    var mapa = window.mymap;
    var a = $('hallayer-anio').value, m = $('hallayer-mes').value;
    function pasa(d) { return (a === 'all' || d['año'] === a) && (m === 'all' || d['mes'] === m); }
    var r = { robos: 0, H: 0, L: 0, S: 0 };
    robos.forEach(function (d) { if (pasa(d) && mapa.distance(ll, [d._lat, d._lon]) <= radio) r.robos++; });
    datos.forEach(function (d) { if (pasa(d) && mapa.distance(ll, [d._lat, d._lon]) <= radio) r[d._tipo]++; });
    return r;
  }

  function mostrarZona(ll, radioForzado) {
    var mapa = window.mymap;
    if (!mapa || !datos) return;
    zonaPunto = ll;
    var radio = radioForzado || parseInt($('hallayer-radio').value, 10) || 500;
    var r = contarZona(ll, radio);
    var totalH = r.H + r.L + r.S;
    if (zonaCirculo) mapa.removeLayer(zonaCirculo);
    zonaCirculo = L.circle(ll, { radius: radio, color: '#1f5fbf', weight: 2, dashArray: '6 6',
                                 fillColor: '#1f5fbf', fillOpacity: 0.08, interactive: false }).addTo(mapa);
    var punto = function (c) { return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + c + ';margin-right:6px;"></span>'; };
    var html =
      '<div style="min-width:230px;">' +
      '<b>Zona analizada</b> (radio ' + radio + ' m)<hr style="margin:6px 0;border:0;border-top:1px solid #d9e1ec;">' +
      punto('#2f6fdd') + 'Robos de automotor: <b>' + r.robos + '</b><br>' +
      punto(TIPOS.H.color) + 'Hallazgos de vehículos: <b>' + totalH + '</b><br>' +
      '<div style="margin:2px 0 0 16px;font-size:12px;color:#5b6b82;">' +
        'Hallazgo automotor: ' + r.H + '<br>Recuperado por LPR: ' + r.L + '<br>Secuestro de vehículo: ' + r.S + '</div>' +
      '<div style="margin-top:6px;font-size:12px;color:#5b6b82;">Período: ' + esc(etiquetaPeriodo()) + '</div>' +
      '<div style="margin-top:6px;font-size:12px;color:#5b6b82;">No se sabe si los autos hallados son los mismos que se robaron ahí: los datos no traen patente.</div>' +
      '<div style="margin-top:6px;font-size:11px;color:#8a97ab;">' + ll.lat.toFixed(5) + ', ' + ll.lng.toFixed(5) + '</div>' +
      '</div>';
    L.popup({ maxWidth: 320 }).setLatLng(ll).setContent(html).openOn(mapa);
  }

  function alHacerClicEnMapa(e) {
    if (zonaActiva && datos) mostrarZona(e.latlng);
  }

  function activarZona(valor) {
    var mapa = window.mymap;
    zonaActiva = !!valor;
    $('hallayer-zona-opc').style.display = zonaActiva ? 'block' : 'none';
    if (!mapa) return;
    mapa.getContainer().style.cursor = zonaActiva ? 'crosshair' : '';
    if (zonaActiva) mapa.on('click', alHacerClicEnMapa);
    else {
      mapa.off('click', alHacerClicEnMapa);
      if (zonaCirculo) { mapa.removeLayer(zonaCirculo); zonaCirculo = null; }
      zonaPunto = null;
    }
  }

  /* ---------- ventana "Cómo interpretar este mapa" ---------- */
  /* ---------- zonas con mas hallazgos: calor fuerte + ranking (sin hacer clic punto por punto) ---------- */
  var calCapa = null, calCalor = null, calZonas = [];
  var CAL_MIN = 3, CAL_MAX_ZONAS = 10;
  var calListaAbierta = false;   // el desplegable de la lista arranca cerrado y recuerda si lo abriste

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
    l.innerHTML = '<details id="hallayer-cal-det"' + (calListaAbierta ? ' open' : '') + ' style="margin-top:6px;">' +
      '<summary style="cursor:pointer;font-weight:600;">Las ' + zonas.length + ' zonas con más hallazgos</summary>' +
      '<div style="max-height:180px;overflow-y:auto;">' +
      zonas.map(function (z, i) {
        return '<div class="hallayer-zona-item" data-i="' + i + '" style="cursor:pointer;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.18);line-height:1.25;">' +
               (i + 1) + '. <b>' + esc(z.dir) + '</b> <span style="opacity:.85;">(' + z.n + ')</span></div>';
      }).join('') +
      '</div>' +
      '<div style="font-size:11px;opacity:.75;margin-top:4px;">Zonas de ' + radio + ' m con ' + CAL_MIN + ' o más hallazgos, sin superponerse. Tocá una para acercarte y ver también cuántos robos hubo ahí.</div>' +
      '</details>';
    var det = $('hallayer-cal-det');
    if (det) det.addEventListener('toggle', function () { calListaAbierta = det.open; });
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


  var botonAyuda = null;

  function inyectarEstilosAyuda() {
    if ($('hallayer-estilos')) return;
    var st = document.createElement('style');
    st.id = 'hallayer-estilos';
    st.textContent =
      '#hallayer-modal{position:fixed;inset:0;z-index:20000;display:none;align-items:center;justify-content:center;background:rgba(8,20,40,.62);padding:16px;}' +
      '#hallayer-modal .hal-caja{background:#fff;color:#14233a;width:min(740px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:10px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:inherit;}' +
      '.hal-cab{background:#0f2a4a;color:#fff;display:flex;align-items:center;gap:12px;padding:14px 18px;}' +
      '.hal-cab h2{margin:0;font-size:17px;line-height:1.3;flex:1;color:#fff;}' +
      '.hal-x{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.55);border-radius:6px;font-size:20px;line-height:1;width:34px;height:34px;cursor:pointer;flex:none;}' +
      '.hal-x:hover,.hal-x:focus{background:rgba(255,255,255,.18);outline:2px solid #fff;}' +
      '.hal-cuerpo{padding:16px 20px 20px;overflow-y:auto;font-size:14px;line-height:1.55;color:#14233a;}' +
      '.hal-cuerpo h3{margin:18px 0 6px;font-size:15px;color:#0f2a4a;}' +
      '.hal-cuerpo h3:first-child{margin-top:0;}' +
      '.hal-cuerpo p{margin:6px 0;}' +
      '.hal-cuerpo ul,.hal-cuerpo ol{margin:6px 0;padding-left:22px;}' +
      '.hal-cuerpo li{margin:3px 0;}' +
      '.hal-nota{margin-top:16px;padding:10px 12px;background:#f1f5fb;border-left:3px solid #1f5fbf;font-size:13px;}' +
      '.hal-enlace{background:none;border:0;padding:0;color:#1f5fbf;text-decoration:underline;cursor:pointer;font:inherit;}' +
      /* ventana flotante: se arrastra y deja el mapa usable */
      '#hallayer-flotante{position:fixed;z-index:19000;display:none;flex-direction:column;width:min(440px,calc(100vw - 16px));max-height:64vh;background:#fff;color:#14233a;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.5);border:1px solid rgba(15,42,74,.4);font-family:inherit;}' +
      '#hallayer-flotante .hal-cab{cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;padding:9px 12px;gap:10px;}' +
      '#hallayer-flotante .hal-cab:focus{outline:2px solid #fff;outline-offset:-4px;}' +
      '#hallayer-flotante .hal-cab h2{font-size:14px;}' +
      '#hallayer-flotante .hal-agarre{font-size:18px;line-height:1;opacity:.75;flex:none;}' +
      '#hallayer-flotante .hal-x{width:30px;height:30px;font-size:18px;}' +
      '#hallayer-flotante .hal-cuerpo{font-size:13px;padding:12px 16px 14px;}' +
      '@media (max-width:760px){#hallayer-flotante{left:8px !important;right:8px;top:auto !important;bottom:8px;width:auto;max-height:50vh;}#hallayer-flotante .hal-cab{cursor:default;}}';
    document.head.appendChild(st);
  }

  /* Texto compartido por la ventana grande y la ventana flotante */
  function htmlDatosYMedidas() {
    return '' +
      '<h3>Qué mostraron los datos (abril 2025 a agosto 2026)</h3>' +
      '<ul>' +
        '<li><b>Hallazgos:</b> los 470 hallazgos están repartidos en unas 370 zonas (cuadrados de 250 m de lado, unas 2 o 3 cuadras): en 297 de esas zonas hubo un solo caso y el máximo en una zona es 8. No hay una concentración clara. Calles con más casos: Juan B. Justo (19), Alvarado (15) y Pedro Luro (13), con números chicos.</li>' +
        '<li><b>LPR:</b> 107 recuperos en solo 34 puntos, que son donde hay cámaras. Esquinas más repetidas: Juan B. Justo y Güemes (9), Alió y Beruti (8), Mario Bravo y José Hernández (6) y Polonia y De la Plaza (6). El 53% de las lecturas ocurre de 12 a 18 h.</li>' +
        '<li><b>Robos:</b> el pico de avisos es de 19 a 22 h. El 40% se avisa entre las 18 y las 24 h (3.513 registros).</li>' +
        '<li><b>Robos y hallazgos:</b> coinciden en las mismas áreas generales, pero casi nunca en las mismas cuadras. Entre las 30 zonas más cargadas de cada lado, solo 3 coinciden si las zonas son de 250 m, y 9 o 10 si son de 500 m (por pura casualidad se esperarían 1 o 2). Un robo y el hallazgo de ese mismo auto no se pueden unir, porque los datos no traen patente.</li>' +
      '</ul>' +
      '<h3>Medidas que se podrían tomar</h3>' +
      '<ol>' +
        '<li><b>Patrullaje preventivo</b> en las zonas de robo entre las 19 y las 22 h, que es el pico de avisos.</li>' +
        '<li><b>Monitoreo LPR reforzado de 12 a 18 h</b>, con un operador dedicado a las alertas de vehículos robados y un protocolo para despachar un móvil en el momento.</li>' +
        '<li><b>Más cámaras LPR</b> en los corredores donde ya detectan: Mario Bravo, Alió, De la Plaza, Alvarado y Juan B. Justo.</li>' +
        '<li><b>Protocolo con Tránsito para autos abandonados:</b> aviso al dueño y acarreo, para que no queden días en la calle.</li>' +
        '<li><b>Verificar en el terreno</b> las esquinas con más casos antes de invertir.</li>' +
      '</ol>';
  }

  function cuerpoAyuda() {
    var cuenta;
    if (datos) {
      var c = { H: 0, L: 0, S: 0 };
      datos.forEach(function (d) { c[d._tipo]++; });
      cuenta = '<p>En todo el período cargado, la capa muestra <b>' + datos.length + '</b> registros con ubicación confiable: ' +
        '<b>' + c.H + '</b> hallazgos automotor, <b>' + c.L + '</b> recuperados por lectura de patente (LPR) y <b>' + c.S + '</b> secuestros de vehículo.' +
        (excluidos ? ' Otros ' + excluidos + ' tienen la ubicación a revisar y no se dibujan.' : '') + '</p>';
    } else {
      cuenta = '<p>Tildá «Hallazgos de vehículos» para ver las cantidades cargadas.</p>';
    }
    return '' +
      '<h3>Qué se está mirando</h3>' + cuenta +
      '<p>Este mapa muestra <b>dónde se detectan autos</b>, no necesariamente dónde los dejan los ladrones. Cada tipo depende de quién lo detecta: los recuperos LPR aparecen donde hay cámaras y los secuestros donde hay operativos.</p>' +
      '<p>Con <b>Zonas con más hallazgos</b> el mapa se colorea en amarillo, naranja y rojo según dónde se juntan más hallazgos, y se numeran las 10 zonas con más casos. Respeta los tipos, el año y el mes elegidos. Los colores son relativos: marcan las zonas donde hay más hallazgos que en el resto, aunque en números absolutos sean pocos casos.</p>' +
      '<p>Para ver cuántos robos y hallazgos hay alrededor de un punto, tildá <b>Analizar una zona</b> y hacé clic en el mapa: se dibuja un círculo y se cuentan los dos tipos de casos adentro.</p>' +
      '<h3>Cómo leer la hora</h3>' +
      '<p>La hora de la planilla es la hora en que se abre el evento. No siempre es la hora del hecho:</p>' +
      '<ul>' +
        '<li><b>Robo automotor:</b> hora de aviso. Se parece a la del hecho en robos recientes, pero incluye denuncias tardías.</li>' +
        '<li><b>LPR recuperado:</b> hora en que la cámara leyó la patente. Es la más confiable.</li>' +
        '<li><b>Hallazgo automotor:</b> hora de la llamada o de la verificación. No dice cuándo se dejó el auto.</li>' +
        '<li><b>Secuestro:</b> hora en que se registra el procedimiento. No dice cuándo se robó ni cuándo se hizo el control.</li>' +
      '</ul>' +
      htmlDatosYMedidas() +
      '<h3>Qué datos faltan para afinar</h3>' +
      '<p>En el evento de hallazgo conviene registrar la <b>patente</b>, para unirlo con el robo; <b>hace cuántos días estaba el auto</b>, según el vecino; la <b>fecha de la denuncia del robo</b>; y el <b>estado del auto</b> (quemado o desarmado).</p>' +
      '<div class="hal-nota"><b>Límites.</b> El mapa muestra lo que se detecta: donde hay más cámaras o patrullaje, se ve más. Los números por zona son chicos (de 11 a 19 casos por calle). Las medidas son hipótesis de trabajo para que las evalúe quien conoce la operación en la calle. Las lecturas de este texto se hicieron con datos hasta agosto de 2026 y pueden cambiar al sumar meses nuevos.</div>';
  }

  function crearModalAyuda() {
    inyectarEstilosAyuda();
    var fondo = document.createElement('div');
    fondo.id = 'hallayer-modal';
    fondo.innerHTML =
      '<div class="hal-caja" role="dialog" aria-modal="true" aria-labelledby="hallayer-modal-titulo">' +
        '<div class="hal-cab"><h2 id="hallayer-modal-titulo">Hallazgos de vehículos: cómo interpretar este mapa</h2>' +
        '<button type="button" class="hal-x" id="hallayer-modal-cerrar" aria-label="Cerrar">&times;</button></div>' +
        '<div class="hal-cuerpo" id="hallayer-modal-cuerpo" tabindex="0"></div>' +
      '</div>';
    document.body.appendChild(fondo);
    fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrarAyuda(); });
    $('hallayer-modal-cerrar').addEventListener('click', cerrarAyuda);
    return fondo;
  }

  function abrirAyuda() {
    var fondo = $('hallayer-modal') || crearModalAyuda();
    $('hallayer-modal-cuerpo').innerHTML = cuerpoAyuda();
    $('hallayer-modal-cuerpo').scrollTop = 0;
    fondo.style.display = 'flex';
    $('hallayer-modal-cerrar').focus();
  }

  function cerrarAyuda() {
    var fondo = $('hallayer-modal');
    if (fondo) fondo.style.display = 'none';
    if (botonAyuda) botonAyuda.focus();
  }


  /* ---------- ventana flotante con datos y medidas (se abre sola al tildar la capa) ---------- */
  var posFlotante = null;

  function moverFlotante(caja, x, y) {
    var r = caja.getBoundingClientRect();
    x = Math.max(0, Math.min(x, window.innerWidth - r.width));
    y = Math.max(0, Math.min(y, window.innerHeight - Math.min(r.height, 220)));   // siempre queda a la vista la barra y buena parte del texto
    caja.style.left = x + 'px';
    caja.style.top = y + 'px';
    posFlotante = { x: x, y: y };
  }

  function activarArrastre(caja, asa) {
    var dx = 0, dy = 0, arrastrando = false;
    asa.addEventListener('pointerdown', function (e) {
      if (window.innerWidth <= 760) return;
      if (e.target.closest && e.target.closest('.hal-x')) return;
      var r = caja.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      arrastrando = true;
      try { asa.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    });
    asa.addEventListener('pointermove', function (e) {
      if (arrastrando) moverFlotante(caja, e.clientX - dx, e.clientY - dy);
    });
    function fin(e) {
      arrastrando = false;
      try { asa.releasePointerCapture(e.pointerId); } catch (x) {}
    }
    asa.addEventListener('pointerup', fin);
    asa.addEventListener('pointercancel', fin);
    // Con teclado: foco en la barra y flechas para mover
    asa.addEventListener('keydown', function (e) {
      var r = caja.getBoundingClientRect(), paso = 24;
      if (e.key === 'ArrowLeft') moverFlotante(caja, r.left - paso, r.top);
      else if (e.key === 'ArrowRight') moverFlotante(caja, r.left + paso, r.top);
      else if (e.key === 'ArrowUp') moverFlotante(caja, r.left, r.top - paso);
      else if (e.key === 'ArrowDown') moverFlotante(caja, r.left, r.top + paso);
      else return;
      e.preventDefault();
    });
  }

  function crearFlotante() {
    inyectarEstilosAyuda();
    var caja = document.createElement('div');
    caja.id = 'hallayer-flotante';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-label', 'Datos y medidas de hallazgos de vehículos');
    caja.innerHTML =
      '<div class="hal-cab" id="hallayer-flot-asa" tabindex="0" title="Arrastrá para mover" aria-label="Datos y medidas. Con las flechas del teclado se mueve la ventana">' +
        '<span class="hal-agarre" aria-hidden="true">&#8942;&#8942;</span>' +
        '<h2>Datos y medidas</h2>' +
        '<button type="button" class="hal-x" id="hallayer-flot-cerrar" aria-label="Cerrar">&times;</button>' +
      '</div>' +
      '<div class="hal-cuerpo">' + htmlDatosYMedidas() +
        '<p style="margin-top:12px;"><button type="button" class="hal-enlace" id="hallayer-flot-ayuda">Cómo interpretar este mapa</button></p>' +
      '</div>';
    document.body.appendChild(caja);
    activarArrastre(caja, $('hallayer-flot-asa'));
    $('hallayer-flot-cerrar').addEventListener('click', cerrarFlotante);
    $('hallayer-flot-ayuda').addEventListener('click', abrirAyuda);
    return caja;
  }

  function abrirFlotante() {
    var caja = $('hallayer-flotante') || crearFlotante();
    caja.style.display = 'flex';
    var p = posFlotante || { x: Math.min(250, Math.max(8, window.innerWidth - 460)), y: 100 };
    moverFlotante(caja, p.x, p.y);
  }

  function cerrarFlotante() {
    var caja = $('hallayer-flotante');
    if (caja) caja.style.display = 'none';
  }

  document.addEventListener('keydown', function (e) {
    var fondo = $('hallayer-modal');
    if (e.key !== 'Escape') return;
    if (fondo && fondo.style.display === 'flex') { cerrarAyuda(); return; }
    var fl = $('hallayer-flotante');
    if (fl && fl.style.display === 'flex' && fl.contains(document.activeElement)) cerrarFlotante();
  });

  function iniciar() {
    if (!construirUI()) return;
    $('hallayer-checkbox').addEventListener('change', function (e) { e.target.checked ? activar() : desactivar(); });
    $('hallayer-zona').addEventListener('change', function (e) { activarZona(e.target.checked); });
    $('hallayer-radio').addEventListener('change', function () { if (zonaActiva && zonaPunto) mostrarZona(zonaPunto); });
    $('hallayer-anio').addEventListener('change', function () { if (zonaActiva && zonaPunto) mostrarZona(zonaPunto); });
    $('hallayer-mes').addEventListener('change', function () { if (zonaActiva && zonaPunto) mostrarZona(zonaPunto); });
    botonAyuda = $('hallayer-ayuda');
    if (botonAyuda) botonAyuda.addEventListener('click', abrirAyuda);
    if ($('hallayer-datos')) $('hallayer-datos').addEventListener('click', abrirFlotante);
    $('hallayer-anio').addEventListener('change', function () { if (datos) actualizarMeses(); refrescar(); });
    $('hallayer-mes').addEventListener('change', refrescar);
    if ($('hallayer-calientes')) {
      $('hallayer-calientes').addEventListener('change', actualizarCalientes);
      $('hallayer-cal-radio').addEventListener('change', actualizarCalientes);
    }
    $('hallayer-calor').addEventListener('change', function (e) {
      var mapa = window.mymap;
      if (!mapa || !calor) return;
      if (e.target.checked) mapa.addLayer(calor); else mapa.removeLayer(calor);
    });
    var selBarrio = $('barrio-filter');
    if (selBarrio) selBarrio.addEventListener('change', sincronizarBarrio);
    if (typeof window.applyRoboAutomotorFilters === 'function' && !window.applyRoboAutomotorFilters._halEnganchado) {
      var original = window.applyRoboAutomotorFilters;
      window.applyRoboAutomotorFilters = function () {
        var r = original.apply(this, arguments);
        try { sincronizarBarrio(); } catch (e) { console.warn('Hallazgos: no se pudo sincronizar el barrio', e); }
        return r;
      };
      window.applyRoboAutomotorFilters._halEnganchado = true;
    }
  }

  window.HallazgosLayer = {
    cargar: function () { return cargarDatos(); },
    sincronizarBarrio: sincronizarBarrio,
    datos: function () { return datos; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
