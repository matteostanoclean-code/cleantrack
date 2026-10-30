import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert } from "@/lib/safeWrite";
import { zeitNeuVerteilen } from "@/lib/mithilfe";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Einen Helfer aus dem Planer dazustellen.
 *
 * Geht über dieselbe Rechnung wie das Dazukommen per Aufkleber: der Helfer
 * wird ohne eigene Zeit angelegt, danach wird das Volumen des Einsatzes auf
 * alle Beteiligten aufgeteilt. Zwei Wege, die dasselbe tun, laufen sonst
 * irgendwann auseinander — und dann steht dieselbe Arbeit je nach Weg mit
 * unterschiedlichen Stunden im Lohn.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 });

    const supabase = auth.supabase;
    const body = await request.json();
    const taskId = clean(body.task_id);
    const helfer = clean(body.employee_name);

    if (!taskId) return NextResponse.json({ ok: false, error: "Es fehlt der Einsatz." }, { status: 400 });
    if (!helfer) return NextResponse.json({ ok: false, error: "Bitte eine Person wählen." }, { status: 400 });

    const einsatz = (await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle()).data as AnyRow | null;
    if (!einsatz) return NextResponse.json({ ok: false, error: "Diesen Einsatz gibt es nicht." }, { status: 404 });

    // An den ursprünglichen Einsatz hängen, nicht an einen Helfer: sonst
    // entstünde eine Kette und die Gruppe wäre nicht mehr zu finden.
    const originalId = clean(einsatz.helfer_zu) || clean(einsatz.id);

    const schonDrin = await supabase
      .from("tasks")
      .select("id")
      .eq("task_date", clean(einsatz.task_date).slice(0, 10))
      .eq("work_site_id", einsatz.work_site_id)
      .ilike("employee_name", helfer)
      .limit(1);
    if ((schonDrin.data || []).length) {
      return NextResponse.json({ ok: false, error: `${helfer} steht an dem Tag schon auf diesem Objekt.` }, { status: 409 });
    }

    const original = originalId === clean(einsatz.id)
      ? einsatz
      : ((await supabase.from("tasks").select("*").eq("id", originalId).maybeSingle()).data as AnyRow | null) || einsatz;

    const ergebnis = await safeInsert(supabase, "tasks", {
      title: `Mithilfe bei ${clean(original.employee_name) || "Einsatz"}`,
      site: clean(original.site) || null,
      employee_name: helfer,
      task_date: clean(original.task_date).slice(0, 10),
      start_time: original.start_time || null,
      end_time: original.end_time || null,
      window_binding: original.window_binding === true,
      // Ohne eigene Zeit: gleich danach wird aufgeteilt.
      planned_minutes: 0,
      max_minutes: 0,
      paid_minutes: 0,
      wage_minutes: 0,
      work_site_id: original.work_site_id || null,
      customer_id: original.customer_id || null,
      customer_name: clean(original.customer_name) || null,
      status: "open",
      priority: "Normal",
      task_type: "einsatz",
      item_type: "einsatz",
      done: false,
      helfer_zu: originalId,
      auto_erstellt: false,
      notes: `Vom Büro dazugestellt, hilft bei ${clean(original.employee_name) || "dem Einsatz"}.`,
      created_at: new Date().toISOString()
    });

    const aufteilung = await zeitNeuVerteilen(supabase, originalId);

    return NextResponse.json({ ok: true, task: ergebnis.data, aufteilung });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Der Helfer konnte nicht dazugestellt werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
