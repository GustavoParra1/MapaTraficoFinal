"""
Regenera el LineString (trayectoria) de linea221.geojson siguiendo calles reales,
usando el motor de ruteo gratuito OSRM (no requiere API key).

Requisitos:
    pip install requests

Uso:
    python generar_trayectoria_linea221.py linea221.geojson linea221_nuevo.geojson

Qué hace:
    1. Lee los puntos (paradas/cámaras) del geojson, ordenados por la propiedad "orden".
    2. Los manda como waypoints a OSRM (perfil "driving", que es lo que usan los colectivos).
    3. OSRM devuelve una geometría que sigue las calles reales entre esos puntos.
    4. Reemplaza el LineString viejo (el de "conectar los puntos") por el nuevo.
    5. Guarda el resultado, dejando los puntos (Point) intactos.
"""

import sys
import json
import requests

OSRM_URL = "http://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson"


def generar_trayectoria(path_entrada, path_salida):
    with open(path_entrada, encoding="utf-8") as f:
        data = json.load(f)

    puntos = [f for f in data["features"] if f["geometry"]["type"] == "Point"]
    if not puntos:
        raise ValueError("El archivo no tiene features de tipo Point (paradas).")

    # Ordenar por la propiedad 'orden' si existe; si no, dejar el orden original
    puntos.sort(key=lambda f: f["properties"].get("orden", 0))

    # OSRM espera "lon,lat;lon,lat;..." (mismo orden que GeoJSON: [lon, lat])
    coords_str = ";".join(
        f"{p['geometry']['coordinates'][0]},{p['geometry']['coordinates'][1]}"
        for p in puntos
    )

    # OSRM demo público tiene límite de ~100 waypoints por consulta; con 32 sobra
    url = OSRM_URL.format(coords=coords_str)
    print(f"Consultando OSRM con {len(puntos)} waypoints...")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    resultado = resp.json()

    if resultado.get("code") != "Ok" or not resultado.get("routes"):
        raise RuntimeError(f"OSRM no pudo calcular la ruta: {resultado}")

    nueva_geometria = resultado["routes"][0]["geometry"]  # {"type": "LineString", "coordinates": [...]}
    print(f"Ruta calculada: {len(nueva_geometria['coordinates'])} vértices "
          f"(antes: {len(puntos)})")

    # Reemplazar (o insertar) el feature LineString, conservando los Points
    nuevas_features = [f for f in data["features"] if f["geometry"]["type"] != "LineString"]
    linea_ref = puntos[0]["properties"].get("linea", "221")
    nuevas_features.append({
        "type": "Feature",
        "geometry": nueva_geometria,
        "properties": {
            "numero": linea_ref,
            "nombre": f"Línea {linea_ref}",
            "linea": linea_ref
        }
    })
    data["features"] = nuevas_features

    with open(path_salida, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Guardado: {path_salida}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python generar_trayectoria_linea221.py <entrada.geojson> <salida.geojson>")
        sys.exit(1)
    generar_trayectoria(sys.argv[1], sys.argv[2])
