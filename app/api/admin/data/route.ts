import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const allowedTables = new Set([
  "employee_profiles",
  "customers",
  "work_sites",
  "tasks",
  "time_entries",
  "absence_requests",
  "material_products",
  "material_reports",
  "admin_notifications",
  "equipment_items",
  "key_items",
  "customer_contacts",
  "chat_messages",
]);

type AdminResult = {
  error: NextResponse | null;
  // Next.js 16 + Supabase v2 prüfen die generischen Typen sehr streng.
  // Für diese zentrale Admin-API halten wir den Client bewusst flexibel,
  // weil die Tabellen dynamisch über den Request ausgewählt werden.
  supabaseAdmin: any;
  profile: Record<string, unknown> | null;
};

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

async function requireAdmin(request: Request): Promise<AdminResult> {
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const token = getBearerToken(request);

  if (!token) {
    return {
      error: NextResponse.json({ error: "Nicht angemeldet. Admin-Token fehlt." }, { status: 401 }),
      supabaseAdmin: null,
      profile: null,
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
      profile: null,
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_profiles")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Kein Zugriff. Nur Admins dürfen diesen Bereich nutzen." }, { status: 403 }),
      supabaseAdmin: null,
      profile: null,
    };
  }

  return { error: null, supabaseAdmin, profile };
}

function checkTable(table: unknown) {
  const tableName = String(table || "").trim();
  if (!allowedTables.has(tableName)) {
    throw new Error("Diese Tabelle ist für Admin-Aktionen nicht freigegeben.");
  }
  return tableName;
}

function cleanFilter(filters: unknown) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return {} as Record<string, unknown>;
  return filters as Record<string, unknown>;
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || String(value).trim() === "";
}

function numericValue(value: unknown, fallback: number) {
  if (isEmpty(value)) return fallback;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeRow(table: string, row: Record<string, unknown>) {
  const cleaned = { ...row };

  if (table === "customers") {
    if (!("active" in cleaned)) cleaned.active = true;
  }

  if (table === "work_sites") {
    // Einige bestehende CleanTrack-Datenbanken haben latitude/longitude noch als NOT NULL.
    // Damit Kunden und Objekte trotzdem direkt speicherbar sind, setzen wir einen neutralen Fallback.
    if (isEmpty(cleaned.latitude)) cleaned.latitude = 0;
    if (isEmpty(cleaned.longitude)) cleaned.longitude = 0;
    cleaned.allowed_radius_m = numericValue(cleaned.allowed_radius_m, 50);
    if (!("active" in cleaned)) cleaned.active = true;
    if (isEmpty(cleaned.customer_name) && !isEmpty(cleaned.name)) cleaned.customer_name = null;
  }

  if (table === "material_products") {
    if (isEmpty(cleaned.work_site_id)) cleaned.work_site_id = null;
    if (isEmpty(cleaned.object_name)) cleaned.object_name = null;
  }

  if (table === "material_reports") {
    if (isEmpty(cleaned.status)) cleaned.status = "open";
  }

  if (table === "customer_contacts" && !("active" in cleaned)) {
    cleaned.active = true;
  }

  if (table === "employee_profiles") {
    if (isEmpty(cleaned.role)) cleaned.role = "employee";
    if (!("active" in cleaned)) cleaned.active = true;
  }

  return cleaned;
}

function sanitizePayload(table: string, payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.map((item: unknown) => sanitizeRow(table, (item || {}) as Record<string, unknown>));
  }
  return sanitizeRow(table, (payload || {}) as Record<string, unknown>);
}

export async function POST(request: Request) {
  try {
    const adminCheck = await requireAdmin(request);
    if (adminCheck.error) return adminCheck.error;
    if (!adminCheck.supabaseAdmin) {
      return NextResponse.json({ error: "Admin-Verbindung konnte nicht aufgebaut werden." }, { status: 500 });
    }

    const body = await request.json();
    const action = String(body.action || "");

    if (action === "ping") {
      return NextResponse.json({ success: true, profile: adminCheck.profile });
    }

    const table = checkTable(body.table);
    const supabaseAdmin = adminCheck.supabaseAdmin;

    if (action === "select") {
      let query = supabaseAdmin.from(table).select(String(body.select || "*"));
      const filters = cleanFilter(body.filters);
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value as never);
      }
      if (body.orderBy) {
        query = query.order(String(body.orderBy), { ascending: body.ascending !== false });
      }
      if (body.limit) {
        query = query.limit(Number(body.limit));
      }
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: data || [] });
    }

    if (action === "insert") {
      const payload = sanitizePayload(table, body.payload);
      const { data, error } = await supabaseAdmin.from(table).insert(payload).select("*");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === "update") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
      const payload = sanitizePayload(table, body.payload || {});
      const { data, error } = await supabaseAdmin.from(table).update(payload).eq("id", id).select("*");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === "delete") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
      const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unbekannte Admin-Aktion." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Serverfehler im Adminbereich." },
      { status: 500 }
    );
  }
}
