import os
import csv
import json
from collections import defaultdict

base_dir = os.path.dirname(os.path.abspath(__file__))

# Archivos (el script está dentro de public, los CSV están en el mismo directorio)
archivo_camaras = os.path.join(base_dir, 'Camaras.CSV1 (1).csv')
archivo_siniestros = os.path.join(base_dir, 'SINIESTROS.csv')
archivo_salida = os.path.join(base_dir, 'siniestros_con_ubicacion.geojson')

print("📁 Directorio actual:", os.getcwd())
print("📄 Archivo de cámaras:", archivo_camaras)
print("📄 Archivo de siniestros:", archivo_siniestros)
print("💾 Archivo de salida:", archivo_salida)
print("───────────────────────────────────────")

# --- 1. Leer las ubicaciones de las cámaras ---
camaras = {}
errores_camaras = 0

try:
    with open(archivo_camaras, mode='r', encoding='latin-1') as infile:
        reader = csv.reader(infile, delimiter=',')
        header_camaras = next(reader)
        
        for i, row in enumerate(reader, start=2):
            try:
                if len(row) < 5:
                    continue
                cam_id = int(float(row[4]))
                lat = float(str(row[1]).replace('"', '').replace(',', '.'))
                lon = float(str(row[2]).replace('"', '').replace(',', '.'))
                
                # Debug: mostrar primeras 3 coordenadas
                if len(camaras) < 3:
                    print(f"   Cámara {cam_id}: lat={lat}, lon={lon}")
                camaras[cam_id] = {'lat': lat, 'lon': lon}
            except (ValueError, TypeError, IndexError) as e:
                errores_camaras += 1
except FileNotFoundError:
    print(f"❌ Error: No se encontró {archivo_camaras}")
    exit()

print(f"✅ Cámaras cargadas: {len(camaras)}")
print(f"   IDs disponibles: {min(camaras.keys())} a {max(camaras.keys())}")
print("───────────────────────────────────────")

# --- 2. Procesar TODOS los siniestros y hacer análisis por mes ---
features = []
siniestros_por_mes = defaultdict(int)
camaras_no_encontradas = defaultdict(int)
siniestros_agosto_sin_camara = []

try:
    with open(archivo_siniestros, mode='r', encoding='latin-1') as infile:
        reader = csv.reader(infile, delimiter=',')
        header_siniestros = next(reader)
        print(f"📋 Encabezados: {header_siniestros}")
        print("───────────────────────────────────────")
        
        for i, row in enumerate(reader, start=2):
            # Saltar líneas vacías
            if not row or all(not cell.strip() for cell in row):
                continue
            
            # Verificar columnas mínimas
            if len(row) < 6:
                continue
            
            try:
                cam_id = int(float(row[1]))
                fecha = row[5] if len(row) > 5 else "Sin fecha"
                
                # Extraer mes de la fecha (asumiendo formato DD/MM/YYYY o similar)
                mes = "desconocido"
                if '/' in fecha:
                    partes = fecha.split('/')
                    if len(partes) >= 2:
                        mes = partes[1]  # Mes
                        if mes in ['07', '7']:
                            mes = 'julio'
                        elif mes in ['08', '8']:
                            mes = 'agosto'
                
                # Contar siniestros por mes
                siniestros_por_mes[mes] += 1
                
                # Si la cámara existe, agregar al GeoJSON
                if cam_id in camaras:
                    ubicacion = camaras[cam_id]
                    
                    # VERIFICAR SI LAS COORDENADAS ESTÁN INVERTIDAS
                    # Mar del Plata: lat ≈ -38, lon ≈ -57
                    # Si lat está entre -60 y -55, probablemente está invertido
                    coords_lat = ubicacion['lat']
                    coords_lon = ubicacion['lon']
                    
                    # Detectar si están invertidas (longitud en rango de latitud)
                    if -60 < coords_lat < -55:
                        # Están invertidas, intercambiar
                        coords_lat, coords_lon = coords_lon, coords_lat
                    
                    feature = {
                        'type': 'Feature',
                        'properties': {
                            'id_siniestro': row[0],
                            'id_camara': cam_id,
                            'fecha': fecha,
                            'hora': row[6] if len(row) > 6 else "",
                            'direccion': row[4] if len(row) > 4 else "",
                            'causa': row[8] if len(row) > 8 else "",
                            'participantes_codigos': row[7] if len(row) > 7 else ""
                        },
                        'geometry': {
                            'type': 'Point',
                            'coordinates': [coords_lon, coords_lat]  # GeoJSON: [lon, lat]
                        }
                    }
                    features.append(feature)
                else:
                    # Registrar cámaras no encontradas
                    camaras_no_encontradas[cam_id] += 1
                    if mes == 'agosto':
                        siniestros_agosto_sin_camara.append({
                            'fila': i,
                            'id_camara': cam_id,
                            'fecha': fecha,
                            'direccion': row[4] if len(row) > 4 else ""
                        })
                        
            except (ValueError, TypeError, IndexError) as e:
                continue

except FileNotFoundError:
    print(f"❌ Error: No se encontró {archivo_siniestros}")
    exit()

print("───────────────────────────────────────")
print(f"📊 ANÁLISIS POR MES:")
for mes, cantidad in sorted(siniestros_por_mes.items()):
    print(f"   {mes}: {cantidad} siniestros")
print("───────────────────────────────────────")

print(f"📍 SINIESTROS PROCESADOS EN GEOJSON: {len(features)}")
print("───────────────────────────────────────")

if camaras_no_encontradas:
    print(f"⚠️  CÁMARAS NO ENCONTRADAS ({len(camaras_no_encontradas)} IDs diferentes):")
    top_10 = sorted(camaras_no_encontradas.items(), key=lambda x: x[1], reverse=True)[:10]
    for cam_id, cantidad in top_10:
        print(f"   ID {cam_id}: {cantidad} siniestros sin ubicación")
    print("───────────────────────────────────────")

if siniestros_agosto_sin_camara:
    print(f"🔴 PROBLEMA DETECTADO: {len(siniestros_agosto_sin_camara)} siniestros de AGOSTO sin cámara")
    print(f"   Ejemplos:")
    for ej in siniestros_agosto_sin_camara[:5]:
        print(f"   - Fila {ej['fila']}: Cámara {ej['id_camara']} | {ej['fecha']} | {ej['direccion'][:50]}")
    print("───────────────────────────────────────")

# --- 3. Crear objeto GeoJSON ---
geojson = {
    'type': 'FeatureCollection',
    'features': features
}

# --- 4. Guardar salida ---
with open(archivo_salida, 'w', encoding='utf-8') as outfile:
    json.dump(geojson, outfile, ensure_ascii=False, indent=4)

print(f"✅ Archivo generado: {archivo_salida}")
print("───────────────────────────────────────")