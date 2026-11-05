/**
 * Stempeln ohne Netz.
 *
 * Im Keller, im Treppenhaus, hinter dicken Wänden gibt es keinen Empfang. Die
 * Seite ging dann nicht auf und es konnte nicht gestempelt werden (Ansage
 * 05.11.2026). Arbeitszeit darf daran nicht hängen: Der Stempel wird auf dem
 * Telefon festgehalten und übertragen, sobald wieder Netz da ist.
 *
 * Drei Teile:
 *   1. Der letzte Stand der App wird gespeichert, damit sie ohne Netz etwas
 *      anzeigen kann -- den heutigen Einsatz, das Objekt, den Zustand der Uhr.
 *   2. Stempel, die nicht durchgingen, kommen in eine Warteschlange.
 *   3. Sobald wieder Empfang da ist, wird die Warteschlange der Reihe nach
 *      abgearbeitet.
 *
 * Entscheidend ist die Uhrzeit. Übertragen wird später, gearbeitet wurde
 * vorher. Deshalb trägt jeder Stempel die Uhr des Telefons bei sich, und der
 * Server übernimmt sie -- nicht den Zeitpunkt des Hochladens (§ 17 Abs. 1
 * MiLoG: aufzuzeichnen ist, wann gearbeitet wurde).
 */

export type OfflineStempel = {
  id: string;
  /** Uhr des Telefons im Moment des Stempelns. */
  gestempeltAm: string;
  /** Was an /api/mobile/time-entry geschickt werden soll. */
  inhalt: Record<string, unknown>;
  /** Für die Anzeige, ohne den Inhalt auspacken zu müssen. */
  aktion: string;
  objekt: string;
  versuche: number;
  /** Gesetzt, wenn der Server den Stempel endgültig abgelehnt hat. */
  fehler?: string | null;
};

const SCHLUESSEL_STAND = "schichtklar-stand";
const SCHLUESSEL_WARTET = "schichtklar-wartet";

/** Älter als das wird nicht mehr übertragen, sondern vorgelegt. */
export const HOECHSTALTER_TAGE = 14;

function lesen<T>(schluessel: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const roh = window.localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as T) : null;
  } catch {
    return null;
  }
}

function schreiben(schluessel: string, wert: unknown) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

/**
 * Den Speicher des Browsers als dauerhaft anmelden.
 *
 * Ohne das räumt iOS ihn nach einigen Tagen ohne Benutzung weg. Dann wäre ein
 * wartender Stempel verloren. Fragt nur einmal, lehnt der Browser ab, läuft
 * alles wie bisher weiter.
 */
export async function speicherSichern() {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Stand

type GespeicherterStand = { gespeichertAm: string; stand: Record<string, unknown> };

/**
 * Den zuletzt geladenen Stand ablegen.
 *
 * Passt er nicht in den Speicher, wird er beschnitten: Einsätze und Stempel
 * der letzten und nächsten Tage reichen zum Stempeln, Chat und Verlauf nicht.
 */
export function standSpeichern(stand: Record<string, unknown>) {
  const paket: GespeicherterStand = { gespeichertAm: new Date().toISOString(), stand };
  if (schreiben(SCHLUESSEL_STAND, paket)) return true;
  return schreiben(SCHLUESSEL_STAND, { ...paket, stand: beschneiden(stand) });
}

function beschneiden(stand: Record<string, unknown>) {
  const grenze = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
  const liste = (wert: unknown) => (Array.isArray(wert) ? wert : []);
  return {
    ...stand,
    chatMessages: [],
    notifications: [],
    tasks: liste(stand.tasks).filter((zeile: any) => String(zeile?.task_date || "").slice(0, 10) >= grenze),
    timeEntries: liste(stand.timeEntries).filter((zeile: any) => String(zeile?.created_at || "") >= grenze)
  };
}

export function standLesen() {
  return lesen<GespeicherterStand>(SCHLUESSEL_STAND);
}

// --------------------------------------------------------- Warteschlange

export function wartende(): OfflineStempel[] {
  const liste = lesen<OfflineStempel[]>(SCHLUESSEL_WARTET);
  return Array.isArray(liste) ? liste : [];
}

function wartendeSetzen(liste: OfflineStempel[]) {
  schreiben(SCHLUESSEL_WARTET, liste);
}

/** Wartet noch auf Übertragung, Abgelehntes zählt nicht mit. */
export function anzahlWartend() {
  return wartende().filter((stempel) => !stempel.fehler).length;
}

export function abgelehnte() {
  return wartende().filter((stempel) => Boolean(stempel.fehler));
}

/**
 * Einen Stempel einreihen.
 *
 * Gibt den Eintrag zurück, damit der Bildschirm ihn sofort anzeigen kann --
 * wer stempelt, will sehen, dass es angekommen ist, auch ohne Netz.
 */
export function einreihen(inhalt: Record<string, unknown>, objekt: string): OfflineStempel {
  const stempel: OfflineStempel = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    gestempeltAm: new Date().toISOString(),
    inhalt,
    aktion: String(inhalt.action || ""),
    objekt,
    versuche: 0,
    fehler: null
  };
  wartendeSetzen([...wartende(), stempel]);
  // Damit der Hinweis oben in der App sofort erscheint und nicht erst beim
  // nächsten Durchlauf: die Stempeluhr steckt in einer anderen Komponente.
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WARTET_EREIGNIS));
  return stempel;
}

