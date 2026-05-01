import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const token = String(body.token || "").trim();
    const password = String(body.password || "").trim();

    if (!token) {
      return NextResponse.json(
        { error: "Aktivierungslink fehlt." },
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

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("employee_invites")
      .select("id, name, phone, used")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: "Aktivierungslink wurde nicht gefunden." },
        { status: 400 }
      );
    }

    if (invite.used) {
      return NextResponse.json(
        { error: "Dieser Aktivierungslink wurde bereits verwendet." },
        { status: 400 }
      );
    }

    const { data: createdUser, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        phone: invite.phone,
        password,
        phone_confirm: true,
        user_metadata: {
          name: invite.name,
          role: "employee",
        },
      });

    if (userError || !createdUser.user) {
      return NextResponse.json(
        {
          error:
            userError?.message ||
            "Mitarbeiter konnte in Supabase Auth nicht erstellt werden.",
        },
        { status: 500 }
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from("employee_profiles")
      .insert([
        {
          auth_user_id: createdUser.user.id,
          name: invite.name,
          phone: invite.phone,
          role: "employee",
        },
      ]);

    if (profileError) {
      return NextResponse.json(
        {
          error:
            profileError.message ||
            "Mitarbeiterprofil konnte nicht erstellt werden.",
        },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("employee_invites")
      .update({ used: true })
      .eq("id", invite.id);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unbekannter Serverfehler bei der Aktivierung.",
      },
      { status: 500 }
    );
  }
}