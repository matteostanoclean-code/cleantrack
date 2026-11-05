/**
 * Offline-Stempeln.
 *
 * Im Objekt gibt es oft keinen Empfang. Gestempelt wird trotzdem: Die Buchung
 * wird mit dem ECHTEN Zeitpunkt auf dem Gerät gespeichert und später, sobald
 * wieder Netz da ist, automatisch an den Server geschickt.
 *
 * Aufbau:
 *   - Warteschlange der noch nicht übertragenen Stempelungen (IndexedDB)
 *   - Abbild der zuletzt geladenen Einsatzdaten, damit die App ohne Netz
 *     Einsätze, Objekte und den Stempelstand anzeigen kann
 *   - Übertragung der Reihe nach, mit Schutz gegen doppelte Buchungen
 *     (clientId + clientTime, der Server erkennt eine bereits gebuchte
 *     Stempelung wieder und bucht sie nicht zweimal)
 */

export type StempelAktion = "clock_in" | "break_start" | "break_end" | "clock_out";

export type WarteStempel = {
  clientId: string;
  /** Echter Zeitpunkt des Antippens, ISO. Wird so auch beim Server gebucht. */
  clientTime: string;
  taskId: string;
  employeeName: string;
  employeeId: string;
  action: StempelAktion;
  workSiteId: string | null;
  siteName: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  nfcObjekt: string;
  reason: string;
  expectedStartTime: string | null;
  /** "wartet" = geht noch raus, "abgelehnt" = der Server hat sie nicht angenommen. */
  status: "wartet" | "abgelehnt";
  fehler?: string;
  versuche: number;
};

export type Abbild = {
  data: unknown;
  token: string;
  gespeichertAm: string;
};

const DB_NAME = "schichtklar-offline";
const STORE = "kv";
const EVENT = "schichtklar-warteschlange";

/* ---------- einfacher Speicher (IndexedDB, notfalls localStorage) ---------- */

function oeffneDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB fehlt"));
      return;
    }
    const anfrage = indexedDB.open(DB_NAME, 1);
    anfrage.onupgradeneeded = () => {
      anfrage.result.createObjectStore(STORE);
    };
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  });
}

async function lesen<T>(schluessel: string): Promise<T | null> {
  try {
    const db = await oeffneDb();
    return await new Promise<T | null>((resolve, reject) => {
      const anfrage = db.transaction(STORE, "readonly").objectStore(STORE).get(schluessel);
      anfrage.onsuccess = () => resolve((anfrage.result as T) ?? null);
      anfrage.onerror = () => reject(anfrage.error);
    });
  } catch {
    try {
      const roh = window.localStorage.getItem(`${DB_NAME}:${schluessel}`);
      return roh ? (JSON.parse(roh) as T) : null;
    } catch {
      return null;
    }
  }
}

async function schreiben(schluessel: string, wert: unknown): Promise<void> {
  try {
    const db = await oeffneDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      if (wert === null) tx.objectStore(STORE).delete(schluessel);
      else tx.objectStore(STORE).put(wert, schluessel);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    try {
      if (wert === null) window.localStorage.removeItem(`${DB_NAME}:${schluessel}`);
      else window.localStorage.setItem(`${DB_NAME}:${schluessel}`, JSON.stringify(wert));
    } catch {
      /* Speicher voll oder gesperrt – nichts mehr zu retten. */
    }
  }
}

/** Schreibzugriffe auf die Warteschlange laufen nacheinander, nie gleichzeitig. */
let kette: Promise<unknown> = Promise.resolve();
function nacheinander<T>(arbeit: () => Promise<T>): Promise<T> {
  const naechster = kette.then(arbeit, arbeit);
  kette = naechster.catch(() => null);
  return naechster;
}

function melden() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/* ---------- Warteschlange ---------- */

export async function warteschlangeLaden(): Promise<WarteStempel[]> {
  const liste = await lesen<WarteStempel[]>("queue");
  return Array.isArray(liste) ? liste : [];
}

export function warteschlangeAbonnieren(aufruf: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, aufruf);
  return () => window.removeEventListener(EVENT, aufruf);
}

export function neueClientId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* weiter unten */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function stempelEinreihen(eintrag: WarteStempel) {
  return nacheinander(async () => {
    const liste = await warteschlangeLaden();
    if (!liste.some((e) => e.clientId === eintrag.clientId)) liste.push(eintrag);
    await schreiben("queue", liste);
    melden();
  });
}

function entfernen(clientId: string) {
  return nacheinander(async () => {
    const liste = (await warteschlangeLaden()).filter((e) => e.clientId !== clientId);
    await schreiben("queue", liste);
    melden();
  });
}

function aendern(clientId: string, aenderung: Partial<WarteStempel>) {
  return nacheinander(async () => {
    const liste = (await warteschlangeLaden()).map((e) => (e.clientId === clientId ? { ...e, ...aenderung } : e));
    await schreiben("queue", liste);
    melden();
  });
}

/** Eine abgelehnte Stempelung nach Kenntnisnahme aus der Liste nehmen. */
export function stempelVerwerfen(clientId: string) {
  return entfernen(clientId);
}

/* ---------- Abbild der Einsatzdaten ---------- */

