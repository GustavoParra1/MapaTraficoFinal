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
      var salida = [], sinUbicar = 0;
      filas.slice(1).forEach(function (f) {
        var o = {};
        cab.forEach(function (h, i) { o[h] = (f[i] || '').trim(); });
        var clave = CLAVE_POR_RESULTADO[norm(o['Resultado'])];
        if (!clave) return;
        var p = (o['Longitud y Latitud'] || '').split(',');
        var lon = parseFloat(p[0]), lat = parseFloat(p[1]);
        if (p.length !== 2 || isNaN(lat) || isNaN(lon)) { sinUbicar++; return; }
        if (o['estado_coordenada'] === 'revisar') { sinUbicar++; return; }   // ubicacion dudosa: no se dibuja
        o._lat = lat; o._lon = lon; o._enBarrio = true; o._tipo = clave;
        salida.push(o);
      });
      return { filas: salida, sinUbicar: sinUbicar };
    });
  }

  function cargarDatos() {
    if (datos) return Promise.resolve();
    if (cargando) return cargando;
    cargando = Promise.all(FUENTES.map(leerFuente)).then(function (res) {
      datos = []; excluidos = 0;
      res.forEach(function (r) { datos = datos.concat(r.filas); excluidos += r.sinUbicar; });
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
        radius: 7, color: '#ffffff', weight: 1.5, fillColor: TIPOS[d._tipo].color, fillOpacity: 0.9
      });
      m.bindPopup(popup(d));
      return m;
    });
    capa.addLayers(marcadores);
    if (calor) {
      try { calor.setLatLngs(lista.map(function (d) { return [d._lat, d._lon]; })); }
      catch (e) { console.error('Hallazgos: mapa de calor', e); }
    }
  }

  /* ---------- activar / desactivar ---------- */
  function activar() {
    var mapa = window.mymap;
    if (!mapa) { console.error('Hallazgos: no existe window.mymap'); return; }
    if (!capa) capa = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    if (!calor && L.heatLayer) calor = L.heatLayer([], { radius: 25 });
    $('hallayer-info').textContent = 'Cargando...';
    $('hallayer-filtros').style.display = 'block';
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
    $('hallayer-filtros').style.display = 'none';
  }

  /* ---------- bloque HTML (se crea solo) ---------- */
  var HTML_BLOQUE =
    '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;">' +
      '<input type="checkbox" id="hallayer-checkbox"> Hallazgos de vehículos</label>' +
    '<button type="button" id="hallayer-ayuda" style="margin:4px 0 0;width:100%;padding:6px 8px;cursor:pointer;background:#1f5fbf;color:#fff;border:0;border-radius:4px;font:inherit;font-size:13px;">Cómo interpretar este mapa</button>' +
    '<div id="hallayer-filtros" style="display:none;margin-top:6px;font-size:13px;">' +
      '<div id="hallayer-tipos"></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;margin:6px 0;">' +
        '<select id="hallayer-anio" style="width:100%;"><option value="all">Todos los Años</option></select>' +
        '<select id="hallayer-mes" style="width:100%;"><option value="all">Todos los Meses</option></select>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="hallayer-calor"> Mapa de calor</label>' +
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


  /* ---------- ventana "Cómo interpretar este mapa" ---------- */
  var botonAyuda = null;

  function inyectarEstilosAyuda() {
    if ($('hallayer-estilos')) return;
    var st = document.createElement('style');
    st.id = 'hallayer-estilos';
    st.textContent =
      '#hallayer-modal{position:fixed;inset:0;z-index:20000;display:none;align-items:center;justify-content:center;background:rgba(8,20,40,.62);padding:16px;}' +
      '#hallayer-modal .hal-caja{background:#fff;color:#14233a;width:min(740px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:10px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:inherit;}' +
      '#hallayer-modal .hal-cab{background:#0f2a4a;color:#fff;display:flex;align-items:center;gap:12px;padding:14px 18px;}' +
      '#hallayer-modal .hal-cab h2{margin:0;font-size:17px;line-height:1.3;flex:1;color:#fff;}' +
      '#hallayer-modal .hal-x{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.55);border-radius:6px;font-size:20px;line-height:1;width:34px;height:34px;cursor:pointer;}' +
      '#hallayer-modal .hal-x:hover,#hallayer-modal .hal-x:focus{background:rgba(255,255,255,.18);outline:2px solid #fff;}' +
      '#hallayer-modal .hal-cuerpo{padding:16px 20px 20px;overflow-y:auto;font-size:14px;line-height:1.55;}' +
      '#hallayer-modal .hal-cuerpo h3{margin:18px 0 6px;font-size:15px;color:#0f2a4a;}' +
      '#hallayer-modal .hal-cuerpo h3:first-child{margin-top:0;}' +
      '#hallayer-modal .hal-cuerpo p{margin:6px 0;}' +
      '#hallayer-modal .hal-cuerpo ul,#hallayer-modal .hal-cuerpo ol{margin:6px 0;padding-left:22px;}' +
      '#hallayer-modal .hal-cuerpo li{margin:3px 0;}' +
      '#hallayer-modal .hal-nota{margin-top:16px;padding:10px 12px;background:#f1f5fb;border-left:3px solid #1f5fbf;font-size:13px;}';
    document.head.appendChild(st);
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
      '<h3>Cómo leer la hora</h3>' +
      '<p>La hora de la planilla es la hora en que se abre el evento. No siempre es la hora del hecho:</p>' +
      '<ul>' +
        '<li><b>Robo automotor:</b> hora de aviso. Se parece a la del hecho en robos recientes, pero incluye denuncias tardías.</li>' +
        '<li><b>LPR recuperado:</b> hora en que la cámara leyó la patente. Es la más confiable.</li>' +
        '<li><b>Hallazgo automotor:</b> hora de la llamada o de la verificación. No dice cuándo se dejó el auto.</li>' +
        '<li><b>Secuestro:</b> hora en que se registra el procedimiento. No dice cuándo se robó ni cuándo se hizo el control.</li>' +
      '</ul>' +
      '<h3>Qué mostraron los datos (abril 2025 a agosto 2026)</h3>' +
      '<ul>' +
        '<li><b>Hallazgos:</b> repartidos en unas 370 zonas distintas, sin una concentración clara. Calles con más casos: Juan B. Justo (19), Alvarado (15) y Pedro Luro (13), con números chicos.</li>' +
        '<li><b>LPR:</b> 107 recuperos en solo 34 puntos, que son donde hay cámaras. Esquinas más repetidas: Juan B. Justo y Güemes (9), Alió y Beruti (8), Mario Bravo y José Hernández (6) y Polonia y De la Plaza (6). El 53% de las lecturas ocurre de 12 a 18 h.</li>' +
        '<li><b>Robos:</b> el pico de avisos es de 19 a 22 h. El 40% se avisa entre las 18 y las 24 h (3.513 registros).</li>' +
        '<li><b>Zonas distintas:</b> donde se roba no es donde aparecen los autos. De las 30 zonas más cargadas de cada lado, solo 3 coinciden.</li>' +
      '</ul>' +
      '<h3>Medidas que se podrían tomar</h3>' +
      '<ol>' +
        '<li><b>Patrullaje preventivo</b> en las zonas de robo entre las 19 y las 22 h, que es el pico de avisos.</li>' +
        '<li><b>Monitoreo LPR reforzado de 12 a 18 h</b>, con un operador dedicado a las alertas de vehículos robados y un protocolo para despachar un móvil en el momento.</li>' +
        '<li><b>Más cámaras LPR</b> en los corredores donde ya detectan: Mario Bravo, Alió, De la Plaza, Alvarado y Juan B. Justo.</li>' +
        '<li><b>Protocolo con Tránsito para autos abandonados:</b> aviso al dueño y acarreo, para que no queden días en la calle.</li>' +
        '<li><b>Verificar en el terreno</b> las esquinas con más casos antes de invertir.</li>' +
      '</ol>' +
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

  document.addEventListener('keydown', function (e) {
    var fondo = $('hallayer-modal');
    if (e.key === 'Escape' && fondo && fondo.style.display === 'flex') cerrarAyuda();
  });

  function iniciar() {
    if (!construirUI()) return;
    $('hallayer-checkbox').addEventListener('change', function (e) { e.target.checked ? activar() : desactivar(); });
    botonAyuda = $('hallayer-ayuda');
    if (botonAyuda) botonAyuda.addEventListener('click', abrirAyuda);
    $('hallayer-anio').addEventListener('change', function () { if (datos) actualizarMeses(); refrescar(); });
    $('hallayer-mes').addEventListener('change', refrescar);
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
