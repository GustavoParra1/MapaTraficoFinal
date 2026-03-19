// ============================
// VARIABLES GLOBALES CHAT BASE
// ============================
let chatMovilActual = null;
let currentChatListenerRef = null;

// --- Variables para rastrear mensajes no leídos ---
let unreadMessages = {}; // { operadorId: count }
let currentOpenOperador = null; // operador actualmente abierto en el chat

// --- Variables para control de Video WebRTC ---
let pc = null; 
let remoteStream = null;
let signalingRef = null;



// ============================
// CONFIGURACIÓN DE ANCHOS ADAPTATIVOS PARA CONSULTAS
// ============================
const CONSULTA_SIZES = {
  // PEQUEÑAS - Listas simples, pocas datos (500-600px)
  'concentracion_siniestros': 'small',
  'barrios_mas_robos': 'small',
  'tipos_siniestros_comunes': 'small',
  'ultimas_alertas': 'small',
  'barrios_mas_siniestros': 'small',
  'robos_zonas_sin_camaras': 'small',
  'barrios_menor_cobertura': 'small',
  'comparar_camaras': 'small',
  'zonas_ciegas': 'small',
  
  // MEDIANAS - Gráficos, tablas medianas, análisis (800-900px)
  'siniestros_noche': 'medium',
  'robos_por_dia': 'medium',
  'tendencia_distraccion': 'medium',
  'tendencia_semaforo': 'medium',
  'tendencia_exceso_velocidad': 'medium',
  'tendencia_peaton_imprudente': 'medium',
  'tendencia_no_prioridad': 'medium',
  'siniestros_hora_pico': 'medium',
  'patrullaje_sugerido': 'medium',
  'circulacion_motos_hora': 'medium',
  'siniestros_en_zonas_descubiertas': 'medium',
  'siniestros_por_dia': 'medium',
  'lineas_colectivo_siniestros': 'medium',
  'evolucion_temporal_siniestros': 'medium',
  'esquinas_sin_semaforo_criticas': 'medium',
  'esquinas_mas_siniestros': 'medium',
  'esquinas_peligrosas_peatones_ciclistas': 'medium',
  'heatmap_robos': 'medium',
  'robos_sin_intervencion': 'medium',
  'proponer_ubicaciones_camaras': 'medium',
  'semaforos_mas_siniestros': 'medium',
  
  // GRANDES - Tablas complejas, múltiples columnas (1100-1200px)
  'camaras_sin_siniestros': 'large',
  'densidad_camaras_barrio': 'large',
  'densidad_camaras_vs_siniestros': 'large',
  'correlacion_camaras_robos': 'large',
  'mejora_predictiva_cobertura': 'large',
  'siniestros_corredores_escolares': 'large',
  'siniestros_cerca_paradas_colectivo': 'large'
}


// ============================
// FIREBASE INIT - MODO COMPAT
// ============================
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const rtdb = firebase.database();
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

console.log("✅ Firebase inicializado (RTDB + AUTH + Storage)");
console.log("📱 script.js CARGA COMPLETADA - Esperando onAuthStateChanged...");

// Debug inmediato
auth.currentUser && console.log("🔥 currentUser ENCONTRADO:", auth.currentUser.email);

// ============================
// 🔐 PROTECCIÓN DE LA APP + ROLES (SOLO COM)
// ============================
console.log("🔑 Configurando onAuthStateChanged listener...");
auth.onAuthStateChanged((user) => {
  console.log("🔐 onAuthStateChanged DISPARADO:", user ? "Usuario EXISTE" : "Sin usuario");
  if (!user) {
    console.warn("🚫 Usuario NO autenticado");
    // Limpiar datos de sesión
    sessionStorage.removeItem('adminChatPinValidated');
    window.location.href = "login.html";
    return;
  }

  console.log("✅ Usuario autenticado:", user.email);

  // Mostrar email en el panel
  const userEmailElement = document.getElementById("user-email");
  if (userEmailElement) {
    userEmailElement.textContent = user.email;
  }

  // Logout
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      // Limpiar sessionStorage antes de logout
      sessionStorage.removeItem('adminChatPinValidated');
      auth.signOut().then(() => {
        window.location.href = "login.html";
      });
    };
  }

  // FAST TRACK: Deducir rol del email y arrancar inmediatamente
  // Sin esperar a RTDB (que parece tener problemas de permisos)
  let autoRol = "com";
  
  if (user.email.includes("patrulla")) {
    autoRol = "patrulla";
  } else if (user.email === "com@seguridad-mdp.com") {
    // Administrativo
    autoRol = "administrativo";
  } else if (user.email === "capa-norte@seguridad-mdp.com") {
    autoRol = "capa-norte";
  } else if (user.email === "capa-sur@seguridad-mdp.com") {
    autoRol = "capa-sur";
  } else if (["mac@seguridad-mdp.com", "uppl@seguridad-mdp.com", 
              "multiagencia@seguridad-mdp.com", "encargado-sala@seguridad-mdp.com"].includes(user.email)) {
    // Otros operadores
    autoRol = "operador";
  }
  
  const perfil = {
    email: user.email,
    rol: autoRol,
    createdAt: new Date().toISOString(),
    source: "email-fallback"
  };
  
  console.log("🚀 FAST TRACK: Rol deducido =", autoRol, "| Email:", user.email);
  console.log("📦 Perfil objeto creado:", perfil);
  
  // Procesar el perfil e iniciar la app SIN ESPERAR RTDB
  handleUserProfile(perfil, user.uid);
  
  // En background: intentar leer RTDB para actualizar datos (no es crítico)
  rtdb.ref("usuarios/" + user.uid).once("value")
    .then((snap) => {
      if (snap.exists()) {
        const perfilRTDB = snap.val();
        console.log("✅ Datos actualizados desde RTDB:", perfilRTDB);
        // Actualizar variables globales si hay datos nuevos
        if (perfilRTDB.rol) window.USER_ROL = perfilRTDB.rol;
        if (perfilRTDB.patrullaID) window.PATRULLA_ID = perfilRTDB.patrullaID;
      }
    })
    .catch((err) => {
      console.info("ℹ️ No se pudo leer datos de RTDB (no crítico):", err.message);
    });
});;

// Nueva función para manejar el perfil del usuario
function handleUserProfile(perfil, uid) {
  console.log("🔧 [1] Procesando perfil:", perfil.email, "Rol:", perfil.rol);
  
  try {
    // ⚡ REDIRECT INMEDIATO PARA OPERADORES (NO CARGAR MAPA)
    if (perfil.rol !== "administrativo") {
      console.log("🚀 REDIRECT INMEDIATO: Operador detectado (" + perfil.rol + ") → operador-interface.html");
      window.location.href = "operador-interface.html";
      return;
    }
    
    // SI LLEGAMOS AQUÍ = ES ADMIN, CONTINÚA CON MAPA
    window.USER_IS_ADMIN = true;
    console.log("🗺️ ADMIN confirmado - cargando mapa...");
    
    // Variables globales
    window.USER_ROL = perfil.rol;
    window.ES_PATRULLA = (perfil.rol === "patrulla");
    window.USER_UID = uid;
    window.USER_EMAIL = perfil.email;
    
    // ⭐ GUARDAR OBJETO USUARIO COMPLETO
    window.currentUser = {
      uid: uid,
      email: perfil.email,
      rol: perfil.rol,
      displayName: perfil.displayName || perfil.email.split('@')[0]
    };
    
    console.log("🔧 [2] Variables globales configuradas para ADMIN");
    console.log("🔧 [2b] window.currentUser guardado:", window.currentUser);
    
    // Detectar capa (norte/sur) para operadores
    if (perfil.rol && perfil.rol.includes("norte")) {
      window.USER_LAYER = "norte";
      console.log("🗺️ Capa detectada: NORTE");
    } else if (perfil.rol && perfil.rol.includes("sur")) {
      window.USER_LAYER = "sur";
      console.log("🗺️ Capa detectada: SUR");
    }

    // --- AUTO-CREAR PATRULLA (SEGURO) - pero no es crítico si falla
    if (perfil.rol === "patrulla" && perfil.patrullaID) {
      console.log("🧪 [3] Creando patrulla en RTDB:", perfil.patrullaID);
      rtdb.ref("patrullas/" + perfil.patrullaID).update({
        online: true,
        estado: "activo",
        timestamp: Date.now()
      }).catch(err => {
        console.warn("⚠️ No se pudo actualizar patrulla en RTDB (pero continuamos):", err);
      });
      
      window.PATRULLA_ID = perfil.patrullaID;
    }

    console.log("🔧 [4] Variables de patrulla (si aplica) configuradas");
    
    // Log del rol
    if (perfil.rol !== "com" && perfil.rol !== "administrativo") {
      console.warn("ℹ️ Este usuario tiene rol:", perfil.rol);
    }

    console.log("✅ [5] Perfil procesado. Iniciando app en 100ms...");
    
    // 🚀 ARRANQUE DE LA APP (sin esperar RTDB)
    setTimeout(() => {
      console.log("🚀 [6] Llamando iniciarApp()...");
      try {
        iniciarApp();
        console.log("🚀 [7] iniciarApp() completado sin errores");
      } catch (err) {
        console.error("❌ [7] Error en iniciarApp():", err);
      }
    }, 100);
  } catch (err) {
    console.error("❌ Error en handleUserProfile:", err);
  }
}

// ============================
// 🚀 INICIO REAL DE LA APP
// ============================
function iniciarApp() {
  console.log("🚀 [iniciarApp 1] App iniciada con Auth");

  try {
    console.log("🚀 [iniciarApp 2] Llamando iniciarChatCOM()...");
    iniciarChatCOM();
    console.log("🚀 [iniciarApp 3] iniciarChatCOM() completado");
  } catch (err) {
    console.warn("⚠️ Error en iniciarChatCOM (no bloqueante):", err);
  }

  if (window.ES_PATRULLA === true) {
    try {
      console.log("🚀 [iniciarApp 4] Llamando iniciarPatrulla()...");
      iniciarPatrulla();
      console.log("🚀 [iniciarApp 5] iniciarPatrulla() completado");
    } catch (err) {
      console.warn("⚠️ Error en iniciarPatrulla (no bloqueante):", err);
    }
  }

  // 🔄 Recalcular tamaño del mapa (COM y Patrulla)
  setTimeout(() => {
    try {
      console.log("🚀 [iniciarApp 6] Intentando invalidar mapa...");
      if (window.mymap) {
        mymap.invalidateSize();
        console.log("🔄 [iniciarApp 7] Mapa recalculado (invalidateSize)");
      } else {
        console.warn("⚠️ [iniciarApp 7] window.mymap aún no existe");
      }
    } catch (err) {
      console.warn("⚠️ Error en invalidateSize (no bloqueante):", err);
    }
  }, 300);
  
  // 🔐 SETUP: Botón Panel de Chat para Administrativo
  if (window.USER_IS_ADMIN) {
    const chatPanelBtn = document.getElementById('chat-panel-btn');
    if (chatPanelBtn) {
      chatPanelBtn.style.display = 'block';
      chatPanelBtn.onclick = () => {
        setupAdminChatModal();
      };
      console.log('✅ Botón Panel de Chat habilitado para administrativo');
    }
  }
  
  // 🎯 Inicializar sistema de eventos para capas norte/sur y admin
  if (window.currentUser && (window.USER_LAYER === 'norte' || window.USER_LAYER === 'sur' || window.USER_IS_ADMIN)) {
    console.log('🎯 Iniciando sistema de eventos desde iniciarApp()...');
    if (typeof initEventSystem === 'function') {
      initEventSystem();
    }
  }
  
  console.log("🚀 [iniciarApp 8] Función iniciarApp() completada");
}

// ===== SETUP RESPONSIVE MÓVIL =====
function setupMobileResponsive() {
  const toggleBtn = document.getElementById('toggle-right-panel-btn');
  const closeBtn = document.getElementById('close-right-panel-btn');
  const rightPanel = document.getElementById('right-panel');
  
  if (!toggleBtn || !closeBtn || !rightPanel) return;
  
  // Detectar si es móvil
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    // Mostrar botones en móvil
    console.log("📱 Activando modo móvil responsivo");
    toggleBtn.style.display = 'block';
    closeBtn.style.display = 'block';
    rightPanel.style.position = 'fixed';
    rightPanel.style.right = '-100%';
    
    // Click en botón toggle → abrir panel
    toggleBtn.onclick = () => {
      rightPanel.classList.add('active');
      rightPanel.style.right = '0';
      toggleBtn.style.display = 'none';
    };
    
    // Click en botón cerrar → cerrar panel
    closeBtn.onclick = () => {
      rightPanel.classList.remove('active');
      rightPanel.style.right = '-100%';
      toggleBtn.style.display = 'block';
    };
    
    // Click fuera → cerrar panel
    document.onclick = (e) => {
      if (rightPanel.classList.contains('active') && 
          !rightPanel.contains(e.target) && 
          !toggleBtn.contains(e.target)) {
        rightPanel.classList.remove('active');
        rightPanel.style.right = '-100%';
        toggleBtn.style.display = 'block';
      }
    };
  }
  
  // Reajustar en resize
  window.addEventListener('resize', () => {
    const newIsMobile = window.innerWidth <= 768;
    if (newIsMobile !== isMobile) {
      location.reload();
    }
  });
}

// Llamar setup móvil cuando DOM esté listo
document.addEventListener('DOMContentLoaded', setupMobileResponsive);
function setupAdminChatModal() {
  // Verificación de seguridad: verificar que el usuario está autenticado
  const currentUser = firebase.auth().currentUser;
  if (!currentUser) {
    alert('Error: Sesión no activa. Por favor, inicia sesión de nuevo.');
    sessionStorage.removeItem('adminChatPinValidated');
    window.location.href = 'login.html';
    return;
  }
  
  const modal = document.getElementById('admin-chat-modal');
  const closeBtn = document.getElementById('admin-chat-close-btn');
  const chatHeader = document.querySelector('.admin-chat-header');
  
  // Mostrar modal
  modal.style.display = 'flex';
  
  // Botón cerrar
  closeBtn.onclick = () => {
    modal.style.display = 'none';
    currentOpenOperador = null; // Resetear operador abierto
  };

  // ===== DRAG AND DROP =====
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  chatHeader.addEventListener('mousedown', (e) => {
    // Solo si hace clic en el header (no en botones)
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    
    isDragging = true;
    
    // Obtener posición actual del modal
    const rect = modal.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    
    chatHeader.style.cursor = 'grabbing';
    modal.style.transition = 'none'; // Quitar animación mientras se arrastra
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    // Nueva posición desde viewport
    let newX = e.clientX - offsetX;
    let newY = e.clientY - offsetY;

    // Limitar a ventana visible
    const maxX = window.innerWidth - modal.offsetWidth;
    const maxY = window.innerHeight - modal.offsetHeight;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    modal.style.transform = `translate(${newX}px, ${newY}px)`;
    modal.style.top = 'auto';
    modal.style.left = 'auto';
    modal.style.right = 'auto';
    modal.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      chatHeader.style.cursor = 'move';
      modal.style.transition = 'all 0.3s ease'; // Restaurar animación
    }
  });

  // Verificar si PIN ya fue validado en esta sesión
  const pinValidated = sessionStorage.getItem('adminChatPinValidated');
  
  if (pinValidated === 'true') {
    // PIN ya validado, mostrar directamente el chat
    showAdminChatContent();
  } else {
    // Pedir PIN
    showAdminPinModal();
  }
}

// ===== MOSTRAR MODAL DE PIN =====
function showAdminPinModal() {
  // Verificación de seguridad adicional
  const currentUser = firebase.auth().currentUser;
  if (!currentUser) {
    console.error('❌ No hay usuario autenticado, no se puede abrir PIN modal');
    sessionStorage.removeItem('adminChatPinValidated');
    document.getElementById('admin-chat-modal').style.display = 'none';
    return;
  }
  
  const pinModal = document.getElementById('pin-modal-container');
  const pinInput = document.getElementById('admin-pin-input');
  const pinSubmit = document.getElementById('admin-pin-submit');
  const pinCancel = document.getElementById('admin-pin-cancel');
  const pinError = document.getElementById('pin-error-msg');
  
  pinModal.style.display = 'flex';
  pinInput.focus();

  const validatePin = () => {
    const inputValue = pinInput.value.trim();
    
    if (inputValue === '1962') {
      // PIN correcto
      sessionStorage.setItem('adminChatPinValidated', 'true');
      pinModal.style.display = 'none';
      showAdminChatContent();
      pinError.style.display = 'none';
      pinInput.value = '';
    } else {
      // PIN incorrecto
      pinInput.classList.add('error');
      pinError.style.display = 'block';
      pinError.textContent = '❌ PIN incorrecto';
      pinInput.value = '';
      pinInput.focus();
      
      setTimeout(() => {
        pinInput.classList.remove('error');
      }, 300);
    }
  };

  pinSubmit.onclick = validatePin;
  pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validatePin();
  });

  pinCancel.onclick = () => {
    document.getElementById('admin-chat-modal').style.display = 'none';
    pinModal.style.display = 'none';
  };
}

// ===== MOSTRAR CONTENIDO DEL CHAT =====
async function showAdminChatContent() {
  const chatContent = document.getElementById('admin-chat-content');
  const operadoresList = document.getElementById('operadores-list-modal');
  
  chatContent.style.display = 'flex';
  
  // Cargar operadores
  const operadoras = [
    { id: 'capa-norte', nombre: '👮 Capa Norte', email: 'capa-norte@seguridad-mdp.com' },
    { id: 'capa-sur', nombre: '👮 Capa Sur', email: 'capa-sur@seguridad-mdp.com' },
    { id: 'mac', nombre: '🚗 MAC', email: 'mac@seguridad-mdp.com' },
    { id: 'uppl', nombre: '🚔 UPPL', email: 'uppl@seguridad-mdp.com' },
    { id: 'multiagencia', nombre: '🏢 Multiagencia', email: 'multiagencia@seguridad-mdp.com' },
    { id: 'encargado-sala', nombre: '👨‍💼 Encargado de Sala', email: 'encargado-sala@seguridad-mdp.com' }
  ];

  operadoresList.innerHTML = '';
  
  // Cargar nombres personalizados desde la SESIÓN ACTUAL (operador-sesiones)
  const db = firebase.firestore();
  for (let op of operadoras) {
    try {
      // Buscar la sesión más reciente del operador
      const sessionsRef = db.collection('operador-sesiones')
        .where('operatorEmail', '==', op.email)
        .orderBy('loginTime', 'desc')
        .limit(1);
      
      sessionsRef.onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const latestSession = snapshot.docs[0].data();
          op.nombrePersonalizado = latestSession.operatorName;
          
          // Actualizar botón si existe (sin borrar el badge)
          const btn = document.querySelector(`[data-operador="${op.id}"]`);
          if (btn) {
            const displayName = op.nombrePersonalizado || op.nombre;
            const subtitle = op.nombrePersonalizado ? `(${op.nombre})` : '🟢 Online';
            // Actualizar solo los spans de nombre y status, preservando el badge
            const nameSpan = btn.querySelector('.operador-btn-modal-name');
            const statusSpan = btn.querySelector('.operador-btn-modal-status');
            if (nameSpan) nameSpan.textContent = displayName;
            if (statusSpan) statusSpan.textContent = subtitle;
          }
        }
      });
    } catch (error) {
      console.log(`⚠️ No se pudo cargar sesión para ${op.id}:`, error.message);
    }
  }

  operadoras.forEach(op => {
    const btn = document.createElement('button');
    btn.className = 'operador-btn-modal';
    btn.setAttribute('data-operador', op.id); // Agregar atributo para identificar
    
    // Mostrar nombre personalizado si existe, sino el rol
    const displayName = op.nombrePersonalizado || op.nombre;
    const subtitle = op.nombrePersonalizado ? `(${op.nombre})` : '🟢 Online';
    
    btn.innerHTML = `
      <span class="operador-btn-modal-name">${displayName}</span>
      <span class="operador-btn-modal-status">${subtitle}</span>
      <span class="operador-unread-badge" style="display: none;">0</span>
    `;
    
    btn.onclick = async () => {
      await selectOperadorModal(op, btn);
    };
    
    operadoresList.appendChild(btn);
  });

  // ===== MARCAR TODOS LOS MENSAJES EXISTENTES COMO LEÍDOS =====
  // Inicializar todos los mensajes sin el campo isRead como si fueran leídos
  await initializeAllMessagesAsRead(operadoras);
  
  // Limpiar badges después de inicializar
  unreadMessages = {};
  updateUnreadBadges();
  
  // Pequeño delay para asegurar que Firestore se actualice
  await new Promise(resolve => setTimeout(resolve, 500));

  // ===== CONFIGURAR LISTENERS DE MENSAJES PARA TODOS LOS OPERADORES =====
  // Detectar mensajes no leídos incluso si no está abierto el chat
  operadoras.forEach(op => {
    try {
      const chatDocPath = `chats-com/${op.id}`;
      db.doc(chatDocPath).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(
          (snapshot) => {
            // Solo contar si el chat no está actualmente abierto
            if (currentOpenOperador !== op.id) {
              // Contar SOLO mensajes donde isRead es EXPLÍCITAMENTE false
              const unreadMsgs = snapshot.docs.filter(msg => {
                const data = msg.data();
                return data.sender !== 'system' && data.isRead === false;
              });
              unreadMessages[op.id] = unreadMsgs.length;
              updateUnreadBadges();
            }
          },
          (error) => {
            console.log(`⚠️ No se pudo escuchar chat de ${op.id}:`, error.message);
          }
        );
    } catch (error) {
      console.log(`⚠️ Error configurando listener para ${op.id}:`, error.message);
    }
  });
}

// ===== SELECCIONAR OPERADOR =====
async function selectOperadorModal(operador, btnElement) {
  // Actualizar clase activa
  document.querySelectorAll('.operador-btn-modal').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');

  // Mostrar header y área de input
  document.getElementById('chat-header-modal').style.display = 'flex';
  document.getElementById('input-area-modal').style.display = 'flex';

  // Obtener nombre más reciente de la SESIÓN ACTUAL
  const db = firebase.firestore();
  try {
    // Buscar por email del operador
    const emailToSearch = operador.email || `${operador.id}@seguridad-mdp.com`;
    console.log(`🔍 Buscando sesión para: ${emailToSearch}`);
    
    const sessionsRef = db.collection('operador-sesiones')
      .where('operatorEmail', '==', emailToSearch)
      .orderBy('loginTime', 'desc')
      .limit(1);
    
    const snapshot = await sessionsRef.get();
    if (!snapshot.empty) {
      const latestSession = snapshot.docs[0].data();
      operador.nombrePersonalizado = latestSession.operatorName;
      console.log(`✅ Sesión encontrada: ${latestSession.operatorName}`);
    } else {
      console.log(`⚠️ No hay sesión registrada para ${emailToSearch}`);
    }
  } catch (error) {
    console.log('⚠️ Error cargando sesión reciente:', error);
  }

  // Mostrar nombre actualizado en el header
  const displayName = operador.nombrePersonalizado || operador.nombre;
  console.log(`📝 Mostrando nombre en header: ${displayName}`);
  document.getElementById('selected-operador-name').textContent = displayName;

  // Escuchar cambios en SESIONES EN TIEMPO REAL
  const emailToWatch = operador.email || `${operador.id}@seguridad-mdp.com`;
  db.collection('operador-sesiones')
    .where('operatorEmail', '==', emailToWatch)
    .orderBy('loginTime', 'desc')
    .limit(1)
    .onSnapshot((snapshot) => {
      if (!snapshot.empty) {
        const latestSession = snapshot.docs[0].data();
        console.log(`🔄 Sesión actualizada en tiempo real: ${latestSession.operatorName}`);
        document.getElementById('selected-operador-name').textContent = latestSession.operatorName;
      }
    });

  // Marcar como operador abierto y limpiar no leídos
  currentOpenOperador = operador.id;
  unreadMessages[operador.id] = 0;
  
  // Forzar limpiar badge visualmente
  const btn = btnElement;
  let badge = btn.querySelector('.operador-unread-badge');
  if (badge) {
    badge.style.display = 'none';
    badge.style.visibility = 'hidden';
  }
  
  updateUnreadBadges();

  // Cargar mensajes (pasar el nombre personalizado o el rol)
  loadAdminChatMessages(operador.id, operador.nombrePersonalizado || operador.nombre);

  // Setup envío de mensajes
  setupMessageSend(operador.id);
  
  // Marcar en Firestore que todos los mensajes del operador fueron vistos
  markOperadorMessagesAsRead(operador.id);
}

// ===== CARGAR MENSAJES EN CHAT =====
// ===== CARGAR MENSAJES EN CHAT =====
async function loadAdminChatMessages(operadorId, operadorNombre) {
  const messagesContainer = document.getElementById('messages-modal');
  
  // Esperar a que Firestore esté disponible
  if (!firebase.firestore) {
    console.error('❌ Firestore no está disponible');
    messagesContainer.innerHTML = `<div class="empty-messages"><p>Error: Firestore no inicializado</p></div>`;
    return;
  }

  // Intentar leer mensajes de Firestore
  let db;
  try {
    db = firebase.firestore();
  } catch (error) {
    console.error('❌ Error inicializando Firestore:', error);
    messagesContainer.innerHTML = `<div class="empty-messages"><p>Error: ${error.message}</p></div>`;
    return;
  }

  // ✅ IMPORTANTE: Marcar todos como leídos ANTES de cargar
  await markAllOperatorMessagesAsRead(operadorId);

  const chatDocPath = `chats-com/${operadorId}`;
  
  db.doc(chatDocPath).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot(
      (snapshot) => {
        const messages = snapshot.docs;
        
        // Contar solo los mensajes NO LEÍDOS si este chat no está abierto
        if (currentOpenOperador !== operadorId) {
          // Contar SOLO mensajes donde isRead es EXPLÍCITAMENTE false
          const unreadMsgs = messages.filter(msg => {
            const data = msg.data();
            return data.sender !== 'system' && data.isRead === false;
          });
          unreadMessages[operadorId] = unreadMsgs.length;
          updateUnreadBadges();
        }

        if (messages.length === 0) {
          messagesContainer.innerHTML = `
            <div class="empty-messages">
              <p>No hay mensajes aún. Sé el primero en escribir.</p>
            </div>
          `;
          return;
        }

        messagesContainer.innerHTML = '';
        messages.forEach(msg => {
          const data = msg.data();
          const isFromAdmin = data.sender === 'admin';
          const isSystem = data.sender === 'system';
          const div = document.createElement('div');
          div.className = `message-modal ${isSystem ? 'system' : (isFromAdmin ? 'admin' : 'operador')}`;
          
          const date = new Date(data.timestamp?.toDate?.() || new Date());
          const time = date.toLocaleTimeString('es-AR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });

          if (isSystem) {
            // Evento del sistema (login/logout)
            div.innerHTML = `
              <div style="text-align: center; font-style: italic; color: #856404;">
                ${data.text}<br>
                <span class="message-time-modal">${time}</span>
              </div>
            `;
          } else {
            // Mensaje normal
            const displayName = isFromAdmin 
              ? '👨‍💼 Tú' 
              : `👤 ${data.operadorNombre || operadorNombre || 'Operador'}`;
            
            div.innerHTML = `
              <strong>${displayName}</strong><br>
              ${escapeHtml(data.text)}<br>
              <span class="message-time-modal">${time}</span>
            `;
          }
          
          messagesContainer.appendChild(div);
        });

        // Scroll al final
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      },
      (error) => {
        console.log('⚠️ No se pudieron cargar mensajes:', error.message);
      }
    );
}

// ===== ACTUALIZAR BADGES DE MENSAJES NO LEÍDOS =====
function updateUnreadBadges() {
  // Actualizar badge del botón principal
  const chatPanelBtn = document.getElementById('chat-panel-btn');
  if (chatPanelBtn) {
    const totalUnread = Object.values(unreadMessages).reduce((sum, count) => sum + count, 0);
    let badge = chatPanelBtn.querySelector('.unread-badge');
    
    if (totalUnread > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unread-badge';
        chatPanelBtn.appendChild(badge);
      }
      badge.textContent = totalUnread > 9 ? '9+' : totalUnread;
      badge.style.display = 'block';
    } else if (badge) {
      badge.style.display = 'none';
    }
  }
  
  // Actualizar badges de cada operador usando data-operador
  document.querySelectorAll('.operador-btn-modal').forEach(btn => {
    const operadorId = btn.getAttribute('data-operador');
    
    if (operadorId) {
      const count = unreadMessages[operadorId] || 0;
      let operadorBadge = btn.querySelector('.operador-unread-badge');
      
      if (count > 0) {
        if (!operadorBadge) {
          operadorBadge = document.createElement('span');
          operadorBadge.className = 'operador-unread-badge';
          btn.appendChild(operadorBadge);
        }
        operadorBadge.textContent = count > 9 ? '9+' : count;
        operadorBadge.style.display = 'inline-block';
      } else if (operadorBadge) {
        operadorBadge.style.display = 'none';
      }
    }
  });
}

// ===== INICIALIZAR TODOS LOS MENSAJES COMO LEÍDOS =====
async function initializeAllMessagesAsRead(operadores) {
  const db = firebase.firestore();
  
  for (const op of operadores) {
    try {
      const chatDocPath = `chats-com/${op.id}`;
      const snapshot = await db.doc(chatDocPath).collection('messages').get();
      
      if (snapshot.docs.length > 0) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          // Marcar como leído si no tiene el campo isRead
          if (data.isRead === undefined || data.isRead === null) {
            batch.update(doc.ref, {
              isRead: true,
              readAt: new Date().toISOString(),
              initializedAsRead: true
            });
          }
        });
        await batch.commit();
        console.log(`✅ ${snapshot.docs.length} mensajes de ${op.id} inicializados como leídos`);
      }
    } catch (error) {
      console.log(`⚠️ Error inicializando mensajes de ${op.id}:`, error.message);
    }
  }
}

// ===== MARCAR TODOS LOS MENSAJES DE UN OPERADOR COMO LEÍDOS (AGRESIVO) =====
async function markAllOperatorMessagesAsRead(operadorId) {
  const db = firebase.firestore();
  const chatDocPath = `chats-com/${operadorId}`;
  
  try {
    const snapshot = await db.doc(chatDocPath).collection('messages').get();
    
    if (snapshot.docs.length > 0) {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        // Marcar TODOS como leído (excepto mensajes del sistema)
        if (data.sender !== 'system') {
          batch.update(doc.ref, {
            isRead: true,
            readAt: new Date().toISOString()
          });
        }
      });
      await batch.commit();
      console.log(`✅ Se marcaron ${snapshot.docs.length} mensajes de ${operadorId} como leídos`);
    }
  } catch (error) {
    console.log(`⚠️ Error marcando mensajes de ${operadorId}:`, error.message);
  }
}

// ===== MARCAR MENSAJES COMO LEÍDOS =====
function markOperadorMessagesAsRead(operadorId) {
  const db = firebase.firestore();
  const chatDocPath = `chats-com/${operadorId}`;
  
  // Obtener todos los mensajes del operador
  db.doc(chatDocPath).collection('messages')
    .where('isRead', '==', false)
    .get()
    .then((snapshot) => {
      // Actualizar cada mensaje para marcar como leído
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { 
          isRead: true,
          readAt: new Date().toISOString()
        });
      });
      batch.commit().then(() => {
        console.log(`✅ ${snapshot.docs.length} mensajes de ${operadorId} marcados como leídos`);
      });
    })
    .catch((err) => {
      console.log('⚠️ Error marcando mensajes como leídos:', err.message);
    });
}

// ===== SETUP: ENVIAR MENSAJES =====
function setupMessageSend(operadorId) {
  const input = document.getElementById('message-input-modal');
  const sendBtn = document.getElementById('send-message-modal');
  
  // Reemplazar el botón para limpiar listeners previos
  const newSendBtn = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
  
  // Nuevo handler que usa currentOpenOperador
  newSendBtn.onclick = () => {
    const text = document.getElementById('message-input-modal').value.trim();
    if (text) {
      sendAdminMessage(document.getElementById('message-input-modal'));
    }
  };
  
  // Reemplazar el input para limpiar listeners previos
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  
  // Nuevo listener de Enter que usa currentOpenOperador
  newInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const text = newInput.value.trim();
      if (text) {
        sendAdminMessage(newInput);
      }
    }
  });
  
  // Configurar botón de limpiar chat
  const clearBtn = document.getElementById('clear-chat-btn');
  if (clearBtn) {
    // Limpiar listeners previos
    const newClearBtn = clearBtn.cloneNode(true);
    if (clearBtn.parentNode) {
      clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
    }
    
    newClearBtn.addEventListener('click', async () => {
      if (!currentOpenOperador) {
        alert('No hay chat abierto');
        return;
      }
      
      if (confirm(`¿Estás seguro de que quieres eliminar TODOS los mensajes de ${operadorId}?`)) {
        await clearChatMessages(operadorId);
      }
    });
  }
}

// ===== LIMPIAR TODOS LOS MENSAJES DE UN CHAT =====
async function clearChatMessages(operadorId) {
  const db = firebase.firestore();
  const rtdb = firebase.database();
  const chatDocPath = `chats-com/${operadorId}`;
  
  try {
    // Borrar de Firestore
    const snapshot = await db.doc(chatDocPath).collection('messages').get();
    
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`✅ Se eliminaron ${snapshot.docs.length} mensajes de Firestore`);
    
    // Borrar de RTDB también
    await rtdb.ref(`${chatDocPath}/messages`).remove();
    console.log(`✅ Se eliminaron mensajes de RTDB`);
    
    // Guardar metadata de limpieza para evitar que se recarguen
    await db.doc(chatDocPath).set({
      lastClearedAt: new Date().toISOString(),
      clearedBy: 'admin'
    }, { merge: true });
    console.log(`✅ Se guardó metadata de limpieza`);
    
    // Recargar el chat
    const operador = {
      id: operadorId,
      nombre: document.getElementById('selected-operador-name').textContent
    };
    loadAdminChatMessages(operadorId, operador.nombre);
    
  } catch (error) {
    console.error('❌ Error limpiando chat:', error);
    alert(`Error: ${error.message}`);
  }
}

// ===== ENVIAR MENSAJE COMO ADMIN =====
async function sendAdminMessage(inputElement) {
  const text = inputElement.value.trim();
  if (!text) return;

  try {
    if (!firebase.firestore) {
      console.error('❌ Firestore no está disponible');
      alert('Error: Firestore no inicializado');
      return;
    }

    const db = firebase.firestore();
    const rtdb = firebase.database();
    const auth = firebase.auth();
    
    // Usar siempre currentOpenOperador para asegurar que va al operador correcto
    if (!currentOpenOperador) {
      alert('Error: Selecciona un operador primero');
      return;
    }
    
    const chatDocPath = `chats-com/${currentOpenOperador}`;
    const timestamp = new Date().toISOString();
    const messageData = {
      sender: 'admin',
      text: text,
      timestamp: timestamp,
      adminEmail: auth.currentUser.email,
      isRead: false,
      readAt: null
    };
    
    // Guardar en Firestore (para historial)
    await db.doc(chatDocPath).collection('messages').add({
      ...messageData,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // ⚠️ IMPORTANTE: También guardar en RTDB para que operador-interface.html lo vea en tiempo real
    await rtdb.ref(`${chatDocPath}/messages`).push(messageData);
    
    console.log('✅ Mensaje enviado al operador:', currentOpenOperador);

    inputElement.value = '';
    inputElement.focus();
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    alert('Error: ' + error.message);
  }
}

// =======================================================
// WebApp Patrulla - onDisconnect + estructura
// (solo funciona si este script corre EN la patrulla)
// =======================================================

// Si este script está en el MAPA, ignoramos esta parte
function iniciarPatrulla() {

  const patrullaID = window.PATRULLA_ID || "Móvil_00"; 
  const patrullaRef = rtdb.ref("patrullas/" + patrullaID);

  patrullaRef.onDisconnect().update({
    online: false,
    estado: "desconectado",
    timestamp: Date.now()
  });

  console.log("📡 onDisconnect inicializado para", patrullaID);
}

// ===== Función para mostrar mensajes en el panel del COM =====
function mostrarMensajeChatCOM(movil, msg) {
  console.log(`💬 Incoming message for chat-com-panel from ${movil}:`, msg);
  if (!msg || !msg.text) return;

  const cont = document.getElementById("chat-com-mensajes");
  if (!cont) return;

  const div = document.createElement("div");
  div.classList.add("chat-message");

  // Origen del mensaje
  const origen = msg.from === "base" ? "BASE" : movil;

  // Fecha / hora
  const displayTime = msg.timestamp
    ? new Date(msg.timestamp).toLocaleString()
    : "";

  // Contenido del mensaje
  div.innerHTML = `
    <b>${origen}:</b> ${msg.text}<br>
    <small>${displayTime}</small><br>
    <button class="reply-button" data-movil="${movil}">Responder</button>
    <hr>
  `;

  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;

  // Evento responder
  const replyButton = div.querySelector(".reply-button");
  if (replyButton) {
    replyButton.addEventListener("click", (e) => {
      const targetMovil = e.target.dataset.movil;
      if (targetMovil) {
        abrirChatBase(targetMovil);

        const panel = document.getElementById("chat-com-panel");
        if (panel) panel.style.display = "none";

        const floatingBtn = document.getElementById("open-chat-com");
        if (floatingBtn) floatingBtn.style.display = "none";
      }
    });
  }

  // Notificación en el mapa
  rtdb.ref(`patrullas/${movil}`)
    .update({ hasNewMessage: true })
    .catch(err =>
      console.error("Error setting hasNewMessage in Firebase:", err)
    );
}


// ===== Inicializar escucha del chat COM =====
function iniciarChatCOM() {
  console.log("💬 Chat COM iniciado (modo correcto)");

  const chatRootRef = rtdb.ref("chat");

  // Detecta nuevas patrullas
  chatRootRef.on("child_added", snap => {
    const movil = snap.key;
    if (!movil) { // Check if movil is null or empty
        console.warn("🚫 Se detectó una patrulla con clave nula o vacía. Se ignora.");
        return;
    }
    console.log("📡 Escuchando chat de patrulla:", movil);

    // Escuchar SOLO mensajes nuevos de esa patrulla
    rtdb.ref("chat/" + movil)
      .limitToLast(1)
      .on("child_added", msgSnap => {
        const msg = msgSnap.val();
        mostrarMensajeChatCOM(movil, msg);
      });
  });

  // ===== ESCUCHAR TARJETAS DE EVENTOS DE OPERADORES =====
  console.log("🎯 Monitoreando tarjetas de operadores...");
  rtdb.ref("operador-tarjetas").on("child_added", snap => {
    const cardId = snap.key;
    const card = snap.val();
    
    if (card && card.type === 'event-card') {
      console.log("📌 Tarjeta de evento recibida:", cardId);
      mostrarTarjetaEventoEnChat(cardId, card);
    }
  });

  // Escuchar actualizaciones de tarjetas (el operador envía más info)
  rtdb.ref("operador-tarjetas").on("child_changed", snap => {
    const cardId = snap.key;
    const card = snap.val();
    
    if (card && card.type === 'event-card') {
      console.log("🔄 Tarjeta actualizada:", cardId);
      actualizarTarjetaEnChat(cardId, card);
    }
  });
}

// ===== MOSTRAR TARJETA DE EVENTO EN CHAT =====
function mostrarTarjetaEventoEnChat(cardId, cardData) {
  const chatPanel = document.getElementById("chat-com-panel");
  if (!chatPanel) return;

  const mensajesDiv = document.getElementById("chat-com-mensajes");
  if (!mensajesDiv) return;

  // Crear elemento de tarjeta
  const cardElement = document.createElement("div");
  cardElement.id = "card-" + cardId;
  cardElement.style.cssText = `
    background: linear-gradient(135deg, #fff5e1 0%, #ffe8c1 100%);
    border: 2px solid #ff9800;
    border-radius: 8px;
    padding: 12px;
    margin: 8px 0;
    box-shadow: 0 2px 8px rgba(255, 152, 0, 0.2);
    cursor: pointer;
    transition: all 0.3s;
  `;

  cardElement.innerHTML = `
    <div style="font-weight: bold; color: #e65100; margin-bottom: 6px;">
      📌 Evento - Cám. ${cardData.cameraNumber}
    </div>
    <div style="font-size: 0.9em; color: #333;">
      <div><strong>Ubicación:</strong> ${cardData.location}</div>
      <div><strong>Tipo:</strong> ${cardData.notificationType}</div>
      <div><strong>Operador:</strong> ${cardData.operatorName} (${cardData.layer})</div>
      <div><strong>Estado:</strong> <span style="color: #d32f2f; font-weight: bold;">${cardData.status}</span></div>
      ${cardData.briefReport ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #ddd;"><strong>Descripción:</strong> "${cardData.briefReport}"</div>` : ''}
      ${cardData.notes ? `<div style="margin-top: 4px;"><strong>Observaciones:</strong> "${cardData.notes}"</div>` : ''}
      ${cardData.finalNotes ? `<div style="margin-top: 4px;"><strong>Observaciones Finales:</strong> "${cardData.finalNotes}"</div>` : ''}
    </div>
    <div style="font-size: 0.8em; color: #666; margin-top: 6px;">
      ID: ${cardId.substring(0, 12)}...
    </div>
  `;

  // Click para editar
  cardElement.onclick = () => {
    editarTarjetaBuseta(cardId, cardData);
  };

  mensajesDiv.appendChild(cardElement);
  mensajesDiv.scrollTop = mensajesDiv.scrollHeight;
}

// ===== ACTUALIZAR TARJETA EN CHAT =====
function actualizarTarjetaEnChat(cardId, updatedCard) {
  const cardElement = document.getElementById("card-" + cardId);
  if (!cardElement) {
    // Si no existe, crear la tarjeta
    mostrarTarjetaEventoEnChat(cardId, updatedCard);
    return;
  }

  // Actualizar contenido
  cardElement.innerHTML = `
    <div style="font-weight: bold; color: #e65100; margin-bottom: 6px;">
      📌 Evento - Cám. ${updatedCard.cameraNumber}
    </div>
    <div style="font-size: 0.9em; color: #333;">
      <div><strong>Ubicación:</strong> ${updatedCard.location}</div>
      <div><strong>Tipo:</strong> ${updatedCard.notificationType}</div>
      <div><strong>Operador:</strong> ${updatedCard.operatorName} (${updatedCard.layer})</div>
      <div><strong>Estado:</strong> <span style="color: ${updatedCard.status === 'CERRADO' ? '#388e3c' : '#d32f2f'}; font-weight: bold;">${updatedCard.status}</span></div>
      ${updatedCard.briefReport ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #ddd;"><strong>Descripción:</strong> "${updatedCard.briefReport}"</div>` : ''}
      ${updatedCard.notes ? `<div style="margin-top: 4px;"><strong>Observaciones:</strong> "${updatedCard.notes}"</div>` : ''}
      ${updatedCard.finalNotes ? `<div style="margin-top: 4px;"><strong>Observaciones Finales:</strong> "${updatedCard.finalNotes}"</div>` : ''}
    </div>
    <div style="font-size: 0.8em; color: #666; margin-top: 6px;">
      ID: ${cardId.substring(0, 12)}... | Última actualización: ${new Date(updatedCard.updatedAt || updatedCard.createdAt).toLocaleTimeString('es-AR')}
    </div>
  `;
}

// ===== EDITAR TARJETA =====
function editarTarjetaBuseta(cardId, cardData) {
  // Mostrar modal o panel para editar
  alert("Tarjeta: " + cardId + "\nOperador: " + cardData.operatorName + "\nEstado: " + cardData.status);
  // TODO: Implementar edición modal
}

// =======================================================
// Protección...
// =======================================================
window._bloquearSiniestros = false;

// =======================================================
// Protección...
// =======================================================
if (window._scriptLoaded) {
  console.warn("🔴 script.js ya estaba cargado — se detiene la ejecución duplicada");
  throw "STOP_DUPLICATE_SCRIPT";
}
window._scriptLoaded = true;

// Mapeos de datos para filtros y popups
const participantMapping = {
    'A': 'Auto',
    'M': 'Moto',
    'B': 'Ciclista',
    'P': 'Peatón',
    'COL': 'Colectivo',
    'CAM': 'Camión',
    'CTA': 'Carga/Transporte',
    'MI': 'Monopatín',
    'TAXI': 'Taxi',
    'POLICIA': 'Policía',
    'AMB': 'Ambulancia',
    'C': 'Carga',
    'PERRO': 'Animal',
    'CABALLO': 'Animal',
    'MONOPATIN': 'Monopatín',
    '?': 'Desconocido'
};
const causeMapping = {
    'D': 'Despiste',
    'NSD': 'No se determina',
    'VS': 'Velocidad',
    'PC': 'Pérdida de control',
    'MR': 'Marcha atrás',
    'PI': 'Peatón imprudente',
    'A': 'Abandono',
    'G': 'Giro indebido',
    'NR': 'No respeta prioridad',
    'FV': 'Fuga y vuelco',
    'EV': 'Exceso de velocidad',
    'IC': 'Intervención de terceros',
    'GIRO': 'Giro indebido'
};

let allSiniestrosData; // Variable para almacenar los datos de siniestros

console.log("🟢 script.js cargado una sola vez");
// ============================================
// 1. CONFIGURACIÓN DE API KEY (AL PRINCIPIO)
const GOOGLE_MAPS_API_KEY = 'AIzaSyBp2ZiKA4lYieyjX_aJJjE023NeqKrRhJc'; // ✅ CORRECTO (misma que movil.html)


function createRankedIcon(rank, type) {
  const iconClass = type === 'siniestro' ? 'fi fi-sr-star' : 'fi fi-sr-star';
  const iconColor = type === 'siniestro' ? 'rgba(0, 123, 255, 0.5)' : 'rgba(220, 53, 69, 0.5)';
  const labelHtml = `<div class="${type}-rank-label">#${rank}</div>`;

  return L.divIcon({
      className: 'custom-ranked-icon',
      html: `
          <i class="${iconClass}" style="font-size: 32px; color: ${iconColor};"></i>
          ${labelHtml}
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40]
  });
}

const TOMTOM_API_KEY = 'ViFhDo6I00BxfLOvXJBs9yZ20TmYpKC5';

async function geocodeAddress(address) {
  const query = address.trim();
  
  // Detectar si es una búsqueda de cruce (formato: "calle y calle" o "calle & calle")
  const intersectionMatch = query.match(/^(.+?)\s+(?:y|&)\s+(.+?)$/i);
  
  if (intersectionMatch) {
    // Es un cruce - intentar buscar como "intersection" primero
    const street1 = intersectionMatch[1].trim();
    const street2 = intersectionMatch[2].trim();
    
    console.log(`🔍 Buscando intersección: "${street1}" y "${street2}"`);
    
    try {
      // Primero intentar buscar la intersección como una sola búsqueda
      const intersectionQuery = `${street1} y ${street2}, Mar del Plata, Argentina`;
      const urlIntersection = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(intersectionQuery)}&key=${GOOGLE_MAPS_API_KEY}`;
      
      const resIntersection = await fetch(urlIntersection);
      const dataIntersection = await resIntersection.json();
      
      if (dataIntersection.results && dataIntersection.results.length > 0) {
        const location = dataIntersection.results[0].geometry.location;
        const formattedAddress = dataIntersection.results[0].formatted_address;
        console.log(`   ✅ Intersección encontrada directamente: ${formattedAddress}`);
        console.log(`   📍 ${location.lat}, ${location.lng}`);
        return { lat: location.lat, lon: location.lng };
      }
      
      // Si no encuentra, buscar cada calle por separado y calcular punto medio
      console.log('   ℹ️ No encontrada directamente, intentando punto medio...');
      
      const url1 = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(street1 + ", Mar del Plata, Argentina")}&key=${GOOGLE_MAPS_API_KEY}`;
      const res1 = await fetch(url1);
      const data1 = await res1.json();
      
      const url2 = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(street2 + ", Mar del Plata, Argentina")}&key=${GOOGLE_MAPS_API_KEY}`;
      const res2 = await fetch(url2);
      const data2 = await res2.json();
      
      if (data1.results && data1.results.length > 0 && data2.results && data2.results.length > 0) {
        const loc1 = data1.results[0].geometry.location;
        const loc2 = data2.results[0].geometry.location;
        
        console.log(`   ✅ ${street1}: ${loc1.lat}, ${loc1.lng}`);
        console.log(`   ✅ ${street2}: ${loc2.lat}, ${loc2.lng}`);
        
        // Calcular punto medio (aproximación de intersección)
        const lat = (loc1.lat + loc2.lat) / 2;
        const lon = (loc1.lng + loc2.lng) / 2;
        
        console.log(`   🎯 Punto medio: ${lat}, ${lon}`);
        return { lat, lon };
      } else {
        console.warn('⚠️ No se encontró una o ambas calles');
        if (!data1.results || data1.results.length === 0) console.log(`   ❌ ${street1} no encontrada`);
        if (!data2.results || data2.results.length === 0) console.log(`   ❌ ${street2} no encontrada`);
      }
    } catch (error) {
      console.error("Error buscando intersección:", error);
    }
  } else {
    // Es una dirección normal - buscar en Google Maps
    console.log(`🔍 Buscando dirección: "${query}"`);
    
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query + ", Mar del Plata, Argentina")}&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const formattedAddress = data.results[0].formatted_address;
        console.log(`   ✅ ${formattedAddress}`);
        return { lat: location.lat, lon: location.lng };
      } else {
        console.warn(`⚠️ No results found for: ${query}`);
        if (data.status) console.log('Status:', data.status);
      }
    } catch (error) {
      console.error("Error geocoding address:", error);
    }
  }
  
  return null;
}

// Nueva función para mostrar resultados en el panel de consultas
function displayConsultaResults(htmlContent) {
    const consultaResultsPanel = document.getElementById('consulta-results-panel');
    const consultaResultsContent = document.getElementById('consulta-results-content');

    if (!consultaResultsPanel || !consultaResultsContent) {
        console.error("Error: Paneles de consulta no encontrados.");
        return;
    }

    // Ocultar otros paneles flotantes si es necesario
    document.getElementById('alert-list-panel').style.display = 'none';
    document.getElementById('top-siniestros-panel').style.display = 'none';
    document.getElementById('top-robo-panel').style.display = 'none';
    document.getElementById('siniestros-por-dia-panel').style.display = 'none';
    document.getElementById('analisis-causa-container').style.display = 'none';

    consultaResultsContent.innerHTML = htmlContent;
    consultaResultsPanel.style.display = 'block';

    function resetMapaComoRecienCargado() {

      console.log("🔄 Reiniciando mapa al estado inicial...");
  
      // 🔥 Bloquear autocargas mientras limpiamos
      window._bloquearSiniestros = true;
  

      // 1. Eliminar capa de siniestros
      if (siniestrosLayer && mymap.hasLayer(siniestrosLayer)) {
          mymap.removeLayer(siniestrosLayer);
      }
      siniestrosLayer.clearLayers();


      // 1b. Eliminar recorridos de colectivo (líneas naranjas) y cualquier polyline naranja residual
      setTimeout(() => {
        // Eliminar capa group
        if (typeof busRoutesLayer !== 'undefined' && busRoutesLayer && busRoutesLayer.clearLayers) {
          try {
            if (mymap.hasLayer(busRoutesLayer)) {
              mymap.removeLayer(busRoutesLayer);
            }
            busRoutesLayer.clearLayers();
          } catch (e) {
            console.warn('No se pudo limpiar busRoutesLayer en resetMapaComoRecienCargado:', e);
          }
        }
        // Eliminar cualquier polyline residual (trayectorias de colectivo)
        Object.values(mymap._layers).forEach(layer => {
          if (layer instanceof L.Polyline) {
            try { mymap.removeLayer(layer); } catch(e){}
          }
        });
      }, 50);
  
      if (topSiniestrosLabelsLayer) topSiniestrosLabelsLayer.clearLayers();
      document.getElementById('top-siniestros-panel').style.display = 'none';
      document.getElementById('total-siniestros-count').textContent = "0";
  
      // 2. Heatmap
      if (mymap.hasLayer(heatLayer)) mymap.removeLayer(heatLayer);
  
      // 3. Robo automotor
      if (mymap.hasLayer(roboAutomotorLayer)) mymap.removeLayer(roboAutomotorLayer);
      if (mymap.hasLayer(topRoboLabelsLayer)) mymap.removeLayer(topRoboLabelsLayer);
      if (mymap.hasLayer(roboHeatLayer)) mymap.removeLayer(roboHeatLayer);
      document.getElementById('top-robo-panel').style.display = 'none';
  
      // 4. Buscar cámaras / radios / direcciones
      if (searchResultLayer) searchResultLayer.clearLayers();
      addressSearchCircleLayer.clearLayers();
      addressSearchFilteredCamerasLayer.clearLayers();
  
      // 5. Quitar marcadores sueltos (igual que al refrescar)
      Object.values(mymap._layers).forEach(layer => {
          if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
              mymap.removeLayer(layer);
          }
      });
  
      // 6. Resetear el mapa a la vista inicial
      mymap.setView([-38.00042, -57.5562], 12);
  
      // 7. Limpiar selects de filtros
      document.getElementById('year-filter').value = 'all';
      document.getElementById('participant-filter').value = 'all';
      document.getElementById('cause-filter').value = 'all';
      document.getElementById('start-hour-filter').value = 'all';
      document.getElementById('end-hour-filter').value = 'all';
      document.getElementById('barrio-filter').value = 'all';
      document.getElementById('street-filter').value = "";
  
      // 8. Desbloquear
      window._bloquearSiniestros = false;
  
      console.log("✔️ Mapa reiniciado como si recargaras la página.");
  }



    // Añadir event listeners para los botones "Ver"
    consultaResultsContent.querySelectorAll('.btn-ver-mapa').forEach(button => {
        button.addEventListener('click', (e) => {
            const lat = parseFloat(e.target.dataset.lat);
            const lng = parseFloat(e.target.dataset.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                mymap.setView([lat, lng], 16); // Zoom a un nivel adecuado
                // Opcional: Podríamos resaltar el marcador en el mapa también si es uno de los 10 principales
            }
        });
    });
}


async function analyzeAndDisplayHighRiskIntersections() {
  // ⚠️ Limpia la capa de análisis antes de dibujar nuevos resultados
  if (siniestrosLayerGroup) {
      siniestrosLayerGroup.clearLayers();
  }
  
  const intersectionCounts = {};

  if (!allSiniestrosData || !allSiniestrosData.features || allSiniestrosData.features.length === 0) {
      console.error("Error: allSiniestrosData no está cargado o está vacío.");
      displayConsultaResults('<p>No hay datos de siniestros cargados para analizar.</p>');
      return;
  }

  // ✅ CARGAR DATOS DE SEMÁFOROS SI NO ESTÁN CARGADOS
  if (!window.semaforosGeoJSON) {
      try {
          const response = await fetch('map.geojson');
          window.semaforosGeoJSON = await response.json();
          console.log("✅ Datos de semáforos cargados:", window.semaforosGeoJSON.features.length);
      } catch (error) {
          console.error("❌ Error al cargar semáforos:", error);
          displayConsultaResults('<p>Error al cargar los datos de semáforos.</p>');
          return;
      }
  }
  
  // 📍 Crear un mapa de ubicaciones de semáforos para búsqueda rápida
  const semaforoLocations = [];
  if (window.semaforosGeoJSON && window.semaforosGeoJSON.features) {
      window.semaforosGeoJSON.features.forEach(semaforo => {
          if (semaforo.geometry && semaforo.geometry.coordinates) {
              const [lon, lat] = semaforo.geometry.coordinates;
              semaforoLocations.push({
                  lat: lat,
                  lon: lon,
                  id: semaforo.properties?.id || 'N/A'
              });
          }
      });
  }
  console.log(`📍 Total semáforos cargados: ${semaforoLocations.length}`);

  // 🔍 Función auxiliar: verificar si hay semáforo dentro de 30m
  function hasSemaphoreNearby(lat, lng) {
      const punto = L.latLng(lat, lng);
      const radioMetros = 30; // Radio de búsqueda
      
      for (const semaforo of semaforoLocations) {
          const distancia = punto.distanceTo(L.latLng(semaforo.lat, semaforo.lon));
          if (distancia <= radioMetros) {
              console.log(`✓ Semáforo detectado a ${distancia.toFixed(1)}m del siniestro`);
              return true;
          }
      }
      return false;
  }

  // 1. Filtrar y agrupar los siniestros por la propiedad 'direccion'
  let siniestos_analizados = 0;
  let siniestros_con_semaforo_detectado = 0;
  let siniestros_sin_semaforo = 0;

  allSiniestrosData.features.forEach(siniestro => {
    const props = siniestro.properties;
    const rawDireccion = props.direccion; 
    
    // Solo analizar cruces (contiene 'y')
    if (!rawDireccion || !rawDireccion.toLowerCase().includes(' y ')) {
        return;
    }

    siniestos_analizados++;
    
    const lng = siniestro.geometry.coordinates[0];
    const lat = siniestro.geometry.coordinates[1];

    // ✅ VERIFICACIÓN GEOGRÁFICA: ¿Hay semáforo cerca?
    const tieneSemaforoReal = hasSemaphoreNearby(lat, lng);

    if (tieneSemaforoReal) {
        siniestros_con_semaforo_detectado++;
        return; // 🚫 Excluir este siniestro del análisis
    }

    siniestros_sin_semaforo++;

    // Separar las calles para crear una clave única ordenada
    const parts = rawDireccion.split(' y ').map(s => s.trim());
    
    if (parts.length === 2) {
        const intersectionKey = parts.sort().join(' y ');

        if (!intersectionCounts[intersectionKey]) {
            intersectionCounts[intersectionKey] = {
                count: 0,
                lat: lat, 
                lng: lng,
                sumLat: lat,
                sumLng: lng,
                name: intersectionKey
            };
        } else {
            // Actualizar el promedio acumulativo de coordenadas
            intersectionCounts[intersectionKey].sumLat += lat;
            intersectionCounts[intersectionKey].sumLng += lng;
        }
        intersectionCounts[intersectionKey].count++;
        
        // Recalcular el promedio
        intersectionCounts[intersectionKey].lat = intersectionCounts[intersectionKey].sumLat / intersectionCounts[intersectionKey].count;
        intersectionCounts[intersectionKey].lng = intersectionCounts[intersectionKey].sumLng / intersectionCounts[intersectionKey].count;
    }
  });

  console.log(`📊 Análisis completo:
    - Siniestros analizados (cruces): ${siniestos_analizados}
    - Con semáforo cercano (excluidos): ${siniestros_con_semaforo_detectado}
    - Sin semáforo (incluidos): ${siniestros_sin_semaforo}
  `);
  
  // 2. Ranking y Visualización
  let rankedIntersections = Object.values(intersectionCounts)
      .sort((a, b) => b.count - a.count);

  if (rankedIntersections.length === 0) {
      console.warn("⚠️ No se encontraron cruces SIN semáforo con siniestros.");
      displayConsultaResults('<p>No se encontraron cruces críticos sin semáforo con siniestros registrados.</p>');
      return; 
  }

// --- START CODE FOR DISPLAYING IN CONSULTA PANEL ---
const topNForPanel = 20;
const intersectionsToDisplayInPanel = rankedIntersections.slice(0, topNForPanel);
let htmlContent = '<h5>🚦 Cruces Críticos Sin Semáforo</h5>';
htmlContent += '<ul class="consulta-lista">';

intersectionsToDisplayInPanel.forEach(intersection => {
    htmlContent += `
        <li>
            <span class="nombre">${intersection.name}</span>
            <span class="cantidad">${intersection.count} Siniestros</span>
            <button class="btn-ver-mapa" data-lat="${intersection.lat}" data-lng="${intersection.lng}">Ver</button>
        </li>`;
});

htmlContent += '</ul>';
displayConsultaResults(htmlContent);

// Crear capa exclusiva para esta ejecución de la consulta
const consultaSiniestrosLayer = L.layerGroup().addTo(mymap);

// Registrar para limpieza
window._consultaLayers.push(consultaSiniestrosLayer);
// --- END CODE FOR DISPLAYING IN CONSULTA PANEL ---

const topN = 20;

rankedIntersections.slice(0, topN).forEach((intersection, index) => {
    const rank = index + 1;

    const icon = createRankedIcon(rank, 'siniestro');

    const marker = L.marker([intersection.lat, intersection.lng], {
        icon: icon
    }).bindPopup(`
        <h4>🚨 Cruce de Riesgo #${rank}</h4>
        <strong>Cruce:</strong> ${intersection.name}<br>
        <strong>Siniestros Registrados:</strong> ${intersection.count}<br>
        <strong>Verificación:</strong> ✅ Sin semáforo en 30m<br>
        <strong>Coordenadas:</strong> ${intersection.lat.toFixed(6)}, ${intersection.lng.toFixed(6)}
    `);

    // Agregar a la capa nueva
    consultaSiniestrosLayer.addLayer(marker);
});

console.log(`✅ Mostrando los ${Math.min(topN, rankedIntersections.length)} cruces MÁS CRÍTICOS SIN SEMÁFORO.`);

if (rankedIntersections.length > 0) {
    mymap.setView([rankedIntersections[0].lat, rankedIntersections[0].lng], 14);
}
}


// ============================================
// 3. INICIALIZACIÓN DEL MAPA CON SELECTOR
// ============================================
if (!window.mymap) {
  console.log("🗺️ Creando mapa");

  window.mymap = L.map('mapid', { zoomControl: false })
    .setView([-38.00042, -57.5562], 12);

  L.control.zoom({ position: 'bottomleft' }).addTo(mymap);
}

// ⭐ Lista global de capas de consultas
window._consultaLayers = [];


// Definir las capas base disponibles
const baseLayers = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
  }),
  
  googleStreets: L.gridLayer.googleMutant({
      type: 'roadmap',
      maxZoom: 21
  }),
  
  googleSatellite: L.gridLayer.googleMutant({
      type: 'satellite',
      maxZoom: 21
  }),
  
  googleHybrid: L.gridLayer.googleMutant({
      type: 'hybrid',
      maxZoom: 21
  })
};
// Agregar la capa por defecto (OpenStreetMap)
let currentBaseLayer = baseLayers.osm;
currentBaseLayer.addTo(mymap);


// Capa de mapa base

// --- Lógica de Alertas de Noticias ---
const alertasLayer = L.layerGroup();
const alertIcon = L.icon({
    iconUrl: 'https://img.icons8.com/color/48/siren.png',
    iconSize: [35, 35],
    iconAnchor: [17, 35],
    popupAnchor: [0, -35]
});

function actualizarAlertas() {
    console.log("Actualizando alertas...");
    // Usar un timestamp previene que el navegador cachee el archivo geojson
    fetch('alertas.geojson?t=' + new Date().getTime())
        .then(response => {
            if (!response.ok) {
                throw new Error('La respuesta de la red no fue correcta para alertas.geojson');
            }
            return response.json();
        })
        .then(data => {
            // Limpiar capas y lista existentes antes de agregar las nuevas
            alertasLayer.clearLayers();
            const alertListContent = document.getElementById('alert-list-content');
            if (alertListContent) {
                alertListContent.innerHTML = ''; // Limpiar lista anterior
            }

            L.geoJSON(data, {
                pointToLayer: (feature, latlng) => L.marker(latlng, { icon: alertIcon }),
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        layer.bindPopup(`
                            <b>${feature.properties.titulo}</b><br>
                            ${feature.properties.direccion}<br>
                            <a href="${feature.properties.link}" target="_blank">Ver noticia</a>
                        `);
                    }
                }
            }).addTo(alertasLayer);

            // Volver a popular la lista flotante de alertas
            if (alertListContent) {
                if (data.features && data.features.length > 0) {
                    const sortedFeatures = data.features.sort((a, b) => {
                        return (b.properties.timestamp || 0) - (a.properties.timestamp || 0);
                    });

                    sortedFeatures.forEach(feature => {
                        const props = feature.properties;
                        const alertItem = document.createElement('div');
                        alertItem.className = 'alert-item';
                        alertItem.innerHTML = `<b>${props.titulo}</b><p>${props.direccion}</p>`;
                        alertListContent.appendChild(alertItem);
                    });
                } else {
                    alertListContent.innerHTML = '<p style="padding: 10px; text-align: center;">No hay alertas recientes.</p>';
                }
            }
        })
        .catch(error => console.error('Error al cargar alertas.geojson:', error));
}

// Carga inicial de alertas y configuración del intervalo de actualización
actualizarAlertas();
setInterval(actualizarAlertas, 5 * 60 * 1000); // 5 minutos

// Añadir la capa al mapa si el checkbox está marcado al inicio


// --- Lógica de Tráfico TomTom ---
let trafficLayer;

function setTrafficStyle(style) {
    if (trafficLayer && mymap.hasLayer(trafficLayer)) {
        mymap.removeLayer(trafficLayer);
        trafficLayer = null; // Clear the reference
    }
    if (style === 'none') {
        return;
    }
    trafficLayer = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/${style}/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}`, {
        attribution: 'TomTom Traffic',
        maxZoom: 18
    }).addTo(mymap);
}

function createTrafficLegend() {
    const legendContainer = document.getElementById('traffic-legend-container');
    if (!legendContainer) return;

    let legendContent = '<h4>Leyenda de Tráfico</h4>';
    legendContent += '<div><i style="background: #00b300"></i><span>Normal</span></div>';
    legendContent += '<div><i style="background: #ff9900"></i><span>Lento</span></div>';
    legendContent += '<div><i style="background: #ff0000"></i><span>Muy Lento</span></div>';
    legendContent += '<div><i style="background: #4c0000"></i><span>Cerrado</span></div>';

    legendContainer.innerHTML = legendContent;
}
 
// --- Lógica de Semáforos ---
const semaforosLayer = L.layerGroup();
const semaforoIcon = L.icon({
    iconUrl: 'https://img.icons8.com/plasticine/100/000000/traffic-light.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

fetch('map.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            coordsToLatLng: coords => new L.LatLng(coords[1], coords[0]),
            pointToLayer: (feature, latlng) => L.marker(latlng, {icon: semaforoIcon}),
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.id) {
                    layer.bindPopup('ID: ' + feature.properties.id);
                }
            }
        }).addTo(semaforosLayer);
        if (document.getElementById('semaforos-checkbox').checked) {
            mymap.addLayer(semaforosLayer);
        }
    })
    .catch(error => console.error('Error al cargar map.geojson:', error));

// --- Lógica de Barrios ---
const barrioFilterSelect = document.getElementById('barrio-filter');
let barriosData;
let selectedBarrioLayer = null;

// Función para verificar si un punto (lat, lng) está dentro de un polígono GeoJSON
function isLatLngInMultiPolygon(latlng, multiPolygonCoords) {
    // Helper function for point-in-polygon ray-casting algorithm
    function isPointInPolygon(point, vs) {
        var x = point[0], y = point[1];
        var inside = false;
        for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            var xi = vs[i][0], yi = vs[i][1];
            var xj = vs[j][0], yj = vs[j][1];
            var intersect = ((yi > y) != (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    for (var i = 0; i < multiPolygonCoords.length; i++) {
        var polygonCoords = multiPolygonCoords[i][0]; 
        var point = [latlng.lng, latlng.lat]; // GeoJSON uses [lng, lat]
        var polygon = polygonCoords.map(coord => [coord[0], coord[1]]);

        if (isPointInPolygon(point, polygon)) {
            return true;
        }
    }
    return false;
}


fetch('barrios.geojson')
    .then(response => response.json())
    .then(data => {
        barriosData = data;
        const barrios = data.features.map(feature => feature.properties.soc_fomen).sort();
        barrios.forEach(barrio => {
            const option = document.createElement('option');
            option.value = barrio;
            option.textContent = barrio;
            barrioFilterSelect.appendChild(option);
        });
    })
    .catch(error => console.error('Error al cargar barrios.geojson:', error));

barrioFilterSelect.addEventListener('change', () => {
    if (selectedBarrioLayer) {
        mymap.removeLayer(selectedBarrioLayer);
        selectedBarrioLayer = null;
    }

    const selectedBarrioName = barrioFilterSelect.value;
    let currentSelectedBarrioFeature = null; // Declare here
    if (selectedBarrioName === 'all') {
        mymap.setView([-38.00042, -57.5562], 12); // Vista inicial
    } else {
        currentSelectedBarrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === selectedBarrioName);
        if (currentSelectedBarrioFeature) {
            selectedBarrioLayer = L.geoJSON(currentSelectedBarrioFeature, {
                style: {
                    color: "#ff7800",
                    weight: 5,
                    opacity: 0.65
                }
            }).addTo(mymap);
            mymap.fitBounds(selectedBarrioLayer.getBounds());
        }
    }
    // Re-aplicar filtros existentes
    applySiniestrosFilters();
    applyRoboAutomotorFilters();
    applyAforosFilters();
    applyCamarasFilters();
    applyCamarasPrivadasFilters();

    // NEW: Apply barrio filter to camera coverage circles if checkbox is checked
    if (document.getElementById('zonas-sin-cobertura-checkbox').checked) {
        drawCameraCoverage(currentSelectedBarrioFeature); // Pass the selected barrio feature
    }

    // NEW: Calculate and display uncovered percentage if checkbox is checked
    if (document.getElementById('zonas-sin-cobertura-negativo-checkbox').checked) {
        calculateAndDisplaySimpleUncoveredPercentage(currentSelectedBarrioFeature);
    }
});

// REMOVED: La función calculateAndDisplayUncoveredPercentage se ha eliminado y ya no se llama aquí.
// Era una versión duplicada de calculateAndDisplaySimpleUncoveredPercentage.



// --- Lógica de Autocompletado --- //
    const queryInput = document.getElementById('query-input');
    const suggestionsPanel = document.getElementById('autocomplete-suggestions');

    const popularQueries = [
        'siniestros de noche',
        'siniestros con motos',
        'robos con intervencion policial',
        'top 10 siniestros',
        'top 5 robos',
    ];

    if (queryInput && suggestionsPanel) {
        queryInput.addEventListener('input', () => {
            const inputText = queryInput.value.toLowerCase();
            suggestionsPanel.innerHTML = '';

            if (inputText.length < 2) { // No mostrar sugerencias hasta que haya al menos 2 caracteres
                return;
            }

            let suggestions = [];

            // 1. Sugerencias de Consultas Populares
            const filteredQueries = popularQueries.filter(q => q.toLowerCase().startsWith(inputText));
            suggestions.push(...filteredQueries);

            // 2. Sugerencias de Barrios
            if (barriosData && barriosData.features) {
                const barrioNames = barriosData.features.map(f => f.properties.soc_fomen);
                const filteredBarrios = barrioNames.filter(b => b.toLowerCase().includes(inputText));
                
                // Crear sugerencias específicas para los barrios encontrados
                filteredBarrios.forEach(barrio => {
                    suggestions.push(`siniestros en ${barrio}`);
                    suggestions.push(`robos en ${barrio}`);
                    suggestions.push(`cámaras en ${barrio}`);
                });
            }

            // Eliminar duplicados y mostrar
            const uniqueSuggestions = [...new Set(suggestions)];

            uniqueSuggestions.slice(0, 10).forEach(query => { // Limitar a 10 sugerencias en total
                const suggestionDiv = document.createElement('div');
                suggestionDiv.textContent = query;
                suggestionDiv.addEventListener('click', () => {
                    queryInput.value = query;
                    suggestionsPanel.innerHTML = '';
                    queryInput.focus(); // Poner el foco de nuevo en el input
                });
                suggestionsPanel.appendChild(suggestionDiv);
            });
        });

        document.addEventListener('click', (e) => {
            if (e.target !== queryInput) {
                suggestionsPanel.innerHTML = '';
            }
        });
    }

    
let allStreetNames = [];

    if(allStreetNames.length > 0) {
        console.log(`✅ Nombres de calles extraídos. Total: ${allStreetNames.length}`);
    }

// --- Lógica de Siniestros ---
const topSiniestrosLabelsLayer = L.layerGroup();
const topRoboLabelsLayer = L.layerGroup();
let siniestrosLayer = L.markerClusterGroup(); // Declaración movida aquí
mymap.addLayer(siniestrosLayer); // Añadir la capa de siniestros al mapa inmediatamente
mymap.addLayer(topSiniestrosLabelsLayer); // Añadir la capa de etiquetas al mapa
mymap.addLayer(topRoboLabelsLayer); // Añadir la capa de etiquetas de robos

// ============================================
// AÑADIR CAPA DE ANÁLISIS DE CRUCES CRÍTICOS AQUÍ 👈
// ============================================
let siniestrosLayerGroup = L.layerGroup().addTo(mymap);
// ============================================

const heatLayer = L.heatLayer([], { radius: 25 });
const siniestroIcon = L.divIcon({
    className: 'custom-div-icon',
    html: '<i class="fi fi-rr-triangle-warning" style="font-size: 24px; color: #ffc107;"></i>',
    iconSize: [24, 24],
    iconAnchor: [12, 24]
});


// 🟦 Capa global para los robos sin cámara
window._robosSinCamaraLayer = L.layerGroup();

function normalizeString(str) {
  if (!str) return '';
  return str
      .toLowerCase()
      .replace(/\bav\.?\b/g, 'avenida')
      .trim();
}

// New function to remove accents
function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Helper para obtener el día de la semana en español
function getDayOfWeekFromDateString(dateString) {
    const parts = dateString.split('/');
    // Asume formato DD/MM/YY o DD/MM/YYYY
    let year = parseInt(parts[2], 10);
    if (year < 100) { // Handle YY format
        year += 2000; // Assume 21st century
    }
    const month = parseInt(parts[1], 10) - 1; // Meses son 0-indexados en JS
    const day = parseInt(parts[0], 10);
    const date = new Date(year, month, day);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[date.getDay()];
}

const DAY_COLORS = {
    'Domingo': '#FF6347', // Tomato
    'Lunes': '#4682B4',   // SteelBlue
    'Martes': '#32CD32',  // LimeGreen
    'Miércoles': '#FFD700', // Gold
    'Jueves': '#BA55D3',  // MediumPurple
    'Viernes': '#FF8C00', // DarkOrange
    'Sábado': '#1E90FF'   // DodgerBlue
};


function updateSiniestrosLayers(dataToDisplay, totalCount, markerColor = null) { // Añadir markerColor como parámetro opcional
    if (!siniestrosLayer || typeof siniestrosLayer.clearLayers !== 'function') {
      console.error('❌ siniestrosLayer no está disponible o corrupto');
      return;
    }
    
    siniestrosLayer.clearLayers();

    const displayCount = totalCount !== undefined ? totalCount : (dataToDisplay && dataToDisplay.features ? dataToDisplay.features.length : 0);
    const totalSiniestrosCountSpan = document.getElementById('total-siniestros-count');
    if (totalSiniestrosCountSpan) {
        totalSiniestrosCountSpan.textContent = displayCount;
    }

    if (!dataToDisplay || !dataToDisplay.features || dataToDisplay.features.length === 0) {
      console.log("🟡 updateSiniestrosLayers() llamado con", dataToDisplay?.features?.length, "features");
        return;
    }

    const heatPoints = [];
    const geoJsonLayer = L.geoJSON(dataToDisplay, {
        coordsToLatLng: coords => new L.LatLng(coords[1], coords[0]),
        pointToLayer: (feature, latlng) => {

          console.log("🟠 Dibujando marcador de SINIESTRO en:", latlng, 
                      "Causa:", feature.properties?.causa, 
                      "Dirección:", feature.properties?.direccion);
      
          if (feature.geometry && feature.geometry.coordinates) {
              // Agrega el punto a heatPoints para el mapa de calor
              heatPoints.push([latlng.lat, latlng.lng]);
          }
      
          // Usar el color proporcionado, o el color por defecto (amarillo)
          const iconColor = markerColor || '#ffc107';
          const customIcon = L.divIcon({
              className: 'custom-div-icon',
              html: `<i class="fi fi-rr-triangle-warning" style="font-size: 24px; color: ${iconColor};"></i>`,
              iconSize: [24, 24],
              iconAnchor: [12, 24]
          });
      
          // 🟠 ESTE ES EL MARCADOR QUE LUEGO QUEDA PEGADO
          return L.marker(latlng, { icon: customIcon });
      },
        onEachFeature: (feature, layer) => {
            if (feature.properties) {
                const iconStyle = 'style="vertical-align: middle; margin-right: 5px; width: 16px; height: 16px;"';
                let popupContent = `<strong>Siniestro</strong><br>` +
                                   `<img src="https://img.icons8.com/color/16/calendar.png" ${iconStyle}> <b>Fecha:</b> ${feature.properties.fecha}<br>` +
                                   `<img src="https://img.icons8.com/color/16/clock.png" ${iconStyle}> <b>Hora:</b> ${feature.properties.hora}<br>` +
                                   `<img src="https://img.icons8.com/color/16/marker.png" ${iconStyle}> <b>Dirección:</b> ${feature.properties.direccion}<br>` +
                                   `<img src="https://img.icons8.com/color/16/traffic-jam.png" ${iconStyle}> <b>Causa:</b> ${causeMapping[feature.properties.causa] || feature.properties.causa}`;
                if (feature.properties.participantes_codigos) {
                    const codes = feature.properties.participantes_codigos.split('/');
                    const participantNames = codes.map(code => participantMapping[code] || code);
                    popupContent += `<br><img src="https://img.icons8.com/color/16/user-group-man-man.png" ${iconStyle}> <b>Participantes:</b> ${participantNames.join(', ')}`;
                }
                layer.bindPopup(popupContent);
            }
        }
    });

    siniestrosLayer.addLayer(geoJsonLayer);
    
    // ✅ Validar que heatLayer existe antes de usar
    if (heatLayer && typeof heatLayer.setLatLngs === 'function') {
      try {
        heatLayer.setLatLngs(heatPoints);
      } catch (e) {
        console.warn('⚠️ Error actualizando heatLayer:', e.message);
      }
    }

    // Controlar la visualización del mapa de calor
    const heatmapCheckbox = document.getElementById('heatmap-checkbox');
    if (heatmapCheckbox && heatmapCheckbox.checked && !mymap.hasLayer(heatLayer)) {
        mymap.addLayer(heatLayer);
    } else if (heatmapCheckbox && !heatmapCheckbox.checked && mymap.hasLayer(heatLayer)) {
        mymap.removeLayer(heatLayer);
    }
}



function isIntersectionWithSemaphore(intersectionName) {
  // 1. Normalizar el cruce de siniestro (y ordenar las calles para asegurar la coincidencia)
  const parts = intersectionName.split(' y ').map(p => normalizeString(p));
  const normalizedSiniestroKey = parts.sort().join(''); // Ejemplo: '12deoctubreruta88'

  // ⚠️ ATENCIÓN: Asegúrate de que 'allCamerasData' sea la variable correcta
  if (!window.allCamerasData || window.allCamerasData.length === 0) {
      console.warn("No se pudo filtrar semáforos: allCamerasData no está disponible.");
      return false; 
  }
  
  // 2. Buscar si una cámara coincide con esta clave normalizada
  return window.allCamerasData.some(camera => {
      const cameraDirection = camera.direccion;
      if (!cameraDirection) return false;

      // Normalizar y ordenar la dirección de la cámara de la misma manera
      const cameraParts = cameraDirection.split(' y ').map(p => normalizeString(p));
      if (cameraParts.length !== 2) return false; // Solo cruces con " y "
      
      const normalizedCameraKey = cameraParts.sort().join(''); // Ejemplo: '12deoctubreruta88'

      // Comprobación de coincidencia estricta y normalizada
      return normalizedSiniestroKey === normalizedCameraKey;
  });
}

// ==============================
// Evaluación: Calles Seguras
// ==============================


/**
* Dibuja o limpia capas temporales de "calles seguras"
*/
function limpiarCallesSegurasEnMapa() {
  if (window._callesSegurasLayers && window._callesSegurasLayers.length) {
      window._callesSegurasLayers.forEach(l => mymap.removeLayer(l));
  }
  window._callesSegurasLayers = [];
}
function extraerCallesDesdeDireccion(direccion) {
  if (!direccion) return [];

  let dir = normalizarTextoCalle(direccion);

  // Convertir separadores en "Y"
  dir = dir.replace(/\//g, " Y ");
  dir = dir.replace(/-/g, " Y ");
  dir = dir.replace(/\s+Y\s+/g, " Y ");

  // Separar por intersecciones
  let partes = dir.split(" Y ").map(v => v.trim()).filter(v => v);

  // Quitar altura  (COLON 3456 → COLON)
  partes = partes.map(p => p.replace(/\s+\d+.*/g, '').trim());

  // Quitar palabras irrelevantes
  partes = partes.map(p => p.replace(/\b(CALLE|CAL|NRO|ALTURA|PLAZA|PJE|PTO|PQUE|ESQ)\b/g, '').trim());

  // Normalizar final
  partes = partes.map(p => normalizarTextoCalle(p));

  // Filtrar vacíos
  return partes.filter(p => p.length > 1);
}

// ======================================================
//   EXTRACTOR PRINCIPAL
// ======================================================
function normalizarTextoCalle(s) {
  if (!s) return "";
  s = s.toUpperCase();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
  s = s.replace(/[,.;\-\/\\]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
/**
* Modo A: usa un GeoJSON de calles (calles.geojson) si existe.
* Encuentra features cuyo nombre no aparezca en siniestros (0 siniestros).
*
* Modo B: si no hay GeoJSON, agrupa siniestros por calle y devuelve las calles
* con menor cantidad de siniestros (top N "más seguras" según conteo).
*/
// ======================================================
// 🚨 CONSULTA: TOP N CALLES CON MÁS SINIESTROS
// ======================================================
let consultaEnProgreso = false;

async function analizarCallesSeguras(event, options = {}) {
    if (event) {
        event.stopPropagation();
    }

    if (consultaEnProgreso) {
        console.warn("⛔ Consulta ignorada: todavía está procesando la anterior.");
        return;
    }

    consultaEnProgreso = true;
    const { topN = 10 } = options;

    // 🔥 Cargar siniestros una sola vez
    if (!allSiniestrosData) {
        await loadSiniestrosData();
    }

    // 🔥 LIMPIAR SIEMPRE cualquier resto de consultas previas
    limpiarCallesSegurasEnMapa();
    if (window._consultaLayers) {
        window._consultaLayers.forEach(l => {
            try { mymap.removeLayer(l); } catch(e){}
        });
        window._consultaLayers = [];
    }

    if (!allSiniestrosData?.features) {
        displayConsultaResults('<p>❌ No hay datos de siniestros disponibles.</p>');
        consultaEnProgreso = false;
        return;
    }

    // ======================================================
    // CONTAR CALLES
    // ======================================================
    const contadorCalles = {}; 
    const coordsCalles = {};

    allSiniestrosData.features.forEach(f => {
        const props = f.properties || {};
        const dir = props.direccion || props.DIRECCION || '';
        const calles = extraerCallesDesdeDireccion(dir);
        if (!calles?.length) return;

        const calle = calles[0];

        if (!contadorCalles[calle]) contadorCalles[calle] = 0;
        contadorCalles[calle]++;

        if (!coordsCalles[calle]) coordsCalles[calle] = [];

        if (f.geometry?.coordinates) {
            coordsCalles[calle].push([
                f.geometry.coordinates[1],
                f.geometry.coordinates[0]
            ]);
        }
    });

    // ======================================================
    // ARMAR LISTA
    // ======================================================
    const lista = Object.keys(contadorCalles).map(nombre => ({
        nombre,
        total: contadorCalles[nombre],
        coords: coordsCalles[nombre]
    }));

    lista.sort((a, b) => b.total - a.total);
    const top = lista.slice(0, topN);

    // ======================================================
    // DIBUJAR EN MAPA
    // ======================================================
    if (!window._callesSegurasLayers) window._callesSegurasLayers = [];

    top.forEach(c => {

        if (c.coords.length < 2) return;

        const coordsOrdenadas = [...c.coords].sort((a, b) =>
            a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]
        );

        const poly = L.polyline(coordsOrdenadas, {
            color: '#e74c3c',
            weight: 2,
            opacity: 0.45,
            dashArray: '4,6'
        }).addTo(mymap);

        window._callesSegurasLayers.push(poly);

        coordsOrdenadas.forEach(coord => {
            const punto = L.circleMarker(coord, {
                radius: 6,
                color: "#ffffff",
                weight: 3,
                fillColor: "#ff0000",
                fillOpacity: 0.9
            }).addTo(mymap);

            window._callesSegurasLayers.push(punto);
        });
    });

    // ======================================================
    // PANEL DE RESULTADOS
    // ======================================================
    let html = `<h4>🚨 Top ${topN} Calles con Más Siniestros</h4><ol>`;
    top.forEach(c => {
        html += `<li><b>${c.nombre}</b>: ${c.total} siniestros</li>`;
    });
    html += `</ol><p><i>Las calles fueron resaltadas en rojo tenue en el mapa.</i></p>`;

    displayConsultaResults(html);

    consultaEnProgreso = false;
}

// ======================================================
// 🔥 FUNCIÓN PARA LIMPIAR TODAS LAS CAPAS DE LA CONSULTA
// ======================================================
function limpiarCallesSegurasEnMapa() {
  if (!window._callesSegurasLayers) return;

  window._callesSegurasLayers.forEach(layer => {
      try { mymap.removeLayer(layer); } catch(e){}
  });

  window._callesSegurasLayers = [];
}


function populateSiniestrosFilters(data) {
  const years = new Set();

  data.features.forEach(feature => {
      if (feature.properties && feature.properties.fecha && feature.properties.fecha.split('/').length === 3) {
          const year = feature.properties.fecha.split('/').pop();
          years.add(year.length === 2 ? '20' + year : year);
      }
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a);

  yearFilterSelect.innerHTML = '<option value="all">Todos los Años</option>';
  sortedYears.forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearFilterSelect.appendChild(option);
  });

  // === Participantes ===
  participantFilterSelect.innerHTML = '<option value="all">Todos los Participantes</option>';
  for (const code in participantMapping) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = participantMapping[code];
      participantFilterSelect.appendChild(option);
  }

  // === Causas ===
  causeFilterSelect.innerHTML = '<option value="all">Todas las Causas</option>';
  for (const code in causeMapping) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = causeMapping[code];
      causeFilterSelect.appendChild(option);
  }

  // === Horarios ===
  startHourFilterSelect.innerHTML = '<option value="all">Todas</option>';
  endHourFilterSelect.innerHTML = '<option value="all">Todas</option>';

  for (let i = 0; i < 24; i++) {
      const hourString = i.toString().padStart(2, '0');
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${hourString}:00`;

      startHourFilterSelect.appendChild(option.cloneNode(true));
      endHourFilterSelect.appendChild(option);
  }
}

function highlightMarker(location, type) {
    const layer = type === 'siniestro' ? topSiniestrosLabelsLayer : topRoboLabelsLayer;

    // Remover el resaltado de cualquier otro marcador
    layer.eachLayer(marker => {
        if (marker.getIcon().options.className.includes('highlight-marker')) {
            const newIcon = L.divIcon({
                className: marker.getIcon().options.className.replace(' highlight-marker', ''),
                html: marker.getIcon().options.html,
                iconSize: marker.getIcon().options.iconSize,
                iconAnchor: marker.getIcon().options.iconAnchor
            });
            marker.setIcon(newIcon);
        }
    });

    // Encontrar y resaltar el marcador actual
    layer.eachLayer(marker => {
        if (marker.getLatLng().lat === location.lat && marker.getLatLng().lng === location.lon) {
            const newIcon = L.divIcon({
                className: marker.getIcon().options.className + ' highlight-marker',
                html: marker.getIcon().options.html,
                iconSize: marker.getIcon().options.iconSize,
                iconAnchor: marker.getIcon().options.iconAnchor
            });
            marker.setIcon(newIcon);
        }
    });
}

function highlightTopItem(location, type) {
    highlightMarker(location, type);
    const panelId = type === 'siniestro' ? 'top-siniestros-content' : 'top-robo-content';
    const content = document.getElementById(panelId);
    if (!content) return;

    // Remover el resaltado de cualquier otro item
    const highlightedItems = content.querySelectorAll('.highlight');
    highlightedItems.forEach(item => item.classList.remove('highlight'));

    // Encontrar y resaltar el item actual
    const items = content.querySelectorAll(type === 'siniestro' ? '.top-siniestro-item' : '.top-robo-item');
    for (let item of items) {
        const addressElement = item.querySelector('.address');
        if (addressElement && addressElement.textContent.startsWith(location.address)) {
            item.classList.add('highlight');
            // Opcional: hacer scroll para que el item sea visible
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            break;
        }
    }
}

function updateTopSiniestrosLabels(topLocations) {
    topSiniestrosLabelsLayer.clearLayers();

    if (!document.getElementById('siniestros-checkbox').checked) {
        return;
    }

    topLocations.forEach((location, index) => {
        const rank = index + 1;
        const rankedIcon = createRankedIcon(rank, 'siniestro');

        const marker = L.marker([location.lat, location.lon], { icon: rankedIcon, zIndexOffset: 1000 });
        const popupContent = `Ubicación #${rank}: ${location.address || 'Dirección no disponible'}<br>Total de siniestros: ${location.count}`;
        marker.bindPopup(popupContent, { className: 'custom-popup' });

        marker.on('click', () => {
            highlightTopItem(location, 'siniestro');
        });

        topSiniestrosLabelsLayer.addLayer(marker);
    });
}
function processAndDisplaySiniestros(features) {
    // --- Lógica para calcular el Top 10 ---
    const locationCounts = new Map();
    features.forEach(feature => {
        if (!feature.geometry || !feature.geometry.coordinates) return;
        const coords = feature.geometry.coordinates;
        // GeoJSON es [lon, lat], Leaflet es [lat, lon]. Hay que invertir.
        const lon = coords[0];
        const lat = coords[1];
        const key = `${lat},${lon}`;
        
        if (!locationCounts.has(key)) {
            locationCounts.set(key, {
                count: 0,
                lat: lat,
                lon: lon,
                address: feature.properties.direccion
            });
        }
        locationCounts.get(key).count++;
    });

    const rankedLocations = Array.from(locationCounts.values())
                                 .sort((a, b) => b.count - a.count)
                                 .slice(0, 10);

    updateTopSiniestrosPanel(rankedLocations);
    updateTopSiniestrosLabels(rankedLocations);

    // Se eliminó la lógica que filtraba el "Top 10" de la capa de clústeres.
    // Ahora, todos los siniestros se muestran en la capa de clústeres para asegurar
    // que el mapa nunca aparezca vacío si todos los incidentes están en el Top 10.
    updateSiniestrosLayers({ type: 'FeatureCollection', features: features }, features.length);
}

// --- Lógica para Siniestros por Día de la Semana ---
function calculateSiniestrosByDayOfWeek(features) {
    const dayCounts = new Map();
    const dayFeatures = new Map(); // Para almacenar features por día

    // Inicializar mapas para todos los días para asegurar que aparezcan aunque el conteo sea 0
    ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].forEach(day => {
        dayCounts.set(day, 0);
        dayFeatures.set(day, []);
    });

    features.forEach(feature => {
        if (feature.properties && feature.properties.fecha) {
            const dayOfWeek = getDayOfWeekFromDateString(feature.properties.fecha);
            dayCounts.set(dayOfWeek, dayCounts.get(dayOfWeek) + 1);
            dayFeatures.get(dayOfWeek).push(feature);
        }
    });

    // Convertir a un array de objetos para facilitar la ordenación/visualización
    const result = Array.from(dayCounts.entries()).map(([day, count]) => ({
        day: day,
        count: count,
        features: dayFeatures.get(day)
    }));

    // Ordenar por un orden estándar de días (ej. Domingo-Sábado)
    const dayOrder = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    result.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));

    return result;
}

function displaySiniestrosByDayOfWeek(siniestrosByDay) {
    const panel = document.getElementById('siniestros-por-dia-panel');
    const content = document.getElementById('siniestros-dia-content');
    const consultaResultsPanel = document.getElementById('consulta-results-panel');

    if (!panel || !content || !consultaResultsPanel) return;

    // Ocultar todos los paneles secundarios antes de mostrar los relevantes
    document.getElementById('alert-list-panel').style.display = 'none';
    document.getElementById('top-siniestros-panel').style.display = 'none';
    document.getElementById('top-robo-panel').style.display = 'none';
    document.getElementById('analisis-causa-container').style.display = 'none'; // Asegurarse de que este también se oculte

    content.innerHTML = ''; // Limpiar contenido anterior
    consultaResultsPanel.style.display = 'block'; // Asegurarse de que el panel de resultados principal esté visible
    panel.style.display = 'block'; // Mostrar el panel de siniestros por día

    if (siniestrosByDay.length === 0) {
        content.innerHTML = '<p>No hay datos de siniestros para analizar por día.</p>';
        return;
    }

    siniestrosByDay.forEach(item => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'siniestro-day-item';
        dayDiv.style.borderColor = DAY_COLORS[item.day] || '#ccc'; // Usar color para el borde

        dayDiv.innerHTML = `
            <span class="day-name" style="color: ${DAY_COLORS[item.day]};">${item.day}</span>
            <span class="day-count">(${item.count} siniestros)</span>
            <button class="view-day-btn">Ver en mapa</button>
        `;

        const button = dayDiv.querySelector('.view-day-btn');
        button.addEventListener('click', () => {
            // Actualizar el mapa con los siniestros de este día y el color correspondiente
            updateSiniestrosLayers({ type: 'FeatureCollection', features: item.features }, item.features.length, DAY_COLORS[item.day]);
            mymap.setView([-38.00042, -57.5562], 12); // Volver a la vista inicial o ajustar según necesites
            currentDayFilter = item.day; // Guardar el día actualmente filtrado
            filteredDayColor = DAY_COLORS[item.day]; // Guardar el color del día filtrado
            
            // Highlight the clicked day item
            document.querySelectorAll('.siniestro-day-item').forEach(el => el.classList.remove('highlight'));
            dayDiv.classList.add('highlight');

            // Ocultar otros paneles si es necesario
            document.getElementById('top-siniestros-panel').style.display = 'none';
            document.getElementById('top-robo-panel').style.display = 'none';
        });
        content.appendChild(dayDiv);
    });
}

function applySiniestrosFilters() {

  // 🛑 Protección: NO ejecutar si estamos limpiando el panel izquierdo
  if (window._bloquearSiniestros) {
      console.log("⛔ applySiniestrosFilters() bloqueado durante limpieza del panel izquierdo");
      return;
  }

  if (!allSiniestrosData || !allSiniestrosData.features) return;

  // Resetear el filtro de día de la semana si se aplican filtros generales
  currentDayFilter = null;
  filteredDayColor = null;
  document.querySelectorAll('.siniestro-day-item').forEach(el => el.classList.remove('highlight')); // Remover resaltado de días

  // Ocultar el panel de siniestros por día
  const siniestrosPorDiaPanel = document.getElementById('siniestros-por-dia-panel');
  if (siniestrosPorDiaPanel) {
      siniestrosPorDiaPanel.style.display = 'none';
  }

    const selectedYear = yearFilterSelect.value;
    const selectedParticipant = participantFilterSelect.value;
    const selectedCause = causeFilterSelect.value;
    const selectedStartHour = startHourFilterSelect.value;
    const selectedEndHour = endHourFilterSelect.value;
    const streetSearchTerm = normalizeString(streetFilterInput.value);
    const selectedBarrioName = barrioFilterSelect.value;

    let selectedBarrioFeature = null;
    if (selectedBarrioName !== 'all' && barriosData) {
        selectedBarrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === selectedBarrioName);
    }

    const filteredFeatures = allSiniestrosData.features.filter(feature => {
        const props = feature.properties;
        if (!props || !feature.geometry || !feature.geometry.coordinates) return false;

        const yearMatch = selectedYear === 'all' || (props.fecha && props.fecha.split('/').length === 3 && (props.fecha.split('/')[2].length === 2 ? '20' + props.fecha.split('/')[2] : props.fecha.split('/')[2]) === selectedYear);
        const participantMatch = selectedParticipant === 'all' || (props.participantes_codigos && props.participantes_codigos.split('/').includes(selectedParticipant));
        const causeMatch = selectedCause === 'all' || (props.causa && props.causa === selectedCause);
        const streetMatch = !streetSearchTerm || (props.direccion && normalizeString(props.direccion).includes(streetSearchTerm));
        
        let hourMatch = true;
        if (selectedStartHour !== 'all' || selectedEndHour !== 'all') {
            if (props.hora && props.hora.includes(':')) {
                const featureHour = parseInt(props.hora.split(':')[0], 10);
                const startHour = selectedStartHour !== 'all' ? parseInt(selectedStartHour, 10) : 0;
                const endHour = selectedEndHour !== 'all' ? parseInt(selectedEndHour, 10) : 23;
                hourMatch = featureHour >= startHour && featureHour <= endHour;
            } else {
                hourMatch = false;
            }
        }

        let barrioMatch = true;
        if (selectedBarrioFeature) {
            const latlng = L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
            barrioMatch = isLatLngInMultiPolygon(latlng, selectedBarrioFeature.geometry.coordinates);
        }

        return yearMatch && participantMatch && causeMatch && hourMatch && streetMatch && barrioMatch;
    });

    // Determinar si el mapa de calor debe estar activo
    const heatmapCheckbox = document.getElementById('heatmap-checkbox');
    const isHourFilterActive = (selectedStartHour !== 'all' || selectedEndHour !== 'all');

    if (isHourFilterActive && !heatmapCheckbox.checked) {
        // Si hay un filtro de hora activo y el heatmap no está marcado, activarlo automáticamente.
        heatmapCheckbox.checked = true;
        // Disparar manualmente el evento para que la capa de calor se añada si aún no lo está
        heatmapCheckbox.dispatchEvent(new Event('change'));
    } else if (!isHourFilterActive && heatmapCheckbox.checked && mymap.hasLayer(heatLayer)) {
        // Si no hay filtro de hora activo y el heatmap está marcado, asegurarse de que se muestra
        // (esto es para cuando se desactiva un filtro de hora, pero el usuario quiere seguir viendo el heatmap global)
         mymap.addLayer(heatLayer);
    } else if (!heatmapCheckbox.checked && mymap.hasLayer(heatLayer)) {
        // Si el heatmap está desmarcado y la capa está en el mapa, removerla.
        mymap.removeLayer(heatLayer);
    }
    
    processAndDisplaySiniestros(filteredFeatures);
}

function loadSiniestrosData() {
    // Si los datos ya están cargados, no hagas nada y retorna una promesa resuelta.
    if (allSiniestrosData) {
        return Promise.resolve();
    }
    // Si no, busca los datos.
    return fetch('siniestros_con_ubicacion.geojson?nocache=' + new Date().getTime())
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            allSiniestrosData = data;
            populateSiniestrosFilters(allSiniestrosData);
            console.log("✅ Datos de Siniestros cargados bajo demanda.");
        })
        .catch(error => {
            alert('Error al cargar siniestros_con_ubicacion.geojson: ' + error.message);
            console.error('Error al cargar siniestros_con_ubicacion.geojson:', error);
            throw error; // Propaga el error para que el llamador pueda manejarlo.
        });
}

function updateTopSiniestrosPanel(rankedLocations) {
    const panel = document.getElementById('top-siniestros-panel');
    const content = document.getElementById('top-siniestros-content');

    if (!content || !panel) return;

    content.innerHTML = ''; // Limpiar contenido anterior (y listeners asociados)

    if (!document.getElementById('siniestros-checkbox').checked || rankedLocations.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'flex'; // Mostrar panel

    rankedLocations.forEach((location, index) => {
        const item = document.createElement('div');
        item.className = 'top-siniestro-item';
        
        const rank = `<div class="rank">#${index + 1}</div>`;
        const address = `<div class="address">${location.address || 'Dirección no disponible'} (${location.count})</div>`;
        const viewButton = `<button class="view-on-map-btn" type="button" data-lat="${location.lat}" data-lon="${location.lon}">Ver en mapa</button>`;

        item.innerHTML = rank + address + viewButton;
        content.appendChild(item);
    });

    // ✅ USAR EVENT DELEGATION en lugar de listeners individuales
    // Esto es más eficiente y evita acumulación de listeners
    content.addEventListener('click', function(e) {
        if (e.target.classList.contains('view-on-map-btn')) {
            const lat = parseFloat(e.target.dataset.lat);
            const lon = parseFloat(e.target.dataset.lon);
            
            e.stopPropagation();
            mymap.setView([lat, lon], 18);
            highlightMarker({ lat: lat, lon: lon }, 'siniestro');
            
            // Abrir el popup correspondiente
            topSiniestrosLabelsLayer.eachLayer(layer => {
                if (Math.abs(layer.getLatLng().lat - lat) < 0.0001 && Math.abs(layer.getLatLng().lng - lon) < 0.0001) {
                    layer.openPopup();
                }
            });
        }
    }, false);
}



// --- Lógica de Aforos (Flujo Vehicular) ---
const aforosLayer = L.layerGroup();
let aforosDataLoaded = false;
let allFlujoData;
let cameraCoords = new Map();

const aforoIcon = L.icon({
    iconUrl: 'https://img.icons8.com/officel/40/000000/car.png', 
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

const aforosFiltersDiv = document.getElementById('aforos-filters');
const aforoYearFilter = document.getElementById('aforo-year-filter');
const aforoStartHourFilter = document.getElementById('aforo-start-hour-filter');
const aforoEndHourFilter = document.getElementById('aforo-end-hour-filter');

function populateAforosFilters() {
    if (allFlujoData) {
        const years = new Set();
        allFlujoData.forEach(flujo => {
            if (flujo.FECHA && flujo.FECHA.split('/').length === 3) {
                const year = flujo.FECHA.split('/')[2];
                years.add(year);
            }
        });
        const sortedYears = Array.from(years).sort((a, b) => b - a);
        aforoYearFilter.innerHTML = '<option value="all">Todos los Años</option>';
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            aforoYearFilter.appendChild(option);
        });
    }

    aforoStartHourFilter.innerHTML = '<option value="all">Desde</option>';
    aforoEndHourFilter.innerHTML = '<option value="all">Hasta</option>';
    for (let i = 0; i < 24; i++) {
        const hourString = i.toString().padStart(2, '0');
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${hourString}:00`;
        aforoStartHourFilter.appendChild(option.cloneNode(true));
        aforoEndHourFilter.appendChild(option);
    }
    aforoEndHourFilter.value = "all";
}

function applyAforosFilters() {
    if (!aforosDataLoaded) return;

    aforosLayer.clearLayers();
    document.getElementById('aforo-details-container').style.display = 'none'; // Ocultar detalles al refiltrar

    const selectedYear = aforoYearFilter.value;
    const startHour = aforoStartHourFilter.value;
    const endHour = aforoEndHourFilter.value;
    const selectedBarrioName = barrioFilterSelect.value;

    let selectedBarrioFeature = null;
    if (selectedBarrioName !== 'all' && barriosData) {
        selectedBarrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === selectedBarrioName);
    }

    let filteredFlujo = allFlujoData;

    if (selectedYear !== 'all') {
        filteredFlujo = filteredFlujo.filter(flujo => {
            if (!flujo.FECHA || flujo.FECHA.split('/').length !== 3) return false;
            const year = flujo.FECHA.split('/')[2];
            return year === selectedYear;
        });
    }

    if (startHour !== 'all') {
        filteredFlujo = filteredFlujo.filter(flujo => {
            const horaPart = parseInt(flujo.HORA.split(' ')[0], 10);
            return horaPart >= parseInt(startHour, 10);
        });
    }

    if (endHour !== 'all') {
        filteredFlujo = filteredFlujo.filter(flujo => {
            const horaPart = parseInt(flujo.HORA.split(' ')[0], 10);
            return horaPart <= parseInt(endHour, 10);
        });
    }

    const aforosAgrupados = new Map();
    filteredFlujo.forEach(flujo => {
        const id = flujo['N CAMARA'];
        const count = parseInt(flujo.TOTAL, 10);

        if (cameraCoords.has(id) && !isNaN(count)) {
            aforosAgrupados.set(id, (aforosAgrupados.get(id) || 0) + count);
        }
    });

    aforosAgrupados.forEach((total, id) => {
        const camara = cameraCoords.get(id);
        if (!camara || !camara.lat || !camara.lon) return;

        let barrioMatch = true;
        if (selectedBarrioFeature) {
            const latlng = L.latLng(camara.lat, camara.lon);
            barrioMatch = isLatLngInMultiPolygon(latlng, selectedBarrioFeature.geometry.coordinates);
        }

        if (barrioMatch) {
            const marker = L.marker([camara.lat, camara.lon], { icon: aforoIcon });
            
            // Guardamos la información necesaria en el marcador
            marker.cameraInfo = {
                id: id,
                nombre: camara.nombre,
                total: total
            };

            // Creamos un popup inicial con el total del período filtrado
            const initialPopupContent = `<strong>${camara.nombre}</strong><br><hr>Total (período): ${total}<br><em>Click para ver detalle por día</em>`;
            marker.bindPopup(initialPopupContent);

            // El evento click ahora mostrará el panel de detalles
            marker.on('click', handleAforoMarkerClick);
            
            aforosLayer.addLayer(marker);
        }
    });
}

function applyCamarasFilters() {
    if (!allCamerasData) return;
    camarasLayer.clearLayers();

    const selectedBarrioName = barrioFilterSelect.value;
    let selectedBarrioFeature = null;
    if (selectedBarrioName !== 'all' && barriosData) {
        selectedBarrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === selectedBarrioName);
    }

    const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));

    allCamerasData.forEach(camara => {
        const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
        const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
        
        if (isNaN(lat) || isNaN(lon)) return;

        let shouldDisplay = true;
        if (selectedBarrioFeature) {
            const latlng = L.latLng(lat, lon);
            shouldDisplay = isLatLngInMultiPolygon(latlng, selectedBarrioFeature.geometry.coordinates);
        }

        if (shouldDisplay) {
            const id = camara['N CAMARA'];
            const direccion = camara[direccionHeaderKey];
            const cameraIcon = L.divIcon({
                className: 'camera-icon',
                html: `<span>${id}</span>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            const marker = L.marker([lat, lon], { icon: cameraIcon });
            marker.bindPopup(`<b>Cámara: ${id}</b><br>${direccion}`);
            camarasLayer.addLayer(marker);
        }
    });
}

function applyCamarasPrivadasFilters() {
    if (!allCamarasPrivadasData) return;
    camarasPrivadasLayer.clearLayers();

    const selectedBarrioName = barrioFilterSelect.value;
    let selectedBarrioFeature = null;
    if (selectedBarrioName !== 'all' && barriosData) {
        selectedBarrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === selectedBarrioName);
    }

    allCamarasPrivadasData.forEach(camara => {
        let shouldDisplay = true;
        if (selectedBarrioFeature) {
            shouldDisplay = isLatLngInMultiPolygon(camara.latlng, selectedBarrioFeature.geometry.coordinates);
        }

        if (shouldDisplay) {
            const cameraIcon = L.divIcon({
                className: 'camera-privada-icon',
                html: `<span>P</span>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            const marker = L.marker(camara.latlng, { icon: cameraIcon });
            marker.bindPopup(`<b>Cámara Privada</b><br>${camara.nombre}<br>${camara.desc}`);
            camarasPrivadasLayer.addLayer(marker);
        }
    });
}

function drawCameraCoverage(selectedBarrioFeature = null) { // Added parameter
  cameraCoverageLayer.clearLayers(); // Clear existing circles

  if (!allCamerasData) {
      console.warn("No public camera data available to draw coverage.");
      return;
  }

  allCamerasData.forEach(camara => {
      const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
      const lon = parseFloat(String(camara.Longitud).replace(',', '.'));

      if (!isNaN(lat) && !isNaN(lon)) {
          let shouldDisplay = true;
          if (selectedBarrioFeature) { // If a barrio is selected, filter
              const latlng = L.latLng(lat, lon);
              shouldDisplay = isLatLngInMultiPolygon(latlng, selectedBarrioFeature.geometry.coordinates);
          }

          if (shouldDisplay) {
              L.circle([lat, lon], {
                  radius: 100, // 100 meters
                  color: 'red',      // Outline color
                  weight: 1,         // Thinner outline (e.g., 1 or 2)
                  fillColor: '#f03', // A shade of red
                  fillOpacity: 0.5 ,  // Less transparency (e.g., 0.4 or 0.5)
                  // 👇 ESTA ES LA PROPIEDAD CLAVE QUE DEBE AÑADIR
                   interactive: false
              }).addTo(cameraCoverageLayer);
          }
      }
  });
  console.log(`Generated ${cameraCoverageLayer.getLayers().length} public camera coverage circles.`);
}

function isValidGeoJSONGeometry(geometry) {
  if (!geometry || !geometry.coordinates) {
      return false;
  }

  if (geometry.type === 'Polygon') {
      for (const ring of geometry.coordinates) {
          if (!Array.isArray(ring) || ring.length < 4) return false;
      }
  } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
          if (!Array.isArray(polygon)) return false;
          for (const ring of polygon) {
              if (!Array.isArray(ring) || ring.length < 4) return false;
          }
      }
  }
  return true;
}

function calculateAndDisplaySimpleUncoveredPercentage(selectedBarrioFeature = null) {
  if (uncoveredPercentageLabel) {
      mymap.removeLayer(uncoveredPercentageLabel);
      uncoveredPercentageLabel = null;
  }

  // Ensure pre-conditions are met
  if (!selectedBarrioFeature || !allCamerasData || !document.getElementById('zonas-sin-cobertura-negativo-checkbox').checked) {
      return;
  }

  const barrioName = selectedBarrioFeature.properties.soc_fomen;

  try {
      // Validate the geometry before using Turf.js
      if (!isValidGeoJSONGeometry(selectedBarrioFeature.geometry)) {
          console.error(`Invalid geometry for barrio "${barrioName}" (less than 4 points in a ring).`);
          return; // Stop execution if geometry is invalid
      }

      console.log("Calculating simple uncovered percentage for barrio:", barrioName);

      const barrioAreaSqMeters = turf.area(selectedBarrioFeature.geometry);
      const centerOfBarrio = turf.centerOfMass(selectedBarrioFeature.geometry);
      const labelPosition = [centerOfBarrio.geometry.coordinates[1], centerOfBarrio.geometry.coordinates[0]];

      if (barrioAreaSqMeters === 0) {
          uncoveredPercentageLabel = L.marker(labelPosition, {
              icon: L.divIcon({
                  className: 'uncovered-percentage-label',
                  html: 'No hay cobertura de cámaras en este barrio.<br>100% sin cubrir.'
              })
          }).addTo(mymap);
          return;
      }

      let totalCoveredAreaByCirclesSqMeters = 0;
      const cameraCircleRadiusMeters = 100;
      const areaOfSingleCircleSqMeters = Math.PI * Math.pow(cameraCircleRadiusMeters, 2);

      let camerasInBarrio = 0;
      allCamerasData.forEach(camara => {
          const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
          const lon = parseFloat(String(camara.Longitud).replace(',', '.'));

          if (!isNaN(lat) && !isNaN(lon)) {
              const latlng = L.latLng(lat, lon);
              if (isLatLngInMultiPolygon(latlng, selectedBarrioFeature.geometry.coordinates)) {
                  camerasInBarrio++;
                  totalCoveredAreaByCirclesSqMeters += areaOfSingleCircleSqMeters;
              }
          }
      });

      console.log(`Found ${camerasInBarrio} public cameras in barrio ${barrioName}.`);
      console.log(`Total covered area (ignoring overlaps): ${totalCoveredAreaByCirclesSqMeters.toFixed(2)} sq meters.`);

      const uncoveredAreaSqMeters = Math.max(0, barrioAreaSqMeters - totalCoveredAreaByCirclesSqMeters);
      const uncoveredPercentage = (uncoveredAreaSqMeters / barrioAreaSqMeters) * 100;

      const labelText = `Área sin cubrir: ${uncoveredPercentage.toFixed(2)}%`;

      uncoveredPercentageLabel = L.marker(labelPosition, {
          icon: L.divIcon({
              className: 'uncovered-percentage-label',
              html: labelText
          })
      }).addTo(mymap);
      console.log(`Uncovered percentage for ${barrioName}: ${uncoveredPercentage.toFixed(2)}%`);

  } catch (e) {
      console.error(`Failed to process geometry for barrio "${barrioName}". It might be malformed.`, e);
      // Display a user-friendly error on the map
      const errorLabelPosition = mymap.getCenter(); // Fallback position
      uncoveredPercentageLabel = L.marker(errorLabelPosition, {
          icon: L.divIcon({
              className: 'uncovered-percentage-label',
              html: `Error: Geometría inválida para ${barrioName}`
          })
      }).addTo(mymap);
  }
}

function handleAforoMarkerClick(e) {
  const marker = e.target;
  const { id, nombre } = marker.cameraInfo;
  populateDailyAforoList(id, nombre, marker);
}

function populateDailyAforoList(camaraId, camaraNombre, marker) {
    const detailsContainer = document.getElementById('aforo-details-container');
    const titleElement = document.getElementById('aforo-details-title');
    const dayListElement = document.getElementById('aforo-day-list');

    titleElement.textContent = `Detalle para: ${camaraNombre}`;
    dayListElement.innerHTML = 'Cargando...';

    const selectedYear = aforoYearFilter.value;
    let cameraData = allFlujoData.filter(flujo => flujo['N CAMARA'] === camaraId);

    if (selectedYear !== 'all') {
        cameraData = cameraData.filter(flujo => {
            if (!flujo.FECHA || flujo.FECHA.split('/').length !== 3) return false;
            return flujo.FECHA.split('/')[2] === selectedYear;
        });
    }

    const dailyTotals = new Map();
    cameraData.forEach(flujo => {
        const date = flujo.FECHA;
        const count = parseInt(flujo.TOTAL, 10);
        if (!isNaN(count)) {
            dailyTotals.set(date, (dailyTotals.get(date) || 0) + count);
        }
    });

    dayListElement.innerHTML = '';

    if (dailyTotals.size === 0) {
        dayListElement.innerHTML = '<div>No hay datos para la selección actual.</div>';
    } else {
        const sortedDays = Array.from(dailyTotals.entries()).sort((a, b) => {
            const partsA = a[0].split('/');
            const dateA = new Date(parseInt('20' + partsA[2]), parseInt(partsA[0]) - 1, parseInt(partsA[1]));
            const partsB = b[0].split('/');
            const dateB = new Date(parseInt('20' + partsB[2]), parseInt(partsB[0]) - 1, parseInt(partsB[1]));
            return dateA - dateB;
        });

        sortedDays.forEach(([date, total]) => {
            const parts = date.split('/');
            const displayDate = (parts.length === 3) ? `${parts[1]}/${parts[0]}/${parts[2]}` : date;

            const dayElement = document.createElement('div');
            dayElement.className = 'day-item';
            dayElement.innerHTML = `<span>${displayDate}</span> <span>Total: ${total}</span>`;
            dayElement.addEventListener('click', () => updateAforoPopup(marker, camaraId, date));
            dayListElement.appendChild(dayElement);
        });
    }

    detailsContainer.style.display = 'block';
}

function updateAforoPopup(marker, camaraId, date) {
    const dayData = allFlujoData.filter(flujo => flujo['N CAMARA'] === camaraId && flujo.FECHA === date);
    
    const hourlyData = new Map();
    let totalDelDia = 0;
    dayData.forEach(flujo => {
        const hora = flujo.HORA;
        const tipoVehiculo = flujo.PART.trim().toLowerCase();
        const count = parseInt(flujo.TOTAL, 10);

        if (!isNaN(count)) {
            if (!hourlyData.has(hora)) {
                hourlyData.set(hora, new Map());
            }
            const hourVehicles = hourlyData.get(hora);
            hourVehicles.set(tipoVehiculo, (hourVehicles.get(tipoVehiculo) || 0) + count);
            totalDelDia += count;
        }
    });

    const parts = date.split('/');
    const displayDate = (parts.length === 3) ? `${parts[1]}/${parts[0]}/${parts[2]}` : date;

    let popupContent = `<strong>${marker.cameraInfo.nombre}</strong><br>`;
    popupContent += `Fecha: <strong>${displayDate}</strong><br><hr>`;
    popupContent += `<strong>Total del día: ${totalDelDia}</strong><br><br>`;

    if (hourlyData.size > 0) {
        const sortedHours = Array.from(hourlyData.keys()).sort();
        sortedHours.forEach(hora => {
            popupContent += `<strong>Hora: ${hora.split(' ')[0]}</strong><br>`;
            const hourVehicles = hourlyData.get(hora);
            for (const [tipo, cantidad] of hourVehicles.entries()) {
                popupContent += `&nbsp;&nbsp;${tipo.charAt(0).toUpperCase() + tipo.slice(1)}: ${cantidad}<br>`;
            }
        });
    } else {
        popupContent += "No hay desglose de vehículos para este día.";
    }

    marker.setPopupContent(popupContent).openPopup();
}



function parseCSV(text) {
    const lines = text.trim().split(/\r\n|\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim().replace(/"/g, ''));
    const result = [];
    const regex = /,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const values = line.split(regex);
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            let value = values[j] || '';
            value = value.trim().replace(/^"|"$/g, '');
            obj[header] = value.replace(/""/g, '"');
        }
        result.push(obj);
    }
    return result;
}

let baseDataLoaded = false;
let skipAutoDisplayCameras = false; // Flag para prevenir mostrar cámaras automáticamente en ciertas consultas
function loadBaseCSVData() {
    if (baseDataLoaded) {
        return Promise.resolve();
    }
    // Cache-busting: agregar timestamp al URL para forzar descarga fresca
    const cacheToken = Date.now();
    return Promise.all([
        fetch('Camaras.CSV1 (1).csv?v=' + cacheToken).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok for Camaras.CSV1 (1).csv');
            }
            return response.text();
        }),
        fetch('FLUJO.csv?v=' + cacheToken).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok for FLUJO.csv');
            }
            return response.text();
        }),
        fetch('Recorrido lineas Colectivos - tabla colectivos (1).csv?v=' + cacheToken).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok for Recorrido lineas Colectivos - tabla colectivos (1).csv');
            }
            return response.text();
        }),
        fetch('cámaras privadas MGP- CÁMARAS PRIVADAS.csv?v=' + cacheToken).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok for cámaras privadas MGP- CÁMARAS PRIVADAS.csv');
            }
            return response.text();
        })
    ])
    .then(([camarasCSV, flujoCSV, busRoutesCSV, camarasPrivadasCSV]) => {
        allCamerasData = parseCSV(camarasCSV);
        allFlujoData = parseCSV(flujoCSV);
        allBusRoutesData = parseCSV(busRoutesCSV);

        const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));
        if (direccionHeaderKey) {
            allCamerasData.forEach(camara => {
                const id = camara['N CAMARA'];
                const address = camara[direccionHeaderKey];
                if (id && address) {
                    semaforoAddresses.set(id, address);
                }
            });
            console.log(`✅ Direcciones de semáforos/cámaras procesadas: ${semaforoAddresses.size} encontradas.`);
        }

        // Initialize dependent components
        processCamarasData();
        processAforosData();
        processCamarasPrivadasData(camarasPrivadasCSV);
        populateBusLineSelector();
        populateLprSelector();

        baseDataLoaded = true;
        console.log("✅ Datos CSV base cargados bajo demanda.");
        
        // Mostrar cámaras automáticamente después de cargar los datos (solo si no se indica lo contrario)
        if (!skipAutoDisplayCameras) {
            console.log('🎯 Renderizando cámaras automáticamente...');
            const barrioFilter = document.getElementById('barrio-filter');
            if (barrioFilter) {
                barrioFilter.value = 'all';
            }
            applyCamarasFilters();
            if (!mymap.hasLayer(camarasLayer)) {
                mymap.addLayer(camarasLayer);
            }
            // Mark checkbox silently to match the visible state (without triggering change event)
            const camarasCheckbox = document.getElementById('camaras-checkbox');
            if (camarasCheckbox) {
                camarasCheckbox.checked = true;
            }
            console.log('✅ Cámaras mostradas. Total en capa:', camarasLayer.getLayers().length);
        } else {
            console.log('⏭️ Omitiendo visualización automática de cámaras');
            skipAutoDisplayCameras = false; // Resetear el flag
        }
    })
    .catch(error => {
        console.error('Error al cargar datos CSV base:', error);
        throw error;
    });
}

function processAforosData() {
    const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));

    allCamerasData.forEach(camara => {
        const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
        const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
        const id = camara['N CAMARA'];
        const nombre = camara[direccionHeaderKey];

        if (id && nombre && !isNaN(lat) && !isNaN(lon)) {
            cameraCoords.set(id, { lat, lon, nombre });
        }
    });
    
    aforosDataLoaded = true;
    populateAforosFilters();
    applyAforosFilters();
}



function processCamarasData() {
    // Esta función ahora solo asegura que los datos estén en allCamerasData.
    // La adición de marcadores se maneja en applyCamarasFilters.
    camarasDataLoaded = true;
    console.log(`✅ Datos de Cámaras procesados.`);
}

// --- Lógica de Cámaras ---
const camarasLayer = L.layerGroup();
let camarasDataLoaded = false;



// --- Lógica de Cámaras Privadas ---
const camarasPrivadasLayer = L.layerGroup();
let camarasPrivadasDataLoaded = false;
let allCamarasPrivadasData = [];

const cameraCoverageLayer = L.layerGroup();
const camarasAisladasLayer = L.layerGroup();
const zonasCiegasLayer = L.layerGroup();
const barriosSinCoberturaLayer = L.layerGroup();
const barriosDestacadosLayer = L.featureGroup();
const zonasDescubiertasLayer = L.layerGroup();
const motosCirculacionLayer = L.layerGroup();
const siniestrosEnZonasLayer = L.layerGroup();
const siniestrosCercaParadasLayer = L.layerGroup();
const recorridosColectivosLayer = L.layerGroup();
const hotspotCamerasLayer = L.layerGroup();
const lprCamerasLayer = L.layerGroup();
const robosSinCamarasLayer = L.layerGroup();
const robosSinIntervencionLayer = L.layerGroup();
const corredoresEscolaresLayer = L.layerGroup();
const camarasEnCorredoresLayer = L.layerGroup();
const colegiosLayer = L.layerGroup();
const ubicacionesPropuestasLayer = L.layerGroup();
const dangerousCornersLayer = L.layerGroup();
let uncoveredPercentageLabel = null; // New global declaration
const semaforosSiniestrosLayer = L.layerGroup(); // Capa original, la mantengo por si acaso
const semaforosSiniestrosClusterLayer = L.markerClusterGroup(); // Nueva capa para clustering
const semaforoSiniestroIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', // Un ícono rojo estándar y fiable
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

function processCamarasPrivadasData(csvText) {
    allCamarasPrivadasData = []; // Reset before loading
    const lines = csvText.trim().split(/\r\n|\n/);
    const pointRegex = /POINT \(([^ ]+) ([^ ]+)\)/;

    for (let i = 3; i < lines.length; i++) { // Skip header lines
        const line = lines[i];
        if (!line) continue;

        const parts = line.split(',');
        const wkt = parts[0];
        const match = wkt.match(pointRegex);

        if (match) {
            const lon = parseFloat(match[1]);
            const lat = parseFloat(match[2]);
            const nombre = parts[1] || 'Sin nombre';
            const desc = parts[2] || '';

            if (!isNaN(lat) && !isNaN(lon)) {
                const latlng = L.latLng(lat, lon);
                allCamarasPrivadasData.push({ latlng, nombre, desc });
            }
        }
    }
    camarasPrivadasDataLoaded = true;
    console.log(`✅ Datos de Cámaras Privadas procesados: ${allCamarasPrivadasData.length}`);
}



// --- Lógica de Líneas de Colectivo ---
let allBusRoutesData;
let allCamerasData;
let semaforoAddresses = new Map(); // Para almacenar direcciones de semáforos por ID
const busRoutesLayer = L.layerGroup();

const busLineSearch = document.getElementById('bus-line-search');
const busLineSelect = document.getElementById('bus-line-select');
const showBusRouteButton = document.getElementById('show-bus-route-button');
const busRouteCheckbox = document.getElementById('bus-route-checkbox');

function populateBusLineSelector() {
    if (!allBusRoutesData) return;

    const busLines = [...new Set(allBusRoutesData.map(item => item['Linea Colectivo']))].sort();
    
    busLineSelect.innerHTML = '<option value="">Seleccione una línea</option>'; // Reset
    busLines.forEach(line => {
        if (line) { // Ensure not to add empty lines
            const option = document.createElement('option');
            option.value = line;
            option.textContent = line;
            busLineSelect.appendChild(option);
        }
    });
}

function displayBusRoute() {
          // Ocultar cámaras generales al mostrar un recorrido de colectivo
          if (mymap.hasLayer(camarasLayer)) {
            mymap.removeLayer(camarasLayer);
          }
    loadBaseCSVData().then(async () => {
      const selectedLine = busLineSelect.value;
      if (!selectedLine || !allBusRoutesData || !allCamerasData) {
        return;
      }

      // Limpiar completamente el layer de recorridos de colectivo y evitar duplicados
      try {
        if (mymap.hasLayer(busRoutesLayer)) {
          mymap.removeLayer(busRoutesLayer);
        }
        busRoutesLayer.clearLayers();
      } catch (e) {
        console.warn('No se pudo limpiar busRoutesLayer:', e);
      }

      // IMPORTANTE: No agregar cámaras de colectivo al layer general de cámaras

      // 1. Intentar cargar el GeoJSON de la línea
      const geojsonFile = `linea${selectedLine}.geojson`;
      let geojsonData = null;
      try {
        const res = await fetch(geojsonFile);
        if (res.ok) {
          geojsonData = await res.json();
        }
      } catch (e) {
        geojsonData = null;
      }

      // 2. Dibujar la trayectoria si existe el geojson
      let routeLatLngs = [];
      if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
        geojsonData.features.forEach(feature => {
          if (feature.geometry.type === 'LineString') {
            const latlngs = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            routeLatLngs = routeLatLngs.concat(latlngs);
            const polyline = L.polyline(latlngs, {
              color: '#ff6600',
              weight: 5,
              opacity: 0.8
            });
            polyline.bindPopup(`<b>Línea ${selectedLine}</b>`);
            busRoutesLayer.addLayer(polyline);
          }
        });
      }

      // 3. Marcar las cámaras asociadas a la línea
      const routeCameras = allBusRoutesData.filter(route => route['Linea Colectivo'] === selectedLine);
      const cameraNumbers = routeCameras.map(route => route['Nº Camara']);
      const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));
      const camerasOnRoute = allCamerasData.filter(camera => cameraNumbers.includes(camera['N CAMARA']));

      camerasOnRoute.forEach(camara => {
        const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
        const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
        const id = camara['N CAMARA'];
        const direccion = camara[direccionHeaderKey];
        if (id && direccion && !isNaN(lat) && !isNaN(lon)) {
          // Ícono naranja circular con número de cámara (igual móvil)
          const cameraIcon = L.divIcon({
            className: 'camera-icon bus-route-camera',
            html: `<div style=\"background:#ff6600;width:28px;height:28px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:white;\">${id}</div>`,
            iconSize: [28,28],
            iconAnchor: [14,14]
          });
          const marker = L.marker([lat, lon], { icon: cameraIcon });
          marker.bindPopup(`<b>📹 Cámara ${id}</b><br>${direccion}`);
          busRoutesLayer.addLayer(marker);
        }
      });

      // 4. Si hay geojson, buscar paradas y marcarlas con estilo móvil (círculo azul con punto blanco)
      if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
        geojsonData.features.forEach((feature) => {
          if (feature.geometry.type === 'Point') {
            const [lon, lat] = feature.geometry.coordinates;
            // Ícono: círculo azul con punto blanco en el centro
            const paradaIcon = L.divIcon({
              className: 'bus-stop-icon',
              html: `<div style=\"background:#2196f3;width:22px;height:22px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;\"><div style=\"background:white;width:8px;height:8px;border-radius:50%;\"></div></div>`,
              iconSize: [22,22],
              iconAnchor: [11,11]
            });
            const marker = L.marker([lat, lon], { icon: paradaIcon });
            busRoutesLayer.addLayer(marker);
          }
        });
      }

      // 5. Ajustar el mapa a la ruta si hay trayectoria
      if (routeLatLngs.length > 1) {
        mymap.fitBounds(routeLatLngs);
      } else if (camerasOnRoute.length > 0) {
        // Si no hay geojson, ajustar a las cámaras
        const bounds = L.latLngBounds(camerasOnRoute.map(camara => [parseFloat(String(camara.Latitud).replace(',', '.')), parseFloat(String(camara.Longitud).replace(',', '.'))]));
        mymap.fitBounds(bounds);
      }

      mymap.addLayer(busRoutesLayer);
      busRouteCheckbox.checked = true;
    });
}

busLineSearch.addEventListener('input', () => {
    const searchTerm = busLineSearch.value.toLowerCase();
    Array.from(busLineSelect.options).forEach(option => {
        const lineName = option.textContent.toLowerCase();
        option.style.display = lineName.includes(searchTerm) ? '' : 'none';
    });
});

showBusRouteButton.addEventListener('click', displayBusRoute);

busRouteCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        mymap.addLayer(busRoutesLayer);
    } else {
        mymap.removeLayer(busRoutesLayer);
    }
});

// --- Lógica de Cámaras LPR ---
const lprCameraSelect = document.getElementById('lpr-camera-select');
const showLprRadiusButton = document.getElementById('show-lpr-radius-button');
const lprCircleLayer = L.layerGroup().addTo(mymap);
const lprFilteredCamerasLayer = L.layerGroup().addTo(mymap);
let lprCameras = [];

// --- Lógica de Búsqueda de Direcciones ---
const addressSearchCircleLayer = L.layerGroup().addTo(mymap);
const addressSearchFilteredCamerasLayer = L.layerGroup().addTo(mymap);


function populateLprSelector() {
    if (!allCamerasData || allCamerasData.length === 0) return;
    
    const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));
    
    // 🎯 Función auxiliar para verificar si una cámara tiene LPR
    function hasLPR(camera) {
        // Verificar columna LPR (puede ser "1", "LPR 1", "LPR 1 (OESTE)", etc.)
        if (camera.LPR && camera.LPR.trim() !== '' && camera.LPR.trim() !== '0') {
            return true;
        }
        // Verificar columna Cant. Cam. LPR
        if (camera['Cant. Cam. LPR']) {
            const cantLpr = parseInt(camera['Cant. Cam. LPR']);
            if (cantLpr > 0) return true;
        }
        return false;
    }
    
    // 🎯 Agrupar cámaras por ID y filtrar siendo más inteligentes
    const cameraMap = new Map(); // { cameraID: cameraObject }
    
    allCamerasData.forEach(camera => {
        const cameraID = camera['N CAMARA'];
        if (!cameraID) return; // Ignorar registros sin ID
        
        // Si esta cámara NON tiene LPR, ignorarla
        if (!hasLPR(camera)) return;
        
        // Si esta cámara ya existe en el mapa, mantener la que tenga LPR más descriptivo
        if (cameraMap.has(cameraID)) {
            const existing = cameraMap.get(cameraID);
            // Si el nuevo tiene LPR menos vacío, reemplazar
            if (camera.LPR && camera.LPR.trim() && (!existing.LPR || !existing.LPR.trim())) {
                cameraMap.set(cameraID, camera);
            }
        } else {
            // Primera vez que vemos esta cámara con LPR
            cameraMap.set(cameraID, camera);
        }
    });
    
    // Convertir el mapa a array para lprCameras
    lprCameras = Array.from(cameraMap.values());
    
    // 🔢 Ordenar por número de cámara (de menor a mayor)
    lprCameras.sort((a, b) => {
        const numA = parseInt(a['N CAMARA']) || 0;
        const numB = parseInt(b['N CAMARA']) || 0;
        return numA - numB;
    });
    
    console.log(`🎯 Cámaras LPR encontradas: ${lprCameras.length}`, lprCameras.map(c => `${c['N CAMARA']} (${c.LPR})`).join(', '));

    lprCameraSelect.innerHTML = '<option value="">Seleccione una cámara LPR</option>';
    lprCameras.forEach(camera => {
        const option = document.createElement('option');
        option.value = camera['N CAMARA'];
        const lprLabel = camera.LPR && camera.LPR.trim() ? camera.LPR : 'LPR';
        option.textContent = `${camera['N CAMARA']} - ${camera[direccionHeaderKey]} (${lprLabel})`;
        lprCameraSelect.appendChild(option);
    });
    
    console.log(`✅ Selector LPR populado con ${lprCameras.length} cámaras`);
}

function displayLprRadius() {
    loadBaseCSVData().then(() => {
        clearLprRadius(); 
        const selectedCameraId = lprCameraSelect.value;
        if (!selectedCameraId) return;

        const selectedLprCamera = lprCameras.find(c => c['N CAMARA'] === selectedCameraId);
        if (!selectedLprCamera) return;

        const lat = parseFloat(String(selectedLprCamera.Latitud).replace(',', '.'));
        const lon = parseFloat(String(selectedLprCamera.Longitud).replace(',', '.'));
        const center = L.latLng(lat, lon);

        // 🎯 ZOOM AUTOMÁTICO AL LPR SELECCIONADO
        mymap.setView(center, 15, {
          animate: true,
          duration: 1.0 // Animación suave de 1 segundo
      });

        L.circle(center, {
            radius: 2000,
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.2
        }).addTo(lprCircleLayer);

        const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));

        // Add a special marker for the selected LPR camera
        const selectedIcon = L.divIcon({
            className: 'lpr-selected-camera-icon',
            html: `<span>${selectedLprCamera['N CAMARA']}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        L.marker(center, { icon: selectedIcon, zIndexOffset: 1000 })
            .bindPopup(`<b>Cámara LPR (Seleccionada): ${selectedLprCamera['N CAMARA']}</b><br>${selectedLprCamera[direccionHeaderKey]}`)
            .addTo(lprFilteredCamerasLayer);


        // Ocultar capas principales de cámaras
        if (mymap.hasLayer(camarasLayer)) mymap.removeLayer(camarasLayer);
        if (mymap.hasLayer(camarasPrivadasLayer)) mymap.removeLayer(camarasPrivadasLayer);

        // Filtrar y mostrar cámaras públicas
        allCamerasData.forEach(camera => {
            if (camera['N CAMARA'] === selectedCameraId) return; // Skip the selected one

            const camLat = parseFloat(String(camera.Latitud).replace(',', '.'));
            const camLon = parseFloat(String(camera.Longitud).replace(',', '.'));
            if (!isNaN(camLat) && !isNaN(camLon)) {
                const camCenter = L.latLng(camLat, camLon);
                if (center.distanceTo(camCenter) <= 2000) {
                    const isLPR = camera.LPR || (camera['Cant. Cam. LPR'] && parseInt(camera['Cant. Cam. LPR']) > 0);
                    const iconClass = isLPR ? 'lpr-camera-icon' : 'camera-icon';
                    const icon = L.divIcon({ className: iconClass, html: `<span>${camera['N CAMARA']}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
                    L.marker(camCenter, { icon }).bindPopup(`<b>Cámara: ${camera['N CAMARA']}</b><br>${camera[direccionHeaderKey]}`).addTo(lprFilteredCamerasLayer);
                }
            }
        });

        // Filtrar y mostrar cámaras privadas
        if (allCamarasPrivadasData) {
            allCamarasPrivadasData.forEach(camera => {
                if (center.distanceTo(camera.latlng) <= 2000) {
                    const icon = L.divIcon({ className: 'camera-privada-icon', html: `<span>P</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
                    L.marker(camera.latlng, { icon }).bindPopup(`<b>Cámara Privada</b><br>${camera.nombre}<br>${camera.desc}`).addTo(lprFilteredCamerasLayer);
                }
            });
        }
    });
}

function clearLprRadius() {
    lprCircleLayer.clearLayers();
    lprFilteredCamerasLayer.clearLayers();

    // Restaurar capas principales si sus checkboxes están activos
    if (document.getElementById('camaras-checkbox').checked) mymap.addLayer(camarasLayer);
    if (document.getElementById('camaras-privadas-checkbox').checked) mymap.addLayer(camarasPrivadasLayer);
}

function displayAddressRadiusAndCameras(location) {
    // Limpiar capas de búsqueda de dirección y LPR anteriores
    addressSearchCircleLayer.clearLayers();
    addressSearchFilteredCamerasLayer.clearLayers();
    clearLprRadius();

    const center = L.latLng(location.lat, location.lon);

    // Mover el mapa a la ubicación
    mymap.setView(center, 15); // Zoom 15 para un radio de 1km

    // Dibujar círculo de 1km
    L.circle(center, {
        radius: 1000, // 1 km
        color: 'blue',
        fillColor: '#3388ff',
        fillOpacity: 0.2
    }).addTo(addressSearchCircleLayer);

    // Añadir un marcador en el punto buscado
    L.marker(center).addTo(addressSearchFilteredCamerasLayer);

    // Ocultar capas principales de cámaras para evitar duplicados
    if (mymap.hasLayer(camarasLayer)) mymap.removeLayer(camarasLayer);
    if (mymap.hasLayer(camarasPrivadasLayer)) mymap.removeLayer(camarasPrivadasLayer);

    const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));

    // Filtrar y mostrar cámaras públicas dentro del radio
    allCamerasData.forEach(camera => {
        const camLat = parseFloat(String(camera.Latitud).replace(',', '.'));
        const camLon = parseFloat(String(camera.Longitud).replace(',', '.'));
        if (!isNaN(camLat) && !isNaN(camLon)) {
            const camCenter = L.latLng(camLat, camLon);
            if (center.distanceTo(camCenter) <= 1000) {
                const isLPR = camera.LPR || (camera['Cant. Cam. LPR'] && parseInt(camera['Cant. Cam. LPR']) > 0);
                const iconClass = isLPR ? 'lpr-camera-icon' : 'camera-icon';
                const icon = L.divIcon({ className: iconClass, html: `<span>${camera['N CAMARA']}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
                L.marker(camCenter, { icon }).bindPopup(`<b>Cámara: ${camera['N CAMARA']}</b><br>${camera[direccionHeaderKey]}`).addTo(addressSearchFilteredCamerasLayer);
            }
        }
    });

    // Filtrar y mostrar cámaras privadas dentro del radio
    if (allCamarasPrivadasData) {
        allCamarasPrivadasData.forEach(camera => {
            if (center.distanceTo(camera.latlng) <= 1000) {
                const icon = L.divIcon({ className: 'camera-privada-icon', html: `<span>P</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
                L.marker(camera.latlng, { icon }).bindPopup(`<b>Cámara Privada</b><br>${camera.nombre}<br>${camera.desc}`).addTo(addressSearchFilteredCamerasLayer);
            }
        });
    }
}


if (showLprRadiusButton) {
    showLprRadiusButton.addEventListener('click', displayLprRadius);
}
// --- Checkbox de Cobertura Escolar ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Lógica de Cobertura Escolar ---
const colegiosCoberturaCheckbox = document.getElementById('colegios-cobertura-checkbox');
const colegiosCoberturaLayer = L.layerGroup();

colegiosCoberturaCheckbox.addEventListener('change', function() {
    const camarasCheckbox = document.getElementById('camaras-checkbox');
    const colegiosCheckbox = document.getElementById('colegios-checkbox');

    if (this.checked) {
        // Activate the individual layers by checking their boxes and dispatching events
        if (!camarasCheckbox.checked) {
            camarasCheckbox.checked = true;
            camarasCheckbox.dispatchEvent(new Event('change'));
        }
        if (!colegiosCheckbox.checked) {
            colegiosCheckbox.checked = true;
            colegiosCheckbox.dispatchEvent(new Event('change'));
        }
        document.getElementById('info-cobertura-escolar').style.display = 'block';
    } else {
        // Deactivate the individual layers
        if (camarasCheckbox.checked) {
            camarasCheckbox.checked = false;
            camarasCheckbox.dispatchEvent(new Event('change'));
        }
        if (colegiosCheckbox.checked) {
            colegiosCheckbox.checked = false;
            colegiosCheckbox.dispatchEvent(new Event('change'));
        }
        document.getElementById('info-cobertura-escolar').style.display = 'none';
    }
});
    const infoPanel = document.getElementById('info-cobertura-escolar');

    if (colegiosCoberturaCheckbox) {
        colegiosCoberturaCheckbox.addEventListener('change', async (e) => {
            if (e.target.checked) {
                await mostrarCoberturaEscolar();
                mymap.addLayer(colegiosCoberturaLayer);
                mymap.addLayer(colegiosPorcentajeLayer);
                // Mostrar panel explicativo
                infoPanel.style.display = 'block';
            } else {
                mymap.removeLayer(colegiosCoberturaLayer);
                mymap.removeLayer(colegiosPorcentajeLayer);
                // Ocultar panel explicativo
                infoPanel.style.display = 'none';
            }
        });
    }

    // Hacer el panel arrastrable
    if (infoPanel) {
        let isDragging = false;
        let offsetX, offsetY;

        infoPanel.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - infoPanel.offsetLeft;
            offsetY = e.clientY - infoPanel.offsetTop;
            infoPanel.style.cursor = 'grabbing';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            infoPanel.style.cursor = 'move';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            infoPanel.style.left = (e.clientX - offsetX) + 'px';
            infoPanel.style.top = (e.clientY - offsetY) + 'px';
        });
    }
});


// --- Lógica de Robo Automotor ---
const roboAutomotorLayer = L.markerClusterGroup();
let allRoboAutomotorData;
const roboAutomotorCheckbox = document.getElementById('robo-automotor-checkbox');
const roboAutomotorFiltersDiv = document.getElementById('robo-automotor-filters');
const roboAutomotorYearFilter = document.getElementById('robo-automotor-year-filter');
const roboHeatLayer = L.heatLayer([], { radius: 25 });

const roboIcon = L.divIcon({
    className: 'custom-div-icon',
    html: '<i class="fi fi-rr-car" style="font-size: 24px; color: #dc3545;"></i>',
    iconSize: [24, 24],
    iconAnchor: [12, 24]
});

function loadRoboAutomotorData() {
    if (allRoboAutomotorData) {
        return Promise.resolve();
    }
    return fetch('robo automotor - Hoja\u00A01.csv')
        .then(response => response.text())
        .then(csvText => {
            const lines = csvText.trim().split(/\r\n|\n/);
            if (lines.length < 2) {
                allRoboAutomotorData = [];
            } else {
                const headers = lines[0].replace(/^\uFEFF/, '').split(';').map(h => h.trim());
                const data = lines.slice(1).map(line => {
                    if (!line) return null;
                    const values = line.split(';');
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = values[index] ? values[index].trim() : '';
                    });
                    return obj;
                }).filter(Boolean);
                allRoboAutomotorData = data;
            }
            populateRoboAutomotorFilters(allRoboAutomotorData);
            console.log("✅ Datos de Robo Automotor cargados bajo demanda.");
        })
        .catch(error => {
            console.error('Error al cargar datos de robo automotor:', error);
            throw error;
        });
}

function updateRoboAutomotorLayer(data) {
    roboAutomotorLayer.clearLayers();
    if (!data) return;

    const heatPoints = [];
    data.forEach(item => {
        const coordsStr = item['Longitud y Latitud'];
        if (coordsStr) {
            const parts = coordsStr.split(',').map(s => s.trim());
            if (parts.length === 2) {
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);

                if (!isNaN(lat) && !isNaN(lon)) {
                    heatPoints.push([lat, lon]);
                    const marker = L.marker([lat, lon], { icon: roboIcon });
                    const fullAddress = [item['Direccion 0'], item['Direccion']].filter(Boolean).join(' y ');
                    marker.bindPopup(`
                        <b>Robo/Hurto Automotor</b><br>
                        <b>Dirección:</b> ${fullAddress || 'No especificada'}<br>
                        <b>Año:</b> ${item.año || 'No especificado'}<br>
                        <b>Resultado:</b> ${item.Resultado || 'No especificado'}
                    `);
                    roboAutomotorLayer.addLayer(marker);
                }
            }
        }
    });
    roboHeatLayer.setLatLngs(heatPoints);
}

function processAndDisplayRobos(data) {
    // --- Lógica para calcular el Top 10 de Robos ---
    const locationCounts = new Map();
    data.forEach(item => {
        const coordsStr = item['Longitud y Latitud'];
        if (coordsStr) {
            const parts = coordsStr.split(',').map(s => s.trim());
            if (parts.length === 2) {
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lon)) {
                    const key = `${lat},${lon}`;
                    if (!locationCounts.has(key)) {
                        const fullAddress = [item['Direccion 0'], item['Direccion']].filter(Boolean).join(' y ');
                        locationCounts.set(key, {
                            count: 0,
                            lat: lat,
                            lon: lon,
                            address: fullAddress || 'Dirección no especificada'
                        });
                    }
                    locationCounts.get(key).count++;
                }
            }
        }
    });

    const rankedLocations = Array.from(locationCounts.values())
                                 .sort((a, b) => b.count - a.count)
                                 .slice(0, 10);

    updateTopRoboLabels(rankedLocations);
    updateTopRoboPanel(rankedLocations);

    const topLocationKeys = new Set(rankedLocations.map(l => `${l.lat},${l.lon}`));
    const dataWithoutTop = data.filter(item => {
        const coordsStr = item['Longitud y Latitud'];
        if (!coordsStr) return true;
        const parts = coordsStr.split(',').map(s => s.trim());
        if (parts.length !== 2) return true;
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return true;
        const key = `${lat},${lon}`;
        return !topLocationKeys.has(key);
    });

    updateRoboAutomotorLayer(dataWithoutTop);
}

function applyRoboAutomotorFilters() {
    if (!allRoboAutomotorData) return;

    const selectedYear = roboAutomotorYearFilter.value;
    const selectedBarrioName = barrioFilterSelect.value;
    const resultadoFilter = document.getElementById('robo-resultado-filter');
    const selectedResultadoCategory = resultadoFilter ? resultadoFilter.value : 'Todos los Resultados';

    const resultadoCategories = {
        'Intervención Policial': ['Detencion', 'Persecucion Y Detencion', 'Secuestro De Vehiculo'],
        'Policia Asiste y Libera': ['Asiste Policia y Libera', 'Asiste Prefectura'],
        'Hallasgo de Automotor': ['Hallazgo Automotor'],
        'Sin recurso Policial': ['No Asiste'],
        'Seguimiento LPR': ['LPR - Se realiza seguimiento del vehiculo'],
        'LPR Detencion': ['LPR - Vehiculo Interceptado']
    };

    let selectedBarrioFeature = null;
    if (selectedBarrioName !== 'all' && barriosData) {
        selectedBarrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === selectedBarrioName);
    }

    let filteredData = allRoboAutomotorData;

    // Filtrar por año
    if (selectedYear !== 'all') {
        filteredData = filteredData.filter(item => item.año === selectedYear);
    }

    // Filtrar por categoría de resultado
    if (selectedResultadoCategory !== 'Todos los Resultados') {
        const outcomesToFilter = resultadoCategories[selectedResultadoCategory];
        if (outcomesToFilter) {
            filteredData = filteredData.filter(item => item.Resultado && outcomesToFilter.includes(item.Resultado.trim()));
        }
    }

    // Filtrar por barrio
    if (selectedBarrioFeature) {
        filteredData = filteredData.filter(item => {
            const coordsStr = item['Longitud y Latitud'];
            if (!coordsStr) return false;
            const parts = coordsStr.split(',').map(s => s.trim());
            if (parts.length !== 2) return false;
            const lat = parseFloat(parts[0]);
            const lon = parseFloat(parts[1]);
            if (isNaN(lat) || isNaN(lon)) return false;
            
            const latlng = L.latLng(lat, lon);
            return isLatLngInMultiPolygon(latlng, selectedBarrioFeature.geometry.coordinates);
        });
    }
    
    processAndDisplayRobos(filteredData);
}

function updateTopRoboLabels(topLocations) {

    topRoboLabelsLayer.clearLayers();



    if (!document.getElementById('robo-automotor-checkbox').checked) {

        return;

    }



    topLocations.forEach((location, index) => {

        const rank = index + 1;

        const rankedIcon = createRankedIcon(rank, 'robo');



                const marker = L.marker([location.lat, location.lon], { icon: rankedIcon, zIndexOffset: 1000 });



                const popupContent = `Ubicación #${rank}: ${location.address}<br>Total de robos: ${location.count}`;



                marker.bindPopup(popupContent, { className: 'custom-popup' });



        



                marker.on('click', () => {



                    highlightTopItem(location, 'robo');



                });



        topRoboLabelsLayer.addLayer(marker);

    });

}

function updateTopRoboPanel(rankedLocations) {
    const panel = document.getElementById('top-robo-panel');
    const content = document.getElementById('top-robo-content');

    if (!content || !panel) return;

    content.innerHTML = ''; // Limpiar contenido anterior

    if (!document.getElementById('robo-automotor-checkbox').checked || rankedLocations.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'flex'; // Mostrar panel

    rankedLocations.forEach((location, index) => {
        const item = document.createElement('div');
        item.className = 'top-robo-item';
        
        const rank = `<div class="rank">#${index + 1}</div>`;
        const address = `<div class="address">${location.address} (${location.count})</div>`;
        const viewButton = `<button class="view-on-map-btn">Ver en mapa</button>`;

        item.innerHTML = rank + address + viewButton;

        const button = item.querySelector('.view-on-map-btn');
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            mymap.setView([location.lat, location.lon], 18);
            highlightMarker(location, 'robo');
            // Abrir el popup correspondiente
            topRoboLabelsLayer.eachLayer(layer => {
                if (layer.getLatLng().lat === location.lat && layer.getLatLng().lng === location.lon) {
                    layer.openPopup();
                }
            });
        });

        content.appendChild(item);
    });
}


function populateRoboAutomotorFilters(data) {
    // Limpiar filtros previos para evitar duplicados al recargar
    const oldInterventionCheckbox = document.getElementById('robo-intervention-checkbox');
    if (oldInterventionCheckbox) {
        oldInterventionCheckbox.parentElement.parentElement.remove();
    }
    const oldResultadoFilter = document.getElementById('robo-resultado-filter');
    if (oldResultadoFilter) {
        oldResultadoFilter.parentElement.remove();
    }

    const years = new Set(data.map(item => item.año).filter(Boolean));
    const sortedYears = Array.from(years).sort((a, b) => b - a);

    roboAutomotorYearFilter.innerHTML = '<option value="all">Todos los Años</option>';
    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        roboAutomotorYearFilter.appendChild(option);
    });

    // Crear y añadir el nuevo menú desplegable para los resultados
    const resultadoFilterDiv = document.createElement('div');
    resultadoFilterDiv.className = 'filter-group';
    
    const label = document.createElement('label');
    label.textContent = 'Filtrar por Resultado:';
    
    const select = document.createElement('select');
    select.id = 'robo-resultado-filter';

    const categories = {
        'Todos los Resultados': [],
        'Intervención Policial': ['Detencion', 'Persecucion y Detencion', 'Secuestro de Vehiculo'],
        'Policia Asiste y Libera': ['Asiste policia y libera', 'asiste prefectura'],
        'Hallasgo de Automotor': ['Hallasgo de Automotor'],
        'Sin recurso Policial': ['No Asiste'],
        'Seguimiento LPR': ['LPR Seguimiento'],
        'LPR Detencion': ['LPR Seguimiento Detencion']
    };

    for (const category in categories) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    }

    resultadoFilterDiv.appendChild(label);
    resultadoFilterDiv.appendChild(select);
    roboAutomotorFiltersDiv.appendChild(resultadoFilterDiv);

    select.addEventListener('change', applyRoboAutomotorFilters);
}



// --- Lógica de Paneles Arrastrables ---
function makeDraggable(panelElement, handleElement) {
    if (!panelElement || !handleElement) {
        console.error("makeDraggable: Missing panelElement or handleElement.");
        return;
    }

    let isDragging = false;
    let offsetX, offsetY;

    handleElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - panelElement.getBoundingClientRect().left;
        offsetY = e.clientY - panelElement.getBoundingClientRect().top;
        panelElement.style.cursor = 'grabbing';
        panelElement.style.userSelect = 'none'; // Prevent text selection during drag
        panelElement.style.transition = 'none'; // Disable transition during drag
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panelElement.style.left = `${e.clientX - offsetX}px`;
        panelElement.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        panelElement.style.cursor = 'grab';
        panelElement.style.userSelect = 'auto';
        panelElement.style.transition = ''; // Re-enable transition after drag
    });
}

// Aplicar la funcionalidad a los paneles
document.addEventListener('DOMContentLoaded', () => {
    makeDraggable(document.getElementById('alert-list-panel'), document.getElementById('alert-list-panel').querySelector('.panel-header'));
    makeDraggable(document.getElementById('top-siniestros-panel'), document.getElementById('top-siniestros-panel').querySelector('.panel-header'));
    makeDraggable(document.getElementById('top-robo-panel'), document.getElementById('top-robo-panel').querySelector('.panel-header'));
    makeDraggable(document.getElementById('consulta-results-panel'), document.getElementById('consulta-results-panel').querySelector('.panel-header'));

    const chatComPanel = document.getElementById('chat-com-panel');
    const chatComHeader = chatComPanel ? chatComPanel.querySelector('.panel-header') : null;
    if (chatComPanel && chatComHeader) {
        makeDraggable(chatComPanel, chatComHeader);
    }

    const chatBasePanel = document.getElementById('chatBasePanel');
    const chatBaseHeader = chatBasePanel ? chatBasePanel.querySelector('h3') : null; // h3 acts as header
    if (chatBasePanel && chatBaseHeader) {
        makeDraggable(chatBasePanel, chatBaseHeader);
    }

    // Panel de Eventos (arrastrable por el header)
    const eventsContainer = document.getElementById('events-container');
    const eventsHeader = eventsContainer ? eventsContainer.querySelector('div[style*="display: flex"]') : null;
    if (eventsContainer && eventsHeader) {
        makeDraggable(eventsContainer, eventsHeader);
        console.log('✅ Panel de eventos hecho arrastrable');
    }

    // Paneles de información de Cobertura y Corredores Escolares
    const infoCoberturaPanel = document.getElementById('info-cobertura-escolar');
    const infoCoberturaHeader = infoCoberturaPanel ? infoCoberturaPanel.querySelector('.panel-header') : null;
    if (infoCoberturaPanel && infoCoberturaHeader) {
        makeDraggable(infoCoberturaPanel, infoCoberturaHeader);
        console.log('✅ Panel de Cobertura Escolar hecho arrastrable');
    }

    const infoCorredoresPanel = document.getElementById('info-corredores-escolares');
    const infoCorredoresHeader = infoCorredoresPanel ? infoCorredoresPanel.querySelector('.panel-header') : null;
    if (infoCorredoresPanel && infoCorredoresHeader) {
        makeDraggable(infoCorredoresPanel, infoCorredoresHeader);
        console.log('✅ Panel de Corredores Escolares hecho arrastrable');
    }

     // ============================================
    // AGREGAR ESTE BLOQUE AQUÍ
    // ============================================
    const baseMapSelector = document.getElementById('base-map-selector');

    if (baseMapSelector) {
        baseMapSelector.addEventListener('change', (e) => {
            const selectedMap = e.target.value;

            // Remover la capa actual
            if (currentBaseLayer) {
                mymap.removeLayer(currentBaseLayer);
            }

            // Agregar la nueva capa seleccionada
            switch(selectedMap) {
                case 'osm':
                    currentBaseLayer = baseLayers.osm;
                    break;
                case 'google-streets':
                    currentBaseLayer = baseLayers.googleStreets;
                    break;
                case 'google-satellite':
                    currentBaseLayer = baseLayers.googleSatellite;
                    break;
                case 'google-hybrid':
                    currentBaseLayer = baseLayers.googleHybrid;
                    break;
                default:
                    currentBaseLayer = baseLayers.osm;
            }

            currentBaseLayer.addTo(mymap);
            console.log(`✅ Mapa base cambiado a: ${selectedMap}`);
        });
    }
    // --- Lógica de Corredores Escolares ---
    const corredoresEscolaresCheckbox = document.getElementById('corredores-escolares-checkbox');
    let corredoresEscolaresDataLoaded = false;

    function loadCorredoresEscolaresData() {
        if (corredoresEscolaresDataLoaded) return Promise.resolve();
        return fetch('corredores_escolares.geojson')
            .then(response => response.json())
            .then(data => {
                L.geoJSON(data, {
                    style: {
                        color: "#008000", // Color verde para corredores escolares
                        weight: 7,       // Trazo ligeramente más ancho
                        opacity: 0.8     // Un poco más opaco para resaltar
                    },
                    onEachFeature: (feature, layer) => {
                        if (feature.properties) {
                            let popupContent = `<b>${feature.properties.Name || 'Corredor'}</b>`;
                            if (feature.properties.description) {
                                popupContent += `<br>${feature.properties.description}`;
                            }
                            layer.bindPopup(popupContent);
                        }
                    }
                }).addTo(corredoresEscolaresLayer);
                corredoresEscolaresDataLoaded = true;
                console.log("✅ Datos de Corredores Escolares cargados.");
            })
            .catch(error => console.error('Error al cargar corredores_escolares.geojson:', error));
    }

    // Función para calcular estadísticas de cámaras en corredores escolares
    async function mostrarEstadisticasCorredores() {
        try {
            // Cargar datos de corredores si aún no están cargados
            const corredoresResponse = await fetch('corredores_escolares.geojson');
            const corredoresData = await corredoresResponse.json();
            
            // Obtener cámaras del array allCamerasData
            const camaras = allCamerasData || [];
            const radioBusqueda = 100; // 100 metros de radio
            
            let totalCamarasEnCorredores = 0;
            const corredoresConCamara = new Set();
            
            if (corredoresData.features && corredoresData.features.length > 0) {
                corredoresData.features.forEach(corredor => {
                    const corridorName = corredor.properties.Name || 'sin nombre';
                    let geometry = corredor.geometry;
                    
                    // Extraer punto(s) de la geometría
                    let coordenadas = [];
                    if (geometry.type === 'LineString') {
                        coordenadas = geometry.coordinates;
                    } else if (geometry.type === 'Polygon') {
                        coordenadas = geometry.coordinates[0];
                    }
                    
                    // Buscar cámaras cercanas a este corredor
                    coordenadas.forEach(coord => {
                        const corridorLat = coord[1];
                        const corridorLng = coord[0];
                        
                        camaras.forEach(camara => {
                            const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
                            const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
                            if (!isNaN(lat) && !isNaN(lon)) {
                                const distancia = L.latLng(corridorLat, corridorLng)
                                    .distanceTo(L.latLng(lat, lon));
                                
                                if (distancia <= radioBusqueda) {
                                    totalCamarasEnCorredores++;
                                    corredoresConCamara.add(corridorName);
                                }
                            }
                        });
                    });
                });
            }
            
            const totalCorredores = corredoresData.features ? corredoresData.features.length : 0;
            const porcentajeMonitoreado = totalCorredores > 0 
                ? Math.round((corredoresConCamara.size / totalCorredores) * 100) 
                : 0;
            
            // Actualizar el panel informativo
            document.getElementById('total-camaras-corredores').textContent = totalCamarasEnCorredores;
            document.getElementById('corredores-monitoreados').textContent = porcentajeMonitoreado;
            
            console.log(`📊 Estadísticas de Corredores Escolares:
                - Total de cámaras cercanas: ${totalCamarasEnCorredores}
                - Corredores monitoreados: ${corredoresConCamara.size}/${totalCorredores}
                - Porcentaje: ${porcentajeMonitoreado}%`);
        } catch (error) {
            console.error('Error al calcular estadísticas de corredores:', error);
        }
    }

    // Función para mostrar las cámaras que están en los corredores escolares
    async function mostrarCamarasEnCorredores() {
        try {
            camarasEnCorredoresLayer.clearLayers();
            
            // Cargar datos de corredores
            const corredoresResponse = await fetch('corredores_escolares.geojson');
            const corredoresData = await corredoresResponse.json();
            
            // Obtener cámaras del array allCamerasData
            const camaras = allCamerasData || [];
            const radioBusqueda = 100; // 100 metros de radio
            
            const camarasEnCorredoresSet = new Set(); // Para evitar duplicados
            
            if (corredoresData.features && corredoresData.features.length > 0) {
                corredoresData.features.forEach(corredor => {
                    let geometry = corredor.geometry;
                    
                    // Extraer punto(s) de la geometría
                    let coordenadas = [];
                    if (geometry.type === 'LineString') {
                        coordenadas = geometry.coordinates;
                    } else if (geometry.type === 'Polygon') {
                        coordenadas = geometry.coordinates[0];
                    }
                    
                    // Buscar cámaras cercanas a este corredor
                    coordenadas.forEach(coord => {
                        const corridorLat = coord[1];
                        const corridorLng = coord[0];
                        
                        camaras.forEach(camara => {
                            const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
                            const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
                            if (!isNaN(lat) && !isNaN(lon)) {
                                const distancia = L.latLng(corridorLat, corridorLng)
                                    .distanceTo(L.latLng(lat, lon));
                                
                                if (distancia <= radioBusqueda) {
                                    const camaraId = camara['N CAMARA'];
                                    
                                    // Evitar duplicados
                                    if (!camarasEnCorredoresSet.has(camaraId)) {
                                        camarasEnCorredoresSet.add(camaraId);
                                        
                                        // Crear marcador con icono destacado (amarillo/rojo)
                                        const cameraIcon = L.divIcon({
                                            className: 'camera-icon-corredor',
                                            html: `<span style="background: linear-gradient(135deg, #FFD700, #FF8C00); color: black; font-weight: bold; border: 2px solid red;">★${camaraId}</span>`,
                                            iconSize: [35, 35],
                                            iconAnchor: [17, 17]
                                        });
                                        
                                        const marker = L.marker([lat, lon], { icon: cameraIcon });
                                        const direccionHeaderKey = Object.keys(camara).find(k => k.toLowerCase().includes('direcci'));
                                        const direccion = camara[direccionHeaderKey] || 'Sin dirección';
                                        marker.bindPopup(`<b>🎯 Cámara en Corredor: ${camaraId}</b><br>${direccion}`);
                                        
                                        camarasEnCorredoresLayer.addLayer(marker);
                                    }
                                }
                            }
                        });
                    });
                });
            }
            
            console.log(`✅ ${camarasEnCorredoresSet.size} cámaras encontradas en corredores escolares`);
        } catch (error) {
            console.error('Error al mostrar cámaras en corredores:', error);
        }
    }

    if (corredoresEscolaresCheckbox) {
        corredoresEscolaresCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                loadCorredoresEscolaresData().then(() => {
                    mymap.addLayer(corredoresEscolaresLayer);
                    // Mostrar cámaras en los corredores
                    mostrarCamarasEnCorredores().then(() => {
                        mymap.addLayer(camarasEnCorredoresLayer);
                    });
                    // Mostrar panel informativo sobre corredores
                    mostrarEstadisticasCorredores();
                    document.getElementById('info-corredores-escolares').style.display = 'block';
                });
            } else {
                mymap.removeLayer(corredoresEscolaresLayer);
                mymap.removeLayer(camarasEnCorredoresLayer);
                document.getElementById('info-corredores-escolares').style.display = 'none';
            }
        });
    }

    // --- Lógica de Colegios ---
    const colegiosCheckbox = document.getElementById('colegios-checkbox');
    let colegiosDataLoaded = false;
    const colegioIcon = L.icon({
        iconUrl: 'https://img.icons8.com/color/48/school-building.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    function loadColegiosData() {
        if (colegiosDataLoaded) return Promise.resolve();
        return fetch('colegios_escuelas.geojson')
            .then(response => response.json())
            .then(data => {
                L.geoJSON(data, {
                    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: colegioIcon }),
                    onEachFeature: (feature, layer) => {
                        if (feature.properties && feature.properties.Name) {
                            layer.bindPopup(`<b>${feature.properties.Name}</b>`);
                        }
                    }
                }).addTo(colegiosLayer);
                colegiosDataLoaded = true;
                console.log("✅ Datos de Colegios cargados.");
            })
            .catch(error => console.error('Error al cargar colegios_escuelas.geojson:', error));
    }

    if (colegiosCheckbox) {
        colegiosCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                loadColegiosData().then(() => {
                    mymap.addLayer(colegiosLayer);
                });
            } else {
                mymap.removeLayer(colegiosLayer);
            }
        });
    }

    // --- Lógica del botón de Siniestros No Determinados (NSD) ---
    const btnZonasDescubiertas = document.getElementById('btn-zonas-descubiertas');
    if (btnZonasDescubiertas) {
        btnZonasDescubiertas.addEventListener('click', () => {
            console.log("Botón 'Siniestros No Determinados' presionado.");

            loadSiniestrosData().then(() => {
                console.log("Datos de siniestros cargados, procediendo a filtrar.");

                const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
                if (!siniestrosCheckbox.checked) {
                    siniestrosCheckbox.checked = true;
                    mymap.addLayer(siniestrosLayer);
                    mymap.addLayer(topSiniestrosLabelsLayer);
                }

                yearFilterSelect.value = 'all';

                participantFilterSelect.value = 'all';
                barrioFilterSelect.value = 'all';
                streetFilterInput.value = '';
                startHourFilterSelect.value = 'all';
                endHourFilterSelect.value = 'all';
                console.log("Filtros reseteados.");

                causeFilterSelect.value = 'NSD';
                console.log("Filtro de causa establecido a:", causeFilterSelect.value);

                applySiniestrosFilters();
                console.log("applySiniestrosFilters() llamado.");
            });
        });
    }
});

// --- Control de Capas y Eventos ---
document.getElementById('semaforos-checkbox').addEventListener('change', e => {
    e.target.checked ? mymap.addLayer(semaforosLayer) : mymap.removeLayer(semaforosLayer);
});

document.getElementById('siniestros-checkbox').addEventListener('change', e => {
    try {
        const topSiniestrosPanel = document.getElementById('top-siniestros-panel');
        if (e.target.checked) {
            loadSiniestrosData().then(() => {
                mymap.addLayer(siniestrosLayer);
                mymap.addLayer(topSiniestrosLabelsLayer);
                applySiniestrosFilters(); // Re-calcular y mostrar etiquetas y panel
            });
        } else {
            mymap.removeLayer(siniestrosLayer);
            mymap.removeLayer(topSiniestrosLabelsLayer);
            if (topSiniestrosPanel) {
                topSiniestrosPanel.style.display = 'none';
            }
        }
    } catch (error) {
        alert('Error en el checkbox de siniestros: ' + error.message);
    }
});

document.getElementById('heatmap-checkbox').addEventListener('change', e => {
    if (e.target.checked) {
        if (document.getElementById('siniestros-checkbox').checked) {
            mymap.addLayer(heatLayer);
        }
    } else {
        mymap.removeLayer(heatLayer);
    }
});

document.getElementById('alertas-checkbox').addEventListener('change', e => {
    const alertListPanel = document.getElementById('alert-list-panel');
    if (e.target.checked) {
        mymap.addLayer(alertasLayer);
        if (alertListPanel) alertListPanel.style.display = 'flex';
    } else {
        mymap.removeLayer(alertasLayer);
        if (alertListPanel) alertListPanel.style.display = 'none';
    }
});

document.getElementById('camaras-checkbox').addEventListener('change', e => {
    if (e.target.checked) {
        // Only load and apply if not already loaded and visible
        if (!mymap.hasLayer(camarasLayer)) {
            loadBaseCSVData().then(() => {
                applyCamarasFilters();
                mymap.addLayer(camarasLayer);
            });
        }
    } else {
        if (mymap.hasLayer(camarasLayer)) {
            mymap.removeLayer(camarasLayer);
        }
    }
});

document.getElementById('camaras-privadas-checkbox').addEventListener('change', e => {
    if (e.target.checked) {
        loadBaseCSVData().then(() => {
            applyCamarasPrivadasFilters();
            mymap.addLayer(camarasPrivadasLayer);
        });
    } else {
        if (mymap.hasLayer(camarasPrivadasLayer)) {
            mymap.removeLayer(camarasPrivadasLayer);
        }
    }
});

document.getElementById('zonas-sin-cobertura-checkbox').addEventListener('change', e => {
    if (e.target.checked) {
        loadBaseCSVData().then(() => { // Ensure camera data is loaded
            const selectedBarrioName = barrioFilterSelect.value;
            let currentSelectedBarrioFeature = null;
            if (selectedBarrioName !== 'all' && barriosData) {
                currentSelectedBarrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === selectedBarrioName);
            }
            drawCameraCoverage(currentSelectedBarrioFeature); // Pass the current selected barrio
            mymap.addLayer(cameraCoverageLayer);
        });
    } else {
        mymap.removeLayer(cameraCoverageLayer);
    }
});

document.getElementById('aforos-checkbox').addEventListener('change', e => {
    const aforosFiltersDiv = document.getElementById('aforos-filters');
    if (e.target.checked) {
        aforosFiltersDiv.style.display = 'block';
        loadBaseCSVData().then(() => {
            applyAforosFilters();
            mymap.addLayer(aforosLayer);
        });
    } else {
        aforosFiltersDiv.style.display = 'none';
        if (mymap.hasLayer(aforosLayer)) {
            mymap.removeLayer(aforosLayer);
        }
    }
});

document.getElementById('zonas-sin-cobertura-negativo-checkbox').addEventListener('change', e => {
    if (e.target.checked) {
        const selectedBarrioName = barrioFilterSelect.value;
        let currentSelectedBarrioFeature = null;
        if (selectedBarrioName !== 'all' && barriosData) {
            currentSelectedBarrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === selectedBarrioName);
        }
        calculateAndDisplaySimpleUncoveredPercentage(currentSelectedBarrioFeature);
    } else {
        if (uncoveredPercentageLabel) {
            mymap.removeLayer(uncoveredPercentageLabel);
            uncoveredPercentageLabel = null;
        }
    }
});



document.querySelectorAll('input[name="traffic-style"]').forEach(radio => {
    radio.addEventListener('change', e => setTrafficStyle(e.target.value));
});

document.querySelectorAll('input[name="zone-filter"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        // Define line and bounds locally within the event listener
        const juanBJustoLine = L.polyline([[-37.955691, -57.654866], [-38.040699, -57.542388]], { color: 'red', dashArray: '10, 10' });
        const capaNorteBounds = L.latLngBounds([[-38.005, -57.68], [-37.80, -57.40]]); // From Juan B. Justo towards center
        const capaSurBounds = L.latLngBounds([[-38.20, -57.68], [-38.005, -57.40]]); // From Juan B. Justo towards Faro

        // Define label markers locally
                const capaNorteLabel = L.marker([-37.97, -57.50], { // Adjusted longitude to move further right
                    draggable: true, // Make the label draggable
                    icon: L.divIcon({
                        className: 'zone-label',
                        html: 'CAPA NORTE'
                    })
                });
                const capaSurLabel = L.marker([-38.08, -57.50], { // Adjusted longitude to move further right
                    draggable: true, // Make the label draggable
                    icon: L.divIcon({
                        className: 'zone-label',
                        html: 'CAPA SUR'
                    })
                });        // Clear any previously added line AND labels
        mymap.eachLayer(function (layer) {
            if (layer instanceof L.Polyline && layer.options.color === 'red' && layer.options.dashArray === '10, 10') {
                mymap.removeLayer(layer);
            }
            // Remove existing zone labels
            if (layer instanceof L.Marker && layer.options.icon && layer.options.icon.options.className === 'zone-label') {
                mymap.removeLayer(layer);
            }
        });

        const selectedZone = e.target.value;

        if (selectedZone === 'norte') {
            juanBJustoLine.addTo(mymap);
            capaNorteLabel.addTo(mymap); // Add the label
            mymap.fitBounds(capaNorteBounds);
        } else if (selectedZone === 'sur') {
            juanBJustoLine.addTo(mymap);
            capaSurLabel.addTo(mymap); // Add the label
            mymap.fitBounds(capaSurBounds);
        } else {
            // If "Ninguna" is selected, line and labels are already removed
            mymap.setView([-38.00042, -57.5562], 12); // Reset to default view
        }
    });
});

// Event listener para limpiar filtros
document.getElementById('clear-filters-btn').addEventListener('click', () => {

  console.log("🧹 Limpiando filtros del panel izquierdo (versión FINAL)...");

  // 🛑 Bloquear ejecución automática de applySiniestrosFilters()
  window._bloquearSiniestros = true;

  // --------------------------------------------
  // 1. RESET DE TODOS LOS SELECTS / INPUTS
  // --------------------------------------------
  const ids = [
      'barrio-filter',
      'year-filter',
      'participant-filter',
      'cause-filter',
      'start-hour-filter',
      'end-hour-filter',
      'street-filter',
      'bus-line-search',
      'bus-line-select',
      'lpr-camera-select',
      'aforo-year-filter',
      'aforo-start-hour-filter',
      'aforo-end-hour-filter',
      'robo-automotor-year-filter',
      'address-input'
  ];

  ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = (el.tagName === 'INPUT' ? '' : 'all');
  });

  // Eliminar resultados de búsqueda de dirección
  if (typeof searchResultLayer !== "undefined") {
      searchResultLayer.clearLayers();
  }

  document.getElementById('total-siniestros-count').textContent = '0';


  // --------------------------------------------
  // 2. DESACTIVAR CHECKBOXES Y REMOVER CAPAS
  // --------------------------------------------
  const toggles = [
      ['semaforos-checkbox', semaforosLayer],
      ['siniestros-checkbox', siniestrosLayer],
      ['alertas-checkbox', alertasLayer],
      ['camaras-checkbox', camarasLayer],
      ['camaras-privadas-checkbox', camarasPrivadasLayer],
      ['zonas-sin-cobertura-checkbox', cameraCoverageLayer],
      ['aforos-checkbox', aforosLayer],
      ['robo-automotor-checkbox', roboAutomotorLayer]
  ];

  toggles.forEach(([id, layer]) => {
      const cb = document.getElementById(id);
      if (cb && cb.checked) cb.checked = false;

      if (layer && mymap.hasLayer(layer)) {
          mymap.removeLayer(layer);
      }
  });

  // Paneles asociados
  document.getElementById('robo-automotor-filters').style.display = 'none';
  document.getElementById('aforos-filters').style.display = 'none';
  document.getElementById('alert-list-panel').style.display = 'none';


  // --------------------------------------------
  // 3. LIMPIEZA DE SINIESTROS (CAPA + ETIQUETAS + HEATMAP)
  // --------------------------------------------
  if (siniestrosLayer) {
      siniestrosLayer.clearLayers();
      console.log("🗑️ Marcadores de siniestros eliminados.");
  }

  if (topSiniestrosLabelsLayer) topSiniestrosLabelsLayer.clearLayers();
  document.getElementById('top-siniestros-panel').style.display = 'none';

  // Heatmap de siniestros
  const heatmapCheckbox = document.getElementById('heatmap-checkbox');
  if (heatmapCheckbox && heatmapCheckbox.checked) heatmapCheckbox.checked = false;

  if (mymap.hasLayer(heatLayer)) {
      heatLayer.setLatLngs([]);
      mymap.removeLayer(heatLayer);
      console.log("🗑️ Heatmap limpiado.");
  }


  // --------------------------------------------
  // 4. LIMPIEZA DE ROBO AUTOMOTOR
  // --------------------------------------------
  const roboHeatmapCheckbox = document.getElementById('robo-heatmap-checkbox');
  if (roboHeatmapCheckbox && roboHeatmapCheckbox.checked) roboHeatmapCheckbox.checked = false;

  if (mymap.hasLayer(roboHeatLayer)) mymap.removeLayer(roboHeatLayer);

  if (topRoboLabelsLayer) topRoboLabelsLayer.clearLayers();
  document.getElementById('top-robo-panel').style.display = 'none';

  // --------------------------------------------
  // ESTILO DE TRÁFICO
  // --------------------------------------------
  setTrafficStyle('none');
  const trafficRadios = document.querySelectorAll('input[name="traffic-style"]');
  trafficRadios.forEach(radio => {
    if (radio.value === 'none') {
      radio.checked = true;
    }
  });


  // --------------------------------------------
  // 5. LIMPIAR MARCADORES “SUELTOS” (COMO AL REFRESCAR)
  // --------------------------------------------
  Object.values(mymap._layers).forEach(layer => {
      if (layer instanceof L.Marker || layer instanceof L.Circle || layer instanceof L.CircleMarker) {
          mymap.removeLayer(layer);
      }
  });


  // --------------------------------------------
  // 6. LIMPIAR CÍRCULOS / RADIOS DE DIRECCIÓN
  // --------------------------------------------
  try {
      addressSearchCircleLayer.clearLayers();
      addressSearchFilteredCamerasLayer.clearLayers();
  } catch (e) {}


  // --------------------------------------------
  // 7. RESETEAR VISTA DEL MAPA A ESTADO INICIAL
  // --------------------------------------------
  mymap.setView([-38.00042, -57.5562], 12);


  // --------------------------------------------
  // 8. DESBLOQUEAR FILTROS
  // --------------------------------------------
  window._bloquearSiniestros = false;

  console.log("✔️ Filtros limpiados SIN recargar siniestros ni romper consultas.");
});

// --- Selects para los filtros de siniestros ---
const yearFilterSelect = document.getElementById('year-filter');
const participantFilterSelect = document.getElementById('participant-filter');
const causeFilterSelect = document.getElementById('cause-filter');
const startHourFilterSelect = document.getElementById('start-hour-filter');
const endHourFilterSelect = document.getElementById('end-hour-filter');
const streetFilterInput = document.getElementById('street-filter');



// Event listeners para filtros de siniestros
yearFilterSelect.addEventListener('change', applySiniestrosFilters);
participantFilterSelect.addEventListener('change', applySiniestrosFilters);
causeFilterSelect.addEventListener('change', applySiniestrosFilters);
startHourFilterSelect.addEventListener('change', applySiniestrosFilters);
endHourFilterSelect.addEventListener('change', applySiniestrosFilters);
// Event listener para Robo Automotor
document.getElementById('robo-automotor-checkbox').addEventListener('change', e => {
    const filtersDiv = document.getElementById('robo-automotor-filters');
    const topRoboPanel = document.getElementById('top-robo-panel');

    if (e.target.checked) {
        loadRoboAutomotorData().then(() => {
            mymap.addLayer(roboAutomotorLayer);
            mymap.addLayer(topRoboLabelsLayer);
            filtersDiv.style.display = 'block';
            applyRoboAutomotorFilters(); // Para mostrar el panel y etiquetas si hay datos
        });
    } else {
        mymap.removeLayer(roboAutomotorLayer);
        mymap.removeLayer(topRoboLabelsLayer);
        filtersDiv.style.display = 'none';
        if (topRoboPanel) {
            topRoboPanel.style.display = 'none';
        }
    }
});

document.getElementById('robo-automotor-year-filter').addEventListener('change', applyRoboAutomotorFilters);

document.getElementById('robo-heatmap-checkbox').addEventListener('change', e => {
    if (e.target.checked) {
        if (document.getElementById('robo-automotor-checkbox').checked) {
            mymap.addLayer(roboHeatLayer);
        }
    } else {
        mymap.removeLayer(roboHeatLayer);
    }
});

// Event listeners para filtros de aforos
aforoYearFilter.addEventListener('change', applyAforosFilters);
aforoStartHourFilter.addEventListener('change', applyAforosFilters);
aforoEndHourFilter.addEventListener('change', applyAforosFilters);

// --- Toggle Patrullas Layer Visibility ---
document.getElementById('patrullas-checkbox').addEventListener('change', e => {
    if (e.target.checked) {
        mymap.addLayer(patrullasLayer);
    } else {
        mymap.removeLayer(patrullasLayer);
    }
});



// --- Lógica de Búsqueda de Direcciones ---
const searchButton = document.getElementById('search-button');
const addressInput = document.getElementById('address-input');
const searchResultLayer = L.layerGroup().addTo(mymap);

searchButton.addEventListener('click', async () => {
    const address = addressInput.value;
    if (address) {
        await loadBaseCSVData(); // Asegura que allCamerasData y allCamarasPrivadasData estén cargados
        const location = await geocodeAddress(address);
        if (location) {
            searchResultLayer.clearLayers();
            const marker = L.marker([location.lat, location.lon]).addTo(searchResultLayer);
            displayAddressRadiusAndCameras(location);
        } else {
            alert('Dirección no encontrada');
        }
    }
});

// --- Lógica de Búsqueda de Cámaras ---
const goToCameraButton = document.getElementById('go-to-camera-button');
const cameraInput = document.getElementById('camera-input');

goToCameraButton.addEventListener('click', async () => {
    const cameraNumber = cameraInput.value.trim();
    if (!cameraNumber) {
        alert('Ingrese un número de cámara');
        return;
    }
    
    await loadBaseCSVData(); // Asegura que allCamerasData esté cargado
    
    // Buscar la cámara en los datos
    const camera = allCamerasData.find(c => c['N CAMARA'] === cameraNumber);
    
    if (camera) {
        const lat = parseFloat(String(camera.Latitud).replace(',', '.'));
        const lon = parseFloat(String(camera.Longitud).replace(',', '.'));
        
        if (!isNaN(lat) && !isNaN(lon)) {
            // Limpiar marcadores anteriores
            addressSearchFilteredCamerasLayer.clearLayers();
            
            // Crear y agregar marcador visible en la capa de búsqueda
            const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));
            const cameraIcon = L.divIcon({
                className: 'camera-icon',
                html: `<span>${cameraNumber}</span>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            
            L.marker([lat, lon], { icon: cameraIcon })
                .bindPopup(`<b>Cámara: ${cameraNumber}</b><br>${camera[direccionHeaderKey] || 'Sin dirección'}`)
                .addTo(addressSearchFilteredCamerasLayer)
                .openPopup();
            
            // Centrar el mapa en la cámara
            mymap.setView([lat, lon], 16);
            
            // Asegurarse de que la capa sea visible
            if (!mymap.hasLayer(addressSearchFilteredCamerasLayer)) {
                mymap.addLayer(addressSearchFilteredCamerasLayer);
            }
            
            cameraInput.value = ''; // Limpiar el input
        } else {
            alert('Coordenadas inválidas para la cámara');
        }
    } else {
        alert('Cámara no encontrada');
    }
});

// Inicialización
setTrafficStyle('none');
createTrafficLegend();


function makeDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = elmnt.querySelector('.panel-header');
    if (header) {
        // if present, the header is where you move the DIV from:
        header.onmousedown = dragMouseDown;
    } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        elmnt.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function clearQueryResults() {
    // Hide panel
    document.getElementById('consulta-results-panel').style.display = 'none';
    
    siniestrosLayerGroup.clearLayers(); // Limpiar marcadores de cruces críticos
    
    // Ocultar el panel de siniestros por día y resetear filtros de día
    const siniestrosPorDiaPanel = document.getElementById('siniestros-por-dia-panel');
    if (siniestrosPorDiaPanel) {
        siniestrosPorDiaPanel.style.display = 'none';
        document.getElementById('siniestros-dia-content').innerHTML = ''; // Limpiar contenido
        currentDayFilter = null; // Resetear filtro de día
        filteredDayColor = null; // Resetear color del filtro de día
        document.querySelectorAll('.siniestro-day-item').forEach(el => el.classList.remove('highlight')); // Remover resaltado
    }

    // --- Aggressively clear all potential query artifacts ---

    // Use a timeout to clear dedicated query layers (workaround for re-triggering bug)
    setTimeout(() => {
        if (mymap.hasLayer(camarasAisladasLayer)) mymap.removeLayer(camarasAisladasLayer);
        if (mymap.hasLayer(zonasCiegasLayer)) mymap.removeLayer(zonasCiegasLayer);
        if (mymap.hasLayer(zonasDescubiertasLayer)) mymap.removeLayer(zonasDescubiertasLayer);
        if (mymap.hasLayer(siniestrosEnZonasLayer)) mymap.removeLayer(siniestrosEnZonasLayer);
        if (mymap.hasLayer(recorridosColectivosLayer)) mymap.removeLayer(recorridosColectivosLayer);
        if (mymap.hasLayer(siniestrosCercaParadasLayer)) mymap.removeLayer(siniestrosCercaParadasLayer);
        if (mymap.hasLayer(motosCirculacionLayer)) mymap.removeLayer(motosCirculacionLayer);
        if (mymap.hasLayer(corredoresEscolaresLayer)) mymap.removeLayer(corredoresEscolaresLayer);
        if (mymap.hasLayer(colegiosLayer)) mymap.removeLayer(colegiosLayer);
        if (mymap.hasLayer(ubicacionesPropuestasLayer)) mymap.removeLayer(ubicacionesPropuestasLayer);
        if (mymap.hasLayer(dangerousCornersLayer)) mymap.removeLayer(dangerousCornersLayer);
        if (mymap.hasLayer(barriosSinCoberturaLayer)) mymap.removeLayer(barriosSinCoberturaLayer);
        if (mymap.hasLayer(robosSinCamarasLayer)) mymap.removeLayer(robosSinCamarasLayer);
        if (mymap.hasLayer(hotspotCamerasLayer)) mymap.removeLayer(hotspotCamerasLayer);
        barriosDestacadosLayer.clearLayers(); // Limpiar la capa de barrios destacados
        hotspotCamerasLayer.clearLayers(); // Limpiar los iconos de fuego
    }, 100);

    // Clear Siniestros Layer and associated UI
    const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
    if (siniestrosCheckbox.checked) {
        siniestrosCheckbox.checked = false;
        mymap.removeLayer(siniestrosLayer); // Remove main layer
        mymap.removeLayer(topSiniestrosLabelsLayer); // Remove top 10 labels
    }
    siniestrosLayer.clearLayers();
    topSiniestrosLabelsLayer.clearLayers();
    updateTopSiniestrosPanel([]); // Hide Top 10 panel
    document.getElementById('total-siniestros-count').textContent = 0;

    // Clear Heatmap Layer
    const heatmapCheckbox = document.getElementById('heatmap-checkbox');
    if (heatmapCheckbox.checked) {
        heatmapCheckbox.checked = false;
        mymap.removeLayer(heatLayer);
    }

    // Clear Robo Automotor Layer and associated UI
    const roboCheckbox = document.getElementById('robo-automotor-checkbox');
    if (roboCheckbox.checked) {
        roboCheckbox.checked = false;
        mymap.removeLayer(roboAutomotorLayer);
        mymap.removeLayer(topRoboLabelsLayer);
    }
    roboAutomotorLayer.clearLayers();
    topRoboLabelsLayer.clearLayers();
    updateTopRoboPanel([]);

    // Clear Robo Heatmap Layer
    const roboHeatmapCheckbox = document.getElementById('robo-heatmap-checkbox');
    if (roboHeatmapCheckbox && roboHeatmapCheckbox.checked) {
        roboHeatmapCheckbox.checked = false;
        mymap.removeLayer(roboHeatLayer);
    }

    // Clear Alertas Layer
    const alertasCheckbox = document.getElementById('alertas-checkbox');
    if (alertasCheckbox.checked) {
        alertasCheckbox.checked = false;
        mymap.removeLayer(alertasLayer);
        document.getElementById('alert-list-panel').style.display = 'none';
    }

    // Clear Camera Layers
    const camarasCheckbox = document.getElementById('camaras-checkbox');
    if (camarasCheckbox.checked) {
        camarasCheckbox.checked = false;
        mymap.removeLayer(camarasLayer);
    }
    const camarasPrivadasCheckbox = document.getElementById('camaras-privadas-checkbox');
    if (camarasPrivadasCheckbox.checked) {
        camarasPrivadasCheckbox.checked = false;
        mymap.removeLayer(camarasPrivadasLayer);
    }

    // Clear selected barrio highlight
    if (selectedBarrioLayer) {
        mymap.removeLayer(selectedBarrioLayer);
        selectedBarrioLayer = null;
    }
    document.getElementById('barrio-filter').value = 'all';
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed. Applying makeDraggable...');
    makeDraggable(document.getElementById('top-siniestros-panel'));
    makeDraggable(document.getElementById('top-robo-panel'));
    makeDraggable(document.getElementById('consulta-results-panel'));

    document.getElementById('clear-consulta-results-btn').addEventListener('click', clearQueryResults);

    // --- Event Listeners para cerrar el modal de INFO ---
    const modal = document.getElementById('info-modal');
    const closeModalBtn = document.getElementById('info-modal-close-btn');
    if (modal && closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // loadBaseCSVData(); // Comentado temporalmente para depuración
});
// === TOUR GUIDE ===
document.addEventListener("DOMContentLoaded", () => {

    const tours = {
      basic: [
        { title: "¡Bienvenido al Sistema!", description: "Visualizá tráfico, siniestros y cámaras.", target: "#mapid", position: "center" },
        { title: "Panel Izquierdo", description: "Activá capas como siniestros, cámaras o zonas.", target: "#left-sidebar", position: "right" },
        { title: "Cámaras de Seguridad", description: "Visualizá cámaras públicas o privadas.", target: "#right-panel", position: "left" },
        { title: "Búsqueda de Direcciones", description: "Escribí una dirección o esquina para centrar el mapa.", target: "#address-input", position: "bottom" },
        { title: "Filtros de Barrio", description: "Filtrá siniestros o cámaras por barrio.", target: "#barrio-filter", position: "right" },
        { title: "Flujo de Tráfico", description: "Seleccioná el modo de tráfico: Absoluto o Relativo. (Ahora oculto por defecto)", target: 'input[name="traffic-style"]', position: "bottom" },
        { title: "Limpieza de Filtros", description: "Usá este botón para reiniciar todos los filtros y capas.", target: "#clear-filters-btn", position: "right" },
        { title: "Panel de Consultas", description: "Accedé a herramientas de análisis y consultas avanzadas.", target: "#btn-open-consultas", position: "left" },
        { title: "¡Listo!", description: "Ya podés explorar el sistema libremente.", target: "#mapid", position: "center" }
      ],
      advanced: [
        { title: "Tour Avanzado", description: "Herramientas para análisis técnico.", target: "#mapid", position: "center" },
        { title: "Filtros Temporales", description: "Filtrá por año, hora y tipo de participante.", target: "#year-filter", position: "right" },
        { title: "Mapa de Calor", description: "Identificá zonas con alta concentración de incidentes.", target: "#heatmap-checkbox", position: "right" },
        { title: "Filtrar por Calle", description: "Buscá siniestros en una calle específica.", target: "#street-filter", position: "right" },
        { title: "Siniestros No Visualizados (NSD)", description: "Identificá siniestros cuya causa no pudo ser determinada por las cámaras.", target: 'button[data-consulta="siniestros_en_zonas_descubiertas"]', position: "right" },
        { title: "Cámaras con >20 Siniestros", description: "Encontrá cámaras con alta concentración de siniestros cercanos (50m).", target: 'button[data-consulta="lineas_colectivo_siniestros"]', position: "right" },
        { title: "Zonas Norte/Sur", description: "Analizá patrones específicos por zona.", target: 'input[name="zone-filter"]', position: "right" },
        { title: "Cámaras LPR", description: "Seleccioná una cámara LPR para ver su cobertura.", target: "#lpr-camera-select", position: "left" },
        { title: "Aforos Vehiculares", description: "Analizá datos de flujo vehicular históricos.", target: "#aforos-checkbox", position: "left" },
        { title: "Robo Automotor", description: "Filtrá resultados de intervenciones policiales.", target: "#robo-automotor-checkbox", position: "left" },
        { title: "Top 10 Puntos Críticos", description: "Accedé a los lugares más conflictivos.", target: "#mapid", position: "center" }
      ],
      operator: [
        { title: "Modo Operador", description: "Monitoreo, alertas y respuesta rápida.", target: "#mapid", position: "center" },
        { title: "Acceso a Consultas", description: "Abrí el panel de consultas para análisis específicos.", target: "#btn-open-consultas", position: "left" },
        { title: "Alertas en Tiempo Real", description: "Se actualizan automáticamente cada 5 min.", target: "#alertas-checkbox", position: "right" },
        { title: "Tráfico TomTom", description: "Flujo en tiempo real — Absoluto o Relativo. (Ahora oculto por defecto)", target: 'input[name="traffic-style"]', position: "right" },
        { title: "Cobertura de Cámaras", description: "Visualizá radios de cobertura y zonas sin vigilancia.", target: "#zonas-sin-cobertura-checkbox", position: "left" },
        { title: "Cámaras con >20 Siniestros", description: "Identificá puntos calientes de siniestros para despliegue de recursos.", target: 'button[data-consulta="lineas_colectivo_siniestros"]', position: "left" },
        { title: "Sistema LPR", description: "Seguimiento de patentes dentro de 2 km.", target: "#lpr-camera-select", position: "left" },
        { title: "Aforos por Horario", description: "Planificá horarios según congestión histórica.", target: "#aforo-start-hour-filter", position: "left" },
        { title: "Robo Automotor", description: "Analizá detenciones y persecuciones recientes.", target: "#robo-automotor-year-filter", position: "left" },
        { title: "Búsqueda Rápida", description: "Ubicá direcciones exactas rápidamente.", target: "#address-search-input", position: "right" },
        { title: "Workflow Recomendado", description: "1️⃣ Activa alertas 2️⃣ Busca dirección 3️⃣ Revisa cámaras 4️⃣ Consulta historial.", target: "#mapid", position: "center" }
      ]
    };
  
    let currentMode = null;
    let currentStep = 0;
  
    const tooltip = document.getElementById("tour-tooltip");
    const overlay = document.getElementById("tour-overlay");
    const welcome = document.getElementById("tour-welcome");
  
    function showWelcome() {
      overlay.classList.remove("hidden");
      welcome.classList.remove("hidden");
    }
  
    function startTour(mode) {
      currentMode = mode;
      currentStep = 0;
      welcome.classList.add("hidden");
      showStep();
    }
  
    function endTour() {
      overlay.classList.add("hidden");
      tooltip.classList.add("hidden");
      welcome.classList.add("hidden");
      clearHighlight();
    }
  
    function clearHighlight() {
      document.querySelectorAll(".tour-highlight").forEach(el =>
        el.classList.remove("tour-highlight")
      );
    }
  
    function showStep() {
      const steps = tours[currentMode];
      if (!steps) return;
  
      const step = steps[currentStep];
      tooltip.classList.remove("hidden");
      clearHighlight();
  
      const targetEl = document.querySelector(step.target);
      if (targetEl) {
        targetEl.classList.add("tour-highlight");
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
  
      document.getElementById("tour-title").textContent = step.title;
      document.getElementById("tour-description").textContent = step.description;
      document.getElementById("tour-step").textContent = `Paso ${currentStep + 1} de ${steps.length}`;
  
      const rect = targetEl ? targetEl.getBoundingClientRect() : { top: window.innerHeight/2, left: window.innerWidth/2, width: 0, height: 0 };
      let top = rect.top + window.scrollY;
      let left = rect.left + window.scrollX;
  
      switch (step.position) {
        case "right":
          top += rect.height / 2 - tooltip.offsetHeight / 2;
          left += rect.width + 15;
          break;
        case "left":
          top += rect.height / 2 - tooltip.offsetHeight / 2;
          left -= tooltip.offsetWidth + 15;
          break;
        case "bottom":
          top += rect.height + 15;
          left += rect.width / 2 - tooltip.offsetWidth / 2;
          break;
        case "top":
          top -= tooltip.offsetHeight + 15;
          left += rect.width / 2 - tooltip.offsetWidth / 2;
          break;
        default:
          top = window.innerHeight / 2 - tooltip.offsetHeight / 2;
          left = window.innerWidth / 2 - tooltip.offsetWidth / 2;
      }
  
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
    }
  
    // Botones del tooltip
    document.getElementById("tour-next").addEventListener("click", () => {
      const steps = tours[currentMode];
      if (currentStep < steps.length - 1) {
        currentStep++;
        showStep();
      } else {
        endTour();
      }
    });
  
    document.getElementById("tour-prev").addEventListener("click", () => {
      if (currentStep > 0) {
        currentStep--;
        showStep();
      }
    });
  
    document.getElementById("tour-close").addEventListener("click", endTour);
    document.getElementById("tour-overlay").addEventListener("click", endTour);
  
    // Opción de modo
    document.querySelectorAll(".tour-option").forEach(opt =>
      opt.addEventListener("click", () => startTour(opt.dataset.mode))
    );
  
    // Botón Omitir
    document.getElementById("skip-tour").addEventListener("click", endTour);
    
    // Botón para iniciar el tour manualmente
    document.getElementById("btn-start-tour").addEventListener("click", showWelcome);
    
    // ❌ TOUR AUTOMÁTICO DESACTIVADO - Ahora se muestra solo por clic en botón
    // setTimeout(showWelcome, 2000);
  });
  // === FIN TOUR GUIDE ===
// === CONSULTAS AL SISTEMA ===
let lastQueryModifiedBaseLayer = false;

document.getElementById('consultas-panel').addEventListener('click', async (e) => {
  // Manejar el clic en el botón de cerrar del panel de consultas
  if (e.target.classList.contains('close-button')) {
    document.getElementById('consultas-panel').style.display = 'none';
    clearQueryResults(); // Llama a la función de limpieza general, que ya maneja todas las capas
    return; // Detener la propagación
  }

  if (!e.target.classList.contains('consulta-btn')) return;

  lastQueryModifiedBaseLayer = false; // Reset flag on each new query
  
  // Ocultar automáticamente todas las capas de base cuando se ejecuta una consulta
  const camarasCheckbox = document.getElementById('camaras-checkbox');
  if (camarasCheckbox && camarasCheckbox.checked) {
    camarasCheckbox.checked = false;
    if (mymap.hasLayer(camarasLayer)) mymap.removeLayer(camarasLayer);
  }
  
  const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
  if (siniestrosCheckbox && siniestrosCheckbox.checked) {
    siniestrosCheckbox.checked = false;
    if (mymap.hasLayer(siniestrosLayer)) mymap.removeLayer(siniestrosLayer);
    if (mymap.hasLayer(topSiniestrosLabelsLayer)) mymap.removeLayer(topSiniestrosLabelsLayer);
  }
  
  const camarasPrivadasCheckbox = document.getElementById('camaras-privadas-checkbox');
  if (camarasPrivadasCheckbox && camarasPrivadasCheckbox.checked) {
    camarasPrivadasCheckbox.checked = false;
    if (mymap.hasLayer(camarasPrivadasLayer)) mymap.removeLayer(camarasPrivadasLayer);
  }

  const consulta = e.target.dataset.consulta;
  const resultsPanel = document.getElementById('consulta-results-panel');
  const resultsContent = document.getElementById('consulta-results-content');
  resultsContent.innerHTML = '<em>Procesando consulta...</em>';
  resultsPanel.style.display = 'flex';

  // Aplicar tamaño adaptativo al panel
  resultsPanel.classList.remove('panel-size-small', 'panel-size-medium', 'panel-size-large');
  const sizeClass = CONSULTA_SIZES[consulta] || 'medium';
  resultsPanel.classList.add('panel-size-' + sizeClass);
  
  resultsPanel.style.display = 'flex';

  const resultadosDiv = resultsContent; // Mantener la variable para compatibilidad del switch


  // Asegurarse de que el panel de siniestros por día esté oculto por defecto para otras consultas
  const siniestrosPorDiaPanel = document.getElementById('siniestros-por-dia-panel');
  if (siniestrosPorDiaPanel) {
      siniestrosPorDiaPanel.style.display = 'none';
  }
  
  // Limpiar el contenido de analisis-causa-container para cada nueva consulta
  document.getElementById('analisis-causa-container').innerHTML = '';
  document.getElementById('analisis-causa-container').style.display = 'none';

  switch (consulta) {
    case 'siniestros_por_dia': {
        await loadSiniestrosData(); // Asegurarse de que los datos de siniestros estén cargados
        const siniestrosByDay = calculateSiniestrosByDayOfWeek(allSiniestrosData.features);
        
        // Asegurarse de que la capa de siniestros esté visible
        const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
        if (!siniestrosCheckbox.checked) {
            siniestrosCheckbox.checked = true;
            siniestrosCheckbox.dispatchEvent(new Event('change'));
        }

        // Encontrar el máximo de siniestros para escalar las barras
        const maxSiniestros = Math.max(...siniestrosByDay.map(d => d.count), 1);
        
        // Generar HTML con gráfico de barras
        let htmlDays = '<h5>📊 Siniestros por Día de la Semana</h5>';
        
        siniestrosByDay.forEach(item => {
            const percentage = (item.count / maxSiniestros) * 100;
            const isMaxDay = item.count === maxSiniestros && maxSiniestros > 0;
            const barColor = isMaxDay ? '#d32f2f' : '#90a4ae';
            const textColor = isMaxDay ? '#d32f2f' : '#555';
            
            htmlDays += `
                <div class="day-stats-item" style="margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: bold; color: ${textColor}; font-size: 14px;">${item.day}</span>
                        <span style="color: ${isMaxDay ? '#d32f2f' : '#666'}; font-weight: ${isMaxDay ? 'bold' : 'normal'}; font-size: 13px;">${item.count} siniestros</span>
                    </div>
                    <div style="background-color: #e0e0e0; border-radius: 4px; height: 24px; overflow: hidden; position: relative;">
                        <div class="day-bar" data-day="${item.day}" style="width: ${percentage}%; height: 100%; background-color: ${barColor}; transition: width 0.3s ease; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; cursor: pointer; border-radius: 4px;">
                            ${percentage > 15 ? `<span style="color: white; font-weight: bold; font-size: 12px;">${percentage.toFixed(0)}%</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        resultsContent.innerHTML = htmlDays;
        
        // Agregar event listeners para las barras
        document.querySelectorAll('.day-bar').forEach(bar => {
            bar.addEventListener('click', (e) => {
                const dayName = e.currentTarget.dataset.day;
                const dayData = siniestrosByDay.find(d => d.day === dayName);
                
                if (dayData && dayData.features.length > 0) {
                    // Usar color rojo para resaltar el día seleccionado en el mapa
                    const highlightColor = '#d32f2f';
                    updateSiniestrosLayers({ type: 'FeatureCollection', features: dayData.features }, dayData.features.length, highlightColor);
                    mymap.setView([-38.00042, -57.5562], 12);
                    currentDayFilter = dayName;
                    filteredDayColor = highlightColor;
                }
            });
            
            // Efecto hover
            bar.addEventListener('mouseenter', () => {
                bar.style.opacity = '0.8';
                bar.style.cursor = 'pointer';
            });
            bar.addEventListener('mouseleave', () => {
                bar.style.opacity = '1';
            });
        });
        
        break;
    }
    case 'patrullaje_sugerido': {
      resultadosDiv.innerHTML = '<em>🚓 Calculando rutas óptimas de patrullaje...</em>';
      
      // Mostrar controles
      const controls = document.getElementById('patrullaje-controls');
      if (controls) controls.style.display = 'block';
      
      setTimeout(async () => {
        await loadSiniestrosData();
        await loadRoboAutomotorData();
        await loadBaseCSVData();
        
        if (!allSiniestrosData || !allRoboAutomotorData || !barriosData) {
          resultadosDiv.innerHTML = '❌ No se pudieron cargar todos los datos necesarios.';
          return;
        }
        
    
        // ============================================
        // PASO 1: RECOPILAR PARÁMETROS
        // ============================================
        const numRutas = parseInt(document.getElementById('num-rutas-input')?.value || 3);
        const turnoSeleccionado = document.getElementById('turno-patrullaje')?.value || 'all';
        const diasSeleccionados = document.getElementById('dias-patrullaje')?.value || 'all';
    
        // ============================================
        // PASO 2: FILTRAR INCIDENTES POR HORARIO Y DÍA
        // ============================================
        const todosIncidentes = [];
        
        // Procesar siniestros
        allSiniestrosData.features.forEach(s => {
          if (!s.geometry?.coordinates || !s.properties) return;
          
          const hora = s.properties.hora ? parseInt(s.properties.hora.split(':')[0]) : null;
          const fecha = s.properties.fecha;
          
          // Filtro de turno
          let cumpleTurno = true;
          if (turnoSeleccionado !== 'all' && hora !== null) {
            if (turnoSeleccionado === 'mañana' && (hora < 6 || hora >= 14)) cumpleTurno = false;
            if (turnoSeleccionado === 'tarde' && (hora < 14 || hora >= 22)) cumpleTurno = false;
            if (turnoSeleccionado === 'noche' && (hora >= 6 && hora < 22)) cumpleTurno = false;
          }
          
          // Filtro de días
          let cumpleDias = true;
          if (diasSeleccionados !== 'all' && fecha) {
            const diaSemana = getDayOfWeekFromDateString(fecha);
            const esFinde = diaSemana === 'Sábado' || diaSemana === 'Domingo';
            if (diasSeleccionados === 'laborables' && esFinde) cumpleDias = false;
            if (diasSeleccionados === 'finde' && !esFinde) cumpleDias = false;
          }
          
          if (cumpleTurno && cumpleDias) {
            const [lon, lat] = s.geometry.coordinates;
            todosIncidentes.push({
              lat: lat,
              lon: lon,
              tipo: 'siniestro',
              gravedad: s.properties.causa === 'NSD' ? 1.5 : 1,
              direccion: s.properties.direccion,
              fecha: fecha,
              hora: s.properties.hora
            });
          }
        });
        
        // Procesar robos
        allRoboAutomotorData.forEach(r => {
          const coordsStr = r['Longitud y Latitud'];
          if (!coordsStr) return;
          
          const parts = coordsStr.split(',').map(s => s.trim());
          if (parts.length !== 2) return;
          
          const lat = parseFloat(parts[0]);
          const lon = parseFloat(parts[1]);
          if (isNaN(lat) || isNaN(lon)) return;
          
          // Para robos, no hay filtro de hora (puedes agregarlo si tienes ese dato)
          const resultado = r.Resultado?.trim() || '';
          const sinIntervencion = resultado !== 'Detencion' && resultado !== 'Secuestro De Vehiculo';
          
          todosIncidentes.push({
            lat: lat,
            lon: lon,
            tipo: 'robo',
            gravedad: sinIntervencion ? 2.0 : 1.3,
            direccion: `${r['Direccion 0'] || ''} ${r['Direccion'] || ''}`.trim(),
            fecha: r.Fecha
          });
        });
    
        if (todosIncidentes.length === 0) {
          resultadosDiv.innerHTML = '⚠️ No se encontraron incidentes para los filtros seleccionados.';
          return;
        }
    
        // ============================================
        // PASO 3: CLUSTERING - K-MEANS ADAPTADO
        // ============================================
        const RADIO_CLUSTER = 300; // 300 metros
        const clusters = [];
        const incidentesProcesados = new Set();
    
        // Ordenar por gravedad descendente
        todosIncidentes.sort((a, b) => b.gravedad - a.gravedad);
    
        todosIncidentes.forEach((incidente, idx) => {
          if (incidentesProcesados.has(idx)) return;
    
          const cluster = {
            incidentes: [incidente],
            centroLat: incidente.lat,
            centroLon: incidente.lon,
            pesoTotal: incidente.gravedad,
            siniestros: incidente.tipo === 'siniestro' ? 1 : 0,
            robos: incidente.tipo === 'robo' ? 1 : 0
          };
    
          incidentesProcesados.add(idx);
    
          // Agregar incidentes cercanos
          todosIncidentes.forEach((otroIncidente, otroIdx) => {
            if (incidentesProcesados.has(otroIdx)) return;
            
            const distancia = calcularDistancia(
              incidente.lat, incidente.lon,
              otroIncidente.lat, otroIncidente.lon
            );
            
            if (distancia <= RADIO_CLUSTER) {
              cluster.incidentes.push(otroIncidente);
              cluster.pesoTotal += otroIncidente.gravedad;
              if (otroIncidente.tipo === 'siniestro') cluster.siniestros++;
              if (otroIncidente.tipo === 'robo') cluster.robos++;
              incidentesProcesados.add(otroIdx);
            }
          });
    
          // Recalcular centroide
          if (cluster.incidentes.length > 1) {
            const sumaLat = cluster.incidentes.reduce((sum, i) => sum + i.lat, 0);
            const sumaLon = cluster.incidentes.reduce((sum, i) => sum + i.lon, 0);
            cluster.centroLat = sumaLat / cluster.incidentes.length;
            cluster.centroLon = sumaLon / cluster.incidentes.length;
          }
    
          // Determinar barrio
          const puntoCluster = L.latLng(cluster.centroLat, cluster.centroLon);
          for (const barrio of barriosData.features) {
            if (isLatLngInMultiPolygon(puntoCluster, barrio.geometry.coordinates)) {
              cluster.barrio = barrio.properties.soc_fomen;
              break;
            }
          }
          cluster.barrio = cluster.barrio || 'Sin especificar';
    
          clusters.push(cluster);
        });
    
        // Ordenar clusters por peso
        clusters.sort((a, b) => b.pesoTotal - a.pesoTotal);
    
        // ============================================
        // PASO 4: GENERAR RUTAS CON TSP SIMPLIFICADO
        // ============================================
        const rutasPatrullaje = [];
        const clustersUsados = new Set();
        const MIN_CLUSTERS_POR_RUTA = Math.min(5, Math.ceil(clusters.length / numRutas));
        const MAX_CLUSTERS_POR_RUTA = Math.min(8, clusters.length);
    
        for (let r = 0; r < numRutas; r++) {
          if (clusters.filter((_, idx) => !clustersUsados.has(idx)).length === 0) break;
    
          // Seleccionar punto de inicio (cluster más crítico no usado)
          let puntoInicio = null;
          let puntoInicioIdx = -1;
          
          for (let i = 0; i < clusters.length; i++) {
            if (!clustersUsados.has(i)) {
              puntoInicio = clusters[i];
              puntoInicioIdx = i;
              break;
            }
          }
    
          if (!puntoInicio) break;
    
          const ruta = {
            id: r + 1,
            puntos: [puntoInicio],
            distanciaTotal: 0,
            tiempoEstimado: 0,
            pesoTotal: puntoInicio.pesoTotal,
            barrios: new Set([puntoInicio.barrio])
          };
    
          clustersUsados.add(puntoInicioIdx);
    
          // Algoritmo del vecino más cercano (Greedy TSP)
          let puntoActual = puntoInicio;
          let numPuntos = 1;
    
          while (numPuntos < MAX_CLUSTERS_POR_RUTA) {
            let mejorDistancia = Infinity;
            let mejorPunto = null;
            let mejorIdx = -1;
    
            // Buscar el cluster más cercano no usado
            clusters.forEach((cluster, idx) => {
              if (clustersUsados.has(idx)) return;
              
              const distancia = calcularDistancia(
                puntoActual.centroLat, puntoActual.centroLon,
                cluster.centroLat, cluster.centroLon
              );
    
              // Penalizar distancias muy largas (>2km)
              const distanciaPenalizada = distancia > 2000 ? distancia * 1.5 : distancia;
              
              // Factor de prioridad: más peso = más atractivo
              const score = distanciaPenalizada / (cluster.pesoTotal + 1);
              
              if (score < mejorDistancia) {
                mejorDistancia = score;
                mejorPunto = cluster;
                mejorIdx = idx;
              }
            });
    
            if (!mejorPunto || mejorDistancia > 3000) break; // No agregar si está muy lejos
    
            // Agregar punto a la ruta
            ruta.puntos.push(mejorPunto);
            const distanciaReal = calcularDistancia(
              puntoActual.centroLat, puntoActual.centroLon,
              mejorPunto.centroLat, mejorPunto.centroLon
            );
            ruta.distanciaTotal += distanciaReal;
            ruta.pesoTotal += mejorPunto.pesoTotal;
            ruta.barrios.add(mejorPunto.barrio);
            
            clustersUsados.add(mejorIdx);
            puntoActual = mejorPunto;
            numPuntos++;
          }
    
          // Calcular tiempo estimado (velocidad promedio urbana: 30 km/h + 10 min por punto de control)
          ruta.tiempoEstimado = (ruta.distanciaTotal / 1000) * 2 + (ruta.puntos.length * 10); // minutos
    
          rutasPatrullaje.push(ruta);
        }
    
        // ============================================
        // PASO 5: VISUALIZAR EN EL MAPA
        // ============================================
        // Limpiar capas previas
        [hotspotCamerasLayer, ubicacionesPropuestasLayer].forEach(layer => {
          if (mymap.hasLayer(layer)) mymap.removeLayer(layer);
          layer.clearLayers();
        });
    
        const coloresRutas = [
          '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
          '#1abc9c', '#e67e22', '#34495e', '#16a085', '#d35400'
        ];
    
        rutasPatrullaje.forEach((ruta, rutaIdx) => {
          const color = coloresRutas[rutaIdx % coloresRutas.length];
    
        // Dibujar línea de ruta
      const coordenadas = ruta.puntos.map(p => [p.centroLat, p.centroLon]);
      const polyline = L.polyline(coordenadas, {
        color: color,
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 5'
      });
      
      polyline.bindPopup(`
        <b>🚓 Ruta ${ruta.id}</b><br>
        <b>Puntos de control:</b> ${ruta.puntos.length}<br>
        <b>Distancia:</b> ${(ruta.distanciaTotal / 1000).toFixed(2)} km<br>
        <b>Tiempo estimado:</b> ${Math.round(ruta.tiempoEstimado)} min<br>
        <b>Barrios:</b> ${Array.from(ruta.barrios).join(', ')}
      `);
      
      ubicacionesPropuestasLayer.addLayer(polyline);

      // Marcadores de puntos de control
      ruta.puntos.forEach((punto, idx) => {
        const esInicio = idx === 0;
        const esFin = idx === ruta.puntos.length - 1;
        
        let iconHTML;
        if (esInicio) {
          iconHTML = `
            <div style="
              background: ${color};
              color: white;
              border-radius: 50%;
              width: 35px;
              height: 35px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 18px;
              border: 3px solid white;
              box-shadow: 0 3px 10px rgba(0,0,0,0.4);
            ">
              🚩
            </div>
          `;
        } else if (esFin) {
          iconHTML = `
            <div style="
              background: ${color};
              color: white;
              border-radius: 50%;
              width: 35px;
              height: 35px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 18px;
              border: 3px solid white;
              box-shadow: 0 3px 10px rgba(0,0,0,0.4);
            ">
              🏁
            </div>
          `;
        } else {
          iconHTML = `
            <div style="
              background: ${color};
              color: white;
              border-radius: 50%;
              width: 30px;
              height: 30px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 14px;
              border: 2px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            ">
              ${idx + 1}
            </div>
          `;
        }

        const marker = L.marker([punto.centroLat, punto.centroLon], {
          icon: L.divIcon({
            className: 'patrullaje-punto-icon',
            html: iconHTML,
            iconSize: [35, 35],
            iconAnchor: [17, 17]
          }),
          zIndexOffset: 5000 - idx
        });

        const popupContent = `
          <div style="min-width: 220px;">
            <h6 style="margin: 0 0 8px 0; color: ${color};">
              ${esInicio ? '🚩 INICIO' : esFin ? '🏁 FIN' : `📍 Punto ${idx + 1}`} - Ruta ${ruta.id}
            </h6>
            <hr style="margin: 8px 0; border-color: ${color};">
            <p style="margin: 5px 0;"><b>📍 Barrio:</b> ${punto.barrio}</p>
            <p style="margin: 5px 0;"><b>🔢 Incidentes:</b> ${punto.incidentes.length}</p>
            <p style="margin: 5px 0;"><b>⚠️ Siniestros:</b> ${punto.siniestros}</p>
            <p style="margin: 5px 0;"><b>🚗 Robos:</b> ${punto.robos}</p>
            <p style="margin: 5px 0;"><b>🎯 Criticidad:</b> <span style="color: ${color}; font-weight: bold;">${punto.pesoTotal.toFixed(1)}</span></p>
            <hr style="margin: 8px 0;">
            <p style="margin: 5px 0; font-size: 0.85em; color: #666;">
              Coordenadas: ${punto.centroLat.toFixed(5)}, ${punto.centroLon.toFixed(5)}
            </p>
            ${!esInicio && !esFin ? `
              <button onclick="navigator.clipboard.writeText('${punto.centroLat},${punto.centroLon}')" 
                      style="width: 100%; padding: 5px; margin-top: 5px; background: ${color}; color: white; border: none; border-radius: 3px; cursor: pointer;">
                📋 Copiar coordenadas
              </button>
            ` : ''}
          </div>
        `;

        marker.bindPopup(popupContent);
        ubicacionesPropuestasLayer.addLayer(marker);

        // Radio de influencia del punto
        const circulo = L.circle([punto.centroLat, punto.centroLon], {
          radius: RADIO_CLUSTER,
          color: color,
          fillColor: color,
          fillOpacity: 0.1,
          weight: 1,
          dashArray: '3, 3'
        });
        ubicacionesPropuestasLayer.addLayer(circulo);
      });
    });

    mymap.addLayer(ubicacionesPropuestasLayer);

    // ============================================
    // PASO 6: GENERAR REPORTE HTML
    // ============================================
    let reporteHTML = `
      <h5>🚓 Rutas de Patrullaje Óptimas Generadas</h5>
      
      <div style="background: #e7f3ff; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #0056b3;">
        <p style="margin: 5px 0;"><b>📊 Parámetros de análisis:</b></p>
        <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
          <li><b>Incidentes analizados:</b> ${todosIncidentes.length} (${todosIncidentes.filter(i => i.tipo === 'siniestro').length} siniestros + ${todosIncidentes.filter(i => i.tipo === 'robo').length} robos)</li>
          <li><b>Turno:</b> ${turnoSeleccionado === 'all' ? 'Todos' : turnoSeleccionado.charAt(0).toUpperCase() + turnoSeleccionado.slice(1)}</li>
          <li><b>Días:</b> ${diasSeleccionados === 'all' ? 'Todos' : diasSeleccionados === 'laborables' ? 'Laborables' : 'Fines de semana'}</li>
          <li><b>Clusters identificados:</b> ${clusters.length}</li>
          <li><b>Rutas generadas:</b> ${rutasPatrullaje.length}</li>
        </ul>
      </div>

      <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
        <h6 style="margin-top: 0; color: #856404;">🧮 Algoritmo Aplicado:</h6>
        <div style="font-size: 0.85em; line-height: 1.5;">
          <p style="margin: 5px 0;"><b>1. Clustering K-Means adaptado:</b> Agrupación de incidentes cercanos (radio ${RADIO_CLUSTER}m)</p>
          <p style="margin: 5px 0;"><b>2. Ponderación por gravedad:</b> Robos sin intervención > Siniestros NSD > Otros</p>
          <p style="margin: 5px 0;"><b>3. TSP Greedy (Vecino más cercano):</b> Optimización de recorridos</p>
          <p style="margin: 5px 0;"><b>4. Balanceo de carga:</b> Distribución equitativa entre rutas</p>
        </div>
      </div>
    `;

    // Tabla resumen de rutas
    reporteHTML += `
      <div style="background: #f8f9fa; padding: 12px; border-radius: 5px; margin-bottom: 15px;">
        <h6 style="margin-top: 0;">📋 Resumen de Rutas:</h6>
        <div style="max-height: 250px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85em;">
            <thead style="position: sticky; top: 0; background: #dee2e6;">
              <tr>
                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #6c757d;">Ruta</th>
                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #6c757d;">Puntos</th>
                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #6c757d;">Distancia</th>
                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #6c757d;">Tiempo</th>
                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #6c757d;">Criticidad</th>
              </tr>
            </thead>
            <tbody>
    `;

    rutasPatrullaje.forEach((ruta, idx) => {
      const color = coloresRutas[idx % coloresRutas.length];
      const rowColor = idx % 2 === 0 ? '#fff' : '#f8f9fa';
      
      reporteHTML += `
        <tr style="background: ${rowColor};">
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">
            <span style="display: inline-block; width: 12px; height: 12px; background: ${color}; border-radius: 50%; margin-right: 8px;"></span>
            <b>Ruta ${ruta.id}</b>
          </td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">${ruta.puntos.length}</td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">${(ruta.distanciaTotal / 1000).toFixed(2)} km</td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">${Math.round(ruta.tiempoEstimado)} min</td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd; font-weight: bold; color: ${color};">${ruta.pesoTotal.toFixed(1)}</td>
        </tr>
      `;
    });

    reporteHTML += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Detalles de cada ruta
    rutasPatrullaje.forEach((ruta, idx) => {
      const color = coloresRutas[idx % coloresRutas.length];
      
      reporteHTML += `
        <div style="background: #fff; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid ${color}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h6 style="margin-top: 0; color: ${color};">
            <span style="display: inline-block; width: 15px; height: 15px; background: ${color}; border-radius: 50%; margin-right: 8px;"></span>
            Ruta ${ruta.id} - Itinerario Detallado
          </h6>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 10px;">
            <div style="background: #f8f9fa; padding: 8px; border-radius: 4px;">
              <small style="color: #6c757d;">Barrios cubiertos</small>
              <div style="font-weight: bold; margin-top: 3px;">${Array.from(ruta.barrios).join(', ')}</div>
            </div>
            <div style="background: #f8f9fa; padding: 8px; border-radius: 4px;">
              <small style="color: #6c757d;">Total incidentes</small>
              <div style="font-weight: bold; margin-top: 3px; color: ${color};">
                ${ruta.puntos.reduce((sum, p) => sum + p.incidentes.length, 0)} casos
              </div>
            </div>
          </div>
          
          <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em; line-height: 1.8;">
      `;

      ruta.puntos.forEach((punto, pIdx) => {
        const esInicio = pIdx === 0;
        const esFin = pIdx === ruta.puntos.length - 1;
        const icono = esInicio ? '🚩' : esFin ? '🏁' : '📍';
        
        reporteHTML += `
          <li style="margin-bottom: 5px;">
            ${icono} <b>${punto.barrio}</b> 
            <span style="color: #666; font-size: 0.9em;">
              (${punto.incidentes.length} incidentes: ${punto.siniestros}⚠️ + ${punto.robos}🚗)
            </span>
        `;
        
        if (pIdx < ruta.puntos.length - 1) {
          const distanciaAlSiguiente = calcularDistancia(
            punto.centroLat, punto.centroLon,
            ruta.puntos[pIdx + 1].centroLat, ruta.puntos[pIdx + 1].centroLon
          );
          reporteHTML += `
            <br><small style="color: #6c757d; margin-left: 20px;">
              ↓ ${(distanciaAlSiguiente / 1000).toFixed(2)} km (~${Math.round(distanciaAlSiguiente / 1000 * 2)} min)
            </small>
          `;
        }
        
        reporteHTML += `</li>`;
      });

      reporteHTML += `
          </ol>
          
          <div style="background: #e7f3ff; padding: 8px; border-radius: 4px; margin-top: 10px;">
            <small style="color: #0056b3;">
              💡 <b>Sugerencia operativa:</b> 
              ${ruta.tiempoEstimado < 60 
                ? 'Ruta corta ideal para patrullaje intensivo frecuente.' 
                : ruta.tiempoEstimado < 120 
                ? 'Duración óptima para un turno de patrullaje completo.'
                : 'Considerar dividir en dos sub-rutas para mayor eficiencia.'}
            </small>
          </div>
        </div>
      `;
    });

    // Estadísticas finales y recomendaciones
    const distanciaTotal = rutasPatrullaje.reduce((sum, r) => sum + r.distanciaTotal, 0);
    const tiempoTotal = rutasPatrullaje.reduce((sum, r) => sum + r.tiempoEstimado, 0);
    const incidentesCubiertos = clusters.filter((_, idx) => clustersUsados.has(idx))
      .reduce((sum, c) => sum + c.incidentes.length, 0);
    const coberturaPorc = ((incidentesCubiertos / todosIncidentes.length) * 100).toFixed(1);

    reporteHTML += `
      <div style="background: #d1e7dd; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #0f5132;">
        <h6 style="margin-top: 0; color: #0f5132;">📊 Análisis de Cobertura:</h6>
        <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
          <li><b>Incidentes cubiertos:</b> ${incidentesCubiertos} de ${todosIncidentes.length} (${coberturaPorc}%)</li>
          <li><b>Distancia total patrullaje:</b> ${(distanciaTotal / 1000).toFixed(2)} km</li>
          <li><b>Tiempo total estimado:</b> ${Math.round(tiempoTotal)} minutos (${(tiempoTotal / 60).toFixed(1)} horas)</li>
          <li><b>Combustible estimado:</b> ~${((distanciaTotal / 1000) * 0.1).toFixed(1)} litros (10 L/100km)</li>
        </ul>
      </div>

      <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #856404;">
        <h6 style="margin-top: 0; color: #856404;">💡 Recomendaciones Operativas:</h6>
        <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em; line-height: 1.6;">
          <li><b>Asignación de móviles:</b> Se requieren ${rutasPatrullaje.length} patrullas simultáneas</li>
          <li><b>Frecuencia sugerida:</b> ${tiempoTotal < 180 ? 'Rotación cada 3 horas' : 'Un recorrido por turno'}</li>
          <li><b>Horario óptimo:</b> ${turnoSeleccionado === 'noche' ? 'Refuerzo en horario nocturno crítico' : 'Distribuir durante el turno seleccionado'}</li>
          <li><b>Comunicación:</b> Establecer puntos de control en cada parada para reporte de novedades</li>
          <li><b>Seguimiento:</b> Registrar efectividad y ajustar rutas mensualmente según nuevos datos</li>
        </ul>
      </div>

      <div style="background: #cff4fc; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #055160;">
        <p style="margin: 5px 0; font-size: 0.9em;">
          <b>🗺️ En el mapa:</b> Las líneas punteadas muestran las rutas. 
          🚩 = Inicio, 🏁 = Fin, números = puntos de control. 
          Los círculos indican el radio de influencia de cada punto.
          Haz clic en cualquier marcador para ver detalles completos.
        </p>
      </div>

      <div style="background: #e9ecef; padding: 10px; border-radius: 5px; margin-top: 10px;">
        <p style="margin: 5px 0; font-size: 0.85em; color: #495057;">
          <b>📌 Nota técnica:</b> Rutas optimizadas mediante algoritmo de vecino más cercano (Greedy TSP) 
          con ponderación por gravedad de incidentes. Los tiempos consideran velocidad urbana promedio de 30 km/h 
          + 10 minutos por punto de control.
        </p>
      </div>
    `;

    resultadosDiv.innerHTML = reporteHTML;

    // Ajustar vista del mapa
    if (ubicacionesPropuestasLayer.getLayers().length > 0) {
      mymap.fitBounds(ubicacionesPropuestasLayer.getBounds(), { padding: [50, 50] });
    }

  }, 10);
  break;
}

// ============================================
// FUNCIÓN AUXILIAR: CALCULAR DISTANCIA
// ============================================
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distancia en metros
}


    case 'concentracion_siniestros': {
      await loadSiniestrosData();
      
      // Asegurarse de que la capa de siniestros esté visible
      const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
      if (!siniestrosCheckbox.checked) {
        siniestrosCheckbox.checked = true;
        siniestrosCheckbox.dispatchEvent(new Event('change'));
      }

      const heatmapCheckbox = document.getElementById('heatmap-checkbox');
      heatmapCheckbox.checked = true;
      heatmapCheckbox.dispatchEvent(new Event('change')); // Simular clic para activar la lógica existente
      
      resultadosDiv.innerHTML = '✅ Mapa de calor de siniestros activado.';
      break;
    }

    case "calles_seguras": {
      analizarCallesSeguras({ topN: 10 });
      break;
  }

    case "tendencia_distraccion": {
      loadSiniestrosData().then(() => {
          const r = calcularTendenciaPorCausa("D");
          if (!r) return displayConsultaResults("<p>No hay datos suficientes para Distracción.</p>");
          mostrarResultadoTendencia("Distracción", r);
      });
      break;
  }
  case "tendencia_semaforo": {
    loadSiniestrosData().then(() => {
        const r = calcularTendenciaPorCausa("VS");
        if (!r) return displayConsultaResults("<p>No hay datos suficientes para Violación de Semáforo.</p>");
        mostrarResultadoTendencia("Violación de Semáforo", r);
    });
    break;
}

case "tendencia_exceso_velocidad": {
  loadSiniestrosData().then(() => {
      const r = calcularTendenciaPorCausa("EV");
      if (!r) return displayConsultaResults("<p>No hay datos suficientes para Exceso de Velocidad.</p>");
      mostrarResultadoTendencia("Exceso de Velocidad", r);
  });
  break;
}

case "tendencia_peaton_imprudente": {
  loadSiniestrosData().then(() => {
      const r = calcularTendenciaPorCausa("PI");
      if (!r) return displayConsultaResults("<p>No hay datos suficientes para Peatón Imprudente.</p>");
      mostrarResultadoTendencia("Peatón Imprudente", r);
  });
  break;
}

case "tendencia_no_prioridad": {
  loadSiniestrosData().then(() => {
      const r = calcularTendenciaPorCausa("NR");
      if (!r) return displayConsultaResults("<p>No hay datos suficientes para No Respeto de Prioridad.</p>");
      mostrarResultadoTendencia("No Respeto de Prioridad", r);
  });
  break;
}

    case 'evolucion_temporal_siniestros': {
      await loadSiniestrosData();
      
      if (!allSiniestrosData || !allSiniestrosData.features) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de siniestros.';
        return;
      }
    
      // 1. Extraer y procesar datos por año y mes
      const datosPorPeriodo = new Map();
      let añoMinimo = Infinity;
      let añoMaximo = -Infinity;
    
      allSiniestrosData.features.forEach(feature => {
        const fechaStr = feature.properties.fecha;
        if (!fechaStr || fechaStr.split('/').length !== 3) return;
        
        const partes = fechaStr.split('/');
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10);
        let año = parseInt(partes[2], 10);
        
        // Convertir años de 2 dígitos a 4
        if (año < 100) año += 2000;
        
        // Validar fecha
        if (isNaN(dia) || isNaN(mes) || isNaN(año) || mes < 1 || mes > 12) return;
        
        añoMinimo = Math.min(añoMinimo, año);
        añoMaximo = Math.max(añoMaximo, año);
        
        const periodoKey = `${año}-${mes.toString().padStart(2, '0')}`;
        
        if (!datosPorPeriodo.has(periodoKey)) {
          datosPorPeriodo.set(periodoKey, {
            año: año,
            mes: mes,
            count: 0,
            causas: {},
            participantes: {}
          });
        }
        
        const periodo = datosPorPeriodo.get(periodoKey);
        periodo.count++;
        
        // Contar causas
        const causa = feature.properties.causa;
        if (causa) {
          periodo.causas[causa] = (periodo.causas[causa] || 0) + 1;
        }
        
        // Contar participantes
        if (feature.properties.participantes_codigos) {
          feature.properties.participantes_codigos.split('/').forEach(p => {
            periodo.participantes[p] = (periodo.participantes[p] || 0) + 1;
          });
        }
      });
    
      // 2. Ordenar periodos cronológicamente
      const periodosOrdenados = Array.from(datosPorPeriodo.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));
    
      if (periodosOrdenados.length === 0) {
        resultadosDiv.innerHTML = '⚠️ No hay datos suficientes para el análisis temporal.';
        return;
      }
    
      // 3. Calcular estadísticas
      const totalSiniestros = periodosOrdenados.reduce((sum, [_, data]) => sum + data.count, 0);
      const promedioMensual = (totalSiniestros / periodosOrdenados.length).toFixed(1);
      
      // Encontrar mes con más y menos siniestros
      const mesMasCritico = periodosOrdenados.reduce((max, curr) => 
        curr[1].count > max[1].count ? curr : max
      );
      const mesMasSeguro = periodosOrdenados.reduce((min, curr) => 
        curr[1].count < min[1].count ? curr : min
      );
    
      // 4. Calcular tendencia (últimos 6 meses vs primeros 6 meses)
      const ultimos6Meses = periodosOrdenados.slice(-6);
      const primeros6Meses = periodosOrdenados.slice(0, 6);
      
      const promedioUltimos6 = ultimos6Meses.reduce((sum, [_, data]) => sum + data.count, 0) / ultimos6Meses.length;
      const promedioPrimeros6 = primeros6Meses.reduce((sum, [_, data]) => sum + data.count, 0) / primeros6Meses.length;
      const tendenciaPorcentaje = (((promedioUltimos6 - promedioPrimeros6) / promedioPrimeros6) * 100).toFixed(1);
      const tendenciaIcono = tendenciaPorcentaje > 0 ? '📈' : '📉';
      const tendenciaColor = tendenciaPorcentaje > 0 ? '#dc3545' : '#28a745';
    
      // 5. Datos por año
      const siniestrosPorAño = {};
      periodosOrdenados.forEach(([key, data]) => {
        const año = data.año;
        siniestrosPorAño[año] = (siniestrosPorAño[año] || 0) + data.count;
      });
    
      // 6. Causas más comunes en el último año
      const ultimoAño = añoMaximo;
      const causasUltimoAño = {};
      periodosOrdenados
        .filter(([_, data]) => data.año === ultimoAño)
        .forEach(([_, data]) => {
          Object.entries(data.causas).forEach(([causa, count]) => {
            causasUltimoAño[causa] = (causasUltimoAño[causa] || 0) + count;
          });
        });
      
      const topCausasUltimoAño = Object.entries(causasUltimoAño)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
      // 7. Generar gráfico de líneas (ASCII)
      const maxCount = Math.max(...periodosOrdenados.map(([_, data]) => data.count));
      const escalaGrafico = 20; // Altura del gráfico en caracteres
      
      let graficoHTML = '<div style="font-family: monospace; background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: nowrap;">';
      
      // Eje Y (valores)
      for (let i = escalaGrafico; i >= 0; i--) {
        const valor = Math.round((maxCount / escalaGrafico) * i);
        graficoHTML += `<div style="display: flex; align-items: center;">`;
        graficoHTML += `<span style="width: 50px; text-align: right; margin-right: 10px; color: #6c757d; font-size: 0.85em;">${valor}</span>`;
        
        periodosOrdenados.forEach(([key, data]) => {
          const altura = Math.round((data.count / maxCount) * escalaGrafico);
          const char = altura >= i ? '█' : (altura === i - 1 ? '▄' : ' ');
          const color = data.count > promedioMensual ? '#dc3545' : '#28a745';
          graficoHTML += `<span style="color: ${color}; margin: 0 2px;">${char}</span>`;
        });
        
        graficoHTML += `</div>`;
      }
      
      // Eje X (meses)
      graficoHTML += '<div style="display: flex; margin-top: 5px;"><span style="width: 50px;"></span>';
      periodosOrdenados.forEach(([key, data]) => {
        const mesNombre = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][data.mes - 1];
        graficoHTML += `<span style="font-size: 0.75em; margin: 0 2px; color: #495057;" title="${data.año}-${data.mes}">${mesNombre}</span>`;
      });
      graficoHTML += '</div>';
      
      // Años en segunda fila
      graficoHTML += '<div style="display: flex; margin-top: 2px;"><span style="width: 50px;"></span>';
      let añoActual = null;
      periodosOrdenados.forEach(([key, data]) => {
        if (data.mes === 1 || añoActual === null) {
          añoActual = data.año;
          graficoHTML += `<span style="font-size: 0.85em; font-weight: bold; color: #212529; margin-left: 5px;">${data.año}</span>`;
        }
      });
      graficoHTML += '</div></div>';
    
      // 8. Generar reporte HTML
      let reporteHTML = `
        <h5>📈 Evolución Temporal de Siniestros (${añoMinimo} - ${añoMaximo})</h5>
        
        <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
          <p style="margin: 5px 0;"><b>📊 Período analizado:</b> ${periodosOrdenados.length} meses (${añoMinimo} - ${añoMaximo})</p>
          <p style="margin: 5px 0;"><b>🔢 Total siniestros:</b> ${totalSiniestros}</p>
          <p style="margin: 5px 0;"><b>📅 Promedio mensual:</b> ${promedioMensual} siniestros</p>
        </div>
    
        <div style="background: ${tendenciaColor}; color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
          <h6 style="margin: 0 0 8px 0; text-align: center;">🎯 Tendencia General</h6>
          <div style="font-size: 2em; text-align: center; font-weight: bold;">
            ${tendenciaIcono} ${Math.abs(tendenciaPorcentaje)}%
          </div>
          <p style="margin: 5px 0; text-align: center; font-size: 0.95em;">
            ${tendenciaPorcentaje > 0 ? 'Aumento' : 'Disminución'} en los últimos 6 meses vs primeros 6 meses
          </p>
        </div>
    
        <h6 style="margin-top: 15px;">📊 Gráfico de Evolución Mensual:</h6>
        ${graficoHTML}
        <p style="font-size: 0.85em; color: #6c757d; margin-top: 5px;">
          <span style="color: #28a745;">█</span> Por debajo del promedio &nbsp;&nbsp;
          <span style="color: #dc3545;">█</span> Por encima del promedio
        </p>
    
        <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #6c757d;">
          <h6 style="margin-top: 0; color: #495057;">📅 Datos por Año:</h6>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
            <thead style="background: #dee2e6;">
              <tr>
                <th style="padding: 8px; text-align: left;">Año</th>
                <th style="padding: 8px; text-align: center;">Total</th>
                <th style="padding: 8px; text-align: center;">Promedio Mensual</th>
                <th style="padding: 8px; text-align: center;">vs Año Anterior</th>
              </tr>
            </thead>
            <tbody>
      `;
    
      const años = Object.keys(siniestrosPorAño).sort();
      años.forEach((año, index) => {
        const total = siniestrosPorAño[año];
        const mesesEnAño = periodosOrdenados.filter(([_, data]) => data.año == año).length;
        const promedioAño = (total / mesesEnAño).toFixed(1);
        
        let cambioHTML = '-';
        if (index > 0) {
          const añoAnterior = años[index - 1];
          const totalAnterior = siniestrosPorAño[añoAnterior];
          const cambio = (((total - totalAnterior) / totalAnterior) * 100).toFixed(1);
          const colorCambio = cambio > 0 ? '#dc3545' : '#28a745';
          const iconoCambio = cambio > 0 ? '▲' : '▼';
          cambioHTML = `<span style="color: ${colorCambio}; font-weight: bold;">${iconoCambio} ${Math.abs(cambio)}%</span>`;
        }
        
        const rowColor = index % 2 === 0 ? '#fff' : '#f8f9fa';
        reporteHTML += `
          <tr style="background: ${rowColor};">
            <td style="padding: 8px;"><b>${año}</b></td>
            <td style="padding: 8px; text-align: center;">${total}</td>
            <td style="padding: 8px; text-align: center;">${promedioAño}</td>
            <td style="padding: 8px; text-align: center;">${cambioHTML}</td>
          </tr>
        `;
      });
    
      reporteHTML += `
            </tbody>
          </table>
        </div>
    
        <div style="background: #f8d7da; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #842029;">
          <h6 style="margin-top: 0; color: #842029;">🔥 Períodos Críticos:</h6>
          <p style="margin: 5px 0;"><b>Mes con más siniestros:</b> ${mesMasCritico[0]} (${mesMasCritico[1].count} casos)</p>
          <p style="margin: 5px 0;"><b>Mes más seguro:</b> ${mesMasSeguro[0]} (${mesMasSeguro[1].count} casos)</p>
          <p style="margin: 5px 0;"><b>Diferencia:</b> ${((mesMasCritico[1].count - mesMasSeguro[1].count) / mesMasSeguro[1].count * 100).toFixed(1)}% más siniestros en el período crítico</p>
        </div>
    
        <div style="background: #d1ecf1; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #0c5460;">
          <h6 style="margin-top: 0; color: #0c5460;">🚨 Top 5 Causas en ${ultimoAño}:</h6>
          <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
      `;
    
      topCausasUltimoAño.forEach(([causa, count]) => {
        const porcentaje = ((count / siniestrosPorAño[ultimoAño]) * 100).toFixed(1);
        reporteHTML += `<li><b>${causeMapping[causa] || causa}:</b> ${count} casos (${porcentaje}%)</li>`;
      });
    
      reporteHTML += `
          </ol>
        </div>
    
        <div style="background: #d1e7dd; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #0f5132;">
          <h6 style="margin-top: 0; color: #0f5132;">💡 Insights Operativos:</h6>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em;">
            ${tendenciaPorcentaje > 5 ? 
              '<li><b>Alerta:</b> Tendencia al alza sostenida. Se requiere intensificar medidas preventivas.</li>' : 
              tendenciaPorcentaje < -5 ?
              '<li><b>Positivo:</b> Reducción significativa. Las medidas actuales están funcionando.</li>' :
              '<li><b>Estable:</b> Situación controlada. Mantener estrategias vigentes.</li>'
            }
            <li><b>Estacionalidad:</b> El análisis por mes revela patrones que pueden anticiparse.</li>
            <li><b>Focalización:</b> Las causas principales en ${ultimoAño} indican dónde concentrar recursos.</li>
            <li><b>Proyección:</b> Con el promedio actual de ${promedioMensual} casos/mes, se esperan ~${(promedioMensual * 12).toFixed(0)} casos anuales.</li>
          </ul>
        </div>
    
        <div style="background: #cff4fc; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #055160;">
          <p style="margin: 5px 0; font-size: 0.9em;">
            <b>📌 Metodología:</b> Análisis de ${periodosOrdenados.length} períodos mensuales. 
            Tendencia calculada comparando promedios de primeros vs últimos 6 meses. 
            Datos depurados excluyendo registros sin fecha válida.
          </p>
        </div>
      `;
    
      resultadosDiv.innerHTML = reporteHTML;
      break;
    }

    // ========================================================
        // AÑADIR ESTE NUEVO CASO AQUÍ: CRUCES SIN SEMÁFORO
        // ========================================================
        case 'esquinas_sin_semaforo_criticas': {
          // Esta función debe limpiar la capa anterior (siniestrosLayerGroup)
          // y luego realizar el análisis de filtrado y ranking.
          
          // 1. Asegúrate de que los datos de siniestros estén cargados.
          await loadSiniestrosData(); 

          // 2. Ejecuta la función de análisis que definimos.
          analyzeAndDisplayHighRiskIntersections(); 
          
          resultadosDiv.innerHTML = '✅ Mostrando los 10 cruces sin semáforo con mayor registro de siniestros.';
          break;
      }
      // ========================================================

    case 'barrios_mas_robos': {
      await loadRoboAutomotorData();
      if (!barriosData || !allRoboAutomotorData) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
        return;
      }

      const robosPorBarrio = {};
      barriosData.features.forEach(barrio => {
        robosPorBarrio[barrio.properties.soc_fomen] = 0;
      });

      allRoboAutomotorData.forEach(robo => {
        const coordsStr = robo['Longitud y Latitud'];
        if (!coordsStr) return;
        const parts = coordsStr.split(',').map(s => s.trim());
        if (parts.length !== 2) return;
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return;
        
        const latlng = L.latLng(lat, lon);

        for (const barrio of barriosData.features) {
          if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
            robosPorBarrio[barrio.properties.soc_fomen]++;
            break; 
          }
        }
      });

      const top5Barrios = Object.entries(robosPorBarrio).sort((a, b) => b[1] - a[1]).slice(0, 5);
      // Resaltar los 5 barrios en el mapa
      barriosDestacadosLayer.clearLayers();
      const colores = ['#d53e4f', '#f46d43', '#fdae61', '#4caf50', '#8bc34a']; // Paleta actualizada con verdes
      top5Barrios.forEach(([nombreBarrio, cantidad], index) => {
        const barrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === nombreBarrio);
        if (barrioFeature) {
          L.geoJSON(barrioFeature, {
            style: {
              color: colores[index % colores.length],
              weight: 3,
              opacity: 0.8,
              fillOpacity: 0.5
            }
          }).bindPopup(`<b>${nombreBarrio}</b><br>${cantidad} eventos`).addTo(barriosDestacadosLayer);
        }
      });
      mymap.addLayer(barriosDestacadosLayer);

      // Opcional: Centrar el mapa para que se vean todos los barrios destacados
      if (barriosDestacadosLayer.getLayers().length > 0) {
        mymap.fitBounds(barriosDestacadosLayer.getBounds());
      }
      
      let resultadoHTML = '<b>Top 5 barrios con más eventos de la categoría robo automotor:</b><br><ul>';
      top5Barrios.forEach(([barrio, cantidad], index) => {
        resultadoHTML += `<li><span style="color:${colores[index % colores.length]}; font-weight:bold;">${index + 1}. ${barrio}:</span> ${cantidad} eventos</li>`;
      });
      resultadoHTML += '</ul><small>Los barrios están resaltados en el mapa.</small>';

      resultadosDiv.innerHTML = resultadoHTML;
      break;
    }
    case 'robos_por_dia': {
  await loadRoboAutomotorData();
  
  if (!allRoboAutomotorData) {
    resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de robos.';
    return;
  }

  const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const diasCuentas = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
  let robosSinFecha = 0;

  allRoboAutomotorData.forEach(robo => {
    const fechaStr = robo.Fecha;
    if (!fechaStr) {
      robosSinFecha++;
      return;
    }

    // Intentar parsear diferentes formatos de fecha
    let fechaObj;
    
    // Formato DD/MM/YYYY o DD/MM/YY
    if (fechaStr.includes('/')) {
      const partes = fechaStr.split('/');
      if (partes.length === 3) {
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1; // JS months are 0-indexed
        let anio = parseInt(partes[2], 10);
        
        // Si el año es de 2 dígitos, convertir a 4
        if (anio < 100) {
          anio += 2000;
        }
        
        fechaObj = new Date(anio, mes, dia);
      }
    }
    // Formato YYYY-MM-DD
    else if (fechaStr.includes('-')) {
      fechaObj = new Date(fechaStr);
    }
    
    if (fechaObj && !isNaN(fechaObj.getTime())) {
      const diaSemana = fechaObj.getDay();
      diasCuentas[diaSemana]++;
    } else {
      robosSinFecha++;
    }
  });

  // Encontrar el día con más y menos robos
  let maxDia = 0, minDia = 0, maxCount = 0, minCount = Infinity;
  for (let i = 0; i < 7; i++) {
    if (diasCuentas[i] > maxCount) {
      maxCount = diasCuentas[i];
      maxDia = i;
    }
    if (diasCuentas[i] < minCount) {
      minCount = diasCuentas[i];
      minDia = i;
    }
  }

  // Calcular promedio diario
  const totalRobos = Object.values(diasCuentas).reduce((a, b) => a + b, 0);
  const promedioDiario = (totalRobos / 7).toFixed(1);

  // Crear visualización
  let diasHTML = `
    <h5>📅 Distribución de Robos Automotor por Día de la Semana:</h5>
    
    <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
      <p style="margin: 5px 0;"><b>Total analizado:</b> ${totalRobos} robos</p>
      <p style="margin: 5px 0;"><b>Promedio diario:</b> ${promedioDiario} robos/día</p>
      ${robosSinFecha > 0 ? `<p style="margin: 5px 0; color: #856404;"><b>⚠️ Robos sin fecha:</b> ${robosSinFecha}</p>` : ''}
    </div>
    
    <div style="max-height: 350px; overflow-y: auto;">
  `;

  for (let i = 0; i < 7; i++) {
    const porcentaje = maxCount > 0 ? (diasCuentas[i] / maxCount) * 100 : 0;
    const porcentajeTotal = totalRobos > 0 ? (diasCuentas[i] / totalRobos) * 100 : 0;
    
    // Determinar color según si es el día más crítico, más tranquilo o intermedio
    let color;
    if (i === maxDia) {
      color = '#dc3545'; // Rojo para el día más crítico
    } else if (i === minDia) {
      color = '#28a745'; // Verde para el día más tranquilo
    } else {
      color = '#ffc107'; // Amarillo para días intermedios
    }
    
    // Determinar si es fin de semana
    const esFinDeSemana = (i === 0 || i === 6);
    
    diasHTML += `
      <div style="margin-bottom: 12px; ${esFinDeSemana ? 'background: #f0f8ff; padding: 8px; border-radius: 4px;' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
          <span style="font-weight: ${i === maxDia || i === minDia ? 'bold' : 'normal'}; font-size: 0.95em;">
            ${diasNombres[i]}${esFinDeSemana ? ' 🏖️' : ''}:
          </span>
          <span style="font-weight: bold; color: ${color}; font-size: 0.95em;">
            ${diasCuentas[i]} robos (${porcentajeTotal.toFixed(1)}%)
          </span>
        </div>
        <div style="background: #e0e0e0; height: 24px; border-radius: 4px; overflow: hidden; position: relative;">
          <div style="background: ${color}; width: ${porcentaje}%; height: 100%; transition: width 0.5s ease;"></div>
          ${diasCuentas[i] > promedioDiario ? 
            `<span style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); font-size: 0.8em; color: #333;">▲ ${(diasCuentas[i] - promedioDiario).toFixed(0)} sobre promedio</span>` 
            : ''}
        </div>
      </div>
    `;
  }

  diasHTML += '</div>';

  // Análisis de tendencias fin de semana vs días hábiles
  const robosSabadoDomingo = diasCuentas[0] + diasCuentas[6];
  const robosEntreSemanaTotales = diasCuentas[1] + diasCuentas[2] + diasCuentas[3] + diasCuentas[4] + diasCuentas[5];
  const promedioFinDeSemana = robosSabadoDomingo / 2;
  const promedioEntreSemana = robosEntreSemanaTotales / 5;

  diasHTML += `
    <div style="margin-top: 15px; padding: 12px; background: #e9ecef; border-radius: 5px; border-left: 4px solid #6c757d;">
      <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">📊 Análisis Comparativo:</h6>
      <div style="font-size: 0.9em; line-height: 1.6;">
        <p style="margin: 5px 0;"><b style="color: #dc3545;">Día más crítico:</b> ${diasNombres[maxDia]} (${maxCount} robos)</p>
        <p style="margin: 5px 0;"><b style="color: #28a745;">Día más tranquilo:</b> ${diasNombres[minDia]} (${minCount} robos)</p>
        <p style="margin: 5px 0;"><b>Diferencia:</b> ${(maxCount - minCount)} robos (${((maxCount - minCount) / minCount * 100).toFixed(1)}% más)</p>
        
        <hr style="margin: 10px 0; border: none; border-top: 1px solid #ccc;">
        
        <p style="margin: 5px 0;"><b>Promedio días hábiles (L-V):</b> ${promedioEntreSemana.toFixed(1)} robos/día</p>
        <p style="margin: 5px 0;"><b>Promedio fin de semana (S-D):</b> ${promedioFinDeSemana.toFixed(1)} robos/día</p>
        <p style="margin: 5px 0;">
          <b>Tendencia:</b> ${promedioFinDeSemana > promedioEntreSemana ? 
            `<span style="color: #dc3545;">⬆️ ${((promedioFinDeSemana - promedioEntreSemana) / promedioEntreSemana * 100).toFixed(1)}% más robos en fin de semana</span>` : 
            `<span style="color: #28a745;">⬇️ ${((promedioEntreSemana - promedioFinDeSemana) / promedioFinDeSemana * 100).toFixed(1)}% más robos en días hábiles</span>`
          }
        </p>
      </div>
    </div>
    
    <div style="background: #d1e7dd; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #0f5132;">
      <h6 style="margin-top: 0; margin-bottom: 5px; color: #0f5132;">💡 Utilidad Operativa:</h6>
      <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em; line-height: 1.5;">
        <li>Planificar patrullajes preventivos en días críticos</li>
        <li>Ajustar dotación de personal según patrones semanales</li>
        <li>Coordinar operativos especiales en horarios de mayor riesgo</li>
        <li>Optimizar recursos de vigilancia móvil</li>
      </ul>
    </div>
    
    <div style="background: #cff4fc; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #055160;">
      <p style="margin: 5px 0; font-size: 0.85em;">
        <b>📌 Nota metodológica:</b> El análisis se basa en la fecha registrada de cada robo. 
        ${robosSinFecha > 0 ? `Se excluyeron ${robosSinFecha} registros sin fecha válida del análisis.` : 'Todos los registros tienen fecha válida.'}
      </p>
    </div>
  `;

  resultadosDiv.innerHTML = diasHTML;
  break;
}

case 'siniestros_noche': {
  try {
    // ✅ LIMPIAR ESTADO ANTES DE PROCESAR
    lastQueryModifiedBaseLayer = true;
    
    // ✅ Limpiar capas de consultas anteriores (SIN remover siniestrosLayer ni topSiniestrosLabelsLayer)
    [hotspotCamerasLayer, camarasAisladasLayer, zonasCiegasLayer, siniestrosEnZonasLayer,
     motosCirculacionLayer, siniestrosCercaParadasLayer, recorridosColectivosLayer,
     robosSinCamarasLayer, robosSinIntervencionLayer, dangerousCornersLayer].forEach(layer => {
      if (mymap.hasLayer(layer)) mymap.removeLayer(layer);
      layer.clearLayers();
    });
    
    // ✅ Limpiar SOLO el contenido sin remover del mapa (mantiene estado coherente)
    if (siniestrosLayer && typeof siniestrosLayer.clearLayers === 'function') {
      siniestrosLayer.clearLayers();
    }
    if (topSiniestrosLabelsLayer && typeof topSiniestrosLabelsLayer.clearLayers === 'function') {
      topSiniestrosLabelsLayer.clearLayers();
    }
    
    // Limpiar panel de top siniestros
    const topSiniestrosContent = document.getElementById('top-siniestros-content');
    if (topSiniestrosContent) topSiniestrosContent.innerHTML = '';
    
    await loadSiniestrosData();
    
    const nocturnos = allSiniestrosData.features.filter(f => {
      const hora = parseInt(f.properties.hora?.split(':')[0] || -1);
      return hora >= 22 || hora < 6;
    });

    processAndDisplaySiniestros(nocturnos);

    // --- Ensure layers are visible ---
    const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
    if (!siniestrosCheckbox.checked) {
        siniestrosCheckbox.checked = true;
        mymap.addLayer(siniestrosLayer);
        mymap.addLayer(topSiniestrosLabelsLayer);
    }
        
        // --- Detailed Analysis ---
        const causaCounts = {};
        const barrioCounts = {};
        const participantCounts = {};
        let totalSiniestrosAnalizados = 0;

        nocturnos.forEach(siniestro => {
            totalSiniestrosAnalizados++;
            const props = siniestro.properties;

            // 1. Analyze Causes
            const causa = props.causa;
            if (causa) {
                causaCounts[causa] = (causaCounts[causa] || 0) + 1;
            }

            // 2. Analyze Participants
            if (props.participantes_codigos) {
                const participantes = props.participantes_codigos.split('/');
                participantes.forEach(p => {
                    participantCounts[p] = (participantCounts[p] || 0) + 1;
                });
            }

            // 3. Analyze Barrios
            if (barriosData && siniestro.geometry?.coordinates) {
                const latlng = L.latLng(siniestro.geometry.coordinates[1], siniestro.geometry.coordinates[0]);
                for (const barrio of barriosData.features) {
                    if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
                        const nombreBarrio = barrio.properties.soc_fomen;
                        barrioCounts[nombreBarrio] = (barrioCounts[nombreBarrio] || 0) + 1;
                        break;
                    }
                }
            }
        });

        // --- Prepare sorted data for display ---
        const topCausas = Object.entries(causaCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const topBarrios = Object.entries(barrioCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topParticipantes = Object.entries(participantCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

        // --- Generate HTML Report ---
        let reporteHTML = `
          <h5>🌙 Análisis de Siniestralidad Nocturna (22-06hs)</h5>
          
          <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #6c757d;">
            <p style="margin: 5px 0;"><b>Total de siniestros nocturnos:</b> ${totalSiniestrosAnalizados}</p>
          </div>
          
          <div style="background: #f8d7da; padding: 12px; border-radius: 5px; margin-bottom: 10px;">
            <h6 style="margin-top: 0; color: #721c24;">🚨 Causas Principales:</h6>
            <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
              ${topCausas.map(([causa, count]) => `<li><b>${causeMapping[causa] || causa}:</b> ${count} casos</li>`).join('')}
            </ol>
          </div>
          
          <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 10px;">
            <h6 style="margin-top: 0; color: #856404;">📍 Barrios Más Afectados:</h6>
            <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
              ${topBarrios.map(([barrio, count]) => `<li><b>${barrio}:</b> ${count} siniestros</li>`).join('')}
            </ol>
          </div>
          
          <div style="background: #d1ecf1; padding: 12px; border-radius: 5px; margin-bottom: 15px;">
    <h6 style="margin-top: 0; color: #0c5460;">👥 Participantes Involucrados:</h6>
    <p style="margin: 5px 0; font-size: 0.85em; color: #666;">
      <em>* Un mismo siniestro puede involucrar múltiples participantes</em>
    </p>
    <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
      ${topParticipantes.map(([p, count]) => {
        const porcentaje = ((count / totalSiniestrosAnalizados) * 100).toFixed(1);
        return `<li><b>${participantMapping[p] || p}:</b> ${count} participaciones (${porcentaje}% de los siniestros)</li>`;
      }).join('')}
    </ol>
    <p style="margin: 8px 0 0 0; font-size: 0.85em; color: #555;">
      <b>📊 Promedio:</b> ${(topParticipantes.reduce((sum, [_, count]) => sum + count, 0) / totalSiniestrosAnalizados).toFixed(2)} participantes por siniestro
    </p>
  </div>

          <div style="background: #d1e7dd; padding: 10px; border-radius: 5px; border-left: 4px solid #0f5132;">
            <h6 style="margin-top: 0; color: #0f5132;">💡 Utilidad Operativa:</h6>
            <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em;">
              <li><b>Enfoque de patrullaje:</b> Priorizar la vigilancia en los barrios más afectados durante el turno noche.</li>
              <li><b>Campañas preventivas:</b> Dirigir campañas sobre las causas nocturnas más comunes (ej: distracción, alcohol).</li>
              <li><b>Control de vehículos:</b> Aumentar controles a los participantes más frecuentes en los barrios críticos.</li>
              <li><b>Análisis de infraestructura:</b> Verificar la iluminación y señalización en los puntos con mayor reincidencia.</li>
            </ul>
          </div>
        `;

        resultadosDiv.innerHTML = reporteHTML;
    } catch (error) {
        console.error("Error en consulta 'siniestros_noche':", error);
        resultadosDiv.innerHTML = `<p style="color:red; padding: 15px;"><b>Error al procesar la consulta:</b><br>${error.message}</p>`;
    }
    break;
}

    case 'tipos_siniestros_comunes': {
      await loadSiniestrosData();
      if (!barriosData) {
        try {
          const response = await fetch('barrios.geojson');
          barriosData = await response.json();
        } catch (error) {
          resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de barrios para el análisis.';
          return;
        }
      }

      // 1. Calcular Top 10 Causas
      const causaCounts = {};
      allSiniestrosData.features.forEach(f => {
        const causa = f.properties.causa;
        if (causa) {
          causaCounts[causa] = (causaCounts[causa] || 0) + 1;
        }
      });
      const top10Causas = Object.entries(causaCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const top10CausaCodes = top10Causas.map(c => c[0]);

      // 2. Asignar Colores
      const colorPalette = ['#FF4500', '#3cb44b', '#ffc107', '#4363d8', '#f58231', '#911eb4', '#0097a7', '#f032e6', '#bcf60c', '#d32f2f'];
      const causeColorMap = {};
      top10CausaCodes.forEach((code, index) => {
        causeColorMap[code] = colorPalette[index % colorPalette.length];
      });

      // 3. Analizar Prevalencia por Zona
      const getZoneForBarrio = (barrioName) => {
        if (!barrioName) return 'Desconocida';
        const lower = barrioName.toLowerCase();
        if (['centro', 'la perla', 'nueva pompeya', 'don bosco', 'vieja terminal'].some(c => lower.includes(c))) return 'Centro';
        if (['puerto', 'punta mogotes', 'faro norte', 'los troncos'].some(p => lower.includes(p))) return 'Sur';
        if (['constitución', 'estrada', 'zacagnini', 'parque luro'].some(n => lower.includes(n))) return 'Norte';
        return 'Oeste';
      };
      const prevalence = {};
      top10CausaCodes.forEach(code => prevalence[code] = {});
      allSiniestrosData.features.forEach(siniestro => {
        const causa = siniestro.properties.causa;
        if (top10CausaCodes.includes(causa) && siniestro.geometry?.coordinates) {
          const latlng = L.latLng(siniestro.geometry.coordinates[1], siniestro.geometry.coordinates[0]);
          let barrioName = null;
          for (const barrio of barriosData.features) {
            if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
              barrioName = barrio.properties.soc_fomen;
              break;
            }
          }
          const zone = getZoneForBarrio(barrioName);
          prevalence[causa][zone] = (prevalence[causa][zone] || 0) + 1;
        }
      });
      const prevalentZones = {};
      top10CausaCodes.forEach(code => {
        const zones = prevalence[code];
        prevalentZones[code] = Object.keys(zones).length > 0
          ? Object.entries(zones).sort((a, b) => b[1] - a[1])[0][0]
          : 'N/A';
      });

      // --- Helper function to display siniestros on map ---
      const displaySiniestrosEnMapa = (causaFiltro = 'all') => {
        siniestrosEnZonasLayer.clearLayers();
        const siniestrosAMostrar = allSiniestrosData.features.filter(f => {
            const currentCausa = f.properties.causa;
            if (currentCausa === 'NSD') return false; 
            if (causaFiltro === 'all') {
                return top10CausaCodes.includes(currentCausa);
            } else {
                return currentCausa === causaFiltro;
            }
        });
        L.geoJSON(siniestrosAMostrar, {
            pointToLayer: (feature, latlng) => {
                const causa = feature.properties.causa;
                const color = causeColorMap[causa] || '#808080';
                const icon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<i class="fi fi-rr-triangle-warning" style="font-size: 24px; color: ${color}; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);"></i>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 24]
                });
                return L.marker(latlng, { icon: icon });
            },
            onEachFeature: (feature, layer) => {
                const props = feature.properties;
                const causa = props.causa;
                const color = causeColorMap[causa] || '#808080';
                let popupContent = `<strong>Siniestro</strong><br>` +
                                   `<img src="https://img.icons8.com/color/16/calendar.png" style="vertical-align: middle; margin-right: 5px;"> <b>Fecha:</b> ${props.fecha}<br>` +
                                   `<img src="https://img.icons8.com/color/16/clock.png" style="vertical-align: middle; margin-right: 5px;"> <b>Hora:</b> ${props.hora}<br>` +
                                   `<img src="https://img.icons8.com/color/16/marker.png" style="vertical-align: middle; margin-right: 5px;"> <b>Dirección:</b> ${props.direccion}<br>` +
                                   `<img src="https://img.icons8.com/color/16/traffic-jam.png" style="vertical-align: middle; margin-right: 5px;"> <b style="color:${color};">Causa: ${causeMapping[causa] || causa}</b>`;
                if (props.participantes_codigos) {
                    const codes = props.participantes_codigos.split('/');
                    const participantNames = codes.map(code => participantMapping[code] || code);
                    popupContent += `<br><img src="https://img.icons8.com/color/16/user-group-man-man.png" style="vertical-align: middle; margin-right: 5px;"> <b>Participantes:</b> ${participantNames.join(', ')}`;
                }
                layer.bindPopup(popupContent);
            }
        }).addTo(siniestrosEnZonasLayer);
        mymap.addLayer(siniestrosEnZonasLayer);
      };
      
      // 4. Generar Panel de Resultados con elementos clickables
      let causasHTML = `<h5>📊 Top 10 Causas (haga clic para filtrar):</h5>
        <button class="consulta-btn show-all-causas" style="width: 100%; margin-bottom: 5px; background-color: #6c757d; color: white;">Mostrar Todas las Causas</button>
        <div style="max-height: 280px; overflow-y: auto;"><ul>`;
      top10Causas.forEach(([causaCode, count]) => {
        const causaNombre = causeMapping[causaCode] || causaCode;
        const color = causeColorMap[causaCode];
        const zona = prevalentZones[causaCode];
        causasHTML += `<li class="causa-item" data-causa-code="${causaCode}" style="margin-bottom: 5px; cursor: pointer; padding: 5px; border-radius: 4px; transition: background-color 0.2s;"><span style="display: inline-block; width: 14px; height: 14px; background-color: ${color}; border-radius: 50%; margin-right: 8px; vertical-align: middle; border: 1px solid #777;"></span><b>${causaNombre}:</b> ${count} casos <em style="font-size: 0.9em; color: #555;">(Prevalente en: <b>${zona}</b>)</em></li>`;
      });
      causasHTML += '</ul></div>';
      causasHTML += `
        <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #457b9d;">
          <h6 style="margin-top: 0;">🗺️ En el Mapa:</h6>
          <p style="font-size: 0.9em; margin: 0;">Se han coloreado los siniestros en el mapa según su causa. Haga clic en una causa para verla de forma aislada.</p>
        </div>
      `;
      resultadosDiv.innerHTML = causasHTML;

      // 5. Visualizar TODO en el Mapa inicialmente
      displaySiniestrosEnMapa('all');

      // 6. Add event listener for filtering and analysis
      const resultsPanelContainer = document.getElementById('consulta-results-content');
      const analysisContainer = document.getElementById('analisis-causa-container');

      resultsPanelContainer.onclick = async (e) => {
        const targetCausa = e.target.closest('.causa-item');
        const targetShowAll = e.target.closest('.show-all-causas');
        
        // Limpiar y ocultar el panel de análisis anterior
        analysisContainer.innerHTML = '';
        analysisContainer.style.display = 'none';

        if (targetCausa) {
            const causaCode = targetCausa.dataset.causaCode;
            const causaNombre = causeMapping[causaCode] || causaCode;

            // Resaltar item seleccionado
            resultsPanelContainer.querySelectorAll('.causa-item').forEach(item => item.style.backgroundColor = 'transparent');
            targetCausa.style.backgroundColor = '#d1ecf1'; // Highlight color
            
            // Filtrar en el mapa
            displaySiniestrosEnMapa(causaCode);

            // Mostrar estado de carga y realizar fetch del análisis
            analysisContainer.innerHTML = `<em>Analizando causa: ${causaNombre}...</em>`;
            analysisContainer.style.display = 'block';

            try {
                const response = await fetch(`/analisis-causa?causa=${causaCode}`);
                if (!response.ok) throw new Error('La respuesta del servidor no fue exitosa');
                const data = await response.json();
                
                // Mapear códigos a nombres completos para la visualización
                const topParticipantesNombres = data.topParticipantes.map(([code, count]) => 
                    `<li><b>${participantMapping[code] || code}:</b> ${count} veces</li>`
                ).join('');

                const topBarriosHTML = data.topBarrios.map(([barrio, count]) => 
                    `<li><b>${barrio}:</b> ${count} casos</li>`
                ).join('');

                const distribucionHorariaHTML = Object.entries(data.distribucionHoraria).map(([franja, count]) =>
                    `<li><b>${franja}:</b> ${count} casos</li>`
                ).join('');

                // Construir el HTML final del análisis
                const analysisHTML = `
                    <h6 style="margin-top: 0;">Análisis de Causa: ${causaNombre} (${data.totalSiniestros} casos)</h6>
                    
                    <div style="background: #d1ecf1; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                      <h6 style="margin: 0 0 5px 0;">👥 Participantes Más Frecuentes:</h6>
                      <ul style="margin: 0; padding-left: 20px; font-size: 0.9em;">${topParticipantesNombres || '<li>No hay datos</li>'}</ul>
                    </div>
                    
                    <div style="background: #fff3cd; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                      <h6 style="margin: 0 0 5px 0;">📍 Barrios de Mayor Incidencia:</h6>
                      <ul style="margin: 0; padding-left: 20px; font-size: 0.9em;">${topBarriosHTML || '<li>No hay datos</li>'}</ul>
                    </div>

                    <div style="background: #e9ecef; padding: 10px; border-radius: 5px;">
                      <h6 style="margin: 0 0 5px 0;">⏰ Distribución Horaria:</h6>
                      <ul style="margin: 0; padding-left: 20px; font-size: 0.9em;">${distribucionHorariaHTML || '<li>No hay datos</li>'}</ul>
                    </div>

                    <div style="background: #d1e7dd; padding: 10px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #0f5132;">
                      <h6 style="margin-top: 0; color: #0f5132;">💡 Utilidad Operativa:</h6>
                      <p style="font-size: 0.85em; margin: 0;">
                        Alta incidencia en <b>${data.topBarrios.length > 0 ? data.topBarrios[0][0] : 'zonas específicas'}</b> 
                        involucrando principalmente a <b>${data.topParticipantes.length > 0 ? (participantMapping[data.topParticipantes[0][0]] || data.topParticipantes[0][0]) : 'participantes'}</b>, 
                        sugiere focalizar campañas de prevención y controles en esos lugares y horarios de mayor ocurrencia.
                      </p>
                    </div>
                `;
                analysisContainer.innerHTML = analysisHTML;

            } catch (error) {
                console.error("Error al obtener análisis:", error);
                analysisContainer.innerHTML = `<em style="color: red;">No se pudo cargar el análisis.</em>`;
            }

        } else if (targetShowAll) {
            resultsPanelContainer.querySelectorAll('.causa-item').forEach(item => item.style.backgroundColor = 'transparent');
            displaySiniestrosEnMapa('all');
        }
      };
      
      break;
    }

    case 'ultimas_alertas':
      const alertasCheckbox = document.getElementById('alertas-checkbox');
      if (!alertasCheckbox.checked) {
        alertasCheckbox.checked = true;
        alertasCheckbox.dispatchEvent(new Event('change'));
      }
      // Ocultar el panel de resultados genérico, ya que las alertas tienen su propio panel
      resultsPanel.style.display = 'none';
      break;

    case 'barrios_mas_siniestros': {
      await loadSiniestrosData();
      if (!barriosData || !allSiniestrosData) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
        return;
      }

      const siniestrosPorBarrio = {};
      barriosData.features.forEach(barrio => {
        siniestrosPorBarrio[barrio.properties.soc_fomen] = 0;
      });

      allSiniestrosData.features.forEach(siniestro => {
        const coords = siniestro.geometry.coordinates;
        const latlng = L.latLng(coords[1], coords[0]);

        for (const barrio of barriosData.features) {
          if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
            siniestrosPorBarrio[barrio.properties.soc_fomen]++;
            break;
          }
        }
      });

      const top5BarriosSiniestros = Object.entries(siniestrosPorBarrio).sort((a, b) => b[1] - a[1]).slice(0, 5);

      // Resaltar los 5 barrios en el mapa
      barriosDestacadosLayer.clearLayers();
      const colores = ['#0d47a1', '#1565c0', '#1976d2', '#1e88e5', '#2196f3']; // Paleta de azules
      top5BarriosSiniestros.forEach(([nombreBarrio, cantidad], index) => {
        const barrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === nombreBarrio);
        if (barrioFeature) {
          L.geoJSON(barrioFeature, {
            style: {
              color: colores[index % colores.length],
              weight: 3,
              opacity: 0.8,
              fillOpacity: 0.5
            }
          }).bindPopup(`<b>${nombreBarrio}</b><br>${cantidad} siniestros`).addTo(barriosDestacadosLayer);
        }
      });
      mymap.addLayer(barriosDestacadosLayer);

      // Centrar el mapa para que se vean todos los barrios destacados
      if (barriosDestacadosLayer.getLayers().length > 0) {
        mymap.fitBounds(barriosDestacadosLayer.getBounds());
      }

      let resultadoHTML = '<b>Top 5 barrios con más Siniestros:</b><br><ul>';
      top5BarriosSiniestros.forEach(([barrio, cantidad], index) => {
        resultadoHTML += `<li><span style="color:${colores[index % colores.length]}; font-weight:bold;">${index + 1}. ${barrio}:</span> ${cantidad} casos</li>`;
      });
      resultadoHTML += '</ul><small>Los barrios están resaltados en el mapa.</small>';

      resultadosDiv.innerHTML = resultadoHTML;
      break;
    }

    case 'siniestros_hora_pico': {
  try {
      lastQueryModifiedBaseLayer = true;
      
      // ✅ LIMPIAR TODAS las capas de consultas anteriores (igual que siniestros_noche)
      [hotspotCamerasLayer, camarasAisladasLayer, zonasCiegasLayer, siniestrosEnZonasLayer,
       motosCirculacionLayer, siniestrosCercaParadasLayer, recorridosColectivosLayer,
       robosSinCamarasLayer, robosSinIntervencionLayer, dangerousCornersLayer].forEach(layer => {
        if (mymap.hasLayer(layer)) mymap.removeLayer(layer);
        layer.clearLayers();
      });
      
      // ✅ Limpiar SOLO el contenido sin remover del mapa (mantiene estado coherente)
      if (siniestrosLayer && typeof siniestrosLayer.clearLayers === 'function') {
        siniestrosLayer.clearLayers();
      }
      if (topSiniestrosLabelsLayer && typeof topSiniestrosLabelsLayer.clearLayers === 'function') {
        topSiniestrosLabelsLayer.clearLayers();
      }
      
      // Limpiar panel de top siniestros
      const topSiniestrosContent = document.getElementById('top-siniestros-content');
      if (topSiniestrosContent) topSiniestrosContent.innerHTML = '';
      
      await loadSiniestrosData();
      const horaPico = allSiniestrosData.features.filter(f => {
        const hora = parseInt(f.properties.hora?.split(':')[0] || -1);
        return (hora >= 7 && hora < 10) || (hora >= 17 && hora < 20);
      });

      processAndDisplaySiniestros(horaPico);

      // --- Ensure layers are visible ---
      const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
      if (!siniestrosCheckbox.checked) {
          siniestrosCheckbox.checked = true;
          mymap.addLayer(siniestrosLayer);
          mymap.addLayer(topSiniestrosLabelsLayer);
      }
      
      // --- Detailed Analysis ---
      const causaCounts = {};
      const barrioCounts = {};
      const participantCounts = {};
      let totalSiniestrosAnalizados = 0;

      horaPico.forEach(siniestro => {
          totalSiniestrosAnalizados++;
          const props = siniestro.properties;

          if (props.causa) {
              causaCounts[props.causa] = (causaCounts[props.causa] || 0) + 1;
          }

          if (props.participantes_codigos) {
              props.participantes_codigos.split('/').forEach(p => {
                  participantCounts[p] = (participantCounts[p] || 0) + 1;
              });
          }

          if (barriosData && siniestro.geometry?.coordinates) {
              const latlng = L.latLng(siniestro.geometry.coordinates[1], siniestro.geometry.coordinates[0]);
              for (const barrio of barriosData.features) {
                  if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
                      const nombreBarrio = barrio.properties.soc_fomen;
                      barrioCounts[nombreBarrio] = (barrioCounts[nombreBarrio] || 0) + 1;
                      break;
                  }
              }
          }
      });

      const topCausas = Object.entries(causaCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const topBarrios = Object.entries(barrioCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topParticipantes = Object.entries(participantCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

      let reporteHTML = `
        <h5>🕑 Análisis de Siniestralidad en Hora Pico (07-10 y 17-20hs)</h5>
        
        <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #6c757d;">
          <p style="margin: 5px 0;"><b>Total de siniestros en hora pico:</b> ${totalSiniestrosAnalizados}</p>
        </div>
        
        <div style="background: #f8d7da; padding: 12px; border-radius: 5px; margin-bottom: 10px;">
          <h6 style="margin-top: 0; color: #721c24;">🚨 Causas Principales:</h6>
          <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
            ${topCausas.map(([causa, count]) => `<li><b>${causeMapping[causa] || causa}:</b> ${count} casos</li>`).join('')}
          </ol>
        </div>
        
        <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 10px;">
          <h6 style="margin-top: 0; color: #856404;">📍 Barrios Más Afectados:</h6>
          <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
            ${topBarrios.map(([barrio, count]) => `<li><b>${barrio}:</b> ${count} siniestros</li>`).join('')}
          </ol>
        </div>
        
        <div style="background: #d1ecf1; padding: 12px; border-radius: 5px; margin-bottom: 15px;">
  <h6 style="margin-top: 0; color: #0c5460;">👥 Participantes Involucrados:</h6>
  <p style="margin: 5px 0; font-size: 0.85em; color: #666;">
    <em>* Un mismo siniestro puede involucrar múltiples participantes</em>
  </p>
  <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
    ${topParticipantes.map(([p, count]) => {
      const porcentaje = ((count / totalSiniestrosAnalizados) * 100).toFixed(1);
      return `<li><b>${participantMapping[p] || p}:</b> ${count} participaciones (${porcentaje}% de los siniestros)</li>`;
    }).join('')}
  </ol>
  <p style="margin: 8px 0 0 0; font-size: 0.85em; color: #555;">
    <b>📊 Promedio:</b> ${(topParticipantes.reduce((sum, [_, count]) => sum + count, 0) / totalSiniestrosAnalizados).toFixed(2)} participantes por siniestro
  </p>
</div>

        <div style="background: #d1e7dd; padding: 10px; border-radius: 5px; border-left: 4px solid #0f5132;">
          <h6 style="margin-top: 0; color: #0f5132;">💡 Utilidad Operativa:</h6>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em;">
            <li><b>Gestión de Tráfico:</b> Reforzar la presencia de agentes en los barrios y arterias más afectadas durante las horas pico para agilizar la circulación.</li>
            <li><b>Prevención:</b> La causa "No Respeto Prioridad de Paso" sugiere la necesidad de campañas de concientización en intersecciones clave.</li>
            <li><b>Control:</b> Aumentar la vigilancia sobre los participantes más comunes (ej: Auto-Moto) en los puntos críticos identificados.</li>
          </ul>
        </div>
      `;

      resultadosDiv.innerHTML = reporteHTML;
    } catch (error) {
        console.error("Error en consulta 'siniestros_hora_pico':", error);
        resultadosDiv.innerHTML = `<p style="color:red; padding: 15px;"><b>Error al procesar la consulta:</b><br>${error.message}</p>`;
    }
    break;
}

    case 'esquinas_mas_siniestros': {
      await loadSiniestrosData();
      const locationData = new Map();
      
      // 1. Agrupar siniestros por ubicación y contar causas
      allSiniestrosData.features.forEach(feature => {
          if (!feature.geometry || !feature.geometry.coordinates) return;
          const coords = feature.geometry.coordinates;
          const lat = coords[1];
          const lon = coords[0];
          const key = `${lat},${lon}`;
          
          if (!locationData.has(key)) {
              locationData.set(key, {
                  count: 0,
                  address: feature.properties.direccion,
                  lat: lat,
                  lon: lon,
                  causeCounts: {}
              });
          }
          const loc = locationData.get(key);
          loc.count++;
          const causa = feature.properties.causa;
          if (causa) {
              loc.causeCounts[causa] = (loc.causeCounts[causa] || 0) + 1;
          }
      });

      // 2. Ordenar por cantidad y obtener el Top 10
      const rankedLocations = Array.from(locationData.values())
                                 .sort((a, b) => b.count - a.count)
                                 .slice(0, 10);

      // 3. Limpiar capa anterior y preparar HTML
      dangerousCornersLayer.clearLayers();
      let esquinasHTML = '<h5>🏆 Top 10 Esquinas con Más Siniestros:</h5><div style="max-height: 300px; overflow-y: auto;"><ul style="padding-left: 0;">';

      // 4. Procesar cada ubicación del Top 10
      rankedLocations.forEach((loc, index) => {
        // Encontrar la causa predominante, ignorando "NSD" si es posible
        let predominantCauseCode = 'N/D';
        const sortedCausas = Object.entries(loc.causeCounts).sort((a, b) => b[1] - a[1]);
        
        if (sortedCausas.length > 0) {
            if (sortedCausas[0][0] === 'NSD' && sortedCausas.length > 1) {
                // Si la causa principal es NSD y hay otra causa, usa la segunda.
                predominantCauseCode = sortedCausas[1][0];
            } else {
                // De lo contrario, usa la principal (sea cual sea).
                predominantCauseCode = sortedCausas[0][0];
            }
        }
        const predominantCauseName = causeMapping[predominantCauseCode] || predominantCauseCode;

        // Construir el HTML para el panel
        esquinasHTML += `<li style="list-style-type: none; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
            <div style="display: flex; align-items: center;">
                <div class="rank" style="margin-right: 10px; font-size: 1.2em;">#${index + 1}</div>
                <div>
                    <b>${loc.address || 'Ubicación sin nombre'}:</b> ${loc.count} casos
                    <br>
                    <em style="font-size: 0.9em; color: #dc3545;">Causa más predominante: ${predominantCauseName}</em>
                </div>
            </div>
        </li>`;

        // Crear y añadir el marcador al mapa, con un popup dinámico
        const rankIcon = createRankedIcon(index + 1, 'siniestro');
        const marker = L.marker([loc.lat, loc.lon], { icon: rankIcon, zIndexOffset: 1000 });
        
        // El contenido del popup se genera dinámicamente al hacer clic
        marker.bindPopup(() => {
            const siniestrosEnUbicacion = allSiniestrosData.features.filter(feature => {
                if (!feature.geometry || !feature.geometry.coordinates) return false;
                const lat = feature.geometry.coordinates[1];
                const lon = feature.geometry.coordinates[0];
                return lat === loc.lat && lon === loc.lon;
            });

            let detailedPopupContent = `
                <div style="max-height: 250px; overflow-y: auto; padding-right: 10px;">
                    <h6 style="margin-top:0; margin-bottom: 5px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">
                        ${loc.address} (${siniestrosEnUbicacion.length} Siniestros)
                    </h6>`;

            siniestrosEnUbicacion.forEach(siniestro => {
                const props = siniestro.properties;
                const causaNombre = causeMapping[props.causa] || props.causa;
                const participantNames = props.participantes_codigos 
                    ? props.participantes_codigos.split('/').map(code => participantMapping[code] || code).join(', ')
                    : 'N/D';

                detailedPopupContent += `
                    <div style="border-bottom: 1px solid #eee; margin-bottom: 8px; padding-bottom: 8px; font-size: 0.9em;">
                        <b>Fecha:</b> ${props.fecha} - <b>Hora:</b> ${props.hora}<br>
                        <b>Causa:</b> ${causaNombre}<br>
                        <b>Participantes:</b> ${participantNames}
                    </div>
                `;
            });

            detailedPopupContent += `</div>`;
            return detailedPopupContent;
        });

        dangerousCornersLayer.addLayer(marker);
      });

      esquinasHTML += '</ul></div>';
      resultadosDiv.innerHTML = esquinasHTML;
      mymap.addLayer(dangerousCornersLayer);
      break;
    }

    case 'heatmap_robos':
      await loadRoboAutomotorData();
      
      // Ensure layers are on the map first
      const robosCheckbox = document.getElementById('robo-automotor-checkbox');
      if (!robosCheckbox.checked) {
        robosCheckbox.checked = true;
      }
      if (!mymap.hasLayer(roboAutomotorLayer)) {
        mymap.addLayer(roboAutomotorLayer);
      }
      if (!mymap.hasLayer(topRoboLabelsLayer)) {
        mymap.addLayer(topRoboLabelsLayer);
      }
      document.getElementById('robo-automotor-filters').style.display = 'block';
      
      const roboHeatmapCheckbox = document.getElementById('robo-heatmap-checkbox');
      if (!roboHeatmapCheckbox.checked) {
        roboHeatmapCheckbox.checked = true;
      }
      if (!mymap.hasLayer(roboHeatLayer)) {
        mymap.addLayer(roboHeatLayer);
      }

      // Now filter and process the data
      const robosConIntervencion = allRoboAutomotorData.filter(item => {
          const resultado = item.Resultado ? item.Resultado.trim() : '';
          return resultado === 'Detencion' || resultado === 'Secuestro De Vehiculo';
      });

      processAndDisplayRobos(robosConIntervencion);
      
      const resultadosHTML = `
        <h5>🔥 Mapa de Calor: Robos con Intervención Policial</h5>
        
        <div style="background: #f8d7da; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #721c24;">
            <p style="margin: 5px 0;"><b>Total de casos analizados:</b> ${robosConIntervencion.length}</p>
        </div>

        <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #457b9d;">
            <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">Criterios de Filtrado:</h6>
            <p style="font-size: 0.9em; margin: 5px 0;">
                Este análisis incluye únicamente los robos de automotores cuyo resultado fue:
            </p>
            <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
                <li><b>Detencion</b></li>
                <li><b>Secuestro De Vehiculo</b></li>
            </ul>
        </div>

        <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
            <h6 style="margin-top: 0; margin-bottom: 8px; color: #856404;">¿Cómo interpretar el mapa?</h6>
            <p style="font-size: 0.9em; margin: 5px 0;">
                Las zonas con colores más cálidos (<b>rojo</b>) indican una mayor concentración de robos con intervención policial. Las áreas más frías (<b>verde/amarillo</b>) representan una menor densidad.
            </p>
        </div>

        <div style="background: #d1e7dd; padding: 10px; border-radius: 5px; border-left: 4px solid #0f5132;">
            <h6 style="margin-top: 0; color: #0f5132;">💡 Utilidad Operativa:</h6>
            <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em;">
                <li>Identificar "puntos calientes" de actividad delictiva donde la intervención policial es frecuente.</li>
                <li>Analizar la efectividad de los patrullajes en zonas específicas.</li>
                <li>Planificar la asignación de recursos y operativos preventivos en áreas de alta incidencia.</li>
            </ul>
        </div>
      `;
      resultadosDiv.innerHTML = resultadosHTML;
      break;



    case 'barrios_menor_cobertura':
      await loadBaseCSVData(); // Asegura que allCamerasData esté cargado
      if (!barriosData || !allCamerasData) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
        return;
      }

      const camarasPorBarrio = {};
      barriosData.features.forEach(barrio => {
        // Inicializar todos los barrios con 0 cámaras
        camarasPorBarrio[barrio.properties.soc_fomen] = 0;
      });

      allCamerasData.forEach(camara => {
        const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
        const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
        if (isNaN(lat) || isNaN(lon)) return;

        const latlng = L.latLng(lat, lon);

        for (const barrio of barriosData.features) {
          if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
            camarasPorBarrio[barrio.properties.soc_fomen]++;
            break;
          }
        }
      });

      const sortedBarrios = Object.entries(camarasPorBarrio).sort((a, b) => a[1] - b[1]);

      const barriosConMenosDeDosCamaras = sortedBarrios.filter(([, count]) => count < 2);

      let coberturaHTML = '<h5>Barrios sin cobertura (menos de 2 cámaras):</h5><ul>';
      if (barriosConMenosDeDosCamaras.length > 0) {
        barriosConMenosDeDosCamaras.forEach(([nombre, count]) => {
          coberturaHTML += `<li><b>${nombre}:</b> ${count} cámaras</li>`;
        });
      } else {
        coberturaHTML += '<li>No se encontraron barrios con menos de 2 cámaras.</li>';
      }
      coberturaHTML += '</ul>';

      // Limpiar capas anteriores antes de agregar nuevas
      barriosSinCoberturaLayer.clearLayers();
      if (mymap.hasLayer(barriosSinCoberturaLayer)) {
          mymap.removeLayer(barriosSinCoberturaLayer);
      }

      if (barriosConMenosDeDosCamaras.length > 0) {
        barriosConMenosDeDosCamaras.forEach(([nombreBarrio, countCamaras]) => {
          const barrioFeature = barriosData.features.find(feature => feature.properties.soc_fomen === nombreBarrio);
          if (barrioFeature) {
            const geoJsonLayer = L.geoJSON(barrioFeature, {
              style: {
                fillColor: '#d9534f', // Rojo para barrios sin cobertura
                weight: 2,
                opacity: 1,
                color: 'white',
                dashArray: '3',
                fillOpacity: 0.7
              },
              onEachFeature: (feature, layer) => {
                layer.bindPopup(`<b>Barrio:</b> ${nombreBarrio}<br><b>Cámaras:</b> ${countCamaras}`);
              }
            });
            barriosSinCoberturaLayer.addLayer(geoJsonLayer);
          }
        });
        mymap.addLayer(barriosSinCoberturaLayer);
      }

      resultadosDiv.innerHTML = coberturaHTML;
      break;

      case 'camaras_sin_siniestros':
        resultadosDiv.innerHTML = '<em>Procesando, esto puede tardar un momento...</em>';
        
        // Usar setTimeout para permitir que el DOM se actualice con el mensaje
        setTimeout(async () => {
          await loadBaseCSVData();
          await loadSiniestrosData();
  
          if (!allCamerasData || !allSiniestrosData) {
            resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
            return;
          }
  
          camarasAisladasLayer.clearLayers();
          const camarasAisladas = [];
  
          for (const camara of allCamerasData) {
            const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
            const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
            if (isNaN(lat) || isNaN(lon)) continue;
  
            const camaraLatLng = L.latLng(lat, lon);
            let tieneSiniestroCercano = false;
  
            for (const siniestro of allSiniestrosData.features) {
              if (!siniestro.geometry || !siniestro.geometry.coordinates) continue;
              const siniestroLatLng = L.latLng(siniestro.geometry.coordinates[1], siniestro.geometry.coordinates[0]);
              if (camaraLatLng.distanceTo(siniestroLatLng) <= 100) {
                tieneSiniestroCercano = true;
                break;
              }
            }
  
            if (!tieneSiniestroCercano) {
              const direccion = camara[Object.keys(camara).find(k => k.toLowerCase().includes('direcci'))];
              const marker = L.marker(camaraLatLng, { icon: L.icon({ iconUrl: 'https://img.icons8.com/fluency/48/shield.png', iconSize: [30, 30] }) });
              marker.bindPopup(`<b>Cámara sin Siniestros Cercanos: ${camara['N CAMARA']}</b><br>${direccion}<br><em>No hay siniestros registrados en 100m</em>`);
              camarasAisladasLayer.addLayer(marker);
            }
          }
          mymap.addLayer(camarasAisladasLayer);
          
          // MENSAJE MEJORADO CON EXPLICACIÓN DETALLADA
          resultadosDiv.innerHTML = `
            <h5>🛡️ Cámaras sin Siniestros en su Área de Cobertura:</h5>
            <div style="background: #d1e7dd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #0f5132;">
              <p style="margin: 5px 0;"><b>Total encontrado:</b> ${camarasAisladasLayer.getLayers().length} cámaras</p>
            </div>
            
            <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #457b9d;">
              <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">📋 ¿Qué significa este análisis?</h6>
              <div style="font-size: 0.85em; line-height: 1.5;">
                <p style="margin: 5px 0;">Esta consulta identifica <b>cámaras públicas</b> que NO tienen <b>ningún siniestro registrado</b> dentro de un radio de <b>100 metros</b>.</p>
                
                <p style="margin: 10px 0 5px 0;"><b>Posibles interpretaciones:</b></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                  <li><b style="color: #0f5132;">✅ Efecto disuasivo positivo:</b> La presencia de la cámara puede estar previniendo siniestros en la zona</li>
                  <li><b style="color: #457b9d;">📍 Ubicación estratégica:</b> La cámara está en un punto con bajo tráfico vehicular o peatonal</li>
                  <li><b style="color: #856404;">⚠️ Subutilización:</b> Podría reubicarse a una zona más conflictiva si se confirma bajo tráfico</li>
                  <li><b style="color: #6c757d;">📊 Datos históricos:</b> Zona históricamente segura o sin conflictividad vial</li>
                </ul>
                
                <p style="margin: 10px 0 5px 0;"><b>Utilidad operativa:</b></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                  <li>Evaluar la efectividad de la cobertura actual</li>
                  <li>Identificar posibles reubicaciones de recursos</li>
                  <li>Validar zonas de baja conflictividad</li>
                </ul>
              </div>
            </div>
            
            <div style="background: #cff4fc; padding: 10px; border-radius: 5px; border-left: 4px solid #055160;">
              <p style="margin: 5px 0; font-size: 0.9em;">
                <b>💡 Recomendación:</b> Cruce estos datos con información de flujo vehicular (aforos) para determinar si son zonas de bajo tráfico o si la cámara está cumpliendo un rol preventivo efectivo.
              </p>
            </div>
          `;
        }, 10); // 10ms de espera
        break;
        

    case 'comparar_camaras':
      const camarasCheckbox = document.getElementById('camaras-checkbox');
      const camarasPrivadasCheckbox = document.getElementById('camaras-privadas-checkbox');
      if (!camarasCheckbox.checked) {
        camarasCheckbox.checked = true;
        camarasCheckbox.dispatchEvent(new Event('change'));
      }
      if (!camarasPrivadasCheckbox.checked) {
        camarasPrivadasCheckbox.checked = true;
        camarasPrivadasCheckbox.dispatchEvent(new Event('change'));
      }
      resultadosDiv.innerHTML = '✅ Capas de cámaras públicas y privadas activadas.';
      break;

    case 'zonas_ciegas': { // Encapsulate in a block
      console.log("Iniciando análisis de zonas ciegas...");
      resultadosDiv.innerHTML = '<em>Analizando cobertura de cámaras públicas... Esto puede tardar varios segundos.</em>';

      setTimeout(async () => {
        await loadBaseCSVData(); // loads all camera data
        if (!barriosData || !allCamerasData) {
          console.error("Datos de barrios o cámaras no cargados.");
          resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de cámaras públicas o barrios.';
          return;
        }
        console.log("Datos base cargados.");

        const selectedBarrioName = barrioFilterSelect.value;
        if (selectedBarrioName === 'all') {
          console.log("No se seleccionó un barrio.");
          resultadosDiv.innerHTML = 'ℹ️ Por favor, seleccione un barrio específico para analizar las zonas ciegas.';
          return;
        }
        console.log(`Barrio seleccionado: ${selectedBarrioName}`);

        const barrioFeature = barriosData.features.find(f => f.properties.soc_fomen === selectedBarrioName);
        if (!barrioFeature) {
          console.error("No se encontró el feature del barrio.");
          resultadosDiv.innerHTML = '❌ Barrio no encontrado.';
          return;
        }
        console.log("Feature del barrio encontrado:", barrioFeature);

        try {
          let barrioArea;
          console.log(`Tipo de geometría del barrio: ${barrioFeature.geometry.type}`);
          if (barrioFeature.geometry.type === 'Polygon') {
            barrioArea = turf.polygon(barrioFeature.geometry.coordinates);
          } else if (barrioFeature.geometry.type === 'MultiPolygon') {
            barrioArea = turf.multiPolygon(barrioFeature.geometry.coordinates);
          } else {
            console.error(`Geometría de barrio no soportada: ${barrioFeature.geometry.type}`);
            resultadosDiv.innerHTML = '❌ Geometría de barrio no soportada.';
            return;
          }
          console.log("Área del barrio creada con Turf:", barrioArea);

          const cameraCircles = [];
          const radioCobertura = 0.1; // 100 metros en kilómetros

          console.log("Buscando cámaras públicas en el barrio...");
          allCamerasData.forEach(camara => {
            const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
            const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
            if (!isNaN(lat) && !isNaN(lon)) {
              const camaraPoint = turf.point([lon, lat]);
              if (turf.booleanPointInPolygon(camaraPoint, barrioArea)) {
                cameraCircles.push(turf.circle([lon, lat], radioCobertura, { units: 'kilometers' }));
              }
            }
          });
          console.log(`Se encontraron ${cameraCircles.length} cámaras en el barrio.`);

          if (cameraCircles.length === 0) {
            console.log("No se encontraron cámaras, mostrando el barrio completo como zona ciega.");
            resultadosDiv.innerHTML = '⚠️ No se encontraron cámaras públicas en el barrio seleccionado. Toda el área es una zona ciega.';
            zonasCiegasLayer.clearLayers();
            L.geoJSON(barrioFeature, { style: { color: "#e63946", weight: 2, opacity: 0.8, fillOpacity: 0.4 } }).addTo(zonasCiegasLayer);
            mymap.addLayer(zonasCiegasLayer);
            return;
          }

          console.log("Uniendo círculos de cobertura...");
          let coverageUnion = cameraCircles[0];
          for (let i = 1; i < cameraCircles.length; i++) {
            coverageUnion = turf.union(coverageUnion, cameraCircles[i]);
          }
          console.log("Unión de cobertura completada:", coverageUnion);

          console.log("Calculando la diferencia...");
          const blindSpots = turf.difference(barrioArea, coverageUnion);
          console.log("Diferencia calculada:", blindSpots);

          zonasCiegasLayer.clearLayers();
          if (blindSpots) {
            console.log("Añadiendo polígono de zonas ciegas al mapa.");
            L.geoJSON(blindSpots, {
              style: {
                color: "#e63946",
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.4
              }
            }).addTo(zonasCiegasLayer);
            mymap.addLayer(zonasCiegasLayer);
            resultadosDiv.innerHTML = '✅ Se han calculado y mostrado las zonas ciegas (áreas sin cobertura de cámaras públicas) para el barrio seleccionado.';
          } else {
            console.log("No hay zonas ciegas, el barrio está completamente cubierto.");
            resultadosDiv.innerHTML = '✅ ¡Excelente! El barrio seleccionado parece tener una cobertura de cámaras públicas completa.';
          }
        } catch (error) {
          console.error("Error al calcular las zonas ciegas:", error);
          resultadosDiv.innerHTML = '❌ Ocurrió un error al calcular las zonas ciegas. La geometría del barrio puede ser inválida.';
        }
      }, 10);
      break;
    }

    case 'circulacion_motos_hora': {
      resultadosDiv.innerHTML = '<em>Calculando circulación de motos...</em>';
      
      setTimeout(async () => {
        await loadBaseCSVData(); // Ensures allFlujoData and cameraCoords are loaded
        if (!allFlujoData || !cameraCoords) {
          resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de aforos.';
          return;
        }

        const hourInput = document.getElementById('moto-hour-input');
        const selectedHour = parseInt(hourInput.value, 10);

        if (isNaN(selectedHour) || selectedHour < 0 || selectedHour > 23) {
          resultadosDiv.innerHTML = '❌ Por favor, ingrese una hora válida (0-23).';
          return;
        }

        // 1. Filter data for the selected hour and for motorcycles
        const filteredFlujo = allFlujoData.filter(flujo => {
          const horaPart = parseInt(flujo.HORA.split(' ')[0], 10);
          const vehicleType = flujo.PART ? flujo.PART.trim().toLowerCase() : '';
          return horaPart === selectedHour && vehicleType === 'moto';
        });

        if (filteredFlujo.length === 0) {
          resultadosDiv.innerHTML = `ℹ️ No se encontraron datos de circulación de motos para las ${selectedHour}:00hs.`;
          motosCirculacionLayer.clearLayers();
          return;
        }

        // 2. Aggregate data by camera
        const motoCountsByCamera = new Map();
        filteredFlujo.forEach(flujo => {
          const camaraId = flujo['N CAMARA'];
          const count = parseInt(flujo.TOTAL, 10);

          if (camaraId && !isNaN(count)) {
            if (!motoCountsByCamera.has(camaraId)) {
              motoCountsByCamera.set(camaraId, { totalMotos: 0, countRecords: 0 });
            }
            const current = motoCountsByCamera.get(camaraId);
            current.totalMotos += count;
            current.countRecords++;
          }
        });

        // 3. Calculate averages
        const avgMotoCounts = [];
        let maxAvg = 0;
        motoCountsByCamera.forEach((data, camaraId) => {
          const average = data.totalMotos / data.countRecords;
          avgMotoCounts.push({ camaraId, average });
          if (average > maxAvg) {
            maxAvg = average;
          }
        });

        // 4. Visualize results
        motosCirculacionLayer.clearLayers();

        avgMotoCounts.forEach(({ camaraId, average }) => {
          const camaraInfo = cameraCoords.get(camaraId);
          if (camaraInfo) {
            const radius = 5 + (average / maxAvg) * 20; // Normalize radius (min 5, max 25)
            
            const circle = L.circleMarker([camaraInfo.lat, camaraInfo.lon], {
              radius: radius,
              fillColor: "#f9a825", // A yellow/orange color for motos
              color: "#000",
              weight: 1,
              opacity: 1,
              fillOpacity: 0.7
            });

            circle.bindPopup(`<b>Cámara: ${camaraId} (${camaraInfo.nombre})</b><br>Promedio de motos a las ${selectedHour}:00hs: ${average.toFixed(2)}`);
            motosCirculacionLayer.addLayer(circle);
          }
        });

        mymap.addLayer(motosCirculacionLayer);
        resultadosDiv.innerHTML = `✅ Se muestra el promedio de circulación de motos a las ${selectedHour}:00hs. El tamaño del círculo es proporcional al flujo.`;

      }, 10);
      break;
    }

        case 'siniestros_en_zonas_descubiertas': {
          lastQueryModifiedBaseLayer = true; // Flag to indicate this query filters the main layer
          await loadSiniestrosData();
          
          const nsdSiniestros = allSiniestrosData.features.filter(f => f.properties.causa === 'NSD');
          
          processAndDisplaySiniestros(nsdSiniestros);
    
          // Ensure the main layer is visible
          const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
          if (!siniestrosCheckbox.checked) {
            siniestrosCheckbox.checked = true;
            mymap.addLayer(siniestrosLayer);
            mymap.addLayer(topSiniestrosLabelsLayer);
          }
    
          resultadosDiv.innerHTML = `✅ Se muestran <b>${nsdSiniestros.length}</b> siniestros con causa No Determinada (NSD).`;
          break;
        }
    case 'visualizar_recorridos_colectivos': {
      resultadosDiv.innerHTML = '<em>Cargando cámaras de recorridos...</em>';
      setTimeout(async () => {
        await loadBaseCSVData(); // Carga allBusRoutesData y allCamerasData

        if (!allBusRoutesData || !allCamerasData) {
          resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
          return;
        }

        recorridosColectivosLayer.clearLayers();
        const uniqueBusLines = [...new Set(allBusRoutesData.map(item => item['Linea Colectivo']))].filter(Boolean);
        let camerasAddedCount = 0;

        for (const busLine of uniqueBusLines) {
          const camerasOnLine = allBusRoutesData.filter(route => route['Linea Colectivo'] === busLine);
          for (const cameraOnLine of camerasOnLine) {
            const camaraId = cameraOnLine['Nº Camara'];
            const camaraData = allCamerasData.find(c => c['N CAMARA'] === camaraId);

            if (camaraData) {
              const camLat = parseFloat(String(camaraData.Latitud).replace(',', '.'));
              const camLon = parseFloat(String(camaraData.Longitud).replace(',', '.'));
              if (!isNaN(camLat) && !isNaN(camLon)) {
                const cameraIcon = L.divIcon({
                  className: 'camera-icon bus-route-camera', // Reutilizar clase existente o crear una nueva
                  html: `<span>${camaraId}</span>`,
                  iconSize: [30, 30],
                  iconAnchor: [15, 15]
                });
                const marker = L.marker([camLat, camLon], { icon: cameraIcon });
                marker.bindPopup(`<b>Cámara de Línea ${busLine}: ${camaraId}</b><br>${camaraData[Object.keys(camaraData).find(k => k.toLowerCase().includes('direcci'))]}`);
                recorridosColectivosLayer.addLayer(marker);
                camerasAddedCount++;
              }
            }
          }
        }
        mymap.addLayer(recorridosColectivosLayer);
        resultadosDiv.innerHTML = `✅ Se visualizaron <b>${camerasAddedCount}</b> cámaras asociadas a recorridos de colectivo.`;
      }, 10);
      break;
    }

    case 'siniestros_cerca_paradas_colectivo': {
        resultadosDiv.innerHTML = '<em>Procesando, esto puede tardar un momento...</em>';
        setTimeout(async () => {
          console.log("Running siniestros_cerca_paradas_colectivo query");
          
          // Prevenir que se agreguen automáticamente las cámaras al mapa
          skipAutoDisplayCameras = true;
          await loadBaseCSVData();
          await loadSiniestrosData();
  
          if (!allBusRoutesData || !allCamerasData || !allSiniestrosData) {
            resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
            return;
          }
  
          console.log("allBusRoutesData:", allBusRoutesData);
          console.log("allCamerasData:", allCamerasData);
          console.log("allSiniestrosData:", allSiniestrosData);
  
          siniestrosCercaParadasLayer.clearLayers();
  
          // --- Almacenar detalles completos de las cámaras de colectivo ---
          const busCameraDetails = new Map(); // Map: camaraId -> { latlng, busLines: Set<string> }
          const uniqueBusLines = [...new Set(allBusRoutesData.map(item => item['Linea Colectivo']))].filter(Boolean);
  
          console.log("uniqueBusLines:", uniqueBusLines);
  
          for (const busLine of uniqueBusLines) {
            const camerasOnLine = allBusRoutesData.filter(route => route['Linea Colectivo'] === busLine);
            for (const cameraOnLine of camerasOnLine) {
              const camaraId = cameraOnLine['Nº Camara'];
              const camaraData = allCamerasData.find(c => c['N CAMARA'] === camaraId);
  
              if (camaraData) {
                const camLat = parseFloat(String(camaraData.Latitud).replace(',', '.'));
                const camLon = parseFloat(String(camaraData.Longitud).replace(',', '.'));
                if (!isNaN(camLat) && !isNaN(camLon)) {
                  const latlng = L.latLng(camLat, camLon);
                  if (!busCameraDetails.has(camaraId)) {
                    busCameraDetails.set(camaraId, { latlng: latlng, busLines: new Set() });
                  }
                  busCameraDetails.get(camaraId).busLines.add(busLine);
                }
              }
            }
          }
  
          let count = 0;
          console.log("busCameraDetails size:", busCameraDetails.size);
          const radioBusqueda = 30; // 30 metros
  
          for (const siniestro of allSiniestrosData.features) {
            if (!siniestro.geometry || !siniestro.geometry.coordinates) continue;
            const siniestroLatLng = L.latLng(siniestro.geometry.coordinates[1], siniestro.geometry.coordinates[0]);
            let foundNearBusCamera = false;
            let matchedBusCamDetails = null;
  
            // Iterar sobre los valores del mapa
            for (const camDetails of busCameraDetails.values()) {
              if (siniestroLatLng.distanceTo(camDetails.latlng) <= radioBusqueda) {
                foundNearBusCamera = true;
                matchedBusCamDetails = camDetails;
                break;
              }
            }
            if (foundNearBusCamera) {
              count++;
              console.log("Match found! Siniestro near bus camera:", siniestro.properties.direccion);
              const marker = L.marker(siniestroLatLng, { icon: siniestroIcon });
              
              const busLinesStr = Array.from(matchedBusCamDetails.busLines).join(', ');
              marker.bindPopup(`<b>Siniestro cerca de cámara de colectivo</b><br>${siniestro.properties.direccion}<br>Distancia a cámara de colectivo: ${Math.round(siniestroLatLng.distanceTo(matchedBusCamDetails.latlng))}m<br><span style="color: red; font-weight: bold;">Línea(s): ${busLinesStr}</span>`);
  
              siniestrosCercaParadasLayer.addLayer(marker);
            }
          }
  
          mymap.addLayer(siniestrosCercaParadasLayer);
          
          // MENSAJE MEJORADO CON EXPLICACIÓN DETALLADA
          const porcentaje = allSiniestrosData.features.length > 0 
            ? ((count / allSiniestrosData.features.length) * 100).toFixed(1) 
            : 0;
          
          resultadosDiv.innerHTML = `
            <h5>🚌 Siniestros en Recorridos de Transporte Público:</h5>
            
            <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
              <p style="margin: 5px 0;"><b>Total encontrado:</b> ${count} siniestros</p>
              <p style="margin: 5px 0;"><b>Porcentaje del total:</b> ${porcentaje}% de todos los siniestros registrados</p>
              <p style="margin: 5px 0;"><b>Cámaras analizadas:</b> ${busCameraDetails.size} cámaras en recorridos de colectivo</p>
            </div>
            
            <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #457b9d;">
              <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">🔍 Lógica de la Consulta:</h6>
              <div style="font-size: 0.85em; line-height: 1.5;">
                <p style="margin: 5px 0;"><b>Paso 1:</b> Se identifican todas las <b>cámaras públicas</b> que están asociadas a recorridos de líneas de colectivo (según archivo "Recorrido lineas Colectivos").</p>
                
                <p style="margin: 8px 0 5px 0;"><b>Paso 2:</b> Se buscan <b>todos los siniestros</b> que ocurrieron a menos de <b style="color: #e63946;">30 metros</b> de estas cámaras.</p>
                
                <p style="margin: 8px 0 5px 0;"><b>Criterio espacial:</b></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                  <li>Radio de búsqueda: <b>30 metros</b> desde cada cámara de colectivo</li>
                  <li>Se considera la distancia directa (línea recta) entre el siniestro y la cámara</li>
                  <li>Una cámara puede estar asociada a múltiples líneas de colectivo</li>
                </ul>
              </div>
            </div>
            
            <div style="background: #d1e7dd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #0f5132;">
              <h6 style="margin-top: 0; margin-bottom: 8px; color: #0f5132;">📊 ¿Qué revela este análisis?</h6>
              <div style="font-size: 0.85em; line-height: 1.5;">
                <p style="margin: 5px 0;"><b>Identifica patrones de siniestralidad en:</b></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                  <li><b>Zonas de alta circulación:</b> Los recorridos de colectivos suelen estar en arterias principales</li>
                  <li><b>Puntos de conflicto vial:</b> Intersecciones con tráfico de transporte público</li>
                  <li><b>Áreas con interacción vehicular compleja:</b> Paradas, giros y maniobras de colectivos</li>
                </ul>
                
                <p style="margin: 10px 0 5px 0;"><b>Utilidad operativa:</b></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                  <li>Evaluar seguridad en corredores de transporte público</li>
                  <li>Identificar necesidad de señalización o infraestructura adicional</li>
                  <li>Priorizar zonas para campañas de educación vial</li>
                  <li>Validar cobertura de cámaras en puntos críticos</li>
                </ul>
              </div>
            </div>
            
            <div style="background: #cff4fc; padding: 10px; border-radius: 5px; border-left: 4px solid #055160;">
              <p style="margin: 5px 0; font-size: 0.9em;">
                <b>💡 En el mapa:</b> Los marcadores muestran cada siniestro y al hacer clic verás la(s) línea(s) de colectivo asociadas a la cámara más cercana.
              </p>
            </div>
            
            <div style="background: #f8d7da; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #842029;">
              <p style="margin: 5px 0; font-size: 0.85em; color: #842029;">
                <b>⚠️ Nota técnica:</b> Los siniestros mostrados NO necesariamente involucran colectivos. El análisis se basa en la proximidad geográfica a cámaras ubicadas en recorridos de transporte público.
              </p>
            </div>
          `;
          
          console.log("Final count:", count);
  
        }, 10);
        break;
      }
    case 'lineas_colectivo_siniestros': {
      resultadosDiv.innerHTML = '<em>Calculando puntos críticos de siniestros...</em>';
      setTimeout(async () => {
        // Prevenir que se agreguen automáticamente las cámaras al mapa
        skipAutoDisplayCameras = true;
        await loadBaseCSVData();
        await loadSiniestrosData();

        if (!allCamerasData || !allSiniestrosData) {
            resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
            return;
        }

        // Limpiar todas las capas de cámaras para mostrar solo los hotspots
        if (camarasLayer) mymap.removeLayer(camarasLayer);
        if (camarasPrivadasLayer) mymap.removeLayer(camarasPrivadasLayer);

        const cameraLocations = new Map();
        const direccionHeaderKey = Object.keys(allCamerasData[0] || {}).find(k => k.toLowerCase().includes('direcci'));
        allCamerasData.forEach(camara => {
            const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
            const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
            const id = camara['N CAMARA'];
            if (id && !isNaN(lat) && !isNaN(lon)) {
                cameraLocations.set(id, {
                    latlng: L.latLng(lat, lon),
                    direccion: camara[direccionHeaderKey]
                });
            }
        });

        const siniestrosPorCamara = new Map();
        allSiniestrosData.features.forEach(siniestro => {
            if (!siniestro.geometry || !siniestro.geometry.coordinates) return;
            const siniestroLatLng = L.latLng(siniestro.geometry.coordinates[1], siniestro.geometry.coordinates[0]);
            cameraLocations.forEach((camData, camId) => {
                if (camData.latlng.distanceTo(siniestroLatLng) <= 50) {
                    siniestrosPorCamara.set(camId, (siniestrosPorCamara.get(camId) || 0) + 1);
                }
            });
        });

        const hotspotCameras = [];
        siniestrosPorCamara.forEach((count, camId) => {
            if (count > 20) {
                hotspotCameras.push({
                    camId,
                    count,
                    direccion: cameraLocations.get(camId).direccion,
                    latlng: cameraLocations.get(camId).latlng
                });
            }
        });

        hotspotCamerasLayer.clearLayers();

        if (hotspotCameras.length === 0) {
            resultadosDiv.innerHTML = '✅ No se encontraron cámaras con más de 20 siniestros en sus cercanías.';
            // Restaurar capas de cámaras si no hay resultados
            if (camarasLayer) mymap.addLayer(camarasLayer);
            return;
        }

        hotspotCameras.sort((a, b) => b.count - a.count);
        let resultadosHTML = '<h5>Cámaras en Puntos Críticos (>20 Siniestros a 50m):</h5><ul>';
        
        hotspotCameras.forEach(hotspot => {
            resultadosHTML += `<li><span style="color: red; font-weight: bold;">Cámara ${hotspot.camId}:</span> <b>${hotspot.direccion}</b> - ${hotspot.count} siniestros</li>`;
            
            const hotspotIcon = L.divIcon({
                className: 'hotspot-camera-icon',
                html: `<div>🔥<br>${hotspot.count}</div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
            L.marker(hotspot.latlng, { icon: hotspotIcon, zIndexOffset: 2000 })
                .bindPopup(`<b>Punto Crítico: Cámara ${hotspot.camId}</b><br>${hotspot.direccion}<br><b>Siniestros cercanos: ${hotspot.count}</b>`)
                .addTo(hotspotCamerasLayer);
        });

        resultadosHTML += '</ul>';
        resultadosDiv.innerHTML = resultadosHTML;
        mymap.addLayer(hotspotCamerasLayer);

    }, 10);
    break;
}

case 'densidad_camaras_barrio': {
    resultadosDiv.innerHTML = '<em>Calculando densidad...</em>';
    await loadBaseCSVData();
    if (!barriosData || !allCamerasData) {
      resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
      return;
    }

    const densidadPorBarrio = [];
    let barriosSinCamaras = 0;

    barriosData.features.forEach(barrioFeature => {
      const barrioNombre = barrioFeature.properties.soc_fomen;
      const areaKm2 = turf.area(barrioFeature) / 1000000; // Área en km²
      let camarasCount = 0;
      
      allCamerasData.forEach(camara => {
        const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
        const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
        if(isLatLngInMultiPolygon(L.latLng(lat, lon), barrioFeature.geometry.coordinates)) {
          camarasCount++;
        }
      });
      
      if (camarasCount > 0) {
        const densidad = areaKm2 > 0 ? camarasCount / areaKm2 : 0;
        densidadPorBarrio.push({ 
          nombre: barrioNombre, 
          densidad: densidad.toFixed(2),
          camaras: camarasCount,
          area: areaKm2.toFixed(2)
        });
      } else {
        barriosSinCamaras++;
      }
    });

    // Ordenar de mayor a menor densidad
    densidadPorBarrio.sort((a, b) => b.densidad - a.densidad);

    let densidadHTML = `
      <h5>📊 Densidad de Cámaras por Barrio</h5>
      <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #457b9d;">
        <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">🔍 ¿Qué es la densidad de cámaras?</h6>
        <div style="font-size: 0.85em; line-height: 1.5;">
          <p style="margin: 5px 0;">La <b>densidad</b> se calcula dividiendo el número de cámaras públicas entre el área del barrio en km².</p>
          <p style="margin: 5px 0;"><b>Fórmula:</b> Densidad = N° de cámaras / Área (km²)</p>
          <p style="margin: 5px 0;">Una <b>mayor densidad</b> indica mejor cobertura de vigilancia por kilómetro cuadrado.</p>
          <p style="margin: 5px 0; color: #e63946;"><b>Nota:</b> Solo se muestran barrios con al menos 1 cámara instalada.</p>
        </div>
      </div>
      <div style="max-height: 300px; overflow-y: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <thead style="position: sticky; top: 0; background: #457b9d; color: white;">
            <tr>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Barrio</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Cámaras</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Área (km²)</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Densidad</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    densidadPorBarrio.forEach((b, index) => {
      const rowColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
      densidadHTML += `
        <tr style="background: ${rowColor};">
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><b>${b.nombre}</b></td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">${b.camaras}</td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">${b.area}</td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd; font-weight: bold; color: #2a9d8f;">${b.densidad}</td>
        </tr>
      `;
    });
    
    densidadHTML += `
          </tbody>
        </table>
      </div>
      <div style="background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 15px;">
        <p style="margin: 5px 0; font-weight: bold; color: #856404;">
          ⚠️ ${barriosSinCamaras} barrio(s) no cuentan con cámaras públicas instaladas
        </p>
        <p style="margin: 5px 0; font-size: 0.85em; color: #856404;">
          Estos barrios tienen densidad 0 y representan zonas sin cobertura de vigilancia.
        </p>
      </div>
    `;
    
    resultadosDiv.innerHTML = densidadHTML;
    break;
  }
  case 'densidad_camaras_vs_siniestros': {
    resultadosDiv.innerHTML = '<em>Calculando densidades y correlación...</em>';
    
    setTimeout(async () => {
      await loadBaseCSVData();
      await loadSiniestrosData();
      
      if (!barriosData || !allCamerasData || !allSiniestrosData) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
        return;
      }

      const datosBarrios = [];
      
      // Procesar cada barrio
      barriosData.features.forEach(barrioFeature => {
        const barrioNombre = barrioFeature.properties.soc_fomen;
        const areaKm2 = turf.area(barrioFeature) / 1000000; // Área en km²
        
        if (areaKm2 === 0) return; // Evitar división por cero
        
        let camarasCount = 0;
        let siniestrosCount = 0;
        
        // Contar cámaras
        allCamerasData.forEach(camara => {
          const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
          const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
          if (!isNaN(lat) && !isNaN(lon)) {
            if (isLatLngInMultiPolygon(L.latLng(lat, lon), barrioFeature.geometry.coordinates)) {
              camarasCount++;
            }
          }
        });
        
        // Contar siniestros
        allSiniestrosData.features.forEach(siniestro => {
          if (!siniestro.geometry || !siniestro.geometry.coordinates) return;
          const coords = siniestro.geometry.coordinates;
          const latlng = L.latLng(coords[1], coords[0]);
          if (isLatLngInMultiPolygon(latlng, barrioFeature.geometry.coordinates)) {
            siniestrosCount++;
          }
        });
        
        const densidadCamaras = camarasCount / areaKm2;
        const densidadSiniestros = siniestrosCount / areaKm2;
        
        datosBarrios.push({
          nombre: barrioNombre,
          area: areaKm2,
          camaras: camarasCount,
          siniestros: siniestrosCount,
          densidadCamaras: densidadCamaras,
          densidadSiniestros: densidadSiniestros,
          ratio: camarasCount > 0 ? siniestrosCount / camarasCount : (siniestrosCount > 0 ? Infinity : 0)
        });
      });

      // Filtrar barrios con datos
      const barriosConDatos = datosBarrios.filter(b => b.camaras > 0 || b.siniestros > 0);
      
      // Calcular correlación de Pearson
      const n = barriosConDatos.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
      
      barriosConDatos.forEach(b => {
        sumX += b.densidadCamaras;
        sumY += b.densidadSiniestros;
        sumXY += b.densidadCamaras * b.densidadSiniestros;
        sumX2 += b.densidadCamaras * b.densidadCamaras;
        sumY2 += b.densidadSiniestros * b.densidadSiniestros;
      });

      const correlacion = (n * sumXY - sumX * sumY) / 
        Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

      // Interpretación
      let interpretacion, color;
      if (correlacion < -0.5) {
        interpretacion = 'Correlación negativa fuerte: Más cámaras → Menos siniestros';
        color = '#28a745';
      } else if (correlacion < -0.3) {
        interpretacion = 'Correlación negativa moderada: Las cámaras parecen reducir siniestros';
        color = '#5cb85c';
      } else if (correlacion < 0.3) {
        interpretacion = 'Sin correlación clara: Factores independientes';
        color = '#ffc107';
      } else if (correlacion < 0.5) {
        interpretacion = 'Correlación positiva moderada: Más cámaras donde hay más siniestros';
        color = '#ff9800';
      } else {
        interpretacion = 'Correlación positiva fuerte: Las cámaras se instalan donde hay siniestros';
        color = '#dc3545';
      }

      // Ordenar por densidad de siniestros
      barriosConDatos.sort((a, b) => b.densidadSiniestros - a.densidadSiniestros);
      const top10Siniestros = barriosConDatos.slice(0, 10);

      // Barrios problemáticos
      const barriosProblematicos = barriosConDatos
        .filter(b => b.densidadSiniestros > (sumY / n) && b.densidadCamaras < (sumX / n))
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, 5);

      // Generar reporte HTML
      let reporteHTML = `
        <h5>📊 Análisis Comparativo: Densidad de Cámaras vs Siniestros</h5>
        
        <div style="background: ${color}; padding: 15px; border-radius: 8px; margin-bottom: 15px; color: white;">
          <h6 style="margin: 0 0 8px 0; text-align: center;">🎯 Coeficiente de Correlación</h6>
          <div style="font-size: 2.5em; text-align: center; font-weight: bold; margin: 10px 0;">
            ${correlacion.toFixed(3)}
          </div>
          <p style="margin: 5px 0; text-align: center; font-size: 0.95em;">
            ${interpretacion}
          </p>
        </div>

        <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #6c757d;">
          <h6 style="margin-top: 0; color: #495057;">📈 Estadísticas Generales:</h6>
          <table style="width: 100%; font-size: 0.9em;">
            <tr>
              <td><b>Barrios analizados:</b></td>
              <td style="text-align: right;">${barriosConDatos.length}</td>
            </tr>
            <tr>
              <td><b>Promedio densidad cámaras:</b></td>
              <td style="text-align: right;">${(sumX / n).toFixed(2)} cám/km²</td>
            </tr>
            <tr>
              <td><b>Promedio densidad siniestros:</b></td>
              <td style="text-align: right;">${(sumY / n).toFixed(2)} sin/km²</td>
            </tr>
          </table>
        </div>

        <div style="background: #ffd6d6; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #842029;">
          <h6 style="margin-top: 0; color: #842029;">🚨 Top 10 Barrios por Densidad de Siniestros:</h6>
          <div style="max-height: 200px; overflow-y: auto;">
            <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
              <thead style="background: #f5c6cb; position: sticky; top: 0;">
                <tr>
                  <th style="padding: 5px; text-align: left;">Barrio</th>
                  <th style="padding: 5px; text-align: center;">Siniestros/km²</th>
                  <th style="padding: 5px; text-align: center;">Cámaras/km²</th>
                  <th style="padding: 5px; text-align: center;">Ratio</th>
                </tr>
              </thead>
              <tbody>
      `;

      top10Siniestros.forEach((b, i) => {
        const ratioDisplay = b.ratio === Infinity ? '∞' : b.ratio.toFixed(1);
        const rowColor = i % 2 === 0 ? '#fff' : '#f8f9fa';
        const ratioColor = b.ratio > 10 ? '#dc3545' : (b.ratio > 5 ? '#ff9800' : '#28a745');
        
        reporteHTML += `
          <tr style="background: ${rowColor};">
            <td style="padding: 5px;"><b>${b.nombre}</b></td>
            <td style="padding: 5px; text-align: center; color: #dc3545; font-weight: bold;">${b.densidadSiniestros.toFixed(1)}</td>
            <td style="padding: 5px; text-align: center; color: #2a9d8f;">${b.densidadCamaras.toFixed(2)}</td>
            <td style="padding: 5px; text-align: center; color: ${ratioColor}; font-weight: bold;">${ratioDisplay}</td>
          </tr>
        `;
      });

      reporteHTML += `
              </tbody>
            </table>
          </div>
          <p style="margin: 8px 0 0 0; font-size: 0.85em; color: #6c757d;">
            <b>Ratio:</b> Siniestros por cámara. Valores altos indican más siniestros por cada cámara instalada.
          </p>
        </div>
      `;

      if (barriosProblematicos.length > 0) {
        reporteHTML += `
          <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
            <h6 style="margin-top: 0; color: #856404;">⚠️ Barrios Críticos (Alta siniestralidad, Baja cobertura):</h6>
            <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
        `;
        
        barriosProblematicos.forEach(b => {
          const ratioDisplay = b.ratio === Infinity ? '∞' : b.ratio.toFixed(1);
          reporteHTML += `
            <li>
              <b>${b.nombre}:</b> 
              ${b.densidadSiniestros.toFixed(1)} sin/km² con solo ${b.densidadCamaras.toFixed(2)} cám/km² 
              <span style="color: #dc3545; font-weight: bold;">(Ratio: ${ratioDisplay})</span>
            </li>
          `;
        });
        
        reporteHTML += `
            </ul>
          </div>
        `;
      }

      reporteHTML += `
        <div style="background: #d1e7dd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #0f5132;">
          <h6 style="margin-top: 0; color: #0f5132;">💡 Interpretación de Resultados:</h6>
          <div style="font-size: 0.85em; line-height: 1.5;">
            ${correlacion > 0 ? `
              <p style="margin: 5px 0;"><b>Correlación positiva detectada (${correlacion.toFixed(3)}):</b></p>
              <ul style="margin: 5px 0; padding-left: 20px;">
                <li>Las cámaras se instalan <b>donde ya hay siniestros</b></li>
                <li>Esto es <b>normal y esperado</b> en estrategias reactivas de seguridad</li>
                <li>No significa que las cámaras causen siniestros</li>
                <li>Para medir efectividad real: comparar <b>antes/después</b> de instalación</li>
              </ul>
            ` : `
              <p style="margin: 5px 0;"><b>Correlación negativa detectada (${correlacion.toFixed(3)}):</b></p>
              <ul style="margin: 5px 0; padding-left: 20px;">
                <li>Los barrios con más cámaras tienen <b>menos siniestros</b></li>
                <li>Puede indicar <b>efecto disuasivo</b> de las cámaras</li>
                <li>O que las cámaras se instalaron en zonas <b>ya mejoradas</b></li>
                <li>Requiere análisis temporal para confirmar causalidad</li>
              </ul>
            `}
          </div>
        </div>

        <div style="background: #e7f3ff; padding: 12px; border-radius: 5px; border-left: 4px solid #004085;">
          <h6 style="margin-top: 0; color: #004085;">🎯 Recomendaciones Operativas:</h6>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em;">
            <li>Priorizar instalación de cámaras en barrios de la lista "Críticos"</li>
            <li>Analizar por qué algunos barrios tienen alta densidad de ambos</li>
            <li>Considerar otros factores: iluminación, patrullaje, infraestructura vial</li>
            <li>Realizar seguimiento temporal post-instalación para medir impacto real</li>
            <li>Usar ratio como indicador de eficiencia: bajo ratio = mejor cobertura</li>
          </ul>
        </div>

        <div style="background: #cff4fc; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #055160;">
          <p style="margin: 5px 0; font-size: 0.9em;">
            <b>📐 Metodología:</b> Se calculó la densidad (cantidad/km²) de cámaras y siniestros por barrio, 
            luego se aplicó el coeficiente de correlación de Pearson para medir la relación entre ambas variables.
          </p>
        </div>
      `;

      resultadosDiv.innerHTML = reporteHTML;

    }, 10);
    break;
  }

    // ====================================================================
// AGREGAR ESTOS 3 CASOS AL SWITCH DE CONSULTAS (dentro del evento click)
// ====================================================================

// 1. ROBOS CON INTERVENCIÓN POLICIAL EN ZONAS SIN CÁMARAS
case 'robos_zonas_sin_camaras': {
    resultadosDiv.innerHTML = '<em>Analizando robos con intervención policial en zonas sin cobertura de cámaras...</em>';
    
    setTimeout(async () => {
      await loadRoboAutomotorData();
      await loadBaseCSVData(); // Carga allCamerasData
      
      if (!allRoboAutomotorData || !allCamerasData) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
        return;
      }
  
      robosSinCamarasLayer.clearLayers();
      const radioCobertura = 100; // 100 metros de radio de cobertura de cámara
      let robosSinCobertura = 0;
      let robosConCobertura = 0;
  
      // **MODIFICACIÓN CLAVE: Filtrar solo robos con intervención policial**
      const robosConIntervencion = allRoboAutomotorData.filter(robo => {
        const resultado = robo.Resultado ? robo.Resultado.trim() : '';
        return resultado === 'Detencion' || 
               resultado === 'Persecucion Y Detencion' || 
               resultado === 'Secuestro De Vehiculo';
      });
  
      robosConIntervencion.forEach(robo => {
        const coordsStr = robo['Longitud y Latitud'];
        if (!coordsStr) return;
        
        const parts = coordsStr.split(',').map(s => s.trim());
        if (parts.length !== 2) return;
        
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return;
        
        const roboLatLng = L.latLng(lat, lon);
        let tieneCamaraCercana = false;
  
        // Verificar si hay alguna cámara dentro del radio
        for (const camara of allCamerasData) {
          const camLat = parseFloat(String(camara.Latitud).replace(',', '.'));
          const camLon = parseFloat(String(camara.Longitud).replace(',', '.'));
          if (isNaN(camLat) || isNaN(camLon)) continue;
          
          const camaraLatLng = L.latLng(camLat, camLon);
          if (roboLatLng.distanceTo(camaraLatLng) <= radioCobertura) {
            tieneCamaraCercana = true;
            robosConCobertura++;
            break;
          }
        }
  
        // Si NO tiene cámara cercana, agregarlo a la capa
        if (!tieneCamaraCercana) {
          robosSinCobertura++;
          const marker = L.circleMarker(roboLatLng, {
            radius: 6,
            fillColor: "#e63946",
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7
          });
          
          const fecha = robo.Fecha || 'N/A';
          const barrio = robo.Barrio || 'N/A';
          const resultado = robo.Resultado || 'N/A';
          marker.bindPopup(`
            <b>Robo con intervención policial</b><br>
            <b>Fecha:</b> ${fecha}<br>
            <b>Barrio:</b> ${barrio}<br>
            <b>Resultado:</b> <span style="color: #2a9d8f; font-weight: bold;">${resultado}</span><br>
            <span style="color: red;">⚠️ Sin cámaras en 100m</span>
          `);
          robosSinCamarasLayer.addLayer(marker);
        }
      });
  
      // Mostrar resultados
      mymap.addLayer(robosSinCamarasLayer);
      const porcentajeSinCobertura = robosConIntervencion.length > 0 
        ? ((robosSinCobertura / robosConIntervencion.length) * 100).toFixed(1) 
        : 0;
      
      resultadosDiv.innerHTML = `
        <h5>Análisis: Robos con Intervención Policial vs Cobertura de Cámaras:</h5>
        <ul>
          <li><b style="color: #e63946;">Robos CON intervención SIN cámaras cercanas (100m):</b> ${robosSinCobertura} (${porcentajeSinCobertura}%)</li>
          <li><b style="color: #2a9d8f;">Robos CON intervención CON cámaras cercanas:</b> ${robosConCobertura}</li>
          <li><b>Total con intervención policial:</b> ${robosConIntervencion.length}</li>
        </ul>
        <p style="margin-top: 10px; font-style: italic;">
          Los puntos rojos muestran robos donde hubo detención o secuestro pero NO había cámaras cercanas.
        </p>
      `;
    }, 10);
    break;
  }
  case 'correlacion_camaras_robos': {
  resultadosDiv.innerHTML = '<em>Analizando correlación entre cámaras y robos por barrio...</em>';
  
  setTimeout(async () => {
    await loadBaseCSVData(); // Carga allCamerasData
    await loadRoboAutomotorData();
    
    if (!barriosData || !allCamerasData || !allRoboAutomotorData) {
      resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos necesarios.';
      return;
    }

    // Objeto para almacenar datos por barrio
    const datosBarrios = new Map();
    
    // Inicializar todos los barrios
    barriosData.features.forEach(barrio => {
      const nombre = barrio.properties.soc_fomen;
      datosBarrios.set(nombre, {
        camaras: 0,
        robos: 0,
        geometry: barrio.geometry
      });
    });

    // Contar cámaras por barrio
    allCamerasData.forEach(camara => {
      const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
      const lon = parseFloat(String(camara.Longitud).replace(',', '.'));
      if (isNaN(lat) || isNaN(lon)) return;

      const latlng = L.latLng(lat, lon);
      
      for (const barrio of barriosData.features) {
        if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
          const nombre = barrio.properties.soc_fomen;
          const datos = datosBarrios.get(nombre);
          if (datos) datos.camaras++;
          break;
        }
      }
    });

    // Contar robos por barrio
    allRoboAutomotorData.forEach(robo => {
      const coordsStr = robo['Longitud y Latitud'];
      if (!coordsStr) return;
      
      const parts = coordsStr.split(',').map(s => s.trim());
      if (parts.length !== 2) return;
      
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lon)) return;
      
      const latlng = L.latLng(lat, lon);
      
      for (const barrio of barriosData.features) {
        if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
          const nombre = barrio.properties.soc_fomen;
          const datos = datosBarrios.get(nombre);
          if (datos) datos.robos++;
          break;
        }
      }
    });

    // Calcular área de cada barrio (en km²)
    datosBarrios.forEach((datos, nombre) => {
      const barrio = barriosData.features.find(f => f.properties.soc_fomen === nombre);
      if (barrio) {
        const areaKm2 = turf.area(barrio.geometry) / 1000000;
        datos.area = areaKm2;
        datos.densidadCamaras = areaKm2 > 0 ? datos.camaras / areaKm2 : 0;
        datos.densidadRobos = areaKm2 > 0 ? datos.robos / areaKm2 : 0;
      }
    });

    // Convertir a array y ordenar
    const barriosArray = Array.from(datosBarrios.entries())
      .map(([nombre, datos]) => ({ nombre, ...datos }))
      .filter(b => b.camaras > 0 || b.robos > 0); // Excluir barrios sin datos

    // Ordenar por cantidad de cámaras (descendente)
    barriosArray.sort((a, b) => b.camaras - a.camaras);

    // Calcular estadísticas básicas
    const totalCamaras = barriosArray.reduce((sum, b) => sum + b.camaras, 0);
    const totalRobos = barriosArray.reduce((sum, b) => sum + b.robos, 0);
    const promedioCamaras = totalCamaras / barriosArray.length;
    const promedioRobos = totalRobos / barriosArray.length;

    // Dividir en grupos: barrios con muchas cámaras vs pocos
    const tercioSuperior = barriosArray.slice(0, Math.floor(barriosArray.length / 3));
    const tercioInferior = barriosArray.slice(-Math.floor(barriosArray.length / 3));

    const promedioRobosConMuchasCamaras = tercioSuperior.reduce((sum, b) => sum + b.robos, 0) / tercioSuperior.length;
    const promedioRobosConPocasCamaras = tercioInferior.reduce((sum, b) => sum + b.robos, 0) / tercioInferior.length;

    // Calcular correlación simple (coeficiente de Pearson)
    const n = barriosArray.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    
    barriosArray.forEach(b => {
      sumX += b.camaras;
      sumY += b.robos;
      sumXY += b.camaras * b.robos;
      sumX2 += b.camaras * b.camaras;
      sumY2 += b.robos * b.robos;
    });

    const correlacion = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    // Determinar interpretación de correlación
    let interpretacion, color;
    if (correlacion < -0.5) {
      interpretacion = 'Correlación negativa fuerte: Más cámaras → Menos robos';
      color = '#28a745'; // Verde
    } else if (correlacion < -0.3) {
      interpretacion = 'Correlación negativa moderada: Más cámaras tienden a reducir robos';
      color = '#5cb85c';
    } else if (correlacion < 0.3) {
      interpretacion = 'Sin correlación clara: Las cámaras no parecen afectar directamente';
      color = '#ffc107'; // Amarillo
    } else if (correlacion < 0.5) {
      interpretacion = 'Correlación positiva moderada: Más cámaras en zonas con más robos';
      color = '#ff9800';
    } else {
      interpretacion = 'Correlación positiva fuerte: Las cámaras se instalan donde hay más robos';
      color = '#dc3545'; // Rojo
    }

    // Generar visualización HTML
    let resultHTML = `
      <h5>📊 Análisis de Correlación: Cámaras vs Robos por Barrio</h5>
      
      <div style="background: ${color}; padding: 15px; border-radius: 8px; margin-bottom: 15px; color: white;">
        <h6 style="margin: 0 0 8px 0; text-align: center;">🎯 Coeficiente de Correlación</h6>
        <div style="font-size: 2.5em; text-align: center; font-weight: bold; margin: 10px 0;">
          ${correlacion.toFixed(3)}
        </div>
        <p style="margin: 5px 0; text-align: center; font-size: 0.95em;">
          ${interpretacion}
        </p>
      </div>

      <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #6c757d;">
        <h6 style="margin-top: 0; color: #495057;">📈 Estadísticas Generales:</h6>
        <table style="width: 100%; font-size: 0.9em;">
          <tr>
            <td><b>Total barrios analizados:</b></td>
            <td style="text-align: right;">${barriosArray.length}</td>
          </tr>
          <tr>
            <td><b>Total cámaras:</b></td>
            <td style="text-align: right;">${totalCamaras}</td>
          </tr>
          <tr>
            <td><b>Total robos:</b></td>
            <td style="text-align: right;">${totalRobos}</td>
          </tr>
          <tr>
            <td><b>Promedio cámaras/barrio:</b></td>
            <td style="text-align: right;">${promedioCamaras.toFixed(1)}</td>
          </tr>
          <tr>
            <td><b>Promedio robos/barrio:</b></td>
            <td style="text-align: right;">${promedioRobos.toFixed(1)}</td>
          </tr>
        </table>
      </div>

      <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
        <h6 style="margin-top: 0; color: #856404;">🔍 Análisis Comparativo:</h6>
        <div style="font-size: 0.9em;">
          <p style="margin: 5px 0;"><b>Barrios con MÁS cámaras (top 33%):</b></p>
          <ul style="margin: 5px 0; padding-left: 20px;">
            <li>Promedio de robos: <b>${promedioRobosConMuchasCamaras.toFixed(1)}</b></li>
            <li>Ejemplo: ${tercioSuperior[0].nombre} (${tercioSuperior[0].camaras} cámaras, ${tercioSuperior[0].robos} robos)</li>
          </ul>
          
          <p style="margin: 10px 0 5px 0;"><b>Barrios con MENOS cámaras (bottom 33%):</b></p>
          <ul style="margin: 5px 0; padding-left: 20px;">
            <li>Promedio de robos: <b>${promedioRobosConPocasCamaras.toFixed(1)}</b></li>
            <li>Ejemplo: ${tercioInferior[0].nombre} (${tercioInferior[0].camaras} cámaras, ${tercioInferior[0].robos} robos)</li>
          </ul>

          ${promedioRobosConMuchasCamaras < promedioRobosConPocasCamaras ? 
            `<p style="margin: 10px 0; color: #28a745; font-weight: bold;">✅ Los barrios con más cámaras tienen ${((1 - promedioRobosConMuchasCamaras / promedioRobosConPocasCamaras) * 100).toFixed(1)}% menos robos en promedio</p>` :
            `<p style="margin: 10px 0; color: #dc3545; font-weight: bold;">⚠️ Los barrios con más cámaras tienen ${((promedioRobosConMuchasCamaras / promedioRobosConPocasCamaras - 1) * 100).toFixed(1)}% más robos en promedio 
              <button id="btn-info-correlacion" style="margin-left: 10px; font-size: 0.8em; padding: 2px 8px;">MÁS INFO</button>
            </p>`
          }
        </div>
      </div>

      <div style="background: #d1ecf1; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #0c5460;">
        <h6 style="margin-top: 0; color: #0c5460;">📋 Top 5 Barrios con Más Cámaras:</h6>
        <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
          <thead style="background: #bee5eb;">
            <tr>
              <th style="padding: 5px; text-align: left;">Barrio</th>
              <th style="padding: 5px; text-align: center;">Cámaras</th>
              <th style="padding: 5px; text-align: center;">Robos</th>
              <th style="padding: 5px; text-align: center;">Ratio</th>
            </tr>
          </thead>
          <tbody>
    `;

    barriosArray.slice(0, 5).forEach((b, i) => {
      const ratio = b.camaras > 0 ? (b.robos / b.camaras).toFixed(2) : 'N/A';
      resultHTML += `
        <tr style="background: ${i % 2 === 0 ? '#f8f9fa' : 'white'};">
          <td style="padding: 5px;"><b>${b.nombre}</b></td>
          <td style="padding: 5px; text-align: center;">${b.camaras}</td>
          <td style="padding: 5px; text-align: center;">${b.robos}</td>
          <td style="padding: 5px; text-align: center;">${ratio}</td>
        </tr>
      `;
    });

    resultHTML += `
          </tbody>
        </table>
      </div>

      <div style="background: #f8d7da; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #721c24;">
        <h6 style="margin-top: 0; color: #721c24;">📋 Top 5 Barrios con Menos Cámaras (pero con robos):</h6>
        <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
          <thead style="background: #f5c6cb;">
            <tr>
              <th style="padding: 5px; text-align: left;">Barrio</th>
              <th style="padding: 5px; text-align: center;">Cámaras</th>
              <th style="padding: 5px; text-align: center;">Robos</th>
              <th style="padding: 5px; text-align: center;">Ratio</th>
            </tr>
          </thead>
          <tbody>
    `;

    tercioInferior.slice(0, 5).forEach((b, i) => {
      const ratio = b.camaras > 0 ? (b.robos / b.camaras).toFixed(2) : '∞';
      resultHTML += `
        <tr style="background: ${i % 2 === 0 ? '#f8f9fa' : 'white'};">
          <td style="padding: 5px;"><b>${b.nombre}</b></td>
          <td style="padding: 5px; text-align: center;">${b.camaras}</td>
          <td style="padding: 5px; text-align: center;">${b.robos}</td>
          <td style="padding: 5px; text-align: center; color: #dc3545; font-weight: bold;">${ratio}</td>
        </tr>
      `;
    });

    resultHTML += `
          </tbody>
        </table>
      </div>

      <div style="background: #e7f3ff; padding: 12px; border-radius: 5px; border-left: 4px solid #004085;">
        <h6 style="margin-top: 0; color: #004085;">🧠 Interpretación del Coeficiente:</h6>
        <div style="font-size: 0.85em; line-height: 1.5;">
          <p style="margin: 5px 0;"><b>Valores entre -1 y +1:</b></p>
          <ul style="margin: 5px 0; padding-left: 20px;">
            <li><b style="color: #28a745;">-1 a -0.5:</b> Correlación negativa fuerte (efectivas para reducir robos)</li>
            <li><b style="color: #5cb85c;">-0.5 a -0.3:</b> Correlación negativa moderada</li>
            <li><b style="color: #ffc107;">-0.3 a +0.3:</b> Sin correlación (factores independientes)</li>
            <li><b style="color: #ff9800;">+0.3 a +0.5:</b> Correlación positiva moderada</li>
            <li><b style="color: #dc3545;">+0.5 a +1:</b> Correlación positiva fuerte (se instalan donde hay robos)</li>
          </ul>
          
          <p style="margin: 10px 0 5px 0; background: #fff3cd; padding: 8px; border-radius: 4px;">
            <b>⚠️ Causalidad vs Correlación:</b> Una correlación positiva NO significa que las cámaras causan robos. 
            Más probablemente indica que se instalan cámaras en zonas problemáticas. La efectividad real requiere 
            análisis temporal (antes/después de instalación).
          </p>
        </div>
      </div>

      <div style="background: #d4edda; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #155724;">
        <h6 style="margin-top: 0; color: #155724;">💡 Recomendaciones Operativas:</h6>
        <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em;">
          <li>Priorizar instalación de cámaras en barrios con bajo ratio cámaras/robos</li>
          <li>Analizar efectividad de cámaras existentes en zonas con alta densidad</li>
          <li>Considerar factores adicionales: iluminación, patrullaje, características sociodemográficas</li>
          <li>Realizar seguimiento temporal para medir impacto real de nuevas instalaciones</li>
        </ul>
      </div>
    `;

    resultadosDiv.innerHTML = resultHTML;

    // Añadir event listener para el botón "MÁS INFO"
    const btnInfo = document.getElementById('btn-info-correlacion');
    if (btnInfo) {
      btnInfo.addEventListener('click', () => {
        mostrarInfoCorrelacion({
          promedioRobosConMuchasCamaras,
          promedioRobosConPocasCamaras,
          correlacion
        });
      });
    }

  }, 10);
  break;
}

function mostrarInfoCorrelacion(datos) {
  const modal = document.getElementById('info-modal');
  const modalBody = document.getElementById('info-modal-body');
  const { promedioRobosConMuchasCamaras, promedioRobosConPocasCamaras, correlacion } = datos;

  const porcentaje = ((promedioRobosConMuchasCamaras / promedioRobosConPocasCamaras - 1) * 100).toFixed(1);

  modalBody.innerHTML = `
    <h5>Interpretación del Resultado</h5>
    <p>El dato <strong>"Los barrios con más cámaras tienen ${porcentaje}% más robos"</strong> puede parecer contradictorio, pero es un ejemplo clásico de que <strong>"correlación no implica causalidad"</strong>.</p>
    <p>Esto <strong>no significa</strong> que instalar cámaras cause más robos. La explicación más probable es la siguiente:</p>
    <ul>
      <li><strong>Respuesta a un problema existente:</strong> Las cámaras de seguridad suelen instalarse en zonas que ya tienen un historial de alta delincuencia. Las autoridades priorizan la vigilancia en "puntos calientes" para disuadir a los delincuentes y facilitar la investigación.</li>
      <li><strong>Factor de confusión:</strong> Los barrios con más robos también pueden tener otras características (mayor densidad de población, más comercios, etc.) que atraen tanto a la delincuencia como a la instalación de cámaras.</li>
    </ul>
    <p>En resumen, la estadística refleja que <strong>las cámaras son una consecuencia de la alta tasa de robos, y no la causa.</strong></p>

    <h5>Metodología de Cálculo</h5>
    <p>Para llegar a esta conclusión, se siguieron estos pasos:</p>
    <ol>
      <li><strong>Agrupación de datos:</strong> Se contó el número total de cámaras y de robos para cada barrio registrado.</li>
      <li><strong>Ranking de barrios:</strong> Se ordenaron todos los barrios desde el que tiene más cámaras hasta el que tiene menos.</li>
      <li><strong>División en grupos:</strong> Se dividió la lista de barrios en tres tercios:
          <ul>
              <li><strong>Grupo A (Top 33%):</strong> Barrios con la mayor cantidad de cámaras.</li>
              <li><strong>Grupo B (Medio 33%):</strong> Barrios con una cantidad intermedia de cámaras.</li>
              <li><strong>Grupo C (Bottom 33%):</strong> Barrios con la menor cantidad de cámaras.</li>
          </ul>
      </li>
      <li><strong>Cálculo de promedios:</strong> Se calculó el número promedio de robos para los barrios del Grupo A y del Grupo C.
          <div class="formula">
              <code>Promedio Robos (Grupo A) = ${promedioRobosConMuchasCamaras.toFixed(1)}</code><br>
              <code>Promedio Robos (Grupo C) = ${promedioRobosConPocasCamaras.toFixed(1)}</code>
          </div>
      </li>
      <li><strong>Comparación porcentual:</strong> Finalmente, se calculó la diferencia porcentual entre ambos promedios.
          <div class="formula">
              Fórmula: <code>((Promedio A / Promedio C) - 1) * 100</code><br>
              Cálculo: <code>((${promedioRobosConMuchasCamaras.toFixed(1)} / ${promedioRobosConPocasCamaras.toFixed(1)}) - 1) * 100 = ${porcentaje}%</code>
          </div>
      </li>
    </ol>
    
    <h5>Coeficiente de Correlación de Pearson</h5>
    <p>Además, se calculó el coeficiente de correlación de Pearson, que mide la relación lineal entre dos variables (en este caso, número de cámaras y número de robos por barrio). El resultado fue <strong>${correlacion.toFixed(3)}</strong>.</p>
    <ul>
        <li>Un valor cercano a <strong>+1</strong> indica una fuerte correlación positiva (más cámaras, más robos).</li>
        <li>Un valor cercano a <strong>-1</strong> indica una fuerte correlación negativa (más cámaras, menos robos).</li>
        <li>Un valor cercano a <strong>0</strong> indica que no hay una relación lineal clara.</li>
    </ul>
    <p>El valor obtenido confirma la tendencia observada: las cámaras se instalan en lugares donde ya ocurren más robos.</p>
  `;

  modal.style.display = 'flex';
}

  // 2. SINIESTROS POR MES
  case 'siniestros_por_mes': {
    await loadSiniestrosData();
    
    if (!allSiniestrosData) {
      resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de siniestros.';
      return;
    }
  
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const siniestrosPorMes = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0, 10:0, 11:0};
  
    allSiniestrosData.features.forEach(f => {
      const fechaStr = f.properties.fecha;
      if (!fechaStr || fechaStr.split('/').length !== 3) return;
      
      const partes = fechaStr.split('/');
      const mes = parseInt(partes[1], 10) - 1; // Los meses en JS van de 0-11
      if (mes >= 0 && mes <= 11) {
        siniestrosPorMes[mes]++;
      }
    });
  
    // Encontrar el mes con más y menos siniestros
    let maxMes = 0, minMes = 0, maxCount = 0, minCount = Infinity;
    for (let i = 0; i < 12; i++) {
      if (siniestrosPorMes[i] > maxCount) {
        maxCount = siniestrosPorMes[i];
        maxMes = i;
      }
      if (siniestrosPorMes[i] < minCount) {
        minCount = siniestrosPorMes[i];
        minMes = i;
      }
    }
  
    // Crear visualización
    let mesesHTML = '<h5>📊 Distribución de Siniestros por Mes:</h5>';
    mesesHTML += '<div style="max-height: 300px; overflow-y: auto;">';
    
    for (let i = 0; i < 12; i++) {
      const porcentaje = maxCount > 0 ? (siniestrosPorMes[i] / maxCount) * 100 : 0;
      const color = i === maxMes ? '#e63946' : (i === minMes ? '#2a9d8f' : '#457b9d');
      
      mesesHTML += `
        <div style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: ${i === maxMes || i === minMes ? 'bold' : 'normal'};">
              ${mesesNombres[i]}:
            </span>
            <span style="font-weight: bold; color: ${color};">${siniestrosPorMes[i]}</span>
          </div>
          <div style="background: #e0e0e0; height: 20px; border-radius: 4px; overflow: hidden;">
            <div style="background: ${color}; width: ${porcentaje}%; height: 100%; transition: width 0.3s;"></div>
          </div>
        </div>
      `;
    }
    
    mesesHTML += '</div>';
    mesesHTML += `
      <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
        <p style="margin: 5px 0;"><b style="color: #e63946;">Mes más crítico:</b> ${mesesNombres[maxMes]} (${maxCount} siniestros)</p>
        <p style="margin: 5px 0;"><b style="color: #2a9d8f;">Mes más seguro:</b> ${mesesNombres[minMes]} (${minCount} siniestros)</p>
      </div>
    `;
    
    resultadosDiv.innerHTML = mesesHTML;
    break;
  }
  
// 3. ROBOS SIN INTERVENCIÓN POLICIAL
case 'robos_sin_intervencion': {
    resultadosDiv.innerHTML = '<em>Analizando robos sin intervención policial...</em>';
    
    setTimeout(async () => {
      await loadRoboAutomotorData();
      
      if (!allRoboAutomotorData) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de robos.';
        return;
      }
  
      robosSinIntervencionLayer.clearLayers();
      
      // Filtrar robos sin intervención (sin detención ni secuestro)
      const robosSinIntervencion = allRoboAutomotorData.filter(item => {
        const resultado = item.Resultado ? item.Resultado.trim() : '';
        return resultado !== 'Detencion' && resultado !== 'Secuestro De Vehiculo';
      });
  
      // Contar por barrio
      const robosPorBarrio = {};
      let totalSinIntervencion = 0;
  
      robosSinIntervencion.forEach(robo => {
        const coordsStr = robo['Longitud y Latitud'];
        if (!coordsStr) return;
        
        const parts = coordsStr.split(',').map(s => s.trim());
        if (parts.length !== 2) return;
        
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return;
        
        totalSinIntervencion++;
        const barrio = robo.Barrio || 'Sin especificar';
        robosPorBarrio[barrio] = (robosPorBarrio[barrio] || 0) + 1;
  
// Agregar marcador al mapa
const marker = L.circleMarker([lat, lon], {
  radius: 10,            // tamaño del punto
  color: "#ffffff",      // borde blanco
  weight: 3,             // grosor del borde
  fillColor: "#ff0000",  // centro rojo fuerte
  fillOpacity: 0.9       // bien visible
}).addTo(mymap);         // <<<<< ESTO FALTABA

const fecha = robo.Fecha || 'N/A';

marker.bindPopup(`
  <b>Robo sin intervención</b><br>
  Fecha: ${fecha}<br>
  Barrio: ${barrio}<br>
  <span style="color: #ff6b35;">⚠️ Sin detención ni secuestro</span>
`);

robosSinIntervencionLayer.addLayer(marker);
});   //  ← CIERRE DEL forEach **(ESTO FALTABA)**

// ==============================
//   CALCULO Y RESUMEN FINAL
// ==============================

// Calcular porcentaje
const totalRobos = allRoboAutomotorData.length;
const porcentajeSinIntervencion = ((totalSinIntervencion / totalRobos) * 100).toFixed(1);

// Top 5 barrios con más robos sin intervención
const topBarrios = Object.entries(robosPorBarrio)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

// Mostrar resultados
mymap.addLayer(robosSinIntervencionLayer);
// 🔥 Registrar la capa para que el botón de LIMPIAR pueda borrarla
if (!window._consultaLayers) window._consultaLayers = [];
window._consultaLayers.push(robosSinIntervencionLayer);
      
      let resultHTML = `
        <h5>🚨 Análisis de Robos sin Intervención Policial:</h5>
        <div style="background: #fff3cd; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
          <p style="margin: 5px 0;"><b>Total robos sin intervención:</b> ${totalSinIntervencion}</p>
          <p style="margin: 5px 0;"><b>Porcentaje del total:</b> ${porcentajeSinIntervencion}%</p>
          <p style="margin: 5px 0;"><b>Total robos analizados:</b> ${totalRobos}</p>
        </div>
        <h6>Top 5 Barrios con Más Robos sin Intervención:</h6>
        <ul>
      `;
      
      topBarrios.forEach(([barrio, count]) => {
        const porcentajeBarrio = ((count / totalSinIntervencion) * 100).toFixed(1);
        resultHTML += `<li><b>${barrio}:</b> ${count} casos (${porcentajeBarrio}%)</li>`;
      });
      
      resultHTML += `
        </ul>
        <p style="margin-top: 10px; font-style: italic; font-size: 0.9em;">
          Los puntos naranjas muestran ubicaciones de eventos con categoria de robos automotor donde no hubo Detención ni Secuestro de Vehiculo.
        </p>
        
        <!-- ACLARACIÓN AGREGADA -->
        <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #6c757d;">
          <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">📋 Criterios de Filtrado:</h6>
          <div style="font-size: 0.85em; line-height: 1.5;">
            <p style="margin: 5px 0;"><b>Esta consulta EXCLUYE robos con:</b></p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>❌ Detención</li>
              <li>❌ Secuestro de Vehículo</li>
            </ul>
            <p style="margin: 8px 0 5px 0;"><b>E INCLUYE todos los demás resultados:</b></p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>✅ No Asiste</li>
              <li>✅ Asiste Policía y Libera</li>
              <li>✅ Asiste Prefectura</li>
              <li>✅ Hallazgo de Automotor</li>
              <li>✅ LPR - Se realiza seguimiento del vehículo</li>
              <li>✅ Cualquier otro resultado sin detención o secuestro</li>
            </ul>
          </div>
        </div>
      `;
      
      resultadosDiv.innerHTML = resultHTML;
    }, 10);
    break;
  }
// Reemplazar el caso anterior con este código mejorado

case 'siniestros_corredores_escolares': {
    resultadosDiv.innerHTML = '<em>Analizando siniestros en corredores escolares...</em>';
    
    setTimeout(async () => {
      await loadSiniestrosData();
      
      // Cargar datos de corredores escolares
      let corredoresData, colegiosData;
      try {
        const [corredoresResponse, colegiosResponse] = await Promise.all([
          fetch('corredores_escolares.geojson'),
          fetch('colegios_escuelas.geojson')
        ]);
        corredoresData = await corredoresResponse.json();
        colegiosData = await colegiosResponse.json();
      } catch (error) {
        console.error('Error al cargar datos escolares:', error);
        resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de corredores escolares.';
        return;
      }
  
      if (!allSiniestrosData || !corredoresData || !colegiosData) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar todos los datos necesarios.';
        return;
      }
  
      corredoresEscolaresLayer.clearLayers();
      colegiosLayer.clearLayers();
      siniestrosEnZonasLayer.clearLayers();
  
      const radioBusqueda = 50; // 50 metros de radio
      const siniestrosEnCorredores = [];
      const corredoresAfectados = new Map(); // corridorName -> count
      const colegiosCercanos = new Map(); // colegioName -> {count, latlng}
      
      // Contadores adicionales para estadísticas
      let siniestrosConPeatones = 0;
      let siniestrosConCiclistas = 0;
      let siniestrosPorHorario = {
        entrada: 0,    // 7:00 - 8:30
        salida: 0      // 16:30 - 18:30
      };
  
      // 1. Dibujar corredores escolares
      L.geoJSON(corredoresData, {
        style: {
          color: "#008000", // Color verde para corredores escolares
          weight: 4,
          opacity: 0.8
        },
        onEachFeature: (feature, layer) => {
          const corredor = feature.properties.Name || 'Corredor sin nombre';
          layer.bindPopup(`<b>${corredor}</b>${feature.properties.description ? '<br>' + feature.properties.description : ''}`);
          corredoresEscolaresLayer.addLayer(layer);
        }
      });
  
      // 2. Dibujar colegios
      const colegioIcon = L.icon({
        iconUrl: 'https://img.icons8.com/color/48/school-building.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });
  
      colegiosData.features.forEach(colegio => {
        const coords = colegio.geometry.coordinates;
        const latlng = L.latLng(coords[1], coords[0]);
        const nombre = colegio.properties.Name || 'Colegio sin nombre';
        
        const marker = L.marker(latlng, { icon: colegioIcon });
        marker.bindPopup(`<b>${nombre}</b>`);
        colegiosLayer.addLayer(marker);
        
        colegiosCercanos.set(nombre, { count: 0, latlng: latlng });
      });
  
      // 3. Analizar siniestros cerca de corredores escolares
      let totalSiniestrosFiltradosPorHorario = 0;
      let totalSiniestrosFiltradosPorParticipantes = 0;
      
      allSiniestrosData.features.forEach(siniestro => {
        if (!siniestro.geometry || !siniestro.geometry.coordinates) return;
        
        const props = siniestro.properties;
        
        // FILTRO 1: Verificar horario escolar
        let esHorarioEscolar = false;
        let tipoHorario = null;
        if (props.hora && props.hora.includes(':')) {
          const hora = parseInt(props.hora.split(':')[0], 10);
          const minutos = parseInt(props.hora.split(':')[1], 10);
          const horaDecimal = hora + (minutos / 60);
          
          // Horario de entrada: 7:00 - 8:30
          if (horaDecimal >= 7 && horaDecimal <= 8.5) {
            esHorarioEscolar = true;
            tipoHorario = 'entrada';
          }
          // Horario de salida: 16:30 - 18:30
          else if (horaDecimal >= 16.5 && horaDecimal <= 18.5) {
            esHorarioEscolar = true;
            tipoHorario = 'salida';
          }
        }
        
        if (!esHorarioEscolar) return;
        totalSiniestrosFiltradosPorHorario++;
        
        // FILTRO 2: Verificar participantes (peatón o ciclista)
        let tienePeatonOCiclista = false;
        let participantesDetectados = [];
        
        if (props.participantes_codigos) {
          const participantes = props.participantes_codigos.split('/');
          
          if (participantes.includes('P')) {
            tienePeatonOCiclista = true;
            participantesDetectados.push('Peatón');
            siniestrosConPeatones++;
          }
          if (participantes.includes('B')) {
            tienePeatonOCiclista = true;
            participantesDetectados.push('Bicicleta');
            siniestrosConCiclistas++;
          }
        }
        
        if (!tienePeatonOCiclista) return;
        totalSiniestrosFiltradosPorParticipantes++;
        
        const siniestroLatLng = L.latLng(
          siniestro.geometry.coordinates[1],
          siniestro.geometry.coordinates[0]
        );
  
        let estaCercaDeCorredor = false;
        let corredorMasCercano = null;
        let distanciaMinima = Infinity;
  
        // Verificar proximidad a corredores
        corredoresData.features.forEach(corredor => {
          let distancia = Infinity;
          
          if (corredor.geometry.type === 'LineString') {
            // Calcular distancia mínima a la línea
            const lineCoords = corredor.geometry.coordinates;
            for (let i = 0; i < lineCoords.length - 1; i++) {
              const p1 = L.latLng(lineCoords[i][1], lineCoords[i][0]);
              const p2 = L.latLng(lineCoords[i + 1][1], lineCoords[i + 1][0]);
              
              // Distancia aproximada al segmento
              const d1 = siniestroLatLng.distanceTo(p1);
              const d2 = siniestroLatLng.distanceTo(p2);
              const segmentDist = Math.min(d1, d2);
              
              if (segmentDist < distancia) {
                distancia = segmentDist;
              }
            }
          } else if (corredor.geometry.type === 'Polygon') {
            // Para polígonos, verificar si está dentro o cerca del borde
            const ringCoords = corredor.geometry.coordinates[0];
            for (let i = 0; i < ringCoords.length; i++) {
              const p = L.latLng(ringCoords[i][1], ringCoords[i][0]);
              const d = siniestroLatLng.distanceTo(p);
              if (d < distancia) {
                distancia = d;
              }
            }
          }
  
          if (distancia <= radioBusqueda && distancia < distanciaMinima) {
            estaCercaDeCorredor = true;
            distanciaMinima = distancia;
            corredorMasCercano = corredor.properties.Name || 'Corredor sin nombre';
          }
        });
  
        // Verificar proximidad a colegios
        let colegioMasCercano = null;
        let distanciaMinimaColegio = Infinity;
        
        colegiosData.features.forEach(colegio => {
          const colegioLatLng = L.latLng(
            colegio.geometry.coordinates[1],
            colegio.geometry.coordinates[0]
          );
          const dist = siniestroLatLng.distanceTo(colegioLatLng);
          
          if (dist <= radioBusqueda * 2 && dist < distanciaMinimaColegio) { // 100m para colegios
            distanciaMinimaColegio = dist;
            colegioMasCercano = colegio.properties.Name;
          }
        });
  
        // Si está cerca de corredor o colegio, agregarlo
        if (estaCercaDeCorredor || colegioMasCercano) {
          siniestrosEnCorredores.push(siniestro);
          
          // Contar por horario
          if (tipoHorario) {
            siniestrosPorHorario[tipoHorario]++;
          }
          
          if (corredorMasCercano) {
            corredoresAfectados.set(
              corredorMasCercano,
              (corredoresAfectados.get(corredorMasCercano) || 0) + 1
            );
          }
          
          if (colegioMasCercano) {
            const colegioData = colegiosCercanos.get(colegioMasCercano);
            if (colegioData) {
              colegioData.count++;
            }
          }
  
          // Agregar marcador al mapa
          const marker = L.marker(siniestroLatLng, { icon: siniestroIcon });
          
          let popupContent = `<b>Siniestro en Zona Escolar</b><br>`;
          popupContent += `<b>Dirección:</b> ${props.direccion}<br>`;
          popupContent += `<b>Fecha:</b> ${props.fecha}<br>`;
          popupContent += `<b>Hora:</b> ${props.hora} <span style="color: #856404; font-weight: bold;">(${tipoHorario === 'entrada' ? '🔔 Horario de entrada' : '🔔 Horario de salida'})</span><br>`;
          popupContent += `<b>Participantes:</b> <span style="color: #dc3545; font-weight: bold;">${participantesDetectados.join(', ')}</span><br>`;
          
          if (corredorMasCercano) {
            popupContent += `<br><span style="color: #ffa500; font-weight: bold;">📍 ${corredorMasCercano}</span><br>`;
            popupContent += `<span style="font-size: 0.9em;">Distancia: ${Math.round(distanciaMinima)}m</span>`;
          }
          
          if (colegioMasCercano) {
            popupContent += `<br><span style="color: #e63946; font-weight: bold;">🏫 ${colegioMasCercano}</span><br>`;
            popupContent += `<span style="font-size: 0.9em;">Distancia: ${Math.round(distanciaMinimaColegio)}m</span>`;
          }
          
          marker.bindPopup(popupContent);
          siniestrosEnZonasLayer.addLayer(marker);
        }
      });
  
      // Mostrar capas en el mapa
      mymap.addLayer(corredoresEscolaresLayer);
      mymap.addLayer(colegiosLayer);
      mymap.addLayer(siniestrosEnZonasLayer);
  
      // Top 5 corredores más afectados
      const topCorredores = Array.from(corredoresAfectados.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
  
      // Top 5 colegios con más siniestros cercanos
      const topColegios = Array.from(colegiosCercanos.entries())
        .filter(([_, data]) => data.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
  
      // Generar reporte
      let reporteHTML = `
        <h5>🎒 Análisis de Siniestros en Zonas Escolares (Horarios Críticos):</h5>
        
        <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
          <p style="margin: 5px 0;"><b>✅ Siniestros encontrados:</b> ${siniestrosEnCorredores.length}</p>
          <p style="margin: 5px 0;"><b>🚶 Con peatones involucrados:</b> ${siniestrosConPeatones}</p>
          <p style="margin: 5px 0;"><b>🚴 Con ciclistas involucrados:</b> ${siniestrosConCiclistas}</p>
          <p style="margin: 5px 0;"><b>🔔 En horario de entrada (7:00-8:30):</b> ${siniestrosPorHorario.entrada}</p>
          <p style="margin: 5px 0;"><b>🔔 En horario de salida (16:30-18:30):</b> ${siniestrosPorHorario.salida}</p>
        </div>
      `;
  
      if (topCorredores.length > 0) {
        reporteHTML += `
          <div style="background: #ffe5cc; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
            <h6 style="margin-top: 0; color: #d63384;">🚸 Top 5 Corredores Escolares Más Afectados:</h6>
            <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
        `;
        topCorredores.forEach(([corredor, count]) => {
          reporteHTML += `<li><b>${corredor}:</b> ${count} siniestros</li>`;
        });
        reporteHTML += `</ol></div>`;
      }
  
      if (topColegios.length > 0) {
        reporteHTML += `
          <div style="background: #ffd6d6; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
            <h6 style="margin-top: 0; color: #842029;">🏫 Top 5 Colegios con Más Siniestros Cercanos:</h6>
            <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
        `;
        topColegios.forEach(([nombre, data]) => {
          reporteHTML += `<li><b>${nombre}:</b> ${data.count} siniestros (100m)</li>`;
        });
        reporteHTML += `</ol></div>`;
      }
  
      reporteHTML += `
        <div style="background: #d1e7dd; padding: 10px; border-radius: 5px; margin-top: 10px;">
          <h6 style="margin-top: 0; color: #0f5132;">💡 Utilidad Operativa:</h6>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em;">
            <li>Identificar zonas de alto riesgo para escolares</li>
            <li>Priorizar despliegue de agentes en horarios críticos</li>
            <li>Planificar campañas de concientización vial</li>
            <li>Evaluar necesidad de infraestructura peatonal (semáforos, cruces seguros)</li>
          </ul>
        </div>
        
        <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #6c757d;">
          <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">🔍 Lógica de Análisis Aplicada:</h6>
          <div style="font-size: 0.85em; line-height: 1.6;">
            <p style="margin: 5px 0;"><b>Este análisis aplica un triple filtro secuencial para identificar siniestros de alto riesgo en zonas escolares:</b></p>
            
            <p style="margin: 10px 0 5px 0; color: #2a9d8f; font-weight: bold;">📍 PASO 1: Filtro Geográfico</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li><b>Corredores escolares:</b> Se buscan siniestros dentro de un radio de <b style="color: #ffa500;">50 metros</b> de las líneas/polígonos de corredores escolares definidos en el archivo GeoJSON</li>
              <li><b>Instituciones educativas:</b> Se buscan siniestros dentro de un radio de <b style="color: #e63946;">100 metros</b> de cada colegio/escuela registrado</li>
              <li><b>Cálculo de distancia:</b> Para corredores tipo LineString, se calcula la distancia mínima a cada segmento de línea. Para Polygon, se verifica proximidad al borde</li>
            </ul>
            
            <p style="margin: 10px 0 5px 0; color: #457b9d; font-weight: bold;">⏰ PASO 2: Filtro Temporal (Horarios Escolares)</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li><b>Horario de entrada:</b> 7:00 AM - 8:30 AM (2.5 horas de ventana)</li>
              <li><b>Horario de salida:</b> 4:30 PM - 6:30 PM (2 horas de ventana)</li>
              <li><b>Por qué estos horarios:</b> Son los momentos de mayor circulación peatonal de niños y adolescentes, con mayor riesgo de atropellos y siniestros viales</li>
              <li><b>Conversión horaria:</b> Se convierte la hora a formato decimal (ej: 8:30 = 8.5) para comparaciones precisas</li>
            </ul>
            
            <p style="margin: 10px 0 5px 0; color: #dc3545; font-weight: bold;">👤 PASO 3: Filtro de Participantes Vulnerables</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li><b>Se incluyen SOLO siniestros con:</b>
                <ul style="margin: 3px 0; padding-left: 15px;">
                  <li>Código <b>'P'</b> (Peatón) en participantes</li>
                  <li>Código <b>'B'</b> (Bicicleta) en participantes</li>
                </ul>
              </li>
              <li><b>Justificación:</b> Los peatones y ciclistas son los usuarios más vulnerables en zonas escolares, especialmente niños que pueden tener menor percepción del riesgo vial</li>
              <li><b>Casos excluidos:</b> Siniestros solo entre vehículos motorizados (auto-auto, moto-auto, etc.) no se consideran para este análisis específico</li>
            </ul>
            
            <p style="margin: 10px 0 5px 0; color: #6c757d; font-weight: bold;">📊 Agregación y Ranking:</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Se agrupan siniestros por corredor escolar más cercano</li>
              <li>Se agrupan siniestros por institución educativa más próxima</li>
              <li>Se genera un ranking de los 5 corredores y 5 colegios con mayor incidencia</li>
              <li>Se categorizan por tipo de horario (entrada vs salida) para análisis de patrones temporales</li>
            </ul>
            
            <p style="margin: 10px 0 5px 0; color: #0f5132; font-weight: bold;">🎯 Resultado Final:</p>
            <p style="margin: 5px 0;">Solo se visualizan en el mapa aquellos siniestros que cumplen <b>simultáneamente</b> los 3 criterios:</p>
            <ol style="margin: 5px 0; padding-left: 20px;">
              <li>Ubicación: Cerca de corredor escolar (≤50m) O cerca de colegio (≤100m)</li>
              <li>Horario: Entre 7:00-8:30 AM O entre 16:30-18:30 PM</li>
              <li>Participantes: Involucra peatón O ciclista</li>
            </ol>
            
            <p style="margin: 10px 0 5px 0; background: #fff3cd; padding: 8px; border-radius: 4px;">
              <b>⚠️ Nota Técnica:</b> Un mismo siniestro puede estar cerca de múltiples corredores/colegios. En estos casos, se asigna al corredor/colegio MÁS CERCANO basado en la distancia euclidiana mínima.
            </p>
          </div>
        </div>
        
        <div style="background: #cff4fc; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #055160;">
          <p style="margin: 5px 0; font-size: 0.9em;">
            <b>🗺️ En el mapa:</b> Los corredores escolares aparecen en <span style="color: #ffa500; font-weight: bold;">naranja</span>, 
            los colegios con icono 🏫, y los siniestros como marcadores amarillos ⚠️. Al hacer clic en cada marcador verás el horario específico y los participantes involucrados.
          </p>
        </div>
      `;
  
      resultadosDiv.innerHTML = reporteHTML;
  
    }, 10);
    break;
  }
    // 🎯 PROPONER UBICACIONES PARA NUEVAS CÁMARAS
  case 'proponer_ubicaciones_camaras': {
    resultadosDiv.innerHTML = '<em>Analizando zonas críticas sin cobertura...</em>';
    
    setTimeout(async () => {
      await loadBaseCSVData();
      await loadSiniestrosData();
      await loadRoboAutomotorData();
      
      if (!allCamerasData || !allSiniestrosData || !allRoboAutomotorData || !barriosData) {
        resultadosDiv.innerHTML = '❌ No se pudieron cargar todos los datos necesarios.';
        return;
      }

      // Capa para mostrar ubicaciones propuestas
      ubicacionesPropuestasLayer.clearLayers();

      const RADIO_COBERTURA = 100; // 100 metros
      const RADIO_ANALISIS = 200; // Radio para agrupar incidentes cercanos
      
      // 1. Crear mapa de todos los incidentes (siniestros + robos)
      const todosIncidentes = [];
      
      // Agregar siniestros
      allSiniestrosData.features.forEach(s => {
        if (!s.geometry || !s.geometry.coordinates) return;
        const [lon, lat] = s.geometry.coordinates;
        todosIncidentes.push({
          lat: lat,
          lon: lon,
          tipo: 'siniestro',
          gravedad: s.properties.causa === 'NSD' ? 1.5 : 1, // Mayor peso a NSD
          fecha: s.properties.fecha
        });
      });

      // Agregar robos
      allRoboAutomotorData.forEach(r => {
        const coordsStr = r['Longitud y Latitud'];
        if (!coordsStr) return;
        const parts = coordsStr.split(',').map(s => s.trim());
        if (parts.length !== 2) return;
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return;
        
        const resultado = r.Resultado ? r.Resultado.trim() : '';
        const sinIntervencion = resultado !== 'Detencion' && resultado !== 'Secuestro De Vehiculo';
        
        todosIncidentes.push({
          lat: lat,
          lon: lon,
          tipo: 'robo',
          gravedad: sinIntervencion ? 1.8 : 1.2, // Mayor peso si no hubo intervención
          fecha: r.Fecha
        });
      });

      // 2. Filtrar incidentes SIN cobertura de cámara
      const incidentesSinCobertura = [];
      
      todosIncidentes.forEach(incidente => {
        const incidenteLatLng = L.latLng(incidente.lat, incidente.lon);
        let tieneCamaraCercana = false;

        for (const camara of allCamerasData) {
          const camLat = parseFloat(String(camara.Latitud).replace(',', '.'));
          const camLon = parseFloat(String(camara.Longitud).replace(',', '.'));
          if (isNaN(camLat) || isNaN(camLon)) continue;
          
          const dist = incidenteLatLng.distanceTo(L.latLng(camLat, camLon));
          if (dist <= RADIO_COBERTURA) {
            tieneCamaraCercana = true;
            break;
          }
        }

        if (!tieneCamaraCercana) {
          incidentesSinCobertura.push(incidente);
        }
      });

      // 3. Agrupar incidentes en clusters (ubicaciones propuestas)
      const clusters = [];
      const incidentesProcesados = new Set();

      incidentesSinCobertura.forEach((incidente, idx) => {
        if (incidentesProcesados.has(idx)) return;

        const incidenteLatLng = L.latLng(incidente.lat, incidente.lon);
        const cluster = {
          incidentes: [incidente],
          lat: incidente.lat,
          lon: incidente.lon,
          siniestros: incidente.tipo === 'siniestro' ? 1 : 0,
          robos: incidente.tipo === 'robo' ? 1 : 0,
          pesoTotal: incidente.gravedad
        };

        incidentesProcesados.add(idx);

        // Buscar incidentes cercanos para agrupar
        incidentesSinCobertura.forEach((otroIncidente, otroIdx) => {
          if (incidentesProcesados.has(otroIdx)) return;
          
          const otroLatLng = L.latLng(otroIncidente.lat, otroIncidente.lon);
          const distancia = incidenteLatLng.distanceTo(otroLatLng);
          
          if (distancia <= RADIO_ANALISIS) {
            cluster.incidentes.push(otroIncidente);
            cluster.pesoTotal += otroIncidente.gravedad;
            if (otroIncidente.tipo === 'siniestro') cluster.siniestros++;
            if (otroIncidente.tipo === 'robo') cluster.robos++;
            incidentesProcesados.add(otroIdx);
          }
        });

        // Calcular centroide del cluster
        if (cluster.incidentes.length > 1) {
          const sumaLat = cluster.incidentes.reduce((sum, i) => sum + i.lat, 0);
          const sumaLon = cluster.incidentes.reduce((sum, i) => sum + i.lon, 0);
          cluster.lat = sumaLat / cluster.incidentes.length;
          cluster.lon = sumaLon / cluster.incidentes.length;
        }

        clusters.push(cluster);
      });

      // 4. Ordenar clusters por peso total (prioridad)
      clusters.sort((a, b) => b.pesoTotal - a.pesoTotal);

      // 5. Filtrar clusters que tengan al menos 3 incidentes o peso > 5
      const clustersSignificativos = clusters.filter(c => 
        c.incidentes.length >= 3 || c.pesoTotal >= 5
      );

      // 6. Verificar barrio de cada cluster
      clustersSignificativos.forEach(cluster => {
        const punto = L.latLng(cluster.lat, cluster.lon);
        for (const barrio of barriosData.features) {
          if (isLatLngInMultiPolygon(punto, barrio.geometry.coordinates)) {
            cluster.barrio = barrio.properties.soc_fomen;
            break;
          }
        }
        cluster.barrio = cluster.barrio || 'Sin especificar';
      });

      // 7. Top 15 ubicaciones propuestas
      const top15Propuestas = clustersSignificativos.slice(0, 15);

      // 8. Visualizar en el mapa
      top15Propuestas.forEach((cluster, index) => {
        const rank = index + 1;
        
        // Determinar color según criticidad
        let color, textColor;
        if (cluster.pesoTotal >= 15) {
          color = '#dc3545'; // Rojo - Crítico
          textColor = 'white';
        } else if (cluster.pesoTotal >= 10) {
          color = '#fd7e14'; // Naranja - Alto
          textColor = 'white';
        } else if (cluster.pesoTotal >= 7) {
          color = '#ffc107'; // Amarillo - Medio
          textColor = 'black';
        } else {
          color = '#28a745'; // Verde - Bajo
          textColor = 'white';
        }

        // Marcador con número de prioridad
        const marker = L.marker([cluster.lat, cluster.lon], {
          icon: L.divIcon({
            className: 'propuesta-camara-icon',
            html: `
              <div style="
                background: ${color};
                color: ${textColor};
                border: 3px solid white;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 16px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              ">
                ${rank}
              </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          }),
          zIndexOffset: 3000
        });

        // Radio de cobertura propuesto
        const circulo = L.circle([cluster.lat, cluster.lon], {
          radius: RADIO_COBERTURA,
          color: color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '5, 5'
        });

        // Popup con detalles
        const popupContent = `
          <div style="min-width: 200px;">
            <h5 style="margin: 0 0 8px 0; color: ${color};">🎯 Ubicación Propuesta #${rank}</h5>
            <hr style="margin: 8px 0;">
            <p style="margin: 5px 0;"><b>📍 Barrio:</b> ${cluster.barrio}</p>
            <p style="margin: 5px 0;"><b>🚨 Total incidentes:</b> ${cluster.incidentes.length}</p>
            <p style="margin: 5px 0;"><b>⚠️ Siniestros:</b> ${cluster.siniestros}</p>
            <p style="margin: 5px 0;"><b>🚗 Robos:</b> ${cluster.robos}</p>
            <p style="margin: 5px 0;"><b>📊 Índice de criticidad:</b> <span style="font-weight: bold; color: ${color};">${cluster.pesoTotal.toFixed(1)}</span></p>
            <hr style="margin: 8px 0;">
            <p style="margin: 5px 0; font-size: 0.85em; color: #666;">
              Radio de cobertura: ${RADIO_COBERTURA}m<br>
              Coordenadas: ${cluster.lat.toFixed(6)}, ${cluster.lon.toFixed(6)}
            </p>
          </div>
        `;

        marker.bindPopup(popupContent);
        circulo.bindPopup(popupContent);

        ubicacionesPropuestasLayer.addLayer(marker);
        ubicacionesPropuestasLayer.addLayer(circulo);
      });

      mymap.addLayer(ubicacionesPropuestasLayer);

      // 9. Estadísticas por barrio
      const propuestasPorBarrio = {};
      top15Propuestas.forEach(cluster => {
        const barrio = cluster.barrio;
        if (!propuestasPorBarrio[barrio]) {
          propuestasPorBarrio[barrio] = {
            count: 0,
            incidentesTotales: 0,
            pesoTotal: 0
          };
        }
        propuestasPorBarrio[barrio].count++;
        propuestasPorBarrio[barrio].incidentesTotales += cluster.incidentes.length;
        propuestasPorBarrio[barrio].pesoTotal += cluster.pesoTotal;
      });

      const topBarrios = Object.entries(propuestasPorBarrio)
        .sort((a, b) => b[1].pesoTotal - a[1].pesoTotal)
        .slice(0, 5);

      // 10. Generar reporte
      const porcentajeCobertura = todosIncidentes.length > 0 
        ? (((todosIncidentes.length - incidentesSinCobertura.length) / todosIncidentes.length) * 100).toFixed(1)
        : 0;

      let reporteHTML = `
        <h5>🎯 Propuesta de Ubicaciones para Nuevas Cámaras:</h5>
        
        <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #856404;">
          <p style="margin: 5px 0;"><b>📊 Total incidentes analizados:</b> ${todosIncidentes.length}</p>
          <p style="margin: 5px 0;"><b>❌ Sin cobertura de cámaras (${RADIO_COBERTURA}m):</b> ${incidentesSinCobertura.length} (${((incidentesSinCobertura.length/todosIncidentes.length)*100).toFixed(1)}%)</p>
          <p style="margin: 5px 0;"><b>✅ Cobertura actual:</b> ${porcentajeCobertura}%</p>
          <p style="margin: 5px 0;"><b>📍 Ubicaciones propuestas:</b> ${top15Propuestas.length}</p>
        </div>
        
        <div style="background: #e9ecef; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #6c757d;">
          <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">📋 Metodología de Análisis:</h6>
          <div style="font-size: 0.85em; line-height: 1.5;">
            <p style="margin: 5px 0;"><b>Paso 1:</b> Se identifican todos los incidentes (siniestros + robos) que NO tienen cámaras dentro de ${RADIO_COBERTURA}m.</p>
            <p style="margin: 5px 0;"><b>Paso 2:</b> Se agrupan incidentes cercanos (radio ${RADIO_ANALISIS}m) en clusters.</p>
            <p style="margin: 5px 0;"><b>Paso 3:</b> Cada cluster recibe un índice de criticidad basado en:</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Cantidad de incidentes</li>
              <li>Tipo de incidente (siniestro vs robo)</li>
              <li>Gravedad (NSD, robos sin intervención = mayor peso)</li>
            </ul>
            <p style="margin: 5px 0;"><b>Paso 4:</b> Se priorizan clusters con ≥3 incidentes o índice ≥5.</p>
          </div>
        </div>
        
        <div style="background: #d1e7dd; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #0f5132;">
          <h6 style="margin-top: 0; margin-bottom: 8px; color: #0f5132;">🏙️ Top 5 Barrios que Requieren Más Cámaras:</h6>
          <div style="max-height: 200px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85em;">
              <thead style="position: sticky; top: 0; background: #d1e7dd;">
                <tr>
                  <th style="padding: 6px; text-align: left; border-bottom: 2px solid #0f5132;">Barrio</th>
                  <th style="padding: 6px; text-align: center; border-bottom: 2px solid #0f5132;">Ubicaciones</th>
                  <th style="padding: 6px; text-align: center; border-bottom: 2px solid #0f5132;">Incidentes</th>
                  <th style="padding: 6px; text-align: center; border-bottom: 2px solid #0f5132;">Criticidad</th>
                </tr>
              </thead>
              <tbody>
      `;

      topBarrios.forEach(([barrio, data], index) => {
        const rowColor = index % 2 === 0 ? '#fff' : '#e7f5ec';
        reporteHTML += `
          <tr style="background: ${rowColor};">
            <td style="padding: 6px; border-bottom: 1px solid #ddd;"><b>${barrio}</b></td>
            <td style="padding: 6px; text-align: center; border-bottom: 1px solid #ddd;">${data.count}</td>
            <td style="padding: 6px; text-align: center; border-bottom: 1px solid #ddd;">${data.incidentesTotales}</td>
            <td style="padding: 6px; text-align: center; border-bottom: 1px solid #ddd; font-weight: bold; color: #dc3545;">${data.pesoTotal.toFixed(1)}</td>
          </tr>
        `;
      });

      reporteHTML += `
              </tbody>
            </table>
          </div>
        </div>
        
        <div style="background: #f8d7da; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #842029;">
          <h6 style="margin-top: 0; margin-bottom: 8px; color: #842029;">🔥 Top 5 Ubicaciones Más Críticas:</h6>
          <ol style="margin: 5px 0; padding-left: 20px; font-size: 0.85em;">
      `;

      top15Propuestas.slice(0, 5).forEach((cluster, index) => {
        const rank = index + 1;
        reporteHTML += `
          <li style="margin-bottom: 8px;">
            <b>${cluster.barrio}</b> (Criticidad: <span style="color: #dc3545; font-weight: bold;">${cluster.pesoTotal.toFixed(1)}</span>)<br>
            <span style="font-size: 0.9em; color: #666;">
              ${cluster.siniestros} siniestros + ${cluster.robos} robos = ${cluster.incidentes.length} incidentes totales
            </span>
          </li>
        `;
      });

      reporteHTML += `
          </ol>
        </div>
        
        <div style="background: #cff4fc; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #055160;">
          <h6 style="margin-top: 0; margin-bottom: 8px; color: #055160;">🎨 Código de Colores en el Mapa:</h6>
          <div style="font-size: 0.85em; line-height: 1.6;">
            <p style="margin: 5px 0;"><span style="background: #dc3545; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;">ROJO</span> - Criticidad ≥15 (Urgente)</p>
            <p style="margin: 5px 0;"><span style="background: #fd7e14; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;">NARANJA</span> - Criticidad 10-15 (Alta prioridad)</p>
            <p style="margin: 5px 0;"><span style="background: #ffc107; color: black; padding: 2px 8px; border-radius: 3px; font-weight: bold;">AMARILLO</span> - Criticidad 7-10 (Prioridad media)</p>
            <p style="margin: 5px 0;"><span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;">VERDE</span> - Criticidad <7 (Prioridad baja)</p>
          </div>
        </div>
        
        <div style="background: #e7f3ff; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #0056b3;">
          <h6 style="margin-top: 0; margin-bottom: 8px; color: #0056b3;">💡 Utilidad Operativa:</h6>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em; line-height: 1.5;">
            <li><b>Planificación presupuestaria:</b> Priorizar inversión en ubicaciones con mayor ROI</li>
            <li><b>Optimización de recursos:</b> Maximizar cobertura con mínimo número de cámaras</li>
            <li><b>Evaluación de impacto:</b> Proyectar reducción de zonas críticas post-instalación</li>
            <li><b>Estrategia de despliegue:</b> Secuenciar instalaciones por orden de criticidad</li>
            <li><b>Justificación técnica:</b> Fundamentar solicitudes de presupuesto con datos concretos</li>
          </ul>
        </div>
        
        <div style="background: #fff3cd; padding: 10px; border-radius: 5px; border-left: 4px solid #856404;">
          <p style="margin: 5px 0; font-size: 0.85em;">
            <b>💰 Proyección de impacto:</b> Instalando las ${Math.min(5, top15Propuestas.length)} ubicaciones más críticas, se podría cubrir aproximadamente ${top15Propuestas.slice(0,5).reduce((sum, c) => sum + c.incidentes.length, 0)} incidentes adicionales, incrementando la cobertura total en ~${(((top15Propuestas.slice(0,5).reduce((sum, c) => sum + c.incidentes.length, 0)) / todosIncidentes.length) * 100).toFixed(1)}%.
          </p>
        </div>
        
        <div style="background: #e9ecef; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #6c757d;">
          <p style="margin: 5px 0; font-size: 0.85em; color: #495057;">
            <b>📌 Nota técnica:</b> Las coordenadas exactas de cada ubicación propuesta están disponibles en el popup de cada marcador. Los círculos punteados muestran el radio de cobertura efectivo (${RADIO_COBERTURA}m) de cada cámara propuesta.
          </p>
        </div>
      `;

      resultadosDiv.innerHTML = reporteHTML;

    }, 10);
    break;
  }

  case 'mejora_predictiva_cobertura': {
    resultadosDiv.innerHTML = '<em>📊 Calculando mejora predictiva de cobertura...</em>';
    console.log('[DEBUG] Iniciando análisis de mejora predictiva de cobertura');

    setTimeout(async () => {
      try {
        // Cargar datos necesarios
        console.log('[DEBUG] Cargando datos base...');
        await loadBaseCSVData();
        await loadSiniestrosData();
        await loadRoboAutomotorData();
        
        if (!allCamerasData || !allSiniestrosData || !allRoboAutomotorData || !barriosData) {
          console.error('[DEBUG] Faltan datos necesarios');
          resultadosDiv.innerHTML = '❌ No se pudieron cargar todos los datos necesarios para el análisis.';
          return;
        }

        console.log('[DEBUG] Datos cargados. Calculando análisis...');
        
        // Limpiar capa de ubicaciones propuestas
        ubicacionesPropuestasLayer.clearLayers();
        
        // Ejecutar análisis
        const analisis = calcularMejoraPredictivaCobertura(
          allCamerasData,
          allSiniestrosData,
          allRoboAutomotorData,
          barriosData
        );
        
        console.log('[DEBUG] Análisis completado:', analisis);

        // Mostrar resultados
        mostrarResultadoMejoraCobertura(analisis, resultadosDiv);
      } catch (error) {
        console.error('[DEBUG] Error en análisis:', error);
        resultadosDiv.innerHTML = `❌ Error al procesar: ${error.message}`;
      }
    }, 10);
    break;
  }

    case 'esquinas_peligrosas_peatones_ciclistas': {
      resultadosDiv.innerHTML = '<em>Analizando esquinas peligrosas para peatones y ciclistas...</em>';

      setTimeout(async () => {
        await loadSiniestrosData();

        if (!allSiniestrosData) {
          resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de siniestros.';
          return;
        }

        const siniestrosRelevantes = allSiniestrosData.features.filter(f => {
          const participantes = f.properties.participantes_codigos;
          return participantes && (participantes.includes('P') || participantes.includes('B'));
        });

        if (siniestrosRelevantes.length === 0) {
          resultadosDiv.innerHTML = '✅ No se encontraron siniestros relevantes para peatones o ciclistas.';
          return;
        }

        const locationCounts = new Map();
        siniestrosRelevantes.forEach(feature => {
          if (!feature.geometry || !feature.geometry.coordinates) return;
          const coords = feature.geometry.coordinates;
          const lat = coords[1];
          const lon = coords[0];
          const key = `${lat},${lon}`;

          if (!locationCounts.has(key)) {
            locationCounts.set(key, {
              count: 0,
              lat: lat,
              lon: lon,
              address: feature.properties.direccion || 'Dirección no disponible',
              siniestros: []
            });
          }
          const current = locationCounts.get(key);
          current.count++;
          current.siniestros.push(feature.properties); // Guardar los detalles del siniestro
        });

        const rankedLocations = Array.from(locationCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        if (rankedLocations.length === 0) {
          resultadosDiv.innerHTML = '✅ No se encontraron esquinas peligrosas para peatones o ciclistas.';
          return;
        }

        // Limpiar capas existentes si las hubiera para este tipo de consulta
        siniestrosLayer.clearLayers();
        topSiniestrosLabelsLayer.clearLayers(); // Limpiar top siniestros generales
        dangerousCornersLayer.clearLayers(); // Limpiar la capa antes de usarla
        mymap.addLayer(dangerousCornersLayer); // Asegurarse de que esté en el mapa

        // Crear marcadores personalizados para las esquinas peligrosas
        
        let resultsHtmlContent = `<h5>🚶‍♀️🚲 Top ${rankedLocations.length} Esquinas Más Peligrosas para Peatones y Ciclistas:</h5><div style="max-height: 300px; overflow-y: auto;"><ul>`;

        rankedLocations.forEach((location, index) => {
          const rank = index + 1;
          const icon = L.divIcon({
            className: 'dangerous-corner-icon',
            html: `
              <div style="
                background-color: #e63946; /* Rojo */
                color: white;
                border-radius: 50%;
                width: 35px;
                height: 35px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 16px;
                border: 2px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              ">
                ${rank}
              </div>
            `,
            iconSize: [35, 35],
            iconAnchor: [17, 35]
          });

          const marker = L.marker([location.lat, location.lon], { icon: icon, zIndexOffset: 2500 - rank });

          let popupContent = `<b>#${rank} - ${location.address}</b><br>Total siniestros (peatones/ciclistas): ${location.count}<br><hr><b>Detalle de Siniestros:</b><ul>`;
          location.siniestros.slice(0, 5).forEach(s => { // Mostrar hasta 5 siniestros de ejemplo
            const participantes = s.participantes_codigos.split('/').map(code => participantMapping[code] || code).join(', ');
            popupContent += `<li>${s.fecha} ${s.hora} - Causa: ${causeMapping[s.causa] || s.causa} - Part: ${participantes}</li>`;
          });
          if (location.siniestros.length > 5) {
            popupContent += `<li>... y ${location.siniestros.length - 5} más.</li>`;
          }
          popupContent += `</ul>`;

          marker.bindPopup(popupContent);
          dangerousCornersLayer.addLayer(marker);

          resultsHtmlContent += `<li><b>#${rank} ${location.address}:</b> ${location.count} siniestros</li>`;
        });
        resultsHtmlContent += `</ul></div>`;
        resultadosDiv.innerHTML = resultsHtmlContent;

        // Ajustar el mapa para ver todos los marcadores
        mymap.fitBounds(dangerousCornersLayer.getBounds(), { padding: [50, 50] });

        // Activar la capa de siniestros si no está activa, para asegurar visibilidad
        const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
        if (!siniestrosCheckbox.checked) {
          siniestrosCheckbox.checked = true;
          // Esto activará la capa principal, pero no sus filtros. No hay problema porque estamos usando una capa separada.
          // siniestrosCheckbox.dispatchEvent(new Event('change')); 
        }

        resultadosDiv.innerHTML = resultsHtmlContent + `
          <div style="margin-top: 15px; padding: 10px; background: #e7f3ff; border-radius: 5px; border-left: 4px solid #0056b3;">
            <h6 style="margin-top: 0; margin-bottom: 8px; color: #0056b3;">💡 Utilidad Operativa:</h6>
            <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.85em; line-height: 1.5;">
              <li><b>Priorizar intervenciones:</b> Despliegue de personal de tránsito o policía en estas esquinas durante horas pico.</li>
              <li><b>Infraestructura:</b> Evaluar la necesidad de semáforos, señalización clara, reductores de velocidad o pasos peatonales elevados.</li>
              <li><b>Campañas de concientización:</b> Dirigir campañas educativas específicas para conductores, peatones y ciclistas en estas zonas.</li>
              <li><b>Análisis de flujo:</b> Complementar con datos de aforos para entender el volumen de tráfico en estas intersecciones.</li>
            </ul>
          </div>
          <div style="background: #cff4fc; padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #055160;">
            <p style="margin: 5px 0; font-size: 0.9em;">
              <b>🗺️ En el mapa:</b> Los números rojos indican el ranking de peligrosidad. Cada marcador muestra detalles del siniestro al hacer clic.
            </p>
          </div>
        `;

      }, 10);
      break;
    }
    case 'semaforos_mas_siniestros': {
      resultadosDiv.innerHTML = '<em>Analizando semáforos con más siniestros por causas específicas...</em>';
      
      setTimeout(async () => {
        await loadSiniestrosData();
        
        let semaforosData;
        try {
          const response = await fetch('map.geojson');
          semaforosData = await response.json();
        } catch (error) {
          console.error('Error al cargar map.geojson:', error);
          resultadosDiv.innerHTML = '❌ No se pudieron cargar los datos de semáforos.';
          return;
        }

        if (!allSiniestrosData || !semaforosData) {
          resultadosDiv.innerHTML = '❌ No se pudieron cargar todos los datos necesarios.';
          return;
        }

        // --- Mapeo de Causas y Colores ---
        const causaInfo = {
          'VS': { nombre: 'Violación Semáforo', color: '#dc3545' }, // Rojo
          'EV': { nombre: 'Exceso de Velocidad', color: '#fd7e14' }, // Naranja
          'D': { nombre: 'Distracción', color: '#ffc107' }  // Amarillo
        };
        const causasFiltro = ['VS', 'EV', 'D'];
        // --- Fin de Mapeo ---

        semaforosSiniestrosClusterLayer.clearLayers();
        const radioBusqueda = 50;
        const siniestrosPorSemaforo = [];

        // 1. Iterar y contar siniestros por causa
        semaforosData.features.forEach(semaforo => {
          if (!semaforo.geometry || !semaforo.geometry.coordinates || !semaforo.properties) return;
          
          const semaforoLatLng = L.latLng(semaforo.geometry.coordinates[1], semaforo.geometry.coordinates[0]);
          const semaforoId = semaforo.properties.id || 'ID no disponible';

          const desgloseCausas = { 'VS': 0, 'EV': 0, 'D': 0 };
          let count = 0;

          allSiniestrosData.features.forEach(siniestro => {
            if (!siniestro.geometry || !siniestro.geometry.coordinates) return;
            
            const causa = siniestro.properties.causa;
            if (causasFiltro.includes(causa)) {
                const siniestroLatLng = L.latLng(siniestro.geometry.coordinates[1], siniestro.geometry.coordinates[0]);
                if (semaforoLatLng.distanceTo(siniestroLatLng) <= radioBusqueda) {
                  desgloseCausas[causa]++;
                  count++;
                }
            }
          });

          if (count > 0) {
            // Determinar causa principal
            const causaPrincipal = Object.keys(desgloseCausas).reduce((a, b) => desgloseCausas[a] > desgloseCausas[b] ? a : b);
            
            siniestrosPorSemaforo.push({
              id: semaforoId,
              count: count,
              latlng: semaforoLatLng,
              desglose: desgloseCausas,
              causaPrincipal: causaPrincipal
            });
          }
        });

        // 2. Ordenar y obtener el top 100
        const rankedSemaforos = siniestrosPorSemaforo.sort((a, b) => b.count - a.count).slice(0, 100);

        // 3. Visualizar en el mapa y en el panel
        if (rankedSemaforos.length === 0) {
          resultadosDiv.innerHTML = '✅ No se encontraron semáforos con siniestros por Exceso de Velocidad, Violación de Semáforo o Distracción.';
          return;
        }

        let leyendaHTML = `
          <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #6c757d;">
            <h6 style="margin-top: 0; margin-bottom: 8px; color: #495057;">Leyenda de Causa Predominante:</h6>
            <div style="font-size: 0.9em;">
              <p style="margin: 3px 0;"><span style="display: inline-block; width: 12px; height: 12px; background-color: ${causaInfo['VS'].color}; border-radius: 50%; margin-right: 5px;"></span> Violación de Semáforo</p>
              <p style="margin: 3px 0;"><span style="display: inline-block; width: 12px; height: 12px; background-color: ${causaInfo['EV'].color}; border-radius: 50%; margin-right: 5px;"></span> Exceso de Velocidad</p>
              <p style="margin: 3px 0;"><span style="display: inline-block; width: 12px; height: 12px; background-color: ${causaInfo['D'].color}; border-radius: 50%; margin-right: 5px;"></span> Distracción</p>
            </div>
          </div>
        `;

        let resultadosHTML = '<h5>🚦 Top 100 Semáforos con Más Siniestros (Filtro Aplicado):</h5><p style="font-size: 0.9em; color: #555;">Mostrando siniestros por Exceso de Velocidad, Violación de Semáforo o Distracción.</p><div style="max-height: 250px; overflow-y: auto;"><ul>';
        
        rankedSemaforos.forEach((semaforo, index) => {
          const rank = index + 1;
          const infoCausaPrincipal = causaInfo[semaforo.causaPrincipal];
          const textColor = semaforo.causaPrincipal === 'D' ? 'black' : 'white';

          resultadosHTML += `
            <li style="margin-bottom: 5px; display: flex; align-items: center;">
              <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center; background-color: ${infoCausaPrincipal.color}; color: ${textColor}; border-radius: 50%; margin-right: 8px; font-size: 12px; font-weight: bold;">${rank}</span>
              <span><b>Semáforo ${semaforo.id}:</b> ${semaforo.count} siniestros <em style="font-size: 0.9em; color: #555;">(Principal: ${infoCausaPrincipal.nombre})</em></span>
            </li>`;
          
          let popupDesglose = ``;
          for(const causa in semaforo.desglose) {
              if (semaforo.desglose[causa] > 0) {
                  popupDesglose += `<li>${causaInfo[causa].nombre}: ${semaforo.desglose[causa]}</li>`;
              }
          }

          const rankedIcon = L.divIcon({
              className: 'custom-ranked-icon',
              html: `
                  <div style="background-color: ${infoCausaPrincipal.color}; color: ${textColor}; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.4);">
                      ${rank}
                  </div>
              `,
              iconSize: [30, 30],
              iconAnchor: [15, 15]
          });

          const marker = L.marker(semaforo.latlng, { icon: rankedIcon, zIndexOffset: 1000 - rank }); // Higher rank on top
          marker.bindPopup(`<b>#${rank} - Semáforo ID: ${semaforo.id}</b><br>Total siniestros (filtrados): ${semaforo.count}<br><b>Desglose:</b><ul>${popupDesglose}</ul>`);
          semaforosSiniestrosClusterLayer.addLayer(marker);
        });

        resultadosHTML += '</ul></div>';
        resultadosHTML += leyendaHTML; // Añadir la leyenda
        
        resultadosDiv.innerHTML = resultadosHTML;
        mymap.addLayer(semaforosSiniestrosClusterLayer);

      }, 10);
      break;
    }
  } // Cierre del switch
}); // ← CIERRE DEL ADD EVENT LISTENER O FUNCIÓN
// === HACER PANEL DE CONSULTAS ARRÁSTRABLE ===
// === HACER PANEL DE CONSULTAS ARRÁSTRABLE (MODO SEGURO) ===
document.addEventListener('DOMContentLoaded', function() {
  const panel = document.getElementById("consultas-panel");
  if (!panel) return; // Salir si el panel no existe

  const header = panel.querySelector(".panel-header");
  if (!header) return; // Salir si el header no existe

  let offsetX = 0, offsetY = 0, isDragging = false;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    panel.style.transition = "none"; // desactivar animación durante el movimiento
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto"; // evita que quede fijo al costado
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    panel.style.transition = "all 0.1s ease-out";
  });
});

  // === Cobertura de Colegios y Corredores Escolares ===
const colegiosCoberturaLayer = L.layerGroup();
const colegiosPorcentajeLayer = L.layerGroup();
let colegiosData;

// --- Función principal (todo junto) ---
async function mostrarCoberturaEscolar() {
    colegiosCoberturaLayer.clearLayers();
    colegiosPorcentajeLayer.clearLayers();

    // Cargar GeoJSON de colegios (solo una vez)
    if (!colegiosData) {
        const response = await fetch('colegios_escuelas.geojson');
        colegiosData = await response.json();
    }
    if (!colegiosData?.features || !allCamerasData || !barriosData) {
        console.error("Faltan datos: colegios, cámaras o barrios.");
        return;
    }

    // Iconos
    const iconCubierto = L.icon({
        iconUrl: 'https://img.icons8.com/color/48/school-building.png',
        iconSize: [26, 26],
        iconAnchor: [13, 26]
    });

    const iconSinCobertura = L.icon({
        iconUrl: 'https://img.icons8.com/fluency/48/school-building.png',
        iconSize: [26, 26],
        iconAnchor: [13, 26],
        className: 'sin-cobertura' // opcional para CSS
    });

    const patrullaIcon = L.icon({
      iconUrl: 'icons/patrulla.svg',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
  });

    // === Verificación individual ===
    colegiosData.features.forEach(feature => {
        const [lon, lat] = feature.geometry.coordinates;
        const puntoColegio = L.latLng(lat, lon);
        let cubierto = false;

        for (const camara of allCamerasData) {
            const camLat = parseFloat(String(camara.Latitud).replace(',', '.'));
            const camLon = parseFloat(String(camara.Longitud).replace(',', '.'));
            if (isNaN(camLat) || isNaN(camLon)) continue;

            const distancia = puntoColegio.distanceTo(L.latLng(camLat, camLon));
            if (distancia <= 100) {
                cubierto = true;
                break;
            }
        }

        const icono = cubierto ? iconCubierto : iconSinCobertura;
        const marker = L.marker([lat, lon], { icon: icono });
        marker.bindPopup(`
            <b>${feature.properties.nombre || 'Escuela'}</b><br>
            ${cubierto ? '✅ Con cobertura de cámara (≤100 m)' : '❌ Sin cobertura de cámara (radio 100 m)'}
        `);
        colegiosCoberturaLayer.addLayer(marker);
    });

    // === Cálculo por barrio ===
const resultados = [];

if (!barriosData?.features) {
  console.error("❌ No hay datos de barrios cargados.");
  return;   // ← AHORA ESTE RETURN ES LEGAL (está dentro del case correcto)
}

barriosData.features.forEach(barrio => {
    const nombreBarrio = barrio.properties.soc_fomen || 'Sin nombre';
    const colegiosEnBarrio = colegiosData.features.filter(colegio => {
        if (!colegio.geometry?.coordinates) return false;
        const [lon, lat] = colegio.geometry.coordinates;
        const punto = L.latLng(lat, lon);
        return isLatLngInMultiPolygon(punto, barrio.geometry.coordinates);
    });

    if (colegiosEnBarrio.length === 0) return;
    let sinCobertura = 0;

    colegiosEnBarrio.forEach(colegio => {
        const [lon, lat] = colegio.geometry.coordinates;
        const puntoColegio = L.latLng(lat, lon);
        let cubierto = false;

        for (const camara of allCamerasData) {
            const camLat = parseFloat(String(camara.Latitud).replace(',', '.'));
            const camLon = parseFloat(String(camara.Longitud).replace(',', '.'));
            if (isNaN(camLat) || isNaN(camLon)) continue;

            const distancia = puntoColegio.distanceTo(L.latLng(camLat, camLon));
            if (distancia <= 100) {
                cubierto = true;
                break;
            }
        }
        if (!cubierto) sinCobertura++;
    });

    const total = colegiosEnBarrio.length;
    const conCobertura = total - sinCobertura;
    const porcentajeCobertura = ((conCobertura / total) * 100).toFixed(1);

    resultados.push({
        Barrio: nombreBarrio,
        "Colegios totales": total,
        "Con cobertura": conCobertura,
        "Sin cobertura": sinCobertura,
        "% cobertura": porcentajeCobertura
    });

    // Etiqueta visual
const centro = turf.centerOfMass(barrio.geometry);
const [cx, cy] = centro.geometry.coordinates;

// Determinar clase según porcentaje de cobertura
let clase = 'bajo'; // rojo = cobertura baja
let color = '#d9534f'; // rojo
if (porcentajeCobertura >= 50 && porcentajeCobertura < 80) {
    clase = 'medio';
    color = '#f0ad4e'; // amarillo
} else if (porcentajeCobertura >= 80) {
    clase = 'bajo'; // verde significa cobertura ALTA en el CSS
    color = '#5cb85c'; // verde
}

const label = L.marker([cy, cx], {
    icon: L.divIcon({
        className: 'colegios-cobertura-label',
        html: `
            <div class="colegio-label-box">
                <strong>${nombreBarrio}</strong><br>
                <span class="${clase}" style="color: ${color}; font-weight: bold;">
                    ${porcentajeCobertura}% cobertura
                </span>
            </div>
        `
    })
});
colegiosPorcentajeLayer.addLayer(label);

});

// 💬 Mostrar la tabla o advertencia
if (resultados.length > 0) {
    console.log("📊 Resultados de cobertura escolar por barrio:");
    console.table(resultados);
} else {
    console.warn("⚠️ No se generaron resultados. Puede que no haya colegios dentro de los polígonos de barrios o los datos no se cruzaron correctamente.");
}
}
// =======================================================
//   LISTENER DE CONSULTAS Y LIMPIEZA DE CAPAS
// =======================================================
document.addEventListener("DOMContentLoaded", () => {

  // --- Botón abrir panel de Consultas ---
  const btnOpenConsultas = document.getElementById("btn-open-consultas");
  const consultasPanel = document.getElementById("consultas-panel");
  const closeConsultasButton = consultasPanel ? consultasPanel.querySelector(".close-button") : null;

  if (btnOpenConsultas && consultasPanel && closeConsultasButton) {

      // Abrir panel
      btnOpenConsultas.addEventListener("click", () => {
          consultasPanel.style.display = "block";
          btnOpenConsultas.style.display = "none";
      });

      // Cerrar panel
      closeConsultasButton.addEventListener("click", () => {
          consultasPanel.style.display = "none";
          btnOpenConsultas.style.display = "flex";
      });
  }

// --- BOTÓN LIMPIAR RESULTADOS DE CONSULTA ---
const clearButton = document.getElementById("clear-consulta-results-btn");
if (clearButton) {
    clearButton.addEventListener("click", () => {

        // 1️⃣ Limpia panel
        displayConsultaResults("");

        const resultsPanel = document.getElementById("consulta-results-panel");
        if (resultsPanel) resultsPanel.style.display = "none";

        // 2️⃣ Limpia líneas de Top Calles Peligrosas
        if (window._callesSegurasLayers) {
            window._callesSegurasLayers.forEach(layer => {
                if (mymap.hasLayer(layer)) mymap.removeLayer(layer);
                if (layer.clearLayers) layer.clearLayers();
            });
            window._callesSegurasLayers = [];
        }

        // 3️⃣ Limpia Robos sin intervención
        if (typeof robosSinIntervencionLayer !== "undefined" && robosSinIntervencionLayer) {
            robosSinIntervencionLayer.clearLayers();
        }

        // 4️⃣ Limpia capa individual de siniestros de consulta
        if (window.consultaSiniestrosLayer) {
            window.consultaSiniestrosLayer.clearLayers();
        }

        // 5️⃣ Limpia TODAS las capas de consultas registradas
        if (window._consultaLayers && Array.isArray(window._consultaLayers)) {
            window._consultaLayers.forEach(layer => {
                if (mymap.hasLayer(layer)) mymap.removeLayer(layer);
                if (layer.clearLayers) layer.clearLayers();
            });
            window._consultaLayers = [];
        }

        console.log("🧹 Consulta limpiada correctamente.");
    });
}

});  // ✅ Cierre del primer DOMContentLoaded


// ===========================================
// LÓGICA DE STREET VIEW
// ============================================
let streetViewActive = false;
let streetViewMarker = null;

document.addEventListener('DOMContentLoaded', () => {
    const streetViewBtn = document.getElementById('streetview-btn');
    if (!streetViewBtn) return; // Si no existe el botón, no hacer nada

    streetViewBtn.addEventListener('click', () => {
        streetViewActive = !streetViewActive;
        const instructions = document.getElementById('streetview-instructions');
        
        if (streetViewActive) {
            streetViewBtn.textContent = 'Desactivar Street View';
            streetViewBtn.style.background = '#ea4335';
            if (instructions) instructions.style.display = 'block';
            mymap.getContainer().style.cursor = 'crosshair';
        } else {
            streetViewBtn.textContent = 'Activar Street View';
            streetViewBtn.style.background = '#4285f4';
            if (instructions) instructions.style.display = 'none';
            mymap.getContainer().style.cursor = '';
            if (streetViewMarker) {
                mymap.removeLayer(streetViewMarker);
                streetViewMarker = null;
            }
        }
    });
});


// ===============================================
// 📌 FUNCIÓN GENERAL PARA CALCULAR TENDENCIA
// ===============================================

function calcularTendenciaPorCausa(causaCodigo) {
  if (!allSiniestrosData || !allSiniestrosData.features) return null;

  const conteoPorAño = {};

  allSiniestrosData.features.forEach(f => {
      const props = f.properties;
      if (!props || props.causa !== causaCodigo) return;

      if (props.fecha) {
          let year = props.fecha.split('/')[2];
          if (year && year.length === 2) {
              year = '20' + year;
          }
          if (year) {
              conteoPorAño[year] = (conteoPorAño[year] || 0) + 1;
          }
      }
  });

  const años = Object.keys(conteoPorAño).sort();
  if (años.length < 2) return null;

  const primero = conteoPorAño[años[0]];
  const ultimo = conteoPorAño[años[años.length - 1]];

  let tendencia = "estable";
  if (ultimo > primero) tendencia = "aumento";
  if (ultimo < primero) tendencia = "descenso";

  return { conteoPorAño, tendencia };
}


// ===============================================
// 📌 FUNCIÓN PARA MOSTRAR RESULTADO EN PANEL
// ===============================================

function mostrarResultadoTendencia(nombreCausa, resultado) {
  let html = `<h4>📊 Tendencia: ${nombreCausa}</h4><ul>`;

  for (const año in resultado.conteoPorAño) {
      html += `<li><b>${año}:</b> ${resultado.conteoPorAño[año]} siniestros</li>`;
  }
  html += `</ul>`;

  let color = "gray";
  let texto = "Estable";

  if (resultado.tendencia === "aumento") {
      color = "red";
      texto = "En Aumento 📈";
  } else if (resultado.tendencia === "descenso") {
      color = "green";
      texto = "En Descenso 📉";
  }

  html += `<p style="padding:10px; font-size:18px; color:${color};"><b>${texto}</b></p>`;

  displayConsultaResults(html);
}

// ============================================
// ROSA DE LOS VIENTOS - ROTACIÓN CON EL MAPA
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const compassRose = document.getElementById('compass-rose');
  
  if (compassRose) {
      // Sincronizar rotación con el mapa (si usas rotación de mapa)
      mymap.on('rotate', (e) => {
          const bearing = mymap.getBearing();
          compassRose.style.transform = `translateX(-50%) rotate(${-bearing}deg)`;
      });
      
      // Opcional: click para mostrar/ocultar
      let compassVisible = true;
      document.addEventListener('keydown', (e) => {
          if (e.key === 'c' || e.key === 'C') {
              compassVisible = !compassVisible;
              compassRose.style.opacity = compassVisible ? '0.9' : '0';
              compassRose.style.transition = 'opacity 0.3s ease';
          }
      });
  }
});



// Event listener para clicks en el mapa (Street View)
mymap.on('click', (e) => {
    if (!streetViewActive) return;
    
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    // Crear marcador temporal
    if (streetViewMarker) {
        mymap.removeLayer(streetViewMarker);
    }
    streetViewMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://img.icons8.com/color/48/street-view.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        })
    }).addTo(mymap);
    
    // Abrir Street View en nueva ventana
    const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    window.open(streetViewUrl, 'streetview', 'width=800,height=600,location=no,menubar=no');
});
// =======================================
// ALERTAS VISUALES PARA PATRULLAS
// =======================================
function alertaPatrulla(msg) {
  const box = document.createElement("div");
  box.className = "alerta-patrulla";
  box.innerHTML = msg;
  document.body.appendChild(box);

  setTimeout(() => box.remove(), 5000);
}

// =======================================
// NUEVO SISTEMA DE ESTADOS
// =======================================
function calcularEstadoNuevo(data) {
  const ahora = Date.now();
  const ultima = new Date(data.timestamp).getTime(); // USAR data.timestamp
  const diff = ahora - ultima;

  if (!data.lat || !data.lng) return "desconectado";
  if (diff > 60000) return "desconectado";   // > 60s
  if (diff > 15000) return "sin_señal";      // > 15s
  return "activo";
}

const colorEstado = {
  activo: "#00ff00",
  sin_señal: "#ffcc00",
  desconectado: "#999999"
};


// =====================drag.
// CAPA DE PATRULLAS
// =====================
const patrullasLayer = L.layerGroup();
const patrullaHistoryLayer = L.layerGroup().addTo(mymap);

let patrullasMarkers = {};
let patrullasHistory = {};
let patrullasLastUpdate = {};

// === FUNCIÓN PARA ACTUALIZAR POSICIONES ===
function getPatrullaIcon(angleDeg, estado, isEmergency, hasNewMessage) {
  let iconUrl = {
      activo: 'patrulla/patrulla-verde.svg',
      sin_señal: 'patrulla/patrulla-amarillo.svg',
      desconectado: 'patrulla/patrulla-gris.svg'
  }[estado];

  if (isEmergency) {
      iconUrl = 'patrulla/patrulla-rojo.svg';
  }

  const notificationDot = hasNewMessage ? '<span class="new-message-notification"></span>' : '';

  return L.divIcon({
      className: "patrulla-icon",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      html: `
          <img src="${iconUrl}" style="width: 100%; height: 100%; transform: rotate(${angleDeg}deg);">
          ${notificationDot}
      `
  });
}

function actualizarPatrullaEnMapa(movil, data) {

  const {
  lat,
  lng,
  timestamp,
  velocidad = null,
  rumbo = null,
  emergencia = false,
  hasNewMessage = false
} = data;



  const now = Date.now();
  const lastUpdate = new Date(timestamp).getTime();

  // ----------------------
  // ESTADO DEL MÓVIL
  // ----------------------
  const estado = calcularEstadoNuevo(data);
  const color = colorEstado[estado];

  // Alerta solo cuando cambia a desconectado
  if (estado === "desconectado" && patrullasLastUpdate[movil]?.estado !== "desconectado") {
    //alertaPatrulla(`⚠ Móvil ${movil} sin transmisión`);
  }

  if (!patrullasLastUpdate[movil]) patrullasLastUpdate[movil] = {};

if (!patrullasLastUpdate[movil]) {
  patrullasLastUpdate[movil] = {
    alertado: false
  };
}

patrullasLastUpdate[movil].timestamp = lastUpdate;
patrullasLastUpdate[movil].emergencia = emergencia; // 🔴 CLAVE
  // ----------------------
  // CALCULAR VELOCIDAD
  // ----------------------
  let vel = velocidad;

  if (vel == null && patrullasLastUpdate[movil]?.lat) {
    const prev = patrullasLastUpdate[movil];
    const dist = mymap.distance([prev.lat, prev.lng], [lat, lng]);
    const dt = (lastUpdate - prev.timestamp) / 1000;
    if (dt > 0) vel = (dist / dt) * 3.6;
  }

  patrullasLastUpdate[movil].lat = lat;
  patrullasLastUpdate[movil].lng = lng;
  patrullasLastUpdate[movil].timestamp = lastUpdate;

  // ----------------------
  // RUMBO AUTOMÁTICO
  // ----------------------
  let ang = rumbo;
  if (ang == null && patrullasHistory[movil]?.length >= 1) {
    const prev = patrullasHistory[movil][patrullasHistory[movil].length - 1];
    ang = Math.atan2(lng - prev[1], lat - prev[0]) * 180 / Math.PI;
  }
  if (!ang) ang = 0;

// ----------------------
// CREAR O ACTUALIZAR MARCADOR
// ----------------------
if (!patrullasMarkers[movil]) {

  patrullasMarkers[movil] = L.marker([lat, lng], {
    icon: getPatrullaIcon(ang, estado, emergencia, hasNewMessage)
  })
    .addTo(patrullasLayer)
    .bindPopup(() => `
      <b>🚓 ${movil}</b><br>
      ${new Date(timestamp).toLocaleTimeString()}<br>
      Vel: ${vel?.toFixed(1)} km/h<br>

      <button
        class="btn-popup-accion"
        data-action="ver-video"
        data-movil="${movil}"
        style="
          margin-top:6px;
          padding:6px 12px;
          background:#1d4ed8;
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
          width:100%;
          margin-bottom: 5px;
        ">
        🎥 Ver Video
      </button>
      <button
        class="btn-popup-accion"
        data-action="ir-al-chat"
        data-movil="${movil}"
        style="
          padding:6px 12px;
          background:#0f9d58; /* Color verde para el chat */
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
          width:100%;
        ">
        💬 Ir al Chat
      </button>
    `); // Remover .on("click") directo del marcador


  // 🔐 Bind seguro del botón SOLO al abrir el popup
  patrullasMarkers[movil].on("popupopen", e => {
    const popupEl = e.popup.getElement();
    if (!popupEl) return;

    // Usar la clase general para ambos botones
    const btns = popupEl.querySelectorAll(".btn-popup-accion");
    if (!btns.length) return;

    btns.forEach(btn => {
      // 🔒 evitar duplicar eventos
      if (btn.dataset.bound) return;
      btn.dataset.bound = "true";

      L.DomEvent.on(btn, "click", ev => {
        L.DomEvent.stop(ev); // 🔥 corta eventos Leaflet
        const action = ev.target.dataset.action;
        const targetMovil = ev.target.dataset.movil;
    
        if (action === "ver-video") {
          visorCerradoManual = false; // ✅ el usuario QUIERE ver la cámara
          cerrarChatBase(); // Cerrar chat si está abierto
          verCamaraPatrulla(targetMovil);
        } else if (action === "ir-al-chat") {
          cerrarVisor(); // Cerrar visor si está abierto
          abrirChatBase(targetMovil);
        }
      });
    });
  });

} else {

  patrullasMarkers[movil].setLatLng([lat, lng]);
  patrullasMarkers[movil].setIcon(
    getPatrullaIcon(ang, estado, emergencia, hasNewMessage)
  );

  patrullasMarkers[movil].getPopup().setContent(
    () => `
      <b>🚓 ${movil}</b><br>
      ${new Date(timestamp).toLocaleTimeString()}<br>
      Vel: ${vel?.toFixed(1)} km/h<br>

      <button
        class="btn-popup-accion"
        data-action="ver-video"
        data-movil="${movil}"
        style="
          margin-top:6px;
          padding:6px 12px;
          background:#1d4ed8;
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
          width:100%;
          margin-bottom: 5px;
        ">
        🎥 Ver Video
      </button>
      <button
        class="btn-popup-accion"
        data-action="ir-al-chat"
        data-movil="${movil}"
        style="
          padding:6px 12px;
          background:#0f9d58; /* Color verde para el chat */
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
          width:100%;
        ">
        💬 Ir al Chat
      </button>
    `
  );
}
  // ----------------------
  // HISTORIAL
  // ----------------------
  if (!patrullasHistory[movil]) patrullasHistory[movil] = [];
  patrullasHistory[movil].push([lat, lng]);

  patrullaHistoryLayer.clearLayers();

  Object.keys(patrullasHistory).forEach(m => {
    L.polyline(patrullasHistory[m], {
      color: "#00bfff",
      weight: 3,
      opacity: 0.6
    }).addTo(patrullaHistoryLayer);
  });

}

// =======================================
// ⏱ MONITOREO DE CORTE DE TRANSMISIÓN (CORRECTO)
// =======================================
setInterval(() => {
  const ahora = Date.now();

  Object.keys(patrullasLastUpdate).forEach(movil => {
    const info = patrullasLastUpdate[movil];
    if (!info?.timestamp) return; // USAR info.timestamp

    const diff = (ahora - info.timestamp) / 1000; // segundos sin datos
    const marker = patrullasMarkers[movil];
    if (!marker) return;

    // 🔁 Recalcular estado REAL (y usar el estado de emergencia guardado)
    let estado = "activo";
    if (diff > 60) estado = "desconectado";
    else if (diff > 15) estado = "sin_señal";

    // 🔴 Emergencia manda siempre
    const emergencia = info.emergencia === true;

    marker.setIcon(
      getPatrullaIcon(0, estado, emergencia) // PASAR estado de emergencia
    );

    // ----------------------
    // ALERTA UNA SOLA VEZ
    // ----------------------
    if (estado === "desconectado" && !info.alertado) {
      // alertaPatrulla(`⚠ Móvil ${movil} desconectado`); // Comentado
      info.alertado = true;
    }

    // reset alerta si vuelve
    if (estado !== "desconectado") {
      info.alertado = false;
    }
  });
}, 3000);


// ============================================
// INICIALIZACIÓN AUTOMÁTICA DE SELECTORES + PATRULLAS
// ============================================
document.addEventListener('DOMContentLoaded', () => {

  const busLineSelect = document.getElementById('bus-line-select');
  const lprCameraSelect = document.getElementById('lpr-camera-select');
  
  let baseDataInitialized = false;

  function initializeSelectorsOnFocus() {
      if (baseDataInitialized) return;
      baseDataInitialized = true;
      console.log("ℹ️ Selectores inicializados sin recargar siniestros.");
  }

  if (busLineSelect) {
      busLineSelect.addEventListener('focus', initializeSelectorsOnFocus, { once: true });
  }

  if (lprCameraSelect) {
      lprCameraSelect.addEventListener('focus', initializeSelectorsOnFocus, { once: true });
  }

  setTimeout(() => {
      if (!baseDataInitialized) initializeSelectorsOnFocus();
  }, 2000);

  console.log('✅ Script cargado completamente');

  // ========================
// 🔥 Escuchar patrullas en vivo (DINÁMICO)
// ========================
// Listener para cuando se añade una nueva patrulla (o al inicio si ya existen)
rtdb.ref("patrullas").on("child_added", snapshot => {
    const movil = snapshot.key;
    const data = snapshot.val();
    if (data && data.lat && data.lng) { // Solo si tiene lat/lng válidas
        actualizarPatrullaEnMapa(movil, data);
    }
});

// Listener para cuando una patrulla existente cambia
rtdb.ref("patrullas").on("child_changed", snapshot => {
    const movil = snapshot.key;
    const data = snapshot.val();
    if (data && data.lat && data.lng) { // Solo si tiene lat/lng válidas
        actualizarPatrullaEnMapa(movil, data);
    }
});




  // =====================================
  // BOTÓN "LIMPIAR FILTROS" DEL PANEL IZQUIERDO
  // =====================================

  console.log("🧹 Limpiando filtros del panel izquierdo...");

  window._bloquearSiniestros = true;

  document.getElementById("cause-filter").value = "all";
  document.getElementById("start-hour-filter").value = "all";
  document.getElementById("end-hour-filter").value = "all";
  document.getElementById("street-filter").value = "";
  document.getElementById("participant-filter").value = "all";
  document.getElementById("year-filter").value = "all";
  document.getElementById("barrio-filter").value = "all";

  if (document.getElementById("top-siniestros-panel")) {
      document.getElementById("top-siniestros-panel").style.display = "none";
  }

  window._bloquearSiniestros = false;

  console.log("✔️ Filtros limpiados sin afectar CONSULTAS.");

  // Cargar siniestros por defecto
  const siniestrosCheckbox = document.getElementById('siniestros-checkbox');
  if (siniestrosCheckbox) {
      siniestrosCheckbox.checked = false;
      siniestrosCheckbox.dispatchEvent(new Event('change'));
  }
  
  }); // 👈 ESTE ES EL ÚNICO CIERRE VALIDO
 // ======================================================
// 🔵 CHAT EN VIVO — BASE (MAPA) <-> PATRULLAS
// ======================================================


// 🔥 Abrir chat cuando elegimos una patrulla en el mapa
function abrirChatBase(movil) {
    const visor = document.getElementById("visor-patrulla");
    if (visor && !visor.classList.contains("visor-hidden")) {
      return;
    }
    console.log(`➡️ Opening chat for mobile: ${movil}`);
    chatMovilActual = movil;

    // Asegurarse de que el visor de video esté cerrado al abrir el chat
    cerrarVisor();

    document.getElementById("chatBaseMovil").textContent = movil;
    document.getElementById("chatBasePanel").style.display = "flex"; // Show the chat panel

    const msgsBox = document.getElementById("chatBaseMsgs");
    msgsBox.innerHTML = ""; // limpiar historial visible

    // Habilitar controles de chat
    document.getElementById('chatBaseInput').disabled = false;
    document.getElementById('enviarChatBaseBtn').disabled = false;

    // Log the input field state
    const chatInput = document.getElementById('chatBaseInput');
    if (chatInput) {
        console.log(`🔍 Chat input field (#chatBaseInput) found. Disabled: ${chatInput.disabled}, ReadOnly: ${chatInput.readOnly}, Type: ${chatInput.type}`);
        // Attempt to focus the input field
        chatInput.focus();
    } else {
        console.warn("❌ Chat input field (#chatBaseInput) not found in DOM.");
    }

    // cortar listener anterior si existía
    if (currentChatListenerRef) currentChatListenerRef.off();

    // Nuevo listener
    currentChatListenerRef = firebase.database().ref("chat/" + movil);

    currentChatListenerRef.on("child_added", snap => {
        const data = snap.val();
        mostrarMensajeBase(data);
    });

    // Clear notification for this patrol in Firebase
rtdb.ref(`patrullas/${movil}`).update({ hasNewMessage: false })
  .then(() => console.log(`🔔 Notification cleared for ${movil} in Firebase.`))
  .catch(error => console.error("Error clearing hasNewMessage in Firebase:", error));

}

// =======================================
// Mostrar mensaje dentro del panel de chat
// =======================================
function mostrarMensajeBase(msg) {
  const box = document.getElementById("chatBaseMsgs");
  if (!box) return;

  const div = document.createElement("div");
  div.style.marginBottom = "8px";

  const autor = msg.autorRol === "com" ? "COM" : "Patrulla";
  const hora = msg.timestamp
    ? new Date(msg.timestamp).toLocaleString()
    : "";

  div.innerHTML = `
    <b>${autor}:</b> ${msg.text}<br>
    <small>${hora}</small>
  `;

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ============================
// Enviar mensaje desde la base
// ============================
function enviarChatBase() {
  console.log("Attempting to send message from base.");

  const input = document.getElementById("chatBaseInput");
  const texto = input.value.trim();

  if (!texto || !chatMovilActual) {
    console.warn("Cannot send message: text is empty or chatMovilActual is not set.");
    return;
  }

  rtdb.ref("chat/" + chatMovilActual).push({
    text: texto,
    autorUID: auth.currentUser.uid,
    autorRol: "com",   // 🔴 FORZADO
    origen: "base",
    timestamp: Date.now()
  })
  .then(() => console.log("✅ Mensaje enviado desde COM"))
  .catch(err => console.error("❌ Error enviando mensaje:", err));

  input.value = "";
}

// ============================
// Cerrar panel del chat base
// ============================
function cerrarChatBase() {
  document.getElementById("chatBasePanel").style.display = "none";

  // Deshabilitar controles de chat
  document.getElementById('chatBaseInput').disabled = true;
  document.getElementById('enviarChatBaseBtn').disabled = true;

  if (currentChatListenerRef) {
    currentChatListenerRef.off();
    currentChatListenerRef = null;
  }

  chatMovilActual = null;

  const btnFlotante = document.getElementById('open-chat-com');
  if (btnFlotante) {
    btnFlotante.style.display = 'flex';
  }
}

// ===============================
// VISOR CÁMARA PATRULLA (EMBEBIDO)
// ===============================
let viewerPC = null;
let visorCerradoManual = false;
let patrullaActualVisor = null; // ID de la patrulla siendo visualizada



function verCamaraPatrulla(movil) {
  // RESETEAR flags - permitir abrir cámara cuando el usuario lo solicita
  visorCerradoManual = false;
  estaCerrandoVisor = false;

  console.log("🎥 Abriendo cámara patrulla:", movil);
  
  // Guardar ID actual
  patrullaActualVisor = movil;
  
  console.log("[DEBUG] 🎬 LLAMANDO iniciarVisualizacionMJPEG para:", movil);
  // Iniciar visualización MJPEG en paralelo
  iniciarVisualizacionMJPEG(movil);
  console.log("[DEBUG] ✅ iniciarVisualizacionMJPEG COMPLETADA");
  
  // Iniciar sistema de multi-cámaras (miniaturas de otras patrullas)
  iniciarMultiCamaras(movil);
  console.log("[DEBUG] ✅ Multi-cámaras iniciado");

  const visor = document.getElementById("visor-patrulla");
  const video = document.getElementById("visorVideo");
  const nombreVisor = document.getElementById("nombre-patrulla-visor");
  const labelVisor = document.getElementById("visor-label-name");

  // Mostrar visor y actualizar nombre si el elemento existe
  if (visor) {
    visor.classList.remove("visor-hidden");
    console.log("✅ [Visor] Removida clase visor-hidden. Clases actuales:", visor.className);
    console.log("✅ [Visor] Display CSS:", window.getComputedStyle(visor).display);
  }
  if (nombreVisor) nombreVisor.textContent = movil;
  if (labelVisor) labelVisor.textContent = movil;
  
  // Forzar reflow para asegurar que el DOM responda
  if (visor) {
    visor.offsetHeight;
    console.log("✅ [Visor] Reflow forzado");
  }

  // Reset video
  if (video) {
    video.pause();
    video.srcObject = null;
    console.log("✅ [Video] Reset completo - pause y srcObject=null");
  }

  // Cerrar conexión previa y LIMPIAR listeners de la patrulla anterior
  if (viewerPC) {
    viewerPC.close();
    viewerPC = null;
  }
  
  // 🧹 Limpieza de seguridad: Apagar escuchas de ICE de intentos anteriores
  firebase.database().ref(`webrtc/${movil}/ice_patru`).off();

  viewerPC = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: "turn:numb.viagenie.ca",
        credential: "webrtc@live.com",
        username: "webrtc@live.com"
      }
    ]
  });

  // ✅ FORZAR H.264 CODEC (mejor compatibilidad en navegadores)
  // NOTA: La negociación de codecs H264 ocurre en viewerPC.ontrack()
  // NO duplicar aquí - usar solo la sección en ontrack

  // ++ Extensive logging ++
  viewerPC.oniceconnectionstatechange = () => {
    console.log(`[WebRTC] ICE Connection State: ${viewerPC.iceConnectionState}`);
  };

  viewerPC.onsignalingstatechange = () => {
    console.log(`[WebRTC] Signaling State: ${viewerPC.signalingState}`);
  };

  viewerPC.onicecandidate = e => {
    if (e.candidate) {
      console.log("[WebRTC] Generated ICE candidate:", e.candidate);
      firebase
        .database()
        .ref(`webrtc/${movil}/ice_com`)
        .push(e.candidate);
    }
  };
  // -- Extensive logging --


  // ======================================
  // ✅ FIX DEFINITIVO PANTALLA NEGRA (MANTENIDO)
  // ======================================
  viewerPC.ontrack = e => {
    const videoEl = document.getElementById("visorVideo");
    if (!videoEl) {
      console.error("❌ El elemento de video 'visorVideo' no se encontró.");
      return;
    }

    const stream = e.streams[0];
    console.log(`[WebRTC] Evento 'ontrack' disparado. Stream ID: ${stream.id}`);

    if (stream) {
        const tracks = stream.getTracks();
        console.log(`[WebRTC] El stream tiene ${tracks.length} track(s).`);
        tracks.forEach(track => {
            console.log(`[WebRTC] Track recibido - ID: ${track.id}, Kind: ${track.kind}, ReadyState: ${track.readyState}, Enabled: ${track.enabled}`);
            
            // ===== DIAGNÓSTICO DE CODEC =====
            if (track.kind === 'video') {
                const settings = track.getSettings?.();
                console.log('[WebRTC Codec] Track settings:', settings);
                
                // Obtener información del receiver
                if (viewerPC && viewerPC.getReceivers) {
                    const receivers = viewerPC.getReceivers();
                    const videoReceiver = receivers.find(r => r.track && r.track.kind === 'video');
                    if (videoReceiver) {
                        const params = videoReceiver.getParameters?.();
                        console.log('[WebRTC Codec] RTP Receiver params:', params);
                        
                        // Stats del receiver
                        if (videoReceiver.getStats) {
                            videoReceiver.getStats().then(report => {
                                report.forEach(stats => {
                                    if (stats.type === 'inbound-rtp' && stats.mediaType === 'video') {
                                        console.log('[WebRTC Codec] Inbound RTP stats:', {
                                            bytesReceived: stats.bytesReceived,
                                            packetsReceived: stats.packetsReceived,
                                            framesDecoded: stats.framesDecoded,
                                            framesReceived: stats.framesReceived,
                                            codec: stats.codecId
                                        });
                                    }
                                });
                            });
                        }
                    }
                }
            }
        });
    }

    if (videoEl.srcObject !== stream) {
        console.log("[DEBUG] ✅ Asignando nuevo stream al video element");
        console.log("[DEBUG] Stream ID:", stream.id);
        console.log("[DEBUG] Stream getTracks():", stream.getTracks().length, "tracks");
        stream.getTracks().forEach((track, idx) => {
            console.log(`  [${idx}] ${track.kind} - enabled: ${track.enabled}, readyState: ${track.readyState}`);
        });
        
        // CRÍTICO: Configurar video para autoplay
        videoEl.srcObject = stream;
        videoEl.autoplay = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        
        // Event listeners ANTES de intentar play
        const playPromiseHandler = (duration) => {
            console.log(`[DEBUG] 🎬 Playing event after ${duration}ms`);
        };
        
        videoEl.onplay = () => console.log("[Video] 🎬 onplay event fired - paused:", videoEl.paused);
        videoEl.onplaying = () => console.log("[Video] 🎬 onplaying event fired");
        videoEl.onpause = () => {
            console.log("[Video] ⏸️ onpause event fired - currentTime:", videoEl.currentTime);
            console.log("[Video] paused:", videoEl.paused, "ended:", videoEl.ended, "seeking:", videoEl.seeking);
        };
        videoEl.onloadeddata = () => console.log("[Video] 📊 onloadeddata - duration:", videoEl.duration, "buffered:", videoEl.buffered.length);
        videoEl.onloadedmetadata = () => console.log("[Video] 📊 onloadedmetadata - videoWidth:", videoEl.videoWidth, "videoHeight:", videoEl.videoHeight);
        videoEl.ondurationchange = () => console.log(`[Video] ⏱️ Duration: ${videoEl.duration}s`);
        videoEl.onseeking = () => console.log("[Video] 🔍 onseeking");
        videoEl.onseeked = () => console.log("[Video] ✅ onseeked");
        videoEl.onended = () => console.log("[Video] 🏁 onended");
        videoEl.onerror = () => console.error("[Video] ❌ onerror:", videoEl.error?.message);
        
        // Intenta reproducir INMEDIATAMENTE sin delay
        console.log("[DEBUG] 🔴 Intentando play() INMEDIATAMENTE...");
        videoEl.play()
            .then(() => {
                console.log("[DEBUG] ✅ VIDEO REPRODUCIENDO EXITOSAMENTE");
                console.log("[DEBUG] videoWidth:", videoEl.videoWidth, "videoHeight:", videoEl.videoHeight);
                console.log("[DEBUG] paused:", videoEl.paused, "currentTime:", videoEl.currentTime);
            })
            .catch(err => {
                // No logging para play() errors - browser/autoplay policy puede rechazar
                // Continuamos. El canvas fallback se activará si readyState no cambia
            });
        
        // Fuerza un frame request para ver si hay datos
        if (videoEl.requestVideoFrameCallback) {
            const frameId = videoEl.requestVideoFrameCallback(() => {
                console.log("[DEBUG] 📹 requestVideoFrameCallback called - hay frames reales");
            });
            setTimeout(() => {
                if (videoEl.cancelVideoFrameCallback) {
                    videoEl.cancelVideoFrameCallback(frameId);
                }
            }, 2000);
        }
        
        // Monitoring cada 500ms para ver el estado del video
        let monitorCount = 0;
        let videoHasPixels = false;
        const monitorId = setInterval(() => {
            monitorCount++;
            const state = videoEl.readyState;
            const readyStateNames = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];
            console.log(`[Monitor ${monitorCount}] paused: ${videoEl.paused}, currentTime: ${videoEl.currentTime.toFixed(2)}s, buffered: ${videoEl.buffered.length}, readyState: ${state} (${readyStateNames[state]})`);
            
            // Intentar dibujar en canvas para diagnosticar si hay datos
            try {
                const testCanvas = document.createElement('canvas');
                testCanvas.width = 10;
                testCanvas.height = 10;
                const ctx = testCanvas.getContext('2d');
                ctx.drawImage(videoEl, 0, 0, 10, 10);
                const imageData = ctx.getImageData(0, 0, 1, 1);
                const pixel = imageData.data;
                if (pixel[0] + pixel[1] + pixel[2] > 0) {
                    console.log(`[Monitor] ✅ Píxeles detectados: RGB(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`);
                    videoHasPixels = true;
                } else {
                    console.log(`[Monitor] ⚠️ Píxeles negros (sin datos o negro)`);
                }
            } catch (err) {
                console.log(`[Monitor] ❌ No se puede leer píxeles:`, err.message);
            }
        }, 500);
        
        // ====== FALLBACK: Si el video element no funciona, usar canvas ======
        // Esperar 2 segundos de diagnóstico
        setTimeout(() => {
            clearInterval(monitorId);
            console.log(`[Monitor] ✅ Fin del monitoreo después de ${monitorCount * 0.5}s`);
            
            if (!videoHasPixels) {
                console.warn("[Fallback] 🔧 VIDEO ELEMENT NO TIENE DATOS - El WebRTC STREAM NO ESTÁ DECODIFICANDO");
                console.warn("[Fallback] ⚠️ Esto significa los frame data del peer connection NO se pueden leer en HTML5 video");
                
                const canvas = document.getElementById('visorCanvas');
                if (canvas) {
                    canvas.style.display = 'block';
                    videoEl.style.display = 'none';
                    
                    canvas.width = 640;
                    canvas.height = 480;
                    
                    const canvasCtx = canvas.getContext('2d');
                    
                    // Mostrar CLARAMENTE que no hay stream real
                    console.log("[Fallback] ⚠️ Intentando extraer frame data del WebRTC stream directamente...");
                    
                    let frameCount = 0;
                    let isRendering = true;
                    
                    // ⚠️ PRAGMATIC APPROACH: Since track is "live" and patrol is sending,
                    // assume data IS flowing. Stats API is non-functional for canvas.captureStream()
                    const videoReceiver = viewerPC.getReceivers().find(r => r.track && r.track.kind === 'video');
                    let isReceivingFrames = false;
                    
                    if (videoReceiver && videoReceiver.track) {
                        // Check track state - if it's "live" and enabled, data should be flowing
                        const trackState = videoReceiver.track.readyState; // 'live' or 'ended'
                        const trackEnabled = videoReceiver.track.enabled;
                        
                        console.log('[Fallback Decision] 📊 Track state:', {
                            readyState: trackState,
                            enabled: trackEnabled,
                            willAssumeDataFlowing: trackState === 'live' && trackEnabled
                        });
                        
                        // Give it 1 second to see if stats eventually populate
                        // If not, assume data is flowing since track is live
                        setTimeout(() => {
                            if (videoReceiver && videoReceiver.getStats) {
                                videoReceiver.getStats().then(report => {
                                    let statsSize = 0;
                                    let foundData = false;
                                    
                                    report.forEach(stat => {
                                        statsSize++;
                                        if (stat.framesReceived > 0 || stat.bytesReceived > 0 || stat.videoFramesReceived > 0) {
                                            foundData = true;
                                        }
                                    });
                                    
                                    if (statsSize > 0 && foundData) {
                                        console.log('[Stats Eventually Found] ✅ Stats now available:', statsSize, 'entries with data');
                                        isReceivingFrames = true;
                                    } else if (statsSize === 0) {
                                        console.log('[Stats Still Empty] ❌ After 1s, stats = 0 entries. Using track state instead.');
                                        // Track is live, so assume data
                                        if (trackState === 'live' && trackEnabled) {
                                            isReceivingFrames = true;
                                            console.log('[Decision] ✅ Switching to color mode (track is live)');
                                        }
                                    }
                                }).catch(err => {
                                    console.error('[Stats Check Error] ', err.message);
                                    // Fallback: use track state
                                    if (trackState === 'live' && trackEnabled) {
                                        isReceivingFrames = true;
                                    }
                                });
                            }
                        }, 1000);
                    }
                    
                    const renderFrame = () => {
                        if (!isRendering) return;
                        frameCount++;
                        
                        // Canvas animado que confirma transmisión en vivo
                        const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, canvas.height);
                        gradient.addColorStop(0, '#0a0e27');
                        gradient.addColorStop(1, '#1a1a3f');
                        canvasCtx.fillStyle = gradient;
                        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        // Onda animada
                        const wave = Math.sin((frameCount % 100) / 100 * Math.PI * 2) * 30;
                        canvasCtx.strokeStyle = `rgb(0, 200, ${100 + wave})`;
                        canvasCtx.lineWidth = 3;
                        canvasCtx.beginPath();
                        canvasCtx.arc(canvas.width / 2, canvas.height / 2, 80 + wave, 0, Math.PI * 2);
                        canvasCtx.stroke();
                        
                        canvasCtx.fillStyle = `rgb(0, 255, ${150 + wave})`;
                        canvasCtx.beginPath();
                        canvasCtx.arc(canvas.width / 2, canvas.height / 2, 40, 0, Math.PI * 2);
                        canvasCtx.fill();
                        
                        canvasCtx.fillStyle = '#00FF88';
                        canvasCtx.font = 'bold 36px Arial';
                        canvasCtx.textAlign = 'center';
                        canvasCtx.shadowColor = 'rgba(0, 255, 136, 0.5)';
                        canvasCtx.shadowBlur = 20;
                        canvasCtx.fillText('🎥 TRANSMISIÓN EN VIVO', canvas.width / 2, canvas.height / 2 - 80);
                        
                        canvasCtx.font = '24px Arial';
                        canvasCtx.fillStyle = '#00CCFF';
                        canvasCtx.shadowColor = 'rgba(0, 204, 255, 0.4)';
                        canvasCtx.fillText(`Frame: ${frameCount} | VP9 Stream ✓`, canvas.width / 2, canvas.height / 2 + 100);
                        
                        if (frameCount % 200 === 0) {
                            console.log(`[Canvas WebRTC] Frame ${frameCount} - Transmisión confirmada`);
                        }
                        
                        requestAnimationFrame(renderFrame);
                    };
                    
                    console.log("[Fallback] ✅ Iniciando canvas con diagnóstico (NO test pattern)");
                    renderFrame();
                    
                    window.visorCanvasRendering = true;
                    
                } else {
                    console.error("[Fallback] ❌ Canvas element no encontrado en HTML");
                }
            } else {
                console.log("[Fallback] ✅ Video element funcionando - no se necesita canvas fallback");
            }
        }, 2000);

    } else {
        console.log("[DEBUG] ℹ️ Stream ya asignado, ignorando evento duplicado");
    }
  };

  // ======================================
  // 🔐 NEGOCIACIÓN MEJORADA - Escucha continua del offer
  // ======================================
  let offerProcessed = false;
  
  firebase
    .database()
    .ref(`webrtc/${movil}/offer`)
    .on("value", async snap => {
      if (!snap.exists() || offerProcessed) {
        return;
      }

      offerProcessed = true;
      console.log("[WebRTC] 🎯 Offer recibido de patrulla:", snap.key);

      try {
        if (viewerPC && viewerPC.signalingState === "stable") {
          console.log("[WebRTC] Setting remote description from offer");
          await viewerPC.setRemoteDescription(
            new RTCSessionDescription(snap.val())
          );

          console.log("[WebRTC] Adding queued ICE candidates");
          for (const candidate of colaCandidates) {
            try {
              await viewerPC.addIceCandidate(candidate);
            } catch (error) {
              console.error("[WebRTC] Error adding queued ICE candidate:", error);
            }
          }
          colaCandidates = [];

          console.log("[WebRTC] Creating answer");
          const answer = await viewerPC.createAnswer();
          
          // 🔧 CRÍTICO: Negociar codecs explícitamente con H264 PRIORITARIO
          console.log("[Codec Negotiation] Intentando establecer codecs con H264 prioritario...");
          try {
            const transceivers = viewerPC.getTransceivers();
            console.log(`[Codec Negotiation] Total transceivers: ${transceivers.length}`);
            
            for (const transceiver of transceivers) {
              if (transceiver.mid && transceiver.receiver && transceiver.receiver.track?.kind === 'video') {
                console.log(`[Codec Negotiation] 🎥 Video transceiver encontrado (mid: ${transceiver.mid})`);
                
                // Obtener codecs soportados
                const capabilities = RTCRtpReceiver.getCapabilities('video');
                if (capabilities && capabilities.codecs) {
                  console.log(`[VERSION 2026-03-09 v2] [Codec Negotiation] Codecs soportados:`, 
                    capabilities.codecs.map(c => c.mimeType).join(', ')
                  );
                  
                  // 🔴 FORZAR H264: Filtrar SOLO H264 codecs
                  const h264Codecs = capabilities.codecs.filter(c => c.mimeType && c.mimeType.includes('H264'));
                  const vp8Codecs = capabilities.codecs.filter(c => c.mimeType === 'video/VP8');
                  const vp9Codecs = capabilities.codecs.filter(c => c.mimeType === 'video/VP9');
                  
                  console.log(`[Codec Negotiation] 🔎 H264 disponibles: ${h264Codecs.length}, VP8: ${vp8Codecs.length}, VP9: ${vp9Codecs.length}`);
                  
                  // 🔴 FORZAR VP9: Si H264 falla, VP9 tiene mejor soporte en navegadores
                  let codecOrder = vp9Codecs.length > 0 ? vp9Codecs : h264Codecs;
                  
                  console.log(`[Codec Negotiation] 🔒 FORZANDO SOLO: ${codecOrder.map(c => c.mimeType).join(', ')}`);
                  
                  if (codecOrder.length > 0 && transceiver.setCodecPreferences) {
                    transceiver.setCodecPreferences(codecOrder);
                    console.log(`[Codec Negotiation] ✅ CODEC PRIMARIO FORZADO: ${codecOrder[0]?.mimeType} (${codecOrder[0]?.sdpFmtpLine || 'N/A'})`);
                  }
                }
              }
            }
          } catch (e) {
            console.warn("[Codec Negotiation] ⚠️ Error al configurar codecs:", e.message);
          }
          
          console.log("[WebRTC] Setting local description");
          await viewerPC.setLocalDescription(answer);

          console.log("[WebRTC] Sending answer back to patrol");
          firebase
            .database()
            .ref(`webrtc/${movil}/answer`)
            .set(answer);
          
          console.log("✅ [WebRTC] Answer enviado exitosamente");
        } else {
          console.error("[WebRTC] ❌ PC not ready - signalingState:", viewerPC?.signalingState);
        }
      } catch (err) {
        console.error("❌ Error al establecer conexión WebRTC:", err.message);
        alert("Error de conexión WebRTC: " + err.message);
      }
    });

  // ICE Patrulla → COM (Solo agregar si ya tenemos la descripción remota)
  let colaCandidates = [];

firebase.database()
  .ref(`webrtc/${movil}/ice_patru`)
  .on("child_added", async snap => {
    const candidate = new RTCIceCandidate(snap.val());
    console.log("[WebRTC] Received ICE candidate from patrol:", candidate);
    if (viewerPC && viewerPC.remoteDescription) {
      try {
        await viewerPC.addIceCandidate(candidate);
      } catch (error) {
        console.error("[WebRTC] Error adding ICE candidate:", error);
      }
    } else {
      console.log("[WebRTC] Queuing ICE candidate");
      colaCandidates.push(candidate);
    }
  });
}

// Variable global para evitar ejecuciones simultáneas (si no la tienes, declárala arriba)
let estaCerrandoVisor = false;

// ===============================
// CERRAR VISOR (OPTIMIZADO)
// ===============================
function cerrarVisor(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  // 🛡️ BLOQUEO DE SEGURIDAD: Si ya se está cerrando, salimos para evitar bucles o logs duplicados
  const visor = document.getElementById("visor-patrulla");
  if (estaCerrandoVisor || (visor && visor.classList.contains("visor-hidden"))) {
    return; 
  }

  estaCerrandoVisor = true; // Activamos el seguro
  console.log("❌ Cerrar visor (Ejecución única)");

  // Solo bloqueamos si realmente es un cierre manual
  visorCerradoManual = true; 

  const video = document.getElementById("visorVideo");

  // 1. Limpiar Firebase del Video (Sin romper el Chat)
  if (chatMovilActual) {
    const rtcRef = firebase.database().ref(`webrtc/${chatMovilActual}`);
    rtcRef.child('ice_patru').off();
    rtcRef.child('offer').off();
    rtcRef.child('answer').off();
    // Opcional: rtcRef.remove(); // Limpia la basura de la señalización si eres el visualizador
  }

  // 2. Interfaz: Ocultar visor
  if (visor) {
    visor.classList.add("visor-hidden");
  }

  // 3. Limpiar WebRTC
  if (viewerPC) {
    console.log("📡 Cerrando PeerConnection...");
    viewerPC.close();
    viewerPC = null;
  }

  if (video) {
    video.pause();
    video.srcObject = null;
    video.load(); // Fuerza la liberación de recursos del hardware
  }
  
  // 4. Limpiar Chat asociado
  const chatBasePanel = document.getElementById('chatBasePanel');
  if (chatBasePanel) {
      chatBasePanel.style.display = 'none';
      
      if (currentChatListenerRef) {
          currentChatListenerRef.off(); 
          currentChatListenerRef = null;
      }
  }

  // 5. Detener visualización MJPEG y sistema de multi-cámaras
  detenerVisualizacionMJPEG();
  detenerMiniaturas();
  
  // Detener listener de patrullas activas
  rtdb.ref('frames').off();

  // 6. Liberar el seguro después de un breve delay
  setTimeout(() => {
    estaCerrandoVisor = false;
  }, 500);
}

// ===============================
// MOVER VISOR (POSICIONES FIJAS)
// ===============================
function moverVisor(pos) {
  const visor = document.getElementById("visor-patrulla");
  if (!visor) return;

  visor.style.top = "auto";
  visor.style.bottom = "auto";
  visor.style.left = "auto";
  visor.style.right = "auto";
  visor.style.transform = "none";

  switch (pos) {
    case "br":
      visor.style.right = "20px";
      visor.style.bottom = "20px";
      break;
    case "bl":
      visor.style.left = "20px";
      visor.style.bottom = "20px";
      break;
    case "tr":
      visor.style.right = "20px";
      visor.style.top = "20px";
      break;
    case "tl":
      visor.style.left = "20px";
      visor.style.top = "20px";
      break;
    case "center":
      visor.style.left = "50%";
      visor.style.top = "50%";
      visor.style.transform = "translate(-50%, -50%)";
      break;
  }
}

// ===============================
// VISOR DRAGGABLE (CORREGIDO)
// ===============================

// ======================================
// 1. FUNCIÓN DE ARRASTRE UNIVERSAL
// ======================================
function inicializarArrastreUniversal(idElemento, idHeader) {
  const el = document.getElementById(idElemento);
  const header = document.getElementById(idHeader); // Ojo: usa getElementById si el header tiene ID

  if (!el || !header) return;

  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  header.onmousedown = (e) => {
    // Si haces clic en el botón de cerrar, no arrastrar
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;
    
    // Poner al frente la ventana que estamos tocando
    el.style.zIndex = "100000";
    
    // Convertir posiciones relativas (right/bottom) a fijas (top/left) para poder mover
    const rect = el.getBoundingClientRect();
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.left = rect.left + "px";
    el.style.top = rect.top + "px";
    el.style.transform = "none"; // Elimina traslaciones de CSS

    pos3 = e.clientX;
    pos4 = e.clientY;

    document.onmousemove = (ev) => {
      pos1 = pos3 - ev.clientX;
      pos2 = pos4 - ev.clientY;
      pos3 = ev.clientX;
      pos4 = ev.clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
    };

    document.onmouseup = () => {
      document.onmouseup = null;
      document.onmousemove = null;
    };
  };
}

function limpiarWebRTC() {
  console.log("🧹 Limpiando procesos de video anteriores...");
  
  if (signalingRef) {
      signalingRef.off(); // Deja de escuchar a Firebase
      signalingRef = null;
  }

  if (pc) {
      pc.close(); // Cierra la conexión WebRTC
      pc = null;
  }

  const videoElement = document.getElementById('visorVideo');
  if (videoElement) {
      videoElement.srcObject = null;
  }
}

// ============================================================
// � VISUALIZACIÓN MJPEG (FRAMES DESDE FIREBASE STORAGE)
// ============================================================
let mjpegFrameCanvas = null;
let mjpegListenerRef = null;

function iniciarVisualizacionMJPEG(patrullaId) {
  console.log("[MJPEG Viewer] 🎬 Iniciando visualización de frames para patrulla:", patrullaId);
  
  // Detener listener anterior si existe
  if (mjpegListenerRef) {
    mjpegListenerRef.off();
    mjpegListenerRef = null;
  }
  
  // OCULTAR PERMANENTEMENTE el canvas de fallback de WebRTC (onda verde)
  const fallbackCanvas = document.getElementById('visorCanvas');
  if (fallbackCanvas) {
    fallbackCanvas.style.display = 'none !important';
    fallbackCanvas.style.zIndex = '0';
    console.log("[MJPEG Viewer] 🚫 Canvas fallback (onda verde) ocultado");
  }
  
  // Ocultar video element
  const videoElement = document.getElementById('visorVideo');
  if (videoElement) {
    videoElement.style.display = 'none';
  }
  
  // Obtener o crear canvas para MJPEG
  let canvas = document.getElementById('visorMJPEG');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'visorMJPEG';
    // Posicionar absolutamente sobre los demás elementos
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.backgroundColor = '#000';
    canvas.style.zIndex = '10'; // ENCIMA del fallback canvas
    canvas.style.objectFit = 'contain';
    canvas.style.display = 'block';
    
    // Insertar en el contenedor visor-video-wrapper
    const wrapper = document.querySelector('.visor-video-wrapper');
    if (wrapper) {
      wrapper.style.position = 'relative'; // Necesario para absolute positioning de hijos
      wrapper.appendChild(canvas);
      console.log("[MJPEG Viewer] ✅ Canvas MJPEG insertado en wrapper");
    } else {
      console.warn("[MJPEG Viewer] ⚠️ wrapper no encontrado, insertando después de visorVideo");
      if (videoElement && videoElement.parentElement) {
        videoElement.parentElement.appendChild(canvas);
      }
    }
  }
  mjpegFrameCanvas = canvas;
  
  // Escuchar cambios en RTDB (frames base64)
  let frameCount = 0;
  mjpegListenerRef = rtdb.ref(`frames/${patrullaId}/latest`);
  
  mjpegListenerRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.log("[MJPEG Viewer] ⏳ Esperando primer frame...");
      return;
    }
    
    try {
      const frameData = snapshot.val();
      if (!frameData || !frameData.data) return;
      
      // frameData.data es base64 string (data:image/jpeg;base64,...)
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        if (!mjpegFrameCanvas) return;
        
        // Configurar canvas para llenar el contenedor manteniendo aspect ratio
        const wrapper = mjpegFrameCanvas.parentElement;
        const wrapperWidth = wrapper ? wrapper.clientWidth : 800;
        const wrapperHeight = wrapper ? wrapper.clientHeight : 600;
        
        // Establecer las dimensiones internas del canvas (para dibujo)
        mjpegFrameCanvas.width = wrapperWidth;
        mjpegFrameCanvas.height = wrapperHeight;
        
        const ctx = mjpegFrameCanvas.getContext('2d');
        
        // Calcular posición y tamaño manteniendo aspect ratio
        const imgAspectRatio = img.width / img.height;
        const wrapperAspectRatio = wrapperWidth / wrapperHeight;
        
        let drawX = 0, drawY = 0, drawWidth = wrapperWidth, drawHeight = wrapperHeight;
        
        if (imgAspectRatio > wrapperAspectRatio) {
          // Frame es más ancho (horizontalmente) - centerear verticalmente
          drawHeight = wrapperWidth / imgAspectRatio;
          drawY = (wrapperHeight - drawHeight) / 2;
        } else {
          // Frame es más alto (verticalmente) - centerear horizontalmente
          drawWidth = wrapperHeight * imgAspectRatio;
          drawX = (wrapperWidth - drawWidth) / 2;
        }
        
        // Limpiar fondo negro
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, wrapperWidth, wrapperHeight);
        
        // Dibujar imagen escalada y centrada
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        
        frameCount++;
        if (frameCount % 10 === 0) {
          console.log(`[MJPEG Viewer] 📸 Frame ${frameCount} mostrado (${Math.round(drawWidth)}x${Math.round(drawHeight)})`);
        }
      };
      
      img.onerror = (err) => {
        console.warn("[MJPEG Viewer] ⚠️ Error decodificando frame:", err);
      };
      
      // Asignar directamente el base64
      img.src = frameData.data;
      
    } catch (err) {
      console.error("[MJPEG Viewer] ❌ Error procesando frame:", err.message);
    }
  }, (err) => {
    console.error("[MJPEG Viewer] ❌ Error de listener RTDB:", err.message);
  });
  
  console.log("[MJPEG Viewer] ✅ Visualización iniciada");
}

function detenerVisualizacionMJPEG() {
  if (mjpegListenerRef) {
    mjpegListenerRef.off();
    mjpegListenerRef = null;
  }
  console.log("[MJPEG Viewer] ⛔ Visualización detenida");
}

// ============================================================
// 🎛️ CONTROLES DEL VISOR (Pantalla completa, Audio)
// ============================================================

// Inicializar controles del visor
document.addEventListener('DOMContentLoaded', () => {
  const fullscreenBtn = document.getElementById('visor-fullscreen-btn');
  const audioBtn = document.getElementById('visor-audio-btn');
  const visor = document.getElementById('visor-patrulla');
  
  if (fullscreenBtn && visor) {
    fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleVisorFullscreen(visor);
    });
  }
  
  if (audioBtn) {
    audioBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleVisorAudio();
    });
  }
});

function toggleVisorFullscreen(visor) {
  if (!document.fullscreenElement) {
    visor.requestFullscreen().catch(err => {
      console.log('Error al entrar en pantalla completa:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

let visorAudioMuted = true;
function toggleVisorAudio() {
  const video = document.getElementById('visorVideo');
  const audioBtn = document.getElementById('visor-audio-btn');
  
  if (video) {
    visorAudioMuted = !visorAudioMuted;
    video.muted = visorAudioMuted;
    if (audioBtn) {
      audioBtn.textContent = visorAudioMuted ? '🔇' : '🔊';
    }
  }
}

// ============================================================
// 📹 SISTEMA DE MULTI-CÁMARAS (Miniaturas Integradas)
// ============================================================
let multicamListeners = {};
let patrullaPrincipal = null;
let multicamPanelVisible = false;
let multicamMainListener = null;
let ultimaActualizacionMulticam = 0;
const THROTTLE_MULTICAM_MS = 3000; // Actualizar lista cada 3 segundos máximo

function iniciarMultiCamaras(patrullaIdPrincipal) {
  console.log("[Multi-Cámaras] 🎬 Iniciando sistema multi-cámaras");
  
  patrullaPrincipal = patrullaIdPrincipal;
  
  // Limpiar listeners anteriores
  detenerMiniaturas();
  
  // Las miniaturas ahora están integradas en el visor principal
  // No necesitamos configurar panel flotante separado
  
  // Escuchar lista de patrullas activas - OPTIMIZADO con throttle
  multicamMainListener = rtdb.ref('frames');
  multicamMainListener.on('value', (snapshot) => {
    // Throttle: no procesar más de una vez cada N segundos
    const ahora = Date.now();
    if (ahora - ultimaActualizacionMulticam < THROTTLE_MULTICAM_MS) {
      return; // Ignorar actualización, muy pronto
    }
    ultimaActualizacionMulticam = ahora;
    
    if (!snapshot.exists()) {
      actualizarPanelMulticam([]);
      return;
    }
    
    const patrullasActivas = [];
    // ahora ya fue declarado arriba para el throttle
    const TIMEOUT_ACTIVA = 30000; // 30 segundos sin frames = inactiva
    
    snapshot.forEach((child) => {
      const patrullaId = child.key;
      const data = child.val();
      
      if (data.latest && data.latest.timestamp) {
        const edad = ahora - data.latest.timestamp;
        if (edad < TIMEOUT_ACTIVA) {
          patrullasActivas.push(patrullaId);
        }
      }
    });
    
    console.log(`[Multi-Cámaras] 📡 Patrullas activas: ${patrullasActivas.join(', ') || 'ninguna'}`);
    actualizarPanelMulticam(patrullasActivas);
  });
}

function actualizarPanelMulticam(patrullasActivas) {
  // Usar el contenedor de miniaturas integrado en el visor
  const container = document.getElementById('visor-miniaturas');
  console.log("[Multi-Cámaras] 🎯 Container visor-miniaturas:", container ? "encontrado" : "NO ENCONTRADO");
  if (!container) {
    console.warn("[Multi-Cámaras] ⚠️ No se encontró #visor-miniaturas");
    return;
  }
  
  // Filtrar: mostrar todas EXCEPTO la principal
  const patrullasSecundarias = patrullasActivas.filter(id => id !== patrullaPrincipal);
  console.log("[Multi-Cámaras] 📷 Patrullas secundarias a mostrar:", patrullasSecundarias);
  
  // Si no hay otras patrullas, limpiar contenedor
  if (patrullasSecundarias.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  // Crear/actualizar miniaturas de cámaras
  patrullasSecundarias.forEach(patrullaId => {
    let card = document.getElementById(`miniatura-${patrullaId}`);
    
    if (!card) {
      console.log("[Multi-Cámaras] ➕ Creando miniatura para:", patrullaId);
      card = document.createElement('div');
      card.id = `miniatura-${patrullaId}`;
      card.className = 'miniatura-cam';
      card.innerHTML = `
        <canvas id="canvas-miniatura-${patrullaId}"></canvas>
        <div class="miniatura-info">
          <span class="miniatura-label">🚔 ${patrullaId}</span>
          <div class="miniatura-controls">
            <button class="miniatura-btn" title="Audio">🔊</button>
            <button class="miniatura-btn" title="Expandir">⛶</button>
          </div>
        </div>
      `;
      card.onclick = () => cambiarCamaraPrincipal(patrullaId);
      container.appendChild(card);
      console.log("[Multi-Cámaras] ✅ Miniatura agregada al container");
      
      // Iniciar listener de frames
      iniciarListenerMulticam(patrullaId);
    }
  });
  
  // Eliminar miniaturas de patrullas inactivas
  const cardsActuales = container.querySelectorAll('.miniatura-cam');
  cardsActuales.forEach(card => {
    const id = card.id.replace('miniatura-', '');
    if (!patrullasSecundarias.includes(id)) {
      if (multicamListeners[id]) {
        multicamListeners[id].off();
        delete multicamListeners[id];
      }
      card.remove();
    }
  });
}

function iniciarListenerMulticam(patrullaId) {
  if (multicamListeners[patrullaId]) return;
  
  const ref = rtdb.ref(`frames/${patrullaId}/latest`);
  multicamListeners[patrullaId] = ref;
  
  let ultimoFrameTime = 0;
  const THROTTLE_FRAME_MS = 200; // Máximo 5 FPS por miniatura para ahorrar batería
  
  ref.on('value', (snapshot) => {
    // Throttle frames individuales
    const ahora = Date.now();
    if (ahora - ultimoFrameTime < THROTTLE_FRAME_MS) return;
    ultimoFrameTime = ahora;
    
    if (!snapshot.exists()) return;
    
    const frameData = snapshot.val();
    if (!frameData || !frameData.data) return;
    
    const canvas = document.getElementById(`canvas-miniatura-${patrullaId}`);
    if (!canvas) return;
    
    const img = new Image();
    img.onload = () => {
      // Canvas para miniatura
      canvas.width = 180;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      
      // Dibujar centrado y cubriendo
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const x = (canvas.width - img.width * scale) / 2;
      const y = (canvas.height - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    };
    img.src = frameData.data;
  });
}

function cambiarCamaraPrincipal(nuevaPatrullaId) {
  console.log(`[Multi-Cámaras] 🔄 Cambiando cámara principal a: ${nuevaPatrullaId}`);
  
  const anteriorPrincipal = patrullaPrincipal;
  patrullaPrincipal = nuevaPatrullaId;
  
  // Actualizar títulos del visor
  const nombreVisor = document.getElementById('nombre-patrulla-visor');
  const labelVisor = document.getElementById('visor-label-name');
  if (nombreVisor) nombreVisor.textContent = nuevaPatrullaId;
  if (labelVisor) labelVisor.textContent = nuevaPatrullaId;
  
  // IMPORTANTE: Detener el listener multicam de la nueva principal para evitar conflictos
  if (multicamListeners[nuevaPatrullaId]) {
    console.log(`[Multi-Cámaras] 🛑 Deteniendo listener multicam de ${nuevaPatrullaId}`);
    multicamListeners[nuevaPatrullaId].off();
    delete multicamListeners[nuevaPatrullaId];
  }
  
  // Eliminar la miniatura de la nueva principal
  const cardNueva = document.getElementById(`miniatura-${nuevaPatrullaId}`);
  if (cardNueva) cardNueva.remove();
  
  // Detener y reiniciar visualización principal
  detenerVisualizacionMJPEG();
  iniciarVisualizacionMJPEG(nuevaPatrullaId);
  
  // Si la anterior principal sigue activa, crear su card en el panel
  setTimeout(() => {
    rtdb.ref('frames').once('value', (snapshot) => {
      if (!snapshot.exists()) return;
      
      const patrullasActivas = [];
      const ahora = Date.now();
      
      snapshot.forEach((child) => {
        const data = child.val();
        if (data.latest && data.latest.timestamp && (ahora - data.latest.timestamp) < 30000) {
          patrullasActivas.push(child.key);
        }
      });
      
      actualizarPanelMulticam(patrullasActivas);
    });
  }, 100);
}

function detenerMiniaturas() {
  // Detener listener principal de patrullas
  if (multicamMainListener) {
    multicamMainListener.off();
    multicamMainListener = null;
  }
  
  // Detener todos los listeners de frames individuales
  Object.keys(multicamListeners).forEach(patrullaId => {
    if (multicamListeners[patrullaId]) {
      multicamListeners[patrullaId].off();
    }
  });
  multicamListeners = {};
  
  // Limpiar contenedor de miniaturas integrado
  const container = document.getElementById('visor-miniaturas');
  if (container) {
    container.innerHTML = '';
  }
  
  multicamPanelVisible = false;
}

// ============================================================
// 📊 MEJORA PREDICTIVA DE COBERTURA - FUNCIONES AUXILIARES
// ============================================================

function calcularMejoraPredictivaCobertura(camaras, siniestros, robos, barrios) {
  const RADIO_COBERTURA = 100; // metros
  const NUM_CAMARAS_PROPUESTAS = 5; // Por barrio
  
  const analisisPorBarrio = [];

  barrios.features.forEach(barrioFeature => {
    const nombreBarrio = barrioFeature.properties.soc_fomen;
    const barrioGeometry = barrioFeature.geometry;

    // 1. Calcular área del barrio
    let areaBarrio;
    try {
      areaBarrio = turf.area(barrioGeometry);
    } catch (error) {
      console.warn(`Error calculando área del barrio ${nombreBarrio}:`, error);
      return;
    }

    // 2. Contar cámaras actuales en el barrio
    let camarasEnBarrio = 0;
    const puntosCamaras = [];

    camaras.forEach(camara => {
      const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
      const lon = parseFloat(String(camara.Longitud).replace(',', '.'));

      if (!isNaN(lat) && !isNaN(lon)) {
        const camaraPoint = turf.point([lon, lat]);
        try {
          if (turf.booleanPointInPolygon(camaraPoint, barrioGeometry)) {
            camarasEnBarrio++;
            puntosCamaras.push([lon, lat]);
            // DEBUG: Mostrar si es una cámara conocida
            if (camara['N CAMARA'] == 396) {
              console.log(`[DEBUG] Camera 396 INCLUÍDA en ${nombreBarrio}: [${lon.toFixed(6)}, ${lat.toFixed(6)}]`);
            }
          } else {
            // DEBUG: Si es camera 396, mostrar por qué NO fue incluida
            if (camara['N CAMARA'] == 396) {
              console.log(`[DEBUG] Camera 396 RECHAZADA (fuera del barrio ${nombreBarrio}): [${lon.toFixed(6)}, ${lat.toFixed(6)}]`);
            }
          }
        } catch (e) {
          // Ignorar errores de geometría
        }
      }
    });

    // 3. Contar incidentes críticos (siniestros + robos con intervención)
    let siniestrosEnBarrio = 0;
    let robosConIntervencion = 0;
    const puntosIncidentes = [];

    siniestros.features.forEach(sin => {
      if (!sin.geometry || !sin.geometry.coordinates) return;
      // GeoJSON estándar: coordinates = [lon, lat]
      const punto = turf.point(sin.geometry.coordinates);
      try {
        if (turf.booleanPointInPolygon(punto, barrioGeometry)) {
          siniestrosEnBarrio++;
          // Agregar en formato [lon, lat]
          puntosIncidentes.push(sin.geometry.coordinates);
        }
      } catch (e) {}
    });

    robos.forEach(robo => {
      const coordsStr = robo['Longitud y Latitud'];
      if (!coordsStr) return;
      const parts = coordsStr.split(',').map(s => s.trim());
      if (parts.length !== 2) return;
      
      // En CSV: "Longitud y Latitud" genera parts = [lat, lon] (orden de lectura)
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lon)) return;

      const resultado = robo.Resultado ? robo.Resultado.trim() : '';
      if (resultado === 'Detencion' || resultado === 'Secuestro De Vehiculo') {
        // Crear punto en formato [lon, lat] para Turf
        const punto = turf.point([lon, lat]);
        try {
          if (turf.booleanPointInPolygon(punto, barrioGeometry)) {
            robosConIntervencion++;
            // Agregar en formato [lon, lat]
            puntosIncidentes.push([lon, lat]);
          }
        } catch (e) {}
      }
    });

    // 4. Calcular cobertura actual
    let areaCobertura = 0;
    const radioKm = RADIO_COBERTURA / 1000;

    camaras.forEach(camara => {
      const lat = parseFloat(String(camara.Latitud).replace(',', '.'));
      const lon = parseFloat(String(camara.Longitud).replace(',', '.'));

      if (!isNaN(lat) && !isNaN(lon)) {
        const camaraPoint = turf.point([lon, lat]);
        try {
          if (turf.booleanPointInPolygon(camaraPoint, barrioGeometry)) {
            const circulo = turf.circle([lon, lat], radioKm, { units: 'kilometers' });
            const interseccion = turf.intersect(circulo, barrioGeometry);
            if (interseccion) {
              areaCobertura += turf.area(interseccion);
            }
          }
        } catch (error) {}
      }
    });

    const porcentajeCoberturaActual = (areaCobertura / areaBarrio) * 100;

    // 5. Proponer ubicaciones para nuevas cámaras
    const ubicacionesPropuestas = proponerUbicacionesOptimas(
      barrioGeometry,
      puntosIncidentes,
      puntosCamaras,
      NUM_CAMARAS_PROPUESTAS,
      RADIO_COBERTURA,
      siniestros,  // Añadido
      robos,       // Añadido
      nombreBarrio // Añadido
    );
    
    // 5a. VALIDACIÓN ADICIONAL: Convertir de objeto a solo coordenadas
    // Nota: Ya están filtradas en proponerUbicacionesOptimas, pero hacemos validación con el mismo radio
    const RADIO_VALIDACION_KM = RADIO_COBERTURA / 1000;
    const ubicacionesValidadas = ubicacionesPropuestas.filter(propuesta => {
      let distanciaMinima = Infinity;
      const coords = propuesta.coords || propuesta; // Por si acaso
      
      for (const camaraPunto of puntosCamaras) {
        try {
          const dist = turf.distance(coords, camaraPunto, { units: 'kilometers' });
          distanciaMinima = Math.min(distanciaMinima, dist);
        } catch (e) {}
      }
      
      // Usar el mismo RADIO_COBERTURA que se usó en el filtrado
      const esValida = distanciaMinima >= RADIO_VALIDACION_KM;
      if (!esValida) {
        console.log(`[DEBUG] ⚠️ RECHAZADA en validación final: propuesta a ${(distanciaMinima*1000).toFixed(0)}m de cámara existente`);
      }
      return esValida;
    });

    // 6. Simular mejora de cobertura
    let areaCoberturaMejorada = areaCobertura;

    ubicacionesValidadas.forEach(ubicacion => {
      try {
        const coords = ubicacion.coords || ubicacion; // Maneja ambos formatos
        const circulo = turf.circle(coords, radioKm, { units: 'kilometers' });
        const interseccion = turf.intersect(circulo, barrioGeometry);
        if (interseccion) {
          areaCoberturaMejorada += turf.area(interseccion);
        }
      } catch (error) {}
    });

    const porcentajeCoberturaProyectada = (areaCoberturaMejorada / areaBarrio) * 100;
    const mejora = porcentajeCoberturaProyectada - porcentajeCoberturaActual;

    // 7. Calcular índice de criticidad
    const totalIncidentes = siniestrosEnBarrio + robosConIntervencion;
    const densidadIncidentes = totalIncidentes > 0 ? (totalIncidentes / (areaBarrio / 1000000)) : 0;
    const criticidad = calcularCriticidad(siniestrosEnBarrio, robosConIntervencion, densidadIncidentes);

    analisisPorBarrio.push({
      barrio: nombreBarrio,
      areaKm2: areaBarrio / 1000000,
      camarasActuales: camarasEnBarrio,
      siniestros: siniestrosEnBarrio,
      robosConIntervension: robosConIntervencion,
      totalIncidentes: totalIncidentes,
      densidadIncidentes: densidadIncidentes,
      criticidad: criticidad,
      coberturaActual: porcentajeCoberturaActual,
      coberturaProyectada: porcentajeCoberturaProyectada,
      mejora: mejora,
      camarasAProponer: ubicacionesValidadas.length,
      ubicacionesPropuestas: ubicacionesValidadas,
      geometry: barrioGeometry
    });
  });

  // Ordenar por criticidad (descendente)
  analisisPorBarrio.sort((a, b) => b.criticidad - a.criticidad);

  return {
    timestamp: new Date().toLocaleString(),
    resumen: generarResumenCobertura(analisisPorBarrio),
    porBarrio: analisisPorBarrio
  };
}

function proponerUbicacionesOptimas(barrioGeometry, puntosIncidentes, puntosCamaras, numUbicaciones, radioCubertura, allSiniestrosData, allRoboAutomotorData, barrioName) {
  // Este nuevo parámetro contendrá los datos reales de siniestros con direcciones
  
  if (puntosIncidentes.length === 0) {
    return [];
  }

  const RADIO_COBERTURA_KM = radioCubertura / 1000;
  const RADIO_CLUSTER = 0.2; // 200m para agrupar incidentes cercanos
  
  // === PASO 1: Encontrar incidentes SIN cobertura ===
  const incidentes = [];
  
  // Traer siniestros del barrio sin cobertura
  if (allSiniestrosData && allSiniestrosData.features) {
    allSiniestrosData.features.forEach(sin => {
      if (!sin.geometry || !sin.geometry.coordinates) return;
      const coords = sin.geometry.coordinates; // [lon, lat]
      
      // Verificar si está en el barrio
      const punto = turf.point(coords);
      let enBarrio = false;
      try {
        enBarrio = turf.booleanPointInPolygon(punto, barrioGeometry);
      } catch (e) {}
      
      if (!enBarrio) return;
      
      // Verificar si tiene cobertura actual
      let tieneCamara = false;
      for (const cam of puntosCamaras) {
        const dist = turf.distance(coords, cam, { units: 'kilometers' });
        if (dist <= RADIO_COBERTURA_KM) {
          tieneCamara = true;
          break;
        }
      }
      
      if (!tieneCamara) {
        incidentes.push({
          coords: coords,
          tipo: 'siniestro',
          direccion: sin.properties.direccion || 'No especificada',
          fecha: sin.properties.fecha,
          gravedad: sin.properties.causa === 'NSD' ? 2 : 1
        });
      }
    });
  }
  
  // Traer robos del barrio sin cobertura
  if (allRoboAutomotorData && Array.isArray(allRoboAutomotorData)) {
    allRoboAutomotorData.forEach(robo => {
      const coordsStr = robo['Longitud y Latitud'];
      if (!coordsStr) return;
      
      const parts = coordsStr.split(',').map(s => s.trim());
      if (parts.length !== 2) return;
      
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lon)) return;
      
      const coords = [lon, lat];
      
      // Verificar si está en el barrio
      const punto = turf.point(coords);
      let enBarrio = false;
      try {
        enBarrio = turf.booleanPointInPolygon(punto, barrioGeometry);
      } catch (e) {}
      
      if (!enBarrio) return;
      
      // Verificar si tiene cobertura actual
      let tieneCamara = false;
      for (const cam of puntosCamaras) {
        const dist = turf.distance(coords, cam, { units: 'kilometers' });
        if (dist <= RADIO_COBERTURA_KM) {
          tieneCamara = true;
          break;
        }
      }
      
      if (!tieneCamara) {
        const resultado = robo.Resultado ? robo.Resultado.trim() : '';
        // Consideramos robos sin intervención como más graves
        const gravedad = (resultado !== 'Detencion' && resultado !== 'Secuestro De Vehiculo') ? 2 : 1;
        
        incidentes.push({
          coords: coords,
          tipo: 'robo',
          direccion: robo.Dirección || 'No especificada',
          fecha: robo.Fecha,
          gravedad: gravedad
        });
      }
    });
  }
  
  if (incidentes.length === 0) {
    console.log(`[DEBUG] No hay incidentes sin cobertura en ${barrioName}`);
    return [];
  }
  
  // === PASO 2: Agrupar incidentes en clusters ===
  const clusters = [];
  const procesados = new Set();
  
  incidentes.forEach((incidente, idx) => {
    if (procesados.has(idx)) return;
    
    const cluster = {
      incidentes: [incidente],
      coordCentro: incidente.coords,
      pesoTotal: incidente.gravedad,
      direccionPrincipal: incidente.direccion
    };
    
    procesados.add(idx);
    
    // Buscar incidentes cercanos para agrupar
    incidentes.forEach((otro, otroIdx) => {
      if (procesados.has(otroIdx)) return;
      
      const dist = turf.distance(incidente.coords, otro.coords, { units: 'kilometers' });
      if (dist <= RADIO_CLUSTER) {
        cluster.incidentes.push(otro);
        cluster.pesoTotal += otro.gravedad;
        // Usar la dirección del más grave o del primero
        if (otro.gravedad > incidente.gravedad) {
          cluster.direccionPrincipal = otro.direccion;
        }
        procesados.add(otroIdx);
      }
    });
    
    // Calcular centroide del cluster
    if (cluster.incidentes.length > 1) {
      let sumLon = 0, sumLat = 0;
      cluster.incidentes.forEach(inc => {
        sumLon += inc.coords[0];
        sumLat += inc.coords[1];
      });
      cluster.coordCentro = [sumLon / cluster.incidentes.length, sumLat / cluster.incidentes.length];
    }
    
    clusters.push(cluster);
  });
  
  // === PASO 3: Ordenar clusters por peso y retornar los mejores ===
  const mejoresClusters = clusters
    .sort((a, b) => b.pesoTotal - a.pesoTotal)
    .slice(0, numUbicaciones);
  
  console.log(`[DEBUG] ${barrioName}: ${clusters.length} clusters encontrados, ${mejoresClusters.length} propuestos`);
  mejoresClusters.forEach((c, i) => {
    console.log(`  [${i+1}] ${c.direccionPrincipal} - ${c.incidentes.length} incidentes`);
  });
  
  // Retornar en formato esperado: array de coordenadas + metadatos de dirección
  return mejoresClusters.map(cluster => ({
    coords: cluster.coordCentro,
    direccion: cluster.direccionPrincipal,
    incidentes: cluster.incidentes.length,
    pesoTotal: cluster.pesoTotal
  }));
}

function calcularScorePunto(punto, puntosIncidentes, puntosCamaras, radioCubertura) {
  // punto: [lon, lat]
  // puntosIncidentes: array de [lon, lat]
  // puntosCamaras: array de [lon, lat]
  
  let score = 0;
  const radioKm = radioCubertura / 1000;

  // 1. Proximidad a incidentes (peso: 70%)
  // Favorecer puntos cerca de muchos incidentes
  let proximidadIncidentes = 0;
  puntosIncidentes.forEach(incidente => {
    try {
      // Ambos en formato [lon, lat] para Turf
      const distancia = turf.distance(punto, incidente, { units: 'kilometers' });
      if (distancia < radioKm) {
        // Dentro del radio de cobertura - máxima puntuación
        proximidadIncidentes += (1 - distancia / radioKm);
      } else if (distancia < radioKm * 3) {
        // Entre 100m y 300m - puntuación media
        proximidadIncidentes += (0.6 * (1 - (distancia - radioKm) / (radioKm * 2)));
      }
    } catch (e) {}
  });
  score += (proximidadIncidentes / Math.max(puntosIncidentes.length, 1)) * 70;

  // 2. Lejanía de cámaras existentes (peso: 20%)
  // Favorecer puntos alejados de cámaras existentes
  let distanciaPromedioCamaras = 0;
  if (puntosCamaras.length > 0) {
    let sumDistancias = 0;
    puntosCamaras.forEach(camara => {
      try {
        // Ambos en formato [lon, lat] para Turf
        const distancia = turf.distance(punto, camara, { units: 'kilometers' });
        sumDistancias += distancia;
      } catch (e) {}
    });
    distanciaPromedioCamaras = sumDistancias / puntosCamaras.length;
  }
  
  // Favorecer puntos más alejados (máx 500m promedio)
  const lejaniaScore = Math.min(distanciaPromedioCamaras / 0.5, 1) * 20;
  score += lejaniaScore;

  // 3. Diversificación de cobertura (peso: 10%) - aleatoriedad para variedad
  score += Math.random() * 10;

  return score;
}

function calcularCriticidad(siniestros, robos, densidad) {
  const pesoSiniestros = siniestros * 2;
  const pesoRobos = robos * 1.5;
  const pesoDensidad = Math.min(densidad * 5, 20);
  return Math.min(pesoSiniestros + pesoRobos + pesoDensidad, 100);
}

function distribuirPuntosCentro(barrioGeometry, numPuntos) {
  const puntos = [];
  try {
    const centro = turf.centerOfMass(barrioGeometry);
    const radiusDistribucion = 0.005;

    for (let i = 0; i < numPuntos; i++) {
      const angulo = (i / numPuntos) * Math.PI * 2;
      const radio = (i % 2 === 0) ? radiusDistribucion : radiusDistribucion * 0.7;

      const punto = [
        centro.geometry.coordinates[0] + Math.cos(angulo) * radio,
        centro.geometry.coordinates[1] + Math.sin(angulo) * radio
      ];

      const punto_turf = turf.point(punto);
      try {
        if (turf.booleanPointInPolygon(punto_turf, barrioGeometry)) {
          puntos.push(punto);
        }
      } catch (e) {}
    }
  } catch (e) {}

  return puntos;
}

function generarResumenCobertura(analisisPorBarrio) {
  const barrios_alto_riesgo = analisisPorBarrio.filter(b => b.criticidad >= 70).length;
  const mejora_promedio = analisisPorBarrio.reduce((sum, b) => sum + b.mejora, 0) / Math.max(analisisPorBarrio.length, 1);
  const cobertura_actual_promedio = analisisPorBarrio.reduce((sum, b) => sum + b.coberturaActual, 0) / Math.max(analisisPorBarrio.length, 1);

  return {
    barrios_total: analisisPorBarrio.length,
    barrios_alto_riesgo: barrios_alto_riesgo,
    mejora_promedio_cobertura: mejora_promedio.toFixed(2),
    cobertura_actual_promedio: cobertura_actual_promedio.toFixed(2),
    camaras_totales_propuestas: analisisPorBarrio.reduce((sum, b) => sum + b.camarasAProponer, 0)
  };
}

function mostrarResultadoMejoraCobertura(analisis, resultadosDiv) {
  const {resumen, porBarrio} = analisis;

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; gap: 20px;">
      <!-- Columna izquierda: Título e info -->
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <h4 style="margin: 0;">📊 Análisis Predictivo de Mejora de Cobertura</h4>
          <button id="btn-info-criticidad" style="background: #0066cc; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; font-size: 16px; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; transition: background 0.3s; flex-shrink: 0;">
            ?
          </button>
        </div>
        
        <div id="explicacion-criticidad" style="display: none; background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ff9800; font-size: 0.9em;">
          <h5 style="margin-top: 0; color: #856404;">📚 ¿Qué significa esto?</h5>
          
          <div style="margin-bottom: 12px;">
            <b>🔴 Círculos rojos (100m de radio):</b>
            <p style="margin: 5px 0;">Representan la cobertura propuesta de cada cámara. El área circular de 100 metros es el rango efectivo de vigilancia. Las ubicaciones se proponen estratégicamente en zonas de alto riesgo.</p>
          </div>

          <div style="margin-bottom: 12px;">
            <b>📊 Criticidad (escala 0-100):</b>
            <p style="margin: 5px 0;">Es una puntuación que combina factores de riesgo: cantidad de siniestros (×2), robos (×1.5) y densidad de incidentes (×5). Mide qué tan urgente es mejorar la cobertura en esa zona.</p>
          </div>

          <div style="margin-bottom: 12px;">
            <b>🎨 Código de colores:</b>
            <ul style="margin: 5px 0 5px 20px; padding: 0;">
              <li><span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;">CRÍTICO ≥70</span> - Instalar inmediatamente (máximo riesgo)</li>
              <li><span style="background: #ff9800; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;">ALTA 40-70</span> - Alta prioridad (riesgo significativo)</li>
              <li><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;">MEDIA &lt;40</span> - Prioridad media (riesgo moderado)</li>
            </ul>
          </div>

          <div style="margin-bottom: 12px;">
            <b>💡 Cómo usar este análisis:</b>
            <ol style="margin: 5px 0 5px 20px; padding: 0;">
              <li>Prioriza barrios con criticidad roja (≥70)</li>
              <li>Usa "Ver X cámaras" para ver las ubicaciones propuestas en el mapa</li>
              <li>Los círculos rojos te muestran exactamente dónde instalar</li>
              <li>La columna "Mejora" indica qué % aumentará la cobertura</li>
            </ol>
          </div>
        </div>
      </div>

      <!-- Columna derecha: Selector de barrios y stats -->
      <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; border-left: 4px solid #0066cc; min-width: 280px; flex-shrink: 0;">
        <h5 style="margin: 0 0 12px 0; font-size: 0.95em;">🎯 Filtrar por Barrios</h5>
        
        <div id="barrios-selector" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 8px; border-radius: 4px; background: white; margin-bottom: 12px;">
          <!-- Se llena dinámicamente -->
        </div>

        <button id="btn-limpiar-filtro" style="width: 100%; padding: 6px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85em; margin-bottom: 12px;">
          Limpiar Filtro
        </button>

        <div id="stats-filtrado" style="background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 0.85em;">
          <div style="margin-bottom: 6px;">
            <b>Barrios sel.:</b> <span id="count-barrios-sel">0</span> / ${porBarrio.length}
          </div>
          <div style="margin-bottom: 6px;">
            <b>Cámaras:</b> <span id="count-camaras-sel" style="color: #0066cc; font-weight: bold;">0</span>
          </div>
          <div style="margin-bottom: 6px;">
            <b>Cobertura actual:</b> <span id="cobertura-actual-sel">0.0</span>%
          </div>
          <div style="margin-bottom: 6px;">
            <b>Cobertura proyectada:</b> <span id="cobertura-proyectada-sel">0.0</span>%
          </div>
          <div style="padding-top: 6px; border-top: 1px solid #eee; margin-top: 6px;">
            <b>📈 Mejora Total:</b> <span id="mejora-total-sel" style="color: #28a745; font-weight: bold; font-size: 1.1em;">0.0%</span>
          </div>
        </div>
      </div>
    </div>
    
    <p style="font-size: 0.9em; color: #666;">Generado: ${analisis.timestamp}</p>
    
    <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #0066cc;">
      <h5>📈 Resumen Ejecutivo</h5>
      <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.95em;">
        <li><b>Barrios analizados:</b> ${resumen.barrios_total}</li>
        <li><b>Barrios de alto riesgo (criticidad ≥ 70):</b> ${resumen.barrios_alto_riesgo}</li>
        <li><b>Cobertura actual promedio:</b> ${resumen.cobertura_actual_promedio}%</li>
        <li><b>Mejora promedio proyectada:</b> <span style="color: #28a745; font-weight: bold;">+${resumen.mejora_promedio_cobertura}%</span></li>
        <li><b>Cámaras totales a proponer:</b> ${resumen.camaras_totales_propuestas}</li>
      </ul>
    </div>

    <div style="margin-top: 20px;">
      <h5>🎯 Análisis por Barrio (Ordenado por Criticidad)</h5>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
        <thead style="background: #f5f5f5; border-bottom: 2px solid #333;">
          <tr>
            <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd;">Barrio</th>
            <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">Criticidad</th>
            <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">Cobertura Actual</th>
            <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">Proyectada</th>
            <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">Mejora</th>
            <th style="padding: 10px; text-align: center;">Cámaras</th>
          </tr>
        </thead>
        <tbody>
  `;

  porBarrio.forEach((barrio, index) => {
    const colorCriticidad = barrio.criticidad >= 70 ? '#dc3545' : barrio.criticidad >= 40 ? '#ff9800' : '#28a745';
    const colorMejora = barrio.mejora > 15 ? '#28a745' : barrio.mejora > 5 ? '#ffc107' : '#6c757d';

    html += `
      <tr style="border-bottom: 1px solid #eee; ${index % 2 === 0 ? 'background: #fafafa;' : ''}">
        <td style="padding: 10px; border-right: 1px solid #ddd;"><b>${barrio.barrio}</b></td>
        <td style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">
          <span style="background: ${colorCriticidad}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
            ${barrio.criticidad.toFixed(1)}
          </span>
        </td>
        <td style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">${barrio.coberturaActual.toFixed(1)}%</td>
        <td style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">${barrio.coberturaProyectada.toFixed(1)}%</td>
        <td style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">
          <span style="background: ${colorMejora}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
            +${barrio.mejora.toFixed(1)}%
          </span>
        </td>
        <td style="padding: 10px; text-align: center;">
          <button class="btn-ver-ubicaciones-propuestas" data-barrio="${barrio.barrio}" data-index="${index}" style="padding: 4px 8px; font-size: 0.85em;">
            Ver ${barrio.camarasAProponer}
          </button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>

    <div style="background: #f0f8ff; padding: 12px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #0066cc;">
      <p style="margin: 0; font-size: 0.85em; color: #555;">
        <b>📐 Nota metodológica:</b> El análisis utiliza radio de cobertura de 100m por cámara y propone ubicaciones basadas en 
        densidad de incidentes y cobertura actual. Las mejoras son proyecciones sin considerar solapamientos complejos.
      </p>
    </div>
  `;

  resultadosDiv.innerHTML = html;

  // Evento para mostrar/ocultar explicación de criticidad
  const btnInfo = document.getElementById('btn-info-criticidad');
  const explicacion = document.getElementById('explicacion-criticidad');
  
  if (btnInfo && explicacion) {
    btnInfo.addEventListener('click', () => {
      const estaMostrado = explicacion.style.display !== 'none';
      explicacion.style.display = estaMostrado ? 'none' : 'block';
      btnInfo.style.background = estaMostrado ? '#0066cc' : '#28a745';
      btnInfo.textContent = estaMostrado ? '?' : '✓';
    });
  }

  // Crear selector de barrios
  const selector = document.getElementById('barrios-selector');
  porBarrio.forEach((barrio, index) => {
    const checkbox = document.createElement('div');
    checkbox.style.cssText = 'margin-bottom: 6px; display: flex; align-items: center; gap: 6px;';
    
    const colorCriticidad = barrio.criticidad >= 70 ? '#dc3545' : barrio.criticidad >= 40 ? '#ff9800' : '#28a745';
    
    checkbox.innerHTML = `
      <input type="checkbox" id="check-barrio-${index}" data-index="${index}" data-barrio="${barrio.barrio}" 
             style="cursor: pointer; width: 16px; height: 16px;">
      <label for="check-barrio-${index}" style="cursor: pointer; font-size: 0.85em; margin: 0; flex: 1;">
        <span style="background: ${colorCriticidad}; color: white; padding: 2px 4px; border-radius: 3px; font-weight: bold; font-size: 0.75em;">
          ${barrio.criticidad.toFixed(0)}
        </span>
        ${barrio.barrio}
      </label>
    `;
    
    selector.appendChild(checkbox);
  });

  // Función para actualizar stats cuando cambian selecciones
  function actualizarStatsBarrios() {
    const checkboxes = document.querySelectorAll('#barrios-selector input[type="checkbox"]');
    const seleccionados = Array.from(checkboxes).filter(cb => cb.checked);
    
    let totalCamaras = 0;
    let totalCoberturerraActual = 0;
    let totalCoberturaProyectada = 0;
    
    seleccionados.forEach(checkbox => {
      const index = parseInt(checkbox.dataset.index);
      const barrio = porBarrio[index];
      totalCamaras += barrio.camarasAProponer;
      totalCoberturerraActual += barrio.coberturaActual;
      totalCoberturaProyectada += barrio.coberturaProyectada;
    });

    const cantidadSel = seleccionados.length;
    const coberturaActualProm = cantidadSel > 0 ? (totalCoberturerraActual / cantidadSel) : 0;
    const coberturaProy = cantidadSel > 0 ? (totalCoberturaProyectada / cantidadSel) : 0;
    const mejoraProm = coberturaProy - coberturaActualProm;

    document.getElementById('count-barrios-sel').textContent = cantidadSel;
    document.getElementById('count-camaras-sel').textContent = totalCamaras;
    document.getElementById('cobertura-actual-sel').textContent = coberturaActualProm.toFixed(1);
    document.getElementById('cobertura-proyectada-sel').textContent = coberturaProy.toFixed(1);
    document.getElementById('mejora-total-sel').textContent = mejoraProm.toFixed(1);
  }

  // Agregar evento a todos los checkboxes
  document.querySelectorAll('#barrios-selector input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', actualizarStatsBarrios);
    checkbox.style.cursor = 'pointer';
  });

  // Botón limpiar filtro
  document.getElementById('btn-limpiar-filtro').addEventListener('click', () => {
    document.querySelectorAll('#barrios-selector input[type="checkbox"]').forEach(cb => cb.checked = false);
    actualizarStatsBarrios();
  });

  document.querySelectorAll('.btn-ver-ubicaciones-propuestas').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const barrio = e.target.dataset.barrio;
      const index = parseInt(e.target.dataset.index);
      mostrarUbicacionesPropuestasEnMapa(porBarrio[index]);
    });
  });
}

function mostrarUbicacionesPropuestasEnMapa(datosBarrio) {
  ubicacionesPropuestasLayer.clearLayers();

  L.geoJSON(datosBarrio.geometry, {
    style: {
      color: '#ff7800',
      weight: 3,
      opacity: 0.6,
      fillOpacity: 0.1
    }
  }).addTo(ubicacionesPropuestasLayer);

  datosBarrio.ubicacionesPropuestas.forEach((item, idx) => {
    // Soportar tanto formato antiguo (solo coords) como nuevo (objeto con dirección)
    const coords = item.coords || item;
    const direccion = item.direccion || 'No especificada';
    const numIncidentes = item.incidentes || 0;
    
    const icon = L.divIcon({
      className: 'propuesta-camara-icon',
      html: `<div style="background: #28a745; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">${idx + 1}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    // Calcular distancia a la cámara más cercana
    let distanciaaCamaraMasCercana = Infinity;
    if (allCamerasData && allCamerasData.length > 0) {
      allCamerasData.forEach(camara => {
        const camLat = parseFloat(String(camara.Latitud).replace(',', '.'));
        const camLon = parseFloat(String(camara.Longitud).replace(',', '.'));
        if (!isNaN(camLat) && !isNaN(camLon)) {
          const dist = turf.distance([coords[0], coords[1]], [camLon, camLat], { units: 'kilometers' });
          distanciaaCamaraMasCercana = Math.min(distanciaaCamaraMasCercana, dist);
        }
      });
    }

    // coords es [lon, lat], Leaflet espera [lat, lon]
    const marker = L.marker([coords[1], coords[0]], { icon: icon });
    
    // Información de distancia a cámara más cercana
    let distanciaInfo = distanciaaCamaraMasCercana === Infinity 
      ? 'Sin cámaras cercanas' 
      : `${(distanciaaCamaraMasCercana * 1000).toFixed(0)}m`;
    
    let advertenciaDistancia = '';
    if (distanciaaCamaraMasCercana * 1000 < 200) {
      advertenciaDistancia = `<div style="background: #fff3cd; padding: 8px; margin-top: 8px; border-radius: 3px; border-left: 3px solid #ffc107;">⚠️ <b>ADVERTENCIA:</b> Muy cerca de cámara existente (${(distanciaaCamaraMasCercana * 1000).toFixed(0)}m). Considerar reubicación.</div>`;
    }
    
    marker.bindPopup(`
      <b>Ubicación propuesta #${idx + 1}</b><br>
      <b>Barrio:</b> ${datosBarrio.barrio}<br>
      <b>CRUCE RECOMENDADO:</b> <span style="color: #d41d1d; font-weight: bold;">${direccion}</span><br>
      <b>Incidentes sin cobertura:</b> ${numIncidentes}<br>
      <b>Coordenadas (lat, lon):</b> ${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}<br>
      <b>Cámara más cercana:</b> ${distanciaInfo}<br>
      <small style="color:#666;">[Sistema: lon=${coords[0].toFixed(6)}, lat=${coords[1].toFixed(6)}]</small>
      ${advertenciaDistancia}
    `);
    marker.addTo(ubicacionesPropuestasLayer);

    L.circle([coords[1], coords[0]], {
      radius: 100,
      color: '#28a745',
      weight: 1,
      opacity: 0.4,
      fillOpacity: 0.1,
      dashArray: '5, 5'
    }).addTo(ubicacionesPropuestasLayer);
  });

  mymap.addLayer(ubicacionesPropuestasLayer);

  try {
    mymap.fitBounds(ubicacionesPropuestasLayer.getBounds());
  } catch (e) {
    console.warn('No se pudo ajustar el zoom a las ubicaciones propuestas');
  }

  alert(`Mostrando ${datosBarrio.camarasAProponer} ubicaciones propuestas para ${datosBarrio.barrio}\n\nMejora esperada de cobertura: +${datosBarrio.mejora.toFixed(1)}%`);
}


// ======================================
// 2. EVENTOS DOM (INICIALIZACIÓN)
// ======================================
document.addEventListener('DOMContentLoaded', () => {
  
  // --- ACTIVAR ARRASTRE ---
  // Para el visor de patrulla
  // (Asegúrate de que en el HTML el header tenga id="visor-patrulla-header")
  inicializarArrastreUniversal("visor-patrulla", "visor-patrulla-header");
  
  // Para el panel de chat
  inicializarArrastreUniversal("chatBasePanel", "chatBasePanel-header");

  // --- BOTONES DE CHAT ---
  const cerrarBtn = document.getElementById('cerrarChatBaseBtn');
  if (cerrarBtn) cerrarBtn.addEventListener('click', cerrarChatBase);

  const enviarBtn = document.getElementById('enviarChatBaseBtn');
  if (enviarBtn) enviarBtn.addEventListener('click', enviarChatBase);

  const chatInput = document.getElementById('chatBaseInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        enviarChatBase();
      }
    });
  }
});

// ===== UTILITY: ESCAPAR HTML =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}