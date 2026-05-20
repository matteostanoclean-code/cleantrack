"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Tab = "home" | "schedule" | "clock" | "timesheet" | "tasks" | "menu";
type ClockStatus = "idle" | "working" | "break";

type Employee = {
  id: string;
  auth_user_id?: string | null;
  name: string;
  email?: string | null;
  role?: string | null;
  active?: boolean | null;
  phone?: string | null;
  avatar_url?: string | null;
  monthly_hour_limit?: number | null;
  monthly_hours?: number | null;
  vacation_days?: number | null;
  annual_vacation_days?: number | null;
};

type RawTask = {
  id: string;
  title?: string | null;
  site?: string | null;
  employee_name?: string | null;
  task_date?: string | null;
  done?: boolean | null;
  created_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  max_minutes?: number | null;
  work_site_id?: string | null;
  planned_minutes?: number | null;
  notes?: string | null;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  task_type?: string | null;
  task_category?: string | null;
  paid_minutes?: number | null;
  wage_minutes?: number | null;
  break_minutes?: number | null;
  quality_required?: boolean | null;
  quality_photo_required?: boolean | null;
};

type RawTimeEntry = {
  id: string;
  employee_name?: string | null;
  employee_id?: string | null;
  work_site_id?: string | null;
  work_site_name?: string | null;
  action?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_m?: number | null;
  allowed_radius_m?: number | null;
  success?: boolean | null;
  error_message?: string | null;
  created_at?: string | null;
  expected_start_time?: string | null;
};

type Absence = {
  id: string;
  employee_name?: string | null;
  request_type?: string | null;
  absence_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  reason?: string | null;
  status?: string | null;
  created_at?: string | null;
  admin_response?: string | null;
};

type Notification = {
  id: string;
  title?: string | null;
  message?: string | null;
  employee_name?: string | null;
  work_site_name?: string | null;
  object_name?: string | null;
  site?: string | null;
  read?: boolean | null;
  status?: string | null;
  notification_type?: string | null;
  created_at?: string | null;
  overtime_minutes?: number | null;
};

type EmployeeWorkSite = {
  id: string;
  employee_name?: string | null;
  work_site_id?: string | null;
  site_name?: string | null;
  active?: boolean | null;
  created_at?: string | null;
};

type AppData = {
  ok: boolean;
  error?: string;
  isAdmin?: boolean;
  employees: Employee[];
  employee: Employee | null;
  tasks: RawTask[];
  timeEntries: RawTimeEntry[];
  absences: Absence[];
  notifications: Notification[];
  employeeWorkSites: EmployeeWorkSite[];
};

type TimeEntry = {
  id: string;
  day: string;
  start: string;
  end?: string;
  site: string;
  status: "approved" | "open" | "sick" | "missing";
  minutes: number;
  note: string;
};

type Assignment = {
  id: string;
  time: string;
  title: string;
  address: string;
  customer: string;
  tag: string;
  priority: "normal" | "overdue" | "urgent";
  duration: string;
  done: boolean;
  date?: string | null;
  workSiteId?: string | null;
  raw?: RawTask;
};

const demoAssignments: Assignment[] = [
  {
    id: "a1",
    time: "08:00 - 12:00",
    title: "Nexus Hub Station",
    address: "402 Innovation Way, EG",
    customer: "Facility Maintenance",
    tag: "Deep Cleaning",
    priority: "overdue",
    duration: "4h",
    done: false,
    date: new Date().toISOString().slice(0, 10)
  },
  {
    id: "a2",
    time: "13:30 - 15:00",
    title: "Silverline Towers",
    address: "Am Markt 5, Flur 14-16",
    customer: "Routine Inspection",
    tag: "Kontrolle",
    priority: "normal",
    duration: "1.5h",
    done: false,
    date: new Date().toISOString().slice(0, 10)
  }
];

const starterEntries: TimeEntry[] = [
  {
    id: "t1",
    day: "Mo 23",
    start: "08:00",
    end: "17:00",
    site: "Demo-Objekt · Gebäudereinigung",
    status: "approved",
    minutes: 510,
    note: "Demo"
  }
];

const tabFromProp = (value?: string): Tab => {
  if (value === "schedule" || value === "clock" || value === "timesheet" || value === "tasks") return value;
  if (value === "search" || value === "chat" || value === "profile" || value === "material" || value === "admin") return "menu";
  return "home";
};

const two = (value: number) => String(value).padStart(2, "0");
const todayIso = () => new Date().toISOString().slice(0, 10);
const timeNow = () => `${two(new Date().getHours())}:${two(new Date().getMinutes())}`;

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
}

function minutesToHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

function safeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit" }).format(date).replace(".", "");
}

function monthLabel() {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date());
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return value;
}

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    clock_in: "Eingestempelt",
    break_start: "Pause gestartet",
    break_end: "Pause beendet",
    clock_out: "Ausgestempelt"
  };
  return labels[action || ""] || action || "Zeit erfasst";
}

function normalizePriority(task: RawTask): Assignment["priority"] {
  const priority = `${task.priority || ""}`.toLowerCase();
  const status = `${task.status || ""}`.toLowerCase();
  const dueDate = task.due_date || task.task_date;
  if (priority.includes("urgent") || priority.includes("hoch") || priority.includes("dring")) return "urgent";
  if (!task.done && dueDate && dueDate < todayIso()) return "overdue";
  if (status.includes("overdue")) return "overdue";
  return "normal";
}

function taskDuration(task: RawTask) {
  const minutes = task.planned_minutes || task.max_minutes || task.paid_minutes || task.wage_minutes || 0;
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes}m`;
  return `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}h`;
}

function taskTime(task: RawTask) {
  const start = formatTime(task.start_time);
  const end = formatTime(task.end_time);
  if (start !== "—" && end !== "—") return `${start} - ${end}`;
  if (start !== "—") return start;
  return "Zeit offen";
}

function assignmentFromTask(task: RawTask): Assignment {
  return {
    id: task.id,
    time: taskTime(task),
    title: task.title || task.task_type || "Einsatz",
    address: task.site || task.customer_name || "Objekt ohne Adresse",
    customer: task.customer_name || task.task_category || task.status || "Gebäudereinigung",
    tag: task.task_category || task.task_type || "Aufgabe",
    priority: normalizePriority(task),
    duration: taskDuration(task),
    done: Boolean(task.done),
    date: task.task_date,
    workSiteId: task.work_site_id,
    raw: task
  };
}

function assignmentsFromTasks(tasks: RawTask[]) {
  return tasks.map(assignmentFromTask);
}

function groupTimeEntries(entries: RawTimeEntry[]): TimeEntry[] {
  const groups = new Map<string, RawTimeEntry[]>();
  const sorted = [...entries].filter((entry) => entry.created_at).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  for (const entry of sorted) {
    const day = (entry.created_at || "").slice(0, 10);
    const site = entry.work_site_name || "Ohne Objekt";
    const key = `${day}-${site}`;
    const current = groups.get(key) || [];
    current.push(entry);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, rows]) => {
      const firstClockIn = rows.find((row) => row.action === "clock_in") || rows[0];
      const lastClockOut = [...rows].reverse().find((row) => row.action === "clock_out");
      const startTime = firstClockIn?.created_at ? new Date(firstClockIn.created_at).getTime() : 0;
      const endTime = lastClockOut?.created_at ? new Date(lastClockOut.created_at).getTime() : 0;
      const minutes = startTime && endTime && endTime > startTime ? Math.round((endTime - startTime) / 60000) : 0;
      const day = key.slice(0, 10);
      return {
        id: key,
        day: dateLabel(day),
        start: firstClockIn?.created_at ? formatTime(firstClockIn.created_at) : "—",
        end: lastClockOut?.created_at ? formatTime(lastClockOut.created_at) : "",
        site: rows[0]?.work_site_name || "Ohne Objekt",
        status: lastClockOut ? "open" : "missing",
        minutes,
        note: lastClockOut ? "Gespeichert" : "Noch offen"
      } satisfies TimeEntry;
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

function dailyWorkedSeconds(entries: RawTimeEntry[]) {
  const today = todayIso();
  const rows = entries
    .filter((entry) => entry.created_at?.slice(0, 10) === today)
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  let seconds = 0;
  let clockIn: number | null = null;
  let breakStart: number | null = null;

  for (const row of rows) {
    const timestamp = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (!timestamp) continue;
    if (row.action === "clock_in" || row.action === "break_end") {
      clockIn = timestamp;
      breakStart = null;
    }
    if (row.action === "break_start" && clockIn) {
      seconds += Math.max(0, Math.round((timestamp - clockIn) / 1000));
      breakStart = timestamp;
      clockIn = null;
    }
    if (row.action === "clock_out" && clockIn) {
      seconds += Math.max(0, Math.round((timestamp - clockIn) / 1000));
      clockIn = null;
      breakStart = null;
    }
    if (row.action === "clock_out" && breakStart) {
      breakStart = null;
    }
  }

  if (clockIn) seconds += Math.max(0, Math.round((Date.now() - clockIn) / 1000));
  return seconds;
}

function latestClock(entries: RawTimeEntry[]) {
  const latest = [...entries].filter((entry) => entry.action).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
  if (!latest) return { status: "idle" as ClockStatus, startedAt: null as number | null };
  if (latest.action === "clock_in" || latest.action === "break_end") return { status: "working" as ClockStatus, startedAt: latest.created_at ? new Date(latest.created_at).getTime() : null };
  if (latest.action === "break_start") return { status: "break" as ClockStatus, startedAt: latest.created_at ? new Date(latest.created_at).getTime() : null };
  return { status: "idle" as ClockStatus, startedAt: null as number | null };
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10.5Z",
    calendar: "M7 2v3M17 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l4 2",
    sheet: "M6 3h9l3 3v15H6V3Zm8 0v4h4M8.5 11h7M8.5 15h7M8.5 19h4",
    tasks: "M9 11l2 2 4-5M5 6h14M5 12h2M5 18h14",
    menu: "M4 6h16M4 12h16M4 18h16",
    bell: "M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0",
    map: "M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Zm0 0V3m6 18V6",
    plus: "M12 5v14M5 12h14",
    shield: "M12 3l7 3v5c0 5-3 9-7 10-4-1-7-5-7-10V6l7-3Z",
    box: "M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10",
    chat: "M21 12a8 8 0 0 1-8 8H6l-3 3v-6.5A8 8 0 1 1 21 12Z",
    user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
  };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.home} />
    </svg>
  );
}

function AppShell({ children, active, setActive }: { children: React.ReactNode; active: Tab; setActive: (tab: Tab) => void }) {
  const nav: Array<{ key: Tab; label: string; icon: string }> = [
    { key: "home", label: "Home", icon: "home" },
    { key: "timesheet", label: "Zeiten", icon: "sheet" },
    { key: "schedule", label: "Plan", icon: "calendar" },
    { key: "clock", label: "Stempel", icon: "clock" },
    { key: "menu", label: "Mehr", icon: "menu" }
  ];

  return (
    <main className="phone-bg min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-5">
      <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-[430px] overflow-hidden rounded-[2rem] border border-blue-500/30 bg-slate-950 shadow-2xl shadow-blue-950/40">
        <div className="relative flex min-h-[calc(100vh-2rem)] flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
          <Header />
          <section className="flex-1 overflow-y-auto px-4 pb-28 pt-3">{children}</section>
          <nav className="absolute bottom-4 left-1/2 z-40 grid w-[calc(100%-1.5rem)] max-w-[430px] -translate-x-1/2 grid-cols-5 rounded-3xl border border-slate-800 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
            {nav.map((item) => {
              const selected = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] transition ${selected ? "bg-blue-600 text-white shadow-glow" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-2xl border border-blue-500/40 bg-blue-500/10 text-lg">🧼</div>
          <div>
            <p className="text-sm font-bold tracking-wide text-slate-100">CleanTrack Pro</p>
            <p className="text-[11px] text-slate-500">Mobile Team-App</p>
          </div>
        </div>
        <button className="rounded-2xl border border-slate-800 bg-slate-900 p-2 text-blue-200">
          <Icon name="bell" />
        </button>
      </div>
    </header>
  );
}

function MetricCard({ title, value, caption, accent }: { title: string; value: string; caption: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-2 text-2xl font-black ${accent || "text-slate-50"}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const angle = Math.round((percent / 100) * 360);
  return (
    <div className="relative grid h-16 w-16 place-items-center rounded-full" style={{ background: `conic-gradient(#2563eb ${angle}deg, #1e293b 0deg)` }}>
      <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-950 text-xs font-bold text-blue-100">{percent}%</div>
    </div>
  );
}

