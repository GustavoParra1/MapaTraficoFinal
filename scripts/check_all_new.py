#!/usr/bin/env python
# -*- coding: utf-8 -*-
import json
import os

geojson_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'siniestros_con_ubicacion.geojson')

with open(geojson_path, 'r', encoding='utf-8') as f:
    geojson_data = json.load(f)

target_ids = [754, 756, 762, 755]

print(f"✅ Total features: {len(geojson_data.get('features', []))}\n")
print("🔍 Verificando cámaras nuevas:\n")

for target_id in target_ids:
    found = False
    
    for feature in geojson_data.get('features', []):
        props = feature.get('properties', {})
        if props.get('id_camara') == target_id:
            found = True
            coords = feature.get('geometry', {}).get('coordinates', [])
            print(f"✅ Cámara {target_id}")
            print(f"   Coordenadas: [lon={coords[0]}, lat={coords[1]}]")
            print(f"   Dirección: {props.get('direccion')}")
            print()
            break
    
    if not found:
        print(f"❌ Cámara {target_id} NO encontrada\n")
