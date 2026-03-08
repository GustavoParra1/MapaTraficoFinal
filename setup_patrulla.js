import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://seguridad-mdp-v2-default-rtdb.firebaseio.com'
});

const auth = admin.auth();

async function recreatePatrullaUser() {
  const email = 'patrulla@gmail.com';
  const password = 'Cuidarte2018';

  try {
    console.log('🔄 Buscando usuario patrulla@gmail.com...');
    
    // Intentar obtener el usuario existente
    let uid;
    try {
      const user = await auth.getUserByEmail(email);
      uid = user.uid;
      console.log('❌ Usuario encontrado, borrando...');
      await auth.deleteUser(uid);
      console.log('✅ Usuario borrado exitosamente');
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log('ℹ️ Usuario no existe (es normal si es primera vez)');
      } else {
        throw err;
      }
    }

    // Crear nuevo usuario
    console.log(`\n📝 Creando nuevo usuario con email: ${email}`);
    const newUser = await auth.createUser({
      email: email,
      password: password,
      disabled: false
    });

    console.log('\n✅ ¡USUARIO CREADO EXITOSAMENTE!');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   UID: ${newUser.uid}`);
    console.log('\n🎯 Ahora podés entrar en http://localhost:3003');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

recreatePatrullaUser().then(() => {
  admin.app().delete();
  console.log('\n✨ Script finalizado');
  process.exit(0);
}).catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
