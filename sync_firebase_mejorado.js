// ============================================================
// SINCRONIZACIÓN DE CAPA NORTE/SUR → GOOGLE SHEET
// ============================================================

const ENCABEZADOS = [
  "Fecha", "ID", "Tipo Evento", "Origen", "Inicio", "Notificación",
  "Policía", "Cierre", "Reporte", "Cámara", "Calle1", "Calle2",
  "Jurisdicción", "Resultado", "Supervisor", "SupAdmin",
  "Operador", "OperadorEvento", "Efectivos", "Transmite", "SincroTime", "Status"
];

const VALIDACIONES = {
  "Tipo Evento": ["Robo", "Violencia", "Accidente", "Congestión", "Evento", "Otras Infracciones"],
  "Origen": ["Llamada 911", "Cámara", "Ciudadano", "Patrulla", "Despacho", "Otro"],
  "Jurisdicción": ["Zona 1", "Zona 2", "Zona 3", "Zona 4", "Zona 5", "Centro"],
  "Resultado": ["Infracción", "Aprehensión", "Advertencia", "Derivación", "Sin Novedad", "Control"],
  "Supervisor": ["Supervisor A", "Supervisor B", "Supervisor C", "Supervisor D"],
  "SupAdmin": ["Admin 1", "Admin 2", "Admin 3"],
  "Operador": ["Operador 1", "Operador 2", "Operador 3", "Operador 4"],
  "OperadorEvento": ["Operador SN 1", "Operador SN 2", "Operador SN 3"],
  "Efectivos": ["Patrulla A", "Patrulla B", "Patrulla C", "Patrulla D", "Patrulla E"],
  "Transmite": ["Sí", "No"]
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Sincronizar")
    .addItem("Sincronizar Ahora", "sincronizarAhora")
    .addToUi();
}

function sincronizarAhora() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoy = new Date();
  const diaActual = ("0" + hoy.getDate()).slice(-2);
  const mesActual = hoy.toLocaleString('es-ES', { month: 'long' }).toUpperCase() + " " + hoy.getFullYear().toString().slice(-2);

  // 1. Obtener datos de capa norte y sur
  let eventos = obtenerEventosDeCapas();
  if (!eventos || eventos.length === 0) {
    SpreadsheetApp.getUi().alert("No hay eventos para sincronizar.");
    return;
  }

  // 2. Crear hoja diaria si no existe
  let hojaDia = ss.getSheetByName("D" + diaActual);
  if (!hojaDia) {
    hojaDia = ss.insertSheet("D" + diaActual);
    hojaDia.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]);
    hojaDia.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight("bold");
    hojaDia.getRange(1, 1, 1, ENCABEZADOS.length).setBackground("#E8E8E8");
  }

  // 3. Crear hoja mensual si no existe
  let hojaMes = ss.getSheetByName(mesActual);
  if (!hojaMes) {
    hojaMes = ss.insertSheet(mesActual);
    hojaMes.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]);
    hojaMes.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight("bold");
    hojaMes.getRange(1, 1, 1, ENCABEZADOS.length).setBackground("#E8E8E8");
  }

  // 4. Insertar eventos en hoja diaria
  eventos.forEach(evento => {
    hojaDia.appendRow(evento);
  });

  // 5. Aplicar validaciones (desplegables) a columnas manuales desde Hoja 1
  const ultimaFila = hojaDia.getLastRow();
  const hoja1 = ss.getSheetByName("Hoja 1");
  
  if (hoja1 && hoja1.getLastRow() > 1) {
    // Leer encabezados de Hoja 1
    const encabezados1 = hoja1.getRange(1, 1, 1, hoja1.getLastColumn()).getValues()[0];
    
    Object.keys(VALIDACIONES).forEach((colName) => {
      let colIdx = ENCABEZADOS.indexOf(colName) + 1;
      let colIdx1 = encabezados1.indexOf(colName) + 1;
      
      if (colIdx > 0 && colIdx1 > 0 && ultimaFila > 1) {
        // Obtener valores únicos de la columna en Hoja 1
        const numFilas = hoja1.getLastRow() - 1;
        if (numFilas > 0) {
          const datosHoja1 = hoja1.getRange(2, colIdx1, numFilas, 1).getValues();
          const valoresUnicos = [...new Set(datosHoja1.map(row => row[0]).filter(v => v && v.toString().trim() !== ""))];
          
          if (valoresUnicos.length > 0) {
            let rango = hojaDia.getRange(2, colIdx, ultimaFila - 1, 1);
            let rule = SpreadsheetApp.newDataValidation()
              .requireValueInList(valoresUnicos, true)
              .setAllowInvalid(true)
              .build();
            rango.setDataValidation(rule);
          }
        }
      }
    });
  }

  // 6. Reordenar y colorear filas
  reordenarYColorear(hojaDia);

  // 7. Copiar filas blancas a hoja mensual
  copiarBlancasAMensual(hojaDia, hojaMes);

  SpreadsheetApp.getUi().alert("Sincronización completada.");
}

