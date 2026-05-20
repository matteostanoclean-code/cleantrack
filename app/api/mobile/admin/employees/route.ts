import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  active: boolean | null;
  must_change_password: boolean | null;
  created_at: string | null;
};

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!auth.isAdmin) {
      return NextResponse.json({ ok: false, error: "Nur Admins dürfen Mitarbeiter verwalten." }, { status: 403 });
    }

    const { data, error } = await auth.supabase
      .from("employee_profiles")
      .select("id, auth_user_id, name, email, role, active, must_change_password, created_at")
      .order("role", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);

    const employees = ((data || []) as EmployeeRow[]).map((employee) => ({
      ...employee,
      canLogin: Boolean(employee.auth_user_id && employee.active !== false)
    }));

    return NextResponse.json({ ok: true, employees });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mitarbeiter konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
