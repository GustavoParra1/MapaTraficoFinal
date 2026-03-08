// ============================================================
// SISTEMA LIMPIO DE SINCRONIZACIÓN FIREBASE → GOOGLE SHEETS
// ============================================================

const FIREBASE_URL = "https://seguridad-mdp-v2-default-rtdb.firebaseio.com/operador-tarjetas.json";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
               "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

// ============================================================
// LISTA NEGRA DE IDs A IGNORAR EN LA SINCRONIZACIÓN
// ============================================================
const ID_LISTA_NEGRA = [
  "evt_1772915790181_mdx8rlr07",  // Evento conflictivo D07
  "evento-prueba-001"              // Evento de prueba eliminado
];

// ============================================================
// MENÚ PRINCIPAL
// ============================================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Sincronizar")
    .addItem("Sincronizar Ahora", "sincronizarAhora")
    .addItem("Recalcular Colores", "recalcularColores")
    .addSeparator()
    .addItem("🧹 Limpiar Todo", "limpiarTodoDatos")
    .addItem("🔀 Eliminar Duplicados", "eliminarDuplicados")
    .addSeparator()
    .addItem("📋 Diagnosticar Firebase", "diagnosticarFirebase")
    .addItem("Diagnosticar Hoja 1", "diagnosticarHoja1")
    .addItem("Diagnosticar MARZO 26", "diagnosticarMarzo26")
    .addItem("Ver Logs", "verLogs")
    .addToUi();
}

function diagnosticarMarzo26() {
  diagnosticarHoja("MARZO 26");
}

function diagnosticarHoja1() {
  diagnosticarHoja("Hoja 1");
}

function diagnosticarFirebase() {
  const ui = SpreadsheetApp.getUi();
  try {
    Logger.log("📡 DIAGNOSTICANDO FIREBASE");
    Logger.log("============================");
    
    const response = UrlFetchApp.fetch(FIREBASE_URL);
    const data = JSON.parse(response.getContentText());
    const eventos = Object.values(data || {}).filter(e => e && e.id);
    
    if (eventos.length === 0) {
      ui.alert("⚠️ Firebase vacío - sin eventos");
      return;
    }
    
    Logger.log("✅ Total eventos: " + eventos.length);
    Logger.log("");
    
    // Mostrar primer evento completo
    if (eventos.length > 0) {
      Logger.log("📌 PRIMER EVENTO (completo):");
      Logger.log(JSON.stringify(eventos[0], null, 2));
      Logger.log("");
      
      // Listar todas las propiedades únicas
      const todasLasPropiedades = new Set();
      eventos.forEach(e => {
        Object.keys(e).forEach(key => todasLasPropiedades.add(key));
      });
      
      Logger.log("📋 PROPIEDADES ENCONTRADAS EN TODOS LOS EVENTOS:");
      Array.from(todasLasPropiedades).sort().forEach(prop => {
        let conValor = eventos.filter(e => e[prop] && e[prop].toString().trim() !== "").length;
        Logger.log("  - " + prop + " (" + conValor + "/" + eventos.length + " eventos con valor)");
      });
    }
    
    ui.alert("✅ Ver logs para ver estructura de Firebase");
  } catch (e) {
    Logger.log("❌ Error: " + e.toString());
    ui.alert("❌ Error: " + e.toString());
  }
}

function diagnosticarHoja(nombreHoja) {
  const ui = SpreadsheetApp.getUi();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) {
      ui.alert("❌ " + nombreHoja + " no existe");
      return;
    }
    
    Logger.log("📊 DIAGNÓSTICO DE " + nombreHoja);
    Logger.log("=============================");
    
    // Encabezado - Celda A1
    const celda1A1 = hoja.getRange(1, 1);
    Logger.log("📌 CELDA A1:");
    Logger.log("  Fondo: " + celda1A1.getBackground());
    Logger.log("  Color fuente: " + celda1A1.getFontColor());
    Logger.log("  Fuente: " + celda1A1.getFontFamily());
    Logger.log("  Tamaño: " + celda1A1.getFontSize());
    Logger.log("  Peso: " + celda1A1.getFontWeight());
    
    // Fila 2 Celda A2 (si existe)
    if (hoja.getLastRow() > 1) {
      const celda2A1 = hoja.getRange(2, 1);
      Logger.log("📌 CELDA A2:");
      Logger.log("  Fondo: " + celda2A1.getBackground());
      Logger.log("  Color fuente: " + celda2A1.getFontColor());
      Logger.log("  Fuente: " + celda2A1.getFontFamily());
      Logger.log("  Tamaño: " + celda2A1.getFontSize());
      Logger.log("  Peso: " + celda2A1.getFontWeight());
    } else {
      Logger.log("⚠️ " + nombreHoja + " solo tiene encabezado");
    }
    
    ui.alert("✅ Ver logs de " + nombreHoja);
  } catch (e) {
    Logger.log("❌ Error: " + e.toString());
    ui.alert("❌ Error: " + e.toString());
  }
}

