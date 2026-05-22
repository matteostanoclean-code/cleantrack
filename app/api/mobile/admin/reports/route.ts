import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function monthRange(monthParam: string | null) {
  const fallback = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(monthParam || "") ? String(monthParam) : fallback;
  const start = `${month}-01`;
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);
  return { month, start, end, startIso: `${start}T00:00:00.000Z`, endIso: `${end}T00:00:00.000Z` };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrZero(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function successful(entry: AnyRow) {
  return entry?.success !== false;
}

function isOpenTask(task: AnyRow) {
  const status = clean(task.status).toLowerCase();
  return !task.done && status !== "done" && status !== "erledigt" && status !== "completed";
}

function summarizeTimeEntries(entries: AnyRow[]) {
  const rows = [...entries]
    .filter(successful)
    .filter((entry) => entry.created_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const byEmployee = new Map<string, { employeeName: string; minutes: number; days: Set<string>; openSessions: number; pauses: number; distanceWarnings: number }>();
  const bySite = new Map<string, { siteName: string; minutes: number; entries: number; distanceWarnings: number }>();

  let totalMinutes = 0;
  let openSessions = 0;
  let distanceWarnings = 0;
  let activeStart: Record<string, number | null> = {};
  let activeBreak: Record<string, number | null> = {};

  for (const entry of rows) {
    const employeeName = clean(entry.employee_name) || "Ohne Mitarbeiter";
    const siteName = clean(entry.work_site_name) || clean(entry.site) || "Ohne Objekt";
    const taskKey = clean(entry.task_id) || `${employeeName}-${siteName}`;
    const timestamp = new Date(entry.created_at).getTime();
    const day = String(entry.created_at).slice(0, 10);
    const action = clean(entry.action);
    const key = `${employeeName}|${taskKey}`;

    if (!byEmployee.has(employeeName)) {
      byEmployee.set(employeeName, { employeeName, minutes: 0, days: new Set<string>(), openSessions: 0, pauses: 0, distanceWarnings: 0 });
    }
    if (!bySite.has(siteName)) {
      bySite.set(siteName, { siteName, minutes: 0, entries: 0, distanceWarnings: 0 });
    }

    const employeeSummary = byEmployee.get(employeeName)!;
    const siteSummary = bySite.get(siteName)!;
    employeeSummary.days.add(day);
    siteSummary.entries += 1;

    const distance = numberOrZero(entry.distance_m);
    const radius = numberOrZero(entry.allowed_radius_m);
    if (distance > 0 && radius > 0 && distance > radius) {
      distanceWarnings += 1;
      employeeSummary.distanceWarnings += 1;
      siteSummary.distanceWarnings += 1;
    }

    if (action === "clock_in" || action === "break_end") {
      activeStart[key] = timestamp;
      activeBreak[key] = null;
    }

    if (action === "break_start" && activeStart[key]) {
      const minutes = Math.max(0, Math.round((timestamp - Number(activeStart[key])) / 60000));
      totalMinutes += minutes;
      employeeSummary.minutes += minutes;
      siteSummary.minutes += minutes;
      employeeSummary.pauses += 1;
      activeStart[key] = null;
      activeBreak[key] = timestamp;
    }

    if (action === "clock_out" && activeStart[key]) {
      const minutes = Math.max(0, Math.round((timestamp - Number(activeStart[key])) / 60000));
      totalMinutes += minutes;
      employeeSummary.minutes += minutes;
      siteSummary.minutes += minutes;
      activeStart[key] = null;
      activeBreak[key] = null;
    }
  }

  for (const [key, start] of Object.entries(activeStart)) {
    if (start) {
      openSessions += 1;
      const employeeName = key.split("|")[0] || "Ohne Mitarbeiter";
      const employeeSummary = byEmployee.get(employeeName);
      if (employeeSummary) employeeSummary.openSessions += 1;
    }
  }

  return {
    totalMinutes,
    openSessions,
    distanceWarnings,
    byEmployee: Array.from(byEmployee.values()).map((item) => ({ ...item, days: item.days.size })).sort((a, b) => b.minutes - a.minutes),
    bySite: Array.from(bySite.values()).sort((a, b) => b.minutes - a.minutes)
  };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur Admins dürfen die Auswertung öffnen." }, { status: 403 });

  const url = new URL(request.url);
  const { month, start, end, startIso, endIso } = monthRange(url.searchParams.get("month"));
  const employee = clean(url.searchParams.get("employee"));

  let timeQuery = auth.supabase
    .from("time_entries")
    .select("*")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: true })
    .limit(5000);

  let taskQuery = auth.supabase
    .from("tasks")
    .select("*")
    .gte("task_date", start)
    .lt("task_date", end)
    .order("task_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(5000);

  if (employee) {
    timeQuery = timeQuery.eq("employee_name", employee);
    taskQuery = taskQuery.eq("employee_name", employee);
  }

  const [employees, entries, tasks, absences] = await Promise.all([
    auth.supabase.from("employee_profiles").select("id, name, email, role, active, monthly_hour_limit, vacation_days, annual_vacation_days").order("name", { ascending: true }).limit(250),
    timeQuery,
    taskQuery,
    auth.supabase.from("absence_requests").select("*").lte("start_date", end).gte("end_date", start).order("start_date", { ascending: true }).limit(1000)
  ]);

  const error = employees.error || entries.error || tasks.error || absences.error;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const timeEntries = entries.data || [];
  const taskRows = tasks.data || [];
  const absenceRows = absences.data || [];
  const summary = summarizeTimeEntries(timeEntries);
  const plannedMinutes = taskRows.reduce((sum: number, task: AnyRow) => sum + numberOrZero(task.planned_minutes || task.max_minutes || task.paid_minutes || task.wage_minutes), 0);
  const openTasks = taskRows.filter(isOpenTask).length;
  const doneTasks = taskRows.length - openTasks;

  return NextResponse.json({
    ok: true,
    month,
    start,
    end,
    employees: employees.data || [],
    timeEntries,
    tasks: taskRows,
    absences: absenceRows,
    summary: {
      ...summary,
      plannedMinutes,
      taskCount: taskRows.length,
      doneTasks,
      openTasks,
      absenceCount: absenceRows.length
    }
  });
}