function EmployeeSelect({ employees, employeeName, onChange }: { employees: Employee[]; employeeName: string; onChange: (name: string) => void }) {
  if (!employees.length) return null;
  return (
    <select
      value={employeeName}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm font-bold text-blue-100 outline-none"
    >
      {employees.map((employee) => (
        <option key={employee.id} value={employee.name}>{employee.name}</option>
      ))}
    </select>
  );
}

function Dashboard({ data, assignments, setActive, employeeName, onEmployeeChange }: { data: AppData | null; assignments: Assignment[]; setActive: (tab: Tab) => void; employeeName: string; onEmployeeChange: (name: string) => void }) {
  const employee = data?.employee;
  const todayTasks = assignments.filter((assignment) => assignment.date === todayIso());
  const doneToday = todayTasks.filter((assignment) => assignment.done).length;
  const progress = todayTasks.length ? Math.round((doneToday / todayTasks.length) * 100) : 0;
  const todaySeconds = dailyWorkedSeconds(data?.timeEntries || []);
  const todayHours = todaySeconds / 3600;
  const nextAssignment = todayTasks.find((assignment) => !assignment.done) || assignments.find((assignment) => !assignment.done) || assignments[0];
  const latestActivity = data?.timeEntries?.slice(0, 3) || [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <p className="text-2xl font-black tracking-tight">Hallo, {employee?.name || "Team"}</p>
          <p className="text-xs text-slate-400">Heute: {todayTasks.length} Einsätze · {doneToday} erledigt.</p>
        </div>
        {data?.isAdmin ? <EmployeeSelect employees={data?.employees || []} employeeName={employeeName} onChange={onEmployeeChange} /> : null}
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Tagesfortschritt</p>
            <p className="mt-1 text-3xl font-black text-white">{todayHours.toFixed(1)}h</p>
            <p className="text-xs text-slate-400">gearbeitet · {doneToday}/{todayTasks.length || 0} Einsätze erledigt</p>
          </div>
          <ProgressRing percent={progress} />
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-800">
          <div className="h-2 rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Daten live aus Supabase · {monthLabel()}</p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Nächster Einsatz</h2>
          <button onClick={() => setActive("schedule")} className="text-xs font-semibold text-blue-300">Plan ansehen</button>
        </div>
        {nextAssignment ? (
          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-800/80">
            <div className="flex gap-3 p-4">
              <div className="min-w-0 flex-1">
                <span className="rounded-md bg-blue-500/20 px-2 py-1 text-[11px] font-semibold text-blue-200">{dateLabel(nextAssignment.date)} · {nextAssignment.time}</span>
                <h3 className="mt-3 font-black">{nextAssignment.title}</h3>
                <p className="mt-1 text-xs text-slate-400">{nextAssignment.address}</p>
              </div>
              <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-blue-300 via-slate-700 to-slate-950 shadow-inner" />
            </div>
            <div className="grid grid-cols-2 border-t border-slate-700 text-sm">
              <button className="flex items-center justify-center gap-2 py-3 text-blue-100"><Icon name="map" />Route</button>
              <button className="flex items-center justify-center gap-2 py-3 text-blue-100"><Icon name="shield" />Info</button>
            </div>
          </div>
        ) : (
          <EmptyCard title="Kein Einsatz gefunden" text="Für diesen Mitarbeiter gibt es aktuell keinen Einsatz im abgefragten Zeitraum." />
        )}
      </section>

      <section>
        <h2 className="mb-2 font-bold">Schnellaktionen</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setActive("tasks")} className="rounded-3xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-blue-600">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-200"><Icon name="tasks" /></div>
            <p className="font-bold">Aufgaben</p>
            <p className="text-xs text-slate-400">Heute abhaken</p>
          </button>
          <button onClick={() => setActive("clock")} className="rounded-3xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-blue-600">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-200"><Icon name="clock" /></div>
            <p className="font-bold">Stempeln</p>
            <p className="text-xs text-slate-400">Zeit erfassen</p>
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 font-bold">Heutige Aktivität</h2>
        <div className="space-y-3 text-sm">
          {latestActivity.length ? latestActivity.map((entry) => (
            <Activity key={entry.id} label={`${actionLabel(entry.action)} · ${entry.work_site_name || "Ohne Objekt"}`} time={entry.created_at ? new Date(entry.created_at).toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—"} />
          )) : <p className="text-sm text-slate-500">Heute noch keine Aktivität.</p>}
        </div>
      </section>
    </div>
  );
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="font-black text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function Activity({ label, time }: { label: string; time: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
      <div>
        <p className="font-semibold text-slate-100">{label}</p>
        <p className="text-xs text-slate-500">{time}</p>
      </div>
    </div>
  );
}

