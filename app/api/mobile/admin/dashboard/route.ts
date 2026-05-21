import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function nullableUuid(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function booleanValue(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}


function parseDateOnly(value: unknown) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== day) next.setDate(0);
  return next;
}

function normalizeWeekdays(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

function buildTaskRows(basePayload: AnyRow, body: AnyRow) {
  const mode = clean(body.repeat_mode || "none");
  const start = parseDateOnly(basePayload.task_date);
  const end = parseDateOnly(body.recurrence_end_date);
  const interval = Math.max(1, Math.min(52, nullableNumber(body.recurrence_interval) ?? 1));
  const weekdays = normalizeWeekdays(body.recurrence_days);

  if (!start || mode === "none" || mode === "once" || !end || end < start) {
    return [{ ...basePayload, repeat_mode: "none", recurrence_unit: null, recurrence_interval: null, recurrence_days: null, recurrence_end_date: null }];
  }

  const rows: AnyRow[] = [];
  const groupId = crypto.randomUUID();
  const pushRow = (date: Date) => {
    if (rows.length >= 180) return;
    const taskDate = isoDate(date);
    rows.push({
      ...basePayload,
      task_date: taskDate,
      due_date: taskDate,
      recurrence_group_id: groupId,
      repeat_mode: mode,
      recurrence_unit: mode,
      recurrence_interval: interval,
      recurrence_days: weekdays.length ? weekdays : null,
      recurrence_end_date: isoDate(end)
    });
  };

  if (mode === "daily") {
    for (let cursor = new Date(start); cursor <= end && rows.length < 180; cursor = addDays(cursor, interval)) pushRow(cursor);
    return rows.length ? rows : [basePayload];
  }

  if (mode === "weekly") {
    const selected = weekdays.length ? weekdays : [start.getDay()];
    for (let cursor = new Date(start); cursor <= end && rows.length < 180; cursor = addDays(cursor, 1)) {
      const diffDays = Math.floor((cursor.getTime() - start.getTime()) / 86400000);
      const weekIndex = Math.floor(diffDays / 7);
      if (weekIndex % interval === 0 && selected.includes(cursor.getDay())) pushRow(cursor);
    }
    return rows.length ? rows : [basePayload];
  }

  if (mode === "monthly") {
    for (let cursor = new Date(start); cursor <= end && rows.length < 180; cursor = addMonths(cursor, interval)) pushRow(cursor);
    return rows.length ? rows : [basePayload];
  }

  return [basePayload];
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false, response: NextResponse.json({ ok: false, error: "Nur Admins dürfen das Admin-Dashboard nutzen." }, { status: 403 }) };
  return { ok: true, auth };
}

function customerName(row: AnyRow | null | undefined) {
  return clean(row?.name || row?.customer_name || row?.company_name || row?.contact_person) || "";
}

function customerAddress(row: AnyRow | null | undefined) {
  const direct = clean(row?.address || row?.customer_address);
  if (direct) return direct;
  const parts = [row?.street, [row?.postal_code, row?.city].filter(Boolean).join(" ")].map(clean).filter(Boolean);
  return parts.join(", ");
}

