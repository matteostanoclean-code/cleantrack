import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const allowedTables = new Set([
  "employee_profiles",
  "work_sites",
  "tasks",
  "time_entries",
  "absence_requests",
  "material_products",
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
      const payload = body.payload;
      const { data, error } = await supabaseAdmin.from(table).insert(payload).select("*");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === "update") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
      const { data, error } = await supabaseAdmin.from(table).update(body.payload || {}).eq("id", id).select("*");
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
