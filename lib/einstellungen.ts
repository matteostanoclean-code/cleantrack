/**
 * Betriebsweite Einstellungen.
 *
 * Hier stehen die Vorgabewerte. Sie sind nicht nur Notnagel fuer den Fall,
 * dass die Tabelle fehlt — sie sind auch die Wahrheit darueber, welche
 * Schluessel es ueberhaupt gibt. Wer eine neue Einstellung braucht, traegt sie
 * hier ein, und sie ist ueberall bekannt.
 *
 * Gelesen wird immer mit einer Zusammenfuehrung: gespeicherter Wert schlaegt
 * Vorgabe, fehlt der Wert, gilt die Vorgabe. So kann eine halb gefuellte
 * Tabelle nie dazu fuehren, dass irgendwo "undefined" ankommt.
 */

type AnyRow = Record<string, any>;

export const VORGABEN = {
  firma: {
    name: "Matteo Stano Clean Gebäudereinigung",
    strasse: "",
    plz: "",
    ort: "",
    land: "DE Deutschland",
    zusatz: "",
    telefon: "",
    email: "",
    web: ""
  },
  steuer: {
    ust_id: "",
    steuernummer: "",
    hr_nummer: "",
    waehrung: "EUR",
    mwst_ausweis: true,
    geschaeftsfuehrung: "",
    mandantennummer: "",
    beraternummer: ""
  },
  chat: {
    uebersetzer: true,
    sprachnachrichten: true,
    logbuch_mitarbeiter: false,
    logbuch_kunden: false
  },
  kalender: {
    wochen_taktung: 30
  },
  auftrag: {
    kostenstelle: "keine",
    exporte_aufteilen: false,
    abweichende_rechnungsadresse: false
  },
  zeit: {
    fehler_standort: true,
    fehler_standort_freigabe: true,
    fehler_freie_zeit: true,
    fehler_nachtrag: true,
    unter_prozent: 25,
    unter_minuten: 10,
    auf_soll_aufrunden: false,
    ueber_minuten: 5,
    gps_aktiv: true,
    gps_toleranz_m: 150,
    fahrzeit_aktiv: false,
    fahrzeit_zwischenzeit: "03:00",
    fahrzeit_lohnnummer: "22"
  },
  abwesenheit: {
    urlaubsanspruch: 30,
    wartezeit_aktiv: true,
    wartezeit_monate: 6,
    uebertrag_tage: 5,
    resturlaub_aktiv: true,
    verfall: "3 Monate nach Ende des Zyklus",
    kunden_benachrichtigen: false,
    kunden_text: ""
  },
  lohn: {
    abrechnungstag: 31,
    nacht_von: "22:00",
    nacht_bis: "05:00",
    land: "Deutschland",
    region: "Baden-Württemberg"
  }
};

export type Einstellungen = typeof VORGABEN;
export type EinstellungsSchluessel = keyof Einstellungen;

/** Welche Listen es gibt. Was nicht hier steht, wird von der Route abgelehnt. */
export const LISTEN = [
  "auftragsarten",
  "abwesenheitsarten",
  "lohnarten",
  "zuschlaege",
  "feiertage",
  "rechtegruppen",
  "lieferanten",
  "geraetetypen",
  "aufgabentypen",
  // Lohnkosten je Monat, als eine Zahl aus der Lohnabrechnung. Liegt hier,
  // weil es dieselbe Form hat wie eine Stammliste: ein Name (der Monat) und
  // ein paar Werte dahinter. Eine eigene Tabelle dafür wäre Aufwand ohne
  // Gegenwert.
  "monatskosten"
] as const;

export type ListenName = (typeof LISTEN)[number];

export function istListe(wert: unknown): wert is ListenName {
  return LISTEN.includes(String(wert ?? "") as ListenName);
}

/** Gespeicherte Werte auf die Vorgaben legen, Schlüssel für Schlüssel. */
export function zusammenfuehren(zeilen: AnyRow[]): Einstellungen {
  const ergebnis: AnyRow = {};
  for (const [schluessel, vorgabe] of Object.entries(VORGABEN)) {
    const gespeichert = zeilen.find((zeile) => String(zeile.key) === schluessel)?.value;
    ergebnis[schluessel] = { ...(vorgabe as AnyRow), ...(gespeichert && typeof gespeichert === "object" ? gespeichert : {}) };
  }
  return ergebnis as Einstellungen;
}

/**
 * Einstellungen laden. Fehlt die Tabelle noch, kommen die Vorgaben zurück —
 * die App läuft weiter, statt mit einem Fehler stehenzubleiben.
 */
export async function einstellungenLaden(supabase: AnyRow): Promise<Einstellungen> {
  try {
    const ergebnis = await supabase.from("app_settings").select("key, value");
    if (ergebnis.error) return zusammenfuehren([]);
    return zusammenfuehren((ergebnis.data || []) as AnyRow[]);
  } catch {
    return zusammenfuehren([]);
  }
}

/**
 * Die Grenzen für die Zeitenfreigabe, fertig für buildRecords.
 *
 * Liegt hier und nicht in lib/zeiten.ts, damit die Zeitrechnung nichts von der
 * Datenbank wissen muss — sie bekommt Zahlen, sonst nichts.
 */
export async function zeitgrenzenLaden(supabase: AnyRow) {
  const werte = await einstellungenLaden(supabase);
  const zahl = (wert: unknown, vorgabe: number) => {
    const gelesen = Number(wert);
    return Number.isFinite(gelesen) && gelesen >= 0 ? gelesen : vorgabe;
  };
  return {
    unter_prozent: zahl(werte.zeit.unter_prozent, VORGABEN.zeit.unter_prozent),
    unter_minuten: zahl(werte.zeit.unter_minuten, VORGABEN.zeit.unter_minuten),
    ueber_minuten: zahl(werte.zeit.ueber_minuten, VORGABEN.zeit.ueber_minuten),
    fehler_standort: werte.zeit.fehler_standort !== false,
    /** Radius fürs Stempeln, wenn am Objekt keiner hinterlegt ist. */
    gps_toleranz_m: zahl(werte.zeit.gps_toleranz_m, VORGABEN.zeit.gps_toleranz_m),
    gps_aktiv: werte.zeit.gps_aktiv !== false
  };
}

/**
 * Eine Liste laden, nur die aktiven Einträge, in ihrer Reihenfolge.
 * Fehlt die Tabelle, kommt eine leere Liste zurück.
 */
export async function listeLaden(supabase: AnyRow, liste: ListenName): Promise<AnyRow[]> {
  try {
    const ergebnis = await supabase
      .from("settings_lists")
      .select("*")
      .eq("liste", liste)
      .eq("aktiv", true)
      .order("sortierung", { ascending: true })
      .order("name", { ascending: true });
    if (ergebnis.error) return [];
    return (ergebnis.data || []) as AnyRow[];
  } catch {
    return [];
  }
}
