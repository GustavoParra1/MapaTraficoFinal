#!/usr/bin/env node
/**
 * Script para convertir SINIESTROS.csv a GeoJSON
 * Utiliza coordenadas de Camaras.csv
 * MANTIENE la estructura exacta del GeoJSON anterior
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Leer y parsear CSV de cámaras
function loadCamarasData() {
  const filepath = path.join(__dirname, 'data', 'Camaras.csv');
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  
  const camarasMap = {};
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV manualmente
    const cols = [];
    let col = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(col);
        col = '';
      } else {
        col += char;
      }
    }
    cols.push(col);
    
    if (cols.length < 5) continue;
    
    // NOTA: El CSV tiene invertidas las etiquetas!
    // Donde dice "Latitud" (-57...) es LONGITUD
    // Donde dice "Longitud" (-38...) es LATITUD
    const lonStr = cols[1].replace(/"/g, '').replace(',', '.');  // Este es LON (aunque diga "Latitud")
    const latStr = cols[2].replace(/"/g, '').replace(',', '.');  // Este es LAT (aunque diga "Longitud")
    const camId = cols[4].replace(/"/g, '').trim();
    
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    
    if (!isNaN(lat) && !isNaN(lon) && camId) {
      camarasMap[camId] = { lat, lon };
    }
  }
  
  return camarasMap;
}

// Parse CSV line with proper quote handling
function parseCSV(line) {
  const cols = [];
  let col = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cols.push(col);
      col = '';
    } else {
      col += char;
    }
  }
  cols.push(col);
  
  return cols;
}

// Leer y procesar CSV de siniestros
function loadSiniestrosData(camarasMap) {
  const filepath = path.join(__dirname, 'data', 'SINIESTROS.csv');
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  
  const features = [];
  let skipped = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cols = parseCSV(line);
    if (cols.length < 10) continue;
    
    const nOrden = cols[0]?.trim();
    const nCamara = cols[1]?.trim();
    const fecha = cols[5]?.trim();
    const hora = cols[6]?.trim();
    const direccion = cols[4]?.trim();
    const causa = cols[8]?.trim();
    const participantes = cols[7]?.trim();
    
    if (!nOrden || !nCamara || !fecha) {
      continue;
    }
    
    const coords = camarasMap[nCamara];
    if (!coords) {
      skipped++;
      continue;
    }
    
    // Exacta estructura anterior
    const feature = {
      type: 'Feature',
      properties: {
        id_siniestro: nOrden,
        id_camara: parseInt(nCamara),
        fecha: fecha,
        hora: hora,
        direccion: direccion,
        causa: causa || 'NSD',
        participantes_codigos: participantes
      },
      geometry: {
        type: 'Point',
        coordinates: [coords.lon, coords.lat]
      }
    };
    
    features.push(feature);
  }
  
  console.log(`✅ Procesados ${features.length} siniestros (${skipped} sin coords)`);
  return features;
}

// Main
console.log('📍 Cargando cámaras...');
const camarasMap = loadCamarasData();
console.log(`✅ ${Object.keys(camarasMap).length} cámaras cargadas`);

console.log('📊 Procesando siniestros...');
const features = loadSiniestrosData(camarasMap);

const geojson = {
  type: 'FeatureCollection',
  features: features
};

const outputPath = path.join(__dirname, 'public', 'siniestros_con_ubicacion.geojson');
fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 4));

console.log(`✅ GeoJSON: ${outputPath}`);
console.log(`📈 Total: ${features.length} features`);

if (features.length > 0) {
  const fechas = features.map(f => f.properties.fecha).sort();
  console.log(`📅 Rango: ${fechas[0]} a ${fechas[fechas.length - 1]}`);
}
