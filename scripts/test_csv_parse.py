#!/usr/bin/env python
# -*- coding: utf-8 -*-
import re
import os

# Simular el parseador CSV de JavaScript
def parseCSV(text):
    lines = text.strip().split('\n')
    if len(lines) < 2:
        return []
    
    # Headers
    headers = lines[0].replace('\ufeff', '').split(',')
    headers = [h.strip().replace('"', '') for h in headers]
    
    result = []
    # Usar regex similar a JavaScript
    regex = r',(?=(?:(?:[^"]*"){2})*[^"]*$)'
    
    for i in range(1, len(lines)):
        line = lines[i]
        if not line:
            continue
        
        # Split respetando comillas
        values = re.split(regex, line)
        obj = {}
        
        for j, header in enumerate(headers):
            value = values[j] if j < len(values) else ''
            value = value.strip()
            # Remover comillas iniciales y finales
            value = re.sub(r'^"|"$', '', value)
            obj[header] = value.replace('""', '"')
        
        result.append(obj)
    
    return result

# Leer CSV
csv_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'Camaras.CSV1 (1).csv')
with open(csv_path, 'r', encoding='utf-8') as f:
    csv_content = f.read()

# Parsear
cameras = parseCSV(csv_content)

print(f"✅ Cámaras parseadas: {len(cameras)}\n")

# Buscar las 3 cámaras
target_ids = ['754', '756', '762']

for target_id in target_ids:
    print(f"\n{'='*60}")
    print(f"🔍 Cámara: {target_id}")
    print(f"{'='*60}")
    
    for cam in cameras:
        if cam.get('N CAMARA', '').strip() == target_id:
            print(f"✅ Encontrada")
            print(f"   Dirección: {cam.get('Direccion', 'N/A')}")
            print(f"   Barrio: {cam.get('Barrios', 'N/A')}")
            
            # Simular cómo JavaScript procesa las coordenadas
            try:
                lat_str = cam.get('Longitud', '').replace(',', '.')
                lon_str = cam.get('Latitud', '').replace(',', '.')
                lat = float(lat_str)
                lon = float(lon_str)
                
                print(f"   lat (from Longitud): {lat}")
                print(f"   lon (from Latitud): {lon}")
                
                if lat == 0.0 or lon == 0.0:
                    print(f"   ⚠️  Coordenadas son 0!")
                elif (lat < -90 or lat > 90 or lon < -180 or lon > 180):
                    print(f"   ⚠️  Coordenadas fuera de rango global!")
                else:
                    print(f"   ✅ Coordenadas válidas")
            except Exception as e:
                print(f"   ❌ Error parsing: {e}")
            
            break
    else:
        print(f"❌ NO encontrada")
