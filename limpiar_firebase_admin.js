import admin from 'firebase-admin';

const serviceAccount = JSON.parse(
  require('fs').readFileSync('./serviceAccountKey.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://seguridad-mdp-v2-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function main() {
  console.log('🔥 LIMPIANDO FIREBASE...\n');
  
  try {
    // 1. BORRAR TODOS LOS EVENTOS
    console.log('🗑️  Borrando todos los eventos...');
    await db.ref('/operador-tarjetas').set({});
    console.log('✅ Base de datos limpia\n');
    
    // 2. CREAR EVENTO DE PRUEBA
    console.log('📝 Creando evento de prueba desde CAPA NORTE...');
    
    const nuevoEvento = {
      id: 'evento-prueba-001',
      createdAt: new Date().toISOString(),
      notificationType: 'Cámara',
      notificationTime: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      followStartTime: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      briefReport: 'Evento de prueba desde CAPA NORTE',
      cameraNumber: 'CAPA-NORTE-001',
      zona: 'Centro - Capa Norte'
    };
    
    await db.ref('/operador-tarjetas/evento-prueba-001').set(nuevoEvento);
    console.log('✅ Evento creado exitosamente\n');
    
    // 3. VERIFICAR
    console.log('🔍 Verificando...');
    const snapshot = await db.ref('/operador-tarjetas').once('value');
    const eventos = snapshot.val();
    console.log('📊 Total eventos:', Object.keys(eventos || {}).length);
    console.log('📦 Evento guardado:', JSON.stringify(nuevoEvento, null, 2));
    
    console.log('\n✨ ¡LISTO! Firebase limpio con 1 evento de prueba\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
