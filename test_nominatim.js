// Test Nominatim directly

async function testNominatim() {
  const tests = [
    "Buenos Aires y Juan B. Justo, Mar del Plata, Buenos Aires, Argentina",
    "Buenos Aires, Mar del Plata, Argentina",
    "Calle Buenos Aires, Mar del Plata, Argentina",
    "25 de Mayo y Roque Sáenz Peña, Mar del Plata, Argentina"
  ];

  for (const address of tests) {
    console.log(`\n📍 Testing: "${address}"`);
    
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=5`;
    
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MapaTrafico-MDP/1.0' }
      });
      const data = await response.json();
      
      if (data && data.length > 0) {
        console.log(`  ✅ Found ${data.length} results:`);
        data.slice(0, 3).forEach((r, idx) => {
          console.log(`     [${idx}] ${r.display_name}`);
          console.log(`         Lat: ${r.lat}, Lon: ${r.lon}`);
        });
      } else {
        console.log(`  ❌ No results`);
      }
    } catch (error) {
      console.error(`  ❌ Error:`, error.message);
    }
  }
}

testNominatim();
