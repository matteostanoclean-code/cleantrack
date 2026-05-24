import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function todayIso() {
  return new Date().toISOString();
}

function isActiveTask(task: AnyRow) {
  const status = clean(task.status || "open").toLowerCase();
  if (task.done) return false;
  return !["done", "erledigt", "cancelled", "canceled", "storniert", "paused", "pause"].includes(status);
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur Admins dürfen die Urlaubsplanung nutzen." }, { status: 403 }) };
  return { ok: true as const, auth };
}

async function readAbsence(supabase: any, id: string) {
  const { data, error } = await supabase.from("absence_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Abwesenheitsantrag wurde nicht gefunden.");
  return data as AnyRow;
}

async function notifyEmployee(supabase: any, absence: AnyRow, title: string, message: string) {
  if (!clean(absence.employee_name)) return;
  await supabase.from("admin_notifications").insert({
    title,
    message,
    employee_name: absence.employee_name,
    notification_type: "absence_decision",
    absence_request_id: absence.id,
    status: "open",
    read: false,
    created_at: todayIso()
  });
}

async function loadConflicts(supabase: any, absence: AnyRow) {
  const employeeName = clean(absence.employee_name);
  const startDate = clean(absence.start_date);
  const endDate = clean(absence.end_date || absence.start_date);
  if (!employeeName || !startDate) return [] as AnyRow[];

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, site, employee_name, task_date, start_time, end_time, status, done, recurrence_group_id")
    .eq("employee_name", employeeName)
    .gte("task_date", startDate)
    .lte("task_date", endDate)
    .order("task_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).filter(isActiveTask);
}

async function unassignConflicts(supabase: any, conflicts: AnyRow[], reason: string) {
  const ids = conflicts.map((task) => clean(task.id)).filter(Boolean);
  if (!ids.length) return 0;
  const note = reason ? `Urlaubsplanung: ${reason}` : "Urlaubsplanung: Mitarbeiter wegen Abwesenheit entfernt.";
  const { error } = await supabase
    .from("tasks")
    .update({ employee_name: null, notify_employee: false, notes: note })
    .in("id", ids);
  if (error) throw new Error(error.message);
  return ids.length;
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { supabase } = guard.auth;
    const body = await request.json();
    const employeeName = clean(body.employee_name);
    const requestType = clean(body.request_type || body.absence_type || "urlaub");
    const startDate = clean(body.start_date);
    const endDate = clean(body.end_date || body.start_date);

    if (!employeeName) return NextResponse.json({ ok: false, error: "Bitte Mitarbeiter auswählen." }, { status: 400 });
    if (!startDate || !endDate) return NextResponse.json({ ok: false, error: "Bitte Zeitraum eintragen." }, { status: 400 });

    const { data: employee } = await supabase
      .from("employee_profiles")
      .select("id, name")
      .eq("name", employeeName)
      .maybeSingle();

    const payload = {
      employee_name: employeeName,
      employee_profile_id: employee?.id || null,
      request_type: requestType,
      absence_type: requestType,
      start_date: startDate,
      end_date: endDate,
      reason: nullableText(body.reason),
      status: clean(body.status || "approved"),
      admin_response: nullableText(body.admin_response || "Vom Admin eingetragen."),
      decided_at: todayIso(),
      created_at: todayIso()
    };

    const { data, error } = await supabase.from("absence_requests").insert(payload).select("*").single();
    if (error) throw new Error(error.message);

    await notifyEmployee(
      supabase,
      data,
      "Abwesenheit eingetragen",
      `Für dich wurde eine Abwesenheit vom ${startDate} bis ${endDate} eingetragen.`
    );

    return NextResponse.json({ ok: true, item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Abwesenheit konnte nicht erstellt werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { supabase, profile } = guard.auth;
    const body = await request.json();
    const id = clean(body.id);
    const action = clean(body.action);
    const adminResponse = nullableText(body.admin_response);

    if (!id) return NextResponse.json({ ok: false, error: "Antrag-ID fehlt." }, { status: 400 });
    const absence = await readAbsence(supabase, id);

    if (action === "reject") {
      const { data, error } = await supabase
        .from("absence_requests")
        .update({ status: "rejected", admin_response: adminResponse || "Abgelehnt.", decided_at: todayIso() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await notifyEmployee(supabase, data, "Abwesenheit abgelehnt", data.admin_response || "Deine Abwesenheit wurde abgelehnt.");
      return NextResponse.json({ ok: true, item: data, conflictsReleased: 0 });
    }

    if (action === "approve" || action === "approve_and_unassign") {
      const conflicts = await loadConflicts(supabase, absence);
      let released = 0;
      if (action === "approve_and_unassign") {
        released = await unassignConflicts(supabase, conflicts, `${absence.employee_name} ist vom ${absence.start_date} bis ${absence.end_date || absence.start_date} abwesend.`);
      }

      const { data, error } = await supabase
        .from("absence_requests")
        .update({ status: "approved", admin_response: adminResponse || "Genehmigt.", decided_at: todayIso() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await notifyEmployee(
        supabase,
        data,
        "Abwesenheit genehmigt",
        `${profile.name} hat deine Abwesenheit vom ${data.start_date} bis ${data.end_date || data.start_date} genehmigt.${released ? ` ${released} Einsätze wurden neu zur Planung freigegeben.` : ""}`
      );

      return NextResponse.json({ ok: true, item: data, conflicts: conflicts.length, conflictsReleased: released });
    }

    if (action === "unassign_conflicts") {
      const conflicts = await loadConflicts(supabase, absence);
      const released = await unassignConflicts(supabase, conflicts, `${absence.employee_name} ist vom ${absence.start_date} bis ${absence.end_date || absence.start_date} abwesend.`);
      return NextResponse.json({ ok: true, conflicts: conflicts.length, conflictsReleased: released });
    }

    return NextResponse.json({ ok: false, error: "Unbekannte Urlaubs-Aktion." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Urlaubsplanung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
