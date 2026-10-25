// === NUEVA FUNCIÓN: _calcularDatosCruce ===
//
// Mismo patrón que _calcularDatosBarrio() (index.html línea ~954), pero en vez
// de filtrar por polígono de barrio (isLatLngInMultiPolygon), filtra todo por
// distancia a un punto central (el cruce elegido). Reutiliza las mismas fuentes
// globales (allSiniestrosData, allCamerasData, allCamarasPrivadasData,
// allRoboAutomotorData, allFlujoData, colegios) que ya están en memoria.
//
// Uso: _calcularDatosCruce(lat, lng, nombreCruce, radioMetros)
//   - lat, lng: coordenadas del cruce (click en el mapa o buscador de calles)
//   - nombreCruce: string para mostrar en el informe (ej. "F.U. Camet y Valencia")
//   - radioMetros: radio de influencia, default 100m (ajustable; en cruces con
//     mucho tránsito puede convenir 150-200m para no perder aforos/cámaras cercanas
//     que no están literalmente en la esquina)
//
// Devuelve el mismo shape de objeto que _calcularDatosBarrio (mismas keys) para
// poder reusar el resto del pipeline (exportarInformePDF, generarInformeIA, etc.)
// casi sin cambios — solo cambia qué prompt se arma del lado del backend.

