// functions/generarInformeIA.js
//
// Cloud Function que recibe los datos ya calculados de un barrio
// (el mismo objeto que devuelve _calcularDatosBarrio() en el cliente),
// más observaciones de campo opcionales (texto + fotos), y le pide a la
// API GRATUITA de Google Gemini que redacte un informe técnico ejecutivo
// extenso, estructurado por secciones. Devuelve texto plano.
//
// La API key nunca se expone al navegador: vive en la configuración de
// entorno de Firebase Functions (functions.config()) y solo se lee acá,
// del lado del servidor. Se guarda una sola vez con:
//   firebase functions:config:set gemini.key="TU_KEY_ACA"
//
// (Nota: se usa functions.config() en vez de Secret Manager/defineSecret
// a propósito: usar defineSecret dispara un bug conocido del CLI de
// Firebase, "Cannot set CPU on the functions ... because they are GCF
// gen 1", incluso en funciones escritas con sintaxis v1. functions.config()
// evita ese problema por completo y sigue soportado por Firebase.)
//
// Requiere Node 18+ (fetch global ya viene incluido en el runtime de
// Cloud Functions, no hace falta instalar node-fetch).

const functions = require('firebase-functions/v1');
const cors = require('cors')({ origin: true });

// Modelo de la capa gratuita de Gemini. Si en el futuro Google cambia
// el nombre del modelo gratuito, se actualiza solo acá.
// Verificar el modelo vigente en https://ai.google.dev/gemini-api/docs/pricing
const MODELO_GEMINI = 'gemini-3.1-flash-lite';

// Máximo de fotos que se le mandan a Gemini por informe (cuidar costo/latencia).
const MAX_IMAGENES = 15;

exports.generarInformeIA = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
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
          return res.status(400).json({ error: 'Faltan datos del barrio' });
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
        const prompt = construirPrompt(datos, observaciones, imagenesParts.length);

        const parts = [{ text: prompt }, ...imagenesParts];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${apiKey}`;

        const respuesta = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.4,
              // Informe extenso tipo académico (11 secciones, subsecciones, tablas)
              // con análisis cruzado de datos y desglose foto por foto del
              // relevamiento de campo: necesita bastante más margen de salida
              // que el resumen ejecutivo anterior. Si el modelo elegido soporta
              // menos, Gemini lo trunca solo (revisar candidates[0].finishReason
              // === 'MAX_TOKENS' en los logs si un informe sale cortado).
              maxOutputTokens: 32768
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
        console.error('Error generando informe IA:', err);
        return res.status(500).json({ error: 'Error interno generando el informe' });
      }
    });
  });

// Gemini a veces devuelve espacios "no estándar" (NBSP, espacios de ancho fijo
// tipo U+2000-U+200A, espacio estrecho U+202F, BOM/zero-width U+FEFF, etc.).
// jsPDF.splitTextToSize() del lado del cliente solo corta líneas en espacios
// normales (\u0020): si no reconoce esos caracteres como separadores válidos,
// trata el resto de la oración como una sola "palabra" gigante y la línea se
// desborda del margen derecho del PDF. Se normaliza acá, antes de responder,
// para no depender de que el cliente lo maneje.
function normalizarEspacios(texto) {
  return texto
    // NBSP, espacios Unicode de ancho fijo (U+2000–U+200A), espacio estrecho
    // sin separación (U+202F), espacio ideográfico (U+3000) -> espacio normal
    .replace(/[\u00A0\u2000-\u200A\u202F\u3000]/g, ' ')
    // Caracteres de ancho cero (zero-width space/joiner/non-joiner, BOM) -> se eliminan directamente
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

function construirPrompt(d, observaciones, cantidadImagenes) {
  const tieneImagenes = cantidadImagenes > 0;
  const listaParticipantes = (d.participantes || []).map(p => `${p.nombre} (${p.cant})`).join(', ') || 'sin datos';
  const listaCausas = (d.causas || []).map(c => `${c.nombre} (${c.cant})`).join(', ') || 'sin datos';
  const listaPuntosCriticos = (d.puntosCriticos || []).slice(0, 5).map(p => `${p.dir} (${p.cant} siniestros)`).join('; ') || 'sin datos';
  const listaLineas = (d.lineasColectivo || []).map(l => l.ref).join(', ') || 'ninguna registrada';
  const listaRecomendacionesAuto = (d.recomendaciones || []).join(' | ') || 'sin datos';
  const listaSiniestrosPorAnio = (d.siniestrosPorAnio || []).map(a => `${a.anio}: ${a.cant}`).join(', ') || 'sin datos';
  const listaSiniestrosPorDia = (d.siniestrosPorDia || []).map(x => `${x.dia}: ${x.cant}`).join(', ') || 'sin datos';
  const tieneCampo = !!observaciones || tieneImagenes;

  const bloqueCampo = tieneCampo ? `
