import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) throw new Error("VAPID Umgebungsvariablen fehlen.");

  return { supabaseUrl, serviceRoleKey, vapidPublicKey, vapidPrivateKey, vapidSubject };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.replace("Bearer ", "").trim();
}

function isAdminRole(role: unknown) {
  const value = String(role || "").trim().toLowerCase();
  return value === "admin" || value === "objektleiter" || value === "object_lead" || value === "objectleader";
}

async function sendPushToAdmins(supabaseAdmin: any, env: ReturnType<typeof getEnv>, payload: { title: string; body: string; url: string; type: string }) {
  const { data: admins } = await supabaseAdmin
    .from("employee_profiles")
    .select("name, role, active")
    .neq("active", false);

  const adminNames = (admins || []).filter((row: any) => isAdminRole(row.role)).map((row: any) => row.name).filter(Boolean);
  if (adminNames.length === 0) return { sent: 0, failed: 0 };

  const { data: subscriptions } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, employee_name")
    .in("employee_name", adminNames);

  if (!subscriptions || subscriptions.length === 0) return { sent: 0, failed: 0 };

  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);

  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);

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
        body
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const pushError = error as { statusCode?: number };
      if (pushError.statusCode === 404 || pushError.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", item.id);
      }
    }
  }

  return { sent, failed };
}

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const token = getBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const supabaseAdmin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Sitzung ungültig. Bitte neu einloggen." }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from("employee_profiles")
      .select("id,name,active")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (!profile || profile.active === false) {
      return NextResponse.json({ error: "Profil wurde nicht gefunden oder ist passiv." }, { status: 403 });
    }

    const body = await request.json();
    const title = String(body.title || "CleanTrack Admin").trim();
    const message = String(body.message || "Neue Aufgabe im Adminportal.").trim();
    const type = String(body.type || "admin_todo").trim();
    const url = String(body.url || "/mitarbeiter?tab=admin").trim();

    const result = await sendPushToAdmins(supabaseAdmin, env, {
      title,
      body: message,
      url,
      type,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin-Push konnte nicht gesendet werden." },
      { status: 500 }
    );
  }
}
