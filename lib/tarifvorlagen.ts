/**
 * Zuschlags-Vorlagen aus dem Rahmentarifvertrag Gebäudereinigung.
 *
 * WICHTIG, und das steht hier absichtlich so deutlich:
 * Diese Werte sind aus den Vorlagen übernommen, die Matteo bereitgestellt hat.
 * Sie sind NICHT gegen den Text des Rahmentarifvertrags geprüft worden — die
 * Urkunde liegt hier nicht vor. Ein Zuschlag, der aus dieser Liste kommt, ist
 * ein Vorschlag zum Ausfüllen, kein Rechtsstand.
 *
 * Bevor damit abgerechnet wird, gehört jede Zeile einmal gegen den geltenden
 * Rahmentarifvertrag gehalten. Die Prozentsätze und die Paragrafen ändern sich
 * mit jeder Tarifrunde; was hier steht, altert.
 *
 * Wer eine Vorlage nimmt, ergänzt die Lohnnummer — die kennt nur die
 * Lohnbuchhaltung, die kann keine Vorlage mitbringen.
 */

export type Tarifvorlage = {
  schluessel: string;
  name: string;
  gruppe: string;
  einheit: "prozent" | "euro";
  hoehe: number;
  grundlage: "zeit" | "feiertage" | "auftragsarten" | "belastung" | "manuell";
  wochentage?: string;
  von?: string;
  bis?: string;
  steuerfrei?: boolean;
  bemerkung?: string;
};

export const TARIF_GRUPPEN = [
  { schluessel: "zeit", titel: "Zeitzuschläge" },
  { schluessel: "psa", titel: "PSA-Zuschläge" },
  { schluessel: "arbeiten", titel: "Besondere Arbeiten" },
  { schluessel: "belastung", titel: "Belastungszuschlag" }
];

export const TARIFVORLAGEN: Tarifvorlage[] = [
  // --- Zeitzuschläge -------------------------------------------------------
  {
    schluessel: "nacht",
    name: "Nachtzuschlag",
    gruppe: "zeit",
    einheit: "prozent",
    hoehe: 30,
    grundlage: "zeit",
    wochentage: "Mo, Di, Mi, Do, Fr, Sa, So",
    von: "22:00",
    bis: "05:00",
    steuerfrei: true
  },
  { schluessel: "sonntag", name: "Sonntagszuschlag", gruppe: "zeit", einheit: "prozent", hoehe: 80, grundlage: "zeit", wochentage: "So", steuerfrei: true },
  { schluessel: "feiertag", name: "Feiertagszuschlag", gruppe: "zeit", einheit: "prozent", hoehe: 80, grundlage: "feiertage", steuerfrei: true },
  { schluessel: "neujahr", name: "Neujahr", gruppe: "zeit", einheit: "prozent", hoehe: 200, grundlage: "feiertage", steuerfrei: true },
  { schluessel: "besondere-feiertage", name: "Besondere Feiertage", gruppe: "zeit", einheit: "prozent", hoehe: 200, grundlage: "feiertage", steuerfrei: true },
  { schluessel: "heiligabend", name: "Heiligabend", gruppe: "zeit", einheit: "prozent", hoehe: 150, grundlage: "feiertage", steuerfrei: true },
  { schluessel: "silvester", name: "Silvester", gruppe: "zeit", einheit: "prozent", hoehe: 150, grundlage: "feiertage", steuerfrei: true },

  // --- PSA -----------------------------------------------------------------
  { schluessel: "psa-1", name: "PSA Stufe 1 (Schutzanzug und Brille)", gruppe: "psa", einheit: "prozent", hoehe: 5, grundlage: "manuell" },
  { schluessel: "psa-2", name: "PSA Stufe 2 (Filtermaske)", gruppe: "psa", einheit: "prozent", hoehe: 15, grundlage: "manuell" },
  { schluessel: "psa-3", name: "PSA Stufe 3 (Frischluft)", gruppe: "psa", einheit: "prozent", hoehe: 20, grundlage: "manuell" },
  { schluessel: "psa-4", name: "PSA Stufe 4 (Vollschutz)", gruppe: "psa", einheit: "prozent", hoehe: 40, grundlage: "manuell" },
  { schluessel: "psa-maske", name: "Atemschutzmaske", gruppe: "psa", einheit: "prozent", hoehe: 10, grundlage: "manuell" },

  // --- Besondere Arbeiten --------------------------------------------------
  { schluessel: "parkett", name: "Manuelles Parkettabziehen", gruppe: "arbeiten", einheit: "euro", hoehe: 3, grundlage: "auftragsarten" },
  { schluessel: "staubdach", name: "Staubdacharbeiten", gruppe: "arbeiten", einheit: "euro", hoehe: 3, grundlage: "auftragsarten" },
  { schluessel: "sheddach", name: "Sheddach-Reinigung", gruppe: "arbeiten", einheit: "euro", hoehe: 3, grundlage: "auftragsarten" },
  { schluessel: "steinfassade", name: "Steinfassaden mit Strahlgut oder Hochdruck", gruppe: "arbeiten", einheit: "euro", hoehe: 3, grundlage: "auftragsarten" },
  { schluessel: "verschmutzung", name: "Außergewöhnliche Verschmutzung", gruppe: "arbeiten", einheit: "euro", hoehe: 0.75, grundlage: "auftragsarten" },
  { schluessel: "hitze", name: "Arbeiten über 40 °C", gruppe: "arbeiten", einheit: "euro", hoehe: 0.5, grundlage: "auftragsarten" },
  { schluessel: "kuehlraum", name: "Kühlräume unter 6 °C", gruppe: "arbeiten", einheit: "euro", hoehe: 0.5, grundlage: "auftragsarten" },
  { schluessel: "oepnv", name: "Grundreinigung ÖPNV", gruppe: "arbeiten", einheit: "euro", hoehe: 0.5, grundlage: "auftragsarten" },
  { schluessel: "waggons", name: "Güterbahnwaggons, Triebwagen, Flugzeuge", gruppe: "arbeiten", einheit: "euro", hoehe: 0.75, grundlage: "auftragsarten" },
  { schluessel: "haengekorb", name: "Bootsmannstühle und Hängekörbe", gruppe: "arbeiten", einheit: "euro", hoehe: 2, grundlage: "auftragsarten" },

  // --- Belastung -----------------------------------------------------------
  { schluessel: "belastung", name: "Belastungszuschlag", gruppe: "belastung", einheit: "prozent", hoehe: 25, grundlage: "belastung", bemerkung: "Ab einer Tages- oder Wochenschwelle." }
];

export const TARIF_WARNUNG =
  "Diese Werte stammen aus deinen Vorlagen, nicht aus einer geprüften Fassung des Rahmentarifvertrags. Bevor damit abgerechnet wird, halte jede Zeile einmal gegen den geltenden Tarifvertrag.";
