@echo off
REM Script para instalar FFmpeg y generar video HLS
REM Requiere ejecución como Administrador

echo.
echo ============================================
echo   📹 Generador de Video HLS
echo ============================================
echo.

REM Verificar si está ejecutado como Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ Este script REQUIERE ejecutarse como Administrador
    echo.
    echo 📋 Cómo hacerlo:
    echo 1. Click derecho en este archivo
    echo 2. Selecciona "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

echo ✅ Script ejecutando como Administrador

REM Verificar si FFmpeg está instalado
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo.
    echo 📥 FFmpeg no encontrado. Instalando...
    echo.
    
    REM Instalar Chocolatey si no existe
    powershell -Command "if (-not (Get-Command choco -ErrorAction SilentlyContinue)) { Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1')) }"
    
    REM Instalar FFmpeg
    powershell -Command "choco install ffmpeg -y --force"
    
    REM Actualizar PATH
    setx Path "%Path%;C:\ProgramData\chocolatey\bin" /M
    
    echo ✅ FFmpeg instalado
    echo.
    echo ⚠️  Reinicia la terminal y ejecuta de nuevo este script
    pause
    exit /b 0
)

echo ✅ FFmpeg disponible
echo.

setlocal enabledelayedexpansion

set "PATRULLA_ID=AA120JS"
set "STREAMS_DIR=public\streams\!PATRULLA_ID!"
set "VIDEO_FILE=test_video.mp4"

echo 🎬 Generando video de prueba (5 segundos, pantalla azul)...
echo.

ffmpeg -f lavfi -i color=c=blue:s=640x480:d=5 ^
        -f lavfi -i sine=f=1000:d=5 ^
        -pix_fmt yuv420p ^
        -c:v libx264 -preset ultrafast ^
        -c:a aac ^
        "!VIDEO_FILE!" -y

if errorlevel 1 (
    echo.
    echo ❌ Error al generar video
    pause
    exit /b 1
)

echo.
echo ✅ Video generado: !VIDEO_FILE!
echo.
echo 📹 Convirtiendo a HLS...
echo.

ffmpeg -i "!VIDEO_FILE!" ^
        -c:v libx264 -preset ultrafast ^
        -c:a aac ^
        -hls_time 5 ^
        -hls_list_size 0 ^
        -hls_segment_filename "!STREAMS_DIR!\segment-%%d.ts" ^
        "!STREAMS_DIR!\stream.m3u8" -y

if errorlevel 1 (
    echo.
    echo ❌ Error al convertir a HLS
    del "!VIDEO_FILE!"
    pause
    exit /b 1
)

echo.
echo ✅ Stream HLS generado exitosamente
echo.
echo 📍 Ubicación: !STREAMS_DIR!
echo 🌐 URL: http://localhost:3003/streams/!PATRULLA_ID!/stream.m3u8
echo.
echo 📁 Archivos generados:
dir "!STREAMS_DIR!" /B
echo.

REM Limpiar video temporal
del "!VIDEO_FILE!"

echo ℹ️  INSTRUCCIONES FINALES:
echo 1. Recarga el navegador (F5)
echo 2. Haz click en la patrulla AA120JS
echo 3. El video debe aparecer en el visor
echo.

pause
