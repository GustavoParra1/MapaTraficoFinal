// Test to see what TomTom returns for intersections

async function testIntersections() {
  const tomtomKey = 'ViFhDo6I00BxfLOvXJBs9yZ20TmYpKC5';
  const mdpLat = -38.00042;
  const mdpLon = -57.5562;

  const tests = [
    "Buenos Aires and Juan B. Justo, Mar del Plata",
    "Buenos Aires & Juan B. Justo, Mar del Plata", 
    "Calle Buenos Aires, Calle Juan B. Justo, Mar del Plata",
    "Buenos Aires, Juan B. Justo, Mar del Plata"
  ];

  for (const query of tests) {
    console.log(`\n🔍 Testing: "${query}"`);
    
    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${tomtomKey}&lat=${mdpLat}&lon=${mdpLon}&radius=50000&limit=3`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        console.log(`  Results: ${data.results.length}`);
        data.results.slice(0, 2).forEach((r, i) => {
          console.log(`  [${i}] ${r.address.freeformAddress}`);
          console.log(`      (${r.position.lat}, ${r.position.lon})`);
        });
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }
}

testIntersections();
