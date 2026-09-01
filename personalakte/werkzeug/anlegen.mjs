#!/usr/bin/env node
/**
 * Füllt die Vorlagen mit den Daten einer Person und legt den Mitarbeiterordner an.
 *
 *   node personalakte/werkzeug/anlegen.mjs daten.json
 *   node personalakte/werkzeug/anlegen.mjs daten.json --vorlage aenderung/lohnanpassung.md
 *   node personalakte/werkzeug/anlegen.mjs daten.json --vorlage laufend/abmahnung.md \
 *        --setze DATUM_VORFALL=12.09.2026 --setze ANLASS="Unentschuldigtes Fehlen"
 *
 * Ohne --vorlage entsteht die komplette Einstellungsmappe.
 *
 * Am Ende steht, welche Platzhalter offen geblieben sind. Kein Dokument geht
 * mit einem {{...}} in den Druck.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = dirname(HIER);
const VORLAGEN = join(WURZEL, "vorlagen");
const ZIEL_WURZEL = join(WURZEL, "mitarbeiter");

/* ---------------------------------------------------------------- Argumente */

function argumenteLesen(argv) {
  const arg = { datei: "", vorlage: "", ordner: "", ueberschreiben: false, setze: {} };
  for (let i = 0; i < argv.length; i++) {
    const wert = argv[i];
    if (wert === "--vorlage") arg.vorlage = argv[++i] || "";
    else if (wert === "--ordner") arg.ordner = argv[++i] || "";
    else if (wert === "--ueberschreiben") arg.ueberschreiben = true;
    else if (wert === "--setze") {
      const paar = argv[++i] || "";
      const trenner = paar.indexOf("=");
      if (trenner > 0) arg.setze[paar.slice(0, trenner).trim()] = paar.slice(trenner + 1);
    } else if (!arg.datei) arg.datei = wert;
  }
  return arg;
}

/* -------------------------------------------------------------- Hilfsmittel */

const leer = (wert) => wert === null || wert === undefined || String(wert).trim() === "";
const text = (wert) => (leer(wert) ? "" : String(wert).trim());

/** 2026-10-01 wird zu 01.10.2026. Alles andere bleibt, wie es ist. */
function datum(wert) {
  const roh = text(wert);
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(roh);
  return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : roh;
}

