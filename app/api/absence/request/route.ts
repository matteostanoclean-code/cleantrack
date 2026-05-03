import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    await supabaseAdmin.from("admin_notifications").insert([
      {
        employee_name: profile.name,
        title: "Abwesenheitsantrag",
        message: `${profile.name} hat ${absenceType} vom ${startDate} bis ${endDate} eingereicht.`,
        notification_type: "absence_request",
        status: "open",
        absence_request_id: absence?.id || null,
      },
    ]);

    return NextResponse.json({ success: true, absence });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Abwesenheit konnte nicht gesendet werden." },
      { status: 500 }
    );
  }
}
