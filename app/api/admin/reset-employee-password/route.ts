import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  }

  return { supabaseUrl, serviceRoleKey };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.replace("Bearer ", "").trim();
}

async function requireAdmin(request: Request) {
  const { supabaseUrl, serviceRoleKey } = getEnv();

  const token = getBearerToken(request);

  if (!token) {
    return {
      error: NextResponse.json(
        { error: "Nicht angemeldet. Admin-Token fehlt." },
        { status: 401 }
      ),
      supabaseAdmin: null,
    };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      error: NextResponse.json(
        { error: "Sitzung ungültig. Bitte neu einloggen." },
        { status: 401 }
      ),
      supabaseAdmin: null,
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_profiles")
    .select("role")
    .eq("auth_user_id", userData.user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Kein Zugriff. Nur Admins dürfen Passwörter zurücksetzen." },
        { status: 403 }
      ),
      supabaseAdmin: null,
    };
  }

  return {
    error: null,
    supabaseAdmin,
  };
}

export async function POST(request: Request) {
  try {
    const adminCheck = await requireAdmin(request);

    if (adminCheck.error || !adminCheck.supabaseAdmin) {
      return adminCheck.error;
    }

    const supabaseAdmin = adminCheck.supabaseAdmin;

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

    const { data: targetProfile, error: targetProfileError } =
      await supabaseAdmin
        .from("employee_profiles")
        .select("id, role")
        .eq("auth_user_id", authUserId)
        .single();

    if (targetProfileError || !targetProfile) {
      return NextResponse.json(
        { error: "Mitarbeiterprofil wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (targetProfile.role === "admin") {
      return NextResponse.json(
        { error: "Admin-Passwörter dürfen hier nicht zurückgesetzt werden." },
        { status: 403 }
      );
    }

    const { error: updateUserError } =
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password,
      });

    if (updateUserError) {
      return NextResponse.json(
        {
          error:
            updateUserError.message ||
            "Passwort konnte in Supabase Auth nicht geändert werden.",
        },
        { status: 500 }
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from("employee_profiles")
      .update({ must_change_password: true })
      .eq("auth_user_id", authUserId);

    if (profileError) {
      return NextResponse.json(
        {
          error:
            profileError.message ||
            "Passwort wurde geändert, aber Passwortwechsel-Pflicht konnte nicht gespeichert werden.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Passwort wurde geändert. Mitarbeiter muss beim nächsten Login ein neues Passwort erstellen.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unbekannter Serverfehler beim Passwort-Reset.",
      },
      { status: 500 }
    );
  }
}