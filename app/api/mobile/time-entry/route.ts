import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const allowedActions = new Set(["clock_in", "break_start", "break_end", "clock_out"]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeName = String(body.employeeName || "").trim();
    const action = String(body.action || "").trim();

    if (!employeeName) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter fehlt." }, { status: 400 });
    }

    if (!allowedActions.has(action)) {
      return NextResponse.json({ ok: false, error: "Ungültige Stempel-Aktion." }, { status: 400 });
    }

    const insertPayload = {
      employee_name: employeeName,
      employee_id: body.employeeId || null,
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

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("time_entries").insert(insertPayload).select("*").single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, entry: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stempeln fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
