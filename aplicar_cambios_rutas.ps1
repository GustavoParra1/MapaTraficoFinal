# Aplica los cambios a public\script.js (hace copia de seguridad primero)
$ErrorActionPreference = 'Stop'
$ruta = Join-Path (Get-Location) 'public\script.js'
if (-not (Test-Path $ruta)) { Write-Host 'Ejecutalo desde la carpeta MapaTraficoFinal.'; exit 1 }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$txt = [System.IO.File]::ReadAllText($ruta, $utf8)
$cambios = @()
$a0 = @'
if (window.EventosLayer) { try { await window.EventosLayer.cargar(); } catch (e) { console.error('Patrullaje: error cargando eventos', e); } }
'@
$r0 = @'
if (window.EventosLayer) { try { await window.EventosLayer.cargar(); } catch (e) { console.error('Patrullaje: error cargando eventos', e); } }
        try { await loadRoboAutomotorData(); } catch (e) { console.error('Patrullaje: error cargando robo automotor', e); }
'@
$m0 = @'
loadRoboAutomotorData(); } catch (e) { console.error('Patrullaje
'@
if ($txt.Contains($m0)) { Write-Host 'Ya aplicado: rutas-robos' }
else { $c = ([regex]::Matches($txt, [regex]::Escape($a0))).Count
  if ($c -ne 1) { Write-Host "No se pudo aplicar rutas-robos: encontre $c coincidencias (se esperaba 1). No se modifico nada."; exit 1 }
  $txt = $txt.Replace($a0, $r0); $cambios += 'rutas-robos' }
$a1 = @'
const eventosFuente = eventosPatrol.filter(e => _pesoBaseEvento(e['Tipo de Evento']) > 0 && _mesIdxEv(e) !== null);
'@
$r1 = @'
// Suma los robos automotor (robo_automotor.csv), que no estan en eventos.csv
        const _eventosConRobo = eventosPatrol.slice();
        if (typeof allRoboAutomotorData !== 'undefined' && Array.isArray(allRoboAutomotorData) &&
            !eventosPatrol.some(e => _normEv(e['Tipo de Evento']).includes('automotor'))) {
          allRoboAutomotorData.forEach(r => {
            const p = String(r['Longitud y Latitud'] || '').split(',');
            const lon = parseFloat(p[0]), lat = parseFloat(p[1]);
            if (p.length !== 2 || isNaN(lat) || isNaN(lon)) return;
            _eventosConRobo.push(Object.assign({}, r, { _lat: lat, _lon: lon }));
          });
        }
        const eventosFuente = _eventosConRobo.filter(e => _pesoBaseEvento(e['Tipo de Evento']) > 0 && _mesIdxEv(e) !== null);
'@
$m1 = @'
_eventosConRobo
'@
if ($txt.Contains($m1)) { Write-Host 'Ya aplicado: rutas-robos2' }
else { $c = ([regex]::Matches($txt, [regex]::Escape($a1))).Count
  if ($c -ne 1) { Write-Host "No se pudo aplicar rutas-robos2: encontre $c coincidencias (se esperaba 1). No se modifico nada."; exit 1 }
  $txt = $txt.Replace($a1, $r1); $cambios += 'rutas-robos2' }
$a2 = @'
const consulta = e.target.dataset.consulta;
'@
$r2 = @'
const consulta = e.target.dataset.consulta;
  window.__ultimaConsulta = consulta; // para recalcularla si cambia el filtro de anio de Robo Automotor
'@
$m2 = @'
__ultimaConsulta = consulta
'@
if ($txt.Contains($m2)) { Write-Host 'Ya aplicado: recalculo1' }
else { $c = ([regex]::Matches($txt, [regex]::Escape($a2))).Count
  if ($c -ne 1) { Write-Host "No se pudo aplicar recalculo1: encontre $c coincidencias (se esperaba 1). No se modifico nada."; exit 1 }
  $txt = $txt.Replace($a2, $r2); $cambios += 'recalculo1' }
$a3 = @'
document.getElementById('robo-automotor-year-filter').addEventListener('change', applyRoboAutomotorFilters);
'@
$r3 = @'
document.getElementById('robo-automotor-year-filter').addEventListener('change', applyRoboAutomotorFilters);

// Si hay una consulta de robos abierta en el panel de resultados, se recalcula al cambiar el anio
document.getElementById('robo-automotor-year-filter').addEventListener('change', function () {
    const c = window.__ultimaConsulta;
    const panel = document.getElementById('consulta-results-panel');
    if (!c || !panel || panel.style.display === 'none') return;
    if (['barrios_mas_robos', 'robos_por_dia', 'robos_zonas_sin_camaras', 'robos_sin_intervencion', 'correlacion_camaras_robos'].indexOf(c) === -1) return;
    const btn = document.querySelector('#consultas-panel [data-consulta="' + c + '"]');
    if (btn) btn.click();
});
'@
$m3 = @'
window.__ultimaConsulta;
'@
if ($txt.Contains($m3)) { Write-Host 'Ya aplicado: recalculo2' }
else { $c = ([regex]::Matches($txt, [regex]::Escape($a3))).Count
  if ($c -ne 1) { Write-Host "No se pudo aplicar recalculo2: encontre $c coincidencias (se esperaba 1). No se modifico nada."; exit 1 }
  $txt = $txt.Replace($a3, $r3); $cambios += 'recalculo2' }
if ($cambios.Count -eq 0) { Write-Host 'No habia nada para cambiar.'; exit 0 }
Copy-Item $ruta ($ruta + '.bak_antes_rutas') -Force
[System.IO.File]::WriteAllText($ruta, $txt, $utf8)
$idx = Join-Path (Get-Location) 'public\index.html'
$h = [System.IO.File]::ReadAllText($idx, $utf8)
$h2 = [regex]::Replace($h, 'script\.js\?v=\d+', 'script.js?v=20261016003')
[System.IO.File]::WriteAllText($idx, $h2, $utf8)
Write-Host ('Listo. Cambios aplicados: ' + ($cambios -join ', '))
Write-Host 'Copia de seguridad: public\script.js.bak_antes_rutas (borrala despues, no la subas)'