NOTAS DE RELEVAMIENTO DE CAMPO PARA "${d.nombre}" (única fuente permitida para afirmaciones sobre infraestructura física, además de lo visible en fotos):
${observaciones ? `Notas escritas por el operador: "${observaciones}"` : 'No se cargaron notas escritas para este relevamiento.'}
${tieneImagenes ? `Se adjuntan ${cantidadImagenes} imagen(es) del relevamiento. ANTES de describir nada, fijate qué tipo de imagen es cada una:
  · Si es una FOTO real tomada en la calle (semáforo, poste, vereda, cartelería, edificación, gente, vehículos, cielo abierto, perspectiva de cámara de celular/mano) → tratala como evidencia de campo y analizala como se indica abajo.
  · Si es una CAPTURA DE PANTALLA del propio sistema CIMU u otra aplicación (mapas con marcadores, tablas de datos, paneles con botones, gráficos de barras, interfaz web) → NO la describas como si fuera infraestructura física real ("se observa señalización...", "se observa iluminación..."). Esa imagen no es relevamiento de campo, es una captura de los mismos datos que ya tenés en el bloque DATOS DEL BARRIO. Si TODAS las imágenes son de este tipo, decilo explícitamente en la sección 5 ("no se adjuntaron fotografías físicas del lugar, solo capturas del sistema") y basá esa sección solo en las notas de texto y en los datos cuantitativos, sin inventar una descripción de campo que no existe.
  Instrucción de uso para las fotos reales (si las hay): analizalas una por una, no las resumas en una sola frase genérica tipo "se observó buena señalización". Para cada foto real que aporte algo relevante, describí puntualmente qué elemento de infraestructura muestra (señalización horizontal/vertical, semáforo vehicular o peatonal, iluminación, estado de veredas, obstáculos visuales, edificación circundante, actividad urbana, terrenos baldíos o en abandono, etc.) y referenciala explícitamente en el texto (ej. "En una de las fotografías del cruce se observa..."). Si dos o más fotos muestran el mismo punto o problema, agrupalas bajo el mismo hallazgo en vez de repetirlo. Si una foto real no aporta nada relevante al diagnóstico vial/de seguridad, simplemente no la menciones — no rellenes con descripciones irrelevantes solo para justificar que la analizaste.` : 'No se adjuntaron fotos para este relevamiento.'}
Restricción estricta: NO describas nada de infraestructura, semáforos, iluminación o entorno urbano que no esté explícitamente en estas notas o sea efectivamente visible en las fotos adjuntas. Si las notas son escuetas o las fotos no muestran algo relevante, decilo así en vez de completar con supuestos.
` : `
No se cargaron notas de relevamiento de campo ni fotos para "${d.nombre}" en esta ocasión. La sección de factores de riesgo y campo debe basarse solo en lo que puede inferirse de los datos cuantitativos del sistema (causas, puntos críticos, cobertura), aclarando explícitamente que no hubo relevamiento físico in situ para este informe.
`;

  return `
Sos un analista senior de seguridad vial y urbana redactando un INFORME TÉCNICO EXTENSO, de nivel académico/municipal, sobre el barrio "${d.nombre}", a partir de los datos reales que te paso más abajo (sistema CIMU: siniestros, cámaras, corredores escolares, líneas de colectivo, aforos, robos de automotor) y, si están disponibles, notas y fotos de un relevamiento de campo.

