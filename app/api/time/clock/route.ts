import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Row = Record<string, any>;

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");

  return { supabaseUrl, serviceRoleKey };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.replace("Bearer ", "").trim();
}

function toMinutes(value: unknown) {
  const time = String(value || "").slice(0, 5);
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isTimeInsideWindow(localTime: string, start?: string | null, end?: string | null) {
  if (!start || !end) return true;
  const a = toMinutes(start);
  let b = toMinutes(end);
  let c = toMinutes(localTime);
  if (b < a) b += 1440;
  if (c < a && b > 1440) c += 1440;
  return c >= a && c <= b;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function localDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString(), workDate: localDateOnly(now) };
}

function activeStatuses() {
  return ["running", "paused"];
}

function finishedStatuses() {
  return ["open", "approved", "auto_closed", "rejected"];
}

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

function calculateWorkedMinutes(row: Row, endIso = new Date().toISOString()) {
  const start = row.check_in_at || row.created_at;
  if (!start) return 0;
  const end = row.check_out_at || endIso;
  const total = minutesBetween(start, end);
  const pause = Number(row.pause_minutes || 0);
  const runningPause = row.pause_started_at ? minutesBetween(row.pause_started_at, endIso) : 0;
  return Math.max(0, total - pause - runningPause);
}

function payableMinutes(row: Row, task: Row, endIso = new Date().toISOString()) {
  const worked = calculateWorkedMinutes(row, endIso);
  const max = Number(task.max_minutes || task.planned_minutes || 0);
  return max > 0 ? Math.min(max, worked) : worked;
}

async function requireEmployee(request: Request) {
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const token = getBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }), supabaseAdmin: null, profile: null };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Sitzung ungültig. Bitte neu einloggen." }, { status: 401 }), supabaseAdmin: null, profile: null };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_profiles")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active === false) {
    return { error: NextResponse.json({ error: "Mitarbeiterprofil ist nicht aktiv." }, { status: 403 }), supabaseAdmin: null, profile: null };
  }

  return { error: null, supabaseAdmin, profile };
}

async function loadTaskAndSite(supabaseAdmin: any, taskId: string) {
  const { data: task, error: taskError } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError || !task) return { task: null, site: null, error: "Einsatz wurde nicht gefunden." };

  const { data: site } = task.work_site_id
    ? await supabaseAdmin.from("work_sites").select("*").eq("id", task.work_site_id).maybeSingle()
    : { data: null };

  return { task, site, error: "" };
}

