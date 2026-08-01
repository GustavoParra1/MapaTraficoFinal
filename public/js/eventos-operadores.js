// ===== SISTEMA DE EVENTOS PARA OPERADORES =====

console.log('📂 Script eventos-operadores.js cargado correctamente');

let eventSystem = {
  initialized: false,
  eventsData: {},
  eventSaveTimers: {},
  currentLayerFilter: 'all'  // ← NUEVO: Almacenar filtro seleccionado
};

// Inicializar sistema de eventos
function initEventSystem() {
  // ⚠️ EVITAR INICIALIZACIÓN MÚLTIPLE
  if (eventSystem.initialized) {
    console.log('ℹ️ Sistema de eventos YA inicializado, ignorando segunda llamada');
    return;
  }

  console.log('🎯 initEventSystem() llamado');
  console.log('   - currentUser:', window.currentUser ? window.currentUser.email : 'NO');
  console.log('   - USER_LAYER:', window.USER_LAYER || 'NO');
  console.log('   - USER_IS_ADMIN:', window.USER_IS_ADMIN || false);
  
  // Verificar que existan elementos y usuario
  if (!window.currentUser) {
    console.warn('⚠️ Usuario no autenticado aún');
    setTimeout(initEventSystem, 500);
    return;
  }
  
  if (!window.USER_LAYER && !window.USER_IS_ADMIN) {
    console.warn('⚠️ Usuario no tiene capa asignada y no es admin');
    return;
  }
  
  const container = document.getElementById('events-container');
  
  console.log('   - events-container encontrado:', !!container);
  console.log('   - Nota: El modal de crear eventos solo existe para operadores');
  
  if (!container) {
    console.warn('⚠️ Panel de eventos (events-container) no encontrado en HTML');
    return;
  }
  
  // Mostrar para Capa Norte, Sur y Admin
  if (window.USER_LAYER === 'norte' || window.USER_LAYER === 'sur' || window.USER_IS_ADMIN) {
    console.log('✅ Sistema de eventos inicializado...');
    // NOTA: El panel permanece CERRADO por defecto. El usuario lo abre si lo necesita
    // container.style.display = 'block';  // ← COMENTADO: Panel cerrado al inicio
    setupEventListeners();
    loadEventosFromFirestore();
    listenToEventChanges();
    eventSystem.initialized = true;
    console.log('✅ Sistema de eventos inicializado correctamente');
  } else {
    console.log('ℹ️ Usuario no es operador de capa norte/sur ni admin, panel no mostrado');
  }
}

