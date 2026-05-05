import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function pushEnv() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return null;
  return { vapidPublicKey, vapidPrivateKey, vapidSubject };
}

function isAdminPushRole(role: unknown) {
  const value = String(role || "").trim().toLowerCase();
  return value === "admin" || value === "objektleiter" || value === "object_lead" || value === "objectleader";
}

async function sendAdminPush(supabaseAdmin: any, title: string, message: string, type = "admin_todo") {
  const env = pushEnv();
  if (!env) return;

  const { data: admins } = await supabaseAdmin
    .from("employee_profiles")
    .select("name, role, active")
    .neq("active", false);

  const names = (admins || []).filter((row: any) => isAdminPushRole(row.role)).map((row: any) => row.name).filter(Boolean);
  if (names.length === 0) return;

  const { data: subscriptions } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, employee_name")
    .in("employee_name", names);

  if (!subscriptions || subscriptions.length === 0) return;

  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);

  const payload = JSON.stringify({
    title,
    body: message,
    url: "/mitarbeiter?tab=admin",
    type,
  });

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
    } catch (error) {
      const pushError = error as { statusCode?: number };
      if (pushError.statusCode === 404 || pushError.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", item.id);
      }
    }
  }
}



function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");

  return { supabaseUrl, serviceRoleKey };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.replace("Bearer ", "").trim();
}

function textOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function requiredDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}

export async function POST(request: Request) {
  try {
    const { supabaseUrl, serviceRoleKey } = getEnv();
    const token = getBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: "Nicht angemeldet. Bitte neu einloggen." }, { status: 401 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Sitzung ungültig. Bitte neu einloggen." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("employee_profiles")
      .select("*")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.active === false) {
      return NextResponse.json({ error: "Mitarbeiterprofil wurde nicht gefunden oder ist passiv." }, { status: 403 });
    }

    const body = await request.json();
    const absenceType = textOrNull(body.absence_type) || "Urlaub";
    const startDate = requiredDate(body.start_date);
    const endDate = requiredDate(body.end_date);
    const reason = textOrNull(body.reason);

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Bitte Start- und Enddatum eintragen." }, { status: 400 });
    }

    if (new Date(endDate) < new Date(startDate)) {
      return NextResponse.json({ error: "Das Enddatum darf nicht vor dem Startdatum liegen." }, { status: 400 });
    }

    const { data: absence, error: absenceError } = await supabaseAdmin
      .from("absence_requests")
      .insert([
        {
          employee_profile_id: profile.id,
          employee_name: profile.name,
          absence_type: absenceType,
          start_date: startDate,
          end_date: endDate,
          reason,
          status: "open",
        },
      ])
      .select("*")
      .maybeSingle();

    if (absenceError) {
      return NextResponse.json({ error: absenceError.message }, { status: 500 });
    }

    const adminMessage = `${profile.name} hat ${absenceType} vom ${startDate} bis ${endDate} eingereicht.`;

    await supabaseAdmin.from("admin_notifications").insert([
      {
        employee_name: profile.name,
        title: "Abwesenheitsantrag",
        message: adminMessage,
        notification_type: "absence_request",
        status: "open",
        absence_request_id: absence?.id || null,
      },
    ]);

    await sendAdminPush(supabaseAdmin, "Neuer Abwesenheitsantrag", adminMessage, "absence_request");

    return NextResponse.json({ success: true, absence });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Abwesenheit konnte nicht gesendet werden." },
      { status: 500 }
    );
  }
}
