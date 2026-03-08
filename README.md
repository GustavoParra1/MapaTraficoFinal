# 🗺️ MapaTraficoFinal - Documentación de Estructura

## 📋 Descripción del Proyecto
Sistema de monitoreo de tráfico y siniestros viales en Mar del Plata, con análisis geoespacial, alertas y seguimiento de patrullas.

## 📁 Estructura del Proyecto

```
MapaTraficoFinal/
├── config/                          # ⚙️ Configuración del proyecto
│   ├── firebase.json                # Configuración de Firebase Hosting
│   └── database.rules.json          # Reglas de seguridad de RTDB
│
├── data/                            # 📊 Datos (CSV, GeoJSON)
│   ├── alertas.geojson              # Puntos de alerta
│   ├── Camaras.csv                  # Ubicación de cámaras
│   ├── SINIESTROS.csv               # Base de datos de siniestros
│   └── siniestros_con_ubicacion.geojson  # Siniestros georreferenciados
│
├── scripts/                         # 🐍 Scripts Python de procesamiento
│   ├── analisis_siniestros.py       # Análisis de causas y patrones
│   ├── diagnostico_siniestros.py    # Diagnóstico de siniestros
│   ├── generar_mapa_calor.py        # Generación de mapas de calor
│   ├── procesar_datos.py            # Procesamiento de datos CSV
│   └── convert.py                   # Conversión de formatos
│
├── public/                          # 🌐 Frontend (HTML, CSS, JS)
│   ├── index.html                   # Página principal del mapa
│   ├── login.html                   # Página de login
│   ├── viewer.html                  # Visor de datos
│   ├── script.js                    # Lógica principal del mapa
│   ├── login.js                     # Lógica de autenticación
│   ├── firebase-config.js           # Configuración de Firebase
│   │
│   ├── css/                         # 🎨 Estilos
│   │   ├── style.css                # Estilos principales
│   │   └── login.css                # Estilos del login
│   │
│   ├── js/                          # 📦 Módulos JavaScript (futuro)
│   │   └── (En construcción)
│   │
│   ├── patrulla/                    # 🚔 App de patrullas
│   │   ├── index.html
│   │   ├── bash.txt
│   │   └── iconos SVG
│   │
│   ├── Datos GeoJSON                # 🗺️ Capas geográficas
│   │   ├── barrios.geojson
│   │   ├── colegios_escuelas.geojson
│   │   ├── corredores_escolares.geojson
│   │   ├── map.geojson
│   │   └── zonas_descubiertas.geojson
│   │
│   └── Datos CSV                    # 📈 Datos tabulares
│       ├── FLUJO.csv
│       ├── Recorrido lineas Colectivos.csv
│       ├── robo automotor.csv
│       ├── Camaras privadas.csv
│       └── Camaras.CSV1.csv
│
├── functions/                       # 🔧 Firebase Functions (vacío)
│
├── worker/                          # ⚙️ Web Workers
│   └── worker.js                    # Worker thread para tareas background
│
├── server.js                        # 🖥️ Servidor Express
├── package.json                     # 📦 Dependencias de Node.js
├── package-lock.json
│
├── alertas.db                       # 📁 Base de datos SQLite
├── noticias.db                      # 📁 Base de datos SQLite
│
└── README.md                        # 📖 Este archivo

```

## 🚀 Inicio Rápido

### Instalación de dependencias
```bash
npm install
```

### Ejecutar el servidor
```bash
npm start
# o
node server.js
```

El servidor estará disponible en `http://localhost:3003`

## 📝 Descripción de Carpetas

### `/config`
Contiene archivos de configuración del proyecto:
- `firebase.json`: Configuración para Firebase Hosting
- `database.rules.json`: Reglas de seguridad de la base de datos en tiempo real

### `/data`
Almacena todos los datos del sistema:
- **GeoJSON**: Datos georreferenciados (alertas, siniestros)
- **CSV**: Datos tabulares (cámaras, flujo vehicular, robos)

### `/scripts`
Scripts de procesamiento de datos en Python:
- Análisis de siniestros y patrones
- Generación de mapas de calor
- Conversión y procesamiento de formatos

