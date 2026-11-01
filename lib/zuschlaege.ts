/**
 * Zeitzuschläge aus gestempelten Zeiten rechnen.
 *
 * QUELLE: Rahmentarifvertrag Gebäudereinigung vom 31.10.2019, § 3 Nr. 4.
 * Die Sätze stehen nicht hier, sondern in lib/tarifvorlagen.ts — dort tragen
 * sie ihre Fundstelle und wurden einzeln gegen den Text gehalten. Diese Datei
 * rechnet nur, sie entscheidet nichts.
 *
 * Drei Regeln, die den ganzen Aufbau erklären:
 *
 * 1. § 3 Nr. 4.2: Nachtarbeit ist die Arbeit von 22.00 bis 5.00 Uhr.
 * 2. § 3 Nr. 4.3: Sonn- und Feiertagsarbeit zählt von 0.00 bis 24.00 Uhr des
 *    jeweiligen Tages. Wer sonntags um 23 Uhr anfängt und bis 2 Uhr bleibt,
 *    hat zwei Stunden Sonntag und eine Stunde Nacht — nicht drei Stunden
 *    Sonntag. Deshalb wird jede Schicht an der Mitternacht geteilt.
 * 3. § 3 Nr. 4.8: Treffen mehrere Zeitzuschläge zusammen, wird nur der
 *    höchste gezahlt, nicht die Summe. Sonntagsarbeit in der Nacht ergibt
 *    also 80 %, nicht 110 %.
 *
 * Was das nicht ist: eine Lohnabrechnung. Es ist die Zahl, die man braucht,
 * um die Abrechnung der Lohnbuchhaltung nachzurechnen — und um vorher zu
 * sehen, was ein Einsatz an einem Feiertag wirklich kostet.
 */

import { TARIFVORLAGEN } from "@/lib/tarifvorlagen";

type AnyRow = Record<string, any>;

function satzVon(schluessel: string, ersatz: number) {
  const vorlage = TARIFVORLAGEN.find((zeile) => zeile.schluessel === schluessel);
  return vorlage && vorlage.einheit === "prozent" ? vorlage.hoehe : ersatz;
}

/** Die vier Tage mit 200 % statt 80 % (§ 3 Nr. 4.7 c, "genau diese vier Tage"). */
const HOHE_FEIERTAGE = ["neujahr", "tag der arbeit", "1. weihnachtsfeiertag", "2. weihnachtsfeiertag"];

export function istHoherFeiertag(name: unknown) {
  const text = String(name ?? "").trim().toLowerCase();
  return HOHE_FEIERTAGE.some((eintrag) => text.includes(eintrag));
}

export type Zuschlagsart = "hoher-feiertag" | "feiertag" | "sonntag" | "nacht";

export const ZUSCHLAGSARTEN: { art: Zuschlagsart; label: string; fundstelle: string }[] = [
  { art: "hoher-feiertag", label: "Hoher Feiertag", fundstelle: "§ 3 Nr. 4.7 c" },
  { art: "feiertag", label: "Feiertag", fundstelle: "§ 3 Nr. 4.7 b" },
  { art: "sonntag", label: "Sonntag", fundstelle: "§ 3 Nr. 4.7 b" },
  { art: "nacht", label: "Nacht", fundstelle: "§ 3 Nr. 4.7 a" }
];

export type Zuschlagsanteile = Record<Zuschlagsart, number>;

export const LEERE_ANTEILE: Zuschlagsanteile = {
  "hoher-feiertag": 0,
  feiertag: 0,
  sonntag: 0,
  nacht: 0
};

export function satzFuer(art: Zuschlagsart) {
  if (art === "hoher-feiertag") return satzVon("hohe-feiertage", 200);
  if (art === "feiertag" || art === "sonntag") return satzVon("sonn-feiertag", 80);
  return satzVon("nacht", 30);
}

function tagIso(zeit: Date) {
  return `${zeit.getFullYear()}-${String(zeit.getMonth() + 1).padStart(2, "0")}-${String(zeit.getDate()).padStart(2, "0")}`;
}

/**
 * Welcher Zuschlag gilt in diesem Augenblick? Nur einer, der höchste.
 * `feiertage` bildet Tag (2026-12-25) auf den Namen ab.
 */
