"use client";

import { use } from "react";
import MitarbeiterApp from "../../MitarbeiterApp";

/**
 * Ziel der NFC-Aufkleber am Objekt.
 *
 * Auf dem Aufkleber steht die Adresse /mitarbeiter/nfc/<Objekt-Nummer>.
 * Beim Auflegen des Telefons öffnet das Betriebssystem diese Adresse, die App
 * sucht den heutigen Einsatz an diesem Objekt und zeigt die Stempeluhr.
 *
 * Bewusst kein Web-NFC: Das kann nur Chrome auf Android. Ein Aufkleber mit
 * Adresse funktioniert auf iPhone und Android gleichermaßen, ohne dass die App
 * vorher offen sein muss.
 */
export default function NfcSeite({ params }: { params: Promise<{ site: string }> }) {
  const { site } = use(params);
  return <MitarbeiterApp initialTab="clock" initialWorkSiteId={decodeURIComponent(site || "")} />;
}