FORMATO DE SALIDA — es un protocolo técnico que tenés que seguir EXACTO porque un script lo parsea automáticamente para armar un PDF. No es "markdown para verse lindo", es sintaxis funcional obligatoria:

- Cada sección principal empieza con una línea que arranca con "# " seguido del número y el título en mayúsculas. Ejemplo: "# 1. INTRODUCCION Y CONTEXTO DEL BARRIO"
- Las subsecciones (cuando correspondan) arrancan con "## " seguido del número decimal y el título. Ejemplo: "## 3.1 Puntos críticos y horarios"
- Los párrafos van en texto plano corrido, sin asteriscos ni negrita.
- Las listas van con "- " al principio de cada ítem, una por línea.
- Las tablas van en este formato exacto, con este delimitador de apertura y cierre:
TABLA: Título descriptivo de la tabla
Columna1 | Columna2 | Columna3
valor fila1 col1 | valor fila1 col2 | valor fila1 col3
valor fila2 col1 | valor fila2 col2 | valor fila2 col3
FIN_TABLA
  (la primera fila después del título es siempre el encabezado de columnas; usá SOLO datos reales provistos, nunca inventados; máximo 6 columnas y 8 filas por tabla)
  IMPORTANTE: "FIN_TABLA" es OBLIGATORIO al cerrar cada tabla, siempre, sin excepción — un script automático depende de esa palabra exacta para saber dónde termina la tabla y seguir con el resto del informe. Nunca omitas esa línea.
- Una cita o dato destacado (para resaltar en un recuadro) va en una línea que arranca con "> ". Usalas con moderación, 1 o 2 por informe, para el dato más contundente del diagnóstico.
- No uses "#" para nada que no sea un encabezado de sección, ni "##" para nada que no sea subsección.

ESTRUCTURA OBLIGATORIA — exactamente estas 11 secciones principales, en este orden, con estos números y títulos tal cual (podés agregar subsecciones "## N.N" propias dentro de cada una, según lo que amerite el contenido real disponible; no inventes subsecciones vacías si no hay contenido para llenarlas):

# 1. INTRODUCCION Y CONTEXTO DEL BARRIO
# 2. FUENTES DE DATOS Y METODOLOGIA
# 3. DIAGNOSTICO DE SINIESTRALIDAD
# 4. COBERTURA Y VIDEOVIGILANCIA
# 5. FACTORES DE RIESGO Y OBSERVACIONES DE CAMPO
# 6. MOVILIDAD Y TRANSITO
# 7. ROBOS DE AUTOMOTOR
# 8. COMPARACION CON REFERENCIAS
# 9. RECOMENDACIONES DE INTERVENCION
# 10. CONCLUSIONES
# 11. FUENTES

Contenido esperado de cada sección (informe extenso, denso, tipo trabajo técnico municipal — no un resumen breve; usá subsecciones "##" para desglosar cuando el contenido lo amerite, como en un informe académico real):

- 1. INTRODUCCION Y CONTEXTO DEL BARRIO: presentá "${d.nombre}" como objeto del informe, su perfil general según los datos disponibles (nivel de criticidad, volumen de siniestros) y por qué amerita este análisis. Si hay observaciones de campo, mencioná brevemente que se incorporó relevamiento in situ complementario.

- 2. FUENTES DE DATOS Y METODOLOGIA: describí brevemente de dónde sale cada dato (módulo de siniestros del sistema CIMU, red de cámaras públicas y privadas, corredores escolares, líneas de colectivo, aforo vehicular${tieneCampo ? ', y relevamiento de campo manual con notas y fotos' : ''}), y sus alcances/limitaciones (por ejemplo, si algún dato es "sin datos", aclararlo acá).

