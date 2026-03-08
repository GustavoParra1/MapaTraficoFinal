// ============================================================
// LIMPIAR FIREBASE Y CREAR UN EVENTO DE PRUEBA
// ============================================================

import https from 'https';

const FIREBASE_URL = "https://seguridad-mdp-v2-default-rtdb.firebaseio.com";
const EVENTOS_PATH = "/operador-tarjetas";

// Realizar una solicitud HTTP a Firebase
function firebaseRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(FIREBASE_URL + path + '.json');
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: responseData ? JSON.parse(responseData) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: responseData
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function main() {
  console.log('🔥 LIMPIANDO FIREBASE...\n');
  
  try {
    // 1. BORRAR TODOS LOS EVENTOS
    console.log('🗑️  Borrando todos los eventos de Firebase...');
    const deleteResult = await firebaseRequest(EVENTOS_PATH, 'DELETE');
    console.log('✅ Eventos borrados. Status:', deleteResult.status);
    
    // 2. CREAR UN ÚNICO EVENTO DE PRUEBA
    console.log('\n📝 Creando evento de prueba desde CAPA NORTE...');
    
    const nuevoEvento = {
      id: 'evento-prueba-001',
      createdAt: new Date().toISOString(),
      notificationType: 'Cámara',
      notificationTime: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      followStartTime: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      briefReport: 'Evento de prueba desde CAPA NORTE',
      cameraNumber: 'CAPA-NORTE-001',
      zona: 'Centro - Capa Norte',
      gps: {
        lat: -38.0055,
        lng: -57.5372
      }
    };
    
    const createResult = await firebaseRequest(
      EVENTOS_PATH + '/evento-prueba-001',
      'PUT',
      nuevoEvento
    );
    
    console.log('✅ Evento de prueba creado. Status:', createResult.status);
    console.log('📦 Datos guardados:', JSON.stringify(nuevoEvento, null, 2));
    
    // 3. VERIFICAR
    console.log('\n🔍 Verificando...');
    const verifyResult = await firebaseRequest(EVENTOS_PATH);
    console.log('✅ Total eventos en Firebase:', Object.keys(verifyResult.data || {}).length);
    console.log('📊 Evento guardado:');
    console.log(JSON.stringify(verifyResult.data['evento-prueba-001'], null, 2));
    
    console.log('\n✨ ¡LISTO! Firebase limpio con 1 evento de prueba');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
