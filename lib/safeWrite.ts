/**
 * Schreibhilfen, die auch dann funktionieren, wenn eine Spalte in Supabase
 * (noch) nicht existiert.
 *
 * Hintergrund: Die Tabellen sind über die Zeit gewachsen und nicht auf jedem
 * Stand sind alle Spalten angelegt. Statt mit einem Fehler abzubrechen, wird
 * die unbekannte Spalte aus dem Datensatz entfernt und erneut geschrieben.
 * So gehen im schlimmsten Fall Zusatzangaben verloren, aber nie der ganze
 * Vorgang.
 */

type AnyRow = Record<string, any>;
type SupabaseLike = { from: (table: string) => any };

function missingColumnFrom(message: string, payload: AnyRow) {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation/i,
    /column "([^"]+)" does not exist/i,
    /'([^']+)' column/i
  ];
  for (const pattern of patterns) {
    const column = message.match(pattern)?.[1];
    if (column && Object.prototype.hasOwnProperty.call(payload, column)) return column;
  }
  return null;
}

/** Aktualisiert einen Datensatz per ID und überspringt unbekannte Spalten. */
export async function safeUpdateById(supabase: SupabaseLike, table: string, id: string, payload: AnyRow) {
  let attempt: AnyRow = { ...payload };
  let lastError: { message?: string } | null = null;

  for (let tries = 0; tries < 10; tries += 1) {
    const { data, error } = await supabase.from(table).update(attempt).eq("id", id).select("*").maybeSingle();
    if (!error) return { data, skipped: Object.keys(payload).filter((key) => !(key in attempt)) };

    lastError = error;
    const column = missingColumnFrom(String(error.message || ""), attempt);
    if (!column) break;
    const { [column]: _removed, ...rest } = attempt;
    attempt = rest;
    if (!Object.keys(attempt).length) break;
  }

  throw new Error(lastError?.message || `Änderung an ${table} konnte nicht gespeichert werden.`);
}

/** Fügt einen Datensatz ein und überspringt unbekannte Spalten. */
export async function safeInsert(supabase: SupabaseLike, table: string, payload: AnyRow) {
  let attempt: AnyRow = { ...payload };
  let lastError: { message?: string } | null = null;

  for (let tries = 0; tries < 10; tries += 1) {
    const { data, error } = await supabase.from(table).insert(attempt).select("*").maybeSingle();
    if (!error) return { data, skipped: Object.keys(payload).filter((key) => !(key in attempt)) };

    lastError = error;
    const column = missingColumnFrom(String(error.message || ""), attempt);
    if (!column) break;
    const { [column]: _removed, ...rest } = attempt;
    attempt = rest;
    if (!Object.keys(attempt).length) break;
  }

  throw new Error(lastError?.message || `Eintrag in ${table} konnte nicht gespeichert werden.`);
}