function sincronizarAhora() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert("⏳ Sincronizando...");
    const resultado = sync();
    ui.alert("✅ " + resultado);
  } catch (e) {
    ui.alert("❌ Error: " + e.toString());
  }
}

function recalcularColores() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert("⏳ Recalculando colores...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    actualizarColores(ss);
    ui.alert("✅ Colores actualizados");
  } catch (e) {
    ui.alert("❌ Error: " + e.toString());
  }
}

function limpiarTodoDatos() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert("⚠️ Esto elimina TODOS los datos de prueba. ¿Continuar?", ui.ButtonSet.YES_NO);
  
  if (confirm !== ui.Button.YES) {
    ui.alert("Cancelado");
    return;
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoy = new Date();
    const mesActual = MESES[hoy.getMonth()] + " " + hoy.getFullYear().toString().slice(-2);
    
    // Hojas a limpiar
    const hojasALimpiar = [mesActual, "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13", "D14", "D15", "D16", "D17", "D18", "D19", "D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30", "D31"];
    
    let contadorLimpiadas = 0;
    
    hojasALimpiar.forEach(nombreHoja => {
      const hoja = ss.getSheetByName(nombreHoja);
      if (!hoja) return;
      
      const lastRow = hoja.getLastRow();
      if (lastRow > 1) {
        hoja.deleteRows(2, lastRow - 1);
        contadorLimpiadas++;
        Logger.log("🧹 Limpiada: " + nombreHoja);
      }
    });
    
    ui.alert("✅ Se limpiaron " + contadorLimpiadas + " hojas\nAhora ejecuta 'Sincronizar Ahora' para traer datos frescos");
  } catch (e) {
    ui.alert("❌ Error: " + e.toString());
  }
}

function eliminarDuplicados() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert("⚠️ Esto elimina filas duplicadas (por ID). Mantiene la ÚLTIMA ocurrencia. ¿Continuar?", ui.ButtonSet.YES_NO);
  
  if (confirm !== ui.Button.YES) {
    ui.alert("Cancelado");
    return;
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoy = new Date();
    const mesActual = MESES[hoy.getMonth()] + " " + hoy.getFullYear().toString().slice(-2);
    
    // Hojas a revisar
    const hojasARevisar = [mesActual, "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13", "D14", "D15", "D16", "D17", "D18", "D19", "D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30", "D31"];
    
    let totalEliminadas = 0;
    
    hojasARevisar.forEach(nombreHoja => {
      const hoja = ss.getSheetByName(nombreHoja);
      if (!hoja) return;
      
      const lastRow = hoja.getLastRow();
      if (lastRow <= 1) return; // Solo encabezado
      
      // Leer todos los IDs
      const idsRango = hoja.getRange(2, 2, lastRow - 1, 1).getValues();
      const idsPorFila = {};
      
      idsRango.forEach((row, idx) => {
        const id = row[0];
        const filaNumero = idx + 2; // +2 porque empieza en fila 2
        
        if (id) {
          if (!idsPorFila[id]) {
            idsPorFila[id] = [];
          }
          idsPorFila[id].push(filaNumero);
        }
      });
      
      // Identificar filas a eliminar (mantener la última de cada grupo)
      const filasAEliminar = [];
      Object.keys(idsPorFila).forEach(id => {
        const filas = idsPorFila[id];
        if (filas.length > 1) {
          // Hay duplicados - mantener la última, eliminar las demás
          for (let i = 0; i < filas.length - 1; i++) {
            filasAEliminar.push(filas[i]);
          }
        }
      });
      
      // Ordenar en descendente para borrar de abajo hacia arriba (sin cambiar índices)
      filasAEliminar.sort((a, b) => b - a);
      
      // Eliminar filas
      filasAEliminar.forEach(filaNum => {
        hoja.deleteRow(filaNum);
        totalEliminadas++;
        Logger.log("  ❌ " + nombreHoja + " fila " + filaNum + " eliminada (duplicada)");
      });
    });
    
    ui.alert("✅ Se eliminaron " + totalEliminadas + " filas duplicadas");
  } catch (e) {
    ui.alert("❌ Error: " + e.toString());
  }
}

