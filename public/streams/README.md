# 📹 HLS Streams

Esta carpeta contiene los segmentos HLS (.m3u8 y .ts) que se generan automáticamente cuando FFmpeg transmite video.

## Estructura

```
streams/
├── AA120JS/
│   ├── stream.m3u8      (Playlist)
│   ├── segment-0.ts     (Segmento 0)
│   ├── segment-1.ts     (Segmento 1)
│   └── ...
├── HH457JK/
│   └── ...
```

## Cómo Usar

1. Crea una carpeta con el ID de tu patrulla (ej: `AA120JS`)
2. Ejecuta FFmpeg para generar los archivos
3. El servidor sirve automáticamente los archivos

## No editar manualmente

Los archivos en esta carpeta son generados por FFmpeg automáticamente y se eliminan cuando pasan su tiempo de vida. **No los edites manualmente**.

Para cambiar parámetros de transmisión, modifica el comando de FFmpeg, no estos archivos.
