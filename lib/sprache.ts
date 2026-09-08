/**
 * Gesprochene Sätze verstehen.
 *
 * Eingang für alles, was per Sprache hereinkommt: vom Handy diktiert, vom
 * Rechner zugerufen, oder schlicht getippt. Ein Satz, ein Eintrag.
 *
 * Zwei Grundsätze, die den ganzen Aufbau erklären:
 *
 * 1. **Namen werden gesucht, nicht geraten.** Eine Spracherkennung schreibt
 *    Eigennamen selten sauber. Statt aus dem Satz einen unbekannten Namen zu
 *    schneiden, wird andersherum vorgegangen: Die bekannten Objekte, Kunden
 *    und Mitarbeiter werden im Satz gesucht. Was nicht in den Listen steht,
 *    wird nicht erfunden.
 *
 * 2. **Bei Mehrdeutigkeit wird gefragt.** Passen zwei Objekte auf denselben
 *    Satz, gibt es beide zurück und keinen Vorschlag. Ein stiller Fehleintrag
 *    ist schlimmer als eine Rückfrage.
 *
 * Reines Rechnen, keine Datenbank und kein Sprachmodell. Damit ist es
 * vorhersagbar, kostenlos und einzeln prüfbar.
 */

export type Absicht = "zeit" | "notiz";

export type Verstanden = {
  absicht: Absicht;
  /** Der Satz ohne Anrede und Füllwörter. Wird zum Titel einer Notiz. */
  titel: string;
  /** ISO-Datum, wenn eines im Satz stand. */
  datum: string | null;
  /** Wie das Datum gemeint war — für die Rückfrage in Worten. */
  datumWortlaut: string | null;
  /** Dauer in Minuten, wenn eine genannt wurde. */
  minuten: number | null;
  /** Uhrzeit HH:MM, wenn eine genannt wurde. */
  beginn: string | null;
  ende: string | null;
  wichtig: boolean;
  /** Der Satz, wie er hereinkam. Bleibt zur Nachvollziehbarkeit erhalten. */
  original: string;
};

export type Treffer = { id: string; name: string };

const WOCHENTAGE = [
  ["sonntag"],
  ["montag"],
  ["dienstag"],
  ["mittwoch"],
  ["donnerstag"],
  ["freitag"],
  ["samstag", "sonnabend"]
];

const ZAHLWORTE: Record<string, number> = {
  eine: 1, einer: 1, ein: 1, eins: 1,
  zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7,
  acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12
};

