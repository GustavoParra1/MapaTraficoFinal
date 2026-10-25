// Agrega el contador "N robos automotor en el mapa" bajo los filtros de Robo Automotor.
// Uso (desde la carpeta del proyecto):  node aplicar_contador_robos.js
const fs = require('fs');
function parchar(ruta, cambios) {
  if (!fs.existsSync(ruta)) { console.log('NO ENCUENTRO ' + ruta + ' (corre esto desde la carpeta MapaTraficoFinal)'); process.exit(1); }
  let t = fs.readFileSync(ruta, 'utf8');
  const nl = t.includes('\r\n') ? '\r\n' : '\n';
  for (const c of cambios) {
    if (c.yaEsta && t.includes(c.yaEsta)) { console.log('  ya aplicado: ' + c.nombre); continue; }
    const n = t.split(c.ancla).length - 1;
    if (n !== 1) { console.log('ERROR en ' + ruta + ': "' + c.nombre + '" encontrado ' + n + ' veces. No se toco nada de este archivo.'); process.exit(1); }
    t = t.replace(c.ancla, () => c.nuevo.replace(/\n/g, nl));
    console.log('  ok: ' + c.nombre);
  }
  fs.writeFileSync(ruta, t, 'utf8');
}
console.log('index.html'); 
parchar('public/index.html', [
  { nombre: 'contador en el panel', yaEsta: 'id="robo-info"',
    ancla: '<label><input type="checkbox" id="robo-heatmap-checkbox"> Mapa de Calor (Robos)</label>',
    nuevo: '<label><input type="checkbox" id="robo-heatmap-checkbox"> Mapa de Calor (Robos)</label>\n      <div id="robo-info" style="font-size:12px;opacity:.8;margin-top:4px;"></div>' },
  { nombre: 'version script.js', yaEsta: 'script.js?v=20261017001',
    ancla: 'script.js?v=20261016006', nuevo: 'script.js?v=20261017001' }
]);
console.log('script.js');
parchar('public/script.js', [
  { nombre: 'calculo del contador', yaEsta: "getElementById('robo-info')",
    ancla: '    processAndDisplayRobos(filteredData);',
    nuevo: `    // Contador de robos que quedan en el mapa segun los filtros (solo los que tienen coordenadas)
    const roboInfo = document.getElementById('robo-info');
    if (roboInfo) {
        const conCoords = filteredData.filter(item => {
            const p = (item['Longitud y Latitud'] || '').split(',').map(s => s.trim());
            return p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]));
        }).length;
        roboInfo.textContent = conCoords + ' robos automotor en el mapa';
    }

    processAndDisplayRobos(filteredData);` }
]);
console.log('Listo. Ahora hace Ctrl+F5 en el navegador o deploy.');
