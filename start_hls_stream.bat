@echo off
REM ============================================
REM Script para transmitir video HLS desde archivo
REM ============================================

REM Cambiar PATRULLA_ID según sea necesario
set PATRULLA_ID=AA120JS
set STREAM_DIR=C:\Users\gusta\MapaTraficoFinal\public\streams\%PATRULLA_ID%

REM Crear carpeta si no existe
if not exist "%STREAM_DIR%" mkdir "%STREAM_DIR%"

REM Mostrar información
echo.
echo ===============================================
echo 📹 HLS Stream Transmitter
echo ===============================================
echo Patrulla: %PATRULLA_ID%
echo Directorio: %STREAM_DIR%
echo Comando: FFmpeg
echo.
echo Para ver el stream en el navegador:
echo http://localhost:3003
echo.
echo Presiona Ctrl+C para detener la transmisión
echo ===============================================
echo.

REM Transmitir desde archivo de prueba
REM Cambiar "C:\video.mp4" por tu archivo de video
ffmpeg -re -i "C:\video.mp4" ^
  -c:v libx264 ^
  -preset ultrafast ^
  -b:v 2000k ^
  -maxrate 2500k ^
  -bufsize 5000k ^
  -c:a aac ^
  -b:a 128k ^
  -ar 44100 ^
  -ac 2 ^
  -hls_time 1 ^
  -hls_list_size 3 ^
  -hls_flags delete_segments ^
  "%STREAM_DIR%\stream.m3u8"

pause
