/**
 * Was ein Urlaubstag an Stunden wert ist.
 *
 * Der Mitarbeiter soll für einen genehmigten Urlaubstag die Stunden
 * gutgeschrieben bekommen, die er an dem Tag gearbeitet hätte. Zwei Quellen,
 * in dieser Reihenfolge:
 *
 * 1. Steht für den Tag noch ein Einsatz auf ihn, zählt dessen Planzeit. Das
 *    ist die genaueste Angabe, die es gibt.
 * 2. Steht keiner da — der Normalfall, weil bei Urlaub gar nicht erst geplant
 *    wird —, wird aus den letzten acht Wochen der gleiche Wochentag genommen.
 *    Wer montags immer zwei Stunden macht, bekommt für einen Urlaubsmontag
 *    zwei Stunden.
 *
 * Findet sich nichts, bleibt der Tag bei null. Lieber nichts gutschreiben als
 * eine erfundene Zahl in die Lohnabrechnung schieben.
 */

type AnyRow = Record<string, any>;

const RUECKBLICK_WOCHEN = 8;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function zahl(value: unknown) {
  const wert = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(wert) ? wert : 0;
}

function minutenAusZeitfenster(start: unknown, ende: unknown) {
  const von = text(start).slice(0, 5);
  const bis = text(ende).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(von) || !/^\d{2}:\d{2}$/.test(bis)) return 0;
  const a = Number(von.slice(0, 2)) * 60 + Number(von.slice(3, 5));
  const b = Number(bis.slice(0, 2)) * 60 + Number(bis.slice(3, 5));
  return b >= a ? b - a : 1440 - a + b;
}

/** Planminuten eines Einsatzes, bevorzugt aus dem hinterlegten Wert. */
export function planMinuten(task: AnyRow) {
  const direkt = zahl(task.planned_minutes ?? task.max_minutes ?? task.paid_minutes ?? task.wage_minutes);
  if (direkt > 0) return Math.round(direkt);
  return minutenAusZeitfenster(task.start_time, task.end_time);
}

function istGezaehlt(task: AnyRow) {
  const status = text(task.status || "open").toLowerCase();
  return !["cancelled", "canceled", "storniert"].includes(status);
}

function tagesListe(von: string, bis: string) {
  const tage: string[] = [];
  const start = new Date(`${von}T12:00:00`);
  const ende = new Date(`${bis}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(ende.getTime())) return tage;
  for (let tag = new Date(start); tag <= ende; tag.setDate(tag.getDate() + 1)) {
    tage.push(tag.toISOString().slice(0, 10));
    if (tage.length > 120) break;
  }
  return tage;
}

/** Häufigster Wert einer Liste. Bei Gleichstand der größere. */
function haeufigster(werte: number[]) {
  if (!werte.length) return 0;
  const zaehler = new Map<number, number>();
  for (const wert of werte) zaehler.set(wert, (zaehler.get(wert) || 0) + 1);
  let bester = 0;
  let besteAnzahl = 0;
  for (const [wert, anzahl] of zaehler.entries()) {
    if (anzahl > besteAnzahl || (anzahl === besteAnzahl && wert > bester)) {
      bester = wert;
      besteAnzahl = anzahl;
    }
  }
  return bester;
}

export type Gutschrift = {
  tage: number;
  minuten: number;
  detail: Array<{ tag: string; minuten: number; quelle: "einsatz" | "muster" | "keine" }>;
};

export async function urlaubsGutschrift(
  supabase: any,
  employeeName: string,
  von: string,
  bis: string
): Promise<Gutschrift> {
  const leer: Gutschrift = { tage: 0, minuten: 0, detail: [] };
  const name = text(employeeName);
  const tage = tagesListe(text(von).slice(0, 10), text(bis || von).slice(0, 10));
  if (!name || !tage.length) return leer;

  // Rückblick über den Zeitraum hinaus, damit das Wochentagsmuster steht.
  const rueckblickStart = new Date(`${tage[0]}T12:00:00`);
  rueckblickStart.setDate(rueckblickStart.getDate() - RUECKBLICK_WOCHEN * 7);

  const { data, error } = await supabase
    .from("tasks")
    .select("id, task_date, start_time, end_time, planned_minutes, max_minutes, paid_minutes, wage_minutes, status, employee_name")
    .eq("employee_name", name)
    .gte("task_date", rueckblickStart.toISOString().slice(0, 10))
    .lte("task_date", tage[tage.length - 1])
    .limit(2000);

  if (error) return leer;

  const proTag = new Map<string, number>();
  for (const task of (data || []) as AnyRow[]) {
    if (!istGezaehlt(task)) continue;
    const tag = text(task.task_date).slice(0, 10);
    if (!tag) continue;
    proTag.set(tag, (proTag.get(tag) || 0) + planMinuten(task));
  }

  // Muster je Wochentag aus dem Rückblick, ohne die Urlaubstage selbst.
  const imUrlaub = new Set(tage);
  const musterProWochentag = new Map<number, number[]>();
  for (const [tag, minuten] of proTag.entries()) {
    if (imUrlaub.has(tag) || minuten <= 0) continue;
    const wochentag = new Date(`${tag}T12:00:00`).getDay();
    musterProWochentag.set(wochentag, [...(musterProWochentag.get(wochentag) || []), minuten]);
  }

  const detail: Gutschrift["detail"] = tage.map((tag) => {
    const ausEinsatz = proTag.get(tag) || 0;
    if (ausEinsatz > 0) return { tag, minuten: ausEinsatz, quelle: "einsatz" as const };

    const wochentag = new Date(`${tag}T12:00:00`).getDay();
    const ausMuster = haeufigster(musterProWochentag.get(wochentag) || []);
    if (ausMuster > 0) return { tag, minuten: ausMuster, quelle: "muster" as const };

    return { tag, minuten: 0, quelle: "keine" as const };
  });

  return {
    tage: detail.filter((eintrag) => eintrag.minuten > 0).length,
    minuten: detail.reduce((summe, eintrag) => summe + eintrag.minuten, 0),
    detail
  };
}
