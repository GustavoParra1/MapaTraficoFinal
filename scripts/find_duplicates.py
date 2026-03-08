import csv

# Buscar duplicados de IDs
with open('../public/Camaras.CSV1 (1).csv', encoding='latin-1') as f:
    reader = csv.reader(f)
    next(reader)  # skip header
    
    cam_ids = []
    cam_data = {}
    
    for row in reader:
        if row and row[4]:  # Si tiene ID
            cam_id = row[4]
            cam_ids.append(cam_id)
            if cam_id not in cam_data:
                cam_data[cam_id] = []
            cam_data[cam_id].append({
                'lat': row[1],
                'lon': row[2],
                'dir': row[3] if len(row) > 3 else 'N/A'
            })
    
    # Encontrar duplicados
    duplicados = [x for x in set(cam_ids) if cam_ids.count(x) > 1]
    
    if duplicados:
        print(f"❌ IDs DUPLICADOS encontrados: {duplicados}")
        for dup_id in duplicados:
            print(f"\n  ID {dup_id} aparece {cam_ids.count(dup_id)} veces:")
            for idx, data in enumerate(cam_data[dup_id]):
                print(f"    {idx+1}. Lat={data['lat']}, Lon={data['lon']}, Dir={data['dir'][:40]}")
    else:
        print("✅ No hay IDs duplicados")
    
    print(f"\nTotal de cámaras: {len(cam_data)}")
    print(f"ID 756 encontrado: {'SI' if '756' in cam_data else 'NO'}")
