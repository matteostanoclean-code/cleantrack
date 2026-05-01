import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token || "").trim();
    const password = String(body.password || "").trim();

    if (!token || password.length < 6) {
      return NextResponse.json(
        { error: "Token fehlt oder Passwort ist zu kurz." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("employee_invites")
      .select("id, name, phone, used")
      .eq("token", token)
      .single();

    if (inviteError || !invite || invite.used) {
      return NextResponse.json(
        { error: "Dieser Aktivierungslink ist ungültig oder wurde bereits genutzt." },
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
        { error: "Mitarbeiter konnte nicht aktiviert werden." },
        { status: 500 }
      );
    }

    await supabaseAdmin.from("employee_profiles").insert([
      {
        auth_user_id: createdUser.user.id,
        name: invite.name,
        phone: invite.phone,
        role: "employee",
      },
    ]);

    await supabaseAdmin
      .from("employee_invites")
      .update({ used: true })
      .eq("id", invite.id);

    return NextResponse.json({
      success: true,
    });
  } catch {
    return NextResponse.json(
      { error: "Serverfehler bei der Aktivierung." },
      { status: 500 }
    );
  }
}