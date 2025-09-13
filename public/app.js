const subscribeButton = document.getElementById('subscribe-button');

if ('serviceWorker' in navigator && 'PushManager' in window) {
    console.log('Service Worker y Push son soportados.');

    subscribeButton.addEventListener('click', () => {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('Permiso de notificación concedido.');
                registerServiceWorker();
            } else {
                console.error('Permiso de notificación denegado.');
            }
        });
    });
} else {
    console.error('Push messaging no es soportado');
    subscribeButton.textContent = 'Push no soportado';
}

async function registerServiceWorker() {
    try {
        const serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registrado con éxito.');
        alert('¡Te has suscrito a las notificaciones! (Paso 1 de 2 completado)');
        // El siguiente paso es obtener la suscripción y enviarla al servidor.
        // Lo implementaremos después.
    } catch (error) {
        console.error('Error al registrar el Service Worker:', error);
    }
}
