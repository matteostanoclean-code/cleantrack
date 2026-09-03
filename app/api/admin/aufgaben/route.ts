import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { buildRecords } from "@/lib/zeiten";
import { zeitgrenzenLaden } from "@/lib/einstellungen";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Was liegt gerade an.
 *
 * Eine Zahl je Sache, nicht eine Sammelzahl. "17 Freigaben und Meldungen"
 * sagte niemandem, ob das drei Urlaubsanträge oder vierzehn leere
 * Materialmeldungen sind — und wo man anfangen soll.
 *
 * Seitenleiste und Dashboard fragen dieselbe Stelle, damit die Zahlen
 * zusammenpassen.
 */

function text(value: unknown) {
  return String(value ?? "").trim();
}

/** Alles, was noch niemand entschieden hat. */
function istOffen(row: AnyRow) {
  const status = text(row.status || "open").toLowerCase();
  return !["approved", "rejected", "done", "resolved", "closed", "erledigt"].includes(status);
}

function tagVersetzt(tage: number) {
  const datum = new Date();
  datum.setDate(datum.getDate() + tage);
  return datum.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 });

    const supabase = auth.supabase;
    const heute = tagVersetzt(0);
    const von = tagVersetzt(-45);

    const [absencesResult, materialResult, qualityResult, tasksResult, chatResult, notizenResult, entriesResult] = await Promise.all([
      supabase.from("absence_requests").select("id, status").limit(500),
      supabase.from("material_reports").select("id, status").limit(500),
      supabase.from("quality_reports").select("id, status").limit(500),
      supabase.from("tasks").select("id, task_date, employee_name, status, done").gte("task_date", heute).limit(2000),
      supabase.from("chat_messages").select("id, sender_role, read_by_admin").limit(500),
      supabase.from("notes").select("id, faellig_am, erledigt").eq("erledigt", false).limit(500),
      supabase
        .from("time_entries")
        .select("*")
        .gte("created_at", `${von}T00:00:00.000Z`)
        .order("created_at", { ascending: true })
        .limit(2000)
    ]);

    // Einzelne Tabellen dürfen fehlen, ohne dass die ganze Übersicht ausfällt.
    const absences = (absencesResult.data || []) as AnyRow[];
    const material = (materialResult.data || []) as AnyRow[];
    const quality = (qualityResult.data || []) as AnyRow[];
    const tasks = (tasksResult.data || []) as AnyRow[];
    const chat = (chatResult.data || []) as AnyRow[];
    const entries = (entriesResult.data || []) as AnyRow[];

    // Zeiten über dieselbe Rechnung wie die Zeitenfreigabe, sonst weichen die
    // Zahlen voneinander ab und keiner traut mehr einer von beiden.
    const taskIds = Array.from(new Set(entries.map((entry) => entry.task_id).filter(Boolean))) as string[];
    const tasksById = new Map<string, AnyRow>();
    if (taskIds.length) {
      const stamm = await supabase
        .from("tasks")
        .select("id, title, site, customer_name, employee_name, task_date, start_time, end_time, planned_minutes, max_minutes, paid_minutes, wage_minutes, work_site_id, task_type, done")
        .in("id", taskIds);
      for (const task of stamm.data || []) tasksById.set(task.id, task);
    }

    const records = buildRecords(entries, tasksById, await zeitgrenzenLaden(supabase));
    const zeitenOffen = records.filter((record: AnyRow) => record.state === "open").length;
    const zeitenProblem = records.filter((record: AnyRow) => record.locationIssue || record.incomplete).length;

    const urlaub = absences.filter(istOffen).length;
    const materialOffen = material.filter(istOffen).length;
    const qualitaetOffen = quality.filter(istOffen).length;
    const ohneMitarbeiter = tasks.filter((task) => !text(task.employee_name) && text(task.status || "open").toLowerCase() !== "cancelled" && !task.done).length;
    const chatUngelesen = chat.filter((row) => text(row.sender_role).toLowerCase() !== "admin" && row.read_by_admin !== true).length;

    // Notizen zaehlen erst, wenn sie faellig sind. Was naechsten Monat
    // ansteht, gehoert nicht als rote Zahl in die Leiste.
    const notizenFaellig = ((notizenResult.data || []) as AnyRow[])
      .filter((notiz) => { const tag = text(notiz.faellig_am).slice(0, 10); return tag && tag <= heute; }).length;

    const gesamt = zeitenOffen + urlaub + materialOffen + qualitaetOffen + ohneMitarbeiter + chatUngelesen + notizenFaellig;

    return NextResponse.json({
      ok: true,
      stand: new Date().toISOString(),
      gesamt,
      zeiten: zeitenOffen,
      zeitenProblem,
      urlaub,
      material: materialOffen,
      qualitaet: qualitaetOffen,
      ohneMitarbeiter,
      chat: chatUngelesen,
      notizen: notizenFaellig,
      // Für die Sammelzeile in der Seitenleiste.
      meldungen: urlaub + materialOffen + qualitaetOffen
    });
  } catch (fehler) {
    const nachricht = fehler instanceof Error ? fehler.message : "Aufgaben konnten nicht gezählt werden.";
    return NextResponse.json({ ok: false, error: nachricht }, { status: 500 });
  }
}
