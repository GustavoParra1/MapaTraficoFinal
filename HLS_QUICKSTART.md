# 🚀 HLS Setup - Guía Rápida

## ✅ Ya Implementado

Tu proyecto ahora tiene soporte completo para **HLS (HTTP Live Streaming)**:

- ✅ Servidor Express configurado para servir streams HLS
- ✅ Cliente JavaScript usando HLS.js para reproducción
- ✅ Carpetas para patrullas creadas: `AA120JS`, `HH457JK`
- ✅ Scripts batch para Windows listos

## 🎯 Próximos Pasos

### 1️⃣ Instalar FFmpeg

**Windows con Chocolatey (Recomendado):**
```powershell
choco install ffmpeg
```

**Verificar instalación:**
```powershell
ffmpeg -version
```

### 2️⃣ Encontrar tu Cámara USB

```powershell
ffmpeg -f dshow -list_devices true -i dummy
```

Búsca algo como:
```
[dshow @ ...] "HD Webcam"
[dshow @ ...] "Integrated Camera"
```

Copia el nombre exacto.

### 3️⃣ Transmitir Video

**Opción A: Desde archivo de video**
```powershell
# Editar: Cambiar C:\video.mp4 por tu archivo
.\start_hls_stream.bat
```

**Opción B: Desde cámara USB**
1. Abre `start_hls_camera.bat`
2. Reemplaza `"USB Video Device"` con el nombre de tu cámara
3. Ejecuta el archivo

**Opción C: Comando manual**
```bash
ffmpeg -re -i "C:\video.mp4" ^
  -c:v libx264 -preset ultrafast -b:v 2000k ^
  -c:a aac -b:a 128k ^
  -hls_time 2 -hls_list_size 5 -hls_flags delete_segments ^
  "C:\Users\gusta\MapaTraficoFinal\public\streams\AA120JS\stream.m3u8"
```

### 4️⃣ Ver en el Mapa

1. Asegúrate de que el servidor está corriendo: `npm start`
2. Abre http://localhost:3003
3. Haz clic en una patrulla (ej: AA120JS)
4. El video debería aparecer automáticamente

---

## 📊 Arquitectura HLS

```
┌─────────────────────┐
│  FFmpeg (Patrulla)  │  ← Captura video + codifica
└──────────┬──────────┘
           │ (archivos .m3u8 y .ts)
           ▼
┌─────────────────────┐
│  public/streams/    │  ← Almacena segmentos
│  AA120JS/           │
└──────────┬──────────┘
           │ (HTTP)
           ▼
┌─────────────────────┐
│  Express Server     │  ← Sirve archivos (puerto 3003)
└──────────┬──────────┘
           │ (HTTP)
           ▼
┌─────────────────────┐
│  HLS.js (Navegador) │  ← Reproduce el stream
│  Mapa de COM        │
└─────────────────────┘
```

---

## 🔧 Parámetros Importantes

| Parámetro | Valor | Efecto |
|-----------|-------|--------|
| `-hls_time` | `2` | Duración de cada segmento (segundos) |
| `-hls_list_size` | `5` | Segmentos a mantener en memoria |
| `-b:v` | `2000k` | Bitrate de video (calidad/tamaño) |
| `-preset` | `ultrafast` | Velocidad de codificación |
| `-c:v` | `libx264` | Codec de video (H.264) |

**Para ajustar:**
- **Menor latencia**: `-hls_time 1 -hls_list_size 3`
- **Mejor calidad**: `-b:v 5000k -preset fast`
- **Menor ancho de banda**: `-b:v 500k -preset ultrafast`

---

## 📁 Estructura del Proyecto (HLS)

```
MapaTraficoFinal/
├── public/
│   ├── streams/                    ← 📹 Streams HLS
│   │   ├── AA120JS/
│   │   │   ├── stream.m3u8
│   │   │   ├── segment-0.ts
│   │   │   └── segment-1.ts
│   │   ├── HH457JK/
│   │   └── README.md
│   ├── index.html                  ← Actualizado con HLS.js
│   └── script.js                   ← Actualizado con verCamaraPatrulla()
│
├── server.js                       ← Actualizado con endpoint /streams/:patrolId/:filename
├── HLS_SETUP.md                    ← Documentación detallada
├── start_hls_stream.bat            ← Script Windows (archivo)
├── start_hls_camera.bat            ← Script Windows (cámara USB)
└── README.md                       ← Guía general actualizada
```

---

## 🐛 Solucionar Problemas

### "ffmpeg: comando no encontrado"
- Verifica que FFmpeg está en el PATH
- Reinicia PowerShell/CMD después de instalar
- Verifica: `ffmpeg -version`

### "Archivo no encontrado" o "No aparece video"
- Verifica que la carpeta existe: `public/streams/AA120JS/`
- Verifica que FFmpeg está escribiendo en esa carpeta
- Abre http://localhost:3003/streams/AA120JS/stream.m3u8 en navegador
  - Deberías ver el contenido del archivo .m3u8

### Video negro/sin contenido
- Espera 5-10 segundos después de iniciar FFmpeg
- Verifica que el archivo de video no está corrupto
- En DevTools (F12), revisa la consola por errores

### Latencia alta (>10 segundos)
- Reduce `-hls_time` a 1 o 1.5
- Reduce `-hls_list_size` a 3 o 4
- Aumenta `-preset` a `faster` o `fast`

---

## 📚 Documentación Completa

Para configuración avanzada (IP cameras, RTSP, multiple streams, etc.):
Ver **[HLS_SETUP.md](HLS_SETUP.md)**

---

## ✨ Ventajas de HLS

| Aspecto | HLS | WebRTC |
|--------|-----|--------|
| **Costo** | Gratis ✅ | Gratis (STUN) |
| **Latencia** | 2-4s | <1s |
| **Compatibilidad** | Todos navegadores ✅ | Limitada |
| **NAT/Firewall** | Funciona vía HTTP ✅ | Requiere TURN |
| **Configuración** | Simple ✅ | Compleja |
| **Ancho de banda** | Bajo ✅ | Variable |

---

**Estado**: ✅ Listo para usar  
**Última actualización**: Febrero 5, 2026
