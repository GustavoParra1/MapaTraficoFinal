// functions/informeRobosIA.js
//
// Modo "robos" de generarInformeIA: redacta un analisis breve a partir de las cifras que el
// navegador ya calculo (informe-robos.js). La IA SOLO redacta; no calcula.
//
// Seguridad de contenido:
//  - El prompt lo arma el servidor (se ignora cualquier "consigna" que mande el navegador).
//  - Se valida la respuesta: si el texto contiene cifras que no estan en los datos recibidos,
//    se descarta y el PDF sale sin el apartado de IA (mejor sin analisis que con un numero inventado).

const MAX_JSON = 24000;        // tope de caracteres de datos que se le pasan al modelo
const MAX_SIN_RESPALDO = 2;    // cifras "sueltas" toleradas antes de descartar la respuesta
// Si el modelo principal falla (saturado, no responde), la funcion le pregunta a Google que modelos puede usar esta clave y prueba con ellos.
const MAX_INTENTOS = 3;          // intentos en total (entre todos los modelos)
const ESPERA_POR_INTENTO_MS = 25000;  // si un modelo no contesta en este tiempo, se pasa al siguiente

function normalizarEspacios(t) {
  return String(t || '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u3000]/g, ' ')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\*\*/g, '');
}

function construirPromptRobos(datos) {
  const json = JSON.stringify(datos).slice(0, MAX_JSON);
  return `
Sos un analista de seguridad urbana. Redactás un ANÁLISIS BREVE para un equipo operativo de un centro de monitoreo, sobre robos de automotor en Mar del Plata, en español rioplatense y lenguaje simple (oraciones cortas, sin jerga; si usás un término técnico, explicalo en una frase).

Usá EXCLUSIVAMENTE los datos del bloque DATOS. Los números que escribas tienen que aparecer tal cual en DATOS.

FORMATO (un script lo convierte en PDF, seguilo exacto):
- Subtítulos con "## " al principio de la línea.
- Viñetas con "- " al principio, una por línea.
- Una advertencia destacada, como máximo, en una línea que empiece con "> ".
- Texto plano, sin asteriscos, sin negritas, sin emojis, sin flechas, sin tablas.

ESTRUCTURA (exactamente estos tres subtítulos, en este orden):
## Lectura general
## Qué priorizar
## Qué validar antes de decidir

REGLAS OBLIGATORIAS:
- No inventes ni calcules cifras nuevas (nada de sumas, promedios, porcentajes o proyecciones propias). Si querés comparar, usá solo valores que ya estén en DATOS.
- No nombres calles, barrios ni zonas que no estén en DATOS.
- No compares con otras ciudades, promedios nacionales ni "estándares" que no estén en DATOS.
- Si una zona figura con "senalDebil": true, o la muestra es chica ("muestraChica": true), tratá la tendencia como ALERTA y no como prueba.
- La hora es la del aviso, no necesariamente la del hecho.
- El cruce entre robos y hallazgos es por zona, no por vehículo (los datos no traen patente); no afirmes que un hallazgo corresponde a un robo concreto.
- Los sitios para lectores LPR son candidatos a validar en terreno; no afirmes que instalarlos reducirá los robos.
- No uses frases especulativas ("es posible que", "podría deberse a", "sugiere que"). Cada afirmación tiene que ser un dato de DATOS o una aclaración metodológica neutra.
- Si un dato es nulo o falta, decilo: "sin datos".
- Máximo 350 palabras.

GLOSARIO (qué significa cada dato; no lo confundas):
- robos.total: cantidad de robos de automotor del período. porcentajeConDetencion: qué parte terminó con detención.
- robos.franjaPicoDeAviso: franja de 3 horas con más avisos (desdeHora/hastaHora); null = ninguna franja se destaca.
- zonasConMasRobos: zonas con más robos acumulados. tendencia: "sube", "baja" o "estable"; detalleTendencia explica la comparación.
- esquinasConMasRobos: esquinas con más ROBOS. No son hallazgos.
- hallazgosDeVehiculos: autos encontrados (recuperados o secuestrados). No son robos.
- lectoresLPR.robosConLectorCerca: cantidad de ROBOS que ocurrieron cerca de un lector. No es cantidad de lectores ni de puntos.
- lectoresLPR.sitiosCandidatos[].robosQueSumariaDeCobertura: robos adicionales que quedarían cubiertos si se instala un lector ahí. No es cantidad de dispositivos.
- coincidenciasRoboHallazgo: null = NO se pudo evaluar (nunca digas que "no hay coincidencias"); lista vacía = se evaluó y no hay; con elementos = zonas de robos que coinciden con zonas de hallazgos.

REGLAS DE REDACCIÓN ADICIONALES:
- No juzgues si los datos o las tendencias son "válidos", "suficientes" o "confiables". Sobre el tamaño de la muestra, solo repetí lo que diga muestraChica.
- No expliques qué es un lector LPR ni otros términos que el equipo ya conoce.
- En "Qué validar antes de decidir" incluí solo aclaraciones metodológicas y datos faltantes (por ejemplo "sin datos de coincidencias"), no recomendaciones nuevas.
- Mencioná cada dato con su nombre correcto del glosario.
- El GLOSARIO es solo para vos: no lo copies ni lo parafrasees en la respuesta.
- Escribí SIEMPRE con palabras comunes. Está prohibido nombrar campos internos del JSON (nada como robos.total, franjaPicoDeAviso, zonasConMasRobos, muestraChica) ni frases como "es null" o "es false". Decí, por ejemplo, "el total de robos" o "la franja con más avisos".
- Usá viñetas "- " en las tres secciones.
- Cada viñeta de "Qué validar antes de decidir" es una aclaración metodológica breve o un dato faltante; no repitas definiciones ni expliques cómo se calcula cada dato.

DATOS:
${json}
`.trim();
}

/* Cifras (con 2 o mas digitos o con decimales) que aparecen en el texto pero no en los datos. */
function cifrasSinRespaldo(texto, datos) {
  const norm = (s) => String(s).replace(',', '.').replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const re = /\d+(?:[.,]\d+)?/g;
  const permitidas = new Set((JSON.stringify(datos).match(re) || []).map(norm));
  const sueltas = [];
  (String(texto).match(re) || []).forEach((n) => {
    const esEnteroChico = /^\d$/.test(n);             // 0 a 9: cantidades y "3 meses", "3 horas"
    if (esEnteroChico) return;
    if (!permitidas.has(norm(n))) sueltas.push(n);
  });
  return sueltas;
}

const CAMPOS_INTERNOS = /\b(robos\.total|porcentajeConDetencion|franjaPicoDeAviso|desdeHora|hastaHora|porcentajeDeLosAvisos|diasPico|evolucionMensual|zonasConMasRobos|esquinasConMasRobos|hallazgosDeVehiculos|hallazgosCada100Robos|lectoresLPR|robosConLectorCerca|porcentajeDeRobosConLectorCerca|sitiosCandidatos|robosQueSumariaDeCobertura|coincidenciasRoboHallazgo|muestraChica|detalleTendencia|senalDebil)\b|\bes\s+(null|false|true)\b/i;

/* Devuelve null si el texto es confiable, o el motivo del rechazo. */
function validar(texto, datos) {
  if (texto.length < 40) return 'es demasiado corta';
  if (!/^## /m.test(texto)) return 'no respeta el formato con subtitulos "## "';
  if (CAMPOS_INTERNOS.test(texto)) return 'muestra nombres internos de los datos (como robos.total o muestraChica) o dice "es null/false"; escribi con palabras comunes';
  if (datos.coincidenciasRoboHallazgo === null && /no (existen|hay|se registran) coincidencias|sin coincidencias/i.test(texto)) return 'afirma que no hay coincidencias cuando no se pudieron evaluar (decir "sin datos")';
  if (/(son|resultan|siendo) v[aá]lidas|(sin|no presenta[n]?) restricciones de tama/i.test(texto)) return 'emite un juicio sobre la validez o el tamano de la muestra';
  const sueltas = cifrasSinRespaldo(texto, datos);
  if (sueltas.length > MAX_SIN_RESPALDO) return 'incluye cifras que no estan en los datos: ' + sueltas.join(', ');
  if (sueltas.length) console.warn('Gemini (robos): cifras sin respaldo toleradas:', sueltas.join(', '));
  return null;
}

async function pedir(prompt, modelo, apiKey, doFetch) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
  try {
    const resp = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 4096 } }),
      signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(ESPERA_POR_INTENTO_MS) : undefined
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error('Gemini (robos) devolvio error:', JSON.stringify(data));
      const e = data && data.error ? data.error : {};
      return { error: `Gemini respondio ${e.code || resp.status} ${e.status || ''} ${String(e.message || '').slice(0, 100)}`.replace(/\s+/g, ' ').trim() };
    }
    return { texto: normalizarEspacios(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim() };
  } catch (err) {
    console.error('Gemini (robos) fallo la conexion:', err && err.message);
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) return { error: `no respondio en ${ESPERA_POR_INTENTO_MS / 1000} segundos` };
    return { error: 'no se pudo conectar con Gemini: ' + (err && err.message ? err.message : err) };
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- descubrimiento de modelos disponibles para esta clave ---- */
const CACHE_MS = 10 * 60 * 1000;
let cacheModelos = { t: 0, lista: [] };