- 3. DIAGNOSTICO DE SINIESTRALIDAD: desarrollo profundo con subsecciones (por ejemplo "## 3.1 Evolución histórica", "## 3.2 Puntos críticos", "## 3.3 Causas y patrones horarios", "## 3.4 Participantes involucrados", "## 3.5 Peatones y ciclistas") analizando:
  · Evolución histórica año a año (usá los datos de siniestros por año provistos) y si hay una tendencia creciente, decreciente o estable a lo largo del período disponible.
  · La relación entre puntos críticos, horario y día pico (usá el desglose completo por día de semana, no solo el día con más siniestros, para poder comentar el patrón semanal completo).
  · Causas más frecuentes, participantes, y el porcentaje de siniestros sin causa determinada (NSD).
  · Una subsección específica sobre peatones y ciclistas: cuántos siniestros del total involucraron a cada uno de estos participantes vulnerables, y qué implica esa proporción en términos de infraestructura peatonal/ciclista (cruces, semáforos, ciclovías) — sin inventar detalles de infraestructura que no estén en los datos o en las notas de campo.
  Buscá y explicá correlaciones plausibles entre estas variables, citando los datos concretos como evidencia. Incluí al menos una TABLA con la evolución de siniestros por año, otra con los puntos críticos y su cantidad de siniestros, y otra con causas o participantes.

- 4. COBERTURA Y VIDEOVIGILANCIA: cobertura de cámaras, densidad respecto al área del barrio, proporción pública/privada, % de siniestros con cámara cercana vs. sin cobertura, y situación de colegios sin cámara. Interpretá qué implica en capacidad de investigación post-hecho y disuasión. IMPORTANTE — aclaración metodológica obligatoria: el dato "% de siniestros con cámara a menos de 100m" mide proximidad geográfica de una cámara, NO que la cámara efectivamente haya captado el hecho; explicá esta diferencia explícitamente, sin afirmar que ese porcentaje implica registro real del evento. NO relaciones este punto con el NSD (siniestros sin causa determinada) de la sección 3 salvo que los datos provistos muestren explícitamente esa relación (por ejemplo, cruzando ubicación de cada siniestro NSD con cobertura real en ese punto); si esa relación no está en los datos, no la plantees ni como hipótesis — quedate solo en la aclaración metodológica de proximidad vs. registro efectivo.

- 5. FACTORES DE RIESGO Y OBSERVACIONES DE CAMPO: esta es la sección donde se integra el relevamiento manual. Organizala en subsecciones según lo que realmente aparezca en las notas/fotos (por ejemplo "## 5.1 Señalización horizontal y vertical", "## 5.2 Semaforización", "## 5.3 Iluminación", "## 5.4 Entorno urbano y edificación", u otras que correspondan al contenido real). ${bloqueCampo}

- 6. MOVILIDAD Y TRANSITO: rol de las líneas de colectivo que atraviesan el barrio y volumen de vehículos aforados, y su relación posible con la siniestralidad y los puntos críticos. Si los datos de aforo o líneas son escasos, decilo explícitamente.

- 7. ROBOS DE AUTOMOTOR: cifra de robos de automotor registrada. Podés mencionar la cobertura de cámaras del barrio como dato de contexto general (por ejemplo, "el barrio tiene X% de cobertura"), pero NO afirmes que las zonas de robo coinciden o no con zonas de menor cobertura, ni ningún tipo de correlación causal entre robos y cámaras, salvo que los datos provistos incluyan explícitamente la ubicación geográfica de cada robo — si esa ubicación no está en los datos, no la supongas ni la insinúes.

- 8. COMPARACION CON REFERENCIAS: esta sección compara al barrio ÚNICAMENTE contra sus propios datos históricos, nunca contra promedios, estándares o "ciudades intermedias" inventados de memoria. Usá la serie de siniestros por año provista para caracterizar la tendencia interna (mejora, empeora o se mantiene respecto a años anteriores) y compará la cobertura de cámaras del barrio (${d.cobertura}%) contra el estándar recomendado por el propio sistema si ese estándar figura en los datos o recomendaciones provistas. PROHIBIDO inventar un porcentaje, promedio o ranking de "otros barrios" o "ciudades similares" que no esté en el bloque de datos. Si no hay datos suficientes para una comparación interna sólida, decilo explícitamente y limitá la sección a describir la evolución temporal disponible.

