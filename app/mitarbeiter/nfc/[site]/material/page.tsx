"use client";

import { use } from "react";
import MitarbeiterApp from "../../../MitarbeiterApp";

/**
 * Ziel der Material-Aufkleber am Objekt.
 *
 * Auf dem Aufkleber steht die Adresse /mitarbeiter/nfc/<Objekt-Nummer>/material.
 * Beim Auflegen des Telefons geht das Bestellblatt für genau dieses Objekt auf,
 * mit den dort hinterlegten Artikeln.
 *
 * Getrennt vom Stempel-Aufkleber, weil der von allein einstempelt. Ein Aufkleber
 * für beides würde entweder ungewollt buchen oder das Einstempeln wieder um eine
 * Abfrage verlängern.
 */
export default function NfcMaterialSeite({ params }: { params: Promise<{ site: string }> }) {
  const { site } = use(params);
  return <MitarbeiterApp initialTab="material" initialAction="material" initialWorkSiteId={decodeURIComponent(site || "")} />;
}
