import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://seguridad-mdp-v2.firebaseio.com'
});

const operadores = [
  { email: 'capa-norte@seguridad-mdp.com', nombre: 'Capa Norte', rol: 'capa-norte' },
  { email: 'capa-sur@seguridad-mdp.com', nombre: 'Capa Sur', rol: 'capa-sur' },
  { email: 'mac@seguridad-mdp.com', nombre: 'MAC', rol: 'mac' },
  { email: 'uppl@seguridad-mdp.com', nombre: 'UPPL', rol: 'uppl' },
  { email: 'multiagencia@seguridad-mdp.com', nombre: 'Multiagencia', rol: 'multiagencia' },
  { email: 'encargado-sala@seguridad-mdp.com', nombre: 'Encargado de Sala', rol: 'encargado-sala' }
];

const PASSWORD = 'NuevaClave123!';
const db = admin.firestore();

async function crearOperadores() {
  try {
    console.log('🔄 Iniciando creación de cuentas de operadores...\n');

    for (const op of operadores) {
      try {
        // Crear usuario en Authentication
        const userRecord = await admin.auth().createUser({
          email: op.email,
          password: PASSWORD,
          displayName: op.nombre
        });

        console.log(`✅ Usuario creado: ${op.email}`);
        console.log(`   UID: ${userRecord.uid}`);
        console.log(`   Contraseña: ${PASSWORD}\n`);

      } catch (error) {
        if (error.code === 'auth/email-already-exists') {
          console.log(`⚠️  ${op.email} ya existe\n`);
        } else {
          console.error(`❌ Error crear ${op.email}:`, error.message);
        }
      }
    }

    console.log('\n📋 Resumen de cuentas creadas:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    operadores.forEach(op => {
      console.log(`• ${op.nombre.padEnd(20)} → ${op.email}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n🔐 Contraseña común: ${PASSWORD}`);
    console.log('\n✅ Proceso completado');

  } catch (error) {
    console.error('❌ Error fatal:', error);
  } finally {
    admin.app().delete();
  }
}

crearOperadores();
