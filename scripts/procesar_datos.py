import os
import csv
import json

base_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(base_dir)  # Subir un nivel desde scripts/

# ✅ Corregido: los archivos están en public/, un nivel arriba de scripts/
archivo_camaras = os.path.join(parent_dir, 'public', 'Camaras.CSV1 (1).csv')
archivo_siniestros = os.path.join(parent_dir, 'data', 'SINIESTROS.csv')
archivo_salida = os.path.join(parent_dir, 'public', 'siniestros_con_ubicacion.geojson')

print("📁 Directorio actual:", os.getcwd())
print("📄 Archivo de cámaras:", archivo_camaras)
print("📄 Archivo de siniestros:", archivo_siniestros)
print("💾 Archivo de salida:", archivo_salida)
print("───────────────────────────────────────")


# --- 1. Leer las ubicaciones de las cámaras ---
camaras = {}
try:
    with open(archivo_camaras, mode='r', encoding='utf-8-sig') as infile:
        reader = csv.reader(infile)
        header_camaras = next(reader)  # Omitir cabecera
        for row in reader:
            try:
                cam_id = int(float(row[4]))  # Columna 5 → ID
                # ⚠️ NOTA: Las columnas están invertidas en el CSV
                # row[1] etiquetado como "Latitud" pero contiene Longitud
                # row[2] etiquetado como "Longitud" pero contiene Latitud
                lon = float(str(row[1]).replace('"', '').replace(',', '.'))  # En realidad es LON
                lat = float(str(row[2]).replace('"', '').replace(',', '.'))  # En realidad es LAT
                camaras[cam_id] = {'lat': lat, 'lon': lon}
            except (ValueError, TypeError, IndexError):
                continue
except FileNotFoundError:
    print(f"❌ Error: No se encontró el archivo {archivo_camaras}")
    exit()

print(f"✅ Cámaras cargadas: {len(camaras)}")

# --- 2. Procesar los siniestros ---
features = []
try:
    with open(archivo_siniestros, mode='r', encoding='utf-8-sig') as infile:
        reader = csv.reader(infile)
        header_siniestros = next(reader)  # Omitir cabecera
        for row in reader:
            try:
                cam_id = int(float(row[1]))  # Columna 2 → ID cámara
                if cam_id in camaras:
                    ubicacion = camaras[cam_id]
                    feature = {
                        'type': 'Feature',
                        'properties': {
                            'id_siniestro': row[0],
                            'id_camara': cam_id,
                            'fecha': row[5],
                            'hora': row[6],
                            'direccion': row[4],
                            'causa': row[8],
                            'participantes_codigos': row[7]
                        },
                        'geometry': {
                            'type': 'Point',
                            'coordinates': [ubicacion['lon'], ubicacion['lat']]
                        }
                    }
                    features.append(feature)
            except (ValueError, TypeError, IndexError):
                continue
except FileNotFoundError:
    print(f"❌ Error: No se encontró el archivo {archivo_siniestros}")
    exit()

# --- 3. Crear objeto GeoJSON ---
geojson = {
    'type': 'FeatureCollection',
    'features': features
}

# --- 4. Guardar salida ---
with open(archivo_salida, 'w', encoding='utf-8') as outfile:
    json.dump(geojson, outfile, ensure_ascii=False, indent=4)

print("───────────────────────────────────────")
print(f"✅ Proceso completado: {len(features)} siniestros convertidos a GeoJSON.")
print(f"📦 Archivo generado en: {archivo_salida}")
print("───────────────────────────────────────")