- 9. RECOMENDACIONES DE INTERVENCION: con subsecciones "## 9.1 Corto plazo (0-6 meses)", "## 9.2 Mediano plazo (6-18 meses)" y "## 9.3 Largo plazo (+18 meses)". Tomá las recomendaciones automáticas del sistema y distribuilas en estos horizontes según urgencia y complejidad, en prosa y/o listas con "-", justificando el criterio de priorización. Podés sumar alguna consideración estratégica adicional que se desprenda del cruce de datos de secciones anteriores (incluida la de campo), siempre sin inventar datos nuevos. Considerá cerrar con una TABLA resumen de acciones (columnas: Acción | Plazo | Impacto esperado).

- 10. CONCLUSIONES: cierre integrador que retome el diagnóstico central, los factores de riesgo más relevantes (incluidos los de campo si los hay) y la prioridad de acción más urgente.

- 11. FUENTES: listá en formato de lista ("- ") las fuentes de datos reales usadas (módulo de siniestros CIMU, red de cámaras, corredores escolares, líneas de colectivo, aforo vehicular${tieneCampo ? ', relevamiento de campo manual' : ''}), sin inventar fuentes externas ni bibliografía que no se haya usado realmente.

Reglas generales:
- Español rioplatense, tono profesional y técnico pero legible.
- No inventes cifras, ubicaciones, nombres de calles ni detalles de infraestructura que no estén en los datos provistos, en las notas de campo o visibles en las fotos adjuntas. Si un dato falta, decilo así ("sin datos disponibles") en vez de inventarlo.
- REGLA DE PRECISIÓN OBLIGATORIA (aplica a todo el informe, especialmente a la sección 9 de recomendaciones): cualquier día de la semana, franja horaria, calle, cruce, porcentaje o cifra que menciones tiene que coincidir textualmente con un valor del bloque "DATOS DEL BARRIO" de más abajo, o con una de las "Recomendaciones ya calculadas por el sistema". Está PROHIBIDO combinar o inventar una franja horaria más específica que la provista (por ejemplo: si el dato es "Horario más crítico: 07-10hs y 17-20hs", NUNCA escribas algo tipo "los martes de 13 a 15hs" — esa combinación día+hora puntual no existe en los datos). Está PROHIBIDO inventar un porcentaje objetivo o meta de cobertura que no sea uno de los que ya te paso explícitamente. Si querés sumar una consideración estratégica adicional que no salga directo de un dato puntual, formulala en términos cualitativos generales (ej. "reforzar la cobertura en el corredor X"), nunca con una cifra, día u horario puntual que no esté en los datos.
- REGLA ANTI-ESPECULACIÓN (aplica a todo el informe): no uses frases que presenten una interpretación no confirmada como si fuera plausible o razonable — evitá "es posible que", "podría deberse a", "sugiere que", "hipótesis plausible/razonable", "es imperativo reiterar", "cabe destacar que esto implicaría", "señala una posible", o construcciones equivalentes. Cada afirmación tiene que ser (a) un dato directo del bloque "DATOS DEL BARRIO", (b) algo explícitamente visible en las notas/fotos de campo, o (c) una aclaración metodológica neutra (ej. "este indicador mide X, no Y"). Si no hay dato o evidencia de campo que respalde una idea, no la escribas, ni siquiera en tono dudoso — directamente omitila.
- REGLA DE CIFRAS COMPARATIVAS (aplica a TODAS las secciones, no solo a la 8): está PROHIBIDO mencionar cualquier porcentaje, promedio, densidad de referencia, ranking o "estándar" que compare este barrio contra otros barrios, contra "la ciudad" o contra cualquier cosa externa, salvo que ese valor exacto figure textualmente en el bloque "DATOS DEL BARRIO" o en las "Recomendaciones ya calculadas por el sistema" de más abajo. Esto incluye frases del tipo "X% por debajo del promedio de la ciudad" o "por debajo del promedio urbano": si ese promedio no está en los datos provistos, no existe, no lo calcules ni lo estimes.
- REGLA DE CONSISTENCIA NUMÉRICA: cualquier cifra que menciones más de una vez en el informe (cobertura de cámaras, siniestros totales, % de siniestros sin cámara, etc.) tiene que ser textualmente idéntica cada vez que aparece — el mismo número, sin redondeos distintos ni valores de partida alternativos para hacer una proyección o cálculo. Por ejemplo, si "Cobertura estimada de cámaras" es 15%, no puede aparecer en otra sección como "cobertura actual del 12%" para calcular una proyección: cualquier proyección de cobertura futura tiene que partir explícitamente del mismo 15%, o directamente no incluir esa proyección si el dato de cuántas cámaras nuevas se necesitan no está provisto.
- El destinatario ya tiene delante los mapas y capas del sistema, así que no describas colores de capas ni digas "como se ve en el mapa" — tu valor es la interpretación analítica (excepto en la sección de campo, donde si hay fotos SÍ describís lo que se ve en ellas).
- Extensión: NO hay techo de palabras fijo — no acortes ni resumas para "quedar prolijo". La extensión la determina la cantidad de datos reales y observaciones de campo disponibles: si hay mucho dato, el informe tiene que ser largo y desarrollado; si hay poco, decilo explícitamente en vez de rellenar con paja. Como referencia de piso (no de techo): con el volumen de datos que normalmente se provee acá, un informe bien desarrollado ronda las 6000-9000 palabras, repartido según el peso real de cada sección (las secciones con más datos disponibles, como Diagnóstico de Siniestralidad y Factores de Riesgo, deben ser las más desarrolladas). Si te quedás corto de espacio, priorizá cortar en 8. COMPARACION CON REFERENCIAS antes que en 3, 5 o 9.
- ANÁLISIS PROFUNDO, no enumeración: para cada dato relevante no te limites a repetirlo tal cual viene ("hay 42 siniestros por causa NSD") — explicá qué implica en términos prácticos y cruzalo con otros datos del mismo bloque cuando la relación sea lógicamente derivable de los datos provistos (por ejemplo: cruzar el punto crítico con mayor siniestralidad contra el horario más crítico y el día con más siniestros, o los participantes más frecuentes contra las causas más frecuentes). Nunca inventes el cruce si los datos no lo permiten — en ese caso, señalalo como una limitación del dataset en vez de forzar una conclusión.

