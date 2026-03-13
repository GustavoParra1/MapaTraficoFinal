// Probar con términos más explícitos
async function testRefinedSearch() {
  console.log("=== BÚSQUEDAS REFINADAS ===\n");
  
  const searches = [
    { s1: "Avenida Buenos Aires, Mar del Plata", s2: "Avenida Colon, Mar del Plata" },
    { s1: "Calle Buenos Aires, Mar del Plata", s2: "Calle Colon, Mar del Plata" },
    { s1: "Buenos Aires, Vieja Terminal, Mar del Plata", s2: "Colon, Mar del Plata" },
  ];
  
  for (const pair of searches) {
    console.log(`\n📍 Búsqueda doble: "${pair.s1}" y "${pair.s2}"`);
    
    try {
      const url1 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(pair.s1)}&format=json&limit=5`;
      const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(pair.s2)}&format=json&limit=5`;
      
      const res1 = await fetch(url1, { headers: { 'User-Agent': 'MapaTrafico/1.0' } });
      const res2 = await fetch(url2, { headers: { 'User-Agent': 'MapaTrafico/1.0' } });
      
      const data1 = await res1.json();
      const data2 = await res2.json();
      
      console.log(`   Calle 1 resultados: ${data1.length}`);
      data1.slice(0, 2).forEach((r, i) => {
        console.log(`     [${i}] ${r.display_name} - ${r.lat}, ${r.lon}`);
      });
      
      console.log(`   Calle 2 resultados: ${data2.length}`);
      data2.slice(0, 2).forEach((r, i) => {
        console.log(`     [${i}] ${r.display_name} - ${r.lat}, ${r.lon}`);
      });
      
      if (data1.length > 0 && data2.length > 0) {
        const lat = (parseFloat(data1[0].lat) + parseFloat(data2[0].lat)) / 2;
        const lon = (parseFloat(data1[0].lon) + parseFloat(data2[0].lon)) / 2;
        console.log(`   🎯 Punto medio: ${lat}, ${lon}`);
      }
    } catch (e) {
      console.log(`   Error: ${e.message}`);
    }
  }
}

testRefinedSearch();
