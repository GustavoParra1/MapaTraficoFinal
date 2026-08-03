// functions/generarInformeCruceIA.js
//
// Cloud Function hermana de generarInformeIA.js, pero para el informe de UN
// CRUCE (radio de análisis puntual, no polígono de barrio). Recibe el mismo
// tipo de objeto que devuelve _calcularDatosCruce() en el cliente, más
// observaciones de campo opcionales (texto + fotos), y le pide a Gemini que
// redacte un informe técnico. Se separa del de barrio a propósito: el
// volumen de datos de un cruce es mucho menor (decenas de siniestros vs.
// cientos), así que forzar la misma estructura de 11 secciones / 6000-9000
// palabras generaría relleno. Acá el informe es más corto y con menos
// secciones (sin Movilidad y Tránsito ni Comparación con Referencias
// externa, porque esos datos no existen a nivel cruce).
//
// Misma API key que el informe de barrio (functions.config().gemini.key),
// mismo modelo, mismas reglas anti-invención — copiadas literal donde
// aplican, porque son las que evitan que Gemini alucine cifras.

const functions = require('firebase-functions/v1');
const cors = require('cors')({ origin: true });

const MODELO_GEMINI = 'gemini-3.1-flash-lite';
const MAX_IMAGENES = 15;

exports.generarInformeCruceIA = functions
  .runWith({ timeoutSeconds: 90, memory: '512MB' })
  .region('us-central1')
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
      }

      try {
        const datos = req.body?.datos;
        const observaciones = (req.body?.observaciones || '').toString().trim();
        const imagenesUrls = Array.isArray(req.body?.imagenesUrls)
          ? req.body.imagenesUrls.slice(0, MAX_IMAGENES)
          : [];

        if (!datos || !datos.nombre) {
          return res.status(400).json({ error: 'Faltan datos del cruce' });
        }
        if (datos.lat === null || datos.lat === undefined || isNaN(datos.lat)) {
          return res.status(400).json({ error: 'El cruce no tiene coordenadas válidas' });
        }

        const apiKey = functions.config().gemini?.key;
        if (!apiKey) {
          console.error('Falta configurar la API key: firebase functions:config:set gemini.key="..."');
          return res.status(500).json({ error: 'Falta configurar la API key de Gemini en el servidor' });
        }

        // --- Descargar las fotos de Storage y pasarlas a base64 para Gemini ---
        const imagenesParts = [];
        for (const url of imagenesUrls) {
          try {
            const imgResp = await fetch(url);
            if (!imgResp.ok) {
              console.warn(`No se pudo descargar imagen (${imgResp.status}): ${url}`);
              continue;
            }
            const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
            const buffer = Buffer.from(await imgResp.arrayBuffer());
            imagenesParts.push({
              inline_data: { mime_type: contentType, data: buffer.toString('base64') }
            });
          } catch (errImg) {
            console.warn(`Error descargando imagen ${url}:`, errImg.message);
          }
        }

        const tieneObservacionesCampo = !!observaciones || imagenesParts.length > 0;
        const prompt = construirPromptCruce(datos, observaciones, imagenesParts.length);

        const parts = [{ text: prompt }, ...imagenesParts];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${apiKey}`;

        const respuesta = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.4,
              // Informe de cruce: mucho más corto que el de barrio (piso de
              // ~1500-2500 palabras vs. 6000-9000), así que con menos margen
              // de salida alcanza. Se deja igual algo de aire por las tablas
              // y por si hay relevamiento de campo con varias fotos.
              maxOutputTokens: 12288
            }
          })
        });

        const data = await respuesta.json();

        if (!respuesta.ok) {
          console.error('Error de la API de Gemini:', JSON.stringify(data));
          return res.status(502).json({
            error: 'La API de Gemini devolvió un error',
            detalle: data?.error?.message || 'sin detalle'
          });
        }

        const textoCrudo = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const texto = normalizarEspacios(textoCrudo);

        if (!texto) {
          console.error('Respuesta vacía de Gemini:', JSON.stringify(data));
          return res.status(502).json({ error: 'La IA no devolvió contenido' });
        }

        return res.status(200).json({
          texto,
          modelo: MODELO_GEMINI,
          imagenesAnalizadas: imagenesParts.length,
          observacionesUsadas: tieneObservacionesCampo
        });
      } catch (err) {
        console.error('Error generando informe IA de cruce:', err);
        return res.status(500).json({ error: 'Error interno generando el informe' });
      }
    });
  });

// Misma normalización de espacios "raros" de Gemini que en el informe de barrio,
// necesaria para que jsPDF no desborde el margen del PDF.
function normalizarEspacios(texto) {
  return texto
    .replace(/[\u00A0\u2000-\u200A\u202F\u3000]/g, ' ')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

function construirPromptCruce(d, observaciones, cantidadImagenes) {
  const tieneImagenes = cantidadImagenes > 0;
  const listaParticipantes = (d.participantes || []).map(p => `${p.nombre} (${p.cant})`).join(', ') || 'sin datos';
  const listaCausas = (d.causas || []).map(c => `${c.nombre} (${c.cant})`).join(', ') || 'sin datos';
  const listaSiniestrosPorAnio = (d.siniestrosPorAnio || []).map(a => `${a.anio}: ${a.cant}`).join(', ') || 'sin datos';
  const listaSiniestrosPorDia = (d.siniestrosPorDia || []).map(x => `${x.dia}: ${x.cant}`).join(', ') || 'sin datos';
  const tieneCampo = !!observaciones || tieneImagenes;

  const bloqueCampo = tieneCampo ? `
NOTAS DE RELEVAMIENTO DE CAMPO PARA "${d.nombre}" (única fuente permitida para afirmaciones sobre infraestructura física, además de lo visible en fotos):
${observaciones ? `Notas escritas por el operador: "${observaciones}"` : 'No se cargaron notas escritas para este relevamiento.'}
${tieneImagenes ? `Se adjuntan ${cantidadImagenes} imagen(es) del relevamiento. ANTES de describir nada, fijate qué tipo de imagen es cada una:
  · Si es una FOTO real tomada en la calle (semáforo, poste, vereda, cartelería, edificación, gente, vehículos, cielo abierto, perspectiva de cámara de celular/mano) → tratala como evidencia de campo y analizala como se indica abajo.
  · Si es una CAPTURA DE PANTALLA del propio sistema CIMU u otra aplicación (mapas con marcadores, tablas de datos, paneles con botones, gráficos de barras, interfaz web) → NO la describas como si fuera infraestructura física real. Esa imagen no es relevamiento de campo, es una captura de los mismos datos que ya tenés en el bloque DATOS DEL CRUCE. Si TODAS las imágenes son de este tipo, decilo explícitamente en la sección 5 y basá esa sección solo en las notas de texto y en los datos cuantitativos, sin inventar una descripción de campo que no existe.
  Instrucción de uso para las fotos reales (si las hay): analizalas una por una, no las resumas en una sola frase genérica. Para cada foto real que aporte algo relevante, describí puntualmente qué elemento de infraestructura muestra (señalización horizontal/vertical, semáforo vehicular o peatonal, iluminación, estado de veredas, obstáculos visuales, edificación circundante) y referenciala explícitamente en el texto. Si dos o más fotos muestran el mismo punto o problema, agrupalas bajo el mismo hallazgo. Si una foto real no aporta nada relevante, no la menciones.` : 'No se adjuntaron fotos para este relevamiento.'}
Restricción estricta: NO describas nada de infraestructura, semáforos, iluminación o entorno urbano que no esté explícitamente en estas notas o sea efectivamente visible en las fotos adjuntas. Si las notas son escuetas o las fotos no muestran algo relevante, decilo así en vez de completar con supuestos.
` : `
No se cargaron notas de relevamiento de campo ni fotos para "${d.nombre}" en esta ocasión. La sección de factores de riesgo y campo debe basarse solo en lo que puede inferirse de los datos cuantitativos, aclarando explícitamente que no hubo relevamiento físico in situ para este informe.
`;

  return `
Sos un analista senior de seguridad vial y urbana redactando un INFORME TÉCNICO sobre UN CRUCE PUNTUAL: "${d.nombre}", a partir de los datos reales que te paso más abajo (sistema CIMU: siniestros, cámaras públicas y privadas, colegios, robos de automotor, todo filtrado dentro de un radio de ${d.radioMetros} metros alrededor de las coordenadas del cruce) y, si están disponibles, notas y fotos de un relevamiento de campo.

ACLARACIÓN CRÍTICA DE ESCALA — leé esto antes de escribir nada: este NO es un informe de barrio. Es el análisis de una intersección puntual con un radio de ${d.radioMetros}m, así que los volúmenes de datos son necesariamente chicos (unidades o decenas, no cientos). Un cruce con pocos siniestros en términos absolutos puede seguir siendo objetivamente peligroso si esos siniestros están muy concentrados en un punto tan chico — y a la inversa, no asumas que un número bajo significa "cruce seguro". El sistema NO calculó un puntaje de criticidad 0-100 para este cruce (a diferencia de los informes de barrio): NO inventes ni menciones un puntaje de criticidad numérico. Si querés caracterizar la gravedad, hacelo en términos cualitativos y siempre anclado a los datos concretos provistos (ej. "la totalidad de los siniestros registrados en el radio ocurrieron en la franja X"), nunca con una escala o número que no te haya sido provisto.

FORMATO DE SALIDA — protocolo técnico obligatorio, un script lo parsea automáticamente para armar un PDF:

- Cada sección principal empieza con una línea que arranca con "# " seguido del número y el título en mayúsculas. Ejemplo: "# 1. INTRODUCCION Y CONTEXTO DEL CRUCE"
- Las subsecciones (cuando correspondan) arrancan con "## " seguido del número decimal y el título.
- Los párrafos van en texto plano corrido, sin asteriscos ni negrita.
- Las listas van con "- " al principio de cada ítem, una por línea.
- Las tablas van en este formato exacto:
TABLA: Título descriptivo de la tabla
Columna1 | Columna2 | Columna3
valor fila1 col1 | valor fila1 col2 | valor fila1 col3
FIN_TABLA
  (la primera fila después del título es siempre el encabezado; usá SOLO datos reales provistos; máximo 6 columnas y 8 filas por tabla; "FIN_TABLA" es OBLIGATORIO al cerrar cada tabla, sin excepción)
- Una cita o dato destacado va en una línea que arranca con "> ". Usala con moderación, como máximo 1 por informe, para el dato más contundente.
- No uses "#" para nada que no sea encabezado de sección, ni "##" para nada que no sea subsección.

ESTRUCTURA OBLIGATORIA — exactamente estas 9 secciones, en este orden, con estos números y títulos tal cual (podés agregar subsecciones "## N.N" propias donde el contenido real lo amerite; no inventes subsecciones vacías):

# 1. INTRODUCCION Y CONTEXTO DEL CRUCE
# 2. FUENTES DE DATOS Y METODOLOGIA
# 3. DIAGNOSTICO DE SINIESTRALIDAD
# 4. COBERTURA Y VIDEOVIGILANCIA
# 5. FACTORES DE RIESGO Y OBSERVACIONES DE CAMPO
# 6. ROBOS DE AUTOMOTOR
# 7. RECOMENDACIONES DE INTERVENCION
# 8. CONCLUSIONES
# 9. FUENTES

Contenido esperado de cada sección:

- 1. INTRODUCCION Y CONTEXTO DEL CRUCE: presentá "${d.nombre}" como objeto del informe, aclarando que el análisis corresponde a un radio de ${d.radioMetros} metros alrededor del punto (no al barrio completo), y un perfil general según el volumen de siniestros registrado. Si hay observaciones de campo, mencioná brevemente que se incorporó relevamiento in situ complementario.

- 2. FUENTES DE DATOS Y METODOLOGIA: describí de dónde sale cada dato (módulo de siniestros del sistema CIMU, red de cámaras públicas y privadas, colegios, robos de automotor${tieneCampo ? ', y relevamiento de campo manual con notas y fotos' : ''}), y explicá explícitamente el criterio de radio: todos los datos corresponden a hechos/elementos ubicados dentro de ${d.radioMetros} metros del punto central del cruce, no al barrio completo. Si algún dato falta, aclararlo acá.

- 3. DIAGNOSTICO DE SINIESTRALIDAD: con subsecciones si el contenido lo amerita (por ejemplo "## 3.1 Evolución histórica", "## 3.2 Causas y patrones horarios", "## 3.3 Participantes involucrados", "## 3.4 Peatones y ciclistas"):
  · Evolución histórica año a año (usá los datos de siniestros por año provistos) y si hay tendencia creciente, decreciente o estable.
  · Relación entre horario crítico y día pico, usando el desglose completo por día de semana provisto (no solo el día con más siniestros).
  · Causas más frecuentes, participantes, y porcentaje de siniestros sin causa determinada (NSD) sobre el total del cruce.
  · Subsección de peatones y ciclistas: cuántos siniestros del total involucraron a cada uno, y qué implica esa proporción en un cruce puntual — sin inventar detalles de infraestructura que no estén en los datos o notas de campo.
  Incluí al menos una TABLA con la evolución de siniestros por año (si hay más de un año con datos) y otra con causas o participantes. No fuerces una tabla si el volumen de datos es demasiado chico para que aporte algo (por ejemplo, un solo año de datos no amerita tabla de evolución; decilo en prosa en ese caso).

- 4. COBERTURA Y VIDEOVIGILANCIA: cámaras públicas y privadas dentro del radio, densidad de cámaras respecto al área del círculo de análisis, % de siniestros con cámara cercana vs. sin cobertura. Interpretá qué implica en capacidad de investigación post-hecho y disuasión puntual sobre ese cruce. IMPORTANTE — aclaración metodológica obligatoria: el dato "% de siniestros con cámara cercana" mide proximidad geográfica dentro del radio de análisis, NO que la cámara efectivamente haya captado el hecho; explicá esta diferencia explícitamente. NO relaciones este punto con el NSD de la sección 3 salvo que los datos provistos muestren esa relación explícitamente cruzando siniestro por siniestro; si no está en los datos, no la plantees ni como hipótesis.

- 5. FACTORES DE RIESGO Y OBSERVACIONES DE CAMPO: sección donde se integra el relevamiento manual si existe. ${bloqueCampo}

- 6. ROBOS DE AUTOMOTOR: cifra de robos de automotor registrada dentro del radio. Podés mencionar la cobertura de cámaras del cruce como dato de contexto, pero NO afirmes correlación causal entre robos y cámaras salvo que los datos provistos incluyan la ubicación geográfica de cada robo — si no está, no la supongas.

- 7. RECOMENDACIONES DE INTERVENCION: a diferencia de un informe de barrio, acá NO hay una lista de recomendaciones pre-calculada por el sistema — tenés que derivarlas vos directamente de los datos de este cruce (cobertura, causa principal, horario crítico, participantes vulnerables). Organizalas con subsecciones "## 7.1 Corto plazo (0-6 meses)", "## 7.2 Mediano plazo (6-18 meses)" según urgencia, en prosa y/o listas con "-". Cada recomendación tiene que estar anclada explícitamente en un dato del bloque de abajo (ej. "dado que el horario más crítico es X..."), nunca en una cifra o franja horaria inventada. Considerá cerrar con una TABLA resumen (columnas: Acción | Plazo | Dato que la justifica).

- 8. CONCLUSIONES: cierre integrador breve que retome el diagnóstico central del cruce, los factores de riesgo más relevantes (incluidos los de campo si los hay) y la recomendación más urgente.

- 9. FUENTES: listá en formato de lista ("- ") las fuentes de datos reales usadas (módulo de siniestros CIMU, red de cámaras, colegios, robos de automotor${tieneCampo ? ', relevamiento de campo manual' : ''}), sin inventar fuentes externas.

Reglas generales:
- Español rioplatense, tono profesional y técnico pero legible.
- No inventes cifras, ubicaciones, nombres de calles ni detalles de infraestructura que no estén en los datos provistos, en las notas de campo o visibles en las fotos adjuntas. Si un dato falta, decilo así ("sin datos disponibles") en vez de inventarlo.
- REGLA DE PRECISIÓN OBLIGATORIA (aplica a todo el informe, especialmente a la sección 7): cualquier día de la semana, franja horaria, porcentaje o cifra que menciones tiene que coincidir textualmente con un valor del bloque "DATOS DEL CRUCE" de más abajo. Está PROHIBIDO combinar o inventar una franja horaria más específica que la provista (por ejemplo: si el dato es "Horario más crítico: 07:00–09:00", NUNCA escribas algo tipo "los martes de 13 a 15hs" si esa combinación día+hora puntual no existe en los datos). Está PROHIBIDO inventar un porcentaje objetivo o meta de cobertura que no sea uno de los que ya te paso explícitamente.
- REGLA ANTI-ESPECULACIÓN (aplica a todo el informe): no uses frases que presenten una interpretación no confirmada como si fuera plausible o razonable — evitá "es posible que", "podría deberse a", "sugiere que", "hipótesis plausible/razonable", o construcciones equivalentes. Cada afirmación tiene que ser (a) un dato directo del bloque "DATOS DEL CRUCE", (b) algo explícitamente visible en las notas/fotos de campo, o (c) una aclaración metodológica neutra. Si no hay dato o evidencia que la respalde, no la escribas, ni siquiera en tono dudoso — omitila directamente.
- REGLA DE CIFRAS COMPARATIVAS: está PROHIBIDO mencionar cualquier porcentaje, promedio, densidad de referencia, ranking o "estándar" que compare este cruce contra otros cruces, contra el barrio, contra "la ciudad" o contra cualquier cosa externa, salvo que ese valor exacto figure textualmente en el bloque "DATOS DEL CRUCE" de más abajo. Esto incluye frases del tipo "por debajo del promedio de la ciudad": si ese promedio no está en los datos provistos, no existe.
- REGLA DE CONSISTENCIA NUMÉRICA: cualquier cifra que menciones más de una vez (cobertura, siniestros totales, % sin cámara, etc.) tiene que ser textualmente idéntica cada vez que aparece — el mismo número, sin redondeos distintos.
- PROHIBIDO INVENTAR UN PUNTAJE DE CRITICIDAD: reiterando la aclaración del inicio, este informe no tiene un puntaje 0-100 calculado por el sistema. No lo inventes ni lo estimes.
- El destinatario ya tiene delante el mapa del sistema centrado en el cruce, así que no describas colores de capas ni digas "como se ve en el mapa" — tu valor es la interpretación analítica (excepto en la sección de campo, donde si hay fotos SÍ describís lo que se ve en ellas).
- Extensión: este es un informe puntual, no uno de barrio — NO fuerces longitud. Como referencia de piso (no de techo): con el volumen de datos que normalmente hay en un radio de ${d.radioMetros}m, un informe bien desarrollado ronda las 1500-2500 palabras. Si el volumen de datos es muy bajo (pocos siniestros, un solo año con datos), es preferible un informe más corto y honesto sobre esa limitación que uno artificialmente largo con relleno. Priorizá el desarrollo en las secciones 3 (Diagnóstico) y 7 (Recomendaciones), que son las de mayor valor analítico.
- ANÁLISIS, no enumeración: para cada dato relevante no te limites a repetirlo tal cual viene — explicá qué implica en términos prácticos y cruzalo con otros datos del mismo bloque cuando la relación sea lógicamente derivable (por ejemplo: la causa más frecuente contra el horario crítico). Nunca inventes el cruce de datos si la información no lo permite — señalalo como limitación en vez de forzar una conclusión.

DATOS DEL CRUCE "${d.nombre}":
- Radio de análisis: ${d.radioMetros} metros alrededor del punto (lat ${d.lat}, lng ${d.lng})
- Siniestros totales registrados dentro del radio: ${d.siniestros}
- Participantes más frecuentes en siniestros: ${listaParticipantes}
- Causas más frecuentes: ${listaCausas}
- Horario más crítico: ${d.horarioCritico}
- Día con más siniestros: ${d.diaMaxSiniestros}
- Siniestros sin causa determinada (NSD): ${d.nsd}
- Siniestros por año: ${listaSiniestrosPorAnio}
- Siniestros por día de la semana (desglose completo): ${listaSiniestrosPorDia}
- Siniestros con peatones involucrados: ${d.siniestrosConPeatones ?? 'sin datos'}
- Siniestros con ciclistas involucrados: ${d.siniestrosConCiclistas ?? 'sin datos'}
- Densidad de cámaras: ${d.densidadCamaras} cada km² (área del círculo de análisis: ${d.areaCamKm2} km²)
- % de siniestros ocurridos con una cámara cercana dentro del radio: ${d.pctSiniConCam}%
- Siniestros sin ninguna cámara cercana: ${d.sinSinCamara}
- Cámaras públicas: ${d.camarasPublicas} | Cámaras privadas registradas: ${d.camarasPrivadas}
- Colegios dentro del radio: ${d.colegios}
- Robos de automotor registrados dentro del radio: ${d.robos}
`.trim();
}
