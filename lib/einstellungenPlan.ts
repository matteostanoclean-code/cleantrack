import type { EinstellungsSchluessel, ListenName } from "@/lib/einstellungen";

/**
 * Der Bauplan der Einstellungen.
 *
 * Jeder Bildschirm unter Einstellungen ist entweder ein Formular auf einem
 * Einstellungs-Schluessel oder eine Liste auf einer Stammliste. Beides ist so
 * gleichfoermig, dass es sich nicht lohnt, dreissig Seiten von Hand zu bauen —
 * es reicht, sie hier zu beschreiben. Ein einziger Bildschirm liest diesen
 * Plan und zeichnet daraus alles.
 *
 * Das hat einen zweiten Vorteil: eine neue Einstellung ist ein Eintrag in
 * dieser Datei, kein neuer Ordner, keine neue Route, kein neues Formular.
 */

export type Feld =
  | { art: "text"; schluessel: string; label: string; hinweis?: string; pflicht?: boolean; breit?: boolean }
  | { art: "textbereich"; schluessel: string; label: string; hinweis?: string; breit?: boolean }
  | { art: "zahl"; schluessel: string; label: string; hinweis?: string; einheit?: string; pflicht?: boolean; breit?: boolean }
  | { art: "geld"; schluessel: string; label: string; hinweis?: string; breit?: boolean }
  | { art: "zeit"; schluessel: string; label: string; hinweis?: string; breit?: boolean }
  | { art: "datum"; schluessel: string; label: string; hinweis?: string; pflicht?: boolean; breit?: boolean }
  | { art: "schalter"; schluessel: string; label: string; hinweis?: string }
  | { art: "auswahl"; schluessel: string; label: string; hinweis?: string; optionen: Array<{ wert: string; label: string }>; breit?: boolean }
  | { art: "farbe"; schluessel: string; label: string; hinweis?: string };

export type Abschnitt = { titel: string; hinweis?: string; felder: Feld[] };

export type Spalte = {
  schluessel: string;
  titel: string;
  art?: "text" | "zahl" | "geld" | "prozent" | "datum" | "schalter" | "farbe";
  rechts?: boolean;
};

export type Gruppe =
  | {
      schluessel: string;
      titel: string;
      art: "formular";
      bereich: EinstellungsSchluessel;
      ueberschrift: string;
      hinweis?: string;
      abschnitte: Abschnitt[];
    }
  | {
      schluessel: string;
      titel: string;
      art: "liste";
      liste: ListenName;
      ueberschrift: string;
      einzahl: string;
      hinweis?: string;
      spalten: Spalte[];
      felder: Feld[];
      /** Bei den Zuschlaegen zusaetzlich der Weg ueber die Tarifvorlagen. */
      tarifvorlagen?: boolean;
    }
  | {
      schluessel: string;
      titel: string;
      art: "hinweis";
      ueberschrift: string;
      absaetze: string[];
      wege?: Array<{ text: string; adresse: string }>;
    };

export type Bereich = { schluessel: string; titel: string; gruppen: Gruppe[] };

/** Spalten, die es in settings_lists wirklich gibt. Alles andere landet in daten. */
export const STAMMSPALTEN = ["name", "nummer", "farbe", "aktiv", "sortierung"];

const FARBEN = [
  { wert: "#FF3B30", label: "Rot" },
  { wert: "#FF9500", label: "Orange" },
  { wert: "#FFCC00", label: "Gelb" },
  { wert: "#34C759", label: "Grün" },
  { wert: "#5AC8FA", label: "Hellblau" },
  { wert: "#007AFF", label: "Blau" },
  { wert: "#5856D6", label: "Violett" },
  { wert: "#8E8E93", label: "Grau" }
];

const STATUS_FELD: Feld = { art: "schalter", schluessel: "aktiv", label: "Aktiv" };
const FARB_FELD: Feld = { art: "farbe", schluessel: "farbe", label: "Farbe" };

