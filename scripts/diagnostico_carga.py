#!/usr/bin/env python
# -*- coding: utf-8 -*-
import csv
import os

# Camino al CSV
csv_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'Camaras.CSV1 (1).csv')

print("📄 Analizando CSV de cámaras...")
print(f"📁 Ruta: {csv_path}\n")

# Leer CSV con csv.DictReader
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    cameras = list(reader)

print(f"✅ Total de cámaras en CSV: {len(cameras)}\n")

# Buscar las 3 cámaras
target_ids = ['754', '756', '762']

for target_id in target_ids:
    print(f"\n{'='*60}")
    print(f"🔍 Buscando cámara: {target_id}")
    print(f"{'='*60}")
    
    found = False
    for i, cam in enumerate(cameras):
        if cam.get('N CAMARA', '').strip() == target_id:
            found = True
            print(f"✅ Encontrada en línea {i+2} del CSV")
            print(f"\n📋 Datos parseados:")
            for key, value in cam.items():
                if key:  # Solo mostrar si hay key
                    print(f"   {key}: '{value}'")
            
            # Intentar parse de coordenadas como lo hace el JavaScript
            try:
                lat_str = cam.get('Longitud', '').replace(',', '.')
                lon_str = cam.get('Latitud', '').replace(',', '.')
                lat = float(lat_str)
                lon = float(lon_str)
                print(f"\n🗺️  Coordenadas parseadas:")
                print(f"   Latitud (from Longitud column): {lat}")
                print(f"   Longitud (from Latitud column): {lon}")
                
                # Verificar si está en rango correcto para Mar del Plata
                if -38.5 < lat < -37.8 and -57.8 < lon < -57.3:
                    print(f"   ✅ Coordenadas válidas para Mar del Plata")
                else:
                    print(f"   ⚠️  Coordenadas fuera de rango esperado!")
            except Exception as e:
                print(f"   ❌ Error al parsear coordenadas: {e}")
            
            break
    
    if not found:
        print(f"❌ Cámara {target_id} NO encontrada en el CSV")

print(f"\n{'='*60}")
print("✅ Diagnóstico completado")