function Schedule({ assignments }: { assignments: Assignment[] }) {
  const days = Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const todays = assignments.filter((assignment) => assignment.date === todayIso());
  const focus = todays[0] || assignments[0];
  const nextAssignments = assignments.filter((assignment) => assignment.id !== focus?.id).slice(0, 8);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Einsatzplan</h1>
        <p className="text-xs text-slate-400">Echte Einsätze aus Supabase</p>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {days.map((day, index) => (
          <button key={day} className={`min-w-16 rounded-2xl border p-3 text-sm ${index === 0 ? "border-blue-500 bg-blue-600 text-white" : "border-slate-800 bg-slate-900 text-slate-300"}`}>
            <span className="block text-[10px] uppercase text-slate-400">{dateLabel(day).split(" ")[0]}</span>
            <span className="text-lg font-black">{dateLabel(day).split(" ")[1] || ""}</span>
          </button>
        ))}
      </div>

      {focus ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">Heute im Fokus</h2>
            <span className="rounded-md bg-blue-500/15 px-2 py-1 text-[10px] font-bold uppercase text-blue-300">{focus.done ? "Erledigt" : "Offen"}</span>
          </div>
          <AssignmentCard assignment={focus} featured />
        </section>
      ) : <EmptyCard title="Keine Einsätze" text="In der Tabelle tasks wurden für diesen Mitarbeiter keine passenden Einträge gefunden." />}

      <section>
        <h2 className="mb-2 font-bold">Nächste Einsätze</h2>
        <div className="space-y-3">
          {nextAssignments.length ? nextAssignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />) : <p className="text-sm text-slate-500">Keine weiteren Einsätze.</p>}
        </div>
      </section>
    </div>
  );
}

