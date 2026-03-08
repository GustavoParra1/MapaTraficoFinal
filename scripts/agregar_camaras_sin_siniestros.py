#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os
import csv
import json

base_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(base_dir)

archivo_camaras = os.path.join(parent_dir, 'public', 'Camaras.CSV1 (1).csv')
archivo_geojson = os.path.join(parent_dir, 'public', 'siniestros_con_ubicacion.geojson')

# Leer GeoJSON
print("📄 Leyendo GeoJSON...")
with open(archivo_geojson, 'r', encoding='utf-8') as f:
    geojson_data = json.load(f)

# Obtener IDs de cámaras que ya están en el GeoJSON
camera_ids_in_geojson = set()
for feature in geojson_data.get('features', []):
    id_cam = feature.get('properties', {}).get('id_camara')
    if id_cam:
        camera_ids_in_geojson.add(id_cam)

print(f"📊 Cámaras en GeoJSON: {len(camera_ids_in_geojson)}")

# Leer todas las cámaras del CSV
camaras_csv = {}
with open(archivo_camaras, mode='r', encoding='latin-1') as infile:
    reader = csv.reader(infile)
    next(reader)  # Skip header
    for row in reader:
        try:
            cam_id = int(float(row[4]))
            lon = float(str(row[1]).replace('"', '').replace(',', '.'))
            lat = float(str(row[2]).replace('"', '').replace(',', '.'))
            direccion = row[3] if len(row) > 3 else "N/A"
            camaras_csv[cam_id] = {'lat': lat, 'lon': lon, 'direccion': direccion}
        except (ValueError, TypeError, IndexError):
            continue

print(f"📊 Cámaras en CSV: {len(camaras_csv)}")

# Encontrar cámaras que están en el CSV pero NO en el GeoJSON
camaras_faltantes = []
for cam_id, cam_data in camaras_csv.items():
    if cam_id not in camera_ids_in_geojson:
        camaras_faltantes.append((cam_id, cam_data))

print(f"🔍 Cámaras SIN siniestros: {len(camaras_faltantes)}")

# Agregar cámaras sin siniestros como features
for cam_id, cam_data in camaras_faltantes:
    feature = {
        "type": "Feature",
        "properties": {
            "id_camara": cam_id,
            "direccion": cam_data['direccion'],
            "tipo": "camera_sin_siniestros"
        },
        "geometry": {
            "type": "Point",
            "coordinates": [cam_data['lon'], cam_data['lat']]
        }
    }
    geojson_data['features'].append(feature)
    print(f"  ✅ Agregada cámara {cam_id} ({cam_data['direccion']})")

# Guardar GeoJSON actualizado
with open(archivo_geojson, 'w', encoding='utf-8') as f:
    json.dump(geojson_data, f, ensure_ascii=False, indent=2)

print(f"\n✅ GeoJSON actualizado: {len(geojson_data['features'])} features totales")
