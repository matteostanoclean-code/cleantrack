/**
 * Zuschlags-Vorlagen aus dem Rahmentarifvertrag Gebäudereinigung.
 *
 * QUELLE: Rahmentarifvertrag für die gewerblich Beschäftigten in der
 * Gebäudereinigung vom 31.10.2019 (Fassung von der Verbands-Website).
 * Jede Zeile trägt ihre Fundstelle. Sie wurden am 01.09.2026 einzeln gegen
 * den Text gehalten — nicht geschätzt, nicht aus einer Vorlage abgeschrieben.
 *
 * Was das nicht ist: eine Zusage, dass der Tarifvertrag heute noch in dieser
 * Fassung gilt. Prozentsätze und Paragrafen ändern sich mit jeder Tarifrunde.
 * Zwei Vorlagen stehen deshalb ausdrücklich als abgelaufen drin, statt sie
 * still weiterzuführen (siehe abgelaufen).
 */

export type Tarifvorlage = {
  schluessel: string;
  name: string;
  gruppe: string;
  einheit: "prozent" | "euro";
  hoehe: number;
  grundlage: "zeit" | "feiertage" | "auftragsarten" | "belastung" | "manuell";
  /** Wo das im Tarifvertrag steht. */
  fundstelle: string;
  wochentage?: string;
  von?: string;
  bis?: string;
  steuerfrei?: boolean;
  /** Die Bedingung, an die der Tarifvertrag den Zuschlag knüpft. */
  hinweis?: string;
  /** Gilt nach dem Wortlaut heute nicht mehr. Wird gewarnt, nicht versteckt. */
  abgelaufen?: string;
};

export const TARIF_GRUPPEN = [
  { schluessel: "zeit", titel: "Zeitzuschläge (§ 3 Nr. 4.7)" },
  { schluessel: "psa", titel: "Arbeiten mit Schutzausrüstung (§ 10 Nr. 1)" },
  { schluessel: "arbeiten", titel: "Besondere Räume und Einrichtungen (§ 10 Nr. 2)" },
  { schluessel: "belastung", titel: "Belastungszuschlag (§ 10 Nr. 3)" }
];