export function abbildSpeichern(data: unknown, token: string) {
  return schreiben("abbild", { data, token, gespeichertAm: new Date().toISOString() } satisfies Abbild);
}

export function abbildLaden() {
  return lesen<Abbild>("abbild");
}

export function abbildLoeschen() {
  return schreiben("abbild", null);
}

/* ---------- Netz ---------- */

/** Anfrage mit Zeitlimit. Ohne Empfang hängt fetch sonst minutenlang. */
export async function fetchMitZeitlimit(url: string, init: RequestInit = {}, ms = 10000) {
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: abbruch.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Kein Netz, Zeitlimit oder Verbindungsabbruch – im Gegensatz zu einer Antwort des Servers. */
export function istNetzFehler(fehler: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (fehler instanceof DOMException && fehler.name === "AbortError") return true;
  return fehler instanceof TypeError;
}

/* ---------- Übertragung ---------- */

let laeuft = false;

export type SyncErgebnis = { gesendet: number; abgelehnt: number; offen: number; keinNetz: boolean };

/**
 * Schickt wartende Stempelungen der Reihe nach an den Server.
 *
 * Die Reihenfolge zählt: Einstempeln muss vor der Pause ankommen. Deshalb hört
 * die Übertragung beim ersten Netzfehler auf und versucht es später wieder.
 */
export async function warteschlangeSenden(tokenHolen: () => Promise<string>): Promise<SyncErgebnis> {
  const ergebnis: SyncErgebnis = { gesendet: 0, abgelehnt: 0, offen: 0, keinNetz: false };
  if (laeuft) return ergebnis;
  laeuft = true;
  try {
    const liste = (await warteschlangeLaden())
      .filter((e) => e.status === "wartet")
      .sort((a, b) => new Date(a.clientTime).getTime() - new Date(b.clientTime).getTime());

    for (let i = 0; i < liste.length; i += 1) {
      const e = liste[i];
      let antwort: Response;
      try {
        const token = await tokenHolen();
        antwort = await fetchMitZeitlimit(
          "/api/mobile/time-entry",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              taskId: e.taskId,
              employeeName: e.employeeName,
              employeeId: e.employeeId,
              action: e.action,
              latitude: e.latitude,
              longitude: e.longitude,
              accuracyM: e.accuracyM,
              nfcObjekt: e.nfcObjekt,
              reason: e.reason,
              expectedStartTime: e.expectedStartTime,
              clientId: e.clientId,
              clientTime: e.clientTime,
              offline: true
            })
          },
          15000
        );
      } catch {
        ergebnis.keinNetz = true;
        ergebnis.offen = liste.length - i;
        break;
      }

      let inhalt: { ok?: boolean; error?: string } | null = null;
      try {
        inhalt = await antwort.json();
      } catch {
        inhalt = null;
      }

      if (antwort.ok && inhalt?.ok) {
        await entfernen(e.clientId);
        ergebnis.gesendet += 1;
        continue;
      }

      // Anmeldung abgelaufen oder Serverfehler: nicht verwerfen, später erneut.
      if (antwort.status === 401 || antwort.status >= 500 || !inhalt) {
        await aendern(e.clientId, { versuche: e.versuche + 1 });
        ergebnis.offen = liste.length - i;
        break;
      }

      // Der Server hat die Buchung inhaltlich abgelehnt (z. B. falsche Reihenfolge).
      await aendern(e.clientId, { status: "abgelehnt", fehler: inhalt.error || "Vom Server abgelehnt.", versuche: e.versuche + 1 });
      ergebnis.abgelehnt += 1;
    }
    return ergebnis;
  } finally {
    laeuft = false;
  }
}

/* ---------- Seiten für den Aufkleber vorab ablegen ---------- */

const HUELLE = "schichtklar-v2-huelle";

/**
 * Legt die Seiten der NFC-Aufkleber (und deren Skripte) im Gerätespeicher ab.
 *
 * Ohne das öffnet ein Aufkleber, dessen Seite noch nie geladen wurde, im
 * Objekt gar nichts. Wird bei jedem Start mit Netz kurz im Hintergrund
 * aufgefrischt.
 */
export async function nfcSeitenVorladen(objektIds: string[]) {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const speicher = await caches.open(HUELLE);
    const ids = Array.from(new Set(objektIds.filter(Boolean))).slice(0, 30);
    const adressen = ["/mitarbeiter", ...ids.map((id) => `/mitarbeiter/nfc/${encodeURIComponent(id)}`)];

    for (const adresse of adressen) {
      try {
        const antwort = await fetchMitZeitlimit(adresse, { credentials: "same-origin" }, 8000);
        if (!antwort.ok) continue;
        const html = await antwort.clone().text();
        await speicher.put(new URL(adresse, window.location.origin).href, antwort);

        const dateien = Array.from(new Set(html.match(/\/_next\/static\/[^"'\\\s<>)]+\.(?:js|css)/g) || []));
        for (const datei of dateien) {
          const schon = await speicher.match(datei);
          if (schon) continue;
          try {
            const a = await fetchMitZeitlimit(datei, {}, 8000);
            if (a.ok) await speicher.put(datei, a);
          } catch {
            /* nächste Datei */
          }
        }
      } catch {
        /* ohne Netz einfach überspringen */
      }
    }
  } catch {
    /* nicht kritisch */
  }
}
