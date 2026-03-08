@echo off
REM Navegar a la carpeta del proyecto
cd /d "%~dp0"

REM Iniciar el servidor Node.js en segundo plano
start /b node server.js

REM Esperar un momento para que el servidor se inicie
timeout /t 5 >nul

REM Abrir el navegador con la dirección del mapa (servido por Node.js en el puerto 3000)
start http://127.0.0.1:3000

REM Mantener la ventana de comandos abierta para ver la salida del servidor
echo El servidor Node.js esta corriendo. Cierra esta ventana para detenerlo.
pause