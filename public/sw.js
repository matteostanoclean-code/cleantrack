// Service Worker für Schichtklar.
//
// Zwei Aufgaben:
//   1. Push-Nachrichten anzeigen (wie bisher).
//   2. Die App-Hülle zwischenspeichern, damit sie auch bei schlechtem Empfang
//      sofort startet.
//
// Wichtig: Daten werden NICHT zwischengespeichert. Alles unter /api/ und alle
// Aufrufe zu fremden Adressen (Supabase) gehen immer ins Netz. Sonst würden
// Stempelzeiten oder Einsatzpläne veraltet angezeigt.

const VERSION = "schichtklar-v1";
const HUELLE = `${VERSION}-huelle`;

// Wird beim Einrichten geladen. Bewusst kurz gehalten.
const VORRAT = [
  "/mitarbeiter",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const speicher = await caches.open(HUELLE);
      // Einzeln, damit eine fehlende Datei nicht die ganze Einrichtung kippt.
      await Promise.all(VORRAT.map((adresse) => speicher.add(adresse).catch(() => null)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const namen = await caches.keys();
      await Promise.all(
        namen.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function istStatisch(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|ico|webp)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const anfrage = event.request;

  // Nur einfache Abrufe. Alles, was etwas verändert, bleibt unberührt.
  if (anfrage.method !== "GET") return;

  const url = new URL(anfrage.url);

  // Fremde Adressen (Supabase, Karten) nicht anfassen.
  if (url.origin !== self.location.origin) return;

  // Daten immer frisch.
  if (url.pathname.startsWith("/api/")) return;

  // Seitenaufrufe: erst Netz, bei Ausfall der zuletzt bekannte Stand.
  if (anfrage.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const antwort = await fetch(anfrage);
          const speicher = await caches.open(HUELLE);
          speicher.put(anfrage, antwort.clone()).catch(() => null);
          return antwort;
        } catch (fehler) {
          const speicher = await caches.open(HUELLE);
          const gespeichert = await speicher.match(anfrage);
          if (gespeichert) return gespeichert;
          const huelle = await speicher.match("/mitarbeiter");
          if (huelle) return huelle;
          return new Response(
            "<!doctype html><meta charset='utf-8'><title>Offline</title>" +
              "<div style=\"font-family:system-ui;padding:2rem;color:#1f2937\">" +
              "<h1 style='font-size:1.25rem'>Keine Verbindung</h1>" +
              "<p>Die App ist gerade offline. Sobald wieder Empfang da ist, lädt sie von selbst.</p></div>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
          );
        }
      })()
    );
    return;
  }

  // Statische Dateien: aus dem Speicher, sonst holen und merken.
  if (istStatisch(url)) {
    event.respondWith(
      (async () => {
        const speicher = await caches.open(HUELLE);
        const gespeichert = await speicher.match(anfrage);
        if (gespeichert) return gespeichert;
        const antwort = await fetch(anfrage);
        if (antwort && antwort.status === 200) {
          speicher.put(anfrage, antwort.clone()).catch(() => null);
        }
        return antwort;
      })()
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { title: "Schichtklar", body: event.data ? event.data.text() : "Neue Meldung" };
  }

  const title = data.title || "Schichtklar";
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
