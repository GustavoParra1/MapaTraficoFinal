@echo off
REM Descargar un video de prueba desde Internet
setlocal enabledelayedexpansion

echo 📥 Descargando video de prueba...

REM URL de un video MP4 pequeño (Big Buck Bunny 5 segundos)
set "VIDEO_URL=https://commondatastorage.googleapis.com/gtv-videos-library/sample/BigBuckBunny.mp4"
set "VIDEO_FILE=temp_video.mp4"
set "PATRULLA_ID=AA120JS"
set "STREAMS_DIR=public\streams\!PATRULLA_ID!"

REM Descargar con PowerShell
powershell -Command "& {(New-Object System.Net.WebClient).DownloadFile('%VIDEO_URL%', '%VIDEO_FILE%'); Write-Host 'Video descargado'}"

if not exist "%VIDEO_FILE%" (
    echo ❌ Error al descargar el video
    pause
    exit /b 1
)

echo ✅ Video descargado

REM Convertir a HLS
echo 📹 Instalando FFmpeg (si es necesario)...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo ⚠️  FFmpeg no encontrado. Instalando...
    powershell -Command "Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force"
    powershell -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    call choco install ffmpeg -y
)

echo Extrayendo primeros 10 segundos y convirtiendo a HLS...
ffmpeg -i "%VIDEO_FILE%" -ss 0 -t 10 -c:v libx264 -preset ultrafast -c:a aac -hls_time 5 -hls_list_size 0 -hls_segment_filename "!STREAMS_DIR!\segment-%%d.ts" "!STREAMS_DIR!\stream.m3u8" -y

if errorlevel 1 (
    echo ❌ Error al convertir a HLS
    del "%VIDEO_FILE%"
    pause
    exit /b 1
)

echo ✅ Stream HLS generado exitosamente
echo 📁 Ubicación: !STREAMS_DIR!
echo 🌐 URL: http://localhost:3003/streams/!PATRULLA_ID!/stream.m3u8

REM Limpiar
del "%VIDEO_FILE%"

echo.
echo ℹ️  Recarga el navegador para ver el video
pause
