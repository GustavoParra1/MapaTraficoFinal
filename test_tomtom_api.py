#!/usr/bin/env python3
import requests
import json

API_KEY = 'ViFhDo6I00BxfLOvXJBs9yZ20TmYpKC5'
BASE_URL = 'https://api.tomtom.com/search/2/search.json'

# Parámetros comunes
params_base = {
    'key': API_KEY,
    'lat': -38.00042,
    'lon': -57.5562,
    'countrySet': 'AR',
    'limit': 1
}

# Prueba 1: Búsqueda simple
print("=" * 60)
print("🔍 Prueba 1: Buenos Aires, Mar del Plata")
print("=" * 60)
params = {**params_base, 'query': 'Buenos Aires, Mar del Plata'}
response = requests.get(BASE_URL, params=params)
print(f"Status: {response.status_code}")
data = response.json()
if data.get('results'):
    print(f"✅ Resultados: {len(data['results'])}")
    print(f"📍 {data['results'][0]['address']['freeformAddress']}")
    print(f"   Lat: {data['results'][0]['position']['lat']}, Lon: {data['results'][0]['position']['lon']}")
else:
    print(f"❌ Sin resultados")
    if data.get('error'):
        print(f"Error: {data['error'].get('description', 'Unknown error')}")

print()

# Prueba 2: Búsqueda de intersección
print("=" * 60)
print("🔍 Prueba 2: Buenos Aires, Juan B. Justo, Mar del Plata")
print("=" * 60)
params = {**params_base, 'query': 'Buenos Aires, Juan B. Justo, Mar del Plata'}
response = requests.get(BASE_URL, params=params)
print(f"Status: {response.status_code}")
data = response.json()
if data.get('results'):
    print(f"✅ Resultados: {len(data['results'])}")
    print(f"📍 {data['results'][0]['address']['freeformAddress']}")
    print(f"   Lat: {data['results'][0]['position']['lat']}, Lon: {data['results'][0]['position']['lon']}")
else:
    print(f"❌ Sin resultados")
    if data.get('error'):
        print(f"Error: {data['error'].get('description', 'Unknown error')}")
    print(f"Response: {json.dumps(data, indent=2)}")

print()

# Prueba 3: Intersección sin ciudad
print("=" * 60)
print("🔍 Prueba 3: Buenos Aires, Juan B. Justo")
print("=" * 60)
params = {**params_base, 'query': 'Buenos Aires, Juan B. Justo'}
response = requests.get(BASE_URL, params=params)
print(f"Status: {response.status_code}")
data = response.json()
if data.get('results'):
    print(f"✅ Resultados: {len(data['results'])}")
    print(f"📍 {data['results'][0]['address']['freeformAddress']}")
else:
    print(f"❌ Sin resultados")

print()

# Prueba 4: Solo intersección con " y "
print("=" * 60)
print("🔍 Prueba 4: Buenos Aires y Juan B. Justo")
print("=" * 60)
params = {**params_base, 'query': 'Buenos Aires y Juan B. Justo'}
response = requests.get(BASE_URL, params=params)
print(f"Status: {response.status_code}")
data = response.json()
if data.get('results'):
    print(f"✅ Resultados: {len(data['results'])}")
    print(f"📍 {data['results'][0]['address']['freeformAddress']}")
else:
    print(f"❌ Sin resultados")
    print(f"Response: {json.dumps(data, indent=2)}")