/** Name des Ereignisses, mit dem sich die App über neue Wartende meldet. */
export const WARTET_EREIGNIS = "schichtklar-wartend";

export function entfernen(id: string) {
  wartendeSetzen(wartende().filter((stempel) => stempel.id !== id));
}

/**
 * Die Warteschlange abarbeiten, der Reihe nach.
 *
 * Der Reihe nach, weil der Server die Abfolge prüft: Einstempeln vor Pause vor
 * Ausstempeln. Beim ersten Netzfehler wird abgebrochen und beim nächsten
 * Versuch weitergemacht -- nichts wird übersprungen, nichts doppelt gesendet.
 *
 * Lehnt der Server einen Stempel inhaltlich ab (400 bis 499), hilft kein
 * Wiederholen. Der Eintrag bleibt mit dem Grund stehen und wird dem
 * Mitarbeiter gezeigt, statt still zu verschwinden.
 */
export async function wartendeSenden(token: string) {
  const liste = wartende();
  const offen = liste.filter((stempel) => !stempel.fehler);
  if (!token || !offen.length) return { gesendet: 0, offen: offen.length, abgelehnt: 0 };

  let gesendet = 0;
  let abgelehnt = 0;

  for (const stempel of offen) {
    const zuAlt = Date.now() - new Date(stempel.gestempeltAm).getTime() > HOECHSTALTER_TAGE * 86400000;
    if (zuAlt) {
      vermerken(stempel.id, `Älter als ${HOECHSTALTER_TAGE} Tage, bitte im Büro eintragen lassen.`);
      abgelehnt += 1;
      continue;
    }

    let antwort: Response;
    try {
      antwort = await fetch("/api/mobile/time-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...stempel.inhalt, gestempeltAm: stempel.gestempeltAm, nachtraeglich: true })
      });
    } catch {
      // Kein Netz. Der Rest bleibt stehen und kommt beim nächsten Mal dran.
      break;
    }

    let ergebnis: any = {};
    try {
      ergebnis = await antwort.json();
    } catch {
      ergebnis = {};
    }

    if (antwort.ok && ergebnis?.ok) {
      entfernen(stempel.id);
      gesendet += 1;
      continue;
    }

    if (antwort.status >= 500) break; // Server hat gerade ein Problem, später erneut.

    vermerken(stempel.id, String(ergebnis?.error || `Abgelehnt (${antwort.status}).`));
    abgelehnt += 1;
  }

  return { gesendet, offen: anzahlWartend(), abgelehnt };
}

function vermerken(id: string, fehler: string) {
  wartendeSetzen(
    wartende().map((stempel) =>
      stempel.id === id ? { ...stempel, versuche: stempel.versuche + 1, fehler } : stempel
    )
  );
}

/**
 * Aus wartenden Stempeln Zeilen machen, wie sie aus der Datenbank kämen.
 *
 * Damit zeigt der Bildschirm ohne Netz denselben Zustand wie mit: wer
 * eingestempelt hat, sieht "In Arbeit" und kann Pause und Feierabend drücken.
 */
export function alsZeilen(mitarbeiter: string) {
  return wartende()
    .filter((stempel) => !stempel.fehler)
    .map((stempel) => ({
      id: stempel.id,
      task_id: stempel.inhalt.taskId ?? null,
      employee_name: mitarbeiter,
      work_site_id: stempel.inhalt.workSiteId ?? null,
      work_site_name: stempel.objekt || null,
      action: stempel.aktion,
      success: true,
      created_at: stempel.gestempeltAm,
      latitude: stempel.inhalt.latitude ?? null,
      longitude: stempel.inhalt.longitude ?? null,
      error_message: "Offline gestempelt, wartet auf Übertragung.",
      offline: true
    }));
}

/**
 * Dem Service Worker sagen, welche Aufkleber-Adressen er bereithalten soll.
 *
 * Der Aufkleber am Objekt öffnet /mitarbeiter/nfc/<Objekt>. Ohne Netz kann der
 * Browser diese Seite nur zeigen, wenn sie vorher einmal geladen wurde. Also
 * wird sie geladen, solange Empfang da ist -- für genau die Objekte, auf denen
 * dieser Mitarbeiter in den nächsten Tagen eingeteilt ist.
 */
export function nfcVorratMelden(objektIds: string[]) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  const adressen = Array.from(new Set(objektIds.filter(Boolean))).map(
    (id) => `/mitarbeiter/nfc/${encodeURIComponent(id)}`
  );
  if (!adressen.length) return;
  navigator.serviceWorker.controller.postMessage({ typ: "nfc-vorrat", adressen });
}
