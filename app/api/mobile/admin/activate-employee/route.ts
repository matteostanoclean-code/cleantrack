import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

function createTemporaryPassword() {
  // Mindestens 12 Zeichen und gemischte Zeichentypen, damit Supabase die meisten Passwortregeln akzeptiert.
  return `Ct-${randomBytes(6).toString("base64url")}-A1!`;
}

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
      return NextResponse.json({ ok: false, error: "Nur Admins dürfen Mitarbeiter aktivieren." }, { status: 403 });
    }

    const body = await request.json();
    const employeeId = cleanString(body.employeeId);
    const customPassword = cleanString(body.password);
    const password = customPassword.length >= 8 ? customPassword : createTemporaryPassword();

    if (!employeeId) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter-ID fehlt." }, { status: 400 });
    }

    const { data: employee, error: employeeError } = await auth.supabase
      .from("employee_profiles")
      .select("id, auth_user_id, name, email, role, active")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) throw new Error(employeeError.message);
    if (!employee) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter wurde nicht gefunden." }, { status: 404 });
    }

    const email = cleanString(employee.email);
    const name = cleanString(employee.name) || "Mitarbeiter";
    const role = cleanString(employee.role) || "employee";

    if (!email) {
      return NextResponse.json({ ok: false, error: "Dieser Mitarbeiter hat keine E-Mail-Adresse." }, { status: 400 });
    }

    let authUserId = cleanString(employee.auth_user_id);

    if (authUserId) {
      const { error: updateAuthError } = await auth.supabase.auth.admin.updateUserById(authUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role }
      });

      if (updateAuthError) throw new Error(updateAuthError.message);
    } else {
      const { data: createdUser, error: createError } = await auth.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role }
      });

      if (createError) {
        const lowerMessage = createError.message.toLowerCase();
        if (lowerMessage.includes("already") || lowerMessage.includes("registered") || lowerMessage.includes("exists")) {
          return NextResponse.json({ ok: false, error: "Für diese E-Mail gibt es schon einen Auth-Login. Bitte verknüpfe zuerst auth_user_id oder nutze eine andere E-Mail." }, { status: 409 });
        }
        throw new Error(createError.message);
      }

      authUserId = createdUser.user?.id || "";
    }

    if (!authUserId) {
      return NextResponse.json({ ok: false, error: "Supabase hat keine Auth-ID zurückgegeben." }, { status: 500 });
    }

    const { data: updatedEmployee, error: updateProfileError } = await auth.supabase
      .from("employee_profiles")
      .update({
        auth_user_id: authUserId,
        active: true,
        must_change_password: true
      })
      .eq("id", employeeId)
      .select("id, auth_user_id, name, email, role, active, must_change_password")
      .single();

    if (updateProfileError) throw new Error(updateProfileError.message);

    return NextResponse.json({
      ok: true,
      employee: updatedEmployee,
      login: {
        email,
        password,
        mustChangePassword: true
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mitarbeiter konnte nicht aktiviert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
