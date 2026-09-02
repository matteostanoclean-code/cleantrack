/**
 * Lieferantenrechnung erfassen.
 *
 * Matteo schickt die Rechnung, hier werden die Zeilen eingetragen. Weil die
 * Nettopreise schwanken, wird jede Rechnungszeile mit ihrem Datum
 * festgeschrieben statt den einen Preis am Artikel zu ueberschreiben. Der
 * Preis am Artikel wird nur nachgezogen, wenn diese Rechnung die neueste ist —
 * eine nachgereichte alte darf den aktuellen Stand nicht zurueckdrehen.
 *
 * Aufruf:
 *   node scripts/einkauf-erfassen.mjs rechnung.json
 *   node scripts/einkauf-erfassen.mjs rechnung.json --wirklich
 *
 * Ohne --wirklich wird nur gezeigt, was passieren wuerde. Das ist Absicht:
 * eine falsch gelesene Rechnung faellt in der Vorschau auf, in der Datenbank
 * erst Monate spaeter.
 *
 * Aufbau der JSON-Datei:
 * {
 *   "lieferant": "hygi.de",
 *   "rechnungsnummer": "RE-2026-1234",
 *   "datum": "2026-09-01",
 *   "zeilen": [
 *     { "artikel": "Toilettenpapier", "menge": 4, "einzelpreis": 12.90 },
 *     { "artikel": "Handtuchpapier",  "menge": 2, "einzelpreis": 18.50, "objekt": "EUROVIA Bau GmbH" }
 *   ]
 * }
 *
 * "objekt" ist optional und nur noetig, wenn es denselben Artikelnamen an
 * mehreren Objekten gibt — dann waere die Zuordnung sonst nicht eindeutig,
 * und geraten wird hier nichts.
 */

import { readFileSync } from "node:fs";

const datei = process.argv[2];
const wirklich = process.argv.includes("--wirklich");

if (!datei) {
  console.error("Aufruf: node scripts/einkauf-erfassen.mjs <rechnung.json> [--wirklich]");
  process.exit(1);
}

const umgebung = {};
for (const zeile of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const treffer = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (treffer) umgebung[treffer[1]] = treffer[2].replace(/^["']|["']$/g, "");
}
const url = umgebung.NEXT_PUBLIC_SUPABASE_URL;
const schluessel = umgebung.SUPABASE_SERVICE_ROLE_KEY || umgebung.SUPABASE_SERVICE_ROLE;
if (!url || !schluessel) {
  console.error("In .env.local fehlen NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const kopf = { apikey: schluessel, Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json", Prefer: "return=representation" };

const rechnung = JSON.parse(readFileSync(datei, "utf8"));
const datum = String(rechnung.datum || "").slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
  console.error(`Rechnungsdatum fehlt oder ist unbrauchbar: ${rechnung.datum}`);
  process.exit(1);
}

const artikel = await (await fetch(`${url}/rest/v1/material_products?select=id,name,unit,object_name,purchase_price,price_updated_at`, { headers: kopf })).json();

function passendeArtikel(name, objekt) {
  const gesucht = String(name || "").trim().toLowerCase();
  return artikel.filter((eintrag) => {
    if (String(eintrag.name || "").trim().toLowerCase() !== gesucht) return false;
    if (!objekt) return true;
    return String(eintrag.object_name || "").trim().toLowerCase() === String(objekt).trim().toLowerCase();
  });
}

const geplant = [];
const probleme = [];

for (const zeile of rechnung.zeilen || []) {
  const menge = Number(zeile.menge) || 1;
  const preis = Number(String(zeile.einzelpreis ?? "").toString().replace(",", "."));
  if (!Number.isFinite(preis)) {
    probleme.push(`${zeile.artikel}: kein brauchbarer Einzelpreis (${zeile.einzelpreis})`);
    continue;
  }

  const treffer = passendeArtikel(zeile.artikel, zeile.objekt);
  if (treffer.length > 1) {
    probleme.push(`${zeile.artikel}: ${treffer.length} Artikel mit diesem Namen (${treffer.map((t) => t.object_name || "ohne Objekt").join(", ")}). Bitte "objekt" angeben.`);
    continue;
  }

  const ziel = treffer[0] || null;
  const bisher = String(ziel?.price_updated_at || "").slice(0, 10);
  geplant.push({
    zeile,
    ziel,
    menge,
    preis,
    zieht: Boolean(ziel) && (!bisher || datum >= bisher),
    alt: ziel?.purchase_price ?? null
  });
}

console.log(`Rechnung ${rechnung.rechnungsnummer || "(ohne Nummer)"} von ${rechnung.lieferant || "(ohne Lieferant)"}, ${datum}\n`);
for (const p of geplant) {
  const zuordnung = p.ziel ? `${p.ziel.name} (${p.ziel.object_name || "ohne Objekt"})` : "NICHT ZUGEORDNET";
  const wechsel = p.zieht
    ? p.alt === null ? "  -> Preis wird erstmals gesetzt" : `  -> Preis ${p.alt} wird auf ${p.preis} nachgezogen`
    : p.ziel ? "  -> Preis bleibt, es gibt eine neuere Rechnung" : "";
  console.log(`  ${String(p.menge).padStart(4)} x ${String(p.preis.toFixed(2)).padStart(8)} EUR   ${zuordnung}${wechsel}`);
}
if (probleme.length) {
  console.log("\nOffen:");
  for (const p of probleme) console.log(`  ${p}`);
}
console.log(`\nSumme netto: ${geplant.reduce((s, p) => s + p.menge * p.preis, 0).toFixed(2)} EUR`);

if (!wirklich) {
  console.log("\nNur Vorschau. Mit --wirklich wird geschrieben.");
  process.exit(0);
}

for (const p of geplant) {
  const einkauf = {
    material_product_id: p.ziel?.id ?? null,
    article_name: p.zeile.artikel,
    supplier: rechnung.lieferant || null,
    invoice_number: rechnung.rechnungsnummer || null,
    invoice_date: datum,
    quantity: p.menge,
    unit_price: p.preis,
    total_net: p.menge * p.preis,
    unit: p.ziel?.unit || null,
    notes: p.zeile.bemerkung || null,
    created_by: "Brutus"
  };
  const antwort = await fetch(`${url}/rest/v1/material_purchases`, { method: "POST", headers: kopf, body: JSON.stringify(einkauf) });
  if (!antwort.ok) {
    console.error(`FEHLER bei ${p.zeile.artikel}: ${antwort.status} ${(await antwort.text()).slice(0, 200)}`);
    continue;
  }
  if (p.zieht) {
    await fetch(`${url}/rest/v1/material_products?id=eq.${p.ziel.id}`, {
      method: "PATCH", headers: kopf,
      body: JSON.stringify({ purchase_price: p.preis, price_updated_at: datum })
    });
  }
  console.log(`erfasst: ${p.zeile.artikel}`);
}
console.log("\nFertig.");
