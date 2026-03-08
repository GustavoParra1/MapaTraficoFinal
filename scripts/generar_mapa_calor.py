
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
import warnings

# Ignorar advertencias futuras de geopandas para mantener la salida limpia
warnings.simplefilter(action='ignore', category=FutureWarning)

def procesar_cobertura_camaras():
    """
    Esta función procesa las ubicaciones de las cámaras de seguridad para determinar
    las áreas sin cobertura dentro de los límites de los barrios de la ciudad.
    Genera un archivo GeoJSON con los polígonos de las zonas descubiertas.
    """
    try:
        # --- 1. Carga y Limpieza de Datos de Cámaras ---
        print("Iniciando el procesamiento de cobertura de cámaras...")
        path_camaras = 'public/Camaras.CSV1 (1).csv'
        
        # Leer el CSV, especificando la coma como separador decimal y manejando errores
        df_camaras = pd.read_csv(
            path_camaras,
            decimal=',',
            usecols=['Latitud', 'Longitud'],
            on_bad_lines='warn' # Advertirá sobre líneas mal formadas
        )
        
        # Eliminar filas donde Latitud o Longitud sean nulos
        df_camaras.dropna(subset=['Latitud', 'Longitud'], inplace=True)

        # Convertir a tipo numérico, forzando errores a NaN (que luego se eliminarán)
        df_camaras['Latitud'] = pd.to_numeric(df_camaras['Latitud'], errors='coerce')
        df_camaras['Longitud'] = pd.to_numeric(df_camaras['Longitud'], errors='coerce')
        
        # Eliminar filas que no se pudieron convertir
        df_camaras.dropna(subset=['Latitud', 'Longitud'], inplace=True)

        # Eliminar ubicaciones duplicadas para no procesar la misma cámara varias veces
        df_camaras.drop_duplicates(subset=['Latitud', 'Longitud'], inplace=True)
        print(f"Se encontraron {len(df_camaras)} ubicaciones de cámaras únicas.")

        # --- 2. Creación del GeoDataFrame de Cámaras ---
        
        # Crear geometrías de Puntos a partir de las coordenadas
        geometry = [Point(xy) for xy in zip(df_camaras['Longitud'], df_camaras['Latitud'])]
        gdf_camaras = gpd.GeoDataFrame(df_camaras, geometry=geometry, crs="EPSG:4326")

        # --- 3. Carga del Área de Interés (Barrios) ---
        path_barrios = 'public/barrios.geojson'
        gdf_barrios = gpd.read_file(path_barrios)
        
        # Unir todos los polígonos de barrios en una sola geometría
        area_total_barrios = gdf_barrios.unary_union
        print("Área de interés (barrios) cargada correctamente.")

        # --- 4. Proyección y Creación de Buffers de Cobertura ---
        
        # Proyectar a un CRS en metros (UTM zona 21S para Mar del Plata) para cálculos de distancia
        gdf_camaras_proyectado = gdf_camaras.to_crs("EPSG:32721")
        
        # Crear un buffer (círculo) de 200 metros alrededor de cada cámara
        gdf_camaras_proyectado['cobertura'] = gdf_camaras_proyectado.geometry.buffer(200)
        
        # Unir todos los buffers en una sola gran área de cobertura
        area_cobertura_total = gdf_camaras_proyectado.unary_union
        print("Se han creado las zonas de cobertura de 200m para cada cámara.")

        # --- 5. Cálculo de Zonas Descubiertas ---
        
        # Crear un GeoDataFrame para el área de cobertura y proyectarlo al mismo CRS que los barrios
        gdf_cobertura = gpd.GeoDataFrame(geometry=[area_cobertura_total], crs="EPSG:32721")
        gdf_cobertura_wgs84 = gdf_cobertura.to_crs("EPSG:4326")
        
        # Calcular la diferencia: área de barrios MENOS el área de cobertura
        # Usamos unary_union para asegurar que la operación se haga sobre una única geometría
        zonas_descubiertas = area_total_barrios.difference(gdf_cobertura_wgs84.unary_union)
        print("Se han calculado las zonas sin cobertura.")

        # --- 6. Guardado de Resultados ---
        
        # Crear un GeoDataFrame final con las zonas descubiertas
        gdf_zonas_descubiertas = gpd.GeoDataFrame(geometry=[zonas_descubiertas], crs="EPSG:4326")
        
        # Guardar el resultado en un nuevo archivo GeoJSON
        output_path = 'public/zonas_descubiertas.geojson'
        gdf_zonas_descubiertas.to_file(output_path, driver='GeoJSON')
        
        print(f"Proceso finalizado. Las zonas sin cobertura se han guardado en: {output_path}")

    except FileNotFoundError as e:
        print(f"Error: No se pudo encontrar el archivo necesario. {e}")
    except Exception as e:
        print(f"Ocurrió un error inesperado durante el procesamiento: {e}")

if __name__ == '__main__':
    procesar_cobertura_camaras()
