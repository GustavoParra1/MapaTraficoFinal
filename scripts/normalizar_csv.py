import os
base = os.path.dirname(os.path.abspath(__file__))
ruta = os.path.join(os.path.dirname(base), 'data', 'SINIESTROS.csv')

with open(ruta, 'rb') as f:
    lineas = f.read().split(b'\n')

salida = []
n_ansi = 0
for l in lineas:
    try:
        salida.append(l.decode('utf-8'))
    except UnicodeDecodeError:
        salida.append(l.decode('cp1252', errors='replace'))
        n_ansi += 1

with open(ruta, 'w', encoding='utf-8-sig', newline='') as f:
    f.write('\n'.join(salida))

print(f"Listo. Líneas: {len(lineas)} | convertidas desde ANSI: {n_ansi}")