function verLogs() {
  SpreadsheetApp.getUi().showModelessDialog(
    HtmlService.createHtmlOutput("<pre id='log'></pre>")
      .setWidth(600).setHeight(400),
    "Logs"
  );
}



// ============================================================
// FUNCIÓN PRINCIPAL DE SINCRONIZACIÓN
// ============================================================
function sync() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const startTime = Date.now();
  
  Logger.log("🚀 SYNC INICIANDO");
  Logger.log("📋 HOJAS EN EL SPREADSHEET:");
  ss.getSheets().forEach(sheet => {
    Logger.log("  - " + sheet.getName() + " (filas: " + sheet.getLastRow() + ")");
  });
  
  try {
    // 1️⃣ OBTENER DATOS DE FIREBASE
    Logger.log("📡 Obteniendo datos de Firebase...");
    const response = UrlFetchApp.fetch(FIREBASE_URL);
    const data = JSON.parse(response.getContentText());
    const eventos = Object.values(data || {}).filter(e => e && e.id);
    
    if (eventos.length === 0) {
      Logger.log("⚠️ Firebase vacío");
      return "Firebase sin datos";
    }
    
    Logger.log("✅ Firebase OK - " + eventos.length + " eventos");
    
    // 2️⃣ DETERMINAR HOJAS NECESARIAS (según eventos)
    Logger.log("📋 Determinando hojas necesarias...");
    const hojasPorEvento = determinarHojasNecesarias(eventos);
    
    // 3️⃣ CREAR HOJAS NECESARIAS (solo si no existen)
    Logger.log("📋 Creando hojas necesarias (si no existen)...");
    crearHojasNecesarias(ss, hojasPorEvento);
    
    // 4️⃣ SINCRONIZAR DATOS DE FIREBASE Y APLICAR COLORES
    Logger.log("💾 Sincronizando datos de Firebase...");
    sincronizarDatos(ss, eventos);
    
    // 5️⃣ COPIAR DATOS MANUALES DE HOJAS DIARIAS A MARZO 26
    Logger.log("📋 Copiando datos manuales de hojas diarias a MARZO 26...");
    copiarDatosManualesToMes(ss);
    
    // 6️⃣ APLICAR DESPLEGABLES
    Logger.log("✅ Aplicando desplegables...");
    aplicarDesplegables(ss);
    
    const elapsed = (Date.now() - startTime) / 1000;
    Logger.log("✅ SYNC COMPLETADO EN " + elapsed.toFixed(1) + "s");
    
    return "Sincronización completada en " + elapsed.toFixed(1) + " segundos";
    
  } catch (e) {
    Logger.log("❌ ERROR: " + e.toString());
    throw e;
  }
}

// ============================================================
// FUNCIÓN AUXILIAR: DIVIDIR UBICACIÓN POR "Y" o "E"
// ============================================================
function dividirUbicacion(ubicacion) {
  if (!ubicacion) return { calle1: "", calle2: "" };
  
  let calle1 = "";
  let calle2 = "";
  
  // Buscar " Y " (mayúscula/minúscula)
  const regexY = /\s+[Yy]\s+/;
  if (regexY.test(ubicacion)) {
    const partes = ubicacion.split(regexY);
    calle1 = partes[0].trim();
    calle2 = partes[1] ? partes[1].trim() : "";
    return { calle1, calle2 };
  }
  
  // Buscar " E " (mayúscula/minúscula)
  const regexE = /\s+[Ee]\s+/;
  if (regexE.test(ubicacion)) {
    const partes = ubicacion.split(regexE);
    calle1 = partes[0].trim();
    calle2 = partes[1] ? partes[1].trim() : "";
    return { calle1, calle2 };
  }
  
  // Si no hay separador, todo va a calle1
  calle1 = ubicacion.trim();
  return { calle1, calle2 };
}