/** Klein, ohne Umlaute, ohne Satzzeichen. Grundlage jedes Vergleichs. */
export function normal(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9,.:\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function iso(datum: Date) {
  const jahr = datum.getFullYear();
  const monat = String(datum.getMonth() + 1).padStart(2, "0");
  const tag = String(datum.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}

function tageAddieren(basis: Date, tage: number) {
  const neu = new Date(basis);
  neu.setDate(neu.getDate() + tage);
  return neu;
}

/**
 * Sucht ein Datum im Satz.
 *
 * Ein Wochentag ohne Zusatz meint den kommenden — wer "Freitag" sagt, plant
 * meist voraus. "Letzten Freitag" und "am vergangenen Freitag" gehen zurück.
 */
function datumFinden(text: string, heute: Date) {
  if (/\bvorgestern\b/.test(text)) return { datum: iso(tageAddieren(heute, -2)), wortlaut: "vorgestern" };
  if (/\bgestern\b/.test(text)) return { datum: iso(tageAddieren(heute, -1)), wortlaut: "gestern" };
  if (/\buebermorgen\b/.test(text)) return { datum: iso(tageAddieren(heute, 2)), wortlaut: "uebermorgen" };
  if (/\bmorgen\b/.test(text)) return { datum: iso(tageAddieren(heute, 1)), wortlaut: "morgen" };
  if (/\bheute\b/.test(text)) return { datum: iso(heute), wortlaut: "heute" };

  // 5.9. / 05.09. / 5.9.2026
  const punktDatum = text.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(\s?(\d{4}))?/);
  if (punktDatum) {
    const tag = Number(punktDatum[1]);
    const monat = Number(punktDatum[2]);
    const jahr = punktDatum[4] ? Number(punktDatum[4]) : heute.getFullYear();
    if (tag >= 1 && tag <= 31 && monat >= 1 && monat <= 12) {
      const kandidat = new Date(jahr, monat - 1, tag);
      // Ohne Jahresangabe und mehr als eine Woche in der Vergangenheit ist
      // fast immer das kommende Jahr gemeint.
      if (!punktDatum[4] && kandidat.getTime() < tageAddieren(heute, -7).getTime()) {
        kandidat.setFullYear(jahr + 1);
      }
      return { datum: iso(kandidat), wortlaut: `${tag}.${monat}.` };
    }
  }

  for (let nummer = 0; nummer < WOCHENTAGE.length; nummer += 1) {
    for (const name of WOCHENTAGE[nummer]) {
      if (!new RegExp(`\\b${name}\\b`).test(text)) continue;

      const zurueck = new RegExp(`\\b(letzten|letzte|vergangenen|vorigen)\\s+${name}\\b`).test(text);
      const abstandVor = (nummer - heute.getDay() + 7) % 7 || 7;
      const abstandZurueck = (heute.getDay() - nummer + 7) % 7 || 7;
      const ziel = zurueck ? tageAddieren(heute, -abstandZurueck) : tageAddieren(heute, abstandVor);
      return { datum: iso(ziel), wortlaut: `${zurueck ? "letzten " : ""}${name}` };
    }
  }

  return { datum: null, wortlaut: null };
}

/** Sucht eine Dauer und gibt sie in Minuten zurück. */
function dauerFinden(text: string) {
  const minuten = text.match(/\b(\d{1,3})\s*(minuten|minute|min)\b/);
  if (minuten) return Number(minuten[1]);

  if (/\banderthalb\s*(stunden|stunde|std)\b/.test(text)) return 90;
  if (/\b(eine\s+)?halbe\s+stunde\b/.test(text)) return 30;

  // "zweieinhalb Stunden"
  const undHalb = text.match(/\b([a-z]+)einhalb\s*(stunden|stunde|std|h)\b/);
  if (undHalb && ZAHLWORTE[undHalb[1]] !== undefined) return ZAHLWORTE[undHalb[1]] * 60 + 30;

  // "2,5 Stunden" oder "2.5 h"
  const komma = text.match(/\b(\d{1,2})[,.](\d{1,2})\s*(stunden|stunde|std|h)\b/);
  if (komma) return Math.round((Number(komma[1]) + Number(`0.${komma[2]}`)) * 60);

  const ziffer = text.match(/\b(\d{1,2})\s*(stunden|stunde|std|h)\b/);
  if (ziffer) return Number(ziffer[1]) * 60;

  const wort = text.match(/\b([a-z]+)\s+(stunden|stunde)\b/);
  if (wort && ZAHLWORTE[wort[1]] !== undefined) return ZAHLWORTE[wort[1]] * 60;

  return null;
}

function zweistellig(zahl: number) {
  return String(zahl).padStart(2, "0");
}

/** Sucht Uhrzeiten. "von 8 bis 10" ergibt Beginn und Ende. */
function zeitenFinden(text: string) {
  const spanne = text.match(/\bvon\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr\s*)?bis\s+(\d{1,2})(?:[:.](\d{2}))?\b/);
  if (spanne) {
    return {
      beginn: `${zweistellig(Number(spanne[1]))}:${spanne[2] || "00"}`,
      ende: `${zweistellig(Number(spanne[3]))}:${spanne[4] || "00"}`
    };
  }

  // "um halb elf" ist im Deutschen eine halbe Stunde VOR der genannten Zahl.
  const halb = text.match(/\bum\s+halb\s+([a-z]+)\b/);
  if (halb && ZAHLWORTE[halb[1]] !== undefined) {
    return { beginn: `${zweistellig(ZAHLWORTE[halb[1]] - 1)}:30`, ende: null };
  }

  const punkt = text.match(/\b(?:um\s+)?(\d{1,2}):(\d{2})\b/);
  if (punkt) return { beginn: `${zweistellig(Number(punkt[1]))}:${punkt[2]}`, ende: null };

  const uhr = text.match(/\bum\s+(\d{1,2})\s*(uhr)?\b/);
  if (uhr && Number(uhr[1]) <= 24) return { beginn: `${zweistellig(Number(uhr[1]))}:00`, ende: null };

  // "um zehn" — gesprochen sagt kaum jemand "um zehn Uhr null null".
  const alsWort = text.match(/\bum\s+([a-z]+)\s*(uhr)?\b/);
  if (alsWort && ZAHLWORTE[alsWort[1]] !== undefined) {
    return { beginn: `${zweistellig(ZAHLWORTE[alsWort[1]])}:00`, ende: null };
  }

  return { beginn: null, ende: null };
}

/**
 * Räumt den Satz zum Titel auf.
 *
 * Anrede und Befehlsfloskeln tragen nichts zur Notiz bei. Was übrig bleibt,
 * soll auf dem Zettel stehen können.
 */