function puntajeModelo(nombre) {
  const v = nombre.match(/gemini-(\d+(?:\.\d+)?)/);
  let p = (v ? parseFloat(v[1]) : 0) * 100;
  if (/lite/.test(nombre)) p -= 30;          // los "lite" se saturan mas
  if (/preview|exp/.test(nombre)) p -= 150;  // preferir versiones estables
  return p;
}

/* Devuelve nombres de modelos Gemini "flash" aptos para generar texto, de mejor a peor. */
async function descubrirModelos(apiKey, doFetch) {
  if (cacheModelos.lista.length && Date.now() - cacheModelos.t < CACHE_MS) return cacheModelos.lista;
  try {
    const resp = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${apiKey}`, {
      signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(10000) : undefined
    });
    const data = await resp.json();
    if (!resp.ok) { console.error('Gemini (robos): no se pudo listar modelos:', JSON.stringify(data)); return []; }
    const lista = (data.models || [])
      .filter((m) => /^models\/gemini-/.test(m.name) && /flash/.test(m.name)
        && (m.supportedGenerationMethods || []).includes('generateContent')
        && !/(image|tts|audio|live|embedding|computer|robotics|vision|thinking|learnlm)/.test(m.name))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort((a, b) => puntajeModelo(b) - puntajeModelo(a));
    cacheModelos = { t: Date.now(), lista };
    return lista;
  } catch (err) {
    console.error('Gemini (robos): fallo al listar modelos:', err && err.message);
    return [];
  }
}

/* Devuelve { texto, motivos }. texto es null si no se logra una respuesta confiable;
   motivos explica que paso en cada intento, para mostrarlo en el aviso del informe.
   - Si un modelo falla por la API (saturado, no existe, no responde), se buscan otros modelos habilitados y se pasa al siguiente.
   - Si el modelo responde pero el texto no pasa las validaciones, se reintenta con el mismo modelo (una sola vez). */
async function redactarRobos({ datos, apiKey, modelo, fetchFn }) {
  const motivos = [];
  if (!datos || typeof datos !== 'object' || !datos.robos || !datos.filtros) return { texto: null, motivos: ['los datos del informe llegaron incompletos'] };
  const doFetch = fetchFn || fetch;
  let modelos = [modelo], descubierto = false, m = 0, aviso = '', rechazos = 0;
  for (let intento = 1; intento <= MAX_INTENTOS && m < modelos.length; intento++) {
    const nombre = modelos[m];
    const r = await pedir(construirPromptRobos(datos) + aviso, nombre, apiKey, doFetch);
    if (r.error) {
      motivos.push(`intento ${intento} (${nombre}): ${r.error}`);
      if (!descubierto) {
        descubierto = true;
        const otros = (await descubrirModelos(apiKey, doFetch)).filter((x) => x !== modelo).slice(0, 2);
        if (otros.length) { modelos = [modelo].concat(otros); motivos.push(`modelos de respaldo habilitados para esta clave: ${otros.join(', ')}`); }
        else { modelos = [modelo, modelo, modelo]; motivos.push('no se encontraron modelos de respaldo; se reintenta con el principal'); }
      }
      m++; await esperar(1000); continue;
    }
    if (!r.texto) { motivos.push(`intento ${intento} (${nombre}): respuesta vacia`); m++; continue; }
    const motivo = validar(r.texto, datos);
    if (!motivo) return { texto: r.texto, motivos };
    console.error(`Gemini (robos): intento ${intento} (${nombre}) rechazado: ${motivo}`);
    motivos.push(`intento ${intento} (${nombre}): texto rechazado porque ${motivo}`);
    if (++rechazos >= 2) break;
    aviso = `\n\nCORRECCION OBLIGATORIA: tu respuesta anterior fue rechazada porque ${motivo}. Reescribila cumpliendo todas las reglas.`;
  }
  return { texto: null, motivos };
}

module.exports = { redactarRobos, construirPromptRobos, cifrasSinRespaldo, validar, descubrirModelos, puntajeModelo };
