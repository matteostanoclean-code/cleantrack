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
  "quality_reports",
  "admin_notifications",
  "equipment_items",
  "key_items",
  "customer_contacts",
  "chat_messages",
  "cleaning_plans",
  "cleaning_plan_items",
  "calculations",
  "calculation_items",
  "offers",
  "offer_items",
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

  const role = String(profile?.role || "").trim().toLowerCase();
  const allowedRole = role === "admin" || role === "objektleiter" || role === "object_lead" || role === "objectleader";

  if (profileError || !allowedRole) {
    return {
      error: NextResponse.json({ error: "Kein Zugriff. Nur Admins oder Objektleiter dürfen diesen Bereich nutzen." }, { status: 403 }),
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

function roleKey(profile: Record<string, unknown> | null) {
  return String(profile?.role || "").trim().toLowerCase();
}

function isAdmin(profile: Record<string, unknown> | null) {
  return roleKey(profile) === "admin";
}

function isObjectLeader(profile: Record<string, unknown> | null) {
  const role = roleKey(profile);
  return role === "objektleiter" || role === "object_lead" || role === "objectleader";
}

const objectLeaderReadableTables = new Set([
  "employee_profiles",
  "customers",
  "work_sites",
  "tasks",
  "time_entries",
  "absence_requests",
  "material_products",
  "material_reports",
  "quality_reports",
  "admin_notifications",
  "customer_contacts",
  "chat_messages",
  "cleaning_plans",
  "cleaning_plan_items",
  "calculations",
  "calculation_items",
  "offers",
  "offer_items",
  "equipment_items",
]);

const objectLeaderWritableTables = new Set([
  "tasks",
  "time_entries",
  "absence_requests",
  "material_products",
  "material_reports",
  "quality_reports",
  "admin_notifications",
  "chat_messages",
  "cleaning_plans",
  "cleaning_plan_items",
  "calculations",
  "calculation_items",
  "offers",
  "offer_items",
]);

function ensurePermission(profile: Record<string, unknown> | null, action: string, table: string) {
  if (isAdmin(profile)) return;

  if (!isObjectLeader(profile)) {
    throw new Error("Kein Zugriff. Nur Admins oder Objektleiter dürfen diesen Bereich nutzen.");
  }

  if (action === "select" && objectLeaderReadableTables.has(table)) return;
  if ((action === "insert" || action === "update") && objectLeaderWritableTables.has(table)) return;
  if (action === "delete" && (table === "cleaning_plans" || table === "cleaning_plan_items" || table === "calculations" || table === "calculation_items" || table === "offers" || table === "offer_items")) return;

  throw new Error("Für diese Aktion fehlt die Berechtigung.");
}

function stripSensitiveRows(profile: Record<string, unknown> | null, table: string, rows: unknown[]) {
  if (isAdmin(profile) || table !== "employee_profiles") return rows;

  return rows.map((item) => {
    const row = { ...(item as Record<string, unknown>) };
    delete row.hourly_rate;
    delete row.salary;
    delete row.vacation_days;
    delete row.annual_vacation_days;
    delete row.address;
    delete row.phone;
    delete row.email;
    delete row.auth_user_id;
    return row;
  });
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || String(value).trim() === "";
}

function numericValue(value: unknown, fallback: number) {
  if (isEmpty(value)) return fallback;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeRow(table: string, row: Record<string, unknown>, action: "insert" | "update" = "insert") {
  const cleaned = { ...row };
  const isInsert = action === "insert";
  const has = (key: string) => Object.prototype.hasOwnProperty.call(cleaned, key);


  if (table === "customers") {
    if (isEmpty(cleaned.contract_start_date)) cleaned.contract_start_date = null;
    if (isEmpty(cleaned.contract_end_date)) cleaned.contract_end_date = null;
    if (isEmpty(cleaned.street)) cleaned.street = null;
    if (isEmpty(cleaned.postal_code)) cleaned.postal_code = null;
    if (isEmpty(cleaned.city)) cleaned.city = null;
    if (isEmpty(cleaned.country)) cleaned.country = "DE Deutschland";
    if (isEmpty(cleaned.address_addition)) cleaned.address_addition = null;
    if (isEmpty(cleaned.mobile)) cleaned.mobile = null;
    if (isEmpty(cleaned.contact_person)) cleaned.contact_person = null;
    if (isEmpty(cleaned.invoice_recipient)) cleaned.invoice_recipient = null;
    if (isEmpty(cleaned.payment_terms)) cleaned.payment_terms = null;
    if (isEmpty(cleaned.xrechnung_leitweg_id)) cleaned.xrechnung_leitweg_id = null;
    if (isEmpty(cleaned.xrechnung_order_number)) cleaned.xrechnung_order_number = null;
    if (isEmpty(cleaned.xrechnung_supplier_number)) cleaned.xrechnung_supplier_number = null;
    if (isEmpty(cleaned.status)) cleaned.status = cleaned.active === false ? "inactive" : "active";
    if (!("active" in cleaned)) cleaned.active = cleaned.status !== "inactive";
  }

  if (table === "work_sites") {
    // Einige bestehende CleanTrack-Datenbanken haben latitude/longitude noch als NOT NULL.
    // Damit Kunden und Objekte trotzdem direkt speicherbar sind, setzen wir einen neutralen Fallback.
    if (isEmpty(cleaned.latitude)) cleaned.latitude = 0;
    if (isEmpty(cleaned.longitude)) cleaned.longitude = 0;
    cleaned.allowed_radius_m = numericValue(cleaned.allowed_radius_m, 150);
    if (!("active" in cleaned)) cleaned.active = true;
    if (isEmpty(cleaned.customer_name) && !isEmpty(cleaned.name)) cleaned.customer_name = null;
    if (isEmpty(cleaned.street)) cleaned.street = null;
    if (isEmpty(cleaned.postal_code)) cleaned.postal_code = null;
    if (isEmpty(cleaned.city)) cleaned.city = null;
    if (isEmpty(cleaned.country)) cleaned.country = "DE Deutschland";
  }


  if (table === "tasks") {
    if (isEmpty(cleaned.title)) cleaned.title = "Unterhaltsreinigung";
    if (isEmpty(cleaned.customer_id)) cleaned.customer_id = null;
    if (isEmpty(cleaned.customer_name)) cleaned.customer_name = null;
    if (isEmpty(cleaned.work_site_id)) cleaned.work_site_id = null;
    if (isEmpty(cleaned.employee_name)) cleaned.employee_name = null;
    if (isEmpty(cleaned.priority)) cleaned.priority = "Normal";
    if (isEmpty(cleaned.status)) cleaned.status = "open";
    if (isEmpty(cleaned.task_category)) cleaned.task_category = cleaned.item_type === "task" || cleaned.task_type === "task" ? "Sonstiges" : "Einsatz";
    cleaned.planned_minutes = numericValue(cleaned.planned_minutes, 0);
    cleaned.max_minutes = numericValue(cleaned.max_minutes, Number(cleaned.planned_minutes || 0));
    if (Number(cleaned.planned_minutes || 0) <= 0 && Number(cleaned.max_minutes || 0) > 0) cleaned.planned_minutes = cleaned.max_minutes;
    if (Number(cleaned.max_minutes || 0) <= 0 && Number(cleaned.planned_minutes || 0) > 0) cleaned.max_minutes = cleaned.planned_minutes;
  }

  if (table === "cleaning_plans") {
    if (isEmpty(cleaned.name)) cleaned.name = "Neuer Reinigungsplan";
    if (isEmpty(cleaned.status)) cleaned.status = "draft";
    if (isEmpty(cleaned.language)) cleaned.language = "de";
    if (isEmpty(cleaned.template_type)) cleaned.template_type = "standard";
    if (isEmpty(cleaned.customer_id)) cleaned.customer_id = null;
    if (isEmpty(cleaned.work_site_id)) cleaned.work_site_id = null;
  }

  if (table === "cleaning_plan_items") {
    // Wichtig: Bei Updates darf ein Teil-Update wie { sort_order } keine bestehenden Inhalte überschreiben.
    // Deshalb Defaults nur beim Insert setzen oder wenn das Feld im Update bewusst mitgesendet wurde.
    if ((isInsert || has("area")) && isEmpty(cleaned.area)) cleaned.area = "Allgemein";
    if ((isInsert || has("task_title")) && isEmpty(cleaned.task_title)) cleaned.task_title = "Neue Aufgabe";
    if ((isInsert || has("interval_type")) && isEmpty(cleaned.interval_type)) cleaned.interval_type = "daily";
    if ((isInsert || has("weekdays")) && !Array.isArray(cleaned.weekdays)) cleaned.weekdays = [];
    if (isInsert || has("quantity")) cleaned.quantity = numericValue(cleaned.quantity, 1);
    if (isInsert || has("sort_order")) cleaned.sort_order = numericValue(cleaned.sort_order, 0);
    if (isInsert && !("active" in cleaned)) cleaned.active = true;
  }

  if (table === "material_products") {
    if (isEmpty(cleaned.work_site_id)) cleaned.work_site_id = null;
    if (isEmpty(cleaned.object_name)) cleaned.object_name = null;
  }

  if (table === "material_reports") {
    if (isEmpty(cleaned.status)) cleaned.status = "open";
  }

  if (table === "quality_reports") {
    if (isEmpty(cleaned.status)) cleaned.status = "open";
    if (isEmpty(cleaned.checked_items)) cleaned.checked_items = [];
    cleaned.total_items = numericValue(cleaned.total_items, Array.isArray(cleaned.checked_items) ? cleaned.checked_items.length : 0);
    cleaned.passed_items = numericValue(cleaned.passed_items, Array.isArray(cleaned.checked_items) ? cleaned.checked_items.length : 0);
  }

  if (table === "customer_contacts" && !("active" in cleaned)) {
    cleaned.active = true;
  }

  if (table === "employee_profiles") {
    if (isEmpty(cleaned.role)) cleaned.role = "employee";
    if (!("active" in cleaned)) cleaned.active = true;
  }

  if (table === "time_entries") {
    if (isEmpty(cleaned.action)) cleaned.action = "manual";
    if (isEmpty(cleaned.entry_type)) cleaned.entry_type = "manual";
    cleaned.planned_minutes = numericValue(cleaned.planned_minutes, 0);
    cleaned.worked_minutes = numericValue(cleaned.worked_minutes, 0);
    cleaned.payroll_minutes = numericValue(cleaned.payroll_minutes, Number(cleaned.worked_minutes || 0));
    cleaned.pause_minutes = numericValue(cleaned.pause_minutes, 0);
    if (isEmpty(cleaned.status)) cleaned.status = cleaned.approved === true ? "approved" : "open";
  }

  return cleaned;
}

function sanitizePayload(table: string, payload: unknown, action: "insert" | "update" = "insert") {
  if (Array.isArray(payload)) {
    return payload.map((item: unknown) => sanitizeRow(table, (item || {}) as Record<string, unknown>, action));
  }
  return sanitizeRow(table, (payload || {}) as Record<string, unknown>, action);
}

function isSchemaColumnError(error: unknown) {
  const message = String((error as { message?: string })?.message || error || "");
  return /column .* does not exist|schema cache|Could not find .* column|Could not find/i.test(message);
}

function fallbackTaskRow(row: Record<string, unknown>) {
  const planned = numericValue(row.planned_minutes, numericValue(row.max_minutes, 0));
  return {
    title: isEmpty(row.title) ? "Unterhaltsreinigung" : row.title,
    task_date: row.task_date || row.due_date || null,
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    max_minutes: planned,
    planned_minutes: planned,
    employee_name: isEmpty(row.employee_name) ? null : row.employee_name,
    site: isEmpty(row.site) ? null : row.site,
    work_site_id: isEmpty(row.work_site_id) ? null : row.work_site_id,
    priority: isEmpty(row.priority) ? "Normal" : row.priority,
    notes: isEmpty(row.notes) ? null : row.notes,
    quality_required: row.quality_required === true,
    quality_photo_required: row.quality_photo_required === true,
    quality_checklist: Array.isArray(row.quality_checklist) ? row.quality_checklist : [],
    done: row.done === true,
    recurrence_group_id: isEmpty(row.recurrence_group_id) ? null : row.recurrence_group_id,
  };
}

function fallbackTaskPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.map((item: unknown) => fallbackTaskRow((item || {}) as Record<string, unknown>));
  }
  return fallbackTaskRow((payload || {}) as Record<string, unknown>);
}

function canRetryTaskSchema(table: string, error: unknown) {
  return table === "tasks" && isSchemaColumnError(error);
}

function missingColumnName(error: unknown) {
  const message = String((error as { message?: string })?.message || error || "");
  const patterns = [
    /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
    /Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i,
    /Could not find .* ['"]([a-zA-Z0-9_]+)['"].*schema cache/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function removeColumnFromPayload(payload: unknown, column: string) {
  if (!column) return payload;

  if (Array.isArray(payload)) {
    return payload.map((item: unknown) => {
      const row = { ...((item || {}) as Record<string, unknown>) };
      delete row[column];
      return row;
    });
  }

  const row = { ...((payload || {}) as Record<string, unknown>) };
  delete row[column];
  return row;
}

async function safeInsert(supabaseAdmin: any, table: string, payload: unknown) {
  let nextPayload = payload;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await supabaseAdmin.from(table).insert(nextPayload).select("*");
    if (!result.error) return result;

    const column = missingColumnName(result.error);
    if (!column || !isSchemaColumnError(result.error)) return result;

    nextPayload = removeColumnFromPayload(nextPayload, column);
  }

  return await supabaseAdmin.from(table).insert(nextPayload).select("*");
}

async function safeUpdate(supabaseAdmin: any, table: string, id: string, payload: unknown) {
  let nextPayload = payload;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await supabaseAdmin.from(table).update(nextPayload).eq("id", id).select("*");
    if (!result.error) return result;

    const column = missingColumnName(result.error);
    if (!column || !isSchemaColumnError(result.error)) return result;

    nextPayload = removeColumnFromPayload(nextPayload, column);
  }

  return await supabaseAdmin.from(table).update(nextPayload).eq("id", id).select("*");
}

function friendlyDatabaseError(error: unknown) {
  const message = String((error as { message?: string })?.message || error || "");
  const column = missingColumnName(error);

  if (/schema cache|column .* does not exist|Could not find/i.test(message)) {
    return column
      ? `Datenbank-Schema ist nicht aktuell. Die Spalte "${column}" fehlt. Bitte final_schema_update.sql in Supabase ausführen.`
      : "Datenbank-Schema ist nicht aktuell. Bitte final_schema_update.sql in Supabase ausführen.";
  }

  if (/violates check constraint/i.test(message)) {
    return "Eine alte Datenbank-Regel blockiert das Speichern. Bitte final_schema_update.sql in Supabase ausführen.";
  }

  if (/violates not-null constraint|null value/i.test(message)) {
    return "Ein Pflichtfeld fehlt oder eine alte Pflichtregel blockiert das Speichern. Bitte final_schema_update.sql in Supabase ausführen.";
  }

  return message;
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
    ensurePermission(adminCheck.profile, action, table);

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
      let result = await query;

      if (result.error && /column .* does not exist|Could not find|schema cache/i.test(result.error.message || "")) {
        // Bestehende Datenbanken können ältere Spaltennamen haben.
        // Damit die Admin-Oberfläche nicht überall blockiert, versuchen wir ohne Sortierung erneut.
        let retryQuery = supabaseAdmin.from(table).select(String(body.select || "*"));
        const retryFilters = cleanFilter(body.filters);
        for (const [key, value] of Object.entries(retryFilters)) {
          retryQuery = retryQuery.eq(key, value as never);
        }
        if (body.limit) {
          retryQuery = retryQuery.limit(Number(body.limit));
        }
        result = await retryQuery;
      }

      if (result.error) return NextResponse.json({ error: friendlyDatabaseError(result.error) }, { status: 500 });
      return NextResponse.json({ success: true, data: stripSensitiveRows(adminCheck.profile, table, result.data || []) });
    }

    if (action === "insert") {
      const payload = sanitizePayload(table, body.payload, "insert");
      let { data, error } = await safeInsert(supabaseAdmin, table, payload);
      if (error && canRetryTaskSchema(table, error)) {
        const retryPayload = fallbackTaskPayload(payload);
        const retry = await safeInsert(supabaseAdmin, table, retryPayload);
        data = retry.data;
        error = retry.error;
      }
      if (error) return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === "update") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
      const payload = sanitizePayload(table, body.payload || {}, "update");
      let { data, error } = await safeUpdate(supabaseAdmin, table, id, payload);
      if (error && canRetryTaskSchema(table, error)) {
        const retryPayload = fallbackTaskPayload(payload);
        const retry = await safeUpdate(supabaseAdmin, table, id, retryPayload);
        data = retry.data;
        error = retry.error;
      }
      if (error) return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === "delete") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
      const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
      if (error) return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
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