function titelAus(original: string) {
  let text = String(original || "").trim();
  text = text.replace(/^\s*(hey|hallo|ok|okay)?\s*brutus[\s,.:!-]*/i, "");
  text = text.replace(/^\s*(bitte)?\s*(trag|trage|schreib|schreibe|notier|notiere|merk|merke)\s+(mir|dir|uns)?\s*/i, "");
  text = text.replace(/\s+(ein|auf|dazu)\s*[.!]?\s*$/i, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return String(original || "").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Zerlegt einen gesprochenen Satz.
 *
 * `heute` ist übergebbar, damit sich das Verhalten testen lässt, ohne auf
 * einen bestimmten Tag zu warten.
 */
export function verstehen(satz: string, heute = new Date()): Verstanden {
  const original = String(satz || "").trim();
  const text = normal(original);

  const { datum, wortlaut } = datumFinden(text, heute);
  const minuten = dauerFinden(text);
  const { beginn, ende } = zeitenFinden(text);

  // Eine Dauer oder ein ausdrückliches "gearbeitet" macht daraus eine Zeit.
  // Alles andere ist ein Zettel — im Zweifel lieber eine Notiz zu viel als
  // ein Eintrag in den Lohndaten.
  const nachZeit = /\b(gearbeitet|geputzt|stunden|stunde|std)\b/.test(text);
  const absicht: Absicht = minuten !== null && nachZeit ? "zeit" : "notiz";

  return {
    absicht,
    titel: titelAus(original),
    datum,
    datumWortlaut: wortlaut,
    minuten,
    beginn,
    ende: ende || null,
    wichtig: /\b(wichtig|dringend|eilt)\b/.test(text),
    original
  };
}

/**
 * Verschlüsselt ein Wort nach seinem Klang (Kölner Phonetik).
 *
 * Der Grund, warum es das hier gibt: Eine Spracherkennung, die offline auf
 * einem Handy läuft, kennt keine Ortsnamen. Aus "Nöttingen" wird "na dingen",
 * aus "Eisingen" schnell "ei singen". Buchstabenweise verglichen ist das
 * meilenweit auseinander — nach Klang ist es dasselbe.
 *
 * Das Verfahren stammt von Hans Joachim Postel (1969) und ist für Deutsch
 * gemacht, anders als das englische Soundex.
 */
export function phonetik(wort: string): string {
  const w = normal(wort).replace(/[^a-z]/g, "");
  if (!w) return "";

  const codes: string[] = [];

  for (let i = 0; i < w.length; i += 1) {
    const z = w[i];
    const naechster = w[i + 1] || "";
    const vorheriger = w[i - 1] || "";

    let code = "";
    switch (z) {
      case "a": case "e": case "i": case "j": case "o": case "u": case "y":
        code = "0"; break;
      case "h":
        code = ""; break;
      case "b":
        code = "1"; break;
      case "p":
        code = naechster === "h" ? "3" : "1"; break;
      case "d": case "t":
        code = "csz".includes(naechster) ? "8" : "2"; break;
      case "f": case "v": case "w":
        code = "3"; break;
      case "g": case "k": case "q":
        code = "4"; break;
      case "c":
        if (i === 0) code = "ahkloqrux".includes(naechster) ? "4" : "8";
        else if ("sz".includes(vorheriger)) code = "8";
        else code = "ahkoqux".includes(naechster) ? "4" : "8";
        break;
      case "x":
        code = "ckq".includes(vorheriger) ? "8" : "48"; break;
      case "l":
        code = "5"; break;
      case "m": case "n":
        code = "6"; break;
      case "r":
        code = "7"; break;
      case "s": case "z":
        code = "8"; break;
      default:
        code = "";
    }
    codes.push(code);
  }

  const kette = codes.join("");
  // Doppelte zusammenziehen, dann alle Nullen bis auf die erste streichen.
  let zusammen = "";
  for (const z of kette) if (z !== zusammen[zusammen.length - 1]) zusammen += z;
  return zusammen[0] + zusammen.slice(1).replace(/0/g, "");
}

/** Klangcode einer ganzen Wortfolge, Leerzeichen zählen nicht mit. */
function phonetikFolge(text: string) {
  return phonetik(text.replace(/\s+/g, ""));
}

/**
 * Sucht bekannte Namen im Satz.
 *
 * Zwei Durchgänge. Erst wörtlich — das ist eindeutig und soll immer gewinnen.
 * Findet sich nichts, wird nach Klang gesucht: Der Satz wird in Wortfenster
 * zerlegt und jedes mit dem Klangcode des Namens verglichen. So wird aus
 * "trage na dingen ein" doch noch "Nöttingen".
 *
 * Mehrwortnamen werden zuerst geprüft, damit "Bäckerei Maier" nicht schon an
 * "Maier" hängen bleibt.
 *
 * Gibt alle Treffer zurück, nie einen besten. Wer auswählt, entscheidet
 * bewusst — hier wird nichts geraten.
 */
export function namenSuchen(satz: string, kandidaten: Treffer[]): Treffer[] {
  const text = normal(satz);
  const gefunden: Treffer[] = [];

  for (const kandidat of kandidaten) {
    const name = normal(kandidat.name);
    if (name.length < 3) continue;
    if (text.includes(name)) gefunden.push(kandidat);
  }

  if (gefunden.length) {
    // Wörtlich gefunden. Hier ist der längere Name der richtige: steht
    // "Kindergarten Nöttingen" im Satz, ist nicht auch "Nöttingen" gemeint,
    // sondern es ist derselbe Name.
    gefunden.sort((a, b) => normal(b.name).length - normal(a.name).length);
    return gefunden.filter((eintrag, stelle) =>
      !gefunden.some((anderer, andereStelle) =>
        andereStelle < stelle && normal(anderer.name).includes(normal(eintrag.name))
      )
    );
  }

  {
    const woerter = text.split(" ").filter(Boolean);

    for (const kandidat of kandidaten) {
      const name = normal(kandidat.name);
      if (name.length < 4) continue;

      // Gesucht wird der ganze Name und zusätzlich jeder lange Wortteil.
      // "Königsbach-Stein" hätte gegen ein gesprochenes "Königsbach" sonst
      // nie eine Chance, weil das Ende fehlt.
      const namensteile = name.split(" ").filter((teil) => teil.length >= 7);
      const ziele = [
        { text: name, code: phonetikFolge(name) },
        ...namensteile.map((teil) => ({ text: teil, code: phonetik(teil) }))
      ].filter((ziel) => ziel.code.length >= 4);

      if (!ziele.length) continue;

      const teile = name.split(" ").length;
      let treffer = false;

      for (const breite of [teile, teile + 1, Math.max(1, teile - 1), 1]) {
        for (let start = 0; start + breite <= woerter.length; start += 1) {
          const fenster = woerter.slice(start, start + breite).join("");
          const gehoert = phonetik(fenster);

          for (const ziel of ziele) {
            if (gehoert === ziel.code) {
              treffer = true;
              break;
            }
            // Gleicher Anfang zählt auch. Bei verstümmelten Ortsnamen sitzt
            // der Anfang und das Ende zerfällt: aus "Königsbach" wird
            // "königs machen". Beide beginnen mit 4648.
            const langGenug = fenster.length >= 8 && ziel.text.length >= 8;
            const codesLangGenug = gehoert.length >= 5 && ziel.code.length >= 5;
            if (langGenug && codesLangGenug && gehoert.slice(0, 4) === ziel.code.slice(0, 4)) {
              treffer = true;
              break;
            }
          }
          if (treffer) break;
        }
        if (treffer) break;
      }

      if (treffer) gefunden.push(kandidat);
    }
  }

  // Nach Klang gefunden. Hier wird **nicht** aussortiert: Wenn "na dingen"
  // sowohl auf "Nöttingen" als auch auf "Kindergarten Nöttingen" passt, sind
  // das zwei echte Möglichkeiten. Die stillschweigend zu einer zu machen
  // hieße raten — es wird stattdessen zurückgefragt.
  gefunden.sort((a, b) => normal(b.name).length - normal(a.name).length);
  return gefunden;
}

// Für die halben Stunden: "2einhalb" liest sich niemand vor.
const HALBE: Record<number, string> = {
  1: "anderthalb",
  2: "zweieinhalb",
  3: "dreieinhalb",
  4: "viereinhalb",
  5: "fünfeinhalb",
  6: "sechseinhalb",
  7: "siebeneinhalb",
  8: "achteinhalb",
  9: "neuneinhalb",
  10: "zehneinhalb"
};

/** Minuten als gesprochene Dauer: 150 wird zu "zweieinhalb Stunden". */
export function dauerGesprochen(minuten: number) {
  if (minuten < 60) return `${minuten} Minuten`;
  const stunden = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (rest === 30 && HALBE[stunden]) return `${HALBE[stunden]} Stunden`;
  const wort = stunden === 1 ? "eine Stunde" : `${stunden} Stunden`;
  if (!rest) return wort;
  return `${wort} und ${rest} Minuten`;
}
