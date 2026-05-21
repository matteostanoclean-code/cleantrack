import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

const allowedActions = new Set(["clock_in", "break_start", "break_end", "clock_out"]);

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
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

async function insertTimeEntry(auth: any, payload: Record<string, any>) {
  const { data, error } = await auth.supabase.from("time_entries").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const action = String(body.action || "").trim();

    if (!allowedActions.has(action)) {
      return NextResponse.json({ ok: false, error: "Ungültige Stempel-Aktion." }, { status: 400 });
    }

    const requestedEmployeeName = String(body.employeeName || "").trim();
    const employeeName = auth.isAdmin && requestedEmployeeName ? requestedEmployeeName : auth.profile.name;
    let employeeId = auth.profile.id;

    if (auth.isAdmin && requestedEmployeeName && requestedEmployeeName !== auth.profile.name) {
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

    const workSiteId = textOrNull(body.workSiteId);
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
    const allowedRadius = Math.round(numberOrNull(body.allowedRadiusM) ?? pickNumber(site, ["allowed_radius_m", "radius_m", "gps_radius_m", "geofence_radius_m"]) ?? 150);
    const gpsRequired = pickBoolean(site, ["gps_required", "geofence_required", "location_required"], false);
    const hasSiteGps = siteLat !== null && siteLng !== null;
    const siteName = pickText(site, ["name", "site", "object_name", "site_name"]) || textOrNull(body.workSiteName) || null;

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
      expected_start_time: body.expectedStartTime || null
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

    return NextResponse.json({ ok: true, entry, gpsStatus, distanceM: distance, allowedRadiusM: hasSiteGps ? allowedRadius : null, hasSiteGps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stempeln fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
