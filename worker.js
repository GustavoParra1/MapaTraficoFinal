import fetch from "node-fetch";
import * as cheerio from "cheerio";
import sqlite3 from "sqlite3";
import Parser from 'rss-parser';
import fs from 'fs/promises';
import { parentPort } from 'worker_threads';

// --- PALABRAS CLAVE PARA FILTRAR NOTICIAS ---
const KEYWORDS = ['seguridad', 'robo', 'incendio', 'siniestro vial', 'asesinato', 'arma', 'control de transito', 'hurto', 'secuestro', 'choque', 'vuelco', 'accidente', 'policiales', 'policía', 'detenido', 'detención', 'allanamiento', 'asalto'];
const NEGATIVE_KEYWORDS = ['deporte', 'fútbol', 'espectáculos', 'cultura', 'música', 'cine', 'teatro', 'dólar', 'política', 'elecciones', 'economia', 'liga', 'torneo', 'campeonato'];

// --- CONFIGURACIÓN ---
const TOMTOM_API_KEY = 'ViFhDo6I00BxfLOvXJBs9yZ20TmYpKC5';
const MDP_BOUNDS = {
    minLat: -38.2453163,
    maxLat: -37.6995707,
    minLon: -58.0472758,
    maxLon: -57.5177499
};
// --- BASE DE DATOS ---
const db = new sqlite3.Database('./noticias.db', (err) => {
    if (err) console.error("Error al abrir la base de datos en el worker", err.message);
    else {
        console.log("✅ (Worker) Conectado a la base de datos SQLite.");
        db.serialize(() => {
            // db.run('DELETE FROM noticias');
            db.run('CREATE TABLE IF NOT EXISTS noticias (url TEXT PRIMARY KEY, titulo TEXT, direccion TEXT, lat REAL, lon REAL, timestamp INTEGER)');
            db.run('ALTER TABLE noticias ADD COLUMN timestamp INTEGER', () => {
                const now = Date.now();
                db.run('UPDATE noticias SET timestamp = ? WHERE timestamp IS NULL', [now], () => {
                    console.log('(Worker) Base de datos actualizada con timestamps para alertas antiguas.');
                });
            });
        });
    }
});

// --- FUNCIONES AUXILIARES ---
function isWithinMdpBounds(lat, lon) {
    return lat >= MDP_BOUNDS.minLat && lat <= MDP_BOUNDS.maxLat && lon >= MDP_BOUNDS.minLon && lon <= MDP_BOUNDS.maxLon;
}

async function geocodeAddress(address) {
    const fullAddress = `${address}, Mar del Plata`;
    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(fullAddress)}.json?key=${TOMTOM_API_KEY}&countrySet=AR&limit=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.results && data.results.length > 0) {
            const { lat, lon } = data.results[0].position;
            if (isWithinMdpBounds(lat, lon)) {
                console.log(`📍 (Worker) Dirección geocodificada en MDP: "${address}" -> [${lat}, ${lon}]`);
                return { lat, lon };
            } else {
                console.log(`🚫 (Worker) Coordenadas [${lat}, ${lon}] fuera de Mar del Plata para: "${address}"`);
            }
        } else {
            console.log(`🚫 (Worker) No se encontraron coordenadas para: "${address}"`);
        }
    } catch (error) {
        console.error("(Worker) Error en la geocodificación:", error);
    }
    return null;
}

function isValidAddress(address) {
    if (!address || address.length < 5) return false;
    if (!/.*[a-zA-Z].*/.test(address) || !/(\d|\sy\s)/.test(address)) {
        return false;
    }

    const BANNED_WORDS = ['un', 'una', 'el', 'la', 'los', 'las', 'que', 'se', 'pero', 'sin', 'con', 'del', 'al', 'hombre', 'mujer', 'entrada', 'salida', 'pedido', 'sospecha', 'articulo', 'policia', 'juez', 'fiscal', 'evacuaron', 'herido', 'muerto', 'auto', 'moto'];
    const addressLower = address.toLowerCase();
    const words = addressLower.split(/[\s,]+/);

    const foundBannedWord = words.find(word => BANNED_WORDS.includes(word));
    if (foundBannedWord) {
        return false;
    }

    const commonStreetStarters = ['calle', 'avenida', 'av', 'pasaje', 'ruta', 'bulevar', 'pje', 'bv'];
    if (commonStreetStarters.some(starter => addressLower.startsWith(starter))) return true;
    
    return /\d/.test(address) || /\sy\s/.test(address);
}

