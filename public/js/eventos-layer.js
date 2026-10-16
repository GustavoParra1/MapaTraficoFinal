/* Capa "Eventos" del mapa (independiente de Robo Automotor).
   Lee public/eventos.csv (mismas columnas que robo_automotor.csv) y muestra
   los eventos con filtros por tipo, año y mes.
   Cargar DESPUES de script.js (usa window.mymap y Leaflet).
   Para sumar meses: agregar las filas nuevas al final de eventos.csv. */
(function () {
  'use strict';

  var CSV_URL = 'eventos.csv';
  var MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
               'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var COLORES = {
    'Robo/Hurto': '#dc2626',
    'Emergencia De Salud': '#16a34a',
    'Sistema De Alerta / Alarmas': '#f59e0b',
    'Incendio': '#ea580c',
    'Suicidio / Tentativa De Suicidio': '#334155',
    'LPR': '#0891b2',
    'Confrontación': '#be185d',
    'Procedimiento Policial': '#2563eb',
    'Violencia De Genero': '#9333ea'
  };
  var COLOR_OTRO = '#64748b';

  var datos = null;            // todos los eventos con coordenadas válidas
  var tiposActivos = null;     // Set con los tipos tildados
  var capa = null;             // markerClusterGroup
  var calor = null;            // heatLayer
  var cargando = false;
  var etiquetas = {};          // tipo -> <span> con el texto y la cantidad

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function colorDe(tipo) { return COLORES[tipo] || COLOR_OTRO; }

  /* ---------- CSV (separador ;, soporta comillas) ---------- */
  function parseCSV(texto) {
    var filas = [], fila = [], campo = '', enComillas = false, i, c;
    texto = texto.replace(/^﻿/, '');
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

  function cargarDatos() {
    if (datos) return Promise.resolve();
    if (cargando) return cargando;
    cargando = fetch(CSV_URL).then(function (r) {
      if (!r.ok) throw new Error('No se pudo leer ' + CSV_URL + ' (' + r.status + ')');
      return r.text();
    }).then(function (texto) {
      var filas = parseCSV(texto);
      var cab = filas[0].map(function (h) { return h.trim(); });
      datos = [];
      filas.slice(1).forEach(function (f) {
        var o = {};
        cab.forEach(function (h, i) { o[h] = (f[i] || '').trim(); });
        var p = (o['Longitud y Latitud'] || '').split(',');
        var lon = parseFloat(p[0]), lat = parseFloat(p[1]);
        if (p.length !== 2 || isNaN(lat) || isNaN(lon)) return;
        o._lat = lat; o._lon = lon;
        datos.push(o);
      });
      armarFiltros();
    }).catch(function (e) {
      cargando = false;
      console.error('Eventos: error al cargar datos', e);
      var info = $('evtlayer-info');
      if (info) info.textContent = 'No se pudieron cargar los eventos.';
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
    var porTipo = contar('Tipo de Evento');
    var tipos = Object.keys(porTipo).sort(function (a, b) { return porTipo[b] - porTipo[a]; });
    tiposActivos = new Set(tipos);

    var cont = $('evtlayer-tipos');
    cont.innerHTML = '';
    etiquetas = {};
    tipos.forEach(function (t) {
      var lab = document.createElement('label');
      lab.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true; cb.value = t;
      cb.addEventListener('change', function () {
        if (cb.checked) tiposActivos.add(t); else tiposActivos.delete(t);
        refrescar();
      });
      var punto = document.createElement('span');
      punto.style.cssText = 'width:10px;height:10px;border-radius:50%;flex:none;background:' + colorDe(t);
      var txt = document.createElement('span');
      txt.textContent = t + ' (' + porTipo[t] + ')';
      etiquetas[t] = { txt: txt, lab: lab };
      lab.appendChild(cb); lab.appendChild(punto); lab.appendChild(txt);
      cont.appendChild(lab);
    });

    var anios = Object.keys(contar('año')).sort(function (a, b) { return b - a; });
    var selA = $('evtlayer-anio');
    selA.innerHTML = '<option value="all">Todos los Años</option>';
    anios.forEach(function (a) { selA.insertAdjacentHTML('beforeend', '<option value="' + esc(a) + '">' + esc(a) + '</option>'); });

    actualizarMeses();
  }

  /* Meses disponibles segun el año elegido (mantiene la seleccion si sigue valida) */
  function actualizarMeses() {
    var anio = $('evtlayer-anio').value;
    var selM = $('evtlayer-mes');
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

  /* Cantidad por tipo segun año y mes elegidos (sin contar el filtro por tipo) */
  function actualizarConteos() {
    var anio = $('evtlayer-anio').value, mes = $('evtlayer-mes').value, c = {};
    datos.forEach(function (d) {
      if ((anio === 'all' || d['año'] === anio) && (mes === 'all' || d['mes'] === mes)) {
        var t = d['Tipo de Evento']; c[t] = (c[t] || 0) + 1;
      }
    });
    Object.keys(etiquetas).forEach(function (t) {
      var n = c[t] || 0;
      etiquetas[t].txt.textContent = t + ' (' + n + ')';
      etiquetas[t].lab.style.opacity = n ? '1' : '0.45';
    });
  }

  function filtrados() {
    var anio = $('evtlayer-anio').value, mes = $('evtlayer-mes').value;
    return datos.filter(function (d) {
      return tiposActivos.has(d['Tipo de Evento']) &&
             (anio === 'all' || d['año'] === anio) &&
             (mes === 'all' || d['mes'] === mes);
    });
  }

  /* ---------- dibujo ---------- */
  function popup(d) {
    var dir = [d['Direccion 0'], d['Direccion']].filter(Boolean).join(' y ');
    var fecha = d['fecha'] ? (d['dia_semana'] ? ({ Miercoles: 'Miércoles', Sabado: 'Sábado' }[d['dia_semana']] || d['dia_semana']) + ' ' : '') + d['fecha'] : (MESES[+d['mes']] || d['mes'] || '') + ' ' + (d['año'] || '');
    var h = '<b style="color:' + colorDe(d['Tipo de Evento']) + '">' + esc(d['Tipo de Evento']) + '</b><br>' +
            '<b>Dirección:</b> ' + esc(dir || 'No especificada') + '<br>' +
            '<b>Fecha:</b> ' + esc(fecha.trim() || 'No especificada') + '<br>' +
            '<b>Origen:</b> ' + esc(d['Origen'] || 'No especificado') + '<br>' +
            '<b>Resultado:</b> ' + esc(d['Resultado'] || 'No especificado');
    if (d['hora']) h += '<br><b>Hora:</b> ' + esc(d['hora']) + ' hs';
    if (d['min_arribo']) h += '<br><b>Arribo policial:</b> ' + esc(d['min_arribo']) + ' min';
    if (d['Cámaras']) h += '<br><b>Cámaras:</b> ' + esc(d['Cámaras']);
    if (d['estado_coordenada'] === 'revisar') h += '<br><i style="color:#b45309">Ubicación aproximada</i>';
    return h;
  }

  function refrescar() {
    if (!datos || !capa) return;
    actualizarConteos();
    var lista = filtrados();
    capa.clearLayers();
    var marcadores = lista.map(function (d) {
      var c = colorDe(d['Tipo de Evento']);
      var m = L.circleMarker([d._lat, d._lon], {
        radius: 7, color: '#ffffff', weight: 1.5, fillColor: c, fillOpacity: 0.9
      });
      m.bindPopup(popup(d));
      return m;
    });
    capa.addLayers(marcadores);
    if (calor) calor.setLatLngs(lista.map(function (d) { return [d._lat, d._lon]; }));
    $('evtlayer-info').textContent = lista.length + ' eventos en el mapa';
  }

  /* ---------- activar / desactivar ---------- */
  function activar() {
    var mapa = window.mymap;
    if (!mapa) { console.error('Eventos: no existe window.mymap'); return; }
    if (!capa) capa = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    if (!calor && L.heatLayer) calor = L.heatLayer([], { radius: 25 });
    $('evtlayer-info').textContent = 'Cargando...';
    $('evtlayer-filtros').style.display = 'block';
    cargarDatos().then(function () {
      mapa.addLayer(capa);
      refrescar();
    }).catch(function () {});
  }

  function desactivar() {
    var mapa = window.mymap;
    if (mapa && capa && mapa.hasLayer(capa)) mapa.removeLayer(capa);
    if (mapa && calor && mapa.hasLayer(calor)) mapa.removeLayer(calor);
    var h = $('evtlayer-calor'); if (h) h.checked = false;
    $('evtlayer-filtros').style.display = 'none';
  }

  function iniciar() {
    var chk = $('evtlayer-checkbox');
    if (!chk) { console.warn('Eventos: falta el bloque HTML de la capa en index.html'); return; }
    chk.addEventListener('change', function (e) { e.target.checked ? activar() : desactivar(); });
    $('evtlayer-anio').addEventListener('change', function () { if (datos) actualizarMeses(); refrescar(); });
    $('evtlayer-mes').addEventListener('change', refrescar);
    $('evtlayer-calor').addEventListener('change', function (e) {
      var mapa = window.mymap;
      if (!mapa || !calor) return;
      if (e.target.checked) mapa.addLayer(calor); else mapa.removeLayer(calor);
    });
    $('evtlayer-todos').addEventListener('click', function () { marcarTipos(true); });
    $('evtlayer-ninguno').addEventListener('click', function () { marcarTipos(false); });
  }

  function marcarTipos(valor) {
    if (!datos) return;
    $('evtlayer-tipos').querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.checked = valor;
      if (valor) tiposActivos.add(cb.value); else tiposActivos.delete(cb.value);
    });
    refrescar();
  }

  /* API para otras partes del mapa (rutas de patrullaje, consultas) */
  window.EventosLayer = {
    cargar: function () { return cargarDatos(); },
    datos: function () { return datos; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
