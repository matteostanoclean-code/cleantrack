/**
 * Einsätze ohne erfasste Zeit aus der Datenbank holen.
 *
 * Getrennt von lib/zeiten.ts, damit die Rechnung dort nichts von der Datenbank
 * wissen muss. Zeitenfreigabe und Startseite laden über diese Stelle, damit
 * Liste und Zahl nicht auseinanderlaufen.
 */

import { AnyRow, berlinJetzt, fehlendeZeitenAus } from "@/lib/zeiten";

/**
 * So weit zurück wird gesucht, unabhängig vom Zeitraum, den die Freigabe gerade
 * zeigt. Sonst verschwänden Anfang des Monats die Einsätze vom Monatsende,
 * obwohl ihre Frist noch läuft. Was älter ist, gilt als erledigt.
 */
export const FEHLEND_TAGE_ZURUECK = 90;

/** Kurz genug, dass die Abfrage-Adresse auch bei vielen Einsätzen nicht zu lang wird. */
const BLOCK = 150;

export async function fehlendeZeitenLaden(supabase: AnyRow) {
  const jetzt = berlinJetzt();
  const anfang = new Date(`${jetzt.tag}T12:00:00Z`);
  anfang.setUTCDate(anfang.getUTCDate() - FEHLEND_TAGE_ZURUECK);
  const von = anfang.toISOString().slice(0, 10);

  const tasksResult = await supabase
    .from("tasks")
    .select("id, title, site, customer_name, employee_name, task_date, start_time, end_time, planned_minutes, max_minutes, paid_minutes, wage_minutes, work_site_id, task_type, item_type, status")
    .gte("task_date", von)
    .lte("task_date", jetzt.tag)
    .not("employee_name", "is", null)
    .limit(2000);
  if (tasksResult.error) throw new Error(tasksResult.error.message);
  const tasks = (tasksResult.data || []) as AnyRow[];
  if (!tasks.length) return [];

  // Nach Einsatz fragen statt nach Zeitraum: ein Nachtrag kann Tage später
  // angelegt sein, gehört aber trotzdem zu diesem Einsatz.
  const ids = tasks.map((task) => String(task.id));
  const gebucht = new Set<string>();
  for (let start = 0; start < ids.length; start += BLOCK) {
    const result = await supabase
      .from("time_entries")
      .select("task_id, success")
      .in("task_id", ids.slice(start, start + BLOCK));
    if (result.error) throw new Error(result.error.message);
    for (const row of (result.data || []) as AnyRow[]) {
      if (row.task_id && row.success !== false) gebucht.add(String(row.task_id));
    }
  }

  return fehlendeZeitenAus(tasks, gebucht, jetzt);
}