// ============================================================
// 1A. DETERMINAR HOJAS NECESARIAS (basado en eventos)
// ============================================================
function determinarHojasNecesarias(eventos) {
  const hoy = new Date();
  const mesActual = MESES[hoy.getMonth()] + " " + hoy.getFullYear().toString().slice(-2);
  
  const hojasPorCrear = new Set();
  
  // Por defecto, SIEMPRE incluir la hoja mensual actual
  hojasPorCrear.add(mesActual);
  Logger.log("  📅 Hoja del mes actual (" + mesActual + ") será creada/mantenida");
  
  // ⭐ OPCIÓN B: Si es el 1 de cada mes, TAMBIÉN crear la hoja del próximo mes
  const diaActual = hoy.getDate();
  const ultimoDiaDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  
  if (diaActual === 1) {
    const proximoMes = new Date(hoy);
    proximoMes.setMonth(proximoMes.getMonth() + 1);
    const mesProximo = MESES[proximoMes.getMonth()] + " " + proximoMes.getFullYear().toString().slice(-2);
    hojasPorCrear.add(mesProximo);
    Logger.log("  📅 🎉 Es día 1 del mes - Hoja del próximo mes (" + mesProximo + ") será creada/mantenida");
  }
  
  // ⭐ Si es el ÚLTIMO día del mes, TAMBIÉN crear la hoja del próximo mes (+ D01 se crea automáticamente por MAÑANA)
  if (diaActual === ultimoDiaDelMes) {
    const proximoMes = new Date(hoy);
    proximoMes.setMonth(proximoMes.getMonth() + 1);
    const mesProximo = MESES[proximoMes.getMonth()] + " " + proximoMes.getFullYear().toString().slice(-2);
    hojasPorCrear.add(mesProximo);
    Logger.log("  📅 🎉 Es el ÚLTIMO día del mes (D" + ("0" + diaActual).slice(-2) + ") - Hoja del próximo mes (" + mesProximo + ") será creada/mantenida");
    Logger.log("  📅 además, D01 se creará automáticamente (MAÑANA = primer día del próximo mes)");
  }
  
  // ⭐ SIEMPRE crear hoja del día de HOY
  const diaHoy = ("0" + hoy.getDate()).slice(-2);
  hojasPorCrear.add("D" + diaHoy);
  Logger.log("  📅 Hoja de HOY (D" + diaHoy + ") será creada/mantenida");
  
  // ⭐ SIEMPRE crear hoja del día de MAÑANA
  const mañana = new Date(hoy);
  mañana.setDate(mañana.getDate() + 1);
  const diaMañana = ("0" + mañana.getDate()).slice(-2);
  hojasPorCrear.add("D" + diaMañana);
  Logger.log("  📅 Hoja de MAÑANA (D" + diaMañana + ") será creada/mantenida");
  
  // Revisar eventos y agregar hojas diarias para cada día que tenga eventos
  eventos.forEach(event => {
    if (!event.createdAt) return;
    
    const fechaEvento = new Date(event.createdAt);
    if (isNaN(fechaEvento.getTime())) return;
    
    const diaEvento = ("0" + fechaEvento.getDate()).slice(-2);
    const nombreHojaDiaria = "D" + diaEvento;
    
    // Crear hoja diaria para CUALQUIER evento que tenga ese día
    hojasPorCrear.add(nombreHojaDiaria);
  });
  
  return Array.from(hojasPorCrear);
}

// ============================================================
// 1B. CREAR HOJAS NECESARIAS (DUPLICANDO HOJA 1 COMO PLANTILLA)
// ============================================================
function crearHojasNecesarias(ss, hojasPorCrear) {
  const hojaBase = ss.getSheetByName("Hoja 1");
  
  if (!hojaBase) {
    Logger.log("  ❌ Hoja 1 no existe - no se pueden duplicar hojas");
    return;
  }
  
  hojasPorCrear.forEach(nombre => {
    let hoja = ss.getSheetByName(nombre);
    
    // Solo crear si NO existe (preservar datos manuales)
    if (!hoja) {
      Logger.log("  📋 Creando hoja: " + nombre);
      
      // DUPLICAR Hoja 1 como plantilla (copia TODO: formato, estilos, "Format as Table", etc.)
      hojaBase.copyTo(ss);
      
      // La copia se inserta al final, obtenerla
      const sheets = ss.getSheets();
      const nuevaHoja = sheets[sheets.length - 1];
      
      // Renombrarla al nombre deseado
      nuevaHoja.setName(nombre);
      
      Logger.log("  ➕ Creada: " + nombre + " (desde Hoja 1 - hereda todo el formato)");
    } else {
      Logger.log("  ℹ️ " + nombre + " ya existe - manteniendo datos existentes");
    }
  });
}

