import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizePhone(phone: string) {
  let cleaned = phone.replace(/\s/g, "").replace(/-/g, "");

  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  if (cleaned.startsWith("0")) {
    cleaned = "+49" + cleaned.slice(1);
  }

  return cleaned;
}

function createToken() {
  return crypto.randomUUID() + "-" + Math.random().toString(36).slice(2);
}

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
        { error: "Kein Zugriff. Nur Admins dürfen Mitarbeiter einladen." },
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

    if (adminCheck.error) {
      return adminCheck.error;
    }

    if (!adminCheck.supabaseAdmin) {
      return NextResponse.json({ error: "Admin-Verbindung konnte nicht aufgebaut werden." }, { status: 500 });
    }

    const supabaseAdmin = adminCheck.supabaseAdmin;

    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phoneRaw = String(body.phone || "").trim();

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name und E-Mail sind Pflicht." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Bitte eine gültige E-Mail eintragen." },
        { status: 400 }
      );
    }

    const token = createToken();
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

    const { error } = await supabaseAdmin.from("employee_invites").insert([
      {
        name,
        email,
        phone,
        token,
        used: false,
      },
    ]);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Einladung konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("employee_profiles")
      .select("id, active, auth_user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile?.id) {
      const { error: profileUpdateError } = await supabaseAdmin
        .from("employee_profiles")
        .update({
          name,
          phone,
          role: "employee",
          must_change_password: existingProfile.auth_user_id ? false : true,
        })
        .eq("id", existingProfile.id);

      if (profileUpdateError) {
        return NextResponse.json({ error: profileUpdateError.message || "Mitarbeiter konnte nicht aktualisiert werden." }, { status: 500 });
      }
    } else {
      const { error: profileInsertError } = await supabaseAdmin.from("employee_profiles").insert([
        {
          name,
          email,
          phone,
          role: "employee",
          active: false,
          must_change_password: true,
        },
      ]);

      if (profileInsertError) {
        return NextResponse.json({ error: profileInsertError.message || "Mitarbeiter konnte nicht in der Liste angelegt werden." }, { status: 500 });
      }
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";

    const inviteLink = `${baseUrl}/mitarbeiter/admin/aktivieren?token=${encodeURIComponent(
      token
    )}`;

    return NextResponse.json({
      success: true,
      inviteLink,
      email,
      phone,
      whatsappLink: phone
        ? `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(
            `Hallo ${name}, hier ist dein Aktivierungslink für CleanTrack: ${inviteLink}`
          )}`
        : "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Serverfehler beim Erstellen der Einladung.",
      },
      { status: 500 }
    );
  }
}