function setupEventListeners() {
  console.log('🔧 [setupEventListeners] INICIANDO - Esta funciónes está siendo ejecutada');
  // ===== BOTONES DE TOGGLE/CLOSE DEL PANEL DE EVENTOS =====
  const toggleBtn = document.getElementById('toggle-events-panel-btn');
  const closeBtn = document.getElementById('close-events-panel-btn');
  const eventsContainer = document.getElementById('events-container');
  
  console.log('🔧 setupEventListeners() - Verificando condiciones:');
  console.log('   - window.USER_IS_ADMIN:', window.USER_IS_ADMIN);
  console.log('   - toggleBtn existe:', !!toggleBtn);
  
  // Mostrar botón flotante solo para admin
  if (window.USER_IS_ADMIN && toggleBtn) {
    toggleBtn.style.display = 'block';
    console.log('✅ Botón flotante de eventos mostrado para admin');
  } else {
    console.log('⚠️ Botón NO mostrado. Admin:', window.USER_IS_ADMIN, 'Toggle existe:', !!toggleBtn);
  }
  
  // Abrir panel al hacer clic en botón flotante
  if (toggleBtn && !toggleBtn.hasListener) {
    console.log('🔧 [setupEventListeners] Agregando listener al botón flotante...');
    toggleBtn.addEventListener('click', () => {
      console.log('🔧 [toggleBtn CLICK] Usuario hizo click en el botón azul');
      console.log('   - eventsContainer existe:', !!eventsContainer);
      if (eventsContainer) {
        console.log('   - Mostrando panel (set display = block)');
        eventsContainer.style.display = 'block';
        console.log('✅ Panel de eventos abierto - style.display es ahora:', eventsContainer.style.display);
      } else {
        console.log('   - ❌ eventsContainer NO EXISTE - panel no puede abrirse');
      }
    });
    toggleBtn.hasListener = true;
    console.log('🔧 [setupEventListeners] ✅ Listener agregado al botón flotante');
  } else {
    if (toggleBtn) {
      console.log('🔧 [setupEventListeners] ⚠️ Listener ya existe en botón');
    } else {
      console.log('🔧 [setupEventListeners] ❌ Botón flotante NO ENCONTRADO en DOM');
    }
  }
  
  // Cerrar panel al hacer clic en botón X
  if (closeBtn && !closeBtn.hasListener) {
    closeBtn.addEventListener('click', () => {
      if (eventsContainer) {
        eventsContainer.style.display = 'none';
        console.log('✅ Panel de eventos cerrado');
      }
    });
    closeBtn.hasListener = true;
  }
  
  // ===== FILTRO POR CAPA - Handler global =====
  // Se define aquí pero se conecta en el listener del botón cuando el panel es visible
  window.handleLayerFilterChange = function(newFilter) {
    console.log(`🔍 ⚡⚡⚡ FILTRO CAMBIÓ: "${eventSystem.currentLayerFilter}" → "${newFilter}"`);
    eventSystem.currentLayerFilter = newFilter;
    console.log(`🔍 Llamando refreshEventsList()...`);
    refreshEventsList();
  };
  
  // ===== APLICAR FILTRO - Función para botones =====
  window.applyFilter = function(filterValue) {
    console.log(`🔍 [applyFilter] Usuario hizo click en botón filtro: ${filterValue}`);
    
    // Cambiar estilos de botones
    const btnAll = document.getElementById('filter-all');
    const btnNorte = document.getElementById('filter-norte');
    const btnSur = document.getElementById('filter-sur');
    
    // Resetear todos los botones a gris
    if (btnAll) btnAll.style.background = '#e0e0e0';
    if (btnAll) btnAll.style.color = '#333';
    if (btnNorte) btnNorte.style.background = '#e0e0e0';
    if (btnNorte) btnNorte.style.color = '#333';
    if (btnSur) btnSur.style.background = '#e0e0e0';
    if (btnSur) btnSur.style.color = '#333';
    
    // Poner el botón clickeado en azul
    if (filterValue === 'all' && btnAll) {
      btnAll.style.background = '#007bff';
      btnAll.style.color = 'white';
    } else if (filterValue === 'norte' && btnNorte) {
      btnNorte.style.background = '#007bff';
      btnNorte.style.color = 'white';
    } else if (filterValue === 'sur' && btnSur) {
      btnSur.style.background = '#007bff';
      btnSur.style.color = 'white';
    }
    
    // Aplicar el filtro
    window.handleLayerFilterChange(filterValue);
  };
  
  console.log('🔍 [setupEventListeners] Funciones de filtro configuradas: window.handleLayerFilterChange y window.applyFilter');
  
  // NOTA: Cada evento tiene su propio botón 🗑️ para limpiar solo ese evento de la vista
}


