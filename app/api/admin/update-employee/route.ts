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

async function requireAdmin(request: Request): Promise<{ error: NextResponse | null; supabaseAdmin: any }> {
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const token = getBearerToken(request);

  if (!token) {
    return {
      error: NextResponse.json({ error: "Nicht angemeldet. Admin-Token fehlt." }, { status: 401 }),
      supabaseAdmin: null,
    };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      error: NextResponse.json({ error: "Sitzung ungültig. Bitte neu einloggen." }, { status: 401 }),
      supabaseAdmin: null,
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_profiles")
    .select("role")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Kein Zugriff. Nur Admins dürfen Mitarbeiter bearbeiten." }, { status: 403 }),
      supabaseAdmin: null,
    };
  }

  return { error: null, supabaseAdmin };
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberValue(value: unknown, fallback = 0) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return fallback;
  const number = Number(text);
  return Number.isFinite(number) ? number : fallback;
}

export async function POST(request: Request) {
  try {
    const adminCheck = await requireAdmin(request);
    if (adminCheck.error) return adminCheck.error;
    if (!adminCheck.supabaseAdmin) {
      return NextResponse.json({ error: "Admin-Verbindung konnte nicht aufgebaut werden." }, { status: 500 });
    }

    const body = await request.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Mitarbeiter-ID fehlt." }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if ("name" in body) {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Name ist Pflicht." }, { status: 400 });
      update.name = name;
    }

    if ("email" in body) update.email = nullableText(body.email)?.toLowerCase() || null;
    if ("phone" in body) update.phone = nullableText(body.phone);
    if ("employee_number" in body) update.employee_number = nullableText(body.employee_number);
    if ("address" in body) update.address = nullableText(body.address);
    if ("hourly_rate" in body) update.hourly_rate = numberValue(body.hourly_rate, 0);

    if ("vacation_days" in body) {
      const days = numberValue(body.vacation_days, 0);
      update.vacation_days = days;
      update.annual_vacation_days = days;
    }

    if ("active" in body) update.active = Boolean(body.active);

    const { data, error } = await adminCheck.supabaseAdmin
      .from("employee_profiles")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message || "Mitarbeiter konnte nicht gespeichert werden." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Mitarbeiter wurde nicht gefunden. Bitte Seite neu laden." }, { status: 404 });
    }

    return NextResponse.json({ success: true, employee: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Serverfehler beim Speichern des Mitarbeiters." },
      { status: 500 }
    );
  }
}
