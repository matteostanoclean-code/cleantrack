"use client";

import { useEffect } from "react";

/**
 * Den Service Worker auf jeder Seite anmelden, nicht nur in der App.
 *
 * Chrome bietet „App installieren" erst an, wenn auf der geöffneten Seite ein
 * Service Worker läuft. Registriert wurde er bisher aber erst in der
 * Mitarbeiter-App — wer auf der Startseite stand, bekam den Menüpunkt deshalb
 * nie zu sehen. Von außen sieht das aus, als ließe sich die App nicht
 * installieren.
 *
 * Steht im Rahmen um alle Seiten, macht sonst nichts und zeigt nichts an.
 */
export default function ServiceWorkerAnmeldung() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);

  return null;
}
