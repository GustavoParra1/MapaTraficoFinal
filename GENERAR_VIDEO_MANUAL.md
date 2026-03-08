# 🎬 Generar Video HLS - Instrucciones Manuales

## El problema
El archivo de video que necesitamos es grande y no puedo descargarlo automáticamente. Necesitas generar un video HLS localmente.

## ✅ Solución: Generar video sin FFmpeg (solo PowerShell)

### Opción 1: Generar video usando VLC (si lo tienes instalado)

```powershell
# 1. Generar un video de prueba de 10 segundos (pantallla azul + audio)
& "C:\Program Files\VideoLAN\VLC\vlc.exe" --ttl=10 -I dummy `
  vlc://quit -O fake:// `
  --sout='#transcode{vcodec=h264,vb=800,scale=1,acodec=aac,ab=128}:std{access=file,mux=ts,dst=C:\Users\gusta\MapaTraficoFinal\test.ts}' `
  "color://blue?d=10" vlc://quit
```

### Opción 2: Usar un video online libre (si tienes conexión)

Algunos sitios que tienen videos pequeños gratuitos:
- **Coverr.co** - Videos cortos gratis
- **Pixabay.com** - Descarga directa de videos

Descarga uno, luego convierte con FFmpeg instalado en tu máquina.

### Opción 3: Convertir un video existente

¿Tienes algún video MP4 en tu computadora? Puedo convertirlo a HLS.

1. Coloca el video en `c:\Users\gusta\MapaTraficoFinal\`
2. Ejecuta en PowerShell (con FFmpeg instalado):

```powershell
ffmpeg -i "tu_video.mp4" `
  -c:v libx264 -preset ultrafast `
  -c:a aac `
  -hls_time 5 `
  -hls_list_size 0 `
  -hls_segment_filename "c:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS\segment-%d.ts" `
  "c:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS\stream.m3u8"
```

### Opción 4: Instalar FFmpeg correctamente (PowerShell como Admin)

1. Abre PowerShell como Administrador (click derecho → "Ejecutar como administrador")
2. Ejecuta:

```powershell
# Instalar FFmpeg
choco install ffmpeg -y

# Esperar 2 minutos a que termine la instalación
# Luego cerrar y abrir una nueva PowerShell

# Generar video de prueba
ffmpeg -f lavfi -i color=c=blue:s=640x480:d=10 `
  -f lavfi -i sine=f=1000:d=10 `
  -pix_fmt yuv420p `
  -c:v libx264 -preset ultrafast `
  -c:a aac `
  "c:\Users\gusta\MapaTraficoFinal\test.mp4"

# Convertir a HLS
ffmpeg -i "c:\Users\gusta\MapaTraficoFinal\test.mp4" `
  -c:v libx264 -preset ultrafast `
  -c:a aac `
  -hls_time 5 `
  -hls_list_size 0 `
  -hls_segment_filename "c:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS\segment-%d.ts" `
  "c:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS\stream.m3u8"

# Limpiar
Remove-Item "c:\Users\gusta\MapaTraficoFinal\test.mp4"
```

## 🔍 Verificar que funciona

```powershell
# Ver si existen los archivos
Get-ChildItem "c:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS\"

# Debería mostrar:
# stream.m3u8
# segment-0.ts
# segment-1.ts
# etc.
```

## 📋 Resumen de pasos:

1. ✅ Instala FFmpeg (PowerShell como Admin)
2. ✅ Copia un video existente O genera uno de prueba
3. ✅ Convierte a HLS con FFmpeg
4. ✅ Recarga el navegador

Una vez hecho, el video aparecerá en el mapa cuando hagas clic en una patrulla.

## ¿Necesitas ayuda?
- ¿Qué video tienes disponible localmente?
- ¿Puedes ejecutar PowerShell como Administrador?
