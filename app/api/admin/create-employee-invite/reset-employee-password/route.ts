import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const authUserId = String(body.authUserId || "").trim();
    const password = String(body.password || "").trim();

    if (!authUserId) {
      return NextResponse.json(
        { error: "Mitarbeiter-ID fehlt." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Das Passwort muss mindestens 6 Zeichen haben." },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_SUPABASE_URL fehlt." },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY fehlt." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabaseAdmin.auth.admin.updateUserById(
  authUserId,
  {
    password,
  }
);

if (error) {
  return NextResponse.json(
    { error: error.message || "Passwort konnte nicht geändert werden." },
    { status: 500 }
  );
}

await supabaseAdmin
  .from("employee_profiles")
  .update({ must_change_password: true })
  .eq("auth_user_id", authUserId);

return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unbekannter Serverfehler.",
      },
      { status: 500 }
    );
  }
}