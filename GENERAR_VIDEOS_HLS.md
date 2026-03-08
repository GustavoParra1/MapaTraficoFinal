# 🎥 Generar Videos HLS para Streaming

## ⚡ Opción 1: Script Automático (Recomendado)

```batch
generar_video_prueba.bat
```

Este script:
1. Genera un video de prueba (5 segundos, pantalla azul)
2. Lo convierte a formato HLS
3. Coloca los archivos en `public/streams/AA120JS/`
4. Listo para reproducir

## 📝 Opción 2: Manual con FFmpeg

### Requisito: Instalar FFmpeg
```powershell
# Con Chocolatey (recomendado):
choco install ffmpeg

# O descárgalo desde:
# https://ffmpeg.org/download.html
```

### Convertir archivo de video existente a HLS

```bash
ffmpeg -i mi_video.mp4 \
  -c:v libx264 -preset ultrafast \
  -c:a aac \
  -hls_time 10 \
  -hls_list_size 0 \
  -hls_segment_filename "public/streams/AA120JS/segment-%d.ts" \
  "public/streams/AA120JS/stream.m3u8"
```

### Parámetros:
- `-c:v libx264`: Codificador H.264 (compatible con HLS)
- `-preset ultrafast`: Compresión rápida (para baja latencia)
- `-c:a aac`: Audio AAC (compatible con HLS)
- `-hls_time 10`: Duración de cada segmento (10 segundos)
- `-hls_list_size 0`: Guardar todos los segmentos (no rotar)

## 🎬 Opción 3: Generar video de prueba en vivo

```bash
# Video azul de 30 segundos con audio:
ffmpeg -f lavfi -i color=c=blue:s=640x480:d=30 \
        -f lavfi -i sine=f=1000:d=30 \
        -pix_fmt yuv420p \
        -c:v libx264 -preset ultrafast \
        -c:a aac \
        test.mp4

# Luego convertir a HLS:
ffmpeg -i test.mp4 \
  -c:v libx264 -preset ultrafast \
  -c:a aac \
  -hls_time 10 \
  -hls_list_size 0 \
  -hls_segment_filename "public/streams/AA120JS/segment-%d.ts" \
  "public/streams/AA120JS/stream.m3u8"
```

## 🎥 Opción 4: Usar cámara USB en vivo

```bash
# Windows - Dispositivo USB (busca el nombre de tu cámara):
ffmpeg -f dshow -i video="Nombre_De_Tu_Camara" \
  -c:v libx264 -preset ultrafast \
  -hls_time 10 \
  -hls_list_size 5 \
  -hls_segment_filename "public/streams/AA120JS/segment-%d.ts" \
  "public/streams/AA120JS/stream.m3u8"
```

## 🔄 Opción 5: Stream continuo desde patrulla

Para un flujo continuo en vivo, usa `-hls_list_size 5` en lugar de `0`:

```bash
ffmpeg -i archivo_o_dispositivo \
  -c:v libx264 -preset ultrafast \
  -c:a aac \
  -hls_time 10 \
  -hls_list_size 5 \
  -hls_segment_filename "public/streams/HH457JK/segment-%d.ts" \
  "public/streams/HH457JK/stream.m3u8"
```

Esto mantiene solo los últimos 5 segmentos (50 segundos) en el playlist, ideal para streams en vivo.

## ✅ Verificar que funciona

1. Genera los archivos HLS
2. Abre `http://localhost:3003`
3. Haz clic en una patrulla (AA120JS o HH457JK)
4. El video debe aparecer en el visor

## 📁 Estructura esperada

```
public/streams/
├── AA120JS/
│   ├── stream.m3u8         ← Playlist
│   ├── segment-0.ts        ← Video segment 1
│   ├── segment-1.ts        ← Video segment 2
│   └── segment-2.ts        ← Video segment 3
└── HH457JK/
    ├── stream.m3u8
    └── segment-*.ts
```

## 🐛 Solucionar problemas

### "ffmpeg: comando no encontrado"
- Instala FFmpeg: `choco install ffmpeg`
- Reinicia PowerShell después de instalar

### "404 Not Found" en la consola
- Verifica que `stream.m3u8` existe en la carpeta correcta
- Verifica que los segmentos están nombrados como `segment-0.ts`, `segment-1.ts`, etc.

### Video no aparece
- Espera 5-10 segundos después de ejecutar FFmpeg
- Recarga el navegador (Ctrl+F5 para forzar sin caché)
- Abre DevTools (F12) y revisa la consola

### Latencia alta
- Reduce `-hls_time` de 10 a 5 segundos
- Usa `-preset ultrafast` para FFmpeg

## 🎯 Próximos pasos

Una vez que funcione:
1. Configura FFmpeg en cada patrulla (dispositivo móvil)
2. Apunta el stream a tu servidor (cambia `localhost` por la IP de tu servidor)
3. Integra con sistema de GPS/ubicación
