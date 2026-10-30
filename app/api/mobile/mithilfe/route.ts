import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert } from "@/lib/safeWrite";
import { zeitNeuVerteilen } from "@/lib/mithilfe";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Mithilfe: einen eigenen Einsatz anlegen, weil man mitgegangen ist.
 *
 * Nertil hat den Einsatz, Elona fährt mit. Ohne eigenen Einsatz konnte sie
 * nicht stempeln — die Stempeluhr verlangt einen, und das bleibt auch so.
 * Stattdessen legt sie hier beim Scannen ihren eigenen an.
 *
 * Bewusst keine freie Zeiterfassung: Gebucht werden kann nur dort, wo heute
 * tatsächlich jemand anderes einen Einsatz hat. Sonst wäre das Stempeln an
 * jedem beliebigen Objekt offen, und genau das soll es nicht sein.
 *
 * Die Zeitvorgabe wird vom Einsatz übernommen, bei dem geholfen wird. So hat
 * die Zeitenfreigabe ein Soll zum Vergleichen, statt die Stunden ohne
 * Gegenwert durchzuwinken.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function heuteIso() {
  const jetzt = new Date();
  return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-${String(jetzt.getDate()).padStart(2, "0")}`;
}

function gleicherName(a: unknown, b: unknown) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const supabase = auth.supabase;
    const eigenerName = clean(auth.profile.name);
    if (!eigenerName) return NextResponse.json({ ok: false, error: "Zu diesem Login fehlt der Name." }, { status: 400 });

    const body = await request.json();
    const objektId = uuidOrNull(body.work_site_id);
    if (!objektId) return NextResponse.json({ ok: false, error: "Es fehlt das Objekt." }, { status: 400 });

    const heute = heuteIso();

    const einsaetze = await supabase
      .from("tasks")
      .select("*")
      .eq("work_site_id", objektId)
      .eq("task_date", heute)
      .limit(50);
    if (einsaetze.error) throw new Error(einsaetze.error.message);

    const alle = (einsaetze.data || []) as AnyRow[];

    // Schon einen eigenen? Dann nichts anlegen, sondern den zurückgeben.
    const eigener = alle.find((task) => gleicherName(task.employee_name, eigenerName));
    if (eigener) return NextResponse.json({ ok: true, task: eigener, neu: false });

    const fremde = alle.filter((task) => clean(task.employee_name) && !gleicherName(task.employee_name, eigenerName));
    if (!fremde.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Hier ist heute niemand eingeteilt. Wenn du trotzdem hier arbeitest, sag im Büro Bescheid — dann wird der Einsatz eingetragen."
        },
        { status: 409 }
      );
    }

    // Bei dem Einsatz mithelfen, der die längste Zeitvorgabe hat: das ist der
    // eigentliche Auftrag, falls mehrere kleine danebenstehen.
    const vorbild = [...fremde].sort(
      (a, b) => (Number(b.planned_minutes) || 0) - (Number(a.planned_minutes) || 0)
    )[0];

    const objekt = (await supabase.from("work_sites").select("name, customer_name").eq("id", objektId).maybeSingle()).data as AnyRow | null;
    // Ohne eigene Zeit anlegen: gleich danach wird das Volumen des
    // Einsatzes auf alle Beteiligten aufgeteilt. Stuende hier die volle
    // Vorgabe, waere die Summe der Gruppe doppelt so gross wie der Auftrag.
    const minuten = 0;

    const ergebnis = await safeInsert(supabase, "tasks", {
      title: `Mithilfe bei ${clean(vorbild.employee_name)}`,
      site: clean(objekt?.name) || clean(vorbild.site) || null,
      employee_name: eigenerName,
      task_date: heute,
      // Kein Zeitfenster: wann genau, sagt die Stempeluhr. Die Dauer zählt.
      start_time: null,
      end_time: null,
      window_binding: false,
      planned_minutes: minuten,
      max_minutes: minuten,
      paid_minutes: minuten,
      wage_minutes: minuten,
      work_site_id: objektId,
      customer_id: vorbild.customer_id || null,
      customer_name: clean(objekt?.customer_name) || clean(vorbild.customer_name) || null,
      status: "open",
      priority: "Normal",
      task_type: "einsatz",
      item_type: "einsatz",
      done: false,
      helfer_zu: vorbild.id,
      auto_erstellt: true,
      notes: `Beim Scannen angelegt, weil ${eigenerName} mitgeholfen hat.`,
      created_at: new Date().toISOString()
    });

    // Jetzt das Volumen des Einsatzes auf alle Beteiligten aufteilen.
    const aufteilung = await zeitNeuVerteilen(supabase, vorbild.id);

    // Das Büro soll sehen, dass jemand mitgegangen ist, den niemand geplant hat.
    await supabase.from("admin_notifications").insert({
      title: "Mithilfe am Objekt",
      message: `${eigenerName} hilft heute bei ${clean(vorbild.employee_name)} an ${clean(objekt?.name) || "einem Objekt"} mit.${aufteilung ? ` Die Zeitvorgabe von ${Math.round(aufteilung.gesamt / 60 * 10) / 10} Std. ist jetzt auf ${aufteilung.anzahl} Personen aufgeteilt.` : ""}`,
      employee_name: eigenerName,
      notification_type: "mithilfe",
      status: "open",
      read: false,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({
      ok: true,
      task: ergebnis.data,
      neu: true,
      hilftBei: clean(vorbild.employee_name),
      uebersprungen: ergebnis.skipped
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Der Einsatz konnte nicht angelegt werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
