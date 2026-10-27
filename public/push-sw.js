// Notificaciones push (avisos de Mercado Pago). Lo importa el service worker
// que genera vite-plugin-pwa (ver workbox.importScripts en vite.config.js).
self.addEventListener('push', (event) => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(d.title || 'Gastos', {
      body: d.body || '',
      tag: d.tag,
      renotify: Boolean(d.tag),
      icon: '/pwa-192x192.png',
      badge: '/favicon-32.png',
    })
  );
});

// Tocar la notificación abre (o trae al frente) la app en el chat.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.length) {
        wins[0].postMessage({ type: 'open-chat' });
        return wins[0].focus();
      }
      return self.clients.openWindow('/?tab=asistente');
    })()
  );
});
