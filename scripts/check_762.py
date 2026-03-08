#!/usr/bin/env python
# -*- coding: utf-8 -*-
import json
import os

# Ruta del GeoJSON
geojson_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'siniestros_con_ubicacion.geojson')

print("📄 Analizando GeoJSON...")
print(f"📁 Ruta: {geojson_path}\n")

with open(geojson_path, 'r', encoding='utf-8') as f:
    geojson_data = json.load(f)

print(f"✅ Total de features: {len(geojson_data.get('features', []))}\n")

# Buscar cámara 762
print("🔍 Buscando cámara 762...")
found = False

for feature in geojson_data.get('features', []):
    props = feature.get('properties', {})
    if props.get('id_camara') == 762:
        found = True
        print(f"✅ Encontrada cámara 762")
        print(f"\n📋 Propiedades:")
        for key, value in props.items():
            print(f"   {key}: {value}")
        
        coords = feature.get('geometry', {}).get('coordinates', [])
        print(f"\n🗺️  Coordenadas GeoJSON:")
        print(f"   lon, lat: {coords}")
        
        if coords:
            print(f"   Latitude: {coords[1]}")
            print(f"   Longitude: {coords[0]}")
        break

if not found:
    print(f"❌ Cámara 762 NO encontrada en GeoJSON")
    
    # Mostrar las últimas 5 cámaras
    print(f"\n📊 Últimas 5 features:")
    for i, feature in enumerate(geojson_data.get('features', [])[-5:]):
        props = feature.get('properties', {})
        id_cam = props.get('id_camara')
        print(f"   {i}: Cámara {id_cam}")