export async function GET(request: Request) {
  try {
    const auth = await requireEmployee(request);
    if (auth.error) return auth.error;
    const supabaseAdmin = auth.supabaseAdmin;
    const profile = auth.profile;
    if (!supabaseAdmin || !profile) {
      return NextResponse.json({ error: "Mitarbeiter konnte nicht geladen werden." }, { status: 500 });
    }

    const url = new URL(request.url);
    const taskId = String(url.searchParams.get("task_id") || "").trim();
    if (!taskId) return NextResponse.json({ error: "Einsatz fehlt." }, { status: 400 });

    const { task, error } = await loadTaskAndSite(supabaseAdmin, taskId);
    if (error || !task) return NextResponse.json({ error }, { status: 404 });

    const { start, end } = todayRange();
    const { data: entries } = await supabaseAdmin
      .from("time_entries")
      .select("*")
      .eq("employee_name", profile.name)
      .eq("task_id", task.id)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    const active = (entries || []).find((row: Row) => activeStatuses().includes(String(row.status || "")));
    const worked = (entries || []).reduce((sum: number, row: Row) => sum + calculateWorkedMinutes(row), 0);
    const wage = (entries || []).reduce((sum: number, row: Row) => sum + payableMinutes(row, task), 0);

    return NextResponse.json({
      success: true,
      status: active?.status || "idle",
      active_entry_id: active?.id || null,
      worked_minutes: worked,
      payroll_minutes: wage,
      entries: entries || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Serverfehler bei der Zeiterfassung." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireEmployee(request);
    if (auth.error) return auth.error;
    const supabaseAdmin = auth.supabaseAdmin;
    const profile = auth.profile;
    if (!supabaseAdmin || !profile) {
      return NextResponse.json({ error: "Mitarbeiter konnte nicht geladen werden." }, { status: 500 });
    }

    const body = await request.json();
    const action = String(body.action || "").trim();
    const taskId = String(body.task_id || "").trim();

    if (!taskId) return NextResponse.json({ error: "Einsatz fehlt." }, { status: 400 });

    const { task, site, error } = await loadTaskAndSite(supabaseAdmin, taskId);
    if (error || !task) return NextResponse.json({ error }, { status: 404 });

    if (task.employee_name && task.employee_name !== profile.name) {
      return NextResponse.json({ error: "Dieser Einsatz ist einem anderen Mitarbeiter zugewiesen." }, { status: 403 });
    }

    if (action === "request_overtime") {
      const overtimeMinutes = Math.max(1, Number(body.overtime_minutes || 15));

      const { data: existingRequest } = await supabaseAdmin
        .from("admin_notifications")
        .select("id,status")
        .eq("employee_name", profile.name)
        .eq("task_id", task.id)
        .eq("notification_type", "overtime_request")
        .eq("status", "open")
        .maybeSingle();

      if (existingRequest) {
        return NextResponse.json({ success: true, message: "Für diesen Einsatz wartet bereits eine Überstundenanfrage auf Freigabe." });
      }

      const { error: requestError } = await supabaseAdmin.from("admin_notifications").insert([
        {
          employee_name: profile.name,
          title: "Überstunden angefragt",
          message: `${profile.name} fragt ${overtimeMinutes} Minuten Überstunden für ${task.site || site?.name || "einen Einsatz"} an.`,
          notification_type: "overtime_request",
          status: "open",
          overtime_minutes: overtimeMinutes,
          task_id: task.id,
          work_site_id: task.work_site_id || null,
          site: task.site || site?.name || null,
        },
      ]);

      if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
      return NextResponse.json({ success: true, message: "Überstundenanfrage wurde gesendet." });
    }

    if (!["start", "break_start", "break_end", "end"].includes(action)) {
      return NextResponse.json({ error: "Unbekannte Zeitaktion." }, { status: 400 });
    }

    const max = Number(task.max_minutes || task.planned_minutes || 0);
    if (max <= 0) {
      return NextResponse.json(
        { error: "Für diesen Einsatz fehlt die Planzeit. Bitte im Einsatz eine Planzeit in Minuten eintragen." },
        { status: 400 }
      );
    }

    const { start, end, workDate } = todayRange();

    const { data: todaysEntries } = await supabaseAdmin
      .from("time_entries")
      .select("*")
      .eq("employee_name", profile.name)
      .eq("task_id", task.id)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    const activeEntry = (todaysEntries || []).find((row: Row) => activeStatuses().includes(String(row.status || "")));
    const workedBefore = (todaysEntries || [])
      .filter((row: Row) => !activeStatuses().includes(String(row.status || "")))
      .reduce((sum: number, row: Row) => sum + calculateWorkedMinutes(row), 0);

    const nowIso = new Date().toISOString();
    const autoClockOut = body.reason === "max_time_reached" || body.reason === "left_geofence";

    if (action === "start") {
      const localTime = String(body.local_time || "").slice(0, 5);
      if (!isTimeInsideWindow(localTime, task.start_time, task.end_time)) {
        return NextResponse.json({ error: `Einstempeln ist nur im Zeitfenster ${task.start_time || "--:--"} - ${task.end_time || "--:--"} möglich.` }, { status: 400 });
      }

      if (activeEntry) {
        return NextResponse.json({ success: true, message: "Arbeitszeit läuft bereits.", status: activeEntry.status });
      }

      if (site?.latitude && site?.longitude) {
        const latitude = Number(body.latitude);
        const longitude = Number(body.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return NextResponse.json({ error: "GPS konnte nicht gelesen werden. Bitte Standortfreigabe erlauben." }, { status: 400 });
        }
        const distance = distanceMeters(latitude, longitude, Number(site.latitude), Number(site.longitude));
        const radius = Number(site.allowed_radius_m || 150);
        if (distance > radius) {
          return NextResponse.json({ error: `Du bist ${Math.round(distance)} m vom Objekt entfernt. Erlaubt sind ${radius} m.` }, { status: 400 });
        }
      }

      if (max > 0 && workedBefore >= max) {
        return NextResponse.json(
          { error: "Die geplante Arbeitszeit ist erreicht. Bitte zuerst Überstunden anfragen und auf Freigabe warten." },
          { status: 400 }
        );
      }

      const { error: insertError } = await supabaseAdmin.from("time_entries").insert([
        {
          employee_name: profile.name,
          work_date: workDate,
          work_site_name: task.site || site?.name || null,
          site: task.site || site?.name || null,
          work_site_id: task.work_site_id || null,
          task_id: task.id,
          action: "start",
          entry_type: "session",
          status: "running",
          reason: body.reason || "manual",
          check_in_at: nowIso,
          check_out_at: null,
          pause_minutes: 0,
          pause_started_at: null,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          planned_minutes: max,
          worked_minutes: 0,
          payroll_minutes: 0,
          approved: false,
        },
      ]);

      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      return NextResponse.json({ success: true, message: "Arbeitszeit gestartet.", status: "running" });
    }

    if (!activeEntry) {
      return NextResponse.json({ error: "Es läuft keine Arbeitszeit für diesen Einsatz." }, { status: 400 });
    }

    if (action === "break_start") {
      if (activeEntry.status === "paused") return NextResponse.json({ success: true, message: "Pause läuft bereits.", status: "paused" });

      const worked = calculateWorkedMinutes({ ...activeEntry, pause_started_at: null }, nowIso);
      const { error: updateError } = await supabaseAdmin
        .from("time_entries")
        .update({
          action: "break_start",
          status: "paused",
          pause_started_at: nowIso,
          worked_minutes: worked,
          payroll_minutes: Math.min(max, worked),
        })
        .eq("id", activeEntry.id);

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      return NextResponse.json({ success: true, message: "Pause gestartet.", status: "paused" });
    }

    if (action === "break_end") {
      if (activeEntry.status !== "paused") return NextResponse.json({ error: "Es läuft keine Pause." }, { status: 400 });

      const additionalPause = minutesBetween(activeEntry.pause_started_at, nowIso);
      const pauseMinutes = Number(activeEntry.pause_minutes || 0) + additionalPause;
      const worked = calculateWorkedMinutes({ ...activeEntry, pause_minutes: pauseMinutes, pause_started_at: null }, nowIso);

      if (max > 0 && worked >= max) {
        return NextResponse.json(
          { error: "Die geplante Arbeitszeit ist erreicht. Bitte zuerst Überstunden anfragen und auf Freigabe warten." },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from("time_entries")
        .update({
          action: "break_end",
          status: "running",
          pause_started_at: null,
          pause_minutes: pauseMinutes,
          worked_minutes: worked,
          payroll_minutes: Math.min(max, worked),
        })
        .eq("id", activeEntry.id);

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      return NextResponse.json({ success: true, message: "Pause beendet.", status: "running" });
    }

    if (action === "end") {
      let pauseMinutes = Number(activeEntry.pause_minutes || 0);
      if (activeEntry.status === "paused" && activeEntry.pause_started_at) {
        pauseMinutes += minutesBetween(activeEntry.pause_started_at, nowIso);
      }

      const worked = calculateWorkedMinutes({ ...activeEntry, pause_minutes: pauseMinutes, pause_started_at: null, check_out_at: nowIso }, nowIso);
      const payroll = Math.min(max, worked);

      const { error: updateError } = await supabaseAdmin
        .from("time_entries")
        .update({
          action: "end",
          status: autoClockOut ? "auto_closed" : "open",
          auto_clock_out: autoClockOut,
          reason: body.reason || activeEntry.reason || "manual",
          check_out_at: nowIso,
          pause_started_at: null,
          pause_minutes: pauseMinutes,
          worked_minutes: worked,
          payroll_minutes: payroll,
          latitude: body.latitude ?? activeEntry.latitude ?? null,
          longitude: body.longitude ?? activeEntry.longitude ?? null,
        })
        .eq("id", activeEntry.id);

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

      if (body.reason === "left_geofence" || body.reason === "max_time_reached") {
        await supabaseAdmin.from("admin_notifications").insert([
          {
            employee_name: profile.name,
            title: body.reason === "left_geofence" ? "Automatisch ausgestempelt" : "Planzeit erreicht",
            message: body.reason === "left_geofence"
              ? `${profile.name} hat den GPS-Bereich bei ${task.site || site?.name || "einem Objekt"} verlassen.`
              : `${profile.name} hat die geplante Arbeitszeit bei ${task.site || site?.name || "einem Objekt"} erreicht.`,
            notification_type: body.reason === "left_geofence" ? "auto_clock_out" : "planned_time_reached",
            status: "open",
            task_id: task.id,
            work_site_id: task.work_site_id || null,
            site: task.site || site?.name || null,
          },
        ]);
      }

      return NextResponse.json({
        success: true,
        message: autoClockOut ? "Arbeitszeit automatisch beendet." : "Arbeitszeit beendet.",
        status: autoClockOut ? "auto_closed" : "open",
        worked_minutes: worked,
        payroll_minutes: payroll,
      });
    }

    return NextResponse.json({ error: "Unbekannte Zeitaktion." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Serverfehler bei der Zeiterfassung." },
      { status: 500 }
    );
  }
}