async function loadAdminData(supabase: any) {
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 90);
  const toDate = new Date(now);
  toDate.setDate(toDate.getDate() + 365);

  const [employees, customers, sites, tasks, timeEntries, absences, materialReports, notifications] = await Promise.all([
    supabase
      .from("employee_profiles")
      .select("*")
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("work_sites")
      .select("*")
      .order("name", { ascending: true })
      .limit(250),
    supabase
      .from("tasks")
      .select("*")
      .gte("task_date", fromDate.toISOString().slice(0, 10))
      .lte("task_date", toDate.toISOString().slice(0, 10))
      .order("task_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1000),
    supabase
      .from("time_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("absence_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("material_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  const errors = [employees.error, customers.error, sites.error, tasks.error, timeEntries.error, absences.error, materialReports.error, notifications.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message || "Admin-Daten konnten nicht geladen werden.");

  return {
    employees: employees.data || [],
    customers: customers.data || [],
    workSites: sites.data || [],
    tasks: tasks.data || [],
    timeEntries: timeEntries.data || [],
    absences: absences.data || [],
    materialReports: materialReports.data || [],
    notifications: notifications.data || []
  };
}

function employeePayload(body: AnyRow) {
  return {
    name: clean(body.name),
    email: nullableText(body.email),
    phone: nullableText(body.phone),
    role: clean(body.role) || "employee",
    active: booleanValue(body.active, false),
    employee_number: nullableText(body.employee_number),
    monthly_hour_limit: nullableNumber(body.monthly_hour_limit),
    vacation_days: nullableNumber(body.vacation_days)
  };
}

function customerPayload(body: AnyRow) {
  const name = clean(body.name || body.customer_name || body.company_name);
  const address = clean(body.address || body.customer_address);
  const email = clean(body.email || body.customer_email);
  const phone = clean(body.phone || body.customer_phone);
  const notes = clean(body.notes || body.customer_notes);

  return {
    name,
    customer_name: name,
    company_name: name,
    customer_number: nullableText(body.customer_number),
    address: address || null,
    customer_address: address || null,
    email: email || null,
    customer_email: email || null,
    phone: phone || null,
    customer_phone: phone || null,
    notes: notes || null,
    customer_notes: notes || null,
    active: booleanValue(body.active, true)
  };
}

function sitePayload(body: AnyRow, customer?: AnyRow | null) {
  const name = clean(body.name || body.site || body.object_name);
  const address = clean(body.address || body.customer_address || customerAddress(customer));
  const label = clean(body.customer_name) || customerName(customer);

  return {
    name,
    customer_id: nullableUuid(body.customer_id),
    customer_name: label || null,
    customer_number: nullableText(customer?.customer_number),
    customer_address: customerAddress(customer) || null,
    customer_phone: clean(customer?.phone || customer?.customer_phone) || null,
    customer_email: clean(customer?.email || customer?.customer_email) || null,
    address: address || null,
    latitude: nullableNumber(body.latitude),
    longitude: nullableNumber(body.longitude),
    gps_required: booleanValue(body.gps_required, false),
    allowed_radius_m: nullableNumber(body.allowed_radius_m) ?? 150,
    monthly_hour_quota: nullableNumber(body.monthly_hour_quota) ?? 0,
    hour_quota: nullableNumber(body.monthly_hour_quota) ?? 0,
    active: booleanValue(body.active, true),
    notes: nullableText(body.notes)
  };
}

function taskPayload(body: AnyRow, customer?: AnyRow | null, site?: AnyRow | null) {
  const selectedSiteName = clean(site?.name || body.site || body.work_site_name);
  const selectedCustomerName = clean(body.customer_name) || customerName(customer) || clean(site?.customer_name);
  const plannedMinutes = nullableNumber(body.planned_minutes) ?? 0;

  return {
    title: clean(body.title) || "Unterhaltsreinigung",
    site: selectedSiteName || null,
    employee_name: nullableText(body.employee_name),
    task_date: clean(body.task_date) || todayIso(),
    start_time: nullableText(body.start_time),
    end_time: nullableText(body.end_time),
    max_minutes: plannedMinutes,
    planned_minutes: plannedMinutes,
    paid_minutes: nullableNumber(body.paid_minutes) ?? plannedMinutes,
    wage_minutes: nullableNumber(body.wage_minutes) ?? plannedMinutes,
    work_site_id: nullableUuid(body.work_site_id),
    customer_id: nullableUuid(body.customer_id),
    customer_name: selectedCustomerName || null,
    status: clean(body.status) || "open",
    priority: clean(body.priority) || "Normal",
    task_type: clean(body.task_type) || "einsatz",
    item_type: clean(body.item_type) || "einsatz",
    due_date: nullableText(body.due_date || body.task_date),
    notes: nullableText(body.notes),
    done: booleanValue(body.done, false),
    repeat_mode: clean(body.repeat_mode || "none"),
    recurrence_unit: clean(body.recurrence_unit || body.repeat_mode) || null,
    recurrence_interval: nullableNumber(body.recurrence_interval),
    recurrence_days: Array.isArray(body.recurrence_days) ? body.recurrence_days : null,
    recurrence_end_date: nullableText(body.recurrence_end_date),
    notify_employee: booleanValue(body.notify_employee, true)
  };
}

async function readCustomer(supabase: any, customerId: string | null) {
  if (!customerId) return null;
  const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function readSite(supabase: any, siteId: string | null) {
  if (!siteId) return null;
  const { data, error } = await supabase.from("work_sites").select("*").eq("id", siteId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if ("response" in guard) return guard.response;
    const data = await loadAdminData(guard.auth.supabase);
    return NextResponse.json({ ok: true, profile: guard.auth.profile, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin-Dashboard konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if ("response" in guard) return guard.response;
    const { supabase, profile } = guard.auth;
    const body = await request.json();
    const type = clean(body.type);

    if (type === "employee") {
      const payload = employeePayload(body);
      if (!payload.name) return NextResponse.json({ ok: false, error: "Mitarbeiter-Name fehlt." }, { status: 400 });
      const { data, error } = await supabase.from("employee_profiles").insert(payload).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "customer") {
      const payload = customerPayload(body);
      if (!payload.name) return NextResponse.json({ ok: false, error: "Kundenname fehlt." }, { status: 400 });
      const { data, error } = await supabase.from("customers").insert(payload).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "site") {
      const customer = await readCustomer(supabase, nullableUuid(body.customer_id));
      const payload = sitePayload(body, customer);
      if (!payload.name) return NextResponse.json({ ok: false, error: "Objektname fehlt." }, { status: 400 });
      const { data, error } = await supabase.from("work_sites").insert(payload).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "task") {
      if (!clean(body.employee_name)) return NextResponse.json({ ok: false, error: "Bitte einen Mitarbeiter auswählen. Termine ohne Mitarbeiter werden nicht in der Mitarbeiter-App angezeigt." }, { status: 400 });
      const customer = await readCustomer(supabase, nullableUuid(body.customer_id));
      const site = await readSite(supabase, nullableUuid(body.work_site_id));
      const payload = taskPayload(body, customer, site);
      const rows = buildTaskRows(payload, body);
      const { data, error } = await supabase.from("tasks").insert(rows).select("*");
      if (error) throw new Error(error.message);

      const insertedTasks = Array.isArray(data) ? data : [];
      if (payload.notify_employee && payload.employee_name && insertedTasks.length) {
        const first = insertedTasks[0];
        await supabase.from("admin_notifications").insert({
          title: insertedTasks.length > 1 ? "Neue Einsatz-Serie" : "Neuer Einsatz",
          message: `${profile.name} hat ${insertedTasks.length > 1 ? `${insertedTasks.length} Einsätze` : "einen Einsatz"} erstellt: ${payload.title}${payload.site ? ` bei ${payload.site}` : ""}.`,
          employee_name: payload.employee_name,
          work_site_name: payload.site,
          object_name: payload.site,
          site: payload.site,
          notification_type: insertedTasks.length > 1 ? "task_series_created" : "task_created",
          status: "open",
          read: false,
          task_id: first.id,
          work_site_id: payload.work_site_id,
          created_at: new Date().toISOString()
        });
      }

      return NextResponse.json({ ok: true, item: insertedTasks[0] || null, items: insertedTasks, count: insertedTasks.length });
    }

    return NextResponse.json({ ok: false, error: "Unbekannter Typ." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Datensatz konnte nicht erstellt werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if ("response" in guard) return guard.response;
    const { supabase } = guard.auth;
    const body = await request.json();
    const type = clean(body.type);
    const id = clean(body.id);

    if (!id) return NextResponse.json({ ok: false, error: "ID fehlt." }, { status: 400 });

    if (type === "employee") {
      const payload = employeePayload(body);
      const { data, error } = await supabase.from("employee_profiles").update(payload).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "customer") {
      const payload = customerPayload(body);
      const { data, error } = await supabase.from("customers").update(payload).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "site") {
      const customer = await readCustomer(supabase, nullableUuid(body.customer_id));
      const payload = sitePayload(body, customer);
      const { data, error } = await supabase.from("work_sites").update(payload).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "task") {
      if (!clean(body.employee_name)) return NextResponse.json({ ok: false, error: "Bitte einen Mitarbeiter auswählen. Termine ohne Mitarbeiter werden nicht in der Mitarbeiter-App angezeigt." }, { status: 400 });
      const customer = await readCustomer(supabase, nullableUuid(body.customer_id));
      const site = await readSite(supabase, nullableUuid(body.work_site_id));
      const payload = taskPayload(body, customer, site);
      const { data, error } = await supabase.from("tasks").update(payload).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "task_status") {
      const done = booleanValue(body.done, false);
      const status = clean(body.status) || (done ? "done" : "open");
      const { data, error } = await supabase.from("tasks").update({ done, status }).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, item: data });
    }

    return NextResponse.json({ ok: false, error: "Unbekannter Typ." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Datensatz konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
