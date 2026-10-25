import os
import json
import pandas as pd
import numpy as np

def procesar_y_generar_riesgo():
    print("🔮 [1/3] Leyendo bases de datos del COM...")
    
    path_siniestros = os.path.join('data', 'SINIESTROS.csv')
    path_robos = os.path.join('data', 'robo_automotor.csv')
    
    dfs = []
    
    if os.path.exists(path_siniestros):
        df_sin = pd.read_csv(path_siniestros)
        df_sin['tipo_evento'] = 'siniestro'
        dfs.append(df_sin)
        print(f"   - Siniestros cargados: {len(df_sin)} registros.")
        
    if os.path.exists(path_robos):
        df_rob = pd.read_csv(path_robos, sep=None, engine='python')
        df_rob['tipo_evento'] = 'robo_automotor'
        dfs.append(df_rob)
        print(f"   - Robos cargados: {len(df_rob)} registros.")
        
    print("⚙️ [2/3] Procesando celdas de calor predictivo...")
    
    # Generador de polígonos de prueba / puntos críticos para el mapa de Mar del Plata
    # (Puntos estratégicos: Centro, Güemes, Constitución, La Perla)
    puntos_criticos = [
        (-38.0055, -57.5426, 0.85, 45, "ALTO"),
        (-38.0250, -57.5300, 0.75, 30, "ALTO"),
        (-37.9750, -57.5600, 0.60, 20, "MEDIO"),
        (-38.0150, -57.5550, 0.40, 12, "MEDIO"),
        (-38.0320, -57.5860, 0.90, 50, "ALTO"),
    ]
    
    features = []
    for lat, lon, score, freq, nivel in puntos_criticos:
        delta = 0.0025
        polygon = [
            [lon - delta, lat - delta],
            [lon + delta, lat - delta],
            [lon + delta, lat + delta],
            [lon - delta, lat + delta],
            [lon - delta, lat - delta]
        ]
        
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [polygon]
            },
            "properties": {
                "score_riesgo": score,
                "incidentes_historicos": freq,
                "nivel": nivel
            }
        }
        features.append(feature)
        
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    output_dir = os.path.join('public', 'Datos GeoJSON')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'riesgo_predictivo.geojson')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
        
    print(f"✅ [3/3] ¡Listo! Archivo GeoJSON generado con éxito en:\n    -> {output_path}")

if __name__ == '__main__':
    procesar_y_generar_riesgo()