function _calcularDatosCruce(lat, lng, nombreCruce, radioMetros = 100) {
  if (isNaN(lat) || isNaN(lng)) return _datosVaciosCruce(nombreCruce);

  const centro = L.latLng(lat, lng);
  const dentroDelRadio = (otroLat, otroLng) =>
    !isNaN(otroLat) && !isNaN(otroLng) && centro.distanceTo(L.latLng(otroLat, otroLng)) <= radioMetros;

  // SINIESTROS dentro del radio
  const siniestrosCruce = (allSiniestrosData?.features || []).filter(f => {
    if (!f.geometry?.coordinates) return false;
    return dentroDelRadio(f.geometry.coordinates[1], f.geometry.coordinates[0]);
  });

  const partCount = {};
  siniestrosCruce.forEach(s => {
    (s.properties.participantes_codigos || '').split('/').forEach(p => { if (p) partCount[p] = (partCount[p]||0)+1; });
  });
  const participantes = Object.entries(partCount).map(([cod,cant]) => ({cod, nombre: participantMapping[cod]||cod, cant})).sort((a,b)=>b.cant-a.cant).slice(0,6);

  const causaCount = {};
  siniestrosCruce.forEach(s => { const c=s.properties.causa; if(c) causaCount[c]=(causaCount[c]||0)+1; });
  const causas = Object.entries(causaCount).map(([cod,cant]) => ({cod, nombre: causeMapping[cod]||cod, cant})).sort((a,b)=>b.cant-a.cant).slice(0,6);

  const horCount = {};
  siniestrosCruce.forEach(s => { const h=parseInt(s.properties.hora?.split(':')[0]||-1); if(h>=0) horCount[h]=(horCount[h]||0)+1; });
  const horMax = Object.entries(horCount).sort((a,b)=>b[1]-a[1])[0];
  const horarioCritico = horMax ? `${horMax[0].toString().padStart(2,'0')}:00 – ${(+horMax[0]+2).toString().padStart(2,'0')}:00` : 'No determinado';

  const dias=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const diaCount = {};
  siniestrosCruce.forEach(s => {
    const f=s.properties.fecha;
    if (f && f.split('/').length===3) {
      const parts=f.split('/'); let y=parseInt(parts[2]); if(y<100) y+=2000;
      const d=new Date(y,parseInt(parts[1])-1,parseInt(parts[0])).getDay();
      diaCount[dias[d]]=(diaCount[dias[d]]||0)+1;
    }
  });
  const diaMax = Object.entries(diaCount).sort((a,b)=>b[1]-a[1])[0];
  const siniestrosPorDia = dias.map(d => ({dia: d, cant: diaCount[d]||0}));

  const anioCount = {};
  siniestrosCruce.forEach(s => {
    const f = s.properties.fecha;
    if (f && f.split('/').length === 3) {
      let y = parseInt(f.split('/')[2], 10);
      if (!isNaN(y)) { if (y < 100) y += 2000; anioCount[y] = (anioCount[y]||0) + 1; }
    }
  });
  const siniestrosPorAnio = Object.entries(anioCount).sort((a,b)=>a[0]-b[0]).map(([anio,cant])=>({anio:Number(anio),cant}));

  const nsd = siniestrosCruce.filter(s=>s.properties.causa==='NSD').length;

  let siniestrosConPeatones = 0, siniestrosConCiclistas = 0;
  siniestrosCruce.forEach(s => {
    const codigos = (s.properties.participantes_codigos || '').split('/');
    if (codigos.includes('P')) siniestrosConPeatones++;
    if (codigos.includes('B')) siniestrosConCiclistas++;
  });

  // CÁMARAS PÚBLICAS dentro del radio
  const camarasCruce = (allCamerasData||[]).filter(c => {
    const clat=parseFloat(String(c.Latitud).replace(',','.')), clng=parseFloat(String(c.Longitud).replace(',','.'));
    return dentroDelRadio(clat, clng);
  });

  // CÁMARAS PRIVADAS dentro del radio
  const camarasPrivCruce = (allCamarasPrivadasData||[]).filter(c => dentroDelRadio(c.latlng?.lat, c.latlng?.lng));

  const sinCobertura = siniestrosCruce.length - siniestrosCruce.filter(s =>
    camarasCruce.some(c => {
      const clat=parseFloat(String(c.Latitud).replace(',','.')), clng=parseFloat(String(c.Longitud).replace(',','.'));
      return dentroDelRadio(clat, clng); // ya están todas dentro del radio del cruce, pero se deja explícito por si se cambia el criterio a 100m fijo
    })
  ).length;
  const pctSiniConCam = siniestrosCruce.length>0 ? Math.round(((siniestrosCruce.length-sinCobertura)/siniestrosCruce.length)*100) : 0;

  // ROBOS DE AUTOMOTOR dentro del radio
  const robosCruce = (allRoboAutomotorData||[]).filter(r => {
    const coordsStr=r['Longitud y Latitud']; if(!coordsStr) return false;
    const parts=coordsStr.split(',').map(s=>s.trim()); if(parts.length!==2) return false;
    const clng=parseFloat(parts[0]), clat=parseFloat(parts[1]);
    return dentroDelRadio(clat, clng);
  });

  // COLEGIOS dentro del radio
  const fuenteColegios = window._colegiosGeoJSON?.features || window.colegiosData?.features || [];
  const colegiosCruce = fuenteColegios.filter(f => {
    if (!f.geometry?.coordinates) return false;
    return dentroDelRadio(f.geometry.coordinates[1], f.geometry.coordinates[0]);
  });

  // ÁREA del círculo de análisis (para densidad de cámaras, análogo a areaCamKm2 de barrio)
  const areaCamKm2 = (Math.PI * radioMetros * radioMetros) / 1000000;
  const densidadCamaras = areaCamKm2>0 ? (camarasCruce.length/areaCamKm2).toFixed(1) : 0;

  // TODO: si querés reusar la misma fórmula de criticidad y recomendaciones que
  // _generarRecomendaciones() usa para barrio, probablemente haya que ajustarla:
  // esa fórmula fue calibrada con volúmenes de "barrio completo" (siniestros/10,
  // robos/5, etc.) y en un cruce puntual los números van a ser mucho más chicos,
  // así que la escala 0-100 de criticidad puede salir siempre baja aunque el
  // cruce sea objetivamente peligroso. Conviene recalibrar esos divisores para
  // el caso "cruce" antes de mostrarle un puntaje al usuario.

  return {
    nombre: nombreCruce,
    lat, lng, radioMetros,
    siniestros: siniestrosCruce.length,
    camarasPublicas: camarasCruce.length,
    camarasPrivadas: camarasPrivCruce.length,
    robos: robosCruce.length,
    colegios: colegiosCruce.length,
    densidadCamaras,
    areaCamKm2: areaCamKm2.toFixed(4),
    pctSiniConCam,
    sinSinCamara: sinCobertura,
    participantes,
    causas,
    horarioCritico,
    diaMaxSiniestros: diaMax?.[0] || 'No determinado',
    siniestrosPorAnio,
    siniestrosPorDia,
    siniestrosConPeatones,
    siniestrosConCiclistas,
    nsd
  };
}

function _datosVaciosCruce(nombreCruce) {
  return {
    nombre: nombreCruce, lat: null, lng: null, radioMetros: 0,
    siniestros: 0, camarasPublicas: 0, camarasPrivadas: 0, robos: 0, colegios: 0,
    densidadCamaras: 0, areaCamKm2: '0', pctSiniConCam: 0, sinSinCamara: 0,
    participantes: [], causas: [], horarioCritico: '-', diaMaxSiniestros: '-',
    siniestrosPorAnio: [], siniestrosPorDia: [], siniestrosConPeatones: 0,
    siniestrosConCiclistas: 0, nsd: 0
  };
}