function AssignmentCard({ assignment, featured }: { assignment: Assignment; featured?: boolean }) {
  const priorityColor = assignment.priority === "urgent" ? "bg-orange-400" : assignment.priority === "overdue" ? "bg-red-400" : "bg-blue-400";
  return (
    <article className={`rounded-3xl border border-slate-800 ${featured ? "bg-slate-800" : "bg-slate-900/70"} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-blue-200">{dateLabel(assignment.date)} · {assignment.time}</p>
          <h3 className="mt-2 font-black text-white">{assignment.title}</h3>
          <p className="mt-1 text-xs text-slate-400">{assignment.address}</p>
        </div>
        <span className="rounded-full bg-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200">{assignment.duration}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-lg bg-blue-500/15 px-2 py-1 text-[11px] font-semibold text-blue-200">{assignment.tag}</span>
        <span className="rounded-lg bg-slate-700/70 px-2 py-1 text-[11px] text-slate-300">{assignment.customer}</span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400"><span className={`h-2 w-2 rounded-full ${priorityColor}`} />{assignment.done ? "Erledigt" : assignment.priority === "normal" ? "Normal" : assignment.priority === "urgent" ? "Dringend" : "Überfällig"}</div>
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Öffnen</button>
      </div>
    </article>
  );
}

function Clock({ data, authToken, onReload }: { data: AppData | null; authToken: string; onReload: () => Promise<void> }) {
  const [status, setStatus] = useState<ClockStatus>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const assignments = useMemo(() => assignmentsFromTasks(data?.tasks || []), [data?.tasks]);
  const sites = useMemo(() => {
    const fromAssignments = assignments.map((assignment) => ({ workSiteId: assignment.workSiteId || null, siteName: assignment.address || assignment.title }));
    const fromEmployeeSites = (data?.employeeWorkSites || []).filter((site) => site.active !== false).map((site) => ({ workSiteId: site.work_site_id || null, siteName: site.site_name || "Objekt" }));
    const combined = [...fromAssignments, ...fromEmployeeSites].filter((site) => site.siteName);
    const unique = new Map<string, { workSiteId: string | null; siteName: string }>();
    combined.forEach((site) => unique.set(`${site.workSiteId || ""}-${site.siteName}`, site));
    return Array.from(unique.values());
  }, [assignments, data?.employeeWorkSites]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const latest = latestClock(data?.timeEntries || []);
    setStatus(latest.status);
    setStartedAt(latest.startedAt);
  }, [data?.timeEntries]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!startedAt || status === "idle") {
        setSeconds(dailyWorkedSeconds(data?.timeEntries || []));
        return;
      }
      setSeconds(dailyWorkedSeconds(data?.timeEntries || []));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, status, data?.timeEntries]);

  async function stamp(action: "clock_in" | "break_start" | "break_end" | "clock_out") {
    if (!data?.employee) return;
    setSaving(true);
    setMessage(null);
    const selectedSite = sites[selectedIndex] || null;
    try {
      const response = await fetch("/api/mobile/time-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          employeeName: data.employee.name,
          employeeId: data.employee.id,
          action,
          workSiteId: selectedSite?.workSiteId || null,
          workSiteName: selectedSite?.siteName || assignments[0]?.title || "Ohne Objekt"
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Speichern fehlgeschlagen");
      setMessage("Gespeichert.");
      await onReload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  const statusText = status === "working" ? "In Arbeit" : status === "break" ? "Pause läuft" : "Bereit";
  const selectedSiteName = sites[selectedIndex]?.siteName || assignments[0]?.title || "Kein Objekt gewählt";
  const latestTwo = (data?.timeEntries || []).slice(0, 4);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Stempeluhr</h1>
        <p className="text-xs text-slate-400">Speichert direkt in time_entries</p>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-center">
        <div className="flex items-center justify-between text-xs">
          <div className="text-left">
            <p className="uppercase tracking-wide text-slate-500">Status</p>
            <p className="font-bold text-blue-200">• {statusText}</p>
          </div>
          <div className="text-right">
            <p className="uppercase tracking-wide text-slate-500">Heute</p>
            <p className="font-bold text-blue-100">{minutesToHours(Math.round(seconds / 60))}</p>
          </div>
        </div>
        <p className="mt-8 text-5xl font-black tracking-[0.15em] text-blue-100">{formatDuration(seconds)}</p>
        <p className="mt-2 text-sm italic text-slate-400">{selectedSiteName}</p>
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-left text-xs">
          <div>
            <p className="font-bold text-slate-100">Supabase aktiv</p>
            <p className="text-slate-500">Aktionen werden als Zeit-Einträge gespeichert</p>
          </div>
          <span className="grid h-7 w-7 place-items-center rounded-full border border-blue-500 text-blue-300">✓</span>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Aktueller Einsatz</p>
        <select value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
          {sites.length ? sites.map((site, index) => <option key={`${site.workSiteId || "site"}-${site.siteName}`} value={index}>{site.siteName}</option>) : <option>Kein Objekt gefunden</option>}
        </select>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {status === "idle" ? (
            <button disabled={saving || !data?.employee} onClick={() => stamp("clock_in")} className="col-span-2 rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-50">Einstempeln</button>
          ) : (
            <>
              {status === "break" ? (
                <button disabled={saving} onClick={() => stamp("break_end")} className="rounded-2xl bg-blue-600 py-4 font-black text-white disabled:opacity-50">Pause beenden</button>
              ) : (
                <button disabled={saving} onClick={() => stamp("break_start")} className="rounded-2xl bg-slate-800 py-4 font-black text-white disabled:opacity-50">Pause</button>
              )}
              <button disabled={saving} onClick={() => stamp("clock_out")} className="rounded-2xl bg-red-600 py-4 font-black text-white disabled:opacity-50">Ausstempeln</button>
            </>
          )}
        </div>
        {message && <p className="mt-3 rounded-xl bg-slate-950 px-3 py-2 text-xs text-blue-100">{message}</p>}
      </section>

      <section>
        <h2 className="mb-2 font-bold">Timeline</h2>
        <div className="space-y-2">
          {latestTwo.length ? latestTwo.map((entry) => (
            <Timeline key={entry.id} label={actionLabel(entry.action)} details={entry.work_site_name || "Ohne Objekt"} time={entry.created_at ? formatTime(entry.created_at) : "—"} />
          )) : <p className="text-sm text-slate-500">Noch keine Stempelzeit vorhanden.</p>}
        </div>
      </section>
    </div>
  );
}

function Timeline({ label, details, time }: { label: string; details: string; time: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-200"><Icon name="clock" /></div>
        <div>
          <p className="font-bold">{label}</p>
          <p className="text-xs text-slate-500">{details}</p>
        </div>
      </div>
      <p className="font-black text-blue-100">{time}</p>
    </div>
  );
}

function Timesheet({ entries, absences }: { entries: TimeEntry[]; absences: Absence[] }) {
  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.minutes, 0), [entries]);
  const vacationCount = absences.filter((absence) => `${absence.request_type || absence.absence_type || ""}`.toLowerCase().includes("urlaub")).length;
  const sickCount = absences.filter((absence) => `${absence.request_type || absence.absence_type || ""}`.toLowerCase().includes("krank")).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Stundenzettel</h1>
          <p className="text-xs text-slate-400">{monthLabel()}</p>
        </div>
        <div className="flex gap-2">
          <button className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-blue-200">‹</button>
          <button className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-blue-200">›</button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Arbeitsstunden</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-black text-white">{minutesToHours(total)}</p>
            <p className="text-xs text-slate-400">aus time_entries berechnet</p>
          </div>
          <div className="h-16 flex-1 rounded-2xl bg-slate-950 p-3">
            <div className="mt-8 h-2 rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.round((total / (168 * 60)) * 100))}%` }} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard title="Urlaub" value={`${vacationCount}`} caption="Anträge" accent="text-blue-100" />
        <MetricCard title="Krank" value={`${sickCount}`} caption="Meldungen" accent="text-red-200" />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Tageseinträge</h2>
          <button className="text-xs font-semibold text-blue-300">Filter</button>
        </div>
        <div className="space-y-2">
          {entries.length ? entries.map((entry) => <TimeRow key={entry.id} entry={entry} />) : <EmptyCard title="Noch keine Zeiten" text="Sobald gestempelt wird, erscheinen die Einträge hier." />}
        </div>
      </section>
    </div>
  );
}

