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

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function workedMinutesFromEntries(entries: Row[]) {
  const chronological = [...entries].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let total = 0;
  let lastStart: Date | null = null;

  for (const entry of chronological) {
    const time = new Date(entry.created_at);
    if (entry.action === "start" || entry.action === "break_end") lastStart = time;
    if ((entry.action === "break_start" || entry.action === "end") && lastStart) {
      total += Math.max(0, Math.round((time.getTime() - lastStart.getTime()) / 60000));
      lastStart = null;
    }
  }

  if (lastStart) total += Math.max(0, Math.round((Date.now() - lastStart.getTime()) / 60000));
  return total;
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

    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();

    if (taskError || !task) return NextResponse.json({ error: "Einsatz wurde nicht gefunden." }, { status: 404 });
    if (task.employee_name && task.employee_name !== profile.name) {
      return NextResponse.json({ error: "Dieser Einsatz ist einem anderen Mitarbeiter zugewiesen." }, { status: 403 });
    }

    const { data: site } = task.work_site_id
      ? await supabaseAdmin.from("work_sites").select("*").eq("id", task.work_site_id).maybeSingle()
      : { data: null };

    if (action === "request_overtime") {
      const overtimeMinutes = Math.max(1, Number(body.overtime_minutes || 15));
      const { error } = await supabaseAdmin.from("admin_notifications").insert([
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
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: "Überstundenanfrage wurde gesendet." });
    }

    if (!["start", "break_start", "break_end", "end"].includes(action)) {
      return NextResponse.json({ error: "Unbekannte Zeitaktion." }, { status: 400 });
    }

    if (action === "start") {
      const localTime = String(body.local_time || "").slice(0, 5);
      if (!isTimeInsideWindow(localTime, task.start_time, task.end_time)) {
        return NextResponse.json({ error: `Einstempeln ist nur im Zeitfenster ${task.start_time || "--:--"} - ${task.end_time || "--:--"} möglich.` }, { status: 400 });
      }

      if (site?.latitude && site?.longitude) {
        const latitude = Number(body.latitude);
        const longitude = Number(body.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return NextResponse.json({ error: "GPS konnte nicht gelesen werden. Bitte Standortfreigabe erlauben." }, { status: 400 });
        }
        const distance = distanceMeters(latitude, longitude, Number(site.latitude), Number(site.longitude));
        const radius = Number(site.allowed_radius_m || 50);
        if (distance > radius) {
          return NextResponse.json({ error: `Du bist ${Math.round(distance)} m vom Objekt entfernt. Erlaubt sind ${radius} m.` }, { status: 400 });
        }
      }
    }

    const { start, end } = todayRange();
    const { data: entries } = await supabaseAdmin
      .from("time_entries")
      .select("*")
      .eq("employee_name", profile.name)
      .eq("task_id", task.id)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    const worked = workedMinutesFromEntries(entries || []);
    const max = Number(task.max_minutes || task.planned_minutes || 0);
    const autoClockOut = body.reason === "max_time_reached" || body.reason === "left_geofence";

    const nowIso = new Date().toISOString();
    const payload: Row = {
      employee_name: profile.name,
      work_site_name: task.site || site?.name || null,
      site: task.site || site?.name || null,
      work_site_id: task.work_site_id || null,
      task_id: task.id,
      action,
      auto_clock_out: autoClockOut,
      reason: body.reason || "manual",
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      planned_minutes: max,
      worked_minutes: action === "end" ? Math.min(max || worked, worked) : worked,
    };

    if (action === "start") payload.check_in_at = nowIso;
    if (action === "end") {
      payload.check_out_at = nowIso;
      payload.status = autoClockOut ? "auto_closed" : "open";
    }

    const { error: insertError } = await supabaseAdmin.from("time_entries").insert([payload]);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    if (body.reason === "left_geofence") {
      await supabaseAdmin.from("admin_notifications").insert([
        {
          employee_name: profile.name,
          title: "Automatisch ausgestempelt",
          message: `${profile.name} hat den GPS-Bereich bei ${task.site || site?.name || "einem Objekt"} verlassen.`,
          notification_type: "auto_clock_out",
          status: "open",
          task_id: task.id,
          work_site_id: task.work_site_id || null,
          site: task.site || site?.name || null,
        },
      ]);
    }

    if (body.reason === "max_time_reached") {
      await supabaseAdmin.from("admin_notifications").insert([
        {
          employee_name: profile.name,
          title: "Planzeit erreicht",
          message: `${profile.name} hat die geplante Arbeitszeit bei ${task.site || site?.name || "einem Objekt"} erreicht.`,
          notification_type: "planned_time_reached",
          status: "open",
          task_id: task.id,
          work_site_id: task.work_site_id || null,
          site: task.site || site?.name || null,
        },
      ]);
    }

    const messages: Row = {
      start: "Arbeitszeit gestartet.",
      break_start: "Pause gestartet.",
      break_end: "Pause beendet.",
      end: autoClockOut ? "Arbeitszeit automatisch beendet." : "Arbeitszeit beendet.",
    };

    return NextResponse.json({ success: true, message: messages[action] || "Gespeichert." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Serverfehler bei der Zeiterfassung." },
      { status: 500 }
    );
  }
}
