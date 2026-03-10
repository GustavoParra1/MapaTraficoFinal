// Script para agregar BB200XX que falta en RTDB
const admin = require('firebase-admin');

// Inicializar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://seguridad-mdp-v2-default-rtdb.firebaseio.com"
});

async function agregarBB200XX() {
  console.log('🚔 Agregando BB200XX a la base de datos...\n');
  
  try {
    // Buscar el UID del usuario BB200XX en Auth
    const userRecord = await admin.auth().getUserByEmail('patrulla1@seguridad-mdp.com');
    
    console.log(`✅ Usuario encontrado en Auth:`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   UID: ${userRecord.uid}`);
    
    // Agregar a RTDB
    await admin.database().ref('patrullas/BB200XX').set({
      email: 'patrulla1@seguridad-mdp.com',
      uid: userRecord.uid,
      patente: 'BB200XX',
      activa: false,
      creadoEn: new Date().toISOString()
    });
    
    console.log(`   📝 Datos guardados en RTDB bajo patrullas/BB200XX\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.log('════════════════════════════════════════');
  console.log('📋 PATRULLAS CONFIGURADAS:');
  console.log('════════════════════════════════════════');
  console.log('');
  console.log('| Patrulla | Email                          | Contraseña    |');
  console.log('|----------|--------------------------------|---------------|');
  console.log('| AA120JS  | (existente)                    | (tu clave)    |');
  console.log('| BB200XX  | patrulla1@seguridad-mdp.com    | NuevaClave123!|');
  console.log('| CC300ZZ  | patrulla2@seguridad-mdp.com    | NuevaClave123!|');
  console.log('');
  console.log('🔗 URL de login ÚNICA: https://seguridad-mdp-v2.web.app/login.html');
  console.log('');
  
  process.exit(0);
}

agregarBB200XX();