DATOS DEL BARRIO "${d.nombre}":
- Nivel de criticidad calculado por el sistema: ${d.criticidad}/100
- Siniestros totales registrados: ${d.siniestros}
- Participantes más frecuentes en siniestros: ${listaParticipantes}
- Causas más frecuentes: ${listaCausas}
- Puntos críticos (mayor concentración de siniestros): ${listaPuntosCriticos}
- Horario más crítico: ${d.horarioCritico}
- Día con más siniestros: ${d.diaMaxSiniestros}
- Siniestros sin causa determinada (NSD): ${d.nsd}
- Siniestros por año: ${listaSiniestrosPorAnio}
- Siniestros por día de la semana (desglose completo): ${listaSiniestrosPorDia}
- Siniestros con peatones involucrados: ${d.siniestrosConPeatones ?? 'sin datos'}
- Siniestros con ciclistas involucrados: ${d.siniestrosConCiclistas ?? 'sin datos'}
- Cobertura estimada de cámaras: ${d.cobertura}%
- Densidad de cámaras: ${d.densidadCamaras} cada km² (área del barrio: ${d.areaCamKm2} km²)
- % de siniestros ocurridos con una cámara a menos de 100m: ${d.pctSiniConCam}%
- Siniestros sin ninguna cámara cercana: ${d.sinSinCamara}
- Cámaras públicas: ${d.camarasPublicas} | Cámaras privadas registradas: ${d.camarasPrivadas}
- Colegios en el barrio: ${d.colegios}, de los cuales sin cámara cercana: ${d.colegiosSinCam}
- Líneas de colectivo que atraviesan el barrio: ${listaLineas}
- Vehículos aforados (conteo de tránsito): ${(d.aforoTotal || 0).toLocaleString('es-AR')}
- Robos de automotor registrados: ${d.robos}
- Recomendaciones ya calculadas por el sistema (para que las reformules y distribuyas por horizonte temporal, no las repitas literal): ${listaRecomendacionesAuto}
`.trim();
}
