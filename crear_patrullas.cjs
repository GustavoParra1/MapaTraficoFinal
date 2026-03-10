// Script para crear usuarios de patrullas en Firebase Authentication
const admin = require('firebase-admin');

// Inicializar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://seguridad-mdp-v2-default-rtdb.firebaseio.com"
});

// Patrullas a crear
const patrullas = [
  {
    email: 'patrulla1@seguridad-mdp.com',
    password: 'NuevaClave123!',
    displayName: 'Patrulla BB200XX',
    patente: 'BB200XX'
  },
  {
    email: 'patrulla2@seguridad-mdp.com',
    password: 'NuevaClave123!',
    displayName: 'Patrulla CC300ZZ',
    patente: 'CC300ZZ'
  }
];

async function crearPatrullas() {
  console.log('🚔 Creando usuarios de patrullas en Firebase...\n');
  
  for (const patrulla of patrullas) {
    try {
      // Crear usuario en Firebase Auth
      const userRecord = await admin.auth().createUser({
        email: patrulla.email,
        password: patrulla.password,
        displayName: patrulla.displayName,
        emailVerified: true
      });
      
      console.log(`✅ ${patrulla.patente} creada exitosamente`);
      console.log(`   Email: ${patrulla.email}`);
      console.log(`   UID: ${userRecord.uid}`);
      
      // Guardar datos adicionales en Realtime Database
      await admin.database().ref(`patrullas/${patrulla.patente}`).set({
        email: patrulla.email,
        uid: userRecord.uid,
        patente: patrulla.patente,
        activa: false,
        creadoEn: new Date().toISOString()
      });
      
      console.log(`   📝 Datos guardados en RTDB\n`);
      
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        console.log(`⚠️  ${patrulla.patente} - El email ${patrulla.email} ya existe\n`);
      } else {
        console.error(`❌ Error creando ${patrulla.patente}:`, error.message, '\n');
      }
    }
  }
  
  console.log('════════════════════════════════════════');
  console.log('📋 RESUMEN DE PATRULLAS:');
  console.log('════════════════════════════════════════');
  console.log('');
  console.log('| Patrulla | Email                          | Contraseña    |');
  console.log('|----------|--------------------------------|---------------|');
  console.log('| BB200XX  | patrulla1@seguridad-mdp.com    | NuevaClave123!|');
  console.log('| CC300ZZ  | patrulla2@seguridad-mdp.com    | NuevaClave123!|');
  console.log('');
  console.log('🔗 URL para login: https://mapa-trafico.web.app/patrulla/');
  console.log('');
  
  process.exit(0);
}

crearPatrullas();
