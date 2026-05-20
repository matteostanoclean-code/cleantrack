import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!auth.isAdmin) {
      return NextResponse.json({ ok: false, error: "Nur Admins dürfen Mitarbeiter deaktivieren." }, { status: 403 });
    }

    const body = await request.json();
    const employeeId = cleanString(body.employeeId);

    if (!employeeId) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter-ID fehlt." }, { status: 400 });
    }

    if (employeeId === auth.profile.id) {
      return NextResponse.json({ ok: false, error: "Du kannst deinen eigenen Admin-Zugang hier nicht deaktivieren." }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("employee_profiles")
      .update({ active: false })
      .eq("id", employeeId)
      .select("id, auth_user_id, name, email, role, active, must_change_password")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, employee: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mitarbeiter konnte nicht deaktiviert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