async function loadEventosFromFirestore() {
  try {
    let query = db.collection('eventos');
    
    // Filtros simples (sin índice compuesto requerido)
    if (!window.USER_IS_ADMIN && window.USER_LAYER) {
      // Operadores ven todos los eventos de su capa
      query = query.where('layer', '==', window.USER_LAYER);
    } else if (window.USER_IS_ADMIN) {
      // Admin ve todos (sin filtro de layer)
    }
    
    console.log('📡 [eventos-operadores] Escuchando eventos de Firestore...');
    
    // Escuchar cambios en tiempo real
    query.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
      console.log(`📡 [eventos-operadores] snapshot recibido con ${snapshot.size} documentos`);
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const validEvents = {};
      
      snapshot.forEach(doc => {
        const eventData = doc.data();
        console.log(`   - Evento encontrado: ${eventData.id}, createdAt: ${eventData.createdAt}, archivado: ${eventData.archived}`);
        
        // REGLA 1: Permitir eventos archivados - comentada para mostrar todo
        //if (eventData.archived === true) {
        //  console.log(`   - ❌ Ignorando (archivado): ${eventData.id}`);
        //  return;
        //}
        
        // REGLA 2: Permitir también eventos antiguos - comentada para mostrar todo
        //const lastStatusDate = new Date(eventData.lastSentToAdmin || eventData.updatedAt || eventData.createdAt);
        //if (lastStatusDate < oneDayAgo) {
        //  console.log(`   - ⏰ Ignorando (muy antiguo): ${eventData.id}`);
        //  return;
        //}
        
        console.log(`   - ✅ Agregando evento: ${eventData.id}`);
        validEvents[eventData.id] = eventData;
      });
      
      // Verificar si hay eventos nuevos o eliminados
      const oldEventIds = Object.keys(eventSystem.eventsData);
      const newEventIds = Object.keys(validEvents);
      
      console.log(`📊 Eventos antiguos: ${oldEventIds.length}, Eventos nuevos: ${newEventIds.length}`);
      
      // Remover eventos que ya no son válidos
      oldEventIds.forEach(id => {
        if (!validEvents[id]) {
          delete eventSystem.eventsData[id];
        }
      });
      
      // Agregar eventos nuevos y actualizar existentes
      newEventIds.forEach(id => {
        const eventData = validEvents[id];
        eventSystem.eventsData[id] = eventData;
      });
      
      // Redibujar con filtro aplicado
      refreshEventsList();
      
      console.log('✅ Eventos sincronizados en tiempo real');
    }, (error) => {
      console.error('❌ Error al cargar eventos:', error);
    });
  } catch (error) {
    console.error('❌ Error al configurar listener:', error);
  }
}

// Nueva función para actualizar solo los valores sin recrear la tarjeta
function updateEventCardValues(eventId, eventData) {
  const card = document.querySelector(`[data-event-id="${eventId}"]`);
  if (!card) {
    console.warn(`⚠️ Tarjeta no encontrada para actualizar: ${eventId}`);
    return;
  }
  
  console.log(`🔄 [updateEventCardValues] Actualizando tarjeta: ${eventId}`);
  console.log(`   - briefReport: "${eventData.briefReport}"`);
  console.log(`   - notes: "${eventData.notes}"`);
  console.log(`   - finalNotes: "${eventData.finalNotes}"`);
  
  // Actualizar status
  const statusEl = card.querySelector('.event-status');
  if (statusEl) {
    const statusValue = (eventData.status || 'abierto').toLowerCase();
    const isAbierto = statusValue === 'abierto';
    statusEl.textContent = isAbierto ? 'ABIERTO' : 'CERRADO';
    statusEl.style.background = isAbierto ? '#ffc107' : '#28a745';
  }
  
  // Actualizar campos editables sin perder el foco
  const fieldsToUpdate = [
    ['event-notification-time', 'notificationTime'],
    ['event-notification-type', 'notificationType'],
    ['event-follow-start-time', 'followStartTime'],
    ['event-brief-report', 'briefReport'],
    ['event-notes', 'notes'],
    ['event-police-time', 'policeTime'],
    ['event-police-unit', 'policeUnit'],
    ['event-ambulance-time', 'ambulanceTime'],
    ['event-ambulance-unit', 'ambulanceUnit'],
    ['event-attending-doctor', 'attendingDoctor'],
    ['event-ambulance-return-time', 'ambulanceReturnTime'],
    ['event-police-return-time', 'policeReturnTime'],
    ['event-closure-time', 'closureTime'],
    ['event-final-notes', 'finalNotes']
  ];
  
  fieldsToUpdate.forEach(([selector, field]) => {
    const el = card.querySelector(`.${selector}`);
    if (el && document.activeElement !== el) {
      const newValue = eventData[field] || '';
      if (el.value !== newValue) {
        el.value = newValue;
        console.log(`   ✅ Actualizado: ${selector} = "${newValue.substring(0, 30)}${newValue.length > 30 ? '...' : ''}"`);
      }
    }
  });
}

