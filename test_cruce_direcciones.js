// Test de diferentes formatos de cruces para encontrar el mejor

async function testCruces() {
  const cruces = [
    // Formato original
    "Colon y Buenos Aires, Mar del Plata",
    "Juan B. Justo y Buenos Aires, Mar del Plata",
    
    // Variaciones
    "Colon & Buenos Aires, Mar del Plata",
    "Juan B Justo & Buenos Aires, Mar del Plata",
    
    // Sin "y"
    "Colon Buenos Aires, Mar del Plata",
    "Juan B Justo Buenos Aires, Mar del Plata",
    
    // Invertido
    "Buenos Aires y Colon, Mar del Plata",
    "Buenos Aires y Juan B. Justo, Mar del Plata",
    
    // Con Argentina
    "Colon y Buenos Aires, Mar del Plata, Argentina",
    "Juan B. Justo y Buenos Aires, Mar del Plata, Argentina",
    
    // Nominatim test
  ];

  const googleKey = "AIzaSyC9Zl70EdPvHxgZCQVxbvCp8cJvEOsH9-0";

  console.log("=== TESTING GOOGLE MAPS ===\n");
  
  for (const address of cruces) {
    console.log(`\n📍 Probando: "${address}"`);
    
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const { lat, lng } = result.geometry.location;
        console.log(`   ✅ Google Maps: ${result.formatted_address}`);
        console.log(`      Coords: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } else {
        console.log(`   ❌ Google Maps: No encontrado - ${data.status}`);
      }
    } catch (error) {
      console.error(`   ❌ Error Google:`, error.message);
    }
    
    // También probar Nominatim
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&bounded=1&viewbox=-57.62,-38.05,-57.52,-37.95`;
    
    try {
      const response = await fetch(nomUrl);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        console.log(`   ✅ Nominatim: ${result.display_name}`);
        console.log(`      Coords: ${result.lat}, ${result.lon}`);
      } else {
        console.log(`   ❌ Nominatim: No encontrado`);
      }
    } catch (error) {
      console.error(`   ❌ Error Nominatim:`, error.message);
    }
  }
}

testCruces();
