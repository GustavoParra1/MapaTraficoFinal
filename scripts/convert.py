from togeojson import kml
from pathlib import Path
import json

kml_file = Path('CORREDORES ESCOLARES.kml')
kml_content = kml_file.read_text(encoding='utf-8')
geojson_data = kml(kml_content)

output_path = Path('public') / (kml_file.stem + '.geojson')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(geojson_data, f, ensure_ascii=False, indent=4)

print(f"Archivo convertido y guardado en: {output_path}")