function obtenerEventosDeCapas() {
  // Aquí deberías leer los datos de capa norte y capa sur
  // Por ahora, simulo eventos de ejemplo
  return [
    ["08/03/2026", "EVT001", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", new Date().toLocaleString(), "NUEVO"],
    ["08/03/2026", "EVT002", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", new Date().toLocaleString(), "NUEVO"]
  ];
}

function reordenarYColorear(hoja) {
  const lastRow = hoja.getLastRow();
  if (lastRow <= 1) return;
  const datos = hoja.getRange(2, 1, lastRow - 1, ENCABEZADOS.length).getValues();
  const completos = [];
  const incompletos = [];
  datos.forEach(row => {
    let esCompleto = true;
    for (let j = 13; j < 20; j++) { // columnas manuales
      if (!row[j] || row[j].toString().trim() === "") {
        esCompleto = false;
        break;
      }
    }
    if (esCompleto) completos.push(row);
    else incompletos.push(row);
  });
  // Borrar datos
  if (lastRow > 1) hoja.deleteRows(2, lastRow - 1);
  // Re-insertar
  let fila = 2;
  completos.forEach(row => {
    hoja.getRange(fila, 1, 1, ENCABEZADOS.length).setValues([row]);
    hoja.getRange(fila, 1, 1, ENCABEZADOS.length).setBackground("#FFFFFF");
    fila++;
  });
  incompletos.forEach(row => {
    hoja.getRange(fila, 1, 1, ENCABEZADOS.length).setValues([row]);
    hoja.getRange(fila, 1, 1, ENCABEZADOS.length).setBackground("#FFA500");
    fila++;
  });
}

function copiarBlancasAMensual(hojaDia, hojaMes) {
  const lastRow = hojaDia.getLastRow();
  if (lastRow <= 1) return;
  const datos = hojaDia.getRange(2, 1, lastRow - 1, ENCABEZADOS.length).getValues();
  datos.forEach(row => {
    let esCompleto = true;
    for (let j = 13; j < 20; j++) {
      if (!row[j] || row[j].toString().trim() === "") {
        esCompleto = false;
        break;
      }
    }
    if (esCompleto) hojaMes.appendRow(row);
  });
}

// ============================================================
// CREAR HOJAS NECESARIAS
// ============================================================
function crearHojasNecesarias(ss, diaActual, mesActual) {
  const encabezados = ["Fecha", "ID", "Tipo Evento", "Origen", "Inicio", "Notificación", 
                       "Policía", "Cierre", "Reporte", "Cámara", "Calle1", "Calle2", 
                       "Jurisdicción", "Resultado", "Supervisor", "SupAdmin", 
                       "Operador", "OperadorEvento", "Efectivos", "Transmite", "SincroTime", "Status"];
  
  const hojas = [mesActual, "D05", "D06", "D07"];
  
  hojas.forEach(nombre => {
    let hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      hoja.insertRows(1, 1);
      hoja.getRange(1, 1, 1, 22).setValues([encabezados]);
      hoja.getRange(1, 1, 1, 22).setFontWeight("bold");
      hoja.getRange(1, 1, 1, 22).setBackground("#E8E8E8");
      Logger.log("✅ Hoja creada: " + nombre);
    }
  });
}

// ============================================================
// SINCRONIZAR DATOS DESDE FIREBASE (OPTIMIZADO)
// ============================================================
function sincronizarDatos(ss, eventos, diaActual, mesActual) {
  let hoja1 = ss.getSheetByName("Hoja 1");
  const encabezados = [
    "Fecha", "ID", "Tipo Evento", "Origen", "Inicio", "Notificación",
    "Policía", "Cierre", "Reporte", "Cámara", "Calle1", "Calle2",
    "Jurisdicción", "Resultado", "Supervisor", "SupAdmin",
    "Operador", "OperadorEvento", "Efectivos", "Transmite", "SincroTime", "Status"
  ];
  if (hoja1) {
    const lastRow = hoja1.getLastRow();
    // Eliminar solo filas de datos, nunca el encabezado
    if (lastRow > 1) {
      hoja1.deleteRows(2, lastRow - 1);
    }
    // Actualizar encabezado si es incorrecto
    hoja1.getRange(1, 1, 1, 22).setValues([encabezados]);
    hoja1.getRange(1, 1, 1, 22).setFontWeight("bold");
    hoja1.getRange(1, 1, 1, 22).setBackground("#E8E8E8");
  } else {
    hoja1 = ss.insertSheet("Hoja 1");
    hoja1.insertRows(1, 1);
    hoja1.getRange(1, 1, 1, 22).setValues([encabezados]);
    hoja1.getRange(1, 1, 1, 22).setFontWeight("bold");
    hoja1.getRange(1, 1, 1, 22).setBackground("#E8E8E8");
  }
  const hojadia = ss.getSheetByName("D" + diaActual);
  const hojaes = ss.getSheetByName(mesActual);
  
  eventos.forEach((event, idx) => {
    if (!event.id || !event.createdAt) return;
    
    const fechaEvento = new Date(event.createdAt);
    const diaEvento = ("0" + fechaEvento.getDate()).slice(-2);
    const fechaStr = ("0" + fechaEvento.getDate()).slice(-2) + "/" + 
                     ("0" + (fechaEvento.getMonth() + 1)).slice(-2) + "/" + 
                     fechaEvento.getFullYear();
    
    // Dividir dirección
    let calle1 = "", calle2 = "";
    let dir = event.street || event.location || event.address || event.zona || "";
    if (dir.includes(" Y ")) {
      [calle1, calle2] = dir.split(" Y ").map(s => s.trim());
    } else if (dir.includes(" E ")) {
      [calle1, calle2] = dir.split(" E ").map(s => s.trim());
    } else {
      calle1 = dir;
    }
    
    const fila = [
      fechaStr, event.id || "", "", event.notificationType || "", 
      event.followStartTime || "", event.notificationTime || "", 
      event.policeTime || "", event.closureTime || "", 
      event.briefReport || "", event.cameraNumber || "", 
      calle1, calle2, "", "", "", "", "", "", "", "", 
      new Date().toLocaleString(), "NUEVO"
    ];
    
    // Insertar en Hoja 1
    insertarOActualizar(hoja1, fila, event.id);
    
    // Insertar en hoja del día
    if (diaEvento === diaActual) {
      insertarOActualizar(hojadia, fila, event.id);
    }
    
    // Insertar en hoja mensual
    insertarOActualizar(hojaes, fila, event.id);
    
    // Throttle cada 2 eventos
    if (idx % 2 === 0) Utilities.sleep(100);
  });
}

function insertarOActualizar(hoja, fila, id) {
  const lastRow = hoja.getLastRow();
  // Si la hoja está vacía, agregar encabezado
  if (lastRow === 0) {
    const encabezados = [
      "Fecha", "ID", "Tipo Evento", "Origen", "Inicio", "Notificación",
      "Policía", "Cierre", "Reporte", "Cámara", "Calle1", "Calle2",
      "Jurisdicción", "Resultado", "Supervisor", "SupAdmin",
      "Operador", "OperadorEvento", "Efectivos", "Transmite", "SincroTime", "Status"
    ];
    hoja.insertRows(1, 1);
    hoja.getRange(1, 1, 1, 22).setValues([encabezados]);
    hoja.getRange(1, 1, 1, 22).setFontWeight("bold");
    hoja.getRange(1, 1, 1, 22).setBackground("#E8E8E8");
  }

  const datos = lastRow > 1 ? hoja.getRange(2, 1, lastRow - 1, 22).getValues() : [];

  for (let i = 0; i < datos.length; i++) {
    if (datos[i][1] === id) {
      // Actualizar preservando columnas manuales (M-T: índices 12-19)
      for (let j = 12; j < 20; j++) {
        fila[j] = datos[i][j] || "";
      }
      hoja.getRange(i + 2, 1, 1, 22).setValues([fila]);
      return;
    }
  }

  // Insertar nuevo
  hoja.appendRow(fila);
}

// ============================================================
// REORDENAR Y COLOREAR (OPTIMIZADO)
// ============================================================
function reordenarYColorear(ss, diaActual, mesActual) {
  // Solo hojas críticas
  const hojas = ["D" + diaActual, mesActual];
  
  hojas.forEach((nombreHoja, idx) => {
    try {
      const hoja = ss.getSheetByName(nombreHoja);
      if (!hoja) return;
      
      const lastRow = hoja.getLastRow();
      if (lastRow <= 1) return;
      
      const datos = hoja.getRange(2, 1, lastRow - 1, 22).getValues();
      const completos = [];
      const incompletos = [];
      
      datos.forEach(row => {
        let esCompleto = true;
        for (let j = 12; j < 19; j++) {
          if (!row[j] || row[j].toString().trim() === "") {
            esCompleto = false;
            break;
          }
        }
        
        if (esCompleto) completos.push(row);
        else incompletos.push(row);
      });
      
      // Borrar datos
      if (lastRow > 1) {
        hoja.deleteRows(2, lastRow - 1);
      }
      
      // Re-insertar
      let fila = 2;
      
      completos.forEach(row => {
        hoja.getRange(fila, 1, 1, 22).setValues([row]);
        hoja.getRange(fila, 1, 1, 22).setBackground("#FFFFFF");
        fila++;
      });
      
      incompletos.forEach(row => {
        hoja.getRange(fila, 1, 1, 22).setValues([row]);
        hoja.getRange(fila, 1, 1, 22).setBackground("#FFA500");
        fila++;
      });
      
      Logger.log("✅ " + nombreHoja + ": " + completos.length + " blancos, " + incompletos.length + " naranjas");
      
      if (idx === 0) Utilities.sleep(300);
    } catch (e) {
      Logger.log("⚠️ Error en " + nombreHoja + ": " + e.toString());
    }
  });
}

// ============================================================
// CREAR HOJAS DE VALIDACIÓN (OPTIMIZADO)
// ============================================================
function crearValidaciones(ss) {
  Object.keys(VALIDACIONES).forEach((nombreHoja, idx) => {
    let hoja = ss.getSheetByName(nombreHoja);
    
    // Crear hoja si no existe
    if (!hoja) {
      hoja = ss.insertSheet(nombreHoja);
      
      const datos = VALIDACIONES[nombreHoja];
      hoja.getRange(1, 1, 1, 1).setValue("Valor");
      hoja.getRange(1, 1, 1, 1).setFontWeight("bold");
      hoja.getRange(1, 1, 1, 1).setBackground("#D3D3D3");
      
      hoja.getRange(2, 1, datos.length, 1).setValues(datos.map(d => [d]));
      hoja.hideSheet();
      Logger.log("📋 Creada validación: " + nombreHoja);
      
      // Throttle cada 3 validaciones
      if (idx % 3 === 0) Utilities.sleep(100);
    }
  });
}



// ============================================================
// PROTEGER FILAS BLANCAS AL EDITAR
// ============================================================
function onEdit(e) {
  const hoja = e.range.getSheet();
  const fila = e.range.getRow();
  const col = e.range.getColumn();
  try {
    // Obtener color de la fila
    const color = hoja.getRange(fila, 1, 1, 1).getBackground();
    // Si es blanca (completa), revertir cambio
    if (color === "#ffffff" || color === "#ffffff") {
      e.range.setValue(e.oldValue);
      SpreadsheetApp.getUi().toast("❌ Fila blanca (completa) no editable");
      return;
    }
    // Si es naranja (incompleta), permitir solo en columnas manuales (M-T: 13-20)
    if (col < 13 || col > 20) {
      e.range.setValue(e.oldValue);
      SpreadsheetApp.getUi().toast("❌ Columna automática no editable");
    }
  } catch (e) {}
}
