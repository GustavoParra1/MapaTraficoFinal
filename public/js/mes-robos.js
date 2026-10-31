/* Filtro "Mes" para la capa de Robo Automotor (igual que el de la capa de hallazgos).
   - Agrega el desplegable "Mes" debajo de "Año" en el panel de Robo Automotor.
   - Filtra el mapa, el Top 10, el mapa de calor, el contador y las "Zonas con mas robos".
   - Se engancha a processAndDisplayRobos (script.js) sin modificarlo.
   - Debe cargarse DESPUES de zonas-robos.js. */
(function () {
  'use strict';
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function $(id) { return document.getElementById(id); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function mesElegido() { var s = $('robo-mes-filter'); return s ? (parseInt(s.value, 10) || 0) : 0; }

  /* Mes (1 a 12) de un robo: acepta 3, "03", "Marzo" o, si falta, la fecha (dd/mm/aaaa o aaaa-mm-dd). 0 = sin dato */
  function mesDe(it) {
    var v = String(it.mes != null ? it.mes : (it.Mes != null ? it.Mes : '')).trim();
    if (v) {
      var n = Number(v);
      if (isFinite(n) && n === Math.floor(n) && n >= 1 && n <= 12) return n;
      var t = norm(v).slice(0, 3);
      for (var i = 0; i < 12; i++) if (norm(MESES[i]).slice(0, 3) === t) return i + 1;
    }
    var f = String(it.fecha || it.Fecha || '').trim(), m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(f);
    var mm = m ? parseInt(m[2], 10) : 0;
    if (!m) { m = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/.exec(f); mm = m ? parseInt(m[2], 10) : 0; }
    return (mm >= 1 && mm <= 12) ? mm : 0;
  }

  function conCoordenadas(data) {
    return data.filter(function (it) {
      var p = String(it['Longitud y Latitud'] || '').split(',').map(function (s) { return s.trim(); });
      return p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]));
    }).length;
  }

  function actualizarInfo(data, mes, sinMes) {
    var info = $('robo-info');
    if (!info) return;
    var rf = $('robo-resultado-filter'), lpr = !!(rf && rf.value === 'Alertas LPR');
    var t = conCoordenadas(data) + (lpr ? ' alertas LPR en el mapa (lugar donde se leyó la patente)' : ' robos automotor en el mapa');
    if (mes) t += ' (' + MESES[mes - 1] + ')';
    if (mes && sinMes) t += '. ' + sinMes + ' sin mes registrado, no se muestran';
    info.textContent = t;
  }

  function crearSelect() {
    var y = $('robo-automotor-year-filter');
    if (!y || $('robo-mes-filter')) return;
    var g = (y.closest && y.closest('.filter-group')) || y.parentNode;
    g.insertAdjacentHTML('afterend',
      '<div class="filter-group"><label for="robo-mes-filter">Mes:</label><select id="robo-mes-filter"><option value="0">Todos los Meses</option>' +
      MESES.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + '</option>'; }).join('') + '</select></div>');
    $('robo-mes-filter').addEventListener('change', function () {
      if (typeof applyRoboAutomotorFilters === 'function') applyRoboAutomotorFilters();
    });
  }

  function enganchar() {
    var f = window.processAndDisplayRobos;
    if (typeof f !== 'function') return false;
    if (f.__mesRobos) return true;
    var nuevo = function (data) {
      var mes = mesElegido(), sinMes = 0, args = Array.prototype.slice.call(arguments);
      if (mes && Array.isArray(data)) {
        data = data.filter(function (it) {
          var m = mesDe(it);
          if (!m) { sinMes++; return false; }
          return m === mes;
        });
        args[0] = data;
      }
      var res = f.apply(this, args);
      try { actualizarInfo(Array.isArray(data) ? data : [], mes, sinMes); } catch (e) { console.error('Filtro de mes de robos:', e); }
      return res;
    };
    nuevo.__mesRobos = true;
    window.processAndDisplayRobos = nuevo;
    return true;
  }

  window.CIMUMesRobos = { texto: function () { var m = mesElegido(); return m ? ', mes: ' + MESES[m - 1] : ''; } };

  function iniciar() {
    crearSelect();
    if (!enganchar()) console.warn('Filtro de mes de robos: no encuentro processAndDisplayRobos (script.js)');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
  window.addEventListener('load', function () { crearSelect(); enganchar(); });
})();