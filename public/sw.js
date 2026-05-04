self.addEventListener("push", (event) => {
  let data = {
    title: "CleanTrack",
    body: "Du hast eine neue Benachrichtigung.",
    url: "/mitarbeiter",
  };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "CleanTrack", {
      body: data.body || data.message || "Neue Benachrichtigung.",
      icon: "/logo.png",
      badge: "/logo.png",
      data: {
        url: data.url || "/mitarbeiter",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/mitarbeiter";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});
