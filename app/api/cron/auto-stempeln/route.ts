import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { safeInsert } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyRow = Record<string, any>;

/**
 * Einsätze des Inhabers von selbst buchen.
 *
 * Der Inhaber stempelt nicht. Er plant seine eigenen Einsätze und fährt
 * hin — die Stempeluhr überwacht niemanden, sie würde ihn nur daran
 * erinnern, eine App zu öffnen. Also zählt bei ihm die geplante Zeit als
 * geleistet, und diese Buchung macht daraus eine richtige Zeit, die in
 * Auswertung und Lohn auftaucht.
 *
 * Drei Grenzen:
 *
 * 1. Gebucht wird erst, wenn der Einsatz **vorbei** ist. Nie im Voraus —
 *    eine Zeit, die noch nicht stattgefunden hat, ist keine Zeit.
 * 2. Nur für Profile mit `inhaber = true`. Für alle anderen bliebe es
 *    eine Arbeitszeitaufzeichnung ohne Grundlage (§ 17 Abs. 1 MiLoG).
 * 3. Wo schon gestempelt wurde, wird nichts angefasst. Hat er doch die
 *    App benutzt, gilt die echte Zeit.
 *
 * In der Buchung steht, dass sie automatisch entstanden ist. Eine Zeit,
 * die aussieht wie gestempelt, es aber nicht ist, wäre eine Lüge in den
 * eigenen Unterlagen.
 */

const VERMERK = "Automatisch nach Plan gebucht, nicht gestempelt.";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function minuten(task: AnyRow) {
  for (const feld of ["planned_minutes", "max_minutes", "paid_minutes", "wage_minutes"]) {
    const zahl = Number(task[feld]);
    if (Number.isFinite(zahl) && zahl > 0) return Math.round(zahl);
  }
  return 0;
}

/** Anfang und Ende als echte Zeitpunkte. Ohne Uhrzeit gilt ab 8 Uhr. */
function zeitfenster(task: AnyRow) {
  const tag = clean(task.task_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return null;

  const dauer = minuten(task);
  if (!dauer) return null;

  const start = clean(task.start_time).slice(0, 5) || "08:00";
  if (!/^\d{2}:\d{2}$/.test(start)) return null;

  const von = new Date(`${tag}T${start}:00`);
  if (Number.isNaN(von.getTime())) return null;
  const bis = new Date(von.getTime() + dauer * 60000);
  return { von, bis, dauer };
}

function shouldRun(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return clean(request.headers.get("authorization")) === `Bearer ${secret}`;
}

async function buchen(request: Request) {
  if (!shouldRun(request)) {
    return NextResponse.json({ ok: false, error: "Cron nicht autorisiert." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const personen = await supabase.from("employee_profiles").select("id, name, inhaber").eq("inhaber", true);
  // Fehlt die Spalte, gibt es keinen Inhaber und damit nichts zu tun.
  if (personen.error) return NextResponse.json({ ok: true, gebucht: 0, hinweis: "Kein Inhaber-Kennzeichen vorhanden." });

  const inhaber = ((personen.data || []) as AnyRow[]).filter((person) => clean(person.name));
  if (!inhaber.length) return NextResponse.json({ ok: true, gebucht: 0, hinweis: "Kein Profil ist als Inhaber gekennzeichnet." });

  const jetzt = new Date();
  const seit = new Date(jetzt.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const bis = jetzt.toISOString().slice(0, 10);

  const namen = inhaber.map((person) => clean(person.name));
  const aufgaben = await supabase
    .from("tasks")
    .select("*")
    .in("employee_name", namen)
    .gte("task_date", seit)
    .lte("task_date", bis)
    .limit(500);
  if (aufgaben.error) throw new Error(aufgaben.error.message);

  const offen = ((aufgaben.data || []) as AnyRow[]).filter(
    (task) => !task.done && !["done", "cancelled", "storniert"].includes(clean(task.status).toLowerCase())
  );
  if (!offen.length) return NextResponse.json({ ok: true, gebucht: 0 });

  // Wo schon etwas gestempelt wurde, wird nichts gebucht.
  const vorhanden = await supabase
    .from("time_entries")
    .select("task_id")
    .in("task_id", offen.map((task) => task.id))
    .limit(2000);
  const schonDa = new Set(((vorhanden.data || []) as AnyRow[]).map((zeile) => clean(zeile.task_id)));

  let gebucht = 0;
  const uebersprungen: string[] = [];

  for (const task of offen) {
    if (schonDa.has(clean(task.id))) continue;

    const fenster = zeitfenster(task);
    if (!fenster) {
      uebersprungen.push(`${clean(task.task_date)} ${clean(task.site)}: keine Zeitvorgabe`);
      continue;
    }
    if (fenster.bis > jetzt) continue; // noch nicht vorbei

    const person = inhaber.find((eintrag) => clean(eintrag.name) === clean(task.employee_name));
    const gemeinsam = {
      task_id: task.id,
      employee_name: clean(task.employee_name),
      employee_id: person?.id || null,
      work_site_id: task.work_site_id || null,
      work_site_name: clean(task.site || task.customer_name) || null,
      success: true,
      entry_type: "auto",
      source: "plan",
      note: VERMERK
    };

    await safeInsert(supabase, "time_entries", {
      ...gemeinsam,
      action: "clock_in",
      created_at: fenster.von.toISOString()
    });
    await safeInsert(supabase, "time_entries", {
      ...gemeinsam,
      action: "clock_out",
      created_at: fenster.bis.toISOString(),
      worked_minutes: fenster.dauer,
      // Der Inhaber gibt sich nichts frei. Die Zeit ist mit dem Plan
      // beschlossen, sie muss nicht noch einmal durch die Zeitenfreigabe.
      approval_status: "approved"
    });

    await supabase.from("tasks").update({ done: true, status: "done" }).eq("id", task.id);
    gebucht += 1;
  }

  return NextResponse.json({ ok: true, gebucht, uebersprungen: uebersprungen.slice(0, 10) });
}

export async function GET(request: Request) {
  try {
    return await buchen(request);
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Buchen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