### `/public`
Interfaz web del sistema:
- **Archivos raíz**: HTML principal, login, configuración
- **`css/`**: Hojas de estilo organizadas
- **`js/`**: (En construcción) Módulos JavaScript separados
- **`patrulla/`**: Interfaz específica para patrullas

## 🔧 Tecnologías Utilizadas

- **Frontend**: HTML5, CSS3, JavaScript (Leaflet.js para mapas)
- **Backend**: Node.js, Express.js
- **Base de datos**: Firebase Realtime Database, SQLite
- **Geolocalización**: Leaflet.js, GeoJSON
- **Procesamiento de datos**: Python
- **Autenticación**: Firebase Auth

## 📱 Características Principales

✅ Mapa interactivo de tráfico en tiempo real  
✅ Sistema de alertas de siniestros  
✅ Análisis geoespacial de causas  
✅ Seguimiento de patrullas  
✅ Mapas de calor de incidentes  
✅ Filtros por barrio, año, hora, causa  
✅ Chat entre COM y patrullas  
✅ Street View integrado  

## 🔐 Autenticación

El sistema utiliza Firebase Authentication con roles:
- **COM**: Centro de Operaciones (acceso total)
- **Patrulla**: Personal en patrullas (acceso limitado)

## 📹 Transmisión de Video (HLS)

El sistema soporta **HLS (HTTP Live Streaming)** para transmisión de video sin servicios cloud:

### Configuración Rápida:

1. **Instalar FFmpeg**:
   - Windows: `choco install ffmpeg`
   - O descargar desde https://ffmpeg.org/download.html

2. **Crear carpeta de patrulla**:
   ```powershell
   mkdir "public/streams/AA120JS"
   ```

3. **Transmitir desde archivo**:
   ```bash
   # Ejecutar start_hls_stream.bat (en Windows)
   # O comando manual:
   ffmpeg -re -i "C:\video.mp4" -c:v libx264 -preset ultrafast -b:v 2000k -hls_time 2 "public/streams/AA120JS/stream.m3u8"
   ```

4. **Ver en el mapa**:
   - Abre http://localhost:3003
   - Haz clic en una patrulla
   - El video aparecerá automáticamente

### Documentación Completa:
Ver [HLS_SETUP.md](HLS_SETUP.md) para configuración avanzada, cámaras IP, y solución de problemas.

### Ventajas HLS:
✅ Gratis (sin servicios cloud)  
✅ Baja latencia (~2-4 segundos)  
✅ Compatible con todos los navegadores  
✅ Robusto ante cortes de conexión  

---

## 🔐 Autenticación

El sistema utiliza Firebase Authentication con roles:
- **COM**: Centro de Operaciones (acceso total)
- **Patrulla**: Personal en patrullas (acceso limitado)

## 📊 APIs Principales

### `/analisis-causa`
Análisis de siniestros por causa específica
```
GET /analisis-causa?causa=DISTRACCION
```

Retorna:
- Total de siniestros por causa
- Top 3 participantes
- Top 5 barrios afectados
- Distribución horaria

## 🛠️ Mejoras Realizadas (2026)

- ✅ Reorganización de carpetas (`config/`, `data/`, `scripts/`)
- ✅ Eliminación de archivos duplicados y backups
- ✅ Actualización de rutas en archivos
- ✅ Estructura CSS modularizada
- ✅ Limpieza de archivos innecesarios

## 📈 Próximos Pasos (Recomendado)

1. **Modularizar `script.js`**: Dividir en módulos más pequeños (`map.js`, `filters.js`, `auth.js`)
2. **Documentar APIs**: Crear documentación OpenAPI/Swagger
3. **Tests**: Implementar tests unitarios y de integración
4. **CI/CD**: Configurar pipeline de despliegue automático
5. **Performance**: Optimizar carga de datos grandes

## 📞 Contacto

Centro de Inteligencia y Monitoreo Urbano (CIMU)  
Mar del Plata, Argentina

---

**Última actualización**: Febrero 5, 2026
