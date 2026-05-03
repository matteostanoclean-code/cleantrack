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

async function requireAuthenticatedUser(request: Request) {
  const { supabaseUrl, serviceRoleKey } = getEnv();

  const token = getBearerToken(request);

  if (!token) {
    return {
      error: NextResponse.json(
        { error: "Nicht angemeldet. Token fehlt." },
        { status: 401 }
      ),
      supabaseAdmin: null,
      profile: null,
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
      profile: null,
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_profiles")
    .select("id, name, role")
    .eq("auth_user_id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return {
      error: NextResponse.json(
        { error: "Mitarbeiterprofil wurde nicht gefunden." },
        { status: 404 }
      ),
      supabaseAdmin: null,
      profile: null,
    };
  }

  return {
    error: null,
    supabaseAdmin,
    profile,
  };
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAuthenticatedUser(request);

    if (authCheck.error) {
      return authCheck.error;
    }

    if (!authCheck.supabaseAdmin || !authCheck.profile) {
      return NextResponse.json({ error: "Benutzer-Verbindung konnte nicht aufgebaut werden." }, { status: 500 });
    }

    const supabaseAdmin = authCheck.supabaseAdmin;
    const profile = authCheck.profile;

    const body = await request.json();
    const subscription = body.subscription;

    if (!subscription?.endpoint) {
      return NextResponse.json(
        { error: "Push-Subscription fehlt." },
        { status: 400 }
      );
    }

    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!p256dh || !auth) {
      return NextResponse.json(
        { error: "Push-Schlüssel fehlen." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        employee_name: profile.name,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
      },
      {
        onConflict: "endpoint",
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message || "Push konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Push wurde aktiviert.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Serverfehler beim Speichern der Push-Erlaubnis.",
      },
      { status: 500 }
    );
  }
}