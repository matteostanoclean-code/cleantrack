import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Row = Record<string, any>;

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

function monthRange(month: string) {
  const normalized = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = normalized.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, monthNumber, 1, 0, 0, 0, 0);

  return {
    month: normalized,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function dateOnly(value: unknown) {
  return String(value || "").slice(0, 10);
}

async function requireEmployee(request: Request) {
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const token = getBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }), supabaseAdmin: null, profile: null };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Sitzung ungültig. Bitte neu einloggen." }, { status: 401 }), supabaseAdmin: null, profile: null };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_profiles")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active === false) {
    return { error: NextResponse.json({ error: "Mitarbeiterprofil ist nicht aktiv." }, { status: 403 }), supabaseAdmin: null, profile: null };
  }

  return { error: null, supabaseAdmin, profile };
}

export async function GET(request: Request) {
  try {
    const auth = await requireEmployee(request);
    if (auth.error) return auth.error;

    const supabaseAdmin = auth.supabaseAdmin;
    const profile = auth.profile;

    if (!supabaseAdmin || !profile) {
      return NextResponse.json({ error: "Mitarbeiter konnte nicht geladen werden." }, { status: 500 });
    }

    const url = new URL(request.url);
    const range = monthRange(String(url.searchParams.get("month") || ""));

    const { data: entries, error: entriesError } = await supabaseAdmin
      .from("time_entries")
      .select("*")
      .eq("employee_name", profile.name)
      .gte("created_at", range.startIso)
      .lt("created_at", range.endIso)
      .order("created_at", { ascending: false });

    if (entriesError) {
      return NextResponse.json({ error: entriesError.message }, { status: 500 });
    }

    // Falls alte Datensätze work_date, aber kein created_at im Monatsbereich haben.
    const { data: dateEntries } = await supabaseAdmin
      .from("time_entries")
      .select("*")
      .eq("employee_name", profile.name)
      .gte("work_date", range.startDate)
      .lt("work_date", range.endDate)
      .order("created_at", { ascending: false });

    const merged = new Map<string, Row>();
    for (const row of [...(entries || []), ...(dateEntries || [])]) {
      const id = String(row.id || `${row.employee_name}-${dateOnly(row.work_date || row.created_at)}-${row.task_id || ""}`);
      merged.set(id, row);
    }

    return NextResponse.json({
      success: true,
      month: range.month,
      entries: [...merged.values()],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Monatszeiten konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