function zahl(wert) {
  if (leer(wert)) return null;
  const n = Number(String(wert).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function komma(wert) {
  const n = zahl(wert);
  return n === null ? "" : String(n).replace(".", ",");
}

function euro(wert) {
  const n = zahl(wert);
  if (n === null) return text(wert);
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function slug(wert) {
  return text(wert)
    .toLowerCase()
    .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* --------------------------------------------------- Felder aus der App */

/** Spalte in employee_profiles -> Platzhalter. */
const AUS_APP = {
  first_name: "VORNAME", last_name: "NACHNAME", birthday: "GEBURTSDATUM",
  street: "STRASSE", address_addition: "ADRESSZUSATZ", postal_code: "PLZ",
  city: "ORT", country: "LAND", email: "EMAIL", phone: "TELEFON",
  employee_number: "MITARBEITERNUMMER", employment_type: "ANSTELLUNGSART",
  employee_group: "MITARBEITERGRUPPE", contract_start: "VERTRAGSBEGINN",
  contract_end: "VERTRAGSENDE", wage_type: "LOHNART", hourly_rate: "STUNDENLOHN",
  weekly_hours: "WOCHENSTUNDEN", hours_monday: "STUNDEN_MO", hours_tuesday: "STUNDEN_DI",
  hours_wednesday: "STUNDEN_MI", hours_thursday: "STUNDEN_DO", hours_friday: "STUNDEN_FR",
  hours_saturday: "STUNDEN_SA", hours_sunday: "STUNDEN_SO", gender: "GESCHLECHT",
  travel_time_allowed: "FAHRZEIT"
};

const TAGE = [
  ["STUNDEN_MO", "Mo"], ["STUNDEN_DI", "Di"], ["STUNDEN_MI", "Mi"],
  ["STUNDEN_DO", "Do"], ["STUNDEN_FR", "Fr"], ["STUNDEN_SA", "Sa"], ["STUNDEN_SO", "So"]
];

/* ---------------------------------------------------------------- Werte bauen */

function werteBauen(daten, firma, gesetzt) {
  const w = {};

  // Firmendaten zuerst, sie gelten für alle Dokumente.
  for (const [schluessel, wert] of Object.entries(firma)) w[schluessel.toUpperCase()] = text(wert);

  // Dann die Person: Feldnamen aus der App werden übersetzt, Platzhalter
  // direkt übernommen.
  for (const [schluessel, wert] of Object.entries(daten)) {
    const name = AUS_APP[schluessel] || schluessel.toUpperCase();
    w[name] = text(wert);
  }
  for (const [schluessel, wert] of Object.entries(gesetzt)) w[schluessel.toUpperCase()] = text(wert);

  // Datumsangaben einheitlich deutsch.
  for (const schluessel of ["GEBURTSDATUM", "VERTRAGSBEGINN", "VERTRAGSENDE", "AENDERUNG_AB",
    "KUENDIGUNGSDATUM", "LETZTER_ARBEITSTAG", "DATUM_VORFALL"]) {
    if (w[schluessel]) w[schluessel] = datum(w[schluessel]);
  }

  const heute = new Date();
  w.DATUM_HEUTE ||= new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(heute);
  w.JAHR ||= String(heute.getFullYear());

  // Anrede aus dem Geschlecht. Ohne Angabe bleibt beides stehen und wird von
  // Hand gestrichen — falsch anreden ist schlimmer als einmal streichen.
  const geschlecht = (w.GESCHLECHT || "").toLowerCase();
  const weiblich = geschlecht.startsWith("w");
  const maennlich = geschlecht.startsWith("m");
  w.ANREDE ||= weiblich ? "Frau" : maennlich ? "Herr" : "Frau/Herr";
  w.ANREDE_GEN ||= weiblich ? "ihren" : maennlich ? "seinen" : "ihren/seinen";
  w.ANREDE_AKK ||= weiblich ? "ihr" : maennlich ? "sein" : "ihr/sein";
  w.ANREDE_DAT ||= weiblich ? "ihr" : maennlich ? "ihm" : "ihr/ihm";

  // Rollenbezeichnungen in der richtigen Form. Eine Reinigungskraft heißt in
  // ihrem eigenen Vertrag nicht "der Arbeitnehmer", nur weil Vorlagen das seit
  // jeher so machen. Ohne Angabe zum Geschlecht bleiben beide Formen stehen.
  const formen = (kuerzel, weiblichesWort, maennlichesWort) => {
    const beide = (a, b) => `${a}/${b}`;
    const satz = {
      LABEL: weiblich ? weiblichesWort : maennlich ? maennlichesWort : beide(weiblichesWort, maennlichesWort),
      NOM: weiblich ? `die ${weiblichesWort}` : maennlich ? `der ${maennlichesWort}` : beide(`die ${weiblichesWort}`, `der ${maennlichesWort}`),
      AKK: weiblich ? `die ${weiblichesWort}` : maennlich ? `den ${maennlichesWort}` : beide(`die ${weiblichesWort}`, `den ${maennlichesWort}`),
      DAT: weiblich ? `der ${weiblichesWort}` : maennlich ? `dem ${maennlichesWort}` : beide(`der ${weiblichesWort}`, `dem ${maennlichesWort}`),
      GEN: weiblich ? `der ${weiblichesWort}` : maennlich ? `des ${maennlichesWort}s` : beide(`der ${weiblichesWort}`, `des ${maennlichesWort}s`)
    };
    for (const [fall, wert] of Object.entries(satz)) {
      w[`${kuerzel}_${fall}`] ||= wert;
      if (fall !== "LABEL") w[`${kuerzel}_${fall}_GROSS`] ||= wert.charAt(0).toUpperCase() + wert.slice(1);
    }
  };
  formen("AN", "Arbeitnehmerin", "Arbeitnehmer");
  formen("MA", "Mitarbeiterin", "Mitarbeiter");

  w.NAME ||= [w.VORNAME, w.NACHNAME].filter(Boolean).join(" ");
  w.ANSCHRIFT ||= [w.STRASSE, w.ADRESSZUSATZ, [w.PLZ, w.ORT].filter(Boolean).join(" ")]
    .filter(Boolean).join("\n");

  // Fahrzeit als Satz, nicht als true/false.
  if (w.FAHRZEIT === "true" || w.FAHRZEIT === "ja") w.FAHRZEIT = "ja, sie gilt als Arbeitszeit";
  else if (w.FAHRZEIT === "false" || w.FAHRZEIT === "nein") w.FAHRZEIT = "nein, Fahrzeiten werden nicht vergütet";

  // Stunden je Wochentag als Satz und als Grundlage für den Urlaub.
  const tageMitStunden = TAGE.filter(([schluessel]) => (zahl(w[schluessel]) || 0) > 0);
  if (!w.ARBEITSZEIT_TEXT) {
    w.ARBEITSZEIT_TEXT = tageMitStunden.length
      ? tageMitStunden.map(([schluessel, kurz]) => `${kurz} ${komma(w[schluessel])}`).join(", ") + " Stunden"
      : "nach Einsatzplan";
  }

  // Gesetzlicher Mindesturlaub: 24 Werktage bei sechs Arbeitstagen, also vier
  // Wochen. Wer mehr gewährt, trägt URLAUBSTAGE selbst ein.
  if (!w.URLAUBSTAGE && tageMitStunden.length) w.URLAUBSTAGE = String(Math.round(tageMitStunden.length * 4));

  if (w.STUNDENLOHN && !/€/.test(w.STUNDENLOHN)) w.STUNDENLOHN = euro(w.STUNDENLOHN);
  if (w.MONATSLOHN && !/€/.test(w.MONATSLOHN)) w.MONATSLOHN = euro(w.MONATSLOHN);
  if (w.WOCHENSTUNDEN) w.WOCHENSTUNDEN = komma(w.WOCHENSTUNDEN) || w.WOCHENSTUNDEN;

  if (!w.VERGUETUNG_TEXT) {
    if ((w.LOHNART || "").toLowerCase().startsWith("monat") && w.MONATSLOHN) {
      w.VERGUETUNG_TEXT = `ein monatliches Bruttogehalt von **${w.MONATSLOHN}**`;
    } else if (w.STUNDENLOHN) {
      w.VERGUETUNG_TEXT = `einen Stundenlohn von **${w.STUNDENLOHN}** brutto`;
    }
  }

  if (!w.MONAT_ENDE && w.KUENDIGUNGSDATUM) {
    const teile = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(w.KUENDIGUNGSDATUM);
    if (teile) {
      const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
        "August", "September", "Oktober", "November", "Dezember"];
      w.MONAT_ENDE = `${monate[Number(teile[2]) - 1]} ${teile[3]}`;
    }
  }

  return w;
}

/* ------------------------------------------------------------- Vorlage lesen */

function vorlageLesen(pfad) {
  const roh = readFileSync(pfad, "utf8");
  const kopf = {};
  let koerper = roh;
  if (roh.startsWith("---\n")) {
    const ende = roh.indexOf("\n---", 4);
    if (ende > 0) {
      for (const zeile of roh.slice(4, ende).split("\n")) {
        const trenner = zeile.indexOf(":");
        if (trenner > 0) {
          kopf[zeile.slice(0, trenner).trim()] = zeile.slice(trenner + 1).trim().replace(/^"|"$/g, "");
        }
      }
      koerper = roh.slice(ende + 4).replace(/^\n+/, "");
    }
  }
  return { kopf, koerper };
}

function fuellen(koerper, werte) {
  const offen = new Set();
  const gefuellt = koerper.replace(/\{\{([A-Z_0-9]+)\}\}/g, (treffer, name) => {
    const wert = werte[name];
    if (leer(wert)) { offen.add(name); return treffer; }
    return wert;
  });
  return { gefuellt, offen: [...offen] };
}

/* ------------------------------------------------------------------ Schreiben */

function schreiben(ziel, inhalt, ueberschreiben) {
  if (existsSync(ziel) && !ueberschreiben) {
    console.log(`  übersprungen (liegt schon): ${basename(ziel)}`);
    return false;
  }
  mkdirSync(dirname(ziel), { recursive: true });
  writeFileSync(ziel, inhalt, "utf8");
  return true;
}

/* ----------------------------------------------------------------------- Lauf */

const arg = argumenteLesen(process.argv.slice(2));
if (!arg.datei) {
  console.error("Aufruf: node personalakte/werkzeug/anlegen.mjs <daten.json> [--vorlage pfad] [--ordner name] [--setze KEY=WERT] [--ueberschreiben]");
  process.exit(1);
}

const firma = JSON.parse(readFileSync(join(HIER, "firma.json"), "utf8"));
const daten = JSON.parse(readFileSync(arg.datei, "utf8"));
const werte = werteBauen(daten, firma, arg.setze);

if (!werte.NAME) {
  console.error("In den Daten fehlt der Name (VORNAME und NACHNAME beziehungsweise first_name und last_name).");
  process.exit(1);
}

const ordner = arg.ordner || `${slug(werte.NACHNAME)}-${slug(werte.VORNAME)}`;
const ziel = join(ZIEL_WURZEL, ordner);

let vorlagen;
if (arg.vorlage) {
  vorlagen = [join(VORLAGEN, arg.vorlage)];
  if (!existsSync(vorlagen[0])) { console.error(`Vorlage nicht gefunden: ${vorlagen[0]}`); process.exit(1); }
} else {
  const einstellung = join(VORLAGEN, "einstellung");
  vorlagen = readdirSync(einstellung).filter((n) => n.endsWith(".md")).sort().map((n) => join(einstellung, n));
}

console.log(`\nPersonalakte: ${werte.NAME}`);
console.log(`Ordner:       personalakte/mitarbeiter/${ordner}\n`);

for (const unterordner of ["laufend", "aenderungen", "gesundheit", "austritt"]) {
  mkdirSync(join(ziel, unterordner), { recursive: true });
}

const offenGesamt = new Map();
let geschrieben = 0;

const gelesen = vorlagen
  .map((pfad) => ({ pfad, ...vorlageLesen(pfad) }))
  .sort((a, b) => (a.kopf.nummer || "").localeCompare(b.kopf.nummer || ""));

for (const { pfad, kopf, koerper } of gelesen) {
  const { gefuellt, offen } = fuellen(koerper, werte);

  const name = basename(pfad, ".md");
  let dateiname;
  let unterordner = "";
  if (arg.vorlage) {
    unterordner = kopf.ablage && kopf.ablage !== "einstellung" ? kopf.ablage : "";
    const heute = new Date().toISOString().slice(0, 10);
    dateiname = `${heute}-${name}.md`;
  } else {
    dateiname = kopf.nummer ? `${kopf.nummer}-${name}.md` : `${name}.md`;
  }

  const kopfzeile = [
    `<!-- ${kopf.titel || name}`,
    kopf.unterschrift ? `     Unterschrift: ${kopf.unterschrift}` : "",
    kopf.ausgabe ? `     Ausgabe: ${kopf.ausgabe}` : "",
    kopf.hinweis ? `     Hinweis: ${kopf.hinweis}` : "",
    `     Erzeugt am ${werte.DATUM_HEUTE} aus vorlagen/${pfad.slice(VORLAGEN.length + 1)} -->`
  ].filter(Boolean).join("\n") + "\n\n";

  if (schreiben(join(ziel, unterordner, dateiname), kopfzeile + gefuellt, arg.ueberschreiben)) {
    geschrieben++;
    console.log(`  ${join(unterordner, dateiname)}${offen.length ? `  — offen: ${offen.join(", ")}` : ""}`);
  }
  for (const name of offen) offenGesamt.set(name, (offenGesamt.get(name) || 0) + 1);
}

// Die Daten bleiben liegen, damit später nichts neu getippt werden muss.
schreiben(join(ziel, "daten.json"), JSON.stringify(daten, null, 2) + "\n", true);

console.log(`\n${geschrieben} Dokument(e) geschrieben.`);
if (offenGesamt.size) {
  console.log("\nOffene Platzhalter — vor dem Drucken füllen:");
  for (const [name, anzahl] of [...offenGesamt].sort()) {
    console.log(`  {{${name}}}  in ${anzahl} Dokument(en)`);
  }
} else {
  console.log("Kein Platzhalter offen geblieben.");
}
console.log("");
