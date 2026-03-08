import express from "express";
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import helmet from 'helmet';

// --- CONFIGURACIÓN ---
const app = express();
const PORT = 3003;
const CHECK_INTERVAL = 300000; // 5 minutos

// Seguridad básica: helmet
// Nota: deshabilitamos la política CSP por ahora para permitir la carga
// de librerías externas desde CDNs en desarrollo (Leaflet, Firebase, Google Maps, HLS.js, etc.).
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Helper para obtener __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Lógica de Análisis Geoespacial (copiada del frontend) ---
function isLatLngInMultiPolygon(latlng, multiPolygonCoords) {
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
        var point = [latlng.lng, latlng.lat]; // GeoJSON usa [lng, lat]
        var polygon = polygonCoords.map(coord => [coord[0], coord[1]]);

        if (isPointInPolygon(point, polygon)) {
            return true;
        }
    }
    return false;
}

// --- RUTAS DE API ---
app.get('/analisis-causa', async (req, res) => {
    const { causa } = req.query;
    if (!causa) {
        return res.status(400).json({ error: 'Falta el parámetro "causa".' });
    }

    try {
        // Cargar los datos necesarios
        const siniestrosPath = path.join(__dirname, 'public', 'siniestros_con_ubicacion.geojson');
        const barriosPath = path.join(__dirname, 'public', 'barrios.geojson');

        const [siniestrosData, barriosData] = await Promise.all([
            fs.readFile(siniestrosPath, 'utf-8').then(JSON.parse),
            fs.readFile(barriosPath, 'utf-8').then(JSON.parse)
        ]);

        // Filtrar siniestros por la causa especificada
        const siniestrosFiltrados = siniestrosData.features.filter(
            s => s.properties.causa === causa
        );

        // Realizar análisis
        const participantCounts = {};
        const barrioCounts = {};
        const distribucionHoraria = { 'Mañana (6-12)': 0, 'Tarde (12-19)': 0, 'Noche (19-6)': 0 };

        for (const siniestro of siniestrosFiltrados) {
            const props = siniestro.properties;

            // 1. Contar participantes
            if (props.participantes_codigos) {
                props.participantes_codigos.split('/').forEach(p => {
                    participantCounts[p] = (participantCounts[p] || 0) + 1;
                });
            }

            // 2. Contar por franja horaria
            const hora = parseInt(props.hora?.split(':')[0] || -1);
            if (hora >= 6 && hora < 12) distribucionHoraria['Mañana (6-12)']++;
            else if (hora >= 12 && hora < 19) distribucionHoraria['Tarde (12-19)']++;
            else if (hora >= 19 || hora < 6) distribucionHoraria['Noche (19-6)']++;

            // 3. Contar por barrio (lógica más intensiva)
            if (siniestro.geometry?.coordinates) {
                const latlng = { lat: siniestro.geometry.coordinates[1], lng: siniestro.geometry.coordinates[0] };
                let foundBarrio = false;
                for (const barrio of barriosData.features) {
                    if (isLatLngInMultiPolygon(latlng, barrio.geometry.coordinates)) {
                        const nombreBarrio = barrio.properties.soc_fomen;
                        barrioCounts[nombreBarrio] = (barrioCounts[nombreBarrio] || 0) + 1;
                        foundBarrio = true;
                        break;
                    }
                }
                if (!foundBarrio) {
                     barrioCounts['Fuera de MDP/No identificado'] = (barrioCounts['Fuera de MDP/No identificado'] || 0) + 1;
                }
            }
        }

        // Ordenar resultados para obtener los "top"
        const topParticipantes = Object.entries(participantCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const topBarrios = Object.entries(barrioCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        res.json({
            totalSiniestros: siniestrosFiltrados.length,
            topParticipantes,
            topBarrios,
            distribucionHoraria
        });

    } catch (error) {
        console.error('Error al procesar el análisis de causa:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


// --- CONFIGURACIÓN HLS ---
// Servir archivos HLS con headers correctos
app.get('/streams/:patrolId/:filename', async (req, res) => {
    const { patrolId, filename } = req.params;
    try {
        const streamsDir = path.resolve(__dirname, 'public', 'streams');
        const filePath = path.resolve(streamsDir, patrolId, filename);

        // Validación de seguridad: asegurar que filePath esté dentro de streamsDir
        if (!filePath.startsWith(streamsDir + path.sep) && filePath !== streamsDir) {
            return res.status(403).json({ error: 'Acceso prohibido' });
        }

        // Comprobar existencia y permisos
        try {
            await fs.access(filePath);
        } catch (err) {
            console.error('Archivo HLS no accesible:', filePath, err);
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }

        // Headers para HLS
        if (filename.endsWith('.m3u8')) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filename.endsWith('.ts')) {
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            // Permitir rangos para reproducción eficiente
            res.setHeader('Accept-Ranges', 'bytes');
        }

        res.sendFile(filePath);
    } catch (err) {
        console.error('Error sirviendo stream:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// --- MIDDLEWARE PARA TIPOS MIME CORRECTOS ---
app.use((req, res, next) => {
    if (req.path.endsWith('.css')) {
        res.set('Content-Type', 'text/css; charset=utf-8');
    } else if (req.path.endsWith('.js')) {
        res.set('Content-Type', 'application/javascript; charset=utf-8');
    } else if (req.path.endsWith('.json')) {
        res.set('Content-Type', 'application/json; charset=utf-8');
    }
    next();
});

// --- MIDDLEWARE ANTI-CACHÉ PARA JS Y STREAMS ---
app.use((req, res, next) => {
    if (req.path.endsWith('.js') || req.path.endsWith('.html') || req.path.includes('/streams/')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

// --- SERVIDOR WEB ---
app.use(express.static("public"));
app.listen(PORT, () => {
    console.log(`✅ Servidor web en http://localhost:${PORT}`);
});

// --- WORKER PARA TAREAS EN SEGUNDO PLANO ---
function runNewsWorker() {
    console.log(' Lanzando worker para buscar noticias...');
    const worker = new Worker(path.resolve('worker.js'));

    worker.on('message', (msg) => {
        if (msg === 'done') {
            console.log('✅ Worker terminó la búsqueda de noticias.');
        }
    });

    worker.on('error', (err) => {
        console.error(' Error en el worker de noticias:', err);
    });

    worker.on('exit', (code) => {
        if (code !== 0)
            console.error(`El worker se detuvo con el código de salida ${code}`);
    });
}

// --- INICIO ---
// Ejecuta el worker al inicio y luego cada 5 minutos.
setTimeout(runNewsWorker, 1000); // Espera 1 seg antes de la primera ejecución
setInterval(runNewsWorker, CHECK_INTERVAL);