function TimeRow({ entry }: { entry: TimeEntry }) {
  const status = {
    approved: "Freigegeben",
    open: "Offen",
    sick: "Krank",
    missing: "Fehlt"
  }[entry.status];
  const badgeClass = entry.status === "approved" ? "bg-emerald-400/15 text-emerald-300" : entry.status === "open" ? "bg-yellow-400/15 text-yellow-300" : entry.status === "sick" ? "bg-red-400/15 text-red-300" : "bg-slate-700 text-slate-300";
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3">
        <div className="text-center text-xs text-slate-500">{entry.day}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-blue-100">{entry.start}{entry.end ? ` - ${entry.end}` : ""}</p>
            <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${badgeClass}`}>{status}</span>
          </div>
          <p className="truncate text-xs text-slate-500">{entry.site}</p>
        </div>
        <p className="text-lg font-black text-blue-100">{entry.minutes ? minutesToHours(entry.minutes) : "—"}</p>
      </div>
    </article>
  );
}

function Tasks({ tasks, authToken, onReload }: { tasks: RawTask[]; authToken: string; onReload: () => Promise<void> }) {
  const [savingId, setSavingId] = useState<string | null>(null);
  async function toggleTask(task: RawTask, done: boolean) {
    setSavingId(task.id);
    try {
      const response = await fetch("/api/mobile/task", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id: task.id, done })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Aufgabe konnte nicht gespeichert werden.");
      await onReload();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Aufgaben</h1>
        <p className="text-xs text-slate-400">tasks-Tabelle live abhaken</p>
      </div>
      <div className="space-y-3">
        {tasks.length ? tasks.map((task) => (
          <label key={task.id} className="flex items-center gap-3 rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <input type="checkbox" checked={Boolean(task.done)} disabled={savingId === task.id} onChange={(event) => toggleTask(task, event.target.checked)} className="h-5 w-5 accent-blue-600" />
            <div className="min-w-0">
              <p className="font-black">{task.title || "Aufgabe"}</p>
              <p className="truncate text-xs text-slate-500">{dateLabel(task.task_date)} · {task.site || task.customer_name || "Ohne Objekt"}</p>
            </div>
          </label>
        )) : <EmptyCard title="Keine Aufgaben gefunden" text="Für diesen Mitarbeiter gibt es aktuell keine Aufgaben im Zeitraum." />}
      </div>
    </div>
  );
}

function Menu({ data, employeeName, onEmployeeChange, onLogout }: { data: AppData | null; employeeName: string; onEmployeeChange: (name: string) => void; onLogout: () => Promise<void> }) {
  const items = [
    ["Material melden", "Nächster Schritt: material_reports anbinden", "box"],
    ["Abwesenheit", `${data?.absences?.length || 0} vorhandene Anträge`, "calendar"],
    ["Chat", `${data?.notifications?.length || 0} Meldungen / Benachrichtigungen`, "chat"],
    ["Profil", data?.employee?.email || "Stammdaten", "user"]
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Mehr</h1>
        <p className="text-xs text-slate-400">Weitere Funktionen für den Arbeitsalltag</p>
      </div>
      {data?.isAdmin ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Admin-Auswahl</p>
          <EmployeeSelect employees={data?.employees || []} employeeName={employeeName} onChange={onEmployeeChange} />
          <p className="mt-3 text-xs text-slate-500">Nur Admins dürfen Mitarbeiter wechseln.</p>
        </section>
      ) : (
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Angemeldet als</p>
          <p className="font-black text-blue-100">{data?.employee?.name || employeeName}</p>
          <p className="mt-1 text-xs text-slate-500">Die App lädt automatisch nur die eigenen Einsätze und Zeiten.</p>
        </section>
      )}
      <div className="space-y-3">
        {items.map(([title, subtitle, icon]) => (
          <button key={title} className="flex w-full items-center gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-blue-600">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/15 text-blue-200"><Icon name={icon} /></div>
            <div className="min-w-0">
              <p className="font-black">{title}</p>
              <p className="truncate text-xs text-slate-500">{subtitle}</p>
            </div>
          </button>
        ))}
        <button onClick={onLogout} className="w-full rounded-3xl border border-red-500/30 bg-red-500/10 p-4 text-left font-black text-red-100">Abmelden</button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-800 border-t-blue-500" />
        <p className="font-black">Lade echte Daten…</p>
        <p className="mt-1 text-sm text-slate-500">Supabase wird verbunden.</p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-4">
        <p className="font-black text-red-100">Daten konnten nicht geladen werden</p>
        <p className="mt-2 text-sm text-red-100/80">{error}</p>
      </div>
      <button onClick={onRetry} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white">Erneut laden</button>
      <p className="text-xs text-slate-500">Prüfe in Vercel die Variablen NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY.</p>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw new Error(loginError.message);
      const token = data.session?.access_token;
      if (!token) throw new Error("Login erfolgreich, aber Session fehlt.");
      await onLogin(token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="phone-bg min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-5">
      <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-[430px] overflow-hidden rounded-[2rem] border border-blue-500/30 bg-slate-950 shadow-2xl shadow-blue-950/40">
        <div className="flex min-h-[calc(100vh-2rem)] flex-col justify-center bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-5 py-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-blue-500/40 bg-blue-500/10 text-3xl">🧼</div>
            <h1 className="text-3xl font-black">CleanTrack Pro</h1>
            <p className="mt-2 text-sm text-slate-400">Mit Mitarbeiter-Login anmelden</p>
          </div>

          <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">E-Mail</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="name@firma.de" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Passwort</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="Passwort" />
            </label>
            {error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
            <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Melde an…" : "Anmelden"}</button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">Der Login wird mit Supabase Auth geprüft. Danach werden nur die passenden Mitarbeiter-Daten geladen.</p>
        </div>
      </div>
    </main>
  );
}

export default function MitarbeiterApp({ initialTab = "home" }: { initialTab?: string }) {
  const [active, setActive] = useState<Tab>(() => tabFromProp(initialTab));
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [authToken, setAuthToken] = useState("");

  const loadData = useCallback(async (name?: string, tokenOverride?: string) => {
    const token = tokenOverride || authToken;
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const storedName = typeof window !== "undefined" ? window.localStorage.getItem("cleantrack-employee-name") || "" : "";
      const wantedName = name || employeeName || storedName;
      const query = wantedName ? `?employee=${encodeURIComponent(wantedName)}` : "";
      const response = await fetch(`/api/mobile/bootstrap${query}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Supabase konnte nicht geladen werden.");
      setData(result);
      const selectedName = result.employee?.name || result.employees?.[0]?.name || "";
      setEmployeeName(selectedName);
      if (selectedName && typeof window !== "undefined") window.localStorage.setItem("cleantrack-employee-name", selectedName);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [authToken, employeeName]);

  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      try {
        const supabase = getSupabaseBrowser();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || "";
        if (!mounted) return;
        setAuthToken(token);
        setAuthLoading(false);
        if (token) await loadData(undefined, token);
        else setLoading(false);
      } catch (initError) {
        if (!mounted) return;
        setError(initError instanceof Error ? initError.message : "Login konnte nicht geprüft werden.");
        setAuthLoading(false);
        setLoading(false);
      }
    }
    initAuth();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(token: string) {
    setAuthToken(token);
    await loadData(undefined, token);
  }

  async function handleLogout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    if (typeof window !== "undefined") window.localStorage.removeItem("cleantrack-employee-name");
    setAuthToken("");
    setEmployeeName("");
    setData(null);
    setError(null);
    setActive("home");
  }

  async function handleEmployeeChange(name: string) {
    if (!data?.isAdmin) return;
    setEmployeeName(name);
    if (typeof window !== "undefined") window.localStorage.setItem("cleantrack-employee-name", name);
    await loadData(name);
  }

  const assignments = useMemo(() => assignmentsFromTasks(data?.tasks || []), [data?.tasks]);
  const timeEntries = useMemo(() => groupTimeEntries(data?.timeEntries || []), [data?.timeEntries]);

  if (authLoading) {
    return (
      <main className="phone-bg min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-5">
        <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[430px] place-items-center rounded-[2rem] border border-blue-500/30 bg-slate-950">
          <LoadingScreen />
        </div>
      </main>
    );
  }

  if (!authToken) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <AppShell active={active} setActive={setActive}>
      {loading && <LoadingScreen />}
      {!loading && error && <ErrorScreen error={error} onRetry={() => loadData()} />}
      {!loading && !error && (
        <>
          {active === "home" && <Dashboard data={data} assignments={assignments} setActive={setActive} employeeName={employeeName} onEmployeeChange={handleEmployeeChange} />}
          {active === "schedule" && <Schedule assignments={assignments} />}
          {active === "clock" && <Clock data={data} authToken={authToken} onReload={() => loadData(employeeName)} />}
          {active === "timesheet" && <Timesheet entries={timeEntries} absences={data?.absences || []} />}
          {active === "tasks" && <Tasks tasks={data?.tasks || []} authToken={authToken} onReload={() => loadData(employeeName)} />}
          {active === "menu" && <Menu data={data} employeeName={employeeName} onEmployeeChange={handleEmployeeChange} onLogout={handleLogout} />}
        </>
      )}
    </AppShell>
  );
}
