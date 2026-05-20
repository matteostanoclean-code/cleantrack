import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

const allowedActions = new Set(["clock_in", "break_start", "break_end", "clock_out"]);

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

    const insertPayload = {
      employee_name: employeeName,
      employee_id: employeeId,
      work_site_id: body.workSiteId || null,
      work_site_name: body.workSiteName || null,
      action,
      latitude: typeof body.latitude === "number" ? body.latitude : null,
      longitude: typeof body.longitude === "number" ? body.longitude : null,
      distance_m: typeof body.distanceM === "number" ? body.distanceM : null,
      allowed_radius_m: typeof body.allowedRadiusM === "number" ? body.allowedRadiusM : null,
      success: true,
      error_message: null,
      created_at: new Date().toISOString(),
      expected_start_time: body.expectedStartTime || null
    };

    const { data, error } = await auth.supabase.from("time_entries").insert(insertPayload).select("*").single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, entry: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stempeln fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