export const BEREICHE: Bereich[] = [
  // -------------------------------------------------------------------------
  {
    schluessel: "allgemein",
    titel: "Allgemein",
    gruppen: [
      {
        schluessel: "firmendaten",
        titel: "Firmendaten",
        art: "formular",
        bereich: "firma",
        ueberschrift: "Firmendaten",
        hinweis: "Diese Angaben stehen auf jedem Ausdruck: Übergabeprotokolle, Etiketten, Verträge.",
        abschnitte: [
          {
            titel: "Allgemeine Informationen",
            felder: [{ art: "text", schluessel: "name", label: "Firmenname", pflicht: true, breit: true }]
          },
          {
            titel: "Anschrift",
            felder: [
              { art: "text", schluessel: "strasse", label: "Straße und Hausnummer", breit: true },
              { art: "text", schluessel: "plz", label: "Postleitzahl" },
              { art: "text", schluessel: "ort", label: "Stadt" },
              { art: "text", schluessel: "land", label: "Land" },
              { art: "text", schluessel: "zusatz", label: "Adresszusatz" }
            ]
          },
          {
            titel: "Kontakt",
            felder: [
              { art: "text", schluessel: "telefon", label: "Telefon" },
              { art: "text", schluessel: "email", label: "E-Mail" },
              { art: "text", schluessel: "web", label: "Website", breit: true }
            ]
          }
        ]
      },
      {
        schluessel: "steuer",
        titel: "Steuereinstellungen",
        art: "formular",
        bereich: "steuer",
        ueberschrift: "Steuereinstellungen",
        hinweis: "Stehen neben den Kontaktdaten auf den Dokumenten.",
        abschnitte: [
          {
            titel: "Nummern",
            felder: [
              { art: "text", schluessel: "ust_id", label: "Umsatzsteuer-Identifikationsnummer" },
              {
                art: "auswahl",
                schluessel: "waehrung",
                label: "Währung",
                optionen: [
                  { wert: "EUR", label: "Euro" },
                  { wert: "CHF", label: "Schweizer Franken" }
                ]
              },
              { art: "text", schluessel: "steuernummer", label: "Steuernummer" },
              { art: "text", schluessel: "hr_nummer", label: "Handelsregisternummer" }
            ]
          },
          {
            titel: "Umsatzsteuer",
            hinweis: "Als Kleinunternehmer nach §19 UStG bleibt der Schalter aus.",
            felder: [{ art: "schalter", schluessel: "mwst_ausweis", label: "Mit Mehrwertsteuer-Ausweis" }]
          },
          {
            titel: "Geschäftsführung und Buchhaltung",
            felder: [
              { art: "text", schluessel: "geschaeftsfuehrung", label: "Geschäftsführung", breit: true },
              { art: "text", schluessel: "mandantennummer", label: "Mandantennummer" },
              { art: "text", schluessel: "beraternummer", label: "Beraternummer" }
            ]
          }
        ]
      },
      {
        schluessel: "chat",
        titel: "Chat",
        art: "formular",
        bereich: "chat",
        ueberschrift: "Chat",
        abschnitte: [
          {
            titel: "Was das Team im Chat kann",
            hinweis: "Beides ist für alle frei — die Hälfte des Teams schreibt lieber, als zu tippen.",
            felder: [
              { art: "schalter", schluessel: "uebersetzer", label: "Nachrichten übersetzen" },
              { art: "schalter", schluessel: "sprachnachrichten", label: "Sprachnachrichten verschicken" }
            ]
          },
          {
            titel: "Logbuch",
            hinweis: "Wer den Änderungsverlauf sehen darf.",
            felder: [
              { art: "schalter", schluessel: "logbuch_mitarbeiter", label: "Verlauf bei Mitarbeitern nur fürs Büro" },
              { art: "schalter", schluessel: "logbuch_kunden", label: "Verlauf bei Kunden nur fürs Büro" }
            ]
          }
        ]
      },
      {
        schluessel: "kalender",
        titel: "Kalender",
        art: "formular",
        bereich: "kalender",
        ueberschrift: "Kalender",
        abschnitte: [
          {
            titel: "Anzeige",
            felder: [
              {
                art: "auswahl",
                schluessel: "wochen_taktung",
                label: "Taktung in der Wochenansicht",
                optionen: [
                  { wert: "15", label: "15 Minuten" },
                  { wert: "30", label: "30 Minuten" },
                  { wert: "60", label: "60 Minuten" }
                ]
              }
            ]
          }
        ]
      },
      {
        schluessel: "feiertage",
        titel: "Feiertage",
        art: "liste",
        liste: "feiertage",
        ueberschrift: "Feiertage",
        einzahl: "Feiertag",
        hinweis: "Gesetzliche Feiertage in Baden-Württemberg für 2026 und 2027 sind eingetragen. Sie steuern Zuschläge und die Planung.",
        spalten: [
          { schluessel: "name", titel: "Name" },
          { schluessel: "datum", titel: "Datum", art: "datum" },
          { schluessel: "region", titel: "Region" },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Name", pflicht: true, breit: true },
          { art: "datum", schluessel: "datum", label: "Datum", pflicht: true },
          { art: "text", schluessel: "region", label: "Region", hinweis: "BW für Baden-Württemberg" },
          STATUS_FELD
        ]
      },
      {
        schluessel: "rechtegruppen",
        titel: "Rechtegruppen",
        art: "liste",
        liste: "rechtegruppen",
        ueberschrift: "Rechtegruppen",
        einzahl: "Rechtegruppe",
        hinweis: "Das Zugriffslevel entscheidet, wer über den eigenen Bereich hinaus sehen darf. Ab 8 das ganze Büro, ab 5 die eigenen Objekte.",
        spalten: [
          { schluessel: "name", titel: "Bezeichnung", art: "farbe" },
          { schluessel: "level", titel: "Zugriffslevel", art: "zahl", rechts: true },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Bezeichnung", pflicht: true, breit: true },
          { art: "zahl", schluessel: "level", label: "Zugriffslevel", hinweis: "1 bis 10" },
          { ...FARB_FELD },
          { art: "schalter", schluessel: "dashboard", label: "Zugriff aufs Dashboard" },
          { art: "schalter", schluessel: "einstellungen", label: "Zugriff auf Einstellungen" },
          { art: "schalter", schluessel: "objektleiterfilter", label: "Sieht nur eigene Objekte" },
          { art: "schalter", schluessel: "lohndaten", label: "Sieht lohnrelevante Daten" },
          { art: "schalter", schluessel: "dokumente", label: "Sieht Mitarbeiter-Dokumente" },
          { art: "schalter", schluessel: "app", label: "Zugriff auf die App" },
          STATUS_FELD
        ]
      },
      {
        schluessel: "zugaenge",
        titel: "Zugänge & Schnittstellen",
        art: "hinweis",
        ueberschrift: "Zugänge & Schnittstellen",
        absaetze: [
          "Einen Bildschirm für API-Schlüssel und Webhooks gibt es hier bewusst nicht. Er wäre eine leere Liste mit einem Knopf, an dem niemand etwas anzuklicken hat.",
          "Wenn Zahlen aus Schichtklar irgendwo anders gebraucht werden — eine Auswertung, eine Liste für den Steuerberater, ein Abgleich mit Lexware —, geht das über Brutus im CEO-GPT. Der kommt direkt an die Datenbank und baut dir daraus, was du brauchst. Kein Schlüssel, den du irgendwo hinterlegen und im Blick behalten musst.",
          "Sollte später ein fremdes Programm von sich aus bei Schichtklar anklopfen müssen, bauen wir hier einen echten Schlüssel-Bildschirm. Vorher nicht."
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    schluessel: "auftragswesen",
    titel: "Auftragswesen",
    gruppen: [
      {
        schluessel: "auftragsarten",
        titel: "Auftragsarten",
        art: "liste",
        liste: "auftragsarten",
        ueberschrift: "Auftragsarten",
        einzahl: "Auftragsart",
        hinweis: "Das sind zugleich die Objekt-Tags: was an einem Objekt gemacht wird. Was du hier anlegst, steht sofort in der Objektmaske zur Auswahl.",
        spalten: [
          { schluessel: "name", titel: "Bezeichnung", art: "farbe" },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Bezeichnung", pflicht: true, breit: true },
          { ...FARB_FELD },
          STATUS_FELD
        ]
      },
      {
        schluessel: "auftrag",
        titel: "Auftrag",
        art: "formular",
        bereich: "auftrag",
        ueberschrift: "Auftrag",
        abschnitte: [
          {
            titel: "Kostenstellen",
            hinweis: "Wonach sich Exporte gliedern sollen.",
            felder: [
              {
                art: "auswahl",
                schluessel: "kostenstelle",
                label: "Standard-Kostenstelle",
                optionen: [
                  { wert: "keine", label: "Keine" },
                  { wert: "kundennummer", label: "Kundennummer" },
                  { wert: "objektnummer", label: "Objektnummer" },
                  { wert: "auftragsnummer", label: "Auftragsnummer" }
                ]
              },
              { art: "schalter", schluessel: "exporte_aufteilen", label: "Exporte nach Kostenstellen aufteilen" },
              { art: "schalter", schluessel: "abweichende_rechnungsadresse", label: "Abweichende Rechnungsadressen im Auftrag hinterlegen" }
            ]
          }
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    schluessel: "zeiterfassung",
    titel: "Zeiterfassung",
    gruppen: [
      {
        schluessel: "fehlerarten",
        titel: "Fehlerarten",
        art: "formular",
        bereich: "zeit",
        ueberschrift: "Fehlerarten",
        hinweis: "Was in der Zeitenfreigabe zur Kontrolle auftauchen soll. Was hier aus ist, wird still durchgewinkt.",
        abschnitte: [
          {
            titel: "Zur Kontrolle vorlegen",
            felder: [
              { art: "schalter", schluessel: "fehler_standort", label: "Standortfehler", hinweis: "Gestempelt wurde außerhalb des Objektradius." },
              { art: "schalter", schluessel: "fehler_standort_freigabe", label: "Standortfreigabe war aus" },
              { art: "schalter", schluessel: "fehler_freie_zeit", label: "Freie Zeiterfassung", hinweis: "Gestempelt ohne geplanten Einsatz." },
              { art: "schalter", schluessel: "fehler_nachtrag", label: "Nachgetragene Zeiten" }
            ]
          }
        ]
      },
      {
        schluessel: "grenzen",
        titel: "Unter- und Überschreitung",
        art: "formular",
        bereich: "zeit",
        ueberschrift: "Unter- und Überschreitung",
        hinweis: "Ab wann eine Abweichung von der Planzeit zur Kontrolle vorgelegt wird. Beides muss zutreffen, sonst gilt die Zeit als in Ordnung.",
        abschnitte: [
          {
            titel: "Unterschreitung",
            felder: [
              { art: "zahl", schluessel: "unter_prozent", label: "Prozentuale Unterschreitung", einheit: "%" },
              { art: "zahl", schluessel: "unter_minuten", label: "Minütige Unterschreitung", einheit: "Min." },
              { art: "schalter", schluessel: "auf_soll_aufrunden", label: "Freigegebene Zeiten auf die Sollzeit aufrunden" }
            ]
          },
          {
            titel: "Überschreitung",
            felder: [{ art: "zahl", schluessel: "ueber_minuten", label: "Minütige Überschreitung", einheit: "Min." }]
          }
        ]
      },
      {
        schluessel: "gps",
        titel: "GPS-Erfassung",
        art: "formular",
        bereich: "zeit",
        ueberschrift: "GPS-Erfassung",
        hinweis: "Ohne Standort lässt sich kein Standortfehler feststellen. Der Radius je Objekt kann davon abweichen und schlägt diesen Wert.",
        abschnitte: [
          {
            titel: "Standort",
            felder: [
              { art: "schalter", schluessel: "gps_aktiv", label: "Standort beim Stempeln erfassen" },
              { art: "zahl", schluessel: "gps_toleranz_m", label: "Toleranz", einheit: "Meter" }
            ]
          }
        ]
      },
      {
        schluessel: "fahrzeit",
        titel: "Fahrzeit",
        art: "formular",
        bereich: "zeit",
        ueberschrift: "Fahrzeit",
        abschnitte: [
          {
            titel: "Fahrzeit erfassen",
            hinweis: "Die Zeit zwischen zwei Objekten am selben Tag.",
            felder: [
              { art: "schalter", schluessel: "fahrzeit_aktiv", label: "Fahrzeit erfassen" },
              { art: "zeit", schluessel: "fahrzeit_zwischenzeit", label: "Maximale Zwischenzeit", hinweis: "Rahmentarifvertrag § 11 Nr. 2: über drei Stunden Zwischenzeit gibt es keine Fahrtkostenerstattung." },
              { art: "text", schluessel: "fahrzeit_lohnnummer", label: "Lohnnummer für Fahrzeiten" }
            ]
          }
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    schluessel: "abwesenheiten",
    titel: "Abwesenheiten",
    gruppen: [
      {
        schluessel: "abwesenheitsarten",
        titel: "Abwesenheitsart",
        art: "liste",
        liste: "abwesenheitsarten",
        ueberschrift: "Abwesenheitsarten",
        einzahl: "Abwesenheitsart",
        hinweis: "Die Lohnnummer muss zu der passen, die die Lohnbuchhaltung führt.",
        spalten: [
          { schluessel: "name", titel: "Name", art: "farbe" },
          { schluessel: "nummer", titel: "Lohnnummer", art: "zahl", rechts: true },
          { schluessel: "bezahlt", titel: "Bezahlt", art: "schalter" },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Bezeichnung", pflicht: true, breit: true },
          { art: "zahl", schluessel: "nummer", label: "Lohnnummer", pflicht: true },
          { ...FARB_FELD },
          { art: "schalter", schluessel: "bezahlt", label: "Abwesenheit wird bezahlt" },
          { art: "schalter", schluessel: "beantragbar", label: "Kann von Mitarbeitern beantragt werden" },
          { art: "schalter", schluessel: "reduziert_urlaub", label: "Reduziert den Urlaubsanspruch" },
          STATUS_FELD
        ]
      },
      {
        schluessel: "urlaubsanspruch",
        titel: "Urlaubsanspruch",
        art: "formular",
        bereich: "abwesenheit",
        ueberschrift: "Urlaubsanspruch",
        hinweis: "Nach Rahmentarifvertrag § 15 Nr. 1.1 sind es ab 2021 dreißig Arbeitstage — aber auf Grundlage einer Fünf-Tage-Woche. Wer weniger Tage arbeitet, hat entsprechend weniger Anspruch. Der Wert hier ist also die Grundlage, nicht das Ergebnis.",
        abschnitte: [
          {
            titel: "Grundanspruch",
            felder: [
              {
                art: "zahl",
                schluessel: "urlaubsanspruch",
                label: "Urlaubstage im Jahr",
                einheit: "Tage",
                hinweis: "Bei Fünf-Tage-Woche. Drei Tage die Woche heißt entsprechend 18 Tage."
              }
            ]
          },
          {
            titel: "Wartezeit",
            hinweis: "Wann neu Eingestellten der volle Anspruch zusteht.",
            felder: [
              { art: "schalter", schluessel: "wartezeit_aktiv", label: "Wartezeit bei Neueinstellungen" },
              { art: "zahl", schluessel: "wartezeit_monate", label: "Wartezeit", einheit: "Monate" }
            ]
          },
          {
            titel: "Resturlaub",
            hinweis: "Wie viel sich ins nächste Jahr mitnehmen lässt.",
            felder: [
              { art: "schalter", schluessel: "resturlaub_aktiv", label: "Übertrag erlauben" },
              { art: "zahl", schluessel: "uebertrag_tage", label: "Übertragbare Tage", einheit: "Tage" },
              {
                art: "auswahl",
                schluessel: "verfall",
                label: "Wann die Übertragstage verfallen",
                breit: true,
                optionen: [
                  { wert: "3 Monate nach Ende des Zyklus", label: "3 Monate nach Ende des Zyklus" },
                  { wert: "6 Monate nach Ende des Zyklus", label: "6 Monate nach Ende des Zyklus" },
                  { wert: "Am Ende des Zyklus", label: "Am Ende des Zyklus" },
                  { wert: "Gar nicht", label: "Gar nicht" }
                ]
              }
            ]
          }
        ]
      },
      {
        schluessel: "benachrichtigung",
        titel: "Benachrichtigung",
        art: "formular",
        bereich: "abwesenheit",
        ueberschrift: "Benachrichtigung",
        abschnitte: [
          {
            titel: "Kunden informieren",
            hinweis: "Ob Kunden erfahren, dass jemand ausfällt.",
            felder: [
              { art: "schalter", schluessel: "kunden_benachrichtigen", label: "Kunden per E-Mail informieren" },
              { art: "textbereich", schluessel: "kunden_text", label: "Text der Nachricht", breit: true }
            ]
          }
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    schluessel: "lohn",
    titel: "Lohn",
    gruppen: [
      {
        schluessel: "allgemein",
        titel: "Allgemein",
        art: "formular",
        bereich: "lohn",
        ueberschrift: "Allgemeine Lohneinstellungen",
        hinweis: "Bei euch wird zum Monatsende gezahlt, nicht am 15. des Folgemonats.",
        abschnitte: [
          {
            titel: "Abrechnung",
            felder: [{ art: "zahl", schluessel: "abrechnungstag", label: "Abrechnungstag im Monat", hinweis: "31 heißt: letzter Tag des Monats." }]
          },
          {
            titel: "Nachtarbeit",
            hinweis: "Als Nachtarbeit gilt nach Rahmentarifvertrag § 3 Nr. 4.2 die Zeit von 22.00 bis 5.00 Uhr.",
            felder: [
              { art: "zeit", schluessel: "nacht_von", label: "Nachtarbeit von" },
              { art: "zeit", schluessel: "nacht_bis", label: "Nachtarbeit bis" }
            ]
          },
          {
            titel: "Region",
            hinweis: "Entscheidet, welche gesetzlichen Feiertage gelten.",
            felder: [
              { art: "text", schluessel: "land", label: "Land" },
              { art: "text", schluessel: "region", label: "Bundesland" }
            ]
          }
        ]
      },
      {
        schluessel: "lohnarten",
        titel: "Lohnarten",
        art: "liste",
        liste: "lohnarten",
        ueberschrift: "Lohnarten",
        einzahl: "Lohnart",
        spalten: [
          { schluessel: "nummer", titel: "Nummer", art: "zahl" },
          { schluessel: "name", titel: "Bezeichnung" },
          { schluessel: "lohnkosten", titel: "Lohnkosten", art: "geld", rechts: true },
          { schluessel: "brutto_stundenlohn", titel: "Bruttostundenlohn", art: "geld", rechts: true },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Bezeichnung", pflicht: true, breit: true },
          { art: "zahl", schluessel: "nummer", label: "Lohnnummer", pflicht: true },
          { art: "geld", schluessel: "brutto_stundenlohn", label: "Bruttostundenlohn" },
          { art: "geld", schluessel: "lohnkosten", label: "Lohnkosten", hinweis: "Was die Stunde dich kostet, mit Nebenkosten." },
          { art: "textbereich", schluessel: "beschreibung", label: "Beschreibung", breit: true },
          STATUS_FELD
        ]
      },
      {
        schluessel: "zuschlaege",
        titel: "Zuschläge",
        art: "liste",
        liste: "zuschlaege",
        ueberschrift: "Zuschläge",
        einzahl: "Zuschlag",
        hinweis: "Entweder aus einer Tarifvorlage übernehmen oder von Hand anlegen.",
        tarifvorlagen: true,
        spalten: [
          { schluessel: "nummer", titel: "Lohnnummer", art: "zahl" },
          { schluessel: "name", titel: "Bezeichnung" },
          { schluessel: "grundlage", titel: "Art" },
          { schluessel: "hoehe", titel: "Höhe", rechts: true },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Zuschlagsname", pflicht: true, breit: true },
          { art: "zahl", schluessel: "nummer", label: "Lohnnummer" },
          {
            art: "auswahl",
            schluessel: "einheit",
            label: "Zuschlagsart",
            optionen: [
              { wert: "prozent", label: "% vom Lohn" },
              { wert: "euro", label: "€ je Stunde" }
            ]
          },
          { art: "zahl", schluessel: "hoehe", label: "Zuschlagshöhe", pflicht: true },
          {
            art: "auswahl",
            schluessel: "grundlage",
            label: "Wann er greift",
            breit: true,
            optionen: [
              { wert: "zeit", label: "Wochentage und Uhrzeit" },
              { wert: "feiertage", label: "An Feiertagen" },
              { wert: "auftragsarten", label: "Bei bestimmten Auftragsarten" },
              { wert: "belastung", label: "Ab einer Stundenschwelle" }
            ]
          },
          { art: "text", schluessel: "wochentage", label: "Wochentage", hinweis: "Zum Beispiel: Mo, Di, Mi, Do, Fr" },
          { art: "zeit", schluessel: "von", label: "Von" },
          { art: "zeit", schluessel: "bis", label: "Bis" },
          { art: "text", schluessel: "auftragsarten", label: "Auftragsarten", hinweis: "Mit Komma getrennt, leer heißt alle." },
          { art: "zahl", schluessel: "schwelle_tag", label: "Tägliche Schwelle", einheit: "Std." },
          { art: "zahl", schluessel: "schwelle_woche", label: "Wöchentliche Schwelle", einheit: "Std." },
          { art: "text", schluessel: "lohnnummer_steuerfrei", label: "Lohnnummer für den steuerfreien Anteil" },
          STATUS_FELD
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    schluessel: "geraete-material",
    titel: "Geräte & Material",
    gruppen: [
      {
        schluessel: "lieferanten",
        titel: "Lieferanten",
        art: "liste",
        liste: "lieferanten",
        ueberschrift: "Lieferanten",
        einzahl: "Lieferant",
        hinweis: "Bei wem bestellt wird. Die E-Mail ist die Adresse, an die eine Bestellung später rausgeht.",
        spalten: [
          { schluessel: "name", titel: "Bezeichnung" },
          { schluessel: "nummer", titel: "Nummer", art: "zahl" },
          { schluessel: "email", titel: "E-Mail" },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Name", pflicht: true, breit: true },
          { art: "zahl", schluessel: "nummer", label: "Nummer", pflicht: true },
          { art: "text", schluessel: "email", label: "E-Mail", breit: true },
          { art: "text", schluessel: "telefon", label: "Telefon" },
          { art: "text", schluessel: "kundennummer", label: "Eure Kundennummer dort" },
          STATUS_FELD
        ]
      },
      {
        schluessel: "geraetetypen",
        titel: "Gerätetypen",
        art: "liste",
        liste: "geraetetypen",
        ueberschrift: "Gerätetypen",
        einzahl: "Gerätetyp",
        hinweis: "Die Art des Geräts, nicht das einzelne Gerät. Das Wartungsintervall gilt dann für alle Geräte dieses Typs.",
        spalten: [
          { schluessel: "name", titel: "Name" },
          { schluessel: "hersteller", titel: "Hersteller" },
          { schluessel: "kategorie", titel: "Kategorie" },
          { schluessel: "wartung_monate", titel: "Wartung", art: "zahl", rechts: true },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Name", pflicht: true, breit: true },
          { art: "text", schluessel: "hersteller", label: "Hersteller" },
          { art: "text", schluessel: "herstellernummer", label: "Herstellernummer" },
          { art: "text", schluessel: "kategorie", label: "Kategorie" },
          { art: "zahl", schluessel: "wartung_monate", label: "Wartungsintervall", einheit: "Monate", hinweis: "0 heißt: keine Wartung fällig." },
          { art: "textbereich", schluessel: "kommentar", label: "Kommentar", breit: true },
          STATUS_FELD
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    schluessel: "aufgaben",
    titel: "Aufgabenmanagement",
    gruppen: [
      {
        schluessel: "aufgabentypen",
        titel: "Aufgabentypen",
        art: "liste",
        liste: "aufgabentypen",
        ueberschrift: "Aufgabentypen",
        einzahl: "Aufgabentyp",
        hinweis: "Das Präfix wird zum Kürzel des Vorgangs: REKL-7, PERS-3. Ändere es nicht bei einem Typ, unter dem schon Vorgänge liegen — sonst passen die alten Kürzel nicht mehr.",
        spalten: [
          { schluessel: "name", titel: "Aufgabentyp", art: "farbe" },
          { schluessel: "praefix", titel: "Präfix" },
          { schluessel: "fuer_kunden", titel: "Für Kunden", art: "schalter" },
          { schluessel: "aktiv", titel: "Status", art: "schalter" }
        ],
        felder: [
          { art: "text", schluessel: "name", label: "Name", pflicht: true, breit: true },
          { art: "text", schluessel: "praefix", label: "Präfix", pflicht: true, hinweis: "Vier Großbuchstaben, zum Beispiel REKL." },
          { ...FARB_FELD },
          { art: "schalter", schluessel: "fuer_kunden", label: "Für Kunden anzeigen" },
          STATUS_FELD
        ]
      }
    ]
  },

  // -------------------------------------------------------------------------
  {
    schluessel: "rechnungswesen",
    titel: "Rechnungswesen",
    gruppen: [
      {
        schluessel: "faktura",
        titel: "Faktura",
        art: "hinweis",
        ueberschrift: "Rechnungswesen",
        absaetze: [
          "Die Faktura ruht. Angebote und Rechnungen laufen weiter über Lexware Office, und ab September 2026 geht die Buchhaltung ohnehin an den Steuerberater.",
          "Solange hier nichts geschrieben wird, gibt es auch nichts einzustellen. Wenn die Faktura drankommt, stehen hier Nummernkreise, Zahlungsziele und Mahnstufen."
        ]
      }
    ]
  }
];

export const FARB_OPTIONEN = FARBEN;

export function bereichFinden(schluessel: string) {
  return BEREICHE.find((bereich) => bereich.schluessel === schluessel) || null;
}

export function gruppeFinden(bereichSchluessel: string, gruppeSchluessel: string) {
  const bereich = bereichFinden(bereichSchluessel);
  if (!bereich) return null;
  return bereich.gruppen.find((gruppe) => gruppe.schluessel === gruppeSchluessel) || null;
}
