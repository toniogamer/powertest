console.log('Service Worker cargado.');

self.addEventListener('push', event => {
    console.log('[Service Worker] Push Recibido.');

    const data = event.data.json();
    const title = data.title || 'Notificación de Power';
    const options = {
        body: data.body || 'Algo nuevo ha ocurrido.',
        // icon: 'images/icon.png', // Futuro: añadir un icono
    };

    event.waitUntil(self.registration.showNotification(title, options));
});
