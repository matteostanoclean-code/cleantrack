import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";
import { localDayIso, minutesBetweenHm, minutesToHm, parseHm } from "@/lib/format";
import { AnyRow, TOLERANCE_MINUTES, buildRecords, numberOrNull, plannedMinutesFromTask, text } from "@/lib/zeiten";
import { zeitgrenzenLaden } from "@/lib/einstellungen";

export const dynamic = "force-dynamic";

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur Admins dürfen Zeiten freigeben." }, { status: 403 }) };
  return { ok: true as const, auth };
}

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const { supabase } = guard.auth;

    const { searchParams } = new URL(request.url);
    const to = text(searchParams.get("to")) || localDayIso(new Date().toISOString());
    const from = text(searchParams.get("from")) || to;

    // Ein Tag Puffer, damit Buchungen am Tagesrand durch die Zeitzone nicht wegfallen.
    const rangeStart = new Date(`${from}T00:00:00`);
    rangeStart.setDate(rangeStart.getDate() - 1);
    const rangeEnd = new Date(`${to}T23:59:59`);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const entriesResult = await supabase
      .from("time_entries")
      .select("*")
      .gte("created_at", rangeStart.toISOString())
      .lte("created_at", rangeEnd.toISOString())
      .order("created_at", { ascending: true })
      .limit(2000);

    if (entriesResult.error) throw new Error(entriesResult.error.message);

    const entries = (entriesResult.data || []).filter((entry: AnyRow) => {
      const day = localDayIso(entry.created_at);
      return day >= from && day <= to;
    });

    const taskIds = Array.from(new Set(entries.map((entry: AnyRow) => entry.task_id).filter(Boolean))) as string[];
    const tasksById = new Map<string, AnyRow>();

    if (taskIds.length) {
      const tasksResult = await supabase
        .from("tasks")
        .select("id, title, site, customer_name, employee_name, task_date, start_time, end_time, planned_minutes, max_minutes, paid_minutes, wage_minutes, work_site_id, task_type, done")
        .in("id", taskIds);
      if (tasksResult.error) throw new Error(tasksResult.error.message);
      for (const task of tasksResult.data || []) tasksById.set(task.id, task);
    }

    const employeesResult = await supabase
      .from("employee_profiles")
      .select("id, name, active")
      .order("name", { ascending: true });

    const records = buildRecords(entries, tasksById, await zeitgrenzenLaden(supabase));
    const summary = {
      open: records.filter((record) => record.state === "open").length,
      approved: records.filter((record) => record.state === "approved").length,
      rejected: records.filter((record) => record.state === "rejected").length,
      issues: records.filter((record) => record.locationIssue || record.incomplete).length
    };

    return NextResponse.json({
      ok: true,
      from,
      to,
      records,
      summary,
      employees: (employeesResult.data || []).filter((row: AnyRow) => row.name),
      sites: Array.from(new Map(records.map((record) => [record.siteName, { id: record.workSiteId, name: record.siteName }])).values())
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zeiten konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const { supabase, profile } = guard.auth;

    const body = await request.json();
    const action = text(body.action).toLowerCase();
    const entryId = text(body.entryId);
    const taskId = text(body.taskId);
    const employeeName = text(body.employeeName);
    const date = text(body.date);
    const adminResponse = text(body.adminResponse);
    const startTime = text(body.startTime).slice(0, 5);
    const endTime = text(body.endTime).slice(0, 5);
    const breakMinutes = Math.max(0, Math.round(numberOrNull(body.breakMinutes) ?? 0));
    const travelMinutes = Math.max(0, Math.round(numberOrNull(body.travelMinutes) ?? 0));

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ ok: false, error: "Unbekannte Aktion." }, { status: 400 });
    }
    if (!entryId && !(taskId && employeeName && date)) {
      return NextResponse.json({ ok: false, error: "Zeiteintrag konnte nicht zugeordnet werden." }, { status: 400 });
    }
    if (startTime && parseHm(startTime) === null) {
      return NextResponse.json({ ok: false, error: "Startzeit bitte als HH:MM angeben, z. B. 08:00." }, { status: 400 });
    }
    if (endTime && parseHm(endTime) === null) {
      return NextResponse.json({ ok: false, error: "Endzeit bitte als HH:MM angeben, z. B. 16:30." }, { status: 400 });
    }

    let entry: AnyRow | null = null;
    if (entryId) {
      const existing = await supabase.from("time_entries").select("*").eq("id", entryId).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      entry = existing.data;
      if (!entry) return NextResponse.json({ ok: false, error: "Zeiteintrag wurde nicht gefunden." }, { status: 404 });
    }

    const taskIdForLookup = entry?.task_id || taskId;
    let task: AnyRow | null = null;
    if (taskIdForLookup) {
      const taskResult = await supabase.from("tasks").select("*").eq("id", taskIdForLookup).maybeSingle();
      if (taskResult.error) throw new Error(taskResult.error.message);
      task = taskResult.data;
    }

    const plannedMinutes = plannedMinutesFromTask(task);
    const workedFromCorrection = startTime && endTime ? minutesBetweenHm(startTime, endTime) : null;
    const recordedMinutes = numberOrNull(entry?.actual_minutes) ?? 0;
    const grossMinutes = workedFromCorrection ?? recordedMinutes;
    const netMinutes = Math.max(0, grossMinutes - breakMinutes) + travelMinutes;

    const approvedMinutes = action === "approve" ? netMinutes : Math.max(0, plannedMinutes);
    const statusValue = action === "approve" ? "approved" : "rejected";
    const nowIso = new Date().toISOString();

    const wasCorrected = Boolean(startTime || endTime || breakMinutes || travelMinutes);

    const correctionPayload: AnyRow = {
      approval_status: statusValue,
      approved_minutes: approvedMinutes,
      approved_at: nowIso,
      approved_by: profile.id,
      admin_response: adminResponse || (action === "approve" ? "Zeit freigegeben" : "Zeit abgelehnt"),
      planned_minutes: plannedMinutes || null,
      // Vorhandene Spalten der Tabelle
      pause_minutes: breakMinutes,
      corrected_at: wasCorrected ? nowIso : null,
      corrected_by: wasCorrected ? profile.id : null,
      correction_reason: wasCorrected ? (adminResponse || `Zeit auf ${startTime || "?"} - ${endTime || "?"} gesetzt`) : null,
      // Optional, werden übersprungen solange die Spalten fehlen
      travel_minutes: travelMinutes,
      corrected_start_time: startTime || null,
      corrected_end_time: endTime || null
    };

    let saved: AnyRow | null = null;

    if (entry) {
      const result = await safeUpdateById(supabase, "time_entries", entry.id, correctionPayload);
      saved = result.data;
    } else {
      // Kein Ausstempeln vorhanden: Zeit wird vom Büro nachgetragen.
      if (!startTime || !endTime) {
        return NextResponse.json({ ok: false, error: "Für einen Nachtrag bitte Von- und Bis-Zeit angeben." }, { status: 400 });
      }
      const createdAt = new Date(`${date}T${endTime}:00`);
      if (Number.isNaN(createdAt.getTime())) {
        return NextResponse.json({ ok: false, error: "Datum oder Uhrzeit für den Nachtrag ist ungültig." }, { status: 400 });
      }
      const result = await safeInsert(supabase, "time_entries", {
        task_id: taskIdForLookup || null,
        employee_name: employeeName || task?.employee_name || null,
        work_site_id: task?.work_site_id || null,
        work_site_name: task?.site || task?.customer_name || null,
        action: "clock_out",
        success: true,
        created_at: createdAt.toISOString(),
        actual_minutes: grossMinutes,
        overtime_minutes: plannedMinutes ? Math.max(0, grossMinutes - plannedMinutes) : 0,
        error_message: "Vom Büro nachgetragen.",
        ...correctionPayload
      });
      saved = result.data;
    }

    if (task?.id && action === "approve") {
      await supabase.from("tasks").update({ done: true, status: "done" }).eq("id", task.id);
    }

    if (taskIdForLookup) {
      await supabase
        .from("admin_notifications")
        .update({ status: "resolved", read: true, resolved_at: nowIso, admin_response: adminResponse || statusValue })
        .eq("task_id", taskIdForLookup)
        .eq("notification_type", "time_overtime");
    }

    const hours = `${Math.floor(approvedMinutes / 60)}:${String(approvedMinutes % 60).padStart(2, "0")} h`;
    const messageText = action === "approve"
      ? `Deine Zeit vom ${date || localDayIso(entry?.created_at)} wurde freigegeben. Gebucht sind ${hours}.${adminResponse ? ` ${adminResponse}` : ""}`
      : `Deine Zeit vom ${date || localDayIso(entry?.created_at)} wurde abgelehnt. Gebucht bleibt die geplante Zeit ${hours}.${adminResponse ? ` ${adminResponse}` : ""}`;

    await supabase.from("chat_messages").insert({
      employee_name: employeeName || entry?.employee_name || task?.employee_name,
      sender_name: profile.name,
      sender_role: "admin",
      message: messageText,
      body: messageText,
      text: messageText,
      read_by_admin: true,
      read_by_employee: false,
      status: "open",
      todo_status: "open",
      created_at: nowIso
    });

    return NextResponse.json({
      ok: true,
      entry: saved,
      approvedMinutes,
      approvedLabel: minutesToHm(approvedMinutes),
      status: statusValue
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Freigabe konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