function renderEventCard(eventData) {
  const template = document.getElementById('event-card-template');
  if (!template) {
    console.warn('⚠️ Template no encontrado');
    return;
  }
  
  console.log(`📜 [renderEventCard] Renderizando evento: ${eventData.id}`);
  
  const card = template.content.cloneNode(true);
  const eventId = eventData.id;
  
  // Información básica
  card.querySelector('.event-camera').textContent = `Cám. ${eventData.cameraNumber}`;
  card.querySelector('.event-location').textContent = eventData.location;
  card.querySelector('.event-operator').textContent = eventData.operatorName;
  card.querySelector('.event-created').textContent = new Date(eventData.createdAt).toLocaleString('es-AR');
  
  // Status - case insensitive comparison
  const statusEl = card.querySelector('.event-status');
  const statusValue = (eventData.status || 'abierto').toLowerCase();
  const isAbierto = statusValue === 'abierto';
  statusEl.textContent = isAbierto ? 'ABIERTO' : 'CERRADO';
  statusEl.style.background = isAbierto ? '#ffc107' : '#28a745';
  
  // Campos editable - con safeguards para evitar null
  const setFieldValue = (selector, value) => {
    const el = card.querySelector(selector);
    if (el) {
      el.value = value || '';
      if (value) {
        console.log(`   ✅ Campo llenado: ${selector} = "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
      }
    } else {
      console.warn(`⚠️ Campo no encontrado en template: ${selector}`);
    }
  };
  
  console.log(`📋 Llenando campos del evento ${eventData.id}:`);
  console.log(`   - briefReport: "${eventData.briefReport}"`);
  console.log(`   - notes: "${eventData.notes}"`);
  console.log(`   - finalNotes: "${eventData.finalNotes}"`);
  
  setFieldValue('.event-notification-time', eventData.notificationTime);
  setFieldValue('.event-notification-type', eventData.notificationType);
  setFieldValue('.event-follow-start-time', eventData.followStartTime);
  setFieldValue('.event-brief-report', eventData.briefReport);
  setFieldValue('.event-notes', eventData.notes);
  setFieldValue('.event-police-time', eventData.policeTime);
  setFieldValue('.event-police-unit', eventData.policeUnit);
  setFieldValue('.event-ambulance-time', eventData.ambulanceTime);
  setFieldValue('.event-ambulance-unit', eventData.ambulanceUnit);
  setFieldValue('.event-attending-doctor', eventData.attendingDoctor);
  setFieldValue('.event-ambulance-return-time', eventData.ambulanceReturnTime);
  setFieldValue('.event-police-return-time', eventData.policeReturnTime);
  setFieldValue('.event-closure-time', eventData.closureTime);
  setFieldValue('.event-final-notes', eventData.finalNotes);
  
  // Historial
  const historyHTML = (eventData.history || []).map(h => 
    `<div style="margin-bottom: 4px;"><strong>${h.timestamp}</strong>: ${h.action}</div>`
  ).join('');
  card.querySelector('.event-history').innerHTML = historyHTML || 'Sin cambios aún';
  
  // Mostrar mensajes de admin solo si los hay
  if (eventData.messages && eventData.messages.length > 0) {
    card.querySelector('.event-admin-messages').style.display = 'block';
    const messagesHTML = eventData.messages.map(m => 
      `<div style="margin-bottom: 4px;"><strong>[Admin ${m.time}]:</strong> ${m.text}</div>`
    ).join('');
    card.querySelector('.event-messages-list').innerHTML = messagesHTML;
  }
  
  // Event listeners para guardado automático
  const inputs = card.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    // Deshabilitar si es admin pero no es el operador dueño
    if (window.USER_IS_ADMIN && eventData.operatorUid !== window.currentUser.uid) {
      input.disabled = true;
      input.style.backgroundColor = '#f0f0f0';
    }
    
    input.addEventListener('change', () => saveEventField(eventId, input));
    input.addEventListener('input', () => saveEventField(eventId, input));
  });
  
  // Botón cerrar evento
  const closeBtn = card.querySelector('.close-event-btn');
  const statusValue2 = (eventData.status || 'abierto').toLowerCase();
  const isCerrado = statusValue2 === 'cerrado';
  if (isCerrado || (eventData.operatorUid !== window.currentUser.uid && !window.USER_IS_ADMIN)) {
    closeBtn.disabled = true;
    closeBtn.style.opacity = '0.5';
    closeBtn.style.cursor = 'not-allowed';
  } else {
    closeBtn.addEventListener('click', () => closeEvent(eventId));
  }
  
  // Botón remover evento de la vista
  const removeBtn = card.querySelector('.remove-event-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      try {
        // Marcar como archivado en Firestore
        await db.collection('eventos').doc(eventId).update({
          archived: true,
          archivedAt: new Date().toISOString(),
          archivedBy: window.currentUser?.uid || 'unknown'
        });
        console.log('🗑️ Evento archivado:', eventId);
      } catch (error) {
        console.error('❌ Error archivando evento:', error);
        alert('Error al archivar: ' + error.message);
      }
    });
  }
  
  // Obtener la primera tarjeta (que es el div.event-card del template)
  const eventCardEl = card.querySelector('.event-card');
  if (eventCardEl) {
    eventCardEl.setAttribute('data-event-id', eventId);
  }
  
  const containerEl = document.getElementById('events-list-container');
  if (containerEl) {
    console.log(`📌 Agregando tarjeta a eventos-list-container para: ${eventId}`);
    containerEl.appendChild(card);
    console.log(`✅ Tarjeta agregada correctamente: ${eventId}`);
  } else {
    console.error('❌ Contenedor eventos-list-container NO ENCONTRADO');
  }
}

function saveEventField(eventId, inputElement) {
  // Cancelar timer anterior si existe
  if (eventSystem.eventSaveTimers[eventId]) {
    clearTimeout(eventSystem.eventSaveTimers[eventId]);
  }
  
  // Guardar con delay de 2 segundos
  eventSystem.eventSaveTimers[eventId] = setTimeout(async () => {
    const fieldClass = inputElement.className;
    const fieldName = fieldClass.replace('event-', '');
    const value = inputElement.value;
    
    // Mapeo de clases a nombres de campos
    const fieldMapping = {
      'notification-time': 'notificationTime',
      'notification-type': 'notificationType',
      'follow-start-time': 'followStartTime',
      'brief-report': 'briefReport',
      'notes': 'notes',
      'police-time': 'policeTime',
      'police-unit': 'policeUnit',
      'ambulance-time': 'ambulanceTime',
      'ambulance-unit': 'ambulanceUnit',
      'attending-doctor': 'attendingDoctor',
      'ambulance-return-time': 'ambulanceReturnTime',
      'police-return-time': 'policeReturnTime',
      'closure-time': 'closureTime',
      'final-notes': 'finalNotes'
    };
    
    const dbFieldName = fieldMapping[fieldName];
    if (!dbFieldName) return;
    
    try {
      const oldValue = eventSystem.eventsData[eventId][dbFieldName] || '';
      
      // Actualizar cache local
      eventSystem.eventsData[eventId][dbFieldName] = value;
      eventSystem.eventsData[eventId].updatedAt = new Date().toISOString();
      
      // Actualizar en Firestore
      await db.collection('eventos').doc(eventId).update({
        [dbFieldName]: value,
        updatedAt: eventSystem.eventsData[eventId].updatedAt
      });
      
      // Agregar al historial si hubo cambio
      if (oldValue !== value) {
        const timestamp = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        await db.collection('eventos').doc(eventId).update({
          history: firebase.firestore.FieldValue.arrayUnion({
            timestamp: timestamp,
            action: `${fieldName.replace(/-/g, ' ')}: ${value || '(vacío)'}`
          })
        });
        
        if (!eventSystem.eventsData[eventId].history) {
          eventSystem.eventsData[eventId].history = [];
        }
        eventSystem.eventsData[eventId].history.push({
          timestamp: timestamp,
          action: `${fieldName.replace(/-/g, ' ')}: ${value || '(vacío)'}`
        });
      }
      
      console.log('💾 Campo guardado:', dbFieldName);
    } catch (error) {
      console.error('❌ Error al guardar campo:', error);
    }
  }, 2000); // 2 segundos de delay
}

async function closeEvent(eventId) {
  if (!confirm('¿Cerrar este evento?')) return;
  
  try {
    const now = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    
    await db.collection('eventos').doc(eventId).update({
      status: 'cerrado',
      closureTime: now,
      updatedAt: new Date().toISOString(),
      history: firebase.firestore.FieldValue.arrayUnion({
        timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        action: 'Evento CERRADO'
      })
    });
    
    eventSystem.eventsData[eventId].status = 'cerrado';
    
    // Recargar eventos
    loadEventosFromFirestore();
    
    console.log('✅ Evento cerrado:', eventId);
  } catch (error) {
    console.error('❌ Error al cerrar evento:', error);
    alert('Error al cerrar evento: ' + error.message);
  }
}

// Escuchar cambios en tiempo real
function listenToEventChanges() {
  if (!window.currentUser) {
    console.warn('⚠️ Usuario no disponible para listener');
    return;
  }
  
  let query = db.collection('eventos');
  
  // Filtro simple sin índice compuesto
  if (!window.USER_IS_ADMIN && window.USER_LAYER) {
    query = query.where('layer', '==', window.USER_LAYER);
  }
  
  query.onSnapshot(snapshot => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    snapshot.docChanges().forEach(change => {
      const eventData = change.doc.data();
      
      // REGLA 1: Si está archivado, NUNCA procesar (prioridad absoluta)
      if (eventData.archived === true) {
        return; // Se ignora completamente
      }
      
      // REGLA 2: Si no está archivado, solo procesar si fue actualizado recientemente
      const lastStatusDate = new Date(eventData.lastSentToAdmin || eventData.updatedAt || eventData.createdAt);
      if (lastStatusDate < oneDayAgo) {
        return; // Ignorar si no tiene actividad reciente
      }
      
      if (change.type === 'added') {
        console.log(`📌 [listenToEventChanges] NUEVO evento: ${eventData.id}`);
        eventSystem.eventsData[eventData.id] = eventData;
        refreshEventsList();
      } else if (change.type === 'modified') {
        console.log(`🔄 [listenToEventChanges] MODIFICADO evento: ${eventData.id}`);
        eventSystem.eventsData[eventData.id] = eventData;
        refreshEventsList();
      }
    });
  }, error => {
    console.error('❌ Error en listener de eventos:', error);
  });
}

// ===== FUNCIÓN DE FILTRADO =====
function refreshEventsList() {
  const container = document.getElementById('events-list-container');
  if (!container) {
    console.error('❌ Container no encontrado');
    return;
  }
  
  // Limpiar contenedor
  container.innerHTML = '';
  
  const filterValue = eventSystem.currentLayerFilter || 'all';
  let visibleCount = 0;
  
  console.log(`🔄 [refreshEventsList] Filtro actual: "${filterValue}"`);
  console.log(`🔄 [refreshEventsList] Total eventos en memoria: ${Object.keys(eventSystem.eventsData).length}`);
  
  // Iterar sobre eventos y renderizar según filtro
  for (const eventId in eventSystem.eventsData) {
    const eventData = eventSystem.eventsData[eventId];
    
    console.log(`   📌 Evento ${eventId}: layer="${eventData.layer}", filtro="${filterValue}"`);
    
    // Aplicar filtro por capa
    let passesFilter = false;
    if (filterValue === 'all') {
      passesFilter = true;
    } else if (filterValue === 'norte') {
      passesFilter = eventData.layer === 'norte';
    } else if (filterValue === 'sur') {
      passesFilter = eventData.layer === 'sur';
    }
    
    if (passesFilter) {
      console.log(`      ✅ PASA filtro - renderizando`);
      renderEventCard(eventData);
      visibleCount++;
    } else {
      console.log(`      ❌ NO PASA filtro`);
    }
  }
  
  if (visibleCount === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999; font-size: 14px;">📭 No hay eventos para este filtro</div>';
    console.log(`⚠️ [refreshEventsList] No hay eventos visibles para el filtro "${filterValue}"`);
  }
  
  console.log(`✅ [refreshEventsList] Mostrados ${visibleCount} eventos de ${Object.keys(eventSystem.eventsData).length}`);
}



// Llamar al iniciar la app
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.currentUser) {
      initEventSystem();
    }
  }, 2000);
});

// Fallback si DOMContentLoaded ya pasó
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.currentUser) {
        initEventSystem();
      }
    }, 2000);
  });
} else {
  setTimeout(() => {
    if (window.currentUser && !eventSystem.initialized) {
      initEventSystem();
    }
  }, 2000);
}
