"""
Genera un geojson de trayectoria para una línea de colectivo, separando por RAMAL
cuando la línea tiene más de uno (ej: línea 501 = "Santa Rosa A" + "Santa Rosa C" + "REGIONAL").

A diferencia del script anterior (que conectaba todos los puntos del geojson existente
como si fueran un solo recorrido), este lee directamente el CSV fuente
("Recorrido lineas Colectivos - tabla colectivos (1).csv"), que tiene las columnas
Orden, Linea Colectivo, Ramal, Nº Camara, Latitud, Longitud, Direccion — y arma
UNA trayectoria (LineString) por cada Ramal, ruteada por calles reales con OSRM.

Requisitos:
    pip install requests

Uso:
    python generar_trayectoria_por_linea.py <numero_linea> <csv_entrada> <geojson_salida>

Ejemplo:
    python generar_trayectoria_por_linea.py 501 "Recorrido lineas Colectivos - tabla colectivos (1).csv" linea501_nuevo.geojson
"""

import sys
import csv
import json
import time
import requests

OSRM_URL = "http://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson"


def leer_paradas_por_ramal(path_csv, numero_linea):
    with open(path_csv, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        filas = [row for row in reader if row["Linea Colectivo"].strip() == str(numero_linea)]

    if not filas:
        raise ValueError(f"No se encontraron filas para la línea {numero_linea} en el CSV.")

    # Ordenar por 'Orden' cuando existe; si viene vacío, usar la posición en el
    # archivo como respaldo (el CSV ya trae las filas en secuencia, aunque a
    # veces falte el número de Orden en algunas filas).
    for idx, row in enumerate(filas):
        row["_orden_valor"] = int(row["Orden"]) if row["Orden"].strip() else None
        row["_posicion_archivo"] = idx
    filas.sort(key=lambda r: r["_orden_valor"] if r["_orden_valor"] is not None else r["_posicion_archivo"])

    ramales = {}
    for row in filas:
        ramal = row["Ramal"].strip() or "principal"
        ramales.setdefault(ramal, []).append(row)
    return ramales


def rutear_ramal(paradas):
    """Dado un listado ordenado de paradas (filas del CSV), devuelve la geometría LineString de OSRM."""
    # Sacar duplicados consecutivos (misma parada repetida seguida no aporta al ruteo)
    # NOTA IMPORTANTE: en este CSV las columnas "Latitud" y "Longitud" están
    # invertidas respecto de su nombre (la columna "Latitud" contiene en realidad
    # la longitud, y viceversa). Se corrige acá para no mandarle a OSRM
    # coordenadas sin sentido (terminaban en medio del océano).
    coords = []
    for p in paradas:
        lon, lat = float(p["Latitud"]), float(p["Longitud"])
        if not coords or coords[-1] != (lon, lat):
            coords.append((lon, lat))

    if len(coords) < 2:
        return None

    coords_str = ";".join(f"{lon},{lat}" for lon, lat in coords)
    url = OSRM_URL.format(coords=coords_str)

    ultimo_error = None
    for intento in range(1, 4):  # hasta 3 intentos
        try:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            resultado = resp.json()
            if resultado.get("code") != "Ok" or not resultado.get("routes"):
                raise RuntimeError(f"OSRM no pudo calcular la ruta: {resultado}")
            return resultado["routes"][0]["geometry"]
        except Exception as e:
            ultimo_error = e
            if intento < 3:
                print(f"    (intento {intento} falló: {e}; reintentando en {intento * 3}s...)")
                time.sleep(intento * 3)
    raise ultimo_error


def generar(numero_linea, path_csv, path_salida):
    ramales = leer_paradas_por_ramal(path_csv, numero_linea)
    print(f"Línea {numero_linea}: {len(ramales)} ramal(es) -> {list(ramales.keys())}")

    features = []

    for nombre_ramal, paradas in ramales.items():
        print(f"  Ruteando ramal '{nombre_ramal}' ({len(paradas)} paradas)...")
        try:
            geometria = rutear_ramal(paradas)
        except Exception as e:
            print(f"  ⚠️  Error ruteando '{nombre_ramal}': {e}")
            geometria = None

        if geometria:
            features.append({
                "type": "Feature",
                "geometry": geometria,
                "properties": {
                    "linea": str(numero_linea),
                    "ramal": nombre_ramal,
                    "nombre": f"Línea {numero_linea} - {nombre_ramal}"
                }
            })
            print(f"  ✅ Ramal '{nombre_ramal}': {len(geometria['coordinates'])} vértices")

        # Agregar también los puntos de parada de este ramal (mismo swap corregido)
        for p in paradas:
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(p["Latitud"]), float(p["Longitud"])]
                },
                "properties": {
                    "linea": str(numero_linea),
                    "ramal": nombre_ramal,
                    "numero_camara": p["Nº Camara"],
                    "direccion": p["Direccion"],
                    "orden": p["_orden_valor"]
                }
            })

        time.sleep(1)  # buena práctica: no saturar el servidor público de OSRM

    salida = {"type": "FeatureCollection", "features": features}
    with open(path_salida, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)
    print(f"Guardado: {path_salida}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print('Uso: python generar_trayectoria_por_linea.py <numero_linea> <csv_entrada> <geojson_salida>')
        sys.exit(1)
    generar(sys.argv[1], sys.argv[2], sys.argv[3])
