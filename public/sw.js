self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { title: "CleanTrack Pro", body: event.data ? event.data.text() : "Neue Meldung" };
  }

  const title = data.title || "CleanTrack Pro";
  const options = {
    body: data.body || data.message || "Neue Meldung in der App",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: data.url || "/mitarbeiter/notifications"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/mitarbeiter/notifications";
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client) {
        client.navigate(targetUrl);
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});
