// Test específico para "Colon y Luro"
const GOOGLE_MAPS_API_KEY = 'AIzaSyBp2ZiKA4lYieyjX_aJJjE023NeqKrRhJc';

async function testColonYLuro() {
  console.log('🔍 Buscando "Colon y Luro" en Mar del Plata...\n');

  // Test 1: Buscar como intersección directa
  console.log('TEST 1: Búsqueda directa "Colon y Luro, Mar del Plata"');
  const urlDirect = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('Colon y Luro, Mar del Plata, Argentina')}&key=${GOOGLE_MAPS_API_KEY}`;
  
  try {
    const resDirect = await fetch(urlDirect);
    const dataDirect = await resDirect.json();
    
    if (dataDirect.results && dataDirect.results.length > 0) {
      const loc = dataDirect.results[0];
      console.log(`✅ ENCONTRADA directamente`);
      console.log(`   Dirección: ${loc.formatted_address}`);
      console.log(`   Coordenadas: ${loc.geometry.location.lat}, ${loc.geometry.location.lng}`);
      console.log(`   Tipo: ${loc.geometry.location_type}`);
    } else {
      console.log(`❌ No encontrada como búsqueda directa`);
      console.log(`   Status: ${dataDirect.status}`);
    }
  } catch (e) {
    console.error('Error:', e);
  }

  console.log('\n---\n');

  // Test 2: Buscar cada calle por separado
  console.log('TEST 2: Búsqueda por separado');
  const urlColon = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('Colon, Mar del Plata, Argentina')}&key=${GOOGLE_MAPS_API_KEY}`;
  const urlLuro = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('Luro, Mar del Plata, Argentina')}&key=${GOOGLE_MAPS_API_KEY}`;
  
  try {
    const resColon = await fetch(urlColon);
    const dataColon = await resColon.json();
    
    const resLuro = await fetch(urlLuro);
    const dataLuro = await resLuro.json();

    if (dataColon.results && dataColon.results.length > 0) {
      const locColon = dataColon.results[0].geometry.location;
      console.log(`✅ COLON encontrada`);
      console.log(`   ${dataColon.results[0].formatted_address}`);
      console.log(`   ${locColon.lat}, ${locColon.lng}`);
    }

    if (dataLuro.results && dataLuro.results.length > 0) {
      const locLuro = dataLuro.results[0].geometry.location;
      console.log(`✅ LURO encontrada`);
      console.log(`   ${dataLuro.results[0].formatted_address}`);
      console.log(`   ${locLuro.lat}, ${locLuro.lng}`);
    }

    // Calcular distancia
    if (dataColon.results && dataColon.results.length > 0 && 
        dataLuro.results && dataLuro.results.length > 0) {
      const loc1 = dataColon.results[0].geometry.location;
      const loc2 = dataLuro.results[0].geometry.location;
      
      const R = 6371;
      const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
      const dLon = (loc2.lng - loc1.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
                Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distancia = R * c * 1000; // metros

      console.log(`\n📏 Distancia calculada: ${distancia.toFixed(0)}m`);
      
      // Punto medio
      const midLat = (loc1.lat + loc2.lat) / 2;
      const midLon = (loc1.lng + loc2.lng) / 2;
      console.log(`🎯 Punto medio: ${midLat}, ${midLon}`);
      
      if (distancia > 800) {
        console.log(`❌ SERÍA RECHAZADA (> 800m) - Probablemente paralelas`);
      } else {
        console.log(`✅ SERÍA ACEPTADA (< 800m) - Intersección válida`);
      }
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

// Ejecutar si estamos en navegador
if (typeof window !== 'undefined') {
  testColonYLuro();
} else {
  console.log('Ejecuta esto en la consola del navegador');
}
