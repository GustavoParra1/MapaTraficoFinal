import os
import csv
import json

base_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(base_dir)

archivo_camaras = os.path.join(parent_dir, 'public', 'Camaras.CSV1 (1).csv')
archivo_siniestros = os.path.join(parent_dir, 'public', 'SINIESTROS.csv')
archivo_geojson = os.path.join(parent_dir, 'public', 'siniestros_con_ubicacion.geojson')

# Ver las últimas 3 cámaras
print("=" * 60)
print("ÚLTIMAS 3 CÁMARAS EN CSV:")
print("=" * 60)
with open(archivo_camaras, encoding='latin-1') as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    rows = list(reader)
    for row in rows[-3:]:
        if row:
            print(f"ID: {row[4]:>6} | Lat: {row[1]:>12} | Lon: {row[2]:>12} | Dir: {row[3][:30]}")

# Ver cuántos siniestros tiene cada una en SINIESTROS.csv
print("\n" + "=" * 60)
print("SINIESTROS POR CÁMARA EN SINIESTROS.CSV:")
print("=" * 60)
ids_nuevas = [762, 756, 754]
siniestros_por_id = {cid: 0 for cid in ids_nuevas}

with open(archivo_siniestros, encoding='latin-1') as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    for row in reader:
        try:
            cam_id = int(float(row[1]))
            if cam_id in siniestros_por_id:
                siniestros_por_id[cam_id] += 1
        except:
            pass

for cid in ids_nuevas:
    print(f"Cámara {cid}: {siniestros_por_id[cid]} siniestros")

# Ver en el GeoJSON cuántos siniestros se generaron 
print("\n" + "=" * 60)
print("SINIESTROS EN GEOJSON GENERADO:")
print("=" * 60)
with open(archivo_geojson, encoding='utf-8') as f:
    geojson = json.load(f)
    siniestros_geojson = {cid: 0 for cid in ids_nuevas}
    
    for feature in geojson['features']:
        cam_id = feature['properties']['id_camara']
        if cam_id in siniestros_geojson:
            siniestros_geojson[cam_id] += 1
            # Mostrar coordenadas del primer siniestro para verificar
            coords = feature['geometry']['coordinates']
            print(f"  Cámara {cam_id}: Coords = [{coords[0]}, {coords[1]}]")

print("\nRESUMEN:")
for cid in ids_nuevas:
    csv_count = siniestros_por_id[cid]
    geo_count = siniestros_geojson[cid]
    print(f"Cámara {cid}: {csv_count} en CSV → {geo_count} en GeoJSON")
