import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  }

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    throw new Error("VAPID Umgebungsvariablen fehlen.");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  };
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

  const role = String(profile?.role || "").trim().toLowerCase();
  const allowed = role === "admin" || role === "objektleiter" || role === "object_lead" || role === "objectleader";

  if (profileError || !allowed) {
    return {
      error: NextResponse.json(
        { error: "Kein Zugriff. Nur Admins oder Objektleiter dürfen Push senden." },
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
    const env = getEnv();

    const adminCheck = await requireAdmin(request);

    if (adminCheck.error || !adminCheck.supabaseAdmin) {
      return adminCheck.error;
    }

    const supabaseAdmin = adminCheck.supabaseAdmin;

    const body = await request.json();

    const employeeName = String(body.employeeName || "").trim();
    const title = String(body.title || "CleanTrack").trim();
    const message = String(
      body.message || "Du hast eine neue Nachricht."
    ).trim();
    const url = String(body.url || "/mitarbeiter").trim();

    if (!employeeName) {
      return NextResponse.json(
        { error: "Mitarbeitername fehlt." },
        { status: 400 }
      );
    }

    webpush.setVapidDetails(
      env.vapidSubject,
      env.vapidPublicKey,
      env.vapidPrivateKey
    );

    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("employee_name", employeeName);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        message: "Keine Push-Registrierung vorhanden. Interne Meldung wurde trotzdem gespeichert.",
      });
    }

    const payload = JSON.stringify({
      title,
      body: message,
      url,
    });

    let sent = 0;
    const failedMessages: string[] = [];

    for (const item of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: item.endpoint,
            keys: {
              p256dh: item.p256dh,
              auth: item.auth,
            },
          },
          payload
        );

        sent += 1;
      } catch (error) {
        const pushError = error as {
          statusCode?: number;
          body?: string;
          message?: string;
        };

        failedMessages.push(
          `${pushError.statusCode || "ohne Status"}: ${
            pushError.body || pushError.message || "Unbekannter Push-Fehler"
          }`
        );

        if (pushError.statusCode === 404 || pushError.statusCode === 410) {
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("id", item.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed: failedMessages.length,
      failedMessages,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Push konnte nicht gesendet werden.",
      },
      { status: 500 }
    );
  }
}