function findAddressInText(text) {
    // Regex mejorada para capturar calles, intersecciones, y rutas con KM.
    const regex = /(?:(?:[Aa]venida|[Aa]v\.|[Cc]alle|[Rr]uta|[Aa]u\.)\s+)?([A-ZÁÉÍÓÚÑ][a-zñáéíóú\d]+(?:\s+[A-ZÁÉÍÓÚÑa-zñáéíóú\d]+){0,3})\s+(?:(?:al|altura del|n°|N°)\s+)?(\d{1,5})(?!\d)|([A-ZÁÉÍÓÚÑ][a-zñáéíóú\d]+(?:\s+[A-ZÁÉÍÓÚÑa-zñáéíóú\d]+){0,3})\s+y\s+([A-ZÁÉÍÓÚÑ][a-zñáéíóú\d]+(?:\s+[A-ZÁÉÍÓÚÑa-zñáéíóú\d]+){0,3})|((?:[Rr]uta|[Aa]utovia)\s+\d{1,3})\s+(?:[Kk]m|[Kk]il[oó]metro)\s+(\d{1,4})/g;
    let matches;
    const potentialAddresses = [];

    while ((matches = regex.exec(text)) !== null) {
        let address = '';
        // Calle con altura
        if (matches[1] && matches[2]) {
            address = `${matches[1].trim()} ${matches[2].trim()}`;
        }
        // Intersección de calles
        else if (matches[3] && matches[4]) {
            address = `${matches[3].trim()} y ${matches[4].trim()}`;
        }
        // Ruta y KM
        else if (matches[5] && matches[6]) {
            address = `${matches[5].trim()} km ${matches[6].trim()}`;
        }

        if (address) {
            potentialAddresses.push(address);
        }
    }

    // De la lista de direcciones potenciales, encontrar la más larga y válida
    let bestAddress = null;
    if (potentialAddresses.length > 0) {
        // Ordena para preferir la más larga, que suele ser más específica
        potentialAddresses.sort((a, b) => b.length - a.length);
        for (const addr of potentialAddresses) {
            if (isValidAddress(addr)) {
                bestAddress = addr;
                break; // Usa la primera válida y más larga
            }
        }
    }

    return bestAddress;
}


// --- RSS FEEDS ---
const RSS_FEEDS = [
    'https://lacapitalmdp.com/feed',
    'https://www.infobrisas.com/rss/policiales/',
    'https://ahoramardelplata.com.ar/feed',
    'https://noticiasmdq.com/feed/',
    'https://loquepasa.net/feed/',
    'https://quedigital.com.ar/feed/'
];

// --- LECTURA DE FEEDS Y GENERACIÓN DE ARCHIVO ---
async function buscarNoticiasYGenerarGeoJSON() {
    console.log("\n📰 (Worker) Buscando nuevas noticias de los feeds...");
    const parser = new Parser();

    for (const feedUrl of RSS_FEEDS) {
        try {
            const feed = await parser.parseURL(feedUrl);
            console.log(`\n🔎 (Worker) Leyendo feed: ${feedUrl} (${feed.items.length} artículos)`);

            for (const item of feed.items) {
                const { title, link, content, contentSnippet } = item;
                const url = link;

                const row = await new Promise((resolve, reject) => {
                    db.get('SELECT url FROM noticias WHERE url = ?', [url], (err, row) => {
                        if (err) reject(err);
                        resolve(row);
                    });
                });

                if (!row) {
                    const textToSearch = (title + ' ' + (content || '') + ' ' + (contentSnippet || '')).toLowerCase();
                    const hasKeyword = KEYWORDS.some(keyword => textToSearch.includes(keyword));
                    const hasNegativeKeyword = NEGATIVE_KEYWORDS.some(keyword => textToSearch.includes(keyword));

                    if (hasKeyword && !hasNegativeKeyword) {
                        console.log(`(Worker) Artículo relevante encontrado: "${title}"`);
                        const contentForAddress = cheerio.load(content || contentSnippet || '').text();
                        const address = findAddressInText(contentForAddress);

                        if (address) {
                            console.log(`   - (Worker) Nueva dirección encontrada: "${address}" en artículo: "${title}"`);
                            const coords = await geocodeAddress(address);
                            if (coords) {
                                const timestamp = Date.now();
                                db.run(
                                    'INSERT INTO noticias (url, titulo, direccion, lat, lon, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                                    [url, title, address, coords.lat, coords.lon, timestamp],
                                    (err) => {
                                        if (err) console.error("(Worker) Error insertando en DB:", err.message);
                                        else console.log(`   - (Worker) Alerta guardada en la base de datos.`);
                                    }
                                );
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`(Worker) Error procesando el feed ${feedUrl}:`, error);
        }
    }

    console.log("\n🔄 (Worker) Generando archivo GeoJSON desde la base de datos (últimos 45 días)...");
    const fortyFiveDaysAgo = Date.now() - (45 * 24 * 60 * 60 * 1000);
    db.all('SELECT * FROM noticias WHERE lat IS NOT NULL AND lon IS NOT NULL AND timestamp > ?', [fortyFiveDaysAgo], async (err, rows) => {
        if (err) {
            console.error("(Worker) Error al leer todas las noticias de la DB:", err.message);
            return;
        }

        const alertas = rows.map(row => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [row.lon, row.lat] },
            properties: {
                titulo: row.titulo,
                direccion: row.direccion,
                link: row.url,
                timestamp: row.timestamp
            }
        }));

        const geoJsonCollection = { type: "FeatureCollection", features: alertas };

        try {
                        await fs.writeFile('public/alertas.geojson', JSON.stringify(geoJsonCollection, null, 2));
            console.log(`\n✅ (Worker) Archivo 'alertas.geojson' generado con ${alertas.length} alertas recientes.`);
        } catch (writeErr) {
            console.error("(Worker) Error al escribir el archivo alertas.geojson:", writeErr);
        }
    });
}

// Iniciar la tarea
(async () => {
    await buscarNoticiasYGenerarGeoJSON();
    if (parentPort) {
        parentPort.postMessage('done');
    } else {
        process.exit(0);
    }
})();
