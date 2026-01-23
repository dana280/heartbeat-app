// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCY5K8DGFTgT1cwZrV1kIzOuyGVbU7ne3Y",
    authDomain: "heartbeat-29f68.firebaseapp.com",
    projectId: "heartbeat-29f68",
    storageBucket: "heartbeat-29f68.firebasestorage.app",
    messagingSenderId: "766353006822",
    appId: "1:766353006822:web:3a0d6cdb491af9525f1b27"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('Received background message:', payload);

    const notificationTitle = payload.notification?.title || '💕 HeartBeat';
    const notificationOptions = {
        body: payload.notification?.body || 'קיבלת פעימת לב!',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200, 100, 300],
        tag: 'heartbeat-notification',
        renotify: true,
        requireInteraction: true,
        data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open new window
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
