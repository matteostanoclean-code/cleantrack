import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";
import { localDayIso, minutesBetweenHm, minutesToHm, parseHm } from "@/lib/format";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/** Abweichungen bis zu dieser Grenze gelten als planmäßig und brauchen keine Freigabe. */
const TOLERANCE_MINUTES = 5;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur Admins dürfen Zeiten freigeben." }, { status: 403 }) };
  return { ok: true as const, auth };
}

function minutesFromTimeWindow(start?: unknown, end?: unknown) {
  const from = parseHm(text(start).slice(0, 5));
  const to = parseHm(text(end).slice(0, 5));
  if (from === null || to === null) return 0;
  return to >= from ? to - from : 1440 - from + to;
}

function plannedMinutesFromTask(task: AnyRow | null) {
  if (!task) return 0;
  const direct = numberOrNull(task.planned_minutes ?? task.max_minutes ?? task.paid_minutes ?? task.wage_minutes);
  if (direct && direct > 0) return Math.round(direct);
  return minutesFromTimeWindow(task.start_time, task.end_time);
}

/** Arbeits- und Pausenminuten aus der Stempelfolge eines Tages. */
function spansFromEntries(entries: AnyRow[]) {
  const rows = [...entries]
    .filter((entry) => entry.created_at && entry.success !== false)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let workMinutes = 0;
  let breakMinutes = 0;
  let workStart: number | null = null;
  let breakStart: number | null = null;

  for (const row of rows) {
    const timestamp = new Date(row.created_at).getTime();
    if (!Number.isFinite(timestamp)) continue;

    if (row.action === "clock_in" || row.action === "break_end") {
      if (breakStart) {
        breakMinutes += Math.max(0, Math.round((timestamp - breakStart) / 60000));
        breakStart = null;
      }
      workStart = timestamp;
    }

    if (row.action === "break_start") {
      if (workStart) {
        workMinutes += Math.max(0, Math.round((timestamp - workStart) / 60000));
        workStart = null;
      }
      breakStart = timestamp;
    }

    if (row.action === "clock_out") {
      if (workStart) {
        workMinutes += Math.max(0, Math.round((timestamp - workStart) / 60000));
        workStart = null;
      }
      if (breakStart) {
        breakMinutes += Math.max(0, Math.round((timestamp - breakStart) / 60000));
        breakStart = null;
      }
    }
  }

  return { workMinutes, breakMinutes };
}

function entryHasLocationProblem(entry: AnyRow) {
  if (entry.success === false) return true;
  const distance = numberOrNull(entry.distance_m);
  const radius = numberOrNull(entry.allowed_radius_m);
  if (distance !== null && radius !== null && distance > radius) return true;
  return numberOrNull(entry.latitude) === null || numberOrNull(entry.longitude) === null;
}

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    clock_in: "Eingestempelt",
    break_start: "Pause gestartet",
    break_end: "Pause beendet",
    clock_out: "Ausgestempelt"
  };
  return labels[text(action)] || "Zeit erfasst";
}

/** Baut aus den Rohstempeln je Einsatz/Tag einen prüfbaren Datensatz. */
function buildRecords(entries: AnyRow[], tasksById: Map<string, AnyRow>) {
  const groups = new Map<string, AnyRow[]>();

  for (const entry of entries) {
    const day = localDayIso(entry.created_at);
    if (!day) continue;
    const key = entry.task_id
      ? `task:${entry.task_id}`
      : `day:${text(entry.employee_name).toLowerCase()}|${day}|${text(entry.work_site_id)}`;
    groups.set(key, [...(groups.get(key) || []), entry]);
  }

  const records = Array.from(groups.entries()).map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const clockIn = sorted.find((row) => row.action === "clock_in") || sorted[0];
    const clockOut = [...sorted].reverse().find((row) => row.action === "clock_out") || null;
    const task = clockIn?.task_id ? tasksById.get(clockIn.task_id) || null : null;

    const { workMinutes, breakMinutes: computedBreak } = spansFromEntries(sorted);
    // Eine vom Büro eingetragene Pause hat Vorrang vor der aus den Stempeln berechneten.
    const breakMinutes = numberOrNull(clockOut?.pause_minutes) ?? computedBreak;
    const plannedMinutes = plannedMinutesFromTask(task);
    const storedApproved = numberOrNull(clockOut?.approved_minutes);
    const actualMinutes = numberOrNull(clockOut?.actual_minutes) ?? workMinutes;
    const deviationMinutes = plannedMinutes ? actualMinutes - plannedMinutes : 0;
    const locationIssue = sorted.some(entryHasLocationProblem);
    const incomplete = !clockOut;

    const rawStatus = text(clockOut?.approval_status).toLowerCase();
    let state: "open" | "approved" | "rejected";
    if (rawStatus === "approved") state = "approved";
    else if (rawStatus === "rejected") state = "rejected";
    else if (rawStatus === "pending") state = "open";
    else if (incomplete) state = "open";
    else state = Math.abs(deviationMinutes) > TOLERANCE_MINUTES || locationIssue ? "open" : "approved";

    const day = localDayIso(clockIn?.created_at);

    return {
      id: key,
      entryId: clockOut?.id || null,
      taskId: clockIn?.task_id || null,
      employeeName: clockIn?.employee_name || clockOut?.employee_name || "Mitarbeiter",
      siteName: clockIn?.work_site_name || task?.site || task?.customer_name || "Ohne Objekt",
      workSiteId: clockIn?.work_site_id || task?.work_site_id || null,
      customerName: task?.customer_name || null,
      taskTitle: task?.title || task?.task_type || null,
      date: day,
      plannedStart: task?.start_time ? text(task.start_time).slice(0, 5) : null,
      plannedEnd: task?.end_time ? text(task.end_time).slice(0, 5) : null,
      plannedMinutes,
      actualStart: clockIn?.created_at || null,
      actualEnd: clockOut?.created_at || null,
      actualMinutes,
      breakMinutes,
      travelMinutes: numberOrNull(clockOut?.travel_minutes) ?? 0,
      approvedMinutes: storedApproved,
      deviationMinutes,
      state,
      approvalStatus: rawStatus || (incomplete ? "incomplete" : "not_required"),
      adminResponse: clockOut?.admin_response || null,
      locationIssue,
      incomplete,
      log: sorted.map((row) => ({
        id: row.id,
        action: row.action,
        label: actionLabel(row.action),
        time: row.created_at,
        latitude: numberOrNull(row.latitude),
        longitude: numberOrNull(row.longitude),
        distanceM: numberOrNull(row.distance_m),
        allowedRadiusM: numberOrNull(row.allowed_radius_m),
        ok: !entryHasLocationProblem(row),
        message: row.error_message || null
      }))
    };
  });

  return records.sort((a, b) => `${b.date}${b.actualStart || ""}`.localeCompare(`${a.date}${a.actualStart || ""}`));
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

    const records = buildRecords(entries, tasksById);
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
