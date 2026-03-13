// Probar búsquedas más específicas
async function testSpecificSearch() {
  console.log("=== BÚSQUEDAS MÁS ESPECÍFICAS ===\n");
  
  const searches = [
    "Buenos Aires & Colon, Mar del Plata",
    "intersection Buenos Aires Colon Mar del Plata",
    "Buenos Aires Colon Mar del Plata, Argentina",
    "Colon esquina Buenos Aires, Mar del Plata",
  ];
  
  for (const search of searches) {
    console.log(`📍 Buscando: "${search}"`);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=2`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MapaTrafico/1.0' } });
      const data = await res.json();
      
      if (data.length > 0) {
        data.forEach((r, i) => {
          console.log(`   [${i}] ${r.display_name}`);
          console.log(`       ${r.lat}, ${r.lon}`);
        });
      } else {
        console.log(`   ❌ No encontrado`);
      }
    } catch (e) {
      console.log(`   Error: ${e.message}`);
    }
    console.log();
  }
}

testSpecificSearch();
