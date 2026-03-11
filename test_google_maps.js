// Test script for Google Maps Geocoding API

async function testGoogleMaps() {
  const addresses = [
    "Buenos Aires y Juan B. Justo, Mar del Plata, Argentina",
    "Buenos Aires y 20 de Septiembre, Mar del Plata, Argentina",
    "Buenos Aires, Mar del Plata, Argentina"
  ];

  const key = "AIzaSyC9Zl70EdPvHxgZCQVxbvCp8cJvEOsH9-0";

  for (const address of addresses) {
    console.log(`\n📍 Testing: "${address}"`);
    
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&bounds=-38.05,-57.62|-37.95,-57.52&key=${key}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const { lat, lng } = result.geometry.location;
        console.log(`  ✅ Found: ${result.formatted_address}`);
        console.log(`     Lat: ${lat}, Lon: ${lng}`);
        console.log(`     Type: ${result.geometry.location_type}`);
      } else {
        console.log(`  ❌ No results found`);
        console.log(`     Status: ${data.status}`);
      }
    } catch (error) {
      console.error(`  ❌ Error:`, error.message);
    }
  }
}

testGoogleMaps();
