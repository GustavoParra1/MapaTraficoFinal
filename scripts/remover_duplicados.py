import csv

# Leer el CSV completo
with open('../public/Camaras.CSV1 (1).csv', encoding='latin-1') as f:
    reader = csv.reader(f)
    header = next(reader)  # Guardar encabezado
    rows = list(reader)

# IDs a mantener solo la última ocurrencia
ids_nuevas = ['754', '756', '762']

# Buscar índices donde aparecen estos IDs
indices_a_eliminar = []
for cam_id in ids_nuevas:
    # Encontrar TODAS las ocurrencias de este ID
    índices = [i for i, row in enumerate(rows) if row and len(row) > 4 and row[4] == cam_id]
    # Guardar todos MENOS el último (que es la nueva cámara)
    if len(índices) > 1:
        indices_a_eliminar.extend(índices[:-1])

print(f"Eliminaremos {len(indices_a_eliminar)} filas antiguas duplicadas")
for idx in indices_a_eliminar:
    if rows[idx]:
        print(f"  Eliminando: ID {rows[idx][4]} - {rows[idx][3][:40]}")

# Filtrar las filas a eliminar
rows_filtradas = [row for i, row in enumerate(rows) if i not in indices_a_eliminar]

# Escribir CSV limpio
with open('../public/Camaras.CSV1 (1).csv', 'w', encoding='latin-1', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(header)
    writer.writerows(rows_filtradas)

print(f"\n✅ Filas nuevas totales: {len(rows_filtradas)}")
print("✅ CSV actualizado sin duplicados")
