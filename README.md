# Mis gastos y ahorro

App personal para controlar gastos (Vivienda / Local·Negocio) e ingresos, con
carga por formulario (o voz/texto para ingresos), dashboard de capacidad de
ahorro, avisos de subas/bajas de precio mes a mes, reportes con gráficos,
export a CSV, y un asistente conversacional (por voz o texto) que responde
cualquier pregunta sobre tus gastos usando la API de Claude. Los datos se
guardan en el propio dispositivo (localStorage), sin login.

Es una PWA: se puede instalar como acceso directo en la pantalla de inicio
del celular.

## Probarla en la computadora

```
npm install
npm run build
npm start
```

El asistente por IA necesita la variable de entorno `ANTHROPIC_API_KEY`
(conseguila en console.anthropic.com → Settings → API Keys). Sin esa
variable, el asistente sigue funcionando pero con el analizador local
más simple (reglas fijas, sin entender lenguaje libre).

Para desarrollo con recarga automática, en dos terminales:
```
ANTHROPIC_API_KEY=tu-key node server.js   # backend en :3000
npm run dev                                # frontend en :5173, proxea /api a :3000
```

## Subirla a internet (Render) para usarla desde el celular

Como ahora tiene un backend (el asistente por IA), va como **Web Service**,
no como sitio estático:

1. Andá a **render.com** y entrá con tu cuenta.
2. **New +** → **Web Service**.
3. Conectá el repo de GitHub **gastos-app**.
4. Configuración del servicio:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Antes de crear el servicio, agregá una variable de entorno:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** tu API key de Anthropic (nunca la pongas en el código ni la subas a git)
6. Creá el servicio. Render te da una URL propia, algo como
   `https://gastos-app.onrender.com`.

**Nota sobre el plan gratis de Render:** a diferencia de un sitio estático,
un Web Service en el plan free sí se "duerme" tras un rato sin uso, y tarda
unos 30-50 segundos en despertar la primera vez que se abre después de estar
dormido. Para uso personal normalmente no es un problema.

## Agregarla a la pantalla de inicio del celular

1. Abrí la URL de Render en Chrome del celular.
2. Tocá el menú (⋮) → **Agregar a la pantalla de inicio** (o puede aparecer
   solo un cartel abajo ofreciéndolo).
3. Confirmá. Va a quedar un ícono como cualquier app; al abrirlo no se ve la
   barra del navegador.

Los datos se guardan en el navegador de ese celular. Si algún día cambiás de
celular o borrás los datos del navegador, usá **Ajustes → Backup** para
exportar/restaurar antes de perder algo.
