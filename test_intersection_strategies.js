// Probar diferentes estrategias para encontrar la intersección correcta

async function testIntersectionStrategies() {
  console.log("=== PROBANDO ESTRATEGIAS DE INTERSECCIÓN ===\n");
  
  // Estrategia 1: Punto medio simple
  console.log("📍 ESTRATEGIA 1: Punto medio entre calles");
  const url1a = `https://nominatim.openstreetmap.org/search?q=Buenos%20Aires,Mar%20del%20Plata,Argentina&format=json&limit=1`;
  const url1b = `https://nominatim.openstreetmap.org/search?q=Colon,Mar%20del%20Plata,Argentina&format=json&limit=1`;
  
  const res1a = await fetch(url1a, { headers: { 'User-Agent': 'MapaTrafico/1.0' } });
  const res1b = await fetch(url1b, { headers: { 'User-Agent': 'MapaTrafico/1.0' } });
  const data1a = await res1a.json();
  const data1b = await res1b.json();
  
  if (data1a.length > 0 && data1b.length > 0) {
    const p1 = data1a[0];
    const p2 = data1b[0];
    const midLat = (parseFloat(p1.lat) + parseFloat(p2.lat)) / 2;
    const midLon = (parseFloat(p1.lon) + parseFloat(p2.lon)) / 2;
    console.log(`  Buenos Aires: ${p1.lat}, ${p1.lon}`);
    console.log(`  Colon: ${p2.lat}, ${p2.lon}`);
    console.log(`  Punto medio: ${midLat}, ${midLon}\n`);
  }
  
  // Estrategia 2: Buscar con "intersection" o "&"
  console.log("📍 ESTRATEGIA 2: Buscar con '&'");
  const url2 = `https://nominatim.openstreetmap.org/search?q=Buenos%20Aires%20%26%20Colon,Mar%20del%20Plata,Argentina&format=json&limit=3`;
  const res2 = await fetch(url2, { headers: { 'User-Agent': 'MapaTrafico/1.0' } });
  const data2 = await res2.json();
  data2.slice(0, 2).forEach((r, i) => {
    console.log(`  [${i}] ${r.display_name}`);
    console.log(`      ${r.lat}, ${r.lon}`);
  });
  console.log();
  
  // Estrategia 3: Overpass API (más específica)
  console.log("📍 ESTRATEGIA 3: Overpass API (nodos de intersección)");
  try {
    const bbox = "-38.05,-57.62,-37.95,-57.52"; // Mar del Plata
    const query = `[bbox:${bbox}];(way["name"="Buenos Aires"];way["name"="Colon"];);out geom;`;
    const url3 = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    const res3 = await fetch(url3);
    const data3 = await res3.json();
    console.log(`  Elementos encontrados: ${data3.elements ? data3.elements.length : 0}`);
    if (data3.elements && data3.elements.length > 0) {
      data3.elements.slice(0, 2).forEach((e, i) => {
        console.log(`  [${i}] ${e.tags?.name || 'sin nombre'}`);
        if (e.geometry) {
          console.log(`      Puntos: ${e.geometry.length}`);
        }
      });
    }
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
}

testIntersectionStrategies();
