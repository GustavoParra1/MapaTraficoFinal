# 🎥 Configuración HLS (HTTP Live Streaming)

## ¿Qué es HLS?
HTTP Live Streaming es un protocolo de transmisión de video que divide el stream en pequeños segmentos (.ts) que se reproducen secuencialmente. **Es gratis, sin servicio cloud, y funciona en todos los navegadores**.

---

## 📋 Requisitos

### Instalar FFmpeg
**Windows (Con Chocolatey):**
```powershell
choco install ffmpeg
```

**Windows (Manual):**
1. Descarga desde: https://ffmpeg.org/download.html
2. Extrae a `C:\ffmpeg`
3. Agrega `C:\ffmpeg\bin` al PATH

**Verificar instalación:**
```bash
ffmpeg -version
```

---

## 🚀 Cómo Usar

### Opción 1: Transmitir desde Cámara USB (Patrulla)

En la **patrulla** (con cámara USB), ejecuta:

```bash
ffmpeg -f dshow -i video="Nombre de tu cámara" -c:v libx264 -preset ultrafast -b:v 2000k -c:a aac -b:a 128k -hls_time 2 -hls_list_size 5 -hls_flags delete_segments "C:\Users\gusta\MapaTraficoFinal\public\streams\PATRULLA_ID\stream.m3u8"
```

**Explicación de parámetros:**
- `-f dshow`: Usa DirectShow (Windows)
- `-i video="Nombre de la cámara"`: Selecciona tu cámara
- `-preset ultrafast`: Baja latencia
- `-b:v 2000k`: Bitrate de video (2 Mbps)
- `-hls_time 2`: Cada segmento dura 2 segundos
- `-hls_list_size 5`: Mantén últimos 5 segmentos
- `-hls_flags delete_segments`: Elimina segmentos antiguos

### Opción 2: Transmitir desde Archivo de Prueba

```bash
ffmpeg -re -i "C:\video.mp4" -c:v libx264 -preset ultrafast -b:v 2000k -c:a aac -b:a 128k -hls_time 2 -hls_list_size 5 -hls_flags delete_segments "C:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS\stream.m3u8"
```

### Opción 3: Transmitir desde URL (IP Cámara)

```bash
ffmpeg -rtsp_transport tcp -i "rtsp://192.168.1.100:554/stream" -c:v libx264 -preset ultrafast -b:v 2000k -c:a aac -b:a 128k -hls_time 2 -hls_list_size 5 -hls_flags delete_segments "C:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS\stream.m3u8"
```

---

## 🖥️ Cómo Ver el Stream

En el **COM (centro de operaciones)**, en el mapa:
1. Haz clic en una patrulla
2. Se abre el reproductor HLS
3. **Automáticamente** comienza a reproducir el stream de esa patrulla

---

## 📝 Crear Carpeta de Patrulla

Antes de iniciar FFmpeg, crea la carpeta con el ID de patrulla:

```powershell
mkdir "C:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS"
mkdir "C:\Users\gusta\MapaTraficoFinal\public\streams\HH457JK"
```

---

## 🔍 Buscar Nombre Exacto de tu Cámara

Ejecuta esto en PowerShell:

```powershell
ffmpeg -f dshow -list_devices true -i dummy
```

Output ejemplo:
```
[dshow @ ...] DirectShow video devices
[dshow @ ...]  "HD Webcam"
[dshow @ ...]  "Integrated Camera"
```

Usa el nombre exacto entre comillas.

---

## 📊 Monitorear Stream

Abre en navegador (mientras FFmpeg está transmitiendo):
```
http://localhost:3003/streams/AA120JS/stream.m3u8
```

Si ves el archivo .m3u8 con segmentos .ts, está funcionando.

---

## ⚙️ Optimizaciones

### Baja latencia:
```bash
-hls_time 1 -hls_list_size 3
```

### Mejor calidad:
```bash
-b:v 5000k -preset fast
```

### Menor ancho de banda:
```bash
-b:v 500k -preset ultrafast
```

---

## 🐛 Solucionar Problemas

### "ffmpeg no es reconocido"
- Asegúrate de agregar FFmpeg al PATH
- Reinicia PowerShell/CMD

### "Archivo no encontrado"
- Verifica que la carpeta existe: `public/streams/PATRULLA_ID/`
- La ruta debe ser exacta

### Video no carga en navegador
- Verifica que FFmpeg está escribiendo `.m3u8` y `.ts`
- Revisa que el servidor está corriendo en puerto 3003
- Abre DevTools (F12) para ver errores

---

## 📱 Arquitectura

```
Patrulla (FFmpeg) → public/streams/PATRULLA_ID/ → Servidor Express → Navegador COM
                    stream.m3u8
                    segment-0.ts
                    segment-1.ts
                    segment-2.ts
```

---

## ✅ Checklist de Setup

- [ ] FFmpeg instalado y en PATH
- [ ] Carpeta `public/streams/` existe
- [ ] Carpeta `public/streams/PATRULLA_ID/` creada
- [ ] Servidor Express corriendo (`npm start`)
- [ ] FFmpeg generando archivos en la carpeta correcta
- [ ] Navegador accediendo a `http://localhost:3003`

---

## 🎯 Ventajas HLS

✅ **Gratis** - Sin servicios cloud  
✅ **Baja latencia** - ~2-4 segundos  
✅ **Compatible** - Todos los navegadores  
✅ **Robusto** - Maneja cortes de conexión  
✅ **Adaptable** - Ajusta bitrate automáticamente  

---

**Última actualización**: Febrero 5, 2026
