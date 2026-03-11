// Test various Buenos Aires addresses
async function testAllAddresses() {
  const addresses = [
    "Buenos Aires y Juan B. Justo",
    "Buenos Aires y 20 de Septiembre",
    "Buenos Aires y Viamonte",
    "Buenos Aires y Corrientes",
    "Buenos Aires y 9 de Julio"
  ];

  console.log("🧪 Testing Buenos Aires geocoding...\n");

  for (const address of addresses) {
    try {
      const response = await fetch(`http://localhost:3003/api/geocode?address=${encodeURIComponent(address)}`);
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ ${address}`);
        console.log(`   → ${data.address}`);
        console.log(`   → (${data.lat}, ${data.lng})\n`);
      } else {
        console.log(`❌ ${address} - ${data.message}\n`);
      }
    } catch (error) {
      console.error(`❌ ${address} - Error: ${error.message}\n`);
    }
  }
}

testAllAddresses();
