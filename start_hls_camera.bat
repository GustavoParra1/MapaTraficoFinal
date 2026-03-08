@echo off
REM ============================================
REM Script para transmitir video HLS desde cámara USB
REM ============================================

setlocal enabledelayedexpansion

REM Cambiar PATRULLA_ID según sea necesario
set PATRULLA_ID=AA120JS
set STREAM_DIR=C:\Users\gusta\MapaTraficoFinal\public\streams\%PATRULLA_ID%

REM Crear carpeta si no existe
if not exist "%STREAM_DIR%" mkdir "%STREAM_DIR%"

REM Mostrar información
echo.
echo ===============================================
echo 📹 HLS Stream - Camara USB
echo ===============================================
echo Patrulla: %PATRULLA_ID%
echo Directorio: %STREAM_DIR%
echo.
echo Para encontrar tu cámara, ejecuta:
echo   ffmpeg -f dshow -list_devices true -i dummy
echo.
echo Luego reemplaza "USB Video Device" con el nombre
echo de tu cámara en el comando de abajo.
echo ===============================================
echo.

REM OPCIÓN 1: Cámara USB por defecto
echo [1] Transmitiendo desde cámara USB...
ffmpeg -f dshow -i video="USB Video Device" ^
  -c:v libx264 ^
  -preset ultrafast ^
  -b:v 2000k ^
  -maxrate 2500k ^
  -bufsize 5000k ^
  -c:a aac ^
  -b:a 128k ^
  -ar 44100 ^
  -ac 2 ^
  -hls_time 2 ^
  -hls_list_size 5 ^
  -hls_flags delete_segments ^
  "%STREAM_DIR%\stream.m3u8"

REM Si falla, mostrar opciones
if errorlevel 1 (
  echo.
  echo ❌ Error: No se encontró "USB Video Device"
  echo.
  echo Ejecuta esto para ver tus dispositivos:
  echo   ffmpeg -f dshow -list_devices true -i dummy
  echo.
  echo Luego abre este archivo y reemplaza "USB Video Device"
  echo con el nombre exacto de tu cámara.
)

pause
