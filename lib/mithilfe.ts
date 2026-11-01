type AnyRow = Record<string, any>;

/**
 * Zeitvorgabe aufteilen, wenn jemand mithilft.
 *
 * Grundsatz: Ein Einsatz hat ein Volumen — zwei Stunden Unterhaltsreinigung.
 * Kommt ein zweiter dazu, wird dieses Volumen geteilt, nicht verdoppelt. Zwei
 * Leute brauchen für dieselbe Arbeit zusammen nicht mehr Zeit.
 *
 * Das Volumen muss nirgends gespeichert werden: Es ist immer die Summe über
 * die Gruppe. Beim Teilen bleibt die Summe gleich, also stimmt sie auch beim
 * dritten und vierten Helfer noch. Eine eigene Spalte dafür wäre eine zweite
 * Wahrheit, die irgendwann von der ersten abweicht.
 *
 * Die Gruppe ist der ursprüngliche Einsatz plus alle, die über helfer_zu an
 * ihm hängen.
 *
 * Was das nicht kann: Fällt ein Helfer wieder weg, bekommt der Rest die Zeit
 * nicht von allein zurück. Das muss das Büro im Planer nachziehen — lieber
 * eine Zahl, die jemand bewusst ändert, als eine, die sich hinter dem Rücken
 * bewegt.
 */

function zahl(wert: unknown) {
  const gelesen = Number(wert);
  return Number.isFinite(gelesen) && gelesen > 0 ? gelesen : 0;
}

/**
 * Zeit zurückgeben, wenn einer aus einer Mithilfe-Gruppe wegfällt.
 *
 * Gegenstück zum Dazustellen: Die Arbeit bleibt dieselbe, nur machen sie
 * weniger Leute. Also bekommt der Rest die Minuten des Abgegangenen zurück,
 * statt dass sie aus der Planung verschwinden.
 *
 * Wird der ursprüngliche Einsatz gelöscht, zeigt das helfer_zu der anderen
 * ins Leere. Deshalb wird der erste Verbliebene zum neuen Anker.
 *
 * Die gelöschte Zeile wird mitgegeben, nicht nachgelesen — zu dem Zeitpunkt
 * ist sie schon weg.
 */
export async function zeitNachAbgangVerteilen(supabase: AnyRow, geloescht: AnyRow) {
  const eigeneId = String(geloescht?.id || "").trim();
  const ankerId = String(geloescht?.helfer_zu || "").trim() || eigeneId;
  if (!ankerId) return null;

  const [original, helfer] = await Promise.all([
    supabase.from("tasks").select("id, planned_minutes, max_minutes").eq("id", ankerId).maybeSingle(),
    supabase.from("tasks").select("id, planned_minutes, max_minutes").eq("helfer_zu", ankerId).limit(20)
  ]);

  const rest: AnyRow[] = [...(original.data ? [original.data] : []), ...((helfer.data || []) as AnyRow[])]
    .filter((eintrag) => String(eintrag.id) !== eigeneId);
  if (!rest.length) return null;

  if (!original.data) {
    const [neuerAnker, ...weitere] = rest;
    await supabase.from("tasks").update({ helfer_zu: null }).eq("id", neuerAnker.id);
    for (const eintrag of weitere) {
      await supabase.from("tasks").update({ helfer_zu: neuerAnker.id }).eq("id", eintrag.id);
    }
  }

  const gesamt = [...rest, geloescht].reduce(
    (summe, eintrag) => summe + (zahl(eintrag.planned_minutes) || zahl(eintrag.max_minutes)),
    0
  );
  if (!gesamt) return null;

  const anteil = Math.floor(gesamt / rest.length);
  const uebrig = gesamt - anteil * rest.length;
  for (let i = 0; i < rest.length; i += 1) {
    const minuten = anteil + (i < uebrig ? 1 : 0);
    await supabase
      .from("tasks")
      .update({ planned_minutes: minuten, max_minutes: minuten, paid_minutes: minuten, wage_minutes: minuten })
      .eq("id", rest[i].id);
  }

  return { gesamt, anzahl: rest.length, jeweils: anteil };
}

export async function zeitNeuVerteilen(supabase: AnyRow, originalId: string) {
  const id = String(originalId || "").trim();
  if (!id) return null;

  const [original, helfer] = await Promise.all([
    supabase.from("tasks").select("id, planned_minutes, max_minutes").eq("id", id).maybeSingle(),
    supabase.from("tasks").select("id, planned_minutes, max_minutes").eq("helfer_zu", id).limit(20)
  ]);

  if (original.error || !original.data) return null;

  const gruppe: AnyRow[] = [original.data, ...((helfer.data || []) as AnyRow[])];
  if (gruppe.length < 2) return null;

  const gesamt = gruppe.reduce((summe, eintrag) => summe + (zahl(eintrag.planned_minutes) || zahl(eintrag.max_minutes)), 0);
  if (!gesamt) return null;

  /**
   * Gleichmäßig teilen, der Rest geht an den ersten. Bei 125 Minuten auf zwei
   * heißt das 63 und 62 — nicht schön, aber ehrlich: zusammen wieder 125.
   * Würde man beide auf 62 abrunden, verschwände eine Minute aus der Planung.
   */
  const anteil = Math.floor(gesamt / gruppe.length);
  const rest = gesamt - anteil * gruppe.length;

  for (let i = 0; i < gruppe.length; i += 1) {
    const minuten = anteil + (i < rest ? 1 : 0);
    await supabase
      .from("tasks")
      .update({
        planned_minutes: minuten,
        max_minutes: minuten,
        paid_minutes: minuten,
        wage_minutes: minuten
      })
      .eq("id", gruppe[i].id);
  }

  return { gesamt, anzahl: gruppe.length, jeweils: anteil };
}
