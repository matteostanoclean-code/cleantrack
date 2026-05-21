import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

const allowedActions = new Set(["clock_in", "break_start", "break_end", "clock_out"]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function sameName(a?: unknown, b?: unknown) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

function pickNumber(row: Record<string, any> | null | undefined, keys: string[]) {
  if (!row) return null;
  for (const key of keys) {
    const value = numberOrNull(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickBoolean(row: Record<string, any> | null | undefined, keys: string[], fallback = false) {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
  }
  return fallback;
}

function pickText(row: Record<string, any> | null | undefined, keys: string[]) {
  if (!row) return null;
  for (const key of keys) {
    const value = textOrNull(row[key]);
    if (value) return value;
  }
  return null;
}

function taskExpectedStart(task: Record<string, any>) {
  const date = clean(task.task_date);
  const start = clean(task.start_time);
  if (!date || !start) return null;
  const value = `${date}T${start.length === 5 ? `${start}:00` : start}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earthRadius = 6371000;
  const toRad = (degree: number) => (degree * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function latestStatus(action?: string | null) {
  if (action === "clock_in" || action === "break_end") return "working";
  if (action === "break_start") return "break";
  return "idle";
}

function validateSequence(currentStatus: "idle" | "working" | "break", action: string) {
  if (action === "clock_in" && currentStatus !== "idle") return "Du bist bereits eingestempelt. Bitte erst ausstempeln.";
  if (action === "break_start" && currentStatus !== "working") return "Pause kann nur gestartet werden, wenn du eingestempelt bist.";
  if (action === "break_end" && currentStatus !== "break") return "Pause kann nur beendet werden, wenn eine Pause läuft.";
  if (action === "clock_out" && currentStatus === "idle") return "Ausstempeln geht erst nach dem Einstempeln.";
  return null;
}

async function insertTimeEntry(auth: any, payload: Record<string, any>) {
  const { data, error } = await auth.supabase.from("time_entries").insert(payload).select("*").single();
  if (!error) return data;

  // Fallback, falls die SQL-Erweiterung für task_id noch nicht ausgeführt wurde.
  if (String(error.message || "").toLowerCase().includes("task_id")) {
    const { task_id, ...withoutTaskId } = payload;
    const fallback = await auth.supabase.from("time_entries").insert(withoutTaskId).select("*").single();
    if (fallback.error) throw new Error(fallback.error.message);
    return fallback.data;
  }

  throw new Error(error.message);
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const action = clean(body.action);

    if (!allowedActions.has(action)) {
      return NextResponse.json({ ok: false, error: "Ungültige Stempel-Aktion." }, { status: 400 });
    }

    const taskId = uuidOrNull(body.taskId);
    if (!taskId) {
      return NextResponse.json({ ok: false, error: "Bitte zuerst einen Termin im Einsatzplan öffnen. Manuelle Buchungen sind gesperrt." }, { status: 400 });
    }

    const requestedEmployeeName = clean(body.employeeName);
    const employeeName = auth.isAdmin && requestedEmployeeName ? requestedEmployeeName : auth.profile.name;
    let employeeId = auth.profile.id;

    if (auth.isAdmin && requestedEmployeeName && !sameName(requestedEmployeeName, auth.profile.name)) {
      const { data: selectedEmployee, error } = await auth.supabase
        .from("employee_profiles")
        .select("id, name, active")
        .eq("name", requestedEmployeeName)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!selectedEmployee || selectedEmployee.active === false) {
        return NextResponse.json({ ok: false, error: "Gewählter Mitarbeiter ist nicht aktiv oder wurde nicht gefunden." }, { status: 403 });
      }
      employeeId = selectedEmployee.id;
    }

    const { data: task, error: taskError } = await auth.supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();

    if (taskError) throw new Error(taskError.message);
    if (!task) {
      return NextResponse.json({ ok: false, error: "Der ausgewählte Termin wurde nicht gefunden." }, { status: 404 });
    }
    if (!sameName(task.employee_name, employeeName)) {
      return NextResponse.json({ ok: false, error: "Dieser Termin gehört nicht zu diesem Mitarbeiter." }, { status: 403 });
    }

    const latestResult = await auth.supabase
      .from("time_entries")
      .select("id, action, success, created_at")
      .eq("employee_name", employeeName)
      .neq("success", false)
      .order("created_at", { ascending: false })
      .limit(1);
    if (latestResult.error) throw new Error(latestResult.error.message);

    const currentStatus = latestStatus(latestResult.data?.[0]?.action);
    const sequenceError = validateSequence(currentStatus, action);
    if (sequenceError) {
      return NextResponse.json({ ok: false, error: sequenceError }, { status: 409 });
    }

    const workSiteId = textOrNull(task.work_site_id);
    let site: Record<string, any> | null = null;

    if (workSiteId) {
      const { data: selectedSite, error } = await auth.supabase
        .from("work_sites")
        .select("*")
        .eq("id", workSiteId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      site = selectedSite || null;
    }

    const employeeLat = numberOrNull(body.latitude);
    const employeeLng = numberOrNull(body.longitude);
    const siteLat = pickNumber(site, ["latitude", "lat", "gps_latitude", "object_latitude"]);
    const siteLng = pickNumber(site, ["longitude", "lng", "lon", "gps_longitude", "object_longitude"]);
    const allowedRadius = Math.round(pickNumber(site, ["allowed_radius_m", "radius_m", "gps_radius_m", "geofence_radius_m"]) ?? 150);
    const gpsRequired = pickBoolean(site, ["gps_required", "geofence_required", "location_required"], false);
    const hasSiteGps = siteLat !== null && siteLng !== null;
    const siteName = pickText(site, ["name", "site", "object_name", "site_name"]) || textOrNull(task.site || task.customer_name || task.title) || null;

    let distance: number | null = null;
    let gpsStatus: "unchecked" | "missing_employee_position" | "inside_radius" | "outside_radius" = "unchecked";

    if (hasSiteGps) {
      if (employeeLat === null || employeeLng === null) {
        gpsStatus = "missing_employee_position";
      } else {
        distance = distanceMeters(employeeLat, employeeLng, siteLat, siteLng);
        gpsStatus = distance <= allowedRadius ? "inside_radius" : "outside_radius";
      }
    }

    const basePayload = {
      task_id: task.id,
      employee_name: employeeName,
      employee_id: employeeId,
      work_site_id: workSiteId,
      work_site_name: siteName,
      action,
      latitude: employeeLat,
      longitude: employeeLng,
      distance_m: distance,
      allowed_radius_m: hasSiteGps ? allowedRadius : null,
      created_at: new Date().toISOString(),
      expected_start_time: taskExpectedStart(task) || body.expectedStartTime || null
    };

    if (hasSiteGps && gpsStatus === "missing_employee_position") {
      const errorMessage = "GPS-Standort konnte nicht gelesen werden. Bitte Standortfreigabe erlauben und erneut stempeln.";
      const failedEntry = await insertTimeEntry(auth, { ...basePayload, success: false, error_message: errorMessage });
      return NextResponse.json({ ok: false, error: errorMessage, entry: failedEntry, gpsStatus }, { status: 400 });
    }

    if (hasSiteGps && gpsStatus === "outside_radius") {
      const errorMessage = `Du bist ca. ${distance} m vom Objekt entfernt. Erlaubt sind ${allowedRadius} m.`;
      const failedEntry = await insertTimeEntry(auth, { ...basePayload, success: false, error_message: errorMessage });
      return NextResponse.json({ ok: false, error: errorMessage, entry: failedEntry, gpsStatus, distanceM: distance, allowedRadiusM: allowedRadius }, { status: 403 });
    }

    if (gpsRequired && !hasSiteGps) {
      const errorMessage = "Für dieses Objekt ist GPS-Prüfung aktiv, aber am Objekt sind noch keine GPS-Koordinaten gespeichert.";
      const failedEntry = await insertTimeEntry(auth, { ...basePayload, success: false, error_message: errorMessage });
      return NextResponse.json({ ok: false, error: errorMessage, entry: failedEntry, gpsStatus }, { status: 409 });
    }

    const entry = await insertTimeEntry(auth, {
      ...basePayload,
      success: true,
      error_message: hasSiteGps ? `GPS geprüft: ${distance} m von ${allowedRadius} m Radius.` : employeeLat !== null && employeeLng !== null ? "GPS gespeichert. Objekt hat noch keine Koordinaten für Radius-Prüfung." : null
    });

    if (action === "clock_out") {
      await auth.supabase.from("tasks").update({ status: "done", done: true }).eq("id", task.id);
    }

    return NextResponse.json({ ok: true, entry, gpsStatus, distanceM: distance, allowedRadiusM: hasSiteGps ? allowedRadius : null, hasSiteGps, taskId: task.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stempeln fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
