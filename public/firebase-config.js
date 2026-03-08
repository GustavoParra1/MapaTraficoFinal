// public/firebase-config.js
// Configuración Firebase v8 (Compat)
var firebaseConfig = {
  apiKey: "AIzaSyBp2ZiKA4lYieyjX_aJJjE023NeqKrRhJc",
  authDomain: "seguridad-mdp-v2.firebaseapp.com",
  databaseURL: "https://seguridad-mdp-v2-default-rtdb.firebaseio.com",
  projectId: "seguridad-mdp-v2",
  storageBucket: "seguridad-mdp-v2.firebasestorage.app",
  messagingSenderId: "333795086790",
  appId: "1:333795086790:web:7f27c9c62851aeae0da2c7"
};

// 🔥 Inicializar Firebase (v8 - Compat)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Inicializar Firestore explícitamente
try {
  const db = firebase.firestore();
  console.log("✅ Firebase SDK y Firestore cargados y configurados");
} catch (error) {
  console.error("⚠️ Error inicializando Firestore:", error);
}