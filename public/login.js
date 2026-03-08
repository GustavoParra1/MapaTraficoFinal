// ============================
// 🔥 Inicializar Firebase
// ============================
if (!firebase.apps.length) {
  firebase.initializeApp(window.firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

// ============================
// 🔐 Login con redirección por rol
// ============================
document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorMessage = document.getElementById("error-message");

  errorMessage.textContent = "🔐 Verificando credenciales...";

  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      console.log("✅ Login OK UID:", user.uid);

      // FAST TRACK: Deducir rol DEL EMAIL sin esperar RTDB
      let redirectUrl = "/index.html"; // Default para admin/COM
      
      if (user.email.includes("capa-norte")) {
        redirectUrl = "/operador-interface.html";
        console.log("➡ Redirigiendo a Operador Interface (Capa Norte)");
      } else if (user.email.includes("capa-sur")) {
        redirectUrl = "/operador-interface.html";
        console.log("➡ Redirigiendo a Operador Interface (Capa Sur)");
      } else if (user.email.includes("mac@")) {
        redirectUrl = "/operador-chat.html?role=mac";
        console.log("➡ Redirigiendo a Chat Operador (MAC)");
      } else if (user.email.includes("uppl@")) {
        redirectUrl = "/operador-chat.html?role=uppl";
        console.log("➡ Redirigiendo a Chat Operador (UPPL)");
      } else if (user.email.includes("multiagencia@")) {
        redirectUrl = "/operador-chat.html?role=multiagencia";
        console.log("➡ Redirigiendo a Chat Operador (Multiagencia)");
      } else if (user.email.includes("encargado-sala@")) {
        redirectUrl = "/operador-chat.html?role=encargado-sala";
        console.log("➡ Redirigiendo a Chat Operador (Encargado de Sala)");
      } else if (user.email.includes("patrulla")) {
        redirectUrl = "/patrulla/index.html";
        console.log("➡ Redirigiendo a web patrulla");
      } else {
        console.log("➡ Redirigiendo a mapa / COM");
      }

      window.location.href = redirectUrl;
      return;
    })
    .then(() => {
      // En background: intentar traer datos de RTDB para actualizar (no bloqueante)
      auth.currentUser && db.ref("usuarios/" + auth.currentUser.uid).once("value")
        .then((snap) => {
          if (snap.exists()) {
            console.log("✅ Datos de RTDB sincronizados en background");
          }
        })
        .catch((err) => {
          console.info("ℹ️ RTDB background no crítico:", err.message);
        });
    })
    .catch((error) => {
      console.error("❌ Error de login:", error);
      errorMessage.textContent =
        error.code === "auth/user-not-found" || error.code === "auth/wrong-password"
          ? "❌ Usuario o contraseña incorrectos."
          : "❌ " + error.message;
    });
});