function artFuer(zeit: Date, feiertage: Map<string, string>): Zuschlagsart | null {
  const name = feiertage.get(tagIso(zeit));
  if (name) return istHoherFeiertag(name) ? "hoher-feiertag" : "feiertag";
  if (zeit.getDay() === 0) return "sonntag";
  const stunde = zeit.getHours();
  if (stunde >= 22 || stunde < 5) return "nacht";
  return null;
}

/**
 * Eine gestempelte Zeit in Zuschlagsminuten zerlegen.
 *
 * Geteilt wird an jeder Grenze, die etwas ändern kann: Mitternacht, 5 Uhr,
 * 22 Uhr. Eingeordnet wird jedes Stück nach seiner Mitte — so fällt keine
 * Minute auf die falsche Seite einer Grenze.
 */
export function zuschlaegeFuerZeitraum(start: Date, ende: Date, feiertage: Map<string, string>): Zuschlagsanteile {
  const anteile: Zuschlagsanteile = { ...LEERE_ANTEILE };
  if (!(start instanceof Date) || !(ende instanceof Date)) return anteile;
  if (Number.isNaN(start.getTime()) || Number.isNaN(ende.getTime())) return anteile;
  if (ende <= start) return anteile;
  // Mehr als 24 Stunden ist keine Schicht, sondern ein vergessenes
  // Ausstempeln. Dafür wird nichts gerechnet.
  if (ende.getTime() - start.getTime() > 24 * 3600 * 1000) return anteile;

  const grenzen: number[] = [start.getTime(), ende.getTime()];
  const lauf = new Date(start);
  lauf.setHours(0, 0, 0, 0);
  while (lauf.getTime() <= ende.getTime()) {
    for (const stunde of [0, 5, 22]) {
      const punkt = new Date(lauf);
      punkt.setHours(stunde, 0, 0, 0);
      const zeit = punkt.getTime();
      if (zeit > start.getTime() && zeit < ende.getTime()) grenzen.push(zeit);
    }
    lauf.setDate(lauf.getDate() + 1);
  }

  const sortiert = Array.from(new Set(grenzen)).sort((a, b) => a - b);
  for (let i = 0; i < sortiert.length - 1; i += 1) {
    const von = sortiert[i];
    const bis = sortiert[i + 1];
    const minuten = (bis - von) / 60000;
    if (minuten <= 0) continue;
    const art = artFuer(new Date(von + (bis - von) / 2), feiertage);
    if (art) anteile[art] += minuten;
  }

  for (const art of Object.keys(anteile) as Zuschlagsart[]) anteile[art] = Math.round(anteile[art]);
  return anteile;
}

export function anteileAddieren(a: Zuschlagsanteile, b: Zuschlagsanteile): Zuschlagsanteile {
  const summe: Zuschlagsanteile = { ...LEERE_ANTEILE };
  for (const art of Object.keys(summe) as Zuschlagsart[]) summe[art] = (a[art] || 0) + (b[art] || 0);
  return summe;
}

export function zuschlagsMinuten(anteile: Zuschlagsanteile) {
  return (Object.keys(LEERE_ANTEILE) as Zuschlagsart[]).reduce((summe, art) => summe + (anteile[art] || 0), 0);
}

/**
 * Was die Zuschläge kosten, in Euro.
 *
 * Gerechnet wird der Zuschlag allein, nicht der Lohn: 30 % Nachtzuschlag auf
 * eine Stunde zu 15,00 € sind 4,50 €. Die 15,00 € selbst stehen schon in der
 * Lohnzeit.
 */
export function zuschlagsEuro(anteile: Zuschlagsanteile, stundensatz: number) {
  if (!Number.isFinite(stundensatz) || stundensatz <= 0) return 0;
  const summe = (Object.keys(LEERE_ANTEILE) as Zuschlagsart[]).reduce(
    (euro, art) => euro + ((anteile[art] || 0) / 60) * stundensatz * (satzFuer(art) / 100),
    0
  );
  return Math.round(summe * 100) / 100;
}

/** Feiertage aus den Einstellungen in die Form bringen, die hier gebraucht wird. */
export function feiertagsKarte(zeilen: AnyRow[]) {
  const karte = new Map<string, string>();
  for (const zeile of zeilen || []) {
    const datum = String(zeile?.datum ?? "").slice(0, 10);
    const name = String(zeile?.name ?? "").trim();
    if (datum && name) karte.set(datum, name);
  }
  return karte;
}
