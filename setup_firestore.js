import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://seguridad-mdp-v2.firebaseio.com'
});

const db = admin.firestore();

async function setupFirestoreStructure() {
  try {
    console.log('🔄 Creando estructura Firestore para chats-com...\n');

    // Primero, obtener los UIDs reales de Firebase Auth
    const operadoresEmails = {
      'capa-norte': 'capa-norte@seguridad-mdp.com',
      'capa-sur': 'capa-sur@seguridad-mdp.com',
      'mac': 'mac@seguridad-mdp.com',
      'uppl': 'uppl@seguridad-mdp.com',
      'multiagencia': 'multiagencia@seguridad-mdp.com',
      'encargado-sala': 'encargado-sala@seguridad-mdp.com'
    };

    // Crear documento raíz con mensaje inicial para cada operador
    for (const [rol, email] of Object.entries(operadoresEmails)) {
      const chatDocPath = `chats-com/${rol}`;
      
      try {
        // Obtener el UID del usuario
        let uid = null;
        try {
          const user = await admin.auth().getUserByEmail(email);
          uid = user.uid;
        } catch (err) {
          console.warn(`⚠️ No se encontró usuario: ${email}`);
          uid = `${rol}-uid`;
        }

        // Crear estructura mínima usando batch
        const batch = db.batch();
        const docRef = db.doc(chatDocPath);
        
        batch.set(docRef, {
          operadorId: rol,
          operadorEmail: email,
          operadorUid: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          participantes: ['admin', rol]
        }, { merge: true });

        await batch.commit();

        console.log(`✅ Estructura creada: chats-com/${rol}`);

      } catch (error) {
        console.error(`⚠️ Error en ${rol}:`, error.message);
      }
    }
    
    console.log('\n✅ Firestore estructurado correctamente');

  } catch (error) {
    console.error('❌ Error fatal:', error);
  } finally {
    admin.app().delete();
  }
}

setupFirestoreStructure();