// ============================================================
// 1.5 REORDENAR FILAS: COMPLETAS (BLANCAS) ARRIBA, INCOMPLETAS (NARANJAS) ABAJO
// ============================================================
function reordenarPorComplecion(hoja) {
  const lastRow = hoja.getLastRow();
  if (lastRow <= 1) return; // Solo header
  
  try {
    const datos = hoja.getRange(2, 1, lastRow - 1, 22).getValues();
    const backgrounds = hoja.getRange(2, 1, lastRow - 1, 22).getBackgrounds();
    const fontColors = hoja.getRange(2, 1, lastRow - 1, 22).getFontColors();
    
    // Separar filas completas e incompletas
    const completas = [];
    const incompletas = [];
    
    for (let i = 0; i < datos.length; i++) {
      const row = datos[i];
      const columnasObligatorias = [2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      let esCompleto = true;
      
      for (let colIdx of columnasObligatorias) {
        const valor = row[colIdx];
        if (!valor || valor.toString().trim() === "") {
          esCompleto = false;
          break;
        }
      }
      
      const item = {
        datos: row,
        background: backgrounds[i],
        fontColor: fontColors[i]
      };
      
      if (esCompleto) {
        completas.push(item);
      } else {
        incompletas.push(item);
      }
    }
    
    // Combinar: completas primero, luego incompletas
    const combinada = [...completas, ...incompletas];
    
    if (combinada.length > 0) {
      const datosOrdenados = combinada.map(item => item.datos);
      const backgroundsOrdenados = combinada.map(item => item.background);
      const fontColorsOrdenados = combinada.map(item => item.fontColor);
      
      hoja.getRange(2, 1, datosOrdenados.length, 22).setValues(datosOrdenados);
      hoja.getRange(2, 1, backgroundsOrdenados.length, 22).setBackgrounds(backgroundsOrdenados);
      hoja.getRange(2, 1, fontColorsOrdenados.length, 22).setFontColors(fontColorsOrdenados);
      
      Logger.log("    🔄 Reordenadas: " + completas.length + " completas, " + incompletas.length + " incompletas");
    }
  } catch (e) {
    Logger.log("    ⚠️ Error reordenando: " + e);
  }
}

// ============================================================
// 2. SINCRONIZAR DATOS DESDE FIREBASE
// ============================================================
function sincronizarDatos(ss, eventos) {
  const hojaBase = ss.getSheetByName("Hoja 1");
  if (!hojaBase) return;
  
  const hoy = new Date();
  const mesActual = MESES[hoy.getMonth()] + " " + hoy.getFullYear().toString().slice(-2);
  
  // Agrupar eventos por hoja
  const datoPorHoja = {};
  
  eventos.forEach(event => {
    if (!event.id || !event.createdAt) return;
    
    const fechaEvento = new Date(event.createdAt);
    if (isNaN(fechaEvento.getTime())) return;
    
    const diaEvento = ("0" + fechaEvento.getDate()).slice(-2);
    const mesEvento = MESES[fechaEvento.getMonth()] + " " + fechaEvento.getFullYear().toString().slice(-2);
    
    // Agregar SOLO a la hoja diaria (Firebase solo en hojas diarias)
    if (mesEvento === mesActual) {
      const nombreHojaDiaria = "D" + diaEvento;
      if (!datoPorHoja[nombreHojaDiaria]) datoPorHoja[nombreHojaDiaria] = [];
      datoPorHoja[nombreHojaDiaria].push(event);
    }
  });
  
  // Insertar o actualizar en cada hoja
  Object.keys(datoPorHoja).forEach(nombreHoja => {
    const hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return;
    
    const limpiarTexto = (texto) => {
      if (!texto) return "";
      return texto.toString().replace(/[\r\n]+/g, " ").substring(0, 100);
    };
    
    // Leer IDs existentes en la hoja
    const lastRow = hoja.getLastRow();
    const idsExistentes = {};
    if (lastRow > 1) {
      const idsRango = hoja.getRange(2, 2, lastRow - 1, 1).getValues();
      idsRango.forEach((row, idx) => {
        const id = row[0];
        if (id) {
          idsExistentes[id] = idx + 2; // +2 porque es 0-indexed y empieza en fila 2
        }
      });
    }
    
    let eventosActualizados = 0;
    let eventosNuevos = 0;
    
    // Procesar cada evento
    datoPorHoja[nombreHoja].forEach(event => {
      // VERIFICAR: ¿Está en lista negra?
      if (ID_LISTA_NEGRA.includes(event.id)) {
        Logger.log("  🚫 " + nombreHoja + ": evento ID " + event.id + " está en LISTA NEGRA (ignorado)");
        return; // Saltar este evento
      }
      const fecha = new Date(event.createdAt);
      const fechaStr = ("0" + fecha.getDate()).slice(-2) + "/" + 
                       ("0" + (fecha.getMonth() + 1)).slice(-2) + "/" + 
                       fecha.getFullYear();
      
      // DIVIDIR ubicación por " Y " o " E "
      const ubicacion = dividirUbicacion(limpiarTexto(event.location));
      
      const filaEvento = [
        fechaStr,                           // A: Fecha
        event.id || "",                     // B: ID
        "",                                 // C: Tipo Evento (mantener usuario)
        limpiarTexto(event.notificationType), // D: Origen
        limpiarTexto(event.followStartTime),  // E: Inicio
        limpiarTexto(event.notificationTime), // F: Notificación
        limpiarTexto(event.policeTime),       // G: Llegada Policía
        limpiarTexto(event.closureTime),      // H: Cierre
        limpiarTexto(event.briefReport),      // I: Resumen
        limpiarTexto(event.cameraNumber),     // J: Cámara
        ubicacion.calle1,                   // K: Calle 1 (desde Firebase)
        ubicacion.calle2,                   // L: Calle 2 (desde Firebase)
        "",                                 // M: Jurisdicción (mantener usuario)
        "",                                 // N: Resultado (mantener usuario)
        "",                                 // O: Supervisor Puesto (mantener usuario)
        "",                                 // P: Supervisor Admin (mantener usuario)
        "",                                 // Q: Operador Puesto (mantener usuario)
        "",                                 // R: Operador Evento (mantener usuario)
        "",                                 // S: Efectivo Policial (mantener usuario)
        "",                                 // T: Transmite Evento (mantener usuario)
        new Date().toLocaleString(),        // U: Actualizado
        "NUEVO"                             // V: Estado
      ];
      
      // Verificar si el evento ya existe por ID
      if (idsExistentes[event.id]) {
        // FILA EXISTENTE: Verificar si está completa (blanca)
        const filaExistente = idsExistentes[event.id];
        const rango = hoja.getRange(filaExistente, 1, 1, 22);
        const backgrounds = rango.getBackgrounds()[0];
        const colorFila = backgrounds[0]; // Color de fondo del primer cell
        
        if (colorFila === "#FFFFFF") {
          // Ya está COMPLETA (blanca) - NO actualizar (conservar velocidad)
          Logger.log("  ✅ " + nombreHoja + " fila " + filaExistente + ": ID " + event.id + " ya COMPLETA, congelada (sin actualizar)");
          return; // Saltar este evento
        }
        
        // NO está completa (naranja) - ACTUALIZAR desde Firebase
        const datosActuales = rango.getValues()[0];
        
        // DIVIDIR ubicación por " Y " o " E "
        const ubicacionActualizada = dividirUbicacion(limpiarTexto(event.location));
        
        // Actualizar solo columnas de Firebase (A, B, D, E, F, G, H, I, J, K, L, U)
        // Mantener: C, M, N, O, P, Q, R, S, T (datos manuales del usuario)
        datosActuales[0] = filaEvento[0];   // A: Fecha
        datosActuales[1] = filaEvento[1];   // B: ID
        datosActuales[3] = filaEvento[3];   // D: Origen
        datosActuales[4] = filaEvento[4];   // E: Inicio
        datosActuales[5] = filaEvento[5];   // F: Notificación
        datosActuales[6] = filaEvento[6];   // G: Llegada Policía
        datosActuales[7] = filaEvento[7];   // H: Cierre
        datosActuales[8] = filaEvento[8];   // I: Resumen
        datosActuales[9] = filaEvento[9];   // J: Cámara
        datosActuales[10] = ubicacionActualizada.calle1; // K: Calle 1 (desde Firebase)
        datosActuales[11] = ubicacionActualizada.calle2; // L: Calle 2 (desde Firebase)
        datosActuales[20] = filaEvento[20]; // U: Actualizado
        
        rango.setValues([datosActuales]);
        eventosActualizados++;
        Logger.log("  🔄 " + nombreHoja + " fila " + filaExistente + ": evento ID " + event.id + " actualizado (incompleta)");
      } else {
        // INSERTAR nueva fila (AL INICIO, después del encabezado)
        hoja.insertRows(2, 1);  // Insertar 1 fila en posición 2
        hoja.getRange(2, 1, 1, 22).setValues([filaEvento]);
        eventosNuevos++;
        Logger.log("  ➕ " + nombreHoja + ": evento ID " + event.id + " insertado en fila 2 (al inicio)");
      }
    });
    
    SpreadsheetApp.flush();
    
    // Aplicar colores a todas las filas
    const lastRowActual = hoja.getLastRow();
    if (lastRowActual > 1) {
      const datosCompletos = hoja.getRange(2, 1, lastRowActual - 1, 22).getValues();
      const backgrounds = [];
      
      for (let i = 0; i < datosCompletos.length; i++) {
        const columnasObligatorias = [2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
        let esCompleto = true;
        
        for (let colIdx of columnasObligatorias) {
          const valor = datosCompletos[i][colIdx];
          if (!valor || valor.toString().trim() === "") {
            esCompleto = false;
            break;
          }
        }
        
        const color = esCompleto ? "#FFFFFF" : "#FFA500";
        const filaColores = new Array(22).fill(color);
        backgrounds.push(filaColores);
      }
      
      hoja.getRange(2, 1, backgrounds.length, 22).setBackgrounds(backgrounds);
      SpreadsheetApp.flush();
    }
    
    // REORDENAR: Completas (blancas) arriba, incompletas (naranjas) abajo
    reordenarPorComplecion(hoja);
    
    Logger.log("  📝 " + nombreHoja + ": " + eventosActualizados + " actualizados + " + eventosNuevos + " nuevos");
  });
}

// ============================================================
// 3. COPIAR DATOS MANUALES DE HOJAS DIARIAS A MARZO 26
// ============================================================
function copiarDatosManualesToMes(ss) {
  const hoy = new Date();
  const mesActual = MESES[hoy.getMonth()] + " " + hoy.getFullYear().toString().slice(-2);
  const hojasMes = ss.getSheetByName(mesActual);
  
  if (!hojasMes) return;
  
  // 1️⃣ LIMPIAR MARZO 26 de datos previos
  const lastRowMes = hojasMes.getLastRow();
  if (lastRowMes > 1) {
    hojasMes.deleteRows(2, lastRowMes - 1);
    Logger.log("  🧹 MARZO 26 limpiada");
  }
  
  // 2️⃣ OBTENER todas las hojas diarias (D01-D31) dinámicamente
  const todasLasHojas = ss.getSheets().map(h => h.getName());
  const hojasDiarias = todasLasHojas.filter(nombre => 
    nombre.match(/^D\d{2}$/)  // Coincide con D## format
  ).sort().reverse();  // Orden descendente (D31, D30, ..., D01)
  
  Logger.log("  📋 Hojas diarias encontradas: " + hojasDiarias.join(", "));
  
  // 3️⃣ COPIAR datos desde cada hoja diaria
  hojasDiarias.forEach(nombreDia => {
    const hojaDia = ss.getSheetByName(nombreDia);
    if (!hojaDia) return;
    
    const lastRowDia = hojaDia.getLastRow();
    if (lastRowDia <= 1) return; // Solo encabezado
    
    try {
      const datosRango = hojaDia.getRange(2, 1, lastRowDia - 1, 22);
      const datosYFormatos = datosRango.getValues();
      const backgrounds = datosRango.getBackgrounds();
      const fontColors = datosRango.getFontColors();
      
      // Encontrar última fila con datos en MARZO 26
      const lastRowActual = hojasMes.getLastRow();
      
      // Copiar datos y formatos
      const newRange = hojasMes.getRange(lastRowActual + 1, 1, datosYFormatos.length, 22);
      newRange.setValues(datosYFormatos);
      newRange.setBackgrounds(backgrounds);
      newRange.setFontColors(fontColors);
      
      SpreadsheetApp.flush();
      Logger.log("  ✅ " + nombreDia + ": " + (lastRowDia - 1) + " filas copiadas a " + mesActual);
    } catch (e) {
      Logger.log("  ⚠️ Error copiando " + nombreDia + ": " + e);
    }
  });
  
  // REORDENAR MARZO 26: Completas (blancas) arriba, incompletas (naranjas) abajo
  Logger.log("  🔄 Reordenando " + mesActual + " por completitud...");
  reordenarPorComplecion(hojasMes);
}

// ============================================================
// 3.5 ACTUALIZAR COLORES (sin sincronizar datos)
// ============================================================
function actualizarColores(ss) {
  const hoy = new Date();
  const mesActual = MESES[hoy.getMonth()] + " " + hoy.getFullYear().toString().slice(-2);
  const hojas = [mesActual, "D08", "D07", "D06", "D05", "D04", "D03", "D02", "D01"];
  
  hojas.forEach(nombreHoja => {
    const hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return;
    
    const lastRow = hoja.getLastRow();
    if (lastRow <= 1) return;
    
    try {
      const datos = hoja.getRange(2, 1, lastRow - 1, 22).getValues();
      const backgrounds = [];
      
      for (let i = 0; i < datos.length; i++) {
        const row = datos[i];
        const columnasObligatorias = [2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
        let esCompleto = true;
        
        for (let colIdx of columnasObligatorias) {
          const valor = row[colIdx];
          if (!valor || valor.toString().trim() === "") {
            esCompleto = false;
            break;
          }
        }
        
        const color = esCompleto ? "#FFFFFF" : "#FFA500";
        const filaColores = [color, color, color, color, color, color, color, color, color, color,
                            color, color, color, color, color, color, color, color, color, color, color, color];
        backgrounds.push(filaColores);
      }
      
      hoja.getRange(2, 1, backgrounds.length, 22).setBackgrounds(backgrounds);
      SpreadsheetApp.flush();
      Logger.log("    ✅ Colores actualizados en " + nombreHoja);
      
      // Reordenar: Completas arriba, incompletas abajo
      reordenarPorComplecion(hoja);
    } catch (e) {
      Logger.log("    ❌ Error: " + e);
    }
  });
}

// ============================================================
// 4. APLICAR DESPLEGABLES
// ============================================================
const DROPDOWNS = [
  { col: 3, listSheet: "CATALOGO" },              // C: Tipo Evento
  { col: 4, listSheet: "LISTAS" },                // D: Origen
  { col: 13, listSheet: "DEPENDENCIAS" },         // M: Jurisdicción
  { col: 14, listSheet: "RESULTADOS" },           // N: Resultado
  { col: 15, listSheet: "SUPERVISOR" },           // O: Supervisor
  { col: 16, listSheet: "SUPADMINISTRATIVO" },    // P: Sup Admin
  { col: 17, listSheet: "OPERADOR" },             // Q: Operador
  { col: 18, listSheet: "OPERADOR/S/N" },         // R: Operador Evento
  { col: 19, listSheet: "EFECTIVOS POLICIALES" }, // S: Efectivo
  { col: 20, listSheet: "TRANSMITE EVENTO" }      // T: Transmite
];

function aplicarDesplegables(ss) {
  const hoy = new Date();
  const mesActual = MESES[hoy.getMonth()] + " " + hoy.getFullYear().toString().slice(-2);
  const hojas = [mesActual, "D08", "D07", "D06", "D05", "D04", "D03", "D02", "D01"];
  
  hojas.forEach(nombreHoja => {
    const hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return;
    
    const lastRow = hoja.getLastRow();
    if (lastRow <= 1) return;
    
    DROPDOWNS.forEach(dropdown => {
      try {
        const hojaLista = ss.getSheetByName(dropdown.listSheet);
        if (!hojaLista) {
          Logger.log("    ⚠️ Hoja de validación no existe: " + dropdown.listSheet);
          return;
        }
        
        const lastRowLista = hojaLista.getLastRow();
        if (lastRowLista <= 1) {
          Logger.log("    ⚠️ Hoja de validación vacía: " + dropdown.listSheet + " (lastRow=" + lastRowLista + ")");
          return;
        }
        
        // BUSCAR LA COLUMNA CON DATOS (por si no están en columna 1)
        let columnaDatos = 1;
        const todasLasColumnas = hojaLista.getRange(2, 1, Math.min(5, lastRowLista - 1), 10).getValues();
        for (let col = 0; col < 10; col++) {
          let hayDatos = false;
          for (let row = 0; row < todasLasColumnas.length; row++) {
            if (todasLasColumnas[row][col] && todasLasColumnas[row][col].toString().trim() !== "") {
              hayDatos = true;
              break;
            }
          }
          if (hayDatos) {
            columnaDatos = col + 1;
            break;
          }
        }
        
        // Verificar datos en la columna encontrada
        const datosValidacion = hojaLista.getRange(2, columnaDatos, lastRowLista - 1, 1).getValues();
        const valoresCount = datosValidacion.filter(v => v[0] && v[0].toString().trim() !== "").length;
        
        if (valoresCount === 0) {
          Logger.log("    ⚠️ " + nombreHoja + " col " + dropdown.col + " - " + dropdown.listSheet + " sin valores");
          return;
        }
        
        const rangoLista = hojaLista.getRange(2, columnaDatos, lastRowLista - 1, 1);
        const rule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(rangoLista, true)
          .setAllowInvalid(true)
          .build();
        
        const rango = hoja.getRange(2, dropdown.col, lastRow - 1, 1);
        rango.setDataValidation(rule);
        Logger.log("    ✅ " + nombreHoja + " col " + dropdown.col + " (" + dropdown.listSheet + " col " + columnaDatos + ": " + valoresCount + " valores)");
      } catch (e) {
        // Ignorar errores en columnas Formatted Table (no permiten setDataValidation)
        if (e.toString().includes("columnas de tipo")) {
          Logger.log("    ⏭️ " + nombreHoja + " col " + dropdown.col + " - Formatted Table (validación omitida)");
        } else {
          Logger.log("    ❌ Error: " + e);
        }
      }
    });
    SpreadsheetApp.flush();
  });
}

