@echo off
echo 🚀 Organizando archivos para MapaTrafico...

REM Ir a la carpeta donde está este .bat
cd /d "%~dp0"

REM Crear la carpeta public si no existe
if not exist public (
    mkdir public
    echo 📂 Carpeta "public" creada.
)

REM Mover los archivos necesarios a public
move /Y index.html public\ >nul 2>&1
move /Y script.js public\ >nul 2>&1
move /Y style.css public\ >nul 2>&1
move /Y map.geojson public\ >nul 2>&1
move /Y siniestros_con_ubicacion.geojson public\ >nul 2>&1
move /Y "Camaras.CSV1 (1).csv" public\ >nul 2>&1
move /Y FLUJO.csv public\ >nul 2>&1

echo ✅ Archivos movidos correctamente a "public".

echo.
echo 🚀 Iniciando servidor Node (server.js)...
echo ------------------------------------------

REM Arrancar el servidor
node server.js

pause
