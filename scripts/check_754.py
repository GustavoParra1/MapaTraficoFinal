import json

# Leer el GeoJSON y verificar cámara 754
with open('../public/siniestros_con_ubicacion.geojson', encoding='utf-8') as f:
    data = json.load(f)

features_754 = [f for f in data['features'] if f['properties']['id_camara'] == 754]
print(f'Cámara 754 en GeoJSON: {len(features_754)} siniestro(s)')

if features_754:
    for f in features_754:
        coords = f['geometry']['coordinates']
        print(f"  Coordenadas: [lon={coords[0]}, lat={coords[1]}]")
        print(f"  Propiedades: {f['properties']}")
else:
    print("❌ Cámara 754 NO encontrada en GeoJSON")

# Verificar también cámara 762 y 756 para comparar
for cam_id in [762, 756]:
    features = [f for f in data['features'] if f['properties']['id_camara'] == cam_id]
    print(f'\nCámara {cam_id} en GeoJSON: {len(features)} siniestro(s)')
    if features:
        coords = features[0]['geometry']['coordinates']
        print(f"  Coordenadas: [lon={coords[0]}, lat={coords[1]}]")
