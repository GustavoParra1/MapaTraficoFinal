// Estrategia: Buscar cada calle por separado y calcular intersección

async function buscarInterseccion(calle1, calle2) {
  console.log(`\n📍 Buscando intersección: "${calle1}" y "${calle2}"`);
  
  try {
    // Buscar primera calle
    const url1 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(calle1 + ", Mar del Plata, Argentina")}&format=json&limit=3`;
    const res1 = await fetch(url1, {
      headers: { 'User-Agent': 'MapaTrafico-MDP/1.0' }
    });
    const data1 = await res1.json();
    
    // Buscar segunda calle
    const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(calle2 + ", Mar del Plata, Argentina")}&format=json&limit=3`;
    const res2 = await fetch(url2, {
      headers: { 'User-Agent': 'MapaTrafico-MDP/1.0' }
    });
    const data2 = await res2.json();
    
    if (data1.length > 0 && data2.length > 0) {
      // Tomar el primer resultado de cada calle
      const p1 = data1[0];
      const p2 = data2[0];
      
      console.log(`   ✅ ${calle1}: ${p1.lat}, ${p1.lon}`);
      console.log(`   ✅ ${calle2}: ${p2.lat}, ${p2.lon}`);
      
      // Calcular punto medio (aproximación de intersección)
      const lat = (parseFloat(p1.lat) + parseFloat(p2.lat)) / 2;
      const lon = (parseFloat(p1.lon) + parseFloat(p2.lon)) / 2;
      
      console.log(`   🎯 Intersección (punto medio): ${lat}, ${lon}`);
      return { lat, lon, found: true };
    } else {
      console.log(`   ❌ No se encontró una o ambas calles`);
      if (data1.length === 0) console.log(`      - ${calle1}: No encontrada`);
      if (data2.length === 0) console.log(`      - ${calle2}: No encontrada`);
      return { found: false };
    }
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    return { found: false };
  }
}

// Probar con los ejemplos problemáticos
async function test() {
  console.log("=== BÚSQUEDA DE INTERSECCIONES ===");
  
  await buscarInterseccion("Buenos Aires", "Juan B. Justo");
  await buscarInterseccion("Buenos Aires", "Colon");
  await buscarInterseccion("Buenos Aires", "20 de Septiembre");
  await buscarInterseccion("Mitre", "Independencia");
}

test();
