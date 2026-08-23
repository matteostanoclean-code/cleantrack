import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { pushAnMitarbeiter } from "@/lib/push";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false, response: NextResponse.json({ ok: false, error: "Nur Admins dürfen die Planungszentrale nutzen." }, { status: 403 }) };
  return { ok: true, auth };
}

function seriesQuery(supabase: any, groupId: string, scope: string, fromDate: string) {
  let query = supabase.from("tasks").select("id, title, site, employee_name, task_date, status, done").eq("recurrence_group_id", groupId);
  if (scope !== "all") query = query.gte("task_date", fromDate || todayIso());
  return query;
}

/**
 * Meldung in der App ablegen und zusätzlich aufs Handy schicken.
 *
 * Vorher stand die Zuweisung nur in der App und wurde erst beim nächsten
 * Öffnen gesehen. Wer nicht reinschaut, erfährt von einem neuen Einsatz nichts.
 */
async function insertAdminNote(supabase: any, payload: AnyRow) {
  if (payload.employee_name) {
    await pushAnMitarbeiter(
      supabase,
      payload.employee_name,
      payload.title,
      payload.message,
      payload.push_url || "/mitarbeiter/schedule",
      payload.notification_type || "planning_update"
    );
  }
  await supabase.from("admin_notifications").insert({
    title: payload.title,
    message: payload.message,
    employee_name: payload.employee_name || null,
    work_site_name: payload.work_site_name || null,
    object_name: payload.work_site_name || null,
    site: payload.work_site_name || null,
    notification_type: payload.notification_type || "planning_update",
    status: "open",
    read: false,
    created_at: new Date().toISOString()
  });
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if ("response" in guard) return guard.response;

    const { supabase, profile } = guard.auth;
    const body = await request.json();
    const type = clean(body.type);
    const id = clean(body.id);
    const groupId = clean(body.recurrence_group_id);
    const scope = clean(body.scope || "future");
    const fromDate = clean(body.from_date || todayIso());

    if (type === "task_assign") {
      if (!id) return NextResponse.json({ ok: false, error: "Einsatz-ID fehlt." }, { status: 400 });
      const employeeName = nullableText(body.employee_name);
      const { data, error } = await supabase
        .from("tasks")
        .update({ employee_name: employeeName, notify_employee: Boolean(employeeName) })
        .eq("id", id)
        .select("id, title, site, employee_name, task_date")
        .single();
      if (error) throw new Error(error.message);
      if (employeeName) {
        await insertAdminNote(supabase, {
          title: "Einsatz zugewiesen",
          message: `${profile.name} hat dir einen Einsatz zugewiesen: ${data.title || "Einsatz"}${data.site ? ` bei ${data.site}` : ""}.`,
          employee_name: employeeName,
          work_site_name: data.site,
          notification_type: "task_assigned"
        });
      }
      return NextResponse.json({ ok: true, item: data, count: 1 });
    }

    if (type === "series_assign") {
      if (!groupId) return NextResponse.json({ ok: false, error: "Serien-ID fehlt." }, { status: 400 });
      const employeeName = nullableText(body.employee_name);
      let updateQuery = supabase
        .from("tasks")
        .update({ employee_name: employeeName, notify_employee: Boolean(employeeName) })
        .eq("recurrence_group_id", groupId);
      if (scope !== "all") updateQuery = updateQuery.gte("task_date", fromDate || todayIso());
      const { data, error } = await updateQuery.select("id, title, site, employee_name, task_date");
      if (error) throw new Error(error.message);
      const count = Array.isArray(data) ? data.length : 0;
      if (employeeName && count) {
        await insertAdminNote(supabase, {
          title: "Einsatz-Serie zugewiesen",
          message: `${count} Einsätze wurden dir zugewiesen.`,
          employee_name: employeeName,
          work_site_name: data?.[0]?.site,
          notification_type: "task_series_assigned"
        });
      }
      return NextResponse.json({ ok: true, items: data || [], count });
    }

    if (type === "series_update") {
      if (!groupId) return NextResponse.json({ ok: false, error: "Serien-ID fehlt." }, { status: 400 });
      const patch: AnyRow = {};
      if (body.start_time !== undefined) patch.start_time = nullableText(body.start_time);
      if (body.end_time !== undefined) patch.end_time = nullableText(body.end_time);
      if (body.planned_minutes !== undefined) {
        const minutes = nullableNumber(body.planned_minutes);
        patch.planned_minutes = minutes;
        patch.max_minutes = minutes;
        patch.paid_minutes = minutes;
        patch.wage_minutes = minutes;
      }
      if (body.employee_name !== undefined) {
        const employeeName = nullableText(body.employee_name);
        patch.employee_name = employeeName;
        patch.notify_employee = Boolean(employeeName);
      }
      if (body.status !== undefined) {
        patch.status = clean(body.status) || "open";
        patch.done = ["done", "cancelled", "storniert"].includes(clean(body.status).toLowerCase());
      }
      if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Keine Änderung angegeben." }, { status: 400 });

      let updateQuery = supabase.from("tasks").update(patch).eq("recurrence_group_id", groupId);
      if (scope !== "all") updateQuery = updateQuery.gte("task_date", fromDate || todayIso());
      const { data, error } = await updateQuery.select("id, title, site, employee_name, task_date, status");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, items: data || [], count: Array.isArray(data) ? data.length : 0 });
    }

    if (type === "series_status") {
      if (!groupId) return NextResponse.json({ ok: false, error: "Serien-ID fehlt." }, { status: 400 });
      const status = clean(body.status) || "open";
      const done = booleanValue(body.done, ["done", "cancelled", "storniert", "paused"].includes(status.toLowerCase()));
      let updateQuery = supabase.from("tasks").update({ status, done }).eq("recurrence_group_id", groupId);
      if (scope !== "all") updateQuery = updateQuery.gte("task_date", fromDate || todayIso());
      const { data, error } = await updateQuery.select("id, title, site, employee_name, task_date, status");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, items: data || [], count: Array.isArray(data) ? data.length : 0 });
    }

    return NextResponse.json({ ok: false, error: "Unbekannte Planungs-Aktion." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Planung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
