# 📱 Guía de Acceso - App Móvil Capa Norte y Capa Sur

## 🔗 Acceso desde tu celular

### Método 1: Desde el Navegador (Recomendado)

1. **Abre tu navegador móvil** (Chrome, Safari, Edge, etc.)
2. **Ingresa esta URL**:
   ```
   https://seguridad-mdp-v2.web.app/login.html
   ```

3. **Usa tus credenciales:**
   - **Capa Norte:**
     - Email: `capa-norte@seguridad-mdp.com`
     - Contraseña: *(tu contraseña)*
   
   - **Capa Sur:**
     - Email: `capa-sur@seguridad-mdp.com`
     - Contraseña: *(tu contraseña)*

4. **Presiona "Ingresar"** → ✅ Te llevará automáticamente a tu app

---

## 📲 Método 2: Agregar a la Pantalla de Inicio (iOS/Android)

Para que actúe como una app nativa:

### En iPhone/iPad (iOS):
1. Abre Safari
2. Navega a `https://seguridad-mdp-v2.web.app/login.html`
3. Presiona el botón **Compartir** (cuadro con flecha)
4. Selecciona **"Añadir a la pantalla de inicio"**
5. Confirma → Se crea un acceso directo estilo app

### En Android:
1. Abre Chrome
2. Navega a `https://seguridad-mdp-v2.web.app/login.html`
3. Presiona el **menú de 3 puntos** (⋮)
4. Selecciona **"Instalar app"** o **"Agregar a pantalla de inicio"**
5. Confirma → Se crea el acceso directo

---

## 🎯 Flujo de la App

Después del login, verás 2 tabs:

### 📋 **TAB "Nuevo"** - Crear Evento
- Formulario para registrar nuevos eventos
- Campos: Cámara, Ubicación, Tipo de Notificación, etc.
- Botón verde ✅ **Enviar** al Admin
- Botón gris ❌ **Cancelar**

### 📊 **TAB "Eventos"** - Ver Eventos
- Lista de todos tus eventos activos
- Para cada evento:
  - ✏️ **Editar** - Modifica el evento
  - 🗑️ **Eliminar** - Lo archiva (no se borra, se oculta en admin)

---

## 🎨 Diferenciación Visual

- **Capa Norte** → Encabezado **Azul**
- **Capa Sur** → Encabezado **Verde**

Esto te ayuda a identificar de inmediato en cuál capa estás

---

## ⚡ Características Móviles

✅ Diseño responsive (funciona en cualquier resolver)
✅ Botones grandes y fáciles de tocar
✅ Optimizado para conexiones lentes
✅ Offline-first (los datos se sincronizan cuando hay conexión)
✅ Safe Area Support (respeta notches en iPhones X+)
✅ Momentum scrolling (scroll suave como una app nativa)

---

## 🚀 Directo a App Móvil

Si ya estás logueado, puedes acceder directamente a:

- **Capa Norte:**
  ```
  https://seguridad-mdp-v2.web.app/capa-norte.html
  ```

- **Capa Sur:**
  ```
  https://seguridad-mdp-v2.web.app/capa-sur.html
  ```

> ⚠️ Nota: Te pedirá que inicies sesión si no estás autenticado

---

## 💡 Tips de Uso

1. **Botones touch:** Todos los botones tienen al menos 44x44 pixels (estándar mobile)
2. **Formulario largo:** Puedes hacer scroll normalmente
3. **Switching de tabs:** Toca los tabs en la parte superior
4. **Datos en tiempo real:** Los eventos se actualizan automáticamente desde Firebase
5. **Alertas:** Verás confirmaciones cuando envíes, edites o elimines eventos

---

## ❓ Problemas Comunes

**P: "Me quedé en blanco después de login"**
- A: Espera 2-3 segundos a que cargue la página. Si persiste, abre la consola (F12) y reporta errores.

**P: "No veo mis eventos anteriores"**
- A: Los eventos se cargan desde tu UID. Confirma que el email es correcto.

**P: "Mi pantalla se ve muy pequeña/grande"**
- A: Activa/desactiva el zoom en tu navegador (pinch o menu → zoom 100%)

**P: "Los campos no funcionan"**
- A: Asegúrate de tener conexión a internet (WiFi o datos). Firebase requiere conexión.

---

## 📞 URLs Útiles

- **App Capa Norte:** `https://seguridad-mdp-v2.web.app/capa-norte.html`
- **App Capa Sur:** `https://seguridad-mdp-v2.web.app/capa-sur.html`
- **Login (Inicio):** `https://seguridad-mdp-v2.web.app/login.html`
- **Mapa Admin:** `https://seguridad-mdp-v2.web.app/index.html`

---

Última actualización: **20/02/2026**
