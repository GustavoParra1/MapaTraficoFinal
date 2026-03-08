@echo off
REM Script para generar un video de prueba y convertirlo a HLS
REM Requiere: FFmpeg instalado

setlocal enabledelayedexpansion

REM Verificar si FFmpeg está disponible
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo ❌ FFmpeg no está instalado o no está en el PATH
    echo 📥 Descárgalo desde: https://ffmpeg.org/download.html
    pause
    exit /b 1
)

echo 🎬 Generando video de prueba...
set "VIDEO_FILE=test_video.mp4"
set "PATRULLA_ID=AA120JS"
set "STREAMS_DIR=public\streams\!PATRULLA_ID!"

REM Crear video de prueba (5 segundos, pantalla azul)
ffmpeg -f lavfi -i color=c=blue:s=640x480:d=5 -f lavfi -i sine=f=1000:d=5 -pix_fmt yuv420p -c:v libx264 -preset ultrafast -c:a aac "!VIDEO_FILE!" -y

if errorlevel 1 (
    echo ❌ Error al generar video
    pause
    exit /b 1
)

echo ✅ Video de prueba generado: !VIDEO_FILE!

REM Convertir a HLS
echo 📹 Convirtiendo a HLS...
ffmpeg -i "!VIDEO_FILE!" -c:v libx264 -preset ultrafast -c:a aac -hls_time 10 -hls_list_size 0 -hls_segment_filename "!STREAMS_DIR!\segment-%%d.ts" "!STREAMS_DIR!\stream.m3u8" -y

if errorlevel 1 (
    echo ❌ Error al convertir a HLS
    pause
    exit /b 1
)

echo ✅ Stream HLS generado exitosamente
echo 📁 Ubicación: !STREAMS_DIR!
echo 🌐 URL: http://localhost:3003/streams/!PATRULLA_ID!/stream.m3u8

REM Limpiar archivo temporal
del "!VIDEO_FILE!"

echo.
echo ℹ️  Recarga el navegador para ver el video en el mapa
pause
