#!/usr/bin/env node
/**
 * Script para corregir Camaras.csv
 * Invierte las columnas de Latitud y Longitud
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CSV line
function parseCSV(line) {
  const cols = [];
  let col = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      col += char;
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

// Generar CSV line
function generateCSV(cols) {
  return cols.map(col => {
    if (col.includes(',') || col.includes('"') || col.includes('\n')) {
      return `"${col.replace(/"/g, '""')}"`;
    }
    return col;
  }).join(',');
}

const filepath = path.join(__dirname, 'data', 'Camaras.csv');
const content = fs.readFileSync(filepath, 'utf-8');
const lines = content.split('\n');

const corrected = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) {
    corrected.push(line);
    continue;
  }
  
  const cols = parseCSV(line);
  
  if (i === 0) {
    // Header: invertir "Latitud" y "Longitud"
    if (cols[1].includes('Latitud') && cols[2].includes('Longitud')) {
      console.log('📝 Invertiendo encabezados...');
      [cols[1], cols[2]] = [cols[2], cols[1]];
    }
  } else {
    // Data: invertir valores
    if (cols.length >= 3) {
      [cols[1], cols[2]] = [cols[2], cols[1]];
    }
  }
  
  corrected.push(generateCSV(cols));
}

fs.writeFileSync(filepath, corrected.join('\n'));
console.log(`✅ Archivo corregido: ${filepath}`);
console.log('📊 Latitud y Longitud invertidas correctamente');