export const TARIFVORLAGEN: Tarifvorlage[] = [
  // --- § 3 Nr. 4.7 Zeitzuschläge ------------------------------------------
  {
    schluessel: "nacht",
    name: "Nachtzuschlag",
    gruppe: "zeit",
    einheit: "prozent",
    hoehe: 30,
    grundlage: "zeit",
    fundstelle: "§ 3 Nr. 4.7 a",
    wochentage: "Mo, Di, Mi, Do, Fr, Sa, So",
    von: "22:00",
    bis: "05:00",
    steuerfrei: true,
    hinweis: "Als Nachtarbeit gilt die Arbeit von 22.00 bis 5.00 Uhr (§ 3 Nr. 4.2)."
  },
  {
    schluessel: "sonn-feiertag",
    name: "Sonn- und Feiertagszuschlag",
    gruppe: "zeit",
    einheit: "prozent",
    hoehe: 80,
    grundlage: "feiertage",
    fundstelle: "§ 3 Nr. 4.7 b",
    steuerfrei: true,
    hinweis: "Gilt für Sonn- und Feiertage von 0.00 bis 24.00 Uhr (§ 3 Nr. 4.3). Der Tarifvertrag führt beides in einer Ziffer."
  },
  {
    schluessel: "hohe-feiertage",
    name: "1. Mai, Neujahr, 1. und 2. Weihnachtsfeiertag",
    gruppe: "zeit",
    einheit: "prozent",
    hoehe: 200,
    grundlage: "feiertage",
    fundstelle: "§ 3 Nr. 4.7 c",
    steuerfrei: true,
    hinweis: "Genau diese vier Tage, keine weiteren."
  },
  {
    schluessel: "heiligabend-silvester",
    name: "Heiligabend oder Silvester",
    gruppe: "zeit",
    einheit: "prozent",
    hoehe: 150,
    grundlage: "feiertage",
    fundstelle: "§ 5 Nr. 4",
    steuerfrei: true,
    hinweis: "Wahlweise am 24.12. oder am 31.12., nicht an beiden. Alternativ Freistellung mit Lohnfortzahlung.",
    abgelaufen: "Der Anspruch ist im Text ausdrücklich auf die Jahre 2019 und 2020 begrenzt. Ob er in einer neueren Tarifrunde verlängert wurde, steht in dieser Fassung nicht."
  },

  // --- § 10 Nr. 1 Schutzausrüstung ----------------------------------------
  {
    schluessel: "psa-1",
    name: "Schutzanzug mit Kapuze, Überschuhen, Handschuhen und Brille",
    gruppe: "psa",
    einheit: "prozent",
    hoehe: 5,
    grundlage: "manuell",
    fundstelle: "§ 10 Nr. 1.1 a",
    hinweis: "Vorgeschriebener Schutzanzug, mit PVC oder Ähnlichem beschichtet."
  },
  {
    schluessel: "psa-2",
    name: "Schutzanzug mit Filterschutzmaske",
    gruppe: "psa",
    einheit: "prozent",
    hoehe: 15,
    grundlage: "manuell",
    fundstelle: "§ 10 Nr. 1.1 b",
    hinweis: "Mit Kapuze, Überschuhen, Handschuhen und Filterschutzmaske oder luftunterstützendem Beatmungssystem."
  },
  {
    schluessel: "psa-3",
    name: "Schutzanzug mit Frischluft- oder Druckluftgerät",
    gruppe: "psa",
    einheit: "prozent",
    hoehe: 20,
    grundlage: "manuell",
    fundstelle: "§ 10 Nr. 1.1 c",
    hinweis: "Frischluftsaugschlauch, Druckluftschlauch (Pressluftatmer) oder Regenerationsgerät."
  },
  {
    schluessel: "psa-4",
    name: "Vollschutz oder Chemikalienschutzanzug",
    gruppe: "psa",
    einheit: "prozent",
    hoehe: 40,
    grundlage: "manuell",
    fundstelle: "§ 10 Nr. 1.1 d",
    hinweis: "Form C, mit Gesichts- und Atemschutz."
  },
  {
    schluessel: "psa-maske",
    name: "Vorgeschriebene Atemschutzmaske",
    gruppe: "psa",
    einheit: "prozent",
    hoehe: 10,
    grundlage: "manuell",
    fundstelle: "§ 10 Nr. 1.2"
  },

  // --- § 10 Nr. 2 Besondere Räume und Einrichtungen ------------------------
  {
    schluessel: "parkett",
    name: "Manuelles Parkettabziehen",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 3,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.1",
    hinweis: "Nur ohne jeglichen Maschineneinsatz."
  },
  { schluessel: "staubdach", name: "Staubdacharbeiten", gruppe: "arbeiten", einheit: "euro", hoehe: 3, grundlage: "auftragsarten", fundstelle: "§ 10 Nr. 2.2" },
  {
    schluessel: "sheddach",
    name: "Reinigen von Sheddächern",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 3,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.3",
    hinweis: "Nur bei Abständen von mehr als sechs Monaten."
  },
  {
    schluessel: "steinfassade",
    name: "Steinfassaden mit Strahlgut oder Hochdruck",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 3,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.4"
  },
  {
    schluessel: "verschmutzung",
    name: "Innenreinigung bei außergewöhnlicher Verschmutzung",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 0.75,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.5",
    hinweis: "Waschkauen, Spritzkabinen, Werkhallen, Inspektionsgruben und Ähnliches. Ausdrücklich NICHT die übliche Unterhaltsreinigung in Werkstattbüros, Fluren, Treppen und Besuchertoiletten."
  },
  {
    schluessel: "hitze",
    name: "Arbeiten über 40 °C im Arbeitsbereich",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 0.5,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.6",
    hinweis: "Witterungseinflüsse sind ausgenommen."
  },
  {
    schluessel: "kuehlraum",
    name: "Kühlräume unter 6 °C",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 0.5,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.7",
    hinweis: "Witterungseinflüsse sind ausgenommen."
  },
  {
    schluessel: "oepnv",
    name: "Grundreinigung in Bahnen und Bussen",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 0.5,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.8",
    hinweis: "Straßenbahn, S-Bahn, U-Bahn und Busse, soweit nicht höher als Lohngruppe 1 eingestuft."
  },
  {
    schluessel: "waggons",
    name: "Güterbahnwaggons, Triebwagen, Flugzeugkabinen",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 0.75,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.9",
    hinweis: "Soweit nicht höher als Lohngruppe 1 eingestuft."
  },
  {
    schluessel: "haengekorb",
    name: "Bootsmannstühle und manuelle Hängekörbe",
    gruppe: "arbeiten",
    einheit: "euro",
    hoehe: 2,
    grundlage: "auftragsarten",
    fundstelle: "§ 10 Nr. 2.10"
  },

  // --- § 10 Nr. 3 Belastung ------------------------------------------------
  {
    schluessel: "belastung",
    name: "Belastungszuschlag",
    gruppe: "belastung",
    einheit: "prozent",
    hoehe: 25,
    grundlage: "belastung",
    fundstelle: "§ 10 Nr. 3",
    hinweis: "Für die Zeit über 8 Stunden täglich oder alternativ über die 40. Wochenstunde hinaus."
  }
];

/**
 * Zwei Rechenregeln, die keine Vorlage abbildet, weil sie das Zusammentreffen
 * mehrerer Zuschläge betreffen. Sie stehen im Dialog, damit sie beim Anlegen
 * nicht untergehen.
 */
export const TARIF_REGELN = [
  {
    fundstelle: "§ 3 Nr. 4.8",
    text: "Treffen mehrere Zeitzuschläge zusammen, wird nur der höchste gezahlt — nicht die Summe. Sonntagsarbeit in der Nacht ergibt also 80 %, nicht 110 %."
  },
  {
    fundstelle: "§ 10 Nr. 2 Schluss",
    text: "Bei den Erschwerniszuschlägen nach Nr. 2 gilt das Gegenteil: sie werden einzeln nebeneinander gewährt und nicht gegeneinander aufgerechnet."
  }
];

export const TARIF_QUELLE =
  "Rahmentarifvertrag Gebäudereinigung vom 31.10.2019. Jede Vorlage trägt ihre Fundstelle und ist gegen den Text geprüft.";

export const TARIF_WARNUNG =
  "Die Werte stammen aus dem Rahmentarifvertrag vom 31.10.2019. Ob diese Fassung heute noch gilt, sagt das Dokument nicht — prüfe vor dem Abrechnen den aktuellen Stand.";
