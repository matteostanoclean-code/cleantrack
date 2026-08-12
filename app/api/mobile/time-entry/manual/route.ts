import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert } from "@/lib/safeWrite";
import { minutesBetweenHm, parseHm } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Zeit nachtragen.
 *
 * Wenn ein Einsatz gelaufen ist, aber nicht gestempelt wurde, kann der
 * Mitarbeiter die Zeit hier nachreichen. Sie wird als Nachtrag markiert,
 * braucht immer einen Grund und geht zur Freigabe ins Büro. Gestempelte
 * Zeiten bleiben davon unberührt.
 */

type AnyRow = Record<string, any>;

const REASONS = [
  "Stempeln vergessen",
  "Kein Empfang am Objekt",
  "Handy war leer",
  "Kurzfristig eingesprungen",
  "Sonstiges"
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrZero(value: unknown) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function plannedMinutesFromTask(task: AnyRow) {
  const direct = Number(task.planned_minutes ?? task.max_minutes ?? task.paid_minutes ?? task.wage_minutes ?? 0);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  return minutesBetweenHm(clean(task.start_time).slice(0, 5), clean(task.end_time).slice(0, 5));
}

export async function GET() {
  return NextResponse.json({ ok: true, reasons: REASONS });
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json();
    const taskId = uuidOrNull(body.taskId);
    const startTime = clean(body.startTime).slice(0, 5);
    const endTime = clean(body.endTime).slice(0, 5);
    const breakMinutes = numberOrZero(body.breakMinutes);
    const reason = clean(body.reason).slice(0, 300);

    if (!taskId) return NextResponse.json({ ok: false, error: "Bitte den Einsatz auswählen." }, { status: 400 });
    if (parseHm(startTime) === null) return NextResponse.json({ ok: false, error: "Startzeit bitte als HH:MM angeben." }, { status: 400 });
    if (parseHm(endTime) === null) return NextResponse.json({ ok: false, error: "Endzeit bitte als HH:MM angeben." }, { status: 400 });
    if (!reason) return NextResponse.json({ ok: false, error: "Bitte einen Grund für den Nachtrag angeben." }, { status: 400 });

    const taskResult = await auth.supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
    if (taskResult.error) throw new Error(taskResult.error.message);
    const task = taskResult.data as AnyRow | null;
    if (!task) return NextResponse.json({ ok: false, error: "Der Einsatz wurde nicht gefunden." }, { status: 404 });

    const employeeName = auth.isAdmin && clean(body.employeeName) ? clean(body.employeeName) : auth.profile.name;
    if (clean(task.employee_name).toLowerCase() !== employeeName.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Dieser Einsatz gehört zu einer anderen Person." }, { status: 403 });
    }

    const day = clean(task.task_date).slice(0, 10);
    if (!day) return NextResponse.json({ ok: false, error: "Der Einsatz hat kein Datum." }, { status: 400 });

    // Doppelte Nachtraege verhindern: gibt es schon ein Ausstempeln, ist der Tag erfasst.
    const existing = await auth.supabase
      .from("time_entries")
      .select("id, action, success")
      .eq("task_id", taskId)
      .eq("action", "clock_out")
      .neq("success", false)
      .limit(1);
    if (!existing.error && existing.data?.length) {
      return NextResponse.json({ ok: false, error: "Für diesen Einsatz ist bereits eine Zeit erfasst." }, { status: 409 });
    }

    const grossMinutes = minutesBetweenHm(startTime, endTime);
    if (grossMinutes <= 0) return NextResponse.json({ ok: false, error: "Die Endzeit muss nach der Startzeit liegen." }, { status: 400 });
    if (breakMinutes >= grossMinutes) return NextResponse.json({ ok: false, error: "Die Pause ist länger als die Arbeitszeit." }, { status: 400 });

    const workedMinutes = grossMinutes - breakMinutes;
    const plannedMinutes = plannedMinutesFromTask(task);
    const startIso = new Date(`${day}T${startTime}:00`).toISOString();
    const endIso = new Date(`${day}T${endTime}:00`).toISOString();
    const siteName = clean(task.site || task.customer_name) || null;

    const common = {
      task_id: task.id,
      employee_name: employeeName,
      employee_id: auth.profile.id,
      work_site_id: task.work_site_id || null,
      work_site_name: siteName,
      success: true,
      entry_type: "manual",
      source: "nachtrag",
      reason,
      note: reason
    };

    await safeInsert(auth.supabase, "time_entries", {
      ...common,
      action: "clock_in",
      created_at: startIso,
      error_message: "Nachgetragen, nicht gestempelt."
    });

    const clockOut = await safeInsert(auth.supabase, "time_entries", {
      ...common,
      action: "clock_out",
      created_at: endIso,
      pause_minutes: breakMinutes,
      planned_minutes: plannedMinutes || null,
      actual_minutes: workedMinutes,
      overtime_minutes: plannedMinutes ? Math.max(0, workedMinutes - plannedMinutes) : 0,
      approved_minutes: null,
      approval_status: "pending",
      error_message: "Nachgetragen, nicht gestempelt. Bitte pruefen."
    });

    await auth.supabase.from("tasks").update({ done: true, status: "done" }).eq("id", task.id);

    await auth.supabase.from("admin_notifications").insert({
      title: "Zeit nachgetragen",
      message: [
        `${employeeName} hat die Zeit für ${siteName || "einen Einsatz"} am ${day} nachgetragen.`,
        `${startTime} bis ${endTime}${breakMinutes ? `, ${breakMinutes} Min. Pause` : ""} — ${workedMinutes} Min.${plannedMinutes ? ` geplant waren ${plannedMinutes} Min.` : ""}`,
        `Grund: ${reason}`,
        "Bitte in der Zeitenfreigabe prüfen."
      ].join("\n"),
      employee_name: employeeName,
      work_site_name: siteName,
      object_name: siteName,
      read: false,
      status: "open",
      notification_type: "time_manual",
      task_id: task.id,
      work_site_id: task.work_site_id || null,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({
      ok: true,
      entry: clockOut.data,
      workedMinutes,
      plannedMinutes,
      hint: "Die Zeit wurde nachgetragen und liegt jetzt beim Büro zur Freigabe."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zeit konnte nicht nachgetragen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
