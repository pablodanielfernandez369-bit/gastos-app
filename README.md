# Mis gastos y ahorro

App personal para controlar gastos (Vivienda / Local·Negocio) e ingresos, con
carga por voz o texto en español, dashboard de capacidad de ahorro, avisos de
subas/bajas de precio mes a mes, reportes con gráficos y export a CSV. Todo
se guarda en el propio dispositivo (localStorage), sin backend ni login.

Es una PWA: se puede instalar como acceso directo en la pantalla de inicio
del celular.

## Probarla en la computadora

```
npm install
npm run dev
```

Abrí la URL que te muestra la terminal (por defecto `http://localhost:5173`).

## Subirla a internet (Render, gratis) para usarla desde el celular

1. Andá a **render.com** y entrá con tu cuenta (la misma que usaste para Moldea).
2. **New +** → **Static Site**.
3. Conectá el repo de GitHub **gastos-app**.
4. Configuración del sitio:
   - **Build Command:** `npm install && npm run build`
   - **Publish directory:** `dist`
5. Creá el sitio. Render te da una URL propia, algo como
   `https://gastos-app.onrender.com` (a diferencia de Moldea, al ser un sitio
   estático no se "duerme": abre siempre al toque).

## Agregarla a la pantalla de inicio del celular

1. Abrí la URL de Render en Chrome del celular.
2. Tocá el menú (⋮) → **Agregar a la pantalla de inicio** (o puede aparecer
   solo un cartel abajo ofreciéndolo).
3. Confirmá. Va a quedar un ícono como cualquier app; al abrirlo no se ve la
   barra del navegador.

Los datos se guardan en el navegador de ese celular. Si algún día cambiás de
celular o borrás los datos del navegador, usá **Ajustes → Backup** para
exportar/restaurar antes de perder algo.
