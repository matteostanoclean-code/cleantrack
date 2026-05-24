import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

type BillingCustomer = {
  key: string;
  customerId: string | null;
  customerName: string;
  customerNumber: string | null;
  address: string | null;
  taskCount: number;
  doneTasks: number;
  openTasks: number;
  plannedMinutes: number;
  actualMinutes: number;
  billableMinutes: number;
  signedReports: number;
  employees: string[];
  sites: string[];
  warnings: string[];
  tasks: Row[];
  timeEntries: Row[];
  serviceReports: Row[];
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function monthRange(monthParam: string | null) {
  const fallback = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(monthParam || "") ? String(monthParam) : fallback;
  const start = `${month}-01`;
  const date = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(date);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);
  return { month, start, end, startIso: `${start}T00:00:00.000Z`, endIso: `${end}T00:00:00.000Z` };
}

function numberValue(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function taskMinutes(task: Row) {
  const direct = numberValue(task.planned_minutes ?? task.max_minutes ?? task.paid_minutes ?? task.wage_minutes, 0);
  if (direct > 0) return direct;
  const [sh, sm] = clean(task.start_time).split(":").map(Number);
  const [eh, em] = clean(task.end_time).split(":").map(Number);
  if (Number.isFinite(sh) && Number.isFinite(eh)) {
    let start = (sh || 0) * 60 + (sm || 0);
    let end = (eh || 0) * 60 + (em || 0);
    if (end < start) end += 1440;
    return Math.max(0, end - start);
  }
  return 0;
}

function isDone(task: Row) {
  const status = clean(task.status).toLowerCase();
  return Boolean(task.done) || ["done", "erledigt", "completed", "abgeschlossen"].includes(status);
}

function customerLabel(row: Row | null | undefined) {
  return clean(row?.name || row?.customer_name || row?.company_name || row?.contact_person) || "Ohne Kunde";
}

function customerAddress(row: Row | null | undefined) {
  const direct = clean(row?.address || row?.customer_address);
  if (direct) return direct;
  const street = clean(row?.street);
  const city = [row?.postal_code, row?.city].map(clean).filter(Boolean).join(" ");
  return [street, city].filter(Boolean).join(", ") || null;
}

function siteLabel(row: Row | null | undefined) {
  return clean(row?.name || row?.site || row?.work_site_name || row?.object_name) || "Ohne Objekt";
}

function customerKeyForTask(task: Row, customersById: Map<string, Row>, sitesById: Map<string, Row>) {
  const customerId = clean(task.customer_id);
  if (customerId && customersById.has(customerId)) return `customer:${customerId}`;
  const siteId = clean(task.work_site_id);
  const site = siteId ? sitesById.get(siteId) : null;
  const siteCustomerId = clean(site?.customer_id);
  if (siteCustomerId && customersById.has(siteCustomerId)) return `customer:${siteCustomerId}`;
  const name = clean(task.customer_name) || clean(site?.customer_name) || clean(task.site) || "Ohne Kunde";
  return `name:${name.toLowerCase()}`;
}

function customerKeyForEntry(entry: Row, customersById: Map<string, Row>, sitesById: Map<string, Row>, sitesByName: Map<string, Row>) {
  const siteId = clean(entry.work_site_id);
  const site = siteId ? sitesById.get(siteId) : sitesByName.get(clean(entry.work_site_name).toLowerCase());
  const siteCustomerId = clean(site?.customer_id);
  if (siteCustomerId && customersById.has(siteCustomerId)) return `customer:${siteCustomerId}`;
  const name = clean(site?.customer_name) || clean(entry.customer_name) || clean(entry.work_site_name) || "Ohne Kunde";
  return `name:${name.toLowerCase()}`;
}

function customerKeyForReport(report: Row, customersByName: Map<string, Row>) {
  const label = clean(report.customer_name) || clean(report.work_site_name) || "Ohne Kunde";
  const customer = customersByName.get(label.toLowerCase());
  if (customer?.id) return `customer:${customer.id}`;
  return `name:${label.toLowerCase()}`;
}

function ensureCustomer(summary: Map<string, BillingCustomer>, key: string, source: Row | null | undefined) {
  if (!summary.has(key)) {
    const customerName = customerLabel(source) || clean(source?.customer_name) || clean(source?.work_site_name) || "Ohne Kunde";
    summary.set(key, {
      key,
      customerId: clean(source?.id) || null,
      customerName,
      customerNumber: clean(source?.customer_number) || null,
      address: customerAddress(source),
      taskCount: 0,
      doneTasks: 0,
      openTasks: 0,
      plannedMinutes: 0,
      actualMinutes: 0,
      billableMinutes: 0,
      signedReports: 0,
      employees: [],
      sites: [],
      warnings: [],
      tasks: [],
      timeEntries: [],
      serviceReports: []
    });
  }
  return summary.get(key)!;
}

function pushUnique(list: string[], value: unknown) {
  const text = clean(value);
  if (text && !list.includes(text)) list.push(text);
}

function summarizeEntryMinutes(entries: Row[]) {
  const sorted = entries
    .filter((entry) => entry.success !== false)
    .filter((entry) => entry.created_at)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const activeStart: Record<string, number | null> = {};
  let minutes = 0;

  for (const entry of sorted) {
    const action = clean(entry.action).toLowerCase();
    const time = new Date(entry.created_at).getTime();
    if (!Number.isFinite(time)) continue;
    const key = clean(entry.task_id) || `${clean(entry.employee_name)}|${clean(entry.work_site_id || entry.work_site_name)}`;

    if (["clock_in", "start", "check_in", "break_end", "pause_end"].includes(action)) {
      activeStart[key] = time;
    }

    if (["break_start", "pause_start", "clock_out", "end", "check_out"].includes(action) && activeStart[key]) {
      minutes += Math.max(0, Math.round((time - Number(activeStart[key])) / 60000));
      activeStart[key] = null;
    }
  }

  return minutes;
}

function csvEscape(value: unknown) {
  const text = clean(value).replace(/"/g, '""');
  return `"${text}"`;
}

function makeCsv(customers: BillingCustomer[], hourlyRate: number) {
  const header = ["Kunde", "Kundennummer", "Planstunden", "Iststunden", "Abrechenbare Stunden", "Stundensatz", "Netto", "Einsätze", "Offen", "Leistungsnachweise"];
  const rows = customers.map((customer) => {
    const billableHours = customer.billableMinutes / 60;
    const amount = billableHours * hourlyRate;
    return [
      customer.customerName,
      customer.customerNumber || "",
      (customer.plannedMinutes / 60).toFixed(2).replace(".", ","),
      (customer.actualMinutes / 60).toFixed(2).replace(".", ","),
      billableHours.toFixed(2).replace(".", ","),
      hourlyRate.toFixed(2).replace(".", ","),
      amount.toFixed(2).replace(".", ","),
      customer.taskCount,
      customer.openTasks,
      customer.signedReports
    ];
  });
  return [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
}

async function selectOptional(supabase: any, table: string, query: (client: any) => any) {
  try {
    const result = await query(supabase.from(table));
    if (result.error) {
      if (/does not exist|schema cache|Could not find/i.test(result.error.message || "")) return { data: [], error: null };
    }
    return result;
  } catch {
    return { data: [], error: null };
  }
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur Admins dürfen die Abrechnung öffnen." }, { status: 403 });

  const url = new URL(request.url);
  const { month, start, end, startIso, endIso } = monthRange(url.searchParams.get("month"));
  const customerFilter = clean(url.searchParams.get("customer"));
  const hourlyRate = numberValue(url.searchParams.get("hourlyRate"), 35);

  const [customersResult, sitesResult, tasksResult, entriesResult, reportsResult] = await Promise.all([
    auth.supabase.from("customers").select("*").order("name", { ascending: true }).limit(1000),
    auth.supabase.from("work_sites").select("*").order("name", { ascending: true }).limit(1000),
    auth.supabase.from("tasks").select("*").gte("task_date", start).lt("task_date", end).order("task_date", { ascending: true }).limit(5000),
    auth.supabase.from("time_entries").select("*").gte("created_at", startIso).lt("created_at", endIso).order("created_at", { ascending: true }).limit(10000),
    selectOptional(auth.supabase, "service_reports", (client) => client.select("*").gte("created_at", startIso).lt("created_at", endIso).order("created_at", { ascending: false }).limit(5000))
  ]);

  const firstError = customersResult.error || sitesResult.error || tasksResult.error || entriesResult.error || reportsResult.error;
  if (firstError) return NextResponse.json({ ok: false, error: firstError.message }, { status: 500 });

  const customers = (customersResult.data || []) as Row[];
  const sites = (sitesResult.data || []) as Row[];
  const tasks = (tasksResult.data || []) as Row[];
  const entries = (entriesResult.data || []) as Row[];
  const reports = (reportsResult.data || []) as Row[];

  const customersById = new Map(customers.filter((row) => clean(row.id)).map((row) => [clean(row.id), row]));
  const customersByName = new Map(customers.map((row) => [customerLabel(row).toLowerCase(), row]));
  const sitesById = new Map(sites.filter((row) => clean(row.id)).map((row) => [clean(row.id), row]));
  const sitesByName = new Map(sites.map((row) => [siteLabel(row).toLowerCase(), row]));
  const summary = new Map<string, BillingCustomer>();

  for (const customer of customers) {
    ensureCustomer(summary, `customer:${clean(customer.id)}`, customer);
  }

  for (const task of tasks) {
    const key = customerKeyForTask(task, customersById, sitesById);
    const customerId = key.startsWith("customer:") ? key.replace("customer:", "") : "";
    const customer = customersById.get(customerId);
    const item = ensureCustomer(summary, key, customer || { customer_name: clean(task.customer_name) || clean(task.site) });
    const minutes = taskMinutes(task);
    item.taskCount += 1;
    item.plannedMinutes += minutes;
    if (isDone(task)) item.doneTasks += 1;
    else item.openTasks += 1;
    item.tasks.push(task);
    pushUnique(item.employees, task.employee_name);
    pushUnique(item.sites, task.site || task.work_site_name);
  }

  const entriesByCustomer = new Map<string, Row[]>();
  for (const entry of entries) {
    const key = customerKeyForEntry(entry, customersById, sitesById, sitesByName);
    if (!entriesByCustomer.has(key)) entriesByCustomer.set(key, []);
    entriesByCustomer.get(key)!.push(entry);
  }

  for (const [key, customerEntries] of entriesByCustomer.entries()) {
    const customerId = key.startsWith("customer:") ? key.replace("customer:", "") : "";
    const customer = customersById.get(customerId);
    const item = ensureCustomer(summary, key, customer || { customer_name: clean(customerEntries[0]?.customer_name) || clean(customerEntries[0]?.work_site_name) });
    item.actualMinutes += summarizeEntryMinutes(customerEntries);
    item.timeEntries.push(...customerEntries);
    for (const entry of customerEntries) {
      pushUnique(item.employees, entry.employee_name);
      pushUnique(item.sites, entry.work_site_name || entry.site);
      const distance = numberValue(entry.distance_m, 0);
      const radius = numberValue(entry.allowed_radius_m, 0);
      if (distance > 0 && radius > 0 && distance > radius) pushUnique(item.warnings, "GPS-Abstand außerhalb Radius");
    }
  }

  for (const report of reports) {
    const key = customerKeyForReport(report, customersByName);
    const customerId = key.startsWith("customer:") ? key.replace("customer:", "") : "";
    const customer = customersById.get(customerId);
    const item = ensureCustomer(summary, key, customer || { customer_name: clean(report.customer_name), work_site_name: clean(report.work_site_name) });
    item.signedReports += 1;
    item.serviceReports.push(report);
    pushUnique(item.employees, report.employee_name);
    pushUnique(item.sites, report.work_site_name);
  }

  const customersOut = Array.from(summary.values())
    .map((customer) => {
      const missingReports = Math.max(0, customer.doneTasks - customer.signedReports);
      if (missingReports > 0) customer.warnings.push(`${missingReports} erledigte Einsätze ohne Leistungsnachweis`);
      if (customer.openTasks > 0) customer.warnings.push(`${customer.openTasks} offene Einsätze im Monat`);
      customer.billableMinutes = customer.actualMinutes > 0 ? customer.actualMinutes : customer.plannedMinutes;
      customer.employees.sort((a, b) => a.localeCompare(b, "de"));
      customer.sites.sort((a, b) => a.localeCompare(b, "de"));
      customer.warnings = Array.from(new Set(customer.warnings));
      return customer;
    })
    .filter((customer) => !customerFilter || customer.key === customerFilter || customer.customerName.toLowerCase().includes(customerFilter.toLowerCase()))
    .filter((customer) => customer.taskCount > 0 || customer.actualMinutes > 0 || customer.signedReports > 0)
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "de"));

  const totals = customersOut.reduce(
    (acc, customer) => {
      acc.taskCount += customer.taskCount;
      acc.doneTasks += customer.doneTasks;
      acc.openTasks += customer.openTasks;
      acc.plannedMinutes += customer.plannedMinutes;
      acc.actualMinutes += customer.actualMinutes;
      acc.billableMinutes += customer.billableMinutes;
      acc.signedReports += customer.signedReports;
      acc.netAmount += (customer.billableMinutes / 60) * hourlyRate;
      return acc;
    },
    { taskCount: 0, doneTasks: 0, openTasks: 0, plannedMinutes: 0, actualMinutes: 0, billableMinutes: 0, signedReports: 0, netAmount: 0 }
  );

  return NextResponse.json({
    ok: true,
    month,
    start,
    end,
    hourlyRate,
    customers: customersOut,
    totals,
    csv: makeCsv(customersOut, hourlyRate)
  });
}
