/**
 * Koordinaten der Objekte aus den Anschriften nachziehen.
 *
 * Gebraucht wird das, wenn Anschriften nachgetragen oder korrigiert wurden:
 * beim Speichern einer Objektmaske sucht die App zwar selbst, aber nur fuer
 * das eine Objekt, das gerade offen ist. Hier laufen alle durch.
 *
 * Aufruf:
 *   node scripts/objekt-koordinaten.mjs
 *   node scripts/objekt-koordinaten.mjs --wirklich
 *
 * Ohne --wirklich wird nur gezeigt, was sich aendern wuerde. Ein falscher
 * Standort faellt in der Vorschau auf, in der Datenbank erst, wenn jemand
 * vor Ort nicht stempeln kann.
 *
 * Geschrieben wird nur, was geprueft ist: der Treffer muss in derselben
 * Postleitzahl oder demselben Ort liegen wie die Anschrift. Nominatim
 * antwortet sonst auch mal mit einer gleichnamigen Strasse 40 km weiter --
 * genau so sind die falschen Punkte in der Liste entstanden.
 */

import { readFileSync } from "node:fs";

const wirklich = process.argv.includes("--wirklich");

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
const kopf = { apikey: schluessel, Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json" };

const sauber = (wert) => String(wert ?? "").trim();

/** Luftlinie in Metern, damit sichtbar wird, wie weit ein Punkt springt. */
function abstand(breiteA, laengeA, breiteB, laengeB) {
  const bogen = (grad) => (grad * Math.PI) / 180;
  const erde = 6371000;
  const db = bogen(breiteB - breiteA);
  const dl = bogen(laengeB - laengeA);
  const a = Math.sin(db / 2) ** 2 + Math.cos(bogen(breiteA)) * Math.cos(bogen(breiteB)) * Math.sin(dl / 2) ** 2;
  return Math.round(erde * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Liegt der Treffer dort, wo die Anschrift hingehoert?
 *
 * Postleitzahl zuerst, die ist eindeutig. Sonst der Ortsname -- bei
 * "Karlsbad - Langensteinbach" reicht, dass ein Teil davon passt.
 */
function passtZurAnschrift(treffer, plz, ort) {
  const adresse = treffer.address || {};
  if (plz && sauber(adresse.postcode)) return sauber(adresse.postcode) === plz;

  const orte = [adresse.city, adresse.town, adresse.village, adresse.municipality, adresse.suburb, adresse.city_district]
    .map((wert) => sauber(wert).toLowerCase())
    .filter(Boolean);
  if (!orte.length || !ort) return false;
  const teile = ort.toLowerCase().split(/[-\s]+/).map((teil) => teil.trim()).filter((teil) => teil.length > 3);
  return teile.some((teil) => orte.some((name) => name.includes(teil) || teil.includes(name)));
}

async function nominatim(parameter) {
  const adresse = new URL("https://nominatim.openstreetmap.org/search");
  for (const [feld, wert] of Object.entries(parameter)) adresse.searchParams.set(feld, wert);
  adresse.searchParams.set("country", "Germany");
  adresse.searchParams.set("format", "json");
  adresse.searchParams.set("addressdetails", "1");
  adresse.searchParams.set("limit", "5");

  const antwort = await fetch(adresse.toString(), {
    headers: { "User-Agent": "schichtklar/1.0 (kontakt@matteostano-clean.de)" },
    cache: "no-store"
  });
  if (!antwort.ok) return [];
  const treffer = await antwort.json();
  return Array.isArray(treffer) ? treffer : [];
}

/**
 * Drei Anlaeufe, in dieser Reihenfolge:
 *   1. strukturiert, wie die App es beim Speichern macht
 *   2. "Strasse" ausgeschrieben -- Nominatim kennt "Dorfwiesenstr." nicht immer
 *   3. als ein Satz, da ist die Suche am nachsichtigsten
 * Genommen wird der erste Treffer, der zur Postleitzahl oder zum Ort passt.
 */
async function suchen(strasse, plz, ort) {
  const lang = strasse.replace(/str\.(\s|$)/i, "straße$1").replace(/\bstr\b\.?/i, "straße");
  const versuche = [
    { was: "strukturiert", parameter: { street: strasse, postalcode: plz, city: ort } },
    { was: "ausgeschrieben", parameter: { street: lang, postalcode: plz, city: ort } },
    { was: "ein Satz", parameter: { q: [strasse, [plz, ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") } }
  ];

  for (const versuch of versuche) {
    const parameter = Object.fromEntries(Object.entries(versuch.parameter).filter(([, wert]) => sauber(wert)));
    if (!Object.keys(parameter).length) continue;
    const treffer = await nominatim(parameter);
    await new Promise((weiter) => setTimeout(weiter, 1100)); // Nominatim: hoechstens eine Anfrage je Sekunde
    const passend = treffer.find((eintrag) => passtZurAnschrift(eintrag, plz, ort));
    if (passend) return { breite: Number(passend.lat), laenge: Number(passend.lon), was: versuch.was, fund: passend.display_name };
    if (treffer.length && versuch === versuche[versuche.length - 1]) {
      return { daneben: true, fund: treffer[0].display_name };
    }
  }
  return null;
}

const antwort = await fetch(
  `${url}/rest/v1/work_sites?select=id,name,object_number,street,postal_code,city,latitude,longitude&order=object_number`,
  { headers: kopf }
);
if (!antwort.ok) {
  console.error(await antwort.text());
  process.exit(1);
}
const objekte = await antwort.json();

const geaendert = [];
const unveraendert = [];
const ohneAnschrift = [];
const unsicher = [];

for (const objekt of objekte) {
  const strasse = sauber(objekt.street);
  const plz = sauber(objekt.postal_code);
  const ort = sauber(objekt.city);
  const name = sauber(objekt.name);

  if (!strasse || (!plz && !ort)) {
    ohneAnschrift.push(name);
    continue;
  }

  const gefunden = await suchen(strasse, plz, ort);
  if (!gefunden || gefunden.daneben) {
    unsicher.push({ name, anschrift: `${strasse}, ${plz} ${ort}`, fund: gefunden?.fund || "kein Treffer" });
    continue;
  }

  const altBreite = objekt.latitude === null ? null : Number(objekt.latitude);
  const altLaenge = objekt.longitude === null ? null : Number(objekt.longitude);
  const weg = altBreite === null || altLaenge === null ? null : abstand(altBreite, altLaenge, gefunden.breite, gefunden.laenge);

  if (weg !== null && weg < 15) {
    unveraendert.push(name);
    continue;
  }

  geaendert.push({
    id: objekt.id,
    name,
    anschrift: `${strasse}, ${plz} ${ort}`,
    alt: altBreite === null ? "--" : `${altBreite.toFixed(6)} / ${altLaenge.toFixed(6)}`,
    neu: `${gefunden.breite.toFixed(6)} / ${gefunden.laenge.toFixed(6)}`,
    weg,
    was: gefunden.was,
    breite: gefunden.breite,
    laenge: gefunden.laenge
  });
}

console.log(`\n${geaendert.length} Objekte bekommen neue Koordinaten:\n`);
for (const eintrag of geaendert) {
  const sprung = eintrag.weg === null ? "war leer" : `${eintrag.weg} m weiter`;
  console.log(`  ${eintrag.name}`);
  console.log(`    ${eintrag.anschrift}`);
  console.log(`    alt ${eintrag.alt}   neu ${eintrag.neu}   (${sprung}, ${eintrag.was})`);
}

if (unsicher.length) {
  console.log(`\n${unsicher.length} Objekte bleiben, wie sie sind -- kein sicherer Treffer:\n`);
  for (const eintrag of unsicher) console.log(`  ${eintrag.name} (${eintrag.anschrift}) -> ${eintrag.fund}`);
}
if (ohneAnschrift.length) console.log(`\nOhne Anschrift, nicht zu suchen: ${ohneAnschrift.join(", ")}`);
if (unveraendert.length) console.log(`\nUnveraendert (unter 15 m): ${unveraendert.length} Objekte`);

if (!wirklich) {
  console.log("\nVorschau. Zum Schreiben noch einmal mit --wirklich.");
  process.exit(0);
}

let geschrieben = 0;
for (const eintrag of geaendert) {
  const antwortSchreiben = await fetch(`${url}/rest/v1/work_sites?id=eq.${eintrag.id}`, {
    method: "PATCH",
    headers: kopf,
    body: JSON.stringify({ latitude: eintrag.breite, longitude: eintrag.laenge })
  });
  if (!antwortSchreiben.ok) {
    console.error(`FEHLER bei ${eintrag.name}: ${await antwortSchreiben.text()}`);
    continue;
  }
  geschrieben += 1;
}
console.log(`\n${geschrieben} Objekte geschrieben.`);
