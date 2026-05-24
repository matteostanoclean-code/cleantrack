"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Tab = "home" | "schedule" | "taskdetail" | "clock" | "timesheet" | "tasks" | "menu" | "material" | "absence" | "chat" | "profile" | "quality" | "notifications" | "dayclose" | "route" | "objects" | "issue" | "service" | "push";
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
  hourly_rate?: number | null;
  vacation_days?: number | null;
  annual_vacation_days?: number | null;
  birthday?: string | null;
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
  quality_checklist?: string[] | null;
};

type RawTimeEntry = {
  id: string;
  task_id?: string | null;
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
  task_id?: string | null;
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
  task_id?: string | null;
  employee_name?: string | null;
  work_site_id?: string | null;
  site_name?: string | null;
  active?: boolean | null;
  created_at?: string | null;
};

type WorkSite = {
  id: string;
  name?: string | null;
  site?: string | null;
  object_name?: string | null;
  site_name?: string | null;
  address?: string | null;
  customer_name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  lon?: number | string | null;
  allowed_radius_m?: number | string | null;
  radius_m?: number | string | null;
  gps_required?: boolean | null;
  active?: boolean | null;
};

type ClockSite = {
  workSiteId: string | null;
  siteName: string;
  latitude: number | null;
  longitude: number | null;
  allowedRadiusM: number | null;
  gpsRequired: boolean;
};

type ChatMessage = {
  id: string;
  task_id?: string | null;
  employee_name?: string | null;
  sender_name?: string | null;
  sender_role?: string | null;
  message?: string | null;
  body?: string | null;
  text?: string | null;
  status?: string | null;
  todo_status?: string | null;
  read_by_admin?: boolean | null;
  read_by_employee?: boolean | null;
  created_at?: string | null;
};

type MaterialProduct = {
  id: string;
  name?: string | null;
  category?: string | null;
  unit?: string | null;
  current_stock?: number | null;
  min_stock?: number | null;
  minimum_stock?: number | null;
  work_site_id?: string | null;
  object_name?: string | null;
  supplier?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type MaterialReport = {
  id: string;
  task_id?: string | null;
  employee_name?: string | null;
  material_id?: string | null;
  material_product_id?: string | null;
  material_name?: string | null;
  product_name?: string | null;
  work_site_id?: string | null;
  object_name?: string | null;
  site?: string | null;
  quantity?: number | null;
  quantity_requested?: number | null;
  message?: string | null;
  comment?: string | null;
  notes?: string | null;
  status?: string | null;
  photo_urls?: string[] | null;
  photo_count?: number | null;
  created_at?: string | null;
};

type CleaningPlan = {
  id: string;
  name?: string | null;
  customer_name?: string | null;
  work_site_id?: string | null;
  site_name?: string | null;
  description?: string | null;
  comments?: string | null;
  status?: string | null;
  template_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CleaningPlanItem = {
  id: string;
  plan_id?: string | null;
  area?: string | null;
  task_title?: string | null;
  task_description?: string | null;
  interval_type?: string | null;
  weekdays?: string[] | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  active?: boolean | null;
  sort_order?: number | null;
  calculation_minutes?: number | null;
};

type QualityReport = {
  id: string;
  task_id?: string | null;
  employee_name?: string | null;
  work_site_id?: string | null;
  work_site_name?: string | null;
  checked_items?: string[] | null;
  notes?: string | null;
  status?: string | null;
  photo_urls?: string[] | null;
  photo_count?: number | null;
  created_at?: string | null;
};

type ServiceReport = {
  id: string;
  task_id?: string | null;
  employee_profile_id?: string | null;
  employee_name?: string | null;
  work_site_id?: string | null;
  work_site_name?: string | null;
  customer_name?: string | null;
  signer_name?: string | null;
  signature_url?: string | null;
  notes?: string | null;
  status?: string | null;
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
  chatMessages: ChatMessage[];
  materialProducts: MaterialProduct[];
  materialReports: MaterialReport[];
  employeeWorkSites: EmployeeWorkSite[];
  workSites: WorkSite[];
  cleaningPlans: CleaningPlan[];
  cleaningPlanItems: CleaningPlanItem[];
  qualityReports: QualityReport[];
  serviceReports: ServiceReport[];
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
  if (value === "schedule" || value === "taskdetail" || value === "clock" || value === "timesheet" || value === "tasks" || value === "material" || value === "absence" || value === "chat" || value === "profile" || value === "quality" || value === "notifications" || value === "dayclose" || value === "route" || value === "objects" || value === "issue" || value === "service" || value === "push") return value;
  if (value === "search" || value === "admin") return "menu";
  return "home";
};

const two = (value: number) => String(value).padStart(2, "0");
const todayIso = () => new Date().toISOString().slice(0, 10);

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

function formatDateOnly(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function birthdayInfo(employee?: Employee | null) {
  const raw = employee?.birthday;
  if (!raw) return null;
  const parts = String(raw).slice(0, 10).split("-").map(Number);
  if (parts.length < 3 || !parts[1] || !parts[2]) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), parts[1] - 1, parts[2]);
  if (next < todayStart) next = new Date(today.getFullYear() + 1, parts[1] - 1, parts[2]);
  const daysUntil = Math.round((next.getTime() - todayStart.getTime()) / 86400000);
  return {
    date: formatDateOnly(raw),
    daysUntil,
    isToday: daysUntil === 0,
    nextLabel: daysUntil === 0 ? "Heute" : daysUntil === 1 ? "Morgen" : `in ${daysUntil} Tagen`
  };
}

function moneyPerHour(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(2).replace(".", ",")} €/h`;
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return value;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function getSiteLatitude(site?: WorkSite | null) {
  return numberOrNull(site?.latitude ?? site?.lat);
}

function getSiteLongitude(site?: WorkSite | null) {
  return numberOrNull(site?.longitude ?? site?.lng ?? site?.lon);
}

function getSiteRadius(site?: WorkSite | null) {
  return numberOrNull(site?.allowed_radius_m ?? site?.radius_m) ?? 150;
}

function getBrowserPosition(): Promise<{ latitude: number; longitude: number; accuracy: number | null }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS wird auf diesem Gerät nicht unterstützt."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null
      }),
      (error) => {
        const messages: Record<number, string> = {
          1: "Standort wurde blockiert. Bitte Standortfreigabe im Browser erlauben.",
          2: "Standort konnte nicht ermittelt werden.",
          3: "Standort-Ermittlung hat zu lange gedauert."
        };
        reject(new Error(messages[error.code] || "GPS-Standort konnte nicht gelesen werden."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
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

function isSuccessfulTimeEntry(entry: RawTimeEntry) {
  return entry.success !== false;
}

function unreadCountFromData(data: AppData | null) {
  if (!data) return 0;
  const unreadNotifications = (data.notifications || []).filter((item) => item.read === false || String(item.status || "open").toLowerCase() === "open").length;
  const unreadChats = (data.chatMessages || []).filter((item) => String(item.sender_role || "").toLowerCase() === "admin" && item.read_by_employee === false).length;
  const pendingAbsences = (data.absences || []).filter((item) => ["approved", "rejected"].includes(String(item.status || "").toLowerCase()) && item.admin_response).length;
  return unreadNotifications + unreadChats + pendingAbsences;
}

function notificationTone(item: Notification) {
  const text = `${item.notification_type || ""} ${item.status || ""} ${item.title || ""}`.toLowerCase();
  if (text.includes("reject") || text.includes("abgelehnt") || text.includes("gps") || text.includes("warning")) return "border-red-500/30 bg-red-500/10 text-red-100";
  if (text.includes("approved") || text.includes("genehmigt") || text.includes("done") || text.includes("erledigt")) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  return "border-blue-500/25 bg-blue-500/10 text-blue-100";
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
  const sorted = [...entries].filter((entry) => entry.created_at && isSuccessfulTimeEntry(entry)).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

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
    .filter((entry) => isSuccessfulTimeEntry(entry) && entry.created_at?.slice(0, 10) === today)
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
  const latest = [...entries].filter((entry) => entry.action && isSuccessfulTimeEntry(entry)).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
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
    user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
    building: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M3 21h18M8 7h2M8 11h2M8 15h2M14 9h3M14 13h3M14 17h3"
  };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.home} />
    </svg>
  );
}

function AppShell({ children, active, setActive, unreadCount = 0 }: { children: React.ReactNode; active: Tab; setActive: (tab: Tab) => void; unreadCount?: number }) {
  const nav: Array<{ key: Tab; label: string; icon: string }> = [
    { key: "home", label: "Home", icon: "home" },
    { key: "timesheet", label: "Zeiten", icon: "sheet" },
    { key: "schedule", label: "Plan", icon: "calendar" },
    { key: "clock", label: "Stempel", icon: "clock" },
    { key: "menu", label: "Mehr", icon: "menu" }
  ];

  return (
    <main className="phone-bg h-[100dvh] overflow-hidden bg-slate-950 px-3 py-3 text-slate-50 sm:px-5">
      <div className="mx-auto h-full max-h-[calc(100dvh-1.5rem)] max-w-[430px] overflow-hidden rounded-[2rem] border border-blue-500/30 bg-slate-950 shadow-2xl shadow-blue-950/40">
        <div className="relative flex h-full min-h-0 flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
          <Header unreadCount={unreadCount} onOpenNotifications={() => setActive("notifications")} />
          <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-3">{children}</section>
          <nav className="absolute bottom-3 left-1/2 z-40 grid w-[calc(100%-1.5rem)] max-w-[430px] -translate-x-1/2 grid-cols-5 rounded-3xl border border-slate-800 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
            {nav.map((item) => {
              const selected = active === item.key || (item.key === "schedule" && active === "taskdetail") || (item.key === "menu" && ["material", "absence", "chat", "profile", "quality", "notifications", "dayclose", "route", "objects", "issue", "service", "push"].includes(active));
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

function Header({ unreadCount = 0, onOpenNotifications }: { unreadCount?: number; onOpenNotifications: () => void }) {
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
        <button onClick={onOpenNotifications} className="relative rounded-2xl border border-slate-800 bg-slate-900 p-2 text-blue-200" aria-label="Benachrichtigungen öffnen">
          <Icon name="bell" />
          {unreadCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
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

function Dashboard({ data, assignments, setActive, employeeName, onEmployeeChange, onOpenAssignment }: { data: AppData | null; assignments: Assignment[]; setActive: (tab: Tab) => void; employeeName: string; onEmployeeChange: (name: string) => void; onOpenAssignment: (assignment: Assignment) => void }) {
  const employee = data?.employee;
  const todayTasks = assignments.filter((assignment) => assignment.date === todayIso());
  const doneToday = todayTasks.filter((assignment) => assignment.done).length;
  const progress = todayTasks.length ? Math.round((doneToday / todayTasks.length) * 100) : 0;
  const todaySeconds = dailyWorkedSeconds(data?.timeEntries || []);
  const todayHours = todaySeconds / 3600;
  const futureAssignments = assignments.filter((assignment) => (assignment.date || "") >= todayIso()).sort((a, b) => `${a.date || "9999-12-31"}-${a.raw?.start_time || "99:99"}`.localeCompare(`${b.date || "9999-12-31"}-${b.raw?.start_time || "99:99"}`));
  const nextAssignment = todayTasks.find((assignment) => !assignment.done) || futureAssignments.find((assignment) => !assignment.done) || futureAssignments[0];
  const latestActivity = (data?.timeEntries || []).filter(isSuccessfulTimeEntry).slice(0, 3);
  const birthday = birthdayInfo(employee);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <p className="text-2xl font-black tracking-tight">Hallo, {employee?.name || "Team"}</p>
          <p className="text-xs text-slate-400">Heute: {todayTasks.length} Einsätze · {doneToday} erledigt.</p>
        </div>
        {data?.isAdmin ? <EmployeeSelect employees={data?.employees || []} employeeName={employeeName} onChange={onEmployeeChange} /> : null}
      </div>

      {birthday?.isToday ? (
        <section className="rounded-3xl border border-pink-500/30 bg-pink-500/10 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-pink-200">Geburtstag</p>
          <h2 className="mt-1 text-xl font-black text-white">Alles Gute zum Geburtstag, {employee?.name?.split(" ")[0] || "Team"}! 🎉</h2>
          <p className="mt-1 text-sm text-pink-100/80">Ich wünsche dir einen starken Tag, Gesundheit und viele gute Momente.</p>
        </section>
      ) : birthday && birthday.daysUntil <= 14 ? (
        <section className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-blue-200">Geburtstag</p>
          <p className="mt-1 text-sm text-blue-100">Dein Geburtstag ist {birthday.nextLabel} · {birthday.date}</p>
        </section>
      ) : null}

      <button onClick={() => setActive("timesheet")} className="block w-full rounded-3xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-blue-600">
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
        <p className="mt-3 text-[11px] text-slate-400">Antippen öffnet die Tageszeiten · {monthLabel()}</p>
      </button>

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
              <a href={mapSearchUrl(nextAssignment.raw || null)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-3 text-blue-100"><Icon name="map" />Route</a>
              <button onClick={() => onOpenAssignment(nextAssignment)} className="flex items-center justify-center gap-2 py-3 text-blue-100"><Icon name="calendar" />Termin</button>
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

function Schedule({ assignments, onOpenAssignment }: { assignments: Assignment[]; onOpenAssignment: (assignment: Assignment) => void }) {
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  const futureAssignments = useMemo(() => assignments
    .filter((assignment) => (assignment.date || "") >= todayIso())
    .sort((a, b) => `${a.date || "9999-12-31"}-${a.raw?.start_time || "99:99"}`.localeCompare(`${b.date || "9999-12-31"}-${b.raw?.start_time || "99:99"}`)), [assignments]);

  const selectedAssignments = futureAssignments.filter((assignment) => assignment.date === selectedDay);
  const doneSelected = selectedAssignments.filter((assignment) => assignment.done).length;
  const openSelected = selectedAssignments.length - doneSelected;
  const plannedMinutes = selectedAssignments.reduce((sum, assignment) => sum + Number(assignment.raw?.planned_minutes || assignment.raw?.max_minutes || assignment.raw?.paid_minutes || assignment.raw?.wage_minutes || 0), 0);
  const upcomingAssignments = futureAssignments.filter((assignment) => assignment.date !== selectedDay).slice(0, 6);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Einsatzplan</h1>
        <p className="text-xs text-slate-400">Nur heute und kommende Einsätze.</p>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const selected = day === selectedDay;
          const count = futureAssignments.filter((assignment) => assignment.date === day).length;
          return (
            <button key={day} onClick={() => setSelectedDay(day)} className={`min-w-16 rounded-2xl border p-3 text-sm ${selected ? "border-blue-500 bg-blue-600 text-white" : "border-slate-800 bg-slate-900 text-slate-300"}`}>
              <span className="block text-[10px] uppercase text-slate-400">{dateLabel(day).split(" ")[0]}</span>
              <span className="text-lg font-black">{dateLabel(day).split(" ")[1] || ""}</span>
              <span className="mt-1 block text-[10px] text-slate-400">{count} Einsatz{count === 1 ? "" : "e"}</span>
            </button>
          );
        })}
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-black">Tagesübersicht</h2>
            <p className="text-xs text-slate-500">{dateLabel(selectedDay)}</p>
          </div>
          <span className="rounded-full bg-blue-500/15 px-3 py-1 text-[11px] font-black text-blue-200">{openSelected} offen</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Einsätze</p>
            <p className="mt-1 text-xl font-black text-white">{selectedAssignments.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Erledigt</p>
            <p className="mt-1 text-xl font-black text-emerald-200">{doneSelected}</p>
          </div>
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Geplant</p>
            <p className="mt-1 text-xl font-black text-blue-100">{plannedMinutes ? minutesToHours(plannedMinutes) : "—"}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Einsätze an diesem Tag</h2>
          <span className="text-xs text-slate-500">{selectedAssignments.length} gefunden</span>
        </div>
        <div className="space-y-3">
          {selectedAssignments.length ? selectedAssignments.map((assignment, index) => <AssignmentCard key={assignment.id} assignment={assignment} featured={index === 0} onOpenAssignment={onOpenAssignment} />) : <EmptyCard title="Keine Einsätze an diesem Tag" text="Wähle oben einen anderen Tag oder lege im Admin-Dashboard einen neuen Termin an." />}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Kommende Einsätze</h2>
        <div className="space-y-3">
          {upcomingAssignments.length ? upcomingAssignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} onOpenAssignment={onOpenAssignment} />) : <p className="text-sm text-slate-500">Keine weiteren kommenden Einsätze.</p>}
        </div>
      </section>
    </div>
  );
}

function AssignmentCard({ assignment, featured, onOpenAssignment }: { assignment: Assignment; featured?: boolean; onOpenAssignment?: (assignment: Assignment) => void }) {
  const priorityColor = assignment.priority === "urgent" ? "bg-orange-400" : assignment.priority === "overdue" ? "bg-red-400" : "bg-blue-400";
  return (
    <article className={`rounded-3xl border border-slate-800 ${featured ? "bg-slate-800" : "bg-slate-900/70"} p-4`}>
      <button onClick={() => onOpenAssignment?.(assignment)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-xs font-bold text-blue-200">{dateLabel(assignment.date)} · {assignment.time}</p>
          <h3 className="mt-2 font-black text-white">{assignment.title}</h3>
          <p className="mt-1 text-xs text-slate-400">{assignment.address}</p>
        </div>
        <span className="rounded-full bg-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200">{assignment.duration}</span>
      </button>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-lg bg-blue-500/15 px-2 py-1 text-[11px] font-semibold text-blue-200">{assignment.tag}</span>
        <span className="rounded-lg bg-slate-700/70 px-2 py-1 text-[11px] text-slate-300">{assignment.customer}</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-400"><span className={`h-2 w-2 rounded-full ${priorityColor}`} />{assignment.done ? "Erledigt" : assignment.priority === "normal" ? "Normal" : assignment.priority === "urgent" ? "Dringend" : "Überfällig"}</div>
        <div className="flex gap-2">
          <a href={mapSearchUrl(assignment.raw || null)} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-blue-100">Route</a>
          <button onClick={() => onOpenAssignment?.(assignment)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Termin</button>
        </div>
      </div>
    </article>
  );
}


function mapSearchUrl(task: RawTask | null) {
  const query = [task?.site, task?.customer_name, "Deutschland"].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "")}`;
}

function routeDestination(task: RawTask | null) {
  return [task?.site, task?.customer_name, "Deutschland"].filter(Boolean).join(" ");
}

function mapsDirectionsUrl(tasks: RawTask[]) {
  const destinations = tasks.map(routeDestination).filter(Boolean);
  if (!destinations.length) return "https://www.google.com/maps";
  if (destinations.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent("Current Location")}&destination=${encodeURIComponent(destinations[0])}`;
  }
  const destination = destinations[destinations.length - 1];
  const waypoints = destinations.slice(0, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent("Current Location")}&destination=${encodeURIComponent(destination)}&waypoints=${encodeURIComponent(waypoints)}`;
}

function taskEntriesForTask(entries: RawTimeEntry[], task: RawTask | null) {
  if (!task) return [];
  return entries
    .filter((entry) => isSuccessfulTimeEntry(entry) && (entry.task_id === task.id || (!entry.task_id && entry.work_site_id && task.work_site_id && entry.work_site_id === task.work_site_id && entry.created_at?.slice(0, 10) === task.task_date)))
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

function TaskDetail({ data, authToken, taskId, onBack, onOpenClock, onOpenQuality, onReload }: { data: AppData | null; authToken: string; taskId: string | null; onBack: () => void; onOpenClock: (task: RawTask) => void; onOpenQuality: (task: RawTask) => void; onReload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const task = useMemo(() => (data?.tasks || []).find((row) => row.id === taskId) || null, [data?.tasks, taskId]);
  const site = useMemo(() => task?.work_site_id ? (data?.workSites || []).find((row) => row.id === task.work_site_id) || null : null, [data?.workSites, task?.work_site_id]);
  const planItems = useMemo(() => planItemsForTask(data, task), [data, task]);
  const entries = useMemo(() => taskEntriesForTask(data?.timeEntries || [], task), [data?.timeEntries, task]);
  const hasClockIn = entries.some((entry) => entry.action === "clock_in");
  const hasClockOut = entries.some((entry) => entry.action === "clock_out");
  const siteHasGps = Boolean(site && getSiteLatitude(site) !== null && getSiteLongitude(site) !== null);

  async function toggleDone(done: boolean) {
    if (!task) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/task", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id: task.id, done })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Termin konnte nicht gespeichert werden.");
      setMessage(done ? "Termin wurde als erledigt markiert." : "Termin wurde wieder geöffnet.");
      await onReload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Termin konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  if (!task) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <EmptyCard title="Termin nicht gefunden" text="Bitte öffne den Einsatz noch einmal aus dem Einsatzplan." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BackButton onBack={onBack} />
        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${task.done ? "bg-emerald-500/15 text-emerald-200" : "bg-blue-500/15 text-blue-200"}`}>{task.done ? "Erledigt" : "Offen"}</span>
      </div>

      <section className="overflow-hidden rounded-3xl border border-blue-500/25 bg-slate-900/80">
        <div className="p-4">
          <p className="text-xs font-black uppercase tracking-wide text-blue-200">Termin</p>
          <h1 className="mt-2 text-2xl font-black text-white">{task.title || "Einsatz"}</h1>
          <p className="mt-2 text-sm text-slate-300">{task.site || task.customer_name || "Ohne Objekt"}</p>
          <p className="mt-1 text-xs text-slate-500">{task.customer_name || "Kunde offen"}</p>
        </div>
        <div className="grid grid-cols-3 border-t border-slate-800 text-center text-xs">
          <div className="p-3">
            <p className="text-slate-500">Datum</p>
            <p className="mt-1 font-black text-white">{dateLabel(task.task_date)}</p>
          </div>
          <div className="border-x border-slate-800 p-3">
            <p className="text-slate-500">Uhrzeit</p>
            <p className="mt-1 font-black text-white">{taskTime(task)}</p>
          </div>
          <div className="p-3">
            <p className="text-slate-500">Dauer</p>
            <p className="mt-1 font-black text-white">{taskDuration(task)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="font-black">Arbeitsablauf</h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-3">
            <span>1. Am Objekt einchecken</span>
            <span className={hasClockIn ? "font-black text-emerald-300" : "font-black text-slate-500"}>{hasClockIn ? "OK" : "offen"}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-3">
            <span>2. Reinigung / Aufgabe erledigen</span>
            <span className={task.done ? "font-black text-emerald-300" : "font-black text-slate-500"}>{task.done ? "OK" : "offen"}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-3">
            <span>3. Ausstempeln</span>
            <span className={hasClockOut ? "font-black text-emerald-300" : "font-black text-slate-500"}>{hasClockOut ? "OK" : "offen"}</span>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="font-black">Aktionen</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <a href={mapSearchUrl(task)} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-center text-sm font-black text-blue-100">Route öffnen</a>
          <button onClick={() => onOpenClock(task)} className="rounded-2xl bg-blue-600 px-3 py-3 text-sm font-black text-white shadow-glow">Stempeln</button>
          <button onClick={() => onOpenQuality(task)} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-black text-blue-100">Qualität</button>
          <button disabled={saving} onClick={() => toggleDone(!task.done)} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-black text-blue-100 disabled:opacity-60">{task.done ? "Wieder öffnen" : "Erledigt"}</button>
        </div>
        {message ? <p className="mt-3 rounded-2xl bg-slate-950 px-3 py-2 text-xs text-blue-100">{message}</p> : null}
      </section>

      <section className={`rounded-3xl border p-4 ${siteHasGps ? "border-emerald-500/30 bg-emerald-500/10" : "border-yellow-500/30 bg-yellow-500/10"}`}>
        <p className={`font-black ${siteHasGps ? "text-emerald-100" : "text-yellow-100"}`}>{siteHasGps ? "GPS-Prüfung bereit" : "GPS am Objekt fehlt"}</p>
        <p className={`mt-1 text-xs ${siteHasGps ? "text-emerald-100/80" : "text-yellow-100/80"}`}>
          {siteHasGps ? `Erlaubter Radius: ${getSiteRadius(site)} m.` : "Der Mitarbeiter-Standort wird gespeichert. Für eine harte Radius-Prüfung müssen im Admin-Dashboard die Objekt-Koordinaten gespeichert sein."}
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="font-black">Checkliste</h2>
        <div className="mt-3 space-y-2">
          {planItems.length ? planItems.slice(0, 8).map((item) => (
            <div key={item.id} className="rounded-2xl bg-slate-950 px-3 py-3 text-sm">
              <p className="font-bold text-slate-100">{item.task_title || item.area || "Aufgabe"}</p>
              {item.task_description ? <p className="mt-1 text-xs text-slate-500">{item.task_description}</p> : null}
            </div>
          )) : <p className="text-sm text-slate-500">Für diesen Einsatz ist noch keine Reinigungsplan-Checkliste hinterlegt.</p>}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="font-black">Zeitbuchungen zu diesem Termin</h2>
        <div className="mt-3 space-y-2">
          {entries.length ? entries.map((entry) => (
            <Timeline key={entry.id} label={actionLabel(entry.action)} details={`${entry.work_site_name || task.site || "Objekt"}${typeof entry.distance_m === "number" ? ` · ${entry.distance_m} m` : ""}`} time={entry.created_at ? formatTime(entry.created_at) : "—"} />
          )) : <p className="text-sm text-slate-500">Noch keine Buchung für diesen Termin.</p>}
        </div>
      </section>
    </div>
  );
}

function expectedStartIso(task: RawTask | null) {
  if (!task?.task_date || !task.start_time) return null;
  const value = `${task.task_date}T${task.start_time.length === 5 ? `${task.start_time}:00` : task.start_time}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function Clock({ data, authToken, onReload, selectedTaskId, onOpenSchedule }: { data: AppData | null; authToken: string; onReload: () => Promise<void>; selectedTaskId: string | null; onOpenSchedule: () => void }) {
  const [status, setStatus] = useState<ClockStatus>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastGps, setLastGps] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const assignments = useMemo(() => assignmentsFromTasks(data?.tasks || []), [data?.tasks]);
  const selectedTask = useMemo(() => (data?.tasks || []).find((task) => task.id === selectedTaskId) || null, [data?.tasks, selectedTaskId]);
  const selectedAssignment = useMemo(() => selectedTask ? assignmentFromTask(selectedTask) : null, [selectedTask]);
  const siteById = useMemo(() => new Map((data?.workSites || []).map((site) => [site.id, site])), [data?.workSites]);
  const selectedSite = selectedTask?.work_site_id ? siteById.get(selectedTask.work_site_id) || null : null;
  const selectedClockSite: ClockSite | null = selectedTask ? {
    workSiteId: selectedTask.work_site_id || null,
    siteName: selectedSite?.name || selectedSite?.site || selectedSite?.object_name || selectedSite?.site_name || selectedTask.site || selectedTask.customer_name || selectedTask.title || "Termin",
    latitude: getSiteLatitude(selectedSite),
    longitude: getSiteLongitude(selectedSite),
    allowedRadiusM: selectedSite ? getSiteRadius(selectedSite) : null,
    gpsRequired: selectedSite?.gps_required === true
  } : null;

  const selectedTaskEntries = useMemo(() => taskEntriesForTask(data?.timeEntries || [], selectedTask), [data?.timeEntries, selectedTask]);
  const statusText = status === "working" ? "In Arbeit" : status === "break" ? "Pause läuft" : "Bereit";
  const selectedSiteName = selectedClockSite?.siteName || "Kein Termin gewählt";
  const selectedSiteHasGps = Boolean(selectedClockSite && selectedClockSite.latitude !== null && selectedClockSite.longitude !== null);
  const latestTwo = selectedTaskEntries.slice(-4).reverse();

  useEffect(() => {
    const latest = latestClock(selectedTaskEntries);
    setStatus(latest.status);
    setStartedAt(latest.startedAt);
  }, [selectedTaskEntries]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds(dailyWorkedSeconds(data?.timeEntries || []));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, status, data?.timeEntries]);

  async function stamp(action: "clock_in" | "break_start" | "break_end" | "clock_out") {
    if (!data?.employee) return;
    if (!selectedTask) {
      setMessage("Bitte zuerst im Einsatzplan einen Termin öffnen. Manuelles Buchen ohne Termin ist gesperrt.");
      return;
    }
    if (!selectedTask.work_site_id) {
      setMessage("Dieser Termin hat kein Objekt. Bitte im Admin-Dashboard ein Objekt hinterlegen, erst dann kann gestempelt werden.");
      return;
    }
    if (!selectedSiteHasGps) {
      setMessage("Für dieses Objekt fehlen GPS-Koordinaten. Bitte im Admin-Dashboard beim Objekt den Standort speichern.");
      return;
    }

    setSaving(true);
    setLocating(true);
    setMessage("GPS-Standort wird geprüft…");
    let gps: { latitude: number; longitude: number; accuracy: number | null } | null = null;
    try {
      gps = await getBrowserPosition();
      setLastGps(gps);
    } catch (gpsError) {
      setLastGps(null);
      setMessage(gpsError instanceof Error ? gpsError.message : "GPS-Standort konnte nicht gelesen werden.");
      setSaving(false);
      setLocating(false);
      return;
    } finally {
      setLocating(false);
    }

    try {
      const response = await fetch("/api/mobile/time-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          taskId: selectedTask.id,
          employeeName: data.employee.name,
          employeeId: data.employee.id,
          action,
          latitude: gps?.latitude ?? null,
          longitude: gps?.longitude ?? null,
          accuracyM: gps?.accuracy ?? null,
          expectedStartTime: expectedStartIso(selectedTask)
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Speichern fehlgeschlagen");
      const distanceText = typeof result.distanceM === "number" ? ` · Entfernung ${result.distanceM} m` : "";
      setMessage(result.hasSiteGps ? `Gespeichert. GPS geprüft${distanceText}.` : "Gespeichert. GPS wurde gespeichert, am Objekt fehlen noch GPS-Koordinaten für die Radius-Prüfung.");
      await onReload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
      await onReload();
    } finally {
      setSaving(false);
      setLocating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Stempeluhr</h1>
        <p className="text-xs text-slate-400">Stempeln ist nur aus einem Termin heraus möglich.</p>
      </div>

      {!selectedTask ? (
        <section className="rounded-3xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p className="font-black text-yellow-100">Kein Termin ausgewählt</p>
          <p className="mt-2 text-sm text-yellow-100/80">Ich habe manuelle Buchungen gesperrt. Bitte öffne im Einsatzplan einen Termin und tippe dort auf „Stempeln“.</p>
          <button onClick={onOpenSchedule} className="mt-4 w-full rounded-2xl bg-blue-600 py-3 font-black text-white">Zum Einsatzplan</button>
        </section>
      ) : null}

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
        {selectedAssignment ? (
          <div className="mt-6 rounded-2xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-left text-xs text-blue-100">
            <p className="font-black">Aktiver Termin</p>
            <p className="mt-1">{dateLabel(selectedAssignment.date)} · {selectedAssignment.time} · {selectedAssignment.title}</p>
            <p className="mt-1 opacity-80">{selectedAssignment.customer}</p>
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-left text-xs">
            <div>
              <p className="font-bold text-slate-100">Manuelle Buchung gesperrt</p>
              <p className="text-slate-500">Kein Start ohne Termin.</p>
            </div>
            <span className="grid h-7 w-7 place-items-center rounded-full border border-yellow-500 text-yellow-300">!</span>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Termin-Standort</p>
        <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm font-semibold text-white">
          {selectedTask ? selectedSiteName : "Bitte Termin im Einsatzplan auswählen"}
        </div>
        {selectedTask ? (
          <div className={`mt-3 rounded-2xl border px-3 py-3 text-xs ${selectedSiteHasGps ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-100"}`}>
            <p className="font-black">{selectedSiteHasGps ? "Objekt-GPS aktiv" : selectedTask.work_site_id ? "Objekt-GPS fehlt noch" : "Termin hat kein Objekt"}</p>
            <p className="mt-1 opacity-80">
              {selectedSiteHasGps
                ? `Radius-Prüfung: ${selectedClockSite?.allowedRadiusM || 150} m erlaubt.`
                : selectedTask.work_site_id
                  ? "Stempeln ist gesperrt, bis im Admin-Dashboard die GPS-Koordinaten am Objekt gespeichert sind."
                  : "Bitte im Admin-Dashboard ein Objekt für diesen Termin auswählen, damit GPS sauber geprüft werden kann."}
            </p>
            {lastGps ? <p className="mt-1 opacity-70">Letzter Standort: Genauigkeit ca. {lastGps.accuracy || "—"} m</p> : null}
          </div>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {status === "idle" ? (
            <button disabled={saving || locating || !data?.employee || !selectedTask || !selectedTask.work_site_id || !selectedSiteHasGps} onClick={() => stamp("clock_in")} className="col-span-2 rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-50">{locating ? "GPS prüft…" : saving ? "Speichere…" : "Einstempeln"}</button>
          ) : (
            <>
              {status === "break" ? (
                <button disabled={saving || locating || !selectedTask || !selectedTask.work_site_id || !selectedSiteHasGps} onClick={() => stamp("break_end")} className="rounded-2xl bg-blue-600 py-4 font-black text-white disabled:opacity-50">{locating ? "GPS prüft…" : "Pause beenden"}</button>
              ) : (
                <button disabled={saving || locating || !selectedTask || !selectedTask.work_site_id || !selectedSiteHasGps} onClick={() => stamp("break_start")} className="rounded-2xl bg-slate-800 py-4 font-black text-white disabled:opacity-50">{locating ? "GPS prüft…" : "Pause"}</button>
              )}
              <button disabled={saving || locating || !selectedTask || !selectedTask.work_site_id || !selectedSiteHasGps} onClick={() => stamp("clock_out")} className="rounded-2xl bg-red-600 py-4 font-black text-white disabled:opacity-50">{locating ? "GPS prüft…" : "Ausstempeln"}</button>
            </>
          )}
        </div>
        {message && <p className="mt-3 rounded-xl bg-slate-950 px-3 py-2 text-xs text-blue-100">{message}</p>}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Timeline</h2>
          {!selectedTask && assignments.length ? <button onClick={onOpenSchedule} className="text-xs font-black text-blue-200">Termin wählen</button> : null}
        </div>
        <div className="space-y-2">
          {latestTwo.length ? latestTwo.map((entry) => (
            <Timeline key={entry.id} label={actionLabel(entry.action)} details={`${entry.work_site_name || "Ohne Objekt"}${typeof entry.distance_m === "number" ? ` · ${entry.distance_m} m` : ""}`} time={entry.created_at ? formatTime(entry.created_at) : "—"} />
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

function NotificationsScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const notifications = data?.notifications || [];
  const chatReplies = (data?.chatMessages || []).filter((item) => String(item.sender_role || "").toLowerCase() === "admin");
  const absenceUpdates = (data?.absences || []).filter((item) => ["approved", "rejected"].includes(String(item.status || "").toLowerCase()));
  const unread = unreadCountFromData(data);

  async function markAllRead() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ mode: "all", employeeName: data?.employee?.name || "" })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Meldungen konnten nicht gelesen markiert werden.");
      setMessage("Meldungen wurden als gelesen markiert.");
      await onReload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Meldungen konnten nicht gelesen markiert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Meldungen</h1>
          <p className="text-xs text-slate-400">Freigaben, Chat-Antworten und Systemhinweise</p>
        </div>
        <BackButton onBack={onBack} />
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Ungelesen</p>
            <p className="mt-1 text-3xl font-black text-white">{unread}</p>
            <p className="text-xs text-slate-400">für {data?.employee?.name || "Mitarbeiter"}</p>
          </div>
          <button disabled={saving || unread === 0} onClick={markAllRead} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Gelesen</button>
        </div>
        {message ? <p className="mt-3 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-blue-100">{message}</p> : null}
      </section>

      <section>
        <h2 className="mb-2 font-bold">Systemmeldungen</h2>
        <div className="space-y-3">
          {notifications.length ? notifications.map((item) => (
            <article key={item.id} className={`rounded-3xl border p-4 ${notificationTone(item)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black">{item.title || "Meldung"}</p>
                  <p className="mt-1 text-sm opacity-90">{item.message || item.work_site_name || item.object_name || "Neue Meldung"}</p>
                  <p className="mt-2 text-xs opacity-70">{item.created_at ? `${dateLabel(item.created_at.slice(0, 10))} · ${formatTime(item.created_at)}` : "—"}</p>
                </div>
                {item.read === false ? <span className="rounded-full bg-red-500 px-2 py-1 text-[10px] font-black text-white">neu</span> : null}
              </div>
            </article>
          )) : <EmptyCard title="Keine Systemmeldungen" text="Neue Admin-Hinweise und Freigaben erscheinen hier." />}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Chat-Antworten vom Büro</h2>
        <div className="space-y-3">
          {chatReplies.length ? chatReplies.slice(0, 8).map((item) => (
            <article key={item.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-blue-100">{item.sender_name || "Büro"}</p>
                  <p className="mt-1 text-sm text-slate-200">{item.message || item.body || item.text || "Neue Antwort"}</p>
                  <p className="mt-2 text-xs text-slate-500">{item.created_at ? `${dateLabel(item.created_at.slice(0, 10))} · ${formatTime(item.created_at)}` : "—"}</p>
                </div>
                {item.read_by_employee === false ? <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black text-white">neu</span> : null}
              </div>
            </article>
          )) : <EmptyCard title="Keine Chat-Antworten" text="Antworten vom Admin/Büro landen zusätzlich hier." />}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Abwesenheiten</h2>
        <div className="space-y-3">
          {absenceUpdates.length ? absenceUpdates.slice(0, 6).map((item) => (
            <article key={item.id} className={`rounded-3xl border p-4 ${String(item.status).toLowerCase() === "approved" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-red-500/30 bg-red-500/10 text-red-100"}`}>
              <p className="font-black">{String(item.status).toLowerCase() === "approved" ? "Genehmigt" : "Abgelehnt"}</p>
              <p className="mt-1 text-sm opacity-90">{item.start_date} bis {item.end_date} · {item.absence_type || item.request_type || "Abwesenheit"}</p>
              {item.admin_response ? <p className="mt-2 text-sm opacity-80">{item.admin_response}</p> : null}
            </article>
          )) : <EmptyCard title="Keine neuen Abwesenheitsmeldungen" text="Genehmigungen und Ablehnungen erscheinen hier." />}
        </div>
      </section>
    </div>
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
        {tasks.filter((task) => !task.task_date || task.task_date >= todayIso()).length ? tasks.filter((task) => !task.task_date || task.task_date >= todayIso()).map((task) => (
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

function BackButton({ onBack }: { onBack: () => void }) {
  return <button onClick={onBack} className="rounded-2xl border border-slate-800 px-4 py-2 text-sm font-bold text-blue-100">Zurück</button>;
}

function menuSites(data: AppData | null, tasks: RawTask[] = []) {
  const fromTasks = tasks.map((task) => ({ workSiteId: task.work_site_id || null, siteName: task.site || task.customer_name || "Objekt" }));
  const fromEmployeeSites = (data?.employeeWorkSites || []).filter((site) => site.active !== false).map((site) => ({ workSiteId: site.work_site_id || null, siteName: site.site_name || "Objekt" }));
  const combined = [...fromEmployeeSites, ...fromTasks].filter((site) => site.siteName);
  const unique = new Map<string, { workSiteId: string | null; siteName: string }>();
  combined.forEach((site) => unique.set(`${site.workSiteId || ""}-${site.siteName}`, site));
  return Array.from(unique.values());
}

function planForTask(data: AppData | null, task: RawTask | null) {
  if (!task?.work_site_id) return null;
  return (data?.cleaningPlans || []).find((plan) => plan.work_site_id === task.work_site_id) || null;
}

function planItemsForTask(data: AppData | null, task: RawTask | null) {
  const plan = planForTask(data, task);
  if (!plan) return [] as CleaningPlanItem[];
  return (data?.cleaningPlanItems || [])
    .filter((item) => item.plan_id === plan.id && item.active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function checklistLabels(data: AppData | null, task: RawTask | null) {
  const fromPlan = planItemsForTask(data, task).map((item) => [item.area, item.task_title, item.task_description].filter(Boolean).join(" · "));
  const fromTask = Array.isArray(task?.quality_checklist) ? task?.quality_checklist || [] : [];
  const base = [...fromPlan, ...fromTask].map((item) => String(item || "").trim()).filter(Boolean);
  if (base.length) return Array.from(new Set(base));
  return [
    "Sichtkontrolle durchgeführt",
    "Reinigungsleistung geprüft",
    "Material und Räume ordentlich hinterlassen"
  ];
}

function QualityScreen({ data, authToken, onBack, onReload, selectedTaskId }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void>; selectedTaskId?: string | null }) {
  const tasks = useMemo(() => {
    const rows = data?.tasks || [];
    return [...rows].sort((a, b) => `${a.done ? 1 : 0}-${a.task_date || ""}-${a.start_time || ""}`.localeCompare(`${b.done ? 1 : 0}-${b.task_date || ""}-${b.start_time || ""}`));
  }, [data?.tasks]);
  const [taskIndex, setTaskIndex] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedTask = tasks[taskIndex] || null;

  useEffect(() => {
    if (!selectedTaskId) return;
    const index = tasks.findIndex((task) => task.id === selectedTaskId);
    if (index >= 0) setTaskIndex(index);
  }, [selectedTaskId, tasks]);

  const selectedPlan = planForTask(data, selectedTask);
  const labels = useMemo(() => checklistLabels(data, selectedTask), [data, selectedTask]);
  const checkedLabels = labels.filter((label) => checked[label]);

  useEffect(() => {
    setChecked({});
    setNotes("");
    setPhotos([]);
    setMessage(null);
  }, [selectedTask?.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask) return;
    setSaving(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("taskId", selectedTask.id);
      formData.append("workSiteId", selectedTask.work_site_id || "");
      formData.append("workSiteName", selectedTask.site || selectedTask.customer_name || "Ohne Objekt");
      formData.append("checkedItems", JSON.stringify(checkedLabels));
      formData.append("notes", notes);
      photos.slice(0, 6).forEach((file) => formData.append("photos", file));

      const response = await fetch("/api/mobile/quality-report", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Qualitätsnachweis konnte nicht gespeichert werden.");
      setMessage(photos.length ? "Qualitätsnachweis mit Foto wurde gespeichert und an den Admin gesendet." : "Qualitätsnachweis wurde gespeichert und an den Admin gesendet.");
      await onReload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Qualitätsnachweis konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Qualitätsnachweis</h1>
          <p className="text-xs text-slate-400">Reinigungsplan prüfen und Einsatz abschließen</p>
        </div>
        <BackButton onBack={onBack} />
      </div>

      {tasks.length ? (
        <form onSubmit={submit} className="space-y-4">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Einsatz</span>
              <select value={taskIndex} onChange={(event) => setTaskIndex(Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
                {tasks.map((task, index) => (
                  <option key={task.id} value={index}>{dateLabel(task.task_date)} · {formatTime(task.start_time)} · {task.site || task.customer_name || task.title || "Einsatz"}</option>
                ))}
              </select>
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MetricCard title="Objekt" value={selectedTask?.site || "—"} caption={selectedTask?.customer_name || "Kunde offen"} accent="text-blue-100" />
              <MetricCard title="Plan" value={selectedPlan ? "aktiv" : "Standard"} caption={selectedPlan?.name || "Fallback-Checkliste"} accent="text-emerald-200" />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-black">Checkliste</h2>
                <p className="text-xs text-slate-500">{checkedLabels.length}/{labels.length} Punkte abgehakt</p>
              </div>
              <button type="button" onClick={() => setChecked(Object.fromEntries(labels.map((label) => [label, true])))} className="rounded-2xl border border-slate-700 px-3 py-2 text-xs font-black text-blue-100">Alle</button>
            </div>
            <div className="space-y-2">
              {labels.map((label) => (
                <label key={label} className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                  <input type="checkbox" checked={Boolean(checked[label])} onChange={(event) => setChecked((current) => ({ ...current, [label]: event.target.checked }))} className="mt-1 h-5 w-5 accent-blue-600" />
                  <span className="text-sm font-semibold text-slate-100">{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Notiz / Besonderheit</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="z.B. Schaden, Zugang war verschlossen, Zusatzarbeit erledigt" />
            </label>
            <div className="mt-4 space-y-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
              <div>
                <p className="text-sm font-black text-blue-100">Fotos hinzufügen</p>
                <p className="mt-1 text-xs text-slate-400">Bis zu 6 Bilder, z. B. Vorher/Nachher, Schaden oder fertiger Bereich.</p>
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(event) => {
                  const selected = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/")).slice(0, 6);
                  setPhotos(selected);
                }}
                className="block w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-xs text-slate-200 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
              />
              {photos.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="rounded-2xl border border-slate-700 bg-slate-950 p-2 text-center text-[11px] text-slate-300">
                      <div className="mb-1 text-lg">📷</div>
                      <p className="truncate">{file.name}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          {message && <p className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-blue-100">{message}</p>}
          <button disabled={saving || !selectedTask} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : "Nachweis senden & Einsatz abschließen"}</button>
        </form>
      ) : <EmptyCard title="Kein Einsatz für Nachweis" text="Sobald ein Einsatz in tasks vorhanden ist, kann hier ein Qualitätsnachweis erstellt werden." />}

      <section className="space-y-2">
        <h2 className="font-black">Letzte Nachweise</h2>
        {(data?.qualityReports || []).length ? (data?.qualityReports || []).slice(0, 5).map((report) => (
          <article key={report.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black">{report.work_site_name || "Objekt"}</p>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[11px] font-black text-emerald-300">{report.status || "submitted"}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{report.created_at ? new Date(report.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"} · {report.photo_count || report.photo_urls?.length || 0} Foto(s)</p>
            {report.photo_urls?.length ? <div className="mt-3 grid grid-cols-3 gap-2">{report.photo_urls.slice(0, 3).map((url) => <img key={url} src={url} alt="Qualitätsfoto" className="h-20 w-full rounded-2xl object-cover" />)}</div> : null}
          </article>
        )) : <EmptyCard title="Noch keine Nachweise" text="Gesendete Qualitätsnachweise erscheinen nach dem Speichern hier." />}
      </section>
    </div>
  );
}

function MaterialScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const sites = useMemo(() => menuSites(data, data?.tasks || []), [data]);
  const products = data?.materialProducts || [];
  const [siteIndex, setSiteIndex] = useState(0);
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [customMaterial, setCustomMaterial] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!productId && products[0]?.id) setProductId(products[0].id);
  }, [productId, products]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const site = sites[siteIndex] || null;
      const formData = new FormData();
      formData.set("workSiteId", site?.workSiteId || "");
      formData.set("workSiteName", site?.siteName || "");
      formData.set("materialProductId", productId || "");
      formData.set("materialName", customMaterial || "");
      formData.set("quantity", quantity);
      formData.set("notes", notes);
      photos.forEach((photo) => formData.append("photos", photo));
      const response = await fetch("/api/mobile/material/report", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Materialmeldung konnte nicht gesendet werden.");
      setMessage(photos.length ? "Materialmeldung mit Foto wurde an den Admin gesendet." : "Materialmeldung wurde an den Admin gesendet.");
      setNotes("");
      setCustomMaterial("");
      setPhotos([]);
      setPhotoInputKey((key) => key + 1);
      await onReload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Materialmeldung konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Material melden</h1>
          <p className="text-xs text-slate-400">Fehlendes Material direkt als Meldung speichern</p>
        </div>
        <BackButton onBack={onBack} />
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Objekt</span>
          <select value={siteIndex} onChange={(event) => setSiteIndex(Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
            {sites.length ? sites.map((site, index) => <option key={`${site.workSiteId || "site"}-${site.siteName}`} value={index}>{site.siteName}</option>) : <option>Kein Objekt gefunden</option>}
          </select>
        </label>

        {products.length ? (
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Material</span>
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
              {products.map((product) => <option key={product.id} value={product.id}>{product.name || "Material"}{product.unit ? ` · ${product.unit}` : ""}</option>)}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Material</span>
            <input value={customMaterial} onChange={(event) => setCustomMaterial(event.target.value)} required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="z.B. Müllbeutel, Reiniger, Papier" />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Menge</span>
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" />
          </label>
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-100">
            <p className="font-black">Status</p>
            <p className="mt-1 text-blue-100/80">wird als offen gespeichert</p>
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Notiz</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="Was fehlt? Wo genau?" />
        </label>

        <label className="block rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-4">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Foto optional</span>
          <input
            key={photoInputKey}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, 6))}
            className="mt-3 block w-full text-xs text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
          />
          <p className="mt-2 text-xs text-slate-500">Bis zu 6 Fotos, max. 8 MB pro Foto.</p>
          {photos.length ? (
            <div className="mt-3 space-y-1">
              {photos.map((photo) => <p key={`${photo.name}-${photo.size}`} className="truncate rounded-xl bg-slate-900 px-3 py-2 text-xs text-blue-100">📷 {photo.name}</p>)}
            </div>
          ) : null}
        </label>

        {message && <p className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-blue-100">{message}</p>}
        <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Sende…" : "Materialmeldung senden"}</button>
      </form>

      <section className="space-y-2">
        <h2 className="font-black">Letzte Materialmeldungen</h2>
        {(data?.materialReports || []).length ? (data?.materialReports || []).slice(0, 5).map((report) => (
          <article key={report.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black">{report.material_name || report.product_name || "Material"}</p>
                <p className="text-xs text-slate-500">{report.object_name || report.site || "Objekt"} · {report.status || "open"}</p>
              </div>
              {(report.photo_count || report.photo_urls?.length) ? <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[11px] font-black text-blue-200">📷 {report.photo_count || report.photo_urls?.length}</span> : null}
            </div>
            {report.photo_urls?.length ? <div className="mt-3 grid grid-cols-3 gap-2">{report.photo_urls.slice(0, 3).map((url) => <img key={url} src={url} alt="Materialfoto" className="h-20 w-full rounded-2xl object-cover" />)}</div> : null}
          </article>
        )) : <EmptyCard title="Noch keine Materialmeldung" text="Sobald etwas gemeldet wird, erscheint es hier." />}
      </section>
    </div>
  );
}

function AbsenceScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const [absenceType, setAbsenceType] = useState("Urlaub");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/absence", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ absenceType, startDate, endDate, reason })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Antrag konnte nicht gesendet werden.");
      setMessage("Antrag wurde gespeichert und an den Admin gesendet.");
      setReason("");
      await onReload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Antrag konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Abwesenheit</h1>
          <p className="text-xs text-slate-400">Urlaub oder Krankheit anfragen</p>
        </div>
        <BackButton onBack={onBack} />
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Art</span>
          <select value={absenceType} onChange={(event) => setAbsenceType(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
            <option>Urlaub</option>
            <option>Krank</option>
            <option>Frei</option>
            <option>Sonstiges</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Von</span>
            <input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Bis</span>
            <input value={endDate} onChange={(event) => setEndDate(event.target.value)} type="date" required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Grund / Notiz</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="Kurze Info für den Admin" />
        </label>
        {message && <p className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-blue-100">{message}</p>}
        <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Sende…" : "Antrag senden"}</button>
      </form>

      <section className="space-y-2">
        <h2 className="font-black">Meine Anträge</h2>
        {(data?.absences || []).length ? (data?.absences || []).map((absence) => (
          <article key={absence.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black">{absence.absence_type || absence.request_type || "Abwesenheit"}</p>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-black text-blue-100">{absence.status || "open"}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{absence.start_date} bis {absence.end_date}</p>
            {absence.admin_response && <p className="mt-2 rounded-xl bg-slate-950 px-3 py-2 text-xs text-slate-300">{absence.admin_response}</p>}
          </article>
        )) : <EmptyCard title="Keine Anträge" text="Hier erscheinen Urlaub, Krankheit und Freitage." />}
      </section>
    </div>
  );
}

function ChatScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const messages = [...(data?.chatMessages || [])].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ message: text })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Nachricht konnte nicht gesendet werden.");
      setText("");
      await onReload();
    } catch (sendError) {
      setMessage(sendError instanceof Error ? sendError.message : "Nachricht konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Chat</h1>
          <p className="text-xs text-slate-400">Nachricht an Admin / Büro</p>
        </div>
        <BackButton onBack={onBack} />
      </div>

      <section className="max-h-[52vh] space-y-3 overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        {messages.length ? messages.map((item) => {
          const own = `${item.sender_role || ""}`.toLowerCase() === "employee";
          const body = item.message || item.body || item.text || "Nachricht";
          return (
            <article key={item.id} className={`rounded-2xl px-4 py-3 ${own ? "ml-8 bg-blue-600 text-white" : "mr-8 bg-slate-800 text-slate-100"}`}>
              <p className="text-sm font-semibold">{body}</p>
              <p className={`mt-1 text-[10px] ${own ? "text-blue-100" : "text-slate-500"}`}>{item.sender_name || (own ? data?.employee?.name : "Admin")} · {item.created_at ? formatTime(item.created_at) : "—"}</p>
            </article>
          );
        }) : <EmptyCard title="Noch keine Nachrichten" text="Schreibe dem Büro direkt aus der App." />}
      </section>

      {message && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{message}</p>}
      <form onSubmit={sendMessage} className="rounded-3xl border border-slate-800 bg-slate-900 p-3">
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="Nachricht schreiben…" />
        <button disabled={saving || !text.trim()} className="mt-3 w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Sende…" : "Nachricht senden"}</button>
      </form>
    </div>
  );
}


function DayCloseScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const today = todayIso();
  const todayTasks = (data?.tasks || [])
    .filter((task) => task.task_date === today)
    .sort((a, b) => `${a.start_time || "99:99"}-${a.title || ""}`.localeCompare(`${b.start_time || "99:99"}-${b.title || ""}`));
  const doneTasks = todayTasks.filter((task) => task.done || String(task.status || "").toLowerCase() === "done");
  const openTasks = todayTasks.filter((task) => !(task.done || String(task.status || "").toLowerCase() === "done"));
  const todayEntries = (data?.timeEntries || []).filter((entry) => isSuccessfulTimeEntry(entry) && entry.created_at?.slice(0, 10) === today);
  const workedMinutes = Math.round(dailyWorkedSeconds(data?.timeEntries || []) / 60);
  const hasOpenClock = latestClock(todayEntries).status !== "idle";
  const canSubmit = confirm && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/day-close", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          employeeName: data?.employee?.name || "",
          date: today,
          note,
          workedMinutes,
          plannedTasks: todayTasks.length,
          doneTasks: doneTasks.length,
          openTasks: openTasks.length,
          openTaskTitles: openTasks.map((task) => `${task.title || "Einsatz"} · ${task.site || task.customer_name || "Objekt"}`)
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Tagesabschluss konnte nicht gesendet werden.");
      setMessage("Tagesabschluss wurde ans Büro gesendet.");
      setNote("");
      setConfirm(false);
      await onReload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tagesabschluss konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Tagesabschluss</h1>
          <p className="text-xs text-slate-400">Arbeitsende ans Büro melden</p>
        </div>
        <BackButton onBack={onBack} />
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Heute</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Zeit</p>
            <p className="mt-1 text-xl font-black text-blue-100">{workedMinutes ? minutesToHours(workedMinutes) : "0h"}</p>
          </div>
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Erledigt</p>
            <p className="mt-1 text-xl font-black text-emerald-200">{doneTasks.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Offen</p>
            <p className={`mt-1 text-xl font-black ${openTasks.length ? "text-red-200" : "text-emerald-200"}`}>{openTasks.length}</p>
          </div>
        </div>
        {hasOpenClock ? (
          <div className="mt-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-100">
            Achtung: Es läuft noch eine Stempelung oder Pause. Bitte zuerst ausstempeln, damit der Tagesabschluss sauber ist.
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 font-bold">Heutige Einsätze</h2>
        <div className="space-y-3">
          {todayTasks.length ? todayTasks.map((task) => {
            const done = task.done || String(task.status || "").toLowerCase() === "done";
            return (
              <article key={task.id} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-blue-200">{taskTime(task)}</p>
                    <p className="mt-1 font-black text-white">{task.title || "Einsatz"}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{task.site || task.customer_name || "Ohne Objekt"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-black ${done ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200"}`}>{done ? "OK" : "offen"}</span>
                </div>
              </article>
            );
          }) : <EmptyCard title="Keine Einsätze für heute" text="Der Tagesabschluss kann trotzdem mit Notiz gesendet werden." />}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Notiz ans Büro</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="z. B. Objekt fertig, Material fehlt, Kunde war nicht erreichbar…" />
        </label>
        <label className="mt-3 flex items-start gap-3 rounded-2xl bg-slate-950 p-3 text-sm text-slate-200">
          <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} className="mt-1 h-5 w-5 accent-blue-600" />
          <span>Ich bestätige den Tagesabschluss für heute. Offene Einsätze werden dem Büro mitgemeldet.</span>
        </label>
        {message ? <p className="mt-3 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-blue-100">{message}</p> : null}
        <button disabled={!canSubmit} onClick={submit} className="mt-3 w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-50">{saving ? "Sende…" : "Tagesabschluss senden"}</button>
      </section>
    </div>
  );
}

function ProfileScreen({ data, onBack, onLogout }: { data: AppData | null; onBack: () => void; onLogout: () => Promise<void> }) {
  const employee = data?.employee;
  const birthday = birthdayInfo(employee);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Profil</h1>
          <p className="text-xs text-slate-400">Meine Mitarbeiterdaten</p>
        </div>
        <BackButton onBack={onBack} />
      </div>
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-blue-500/15 text-2xl font-black text-blue-100">{(employee?.name || "?").slice(0, 1)}</div>
        <p className="text-xl font-black">{employee?.name || "Mitarbeiter"}</p>
        <p className="text-sm text-slate-400">{employee?.email || "Keine E-Mail"}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard title="Rolle" value={employee?.role || "—"} caption="Zugriff" accent="text-blue-100" />
          <MetricCard title="Urlaub" value={`${employee?.annual_vacation_days ?? employee?.vacation_days ?? "—"}`} caption="Anspruch/Jahr" accent="text-emerald-200" />
          <MetricCard title="Stundensatz" value={moneyPerHour(employee?.hourly_rate)} caption="Lohnsatz" accent="text-yellow-100" />
          <MetricCard title="Geburtstag" value={birthday?.date || "—"} caption={birthday?.nextLabel || "nicht gepflegt"} accent={birthday?.isToday ? "text-pink-200" : "text-blue-100"} />
        </div>
        {birthday?.isToday ? <p className="mt-4 rounded-2xl border border-pink-500/30 bg-pink-500/10 p-3 text-sm font-bold text-pink-100">Alles Gute zum Geburtstag! 🎉</p> : null}
      </section>
      <button onClick={onLogout} className="w-full rounded-3xl border border-red-500/30 bg-red-500/10 p-4 text-left font-black text-red-100">Abmelden</button>
    </div>
  );
}

function RoutePlanScreen({ assignments, onBack, onOpenAssignment }: { assignments: Assignment[]; onBack: () => void; onOpenAssignment: (assignment: Assignment) => void }) {
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const dayAssignments = useMemo(() => assignments
    .filter((assignment) => assignment.date === selectedDay)
    .sort((a, b) => String(a.raw?.start_time || "99:99").localeCompare(String(b.raw?.start_time || "99:99"))), [assignments, selectedDay]);
  const openAssignments = dayAssignments.filter((assignment) => !assignment.done);
  const plannedMinutes = dayAssignments.reduce((sum, assignment) => sum + Number(assignment.raw?.planned_minutes || assignment.raw?.max_minutes || assignment.raw?.paid_minutes || assignment.raw?.wage_minutes || 0), 0);
  const nextAssignment = openAssignments[0] || dayAssignments[0] || null;
  const routeTasks = openAssignments.length ? openAssignments.map((assignment) => assignment.raw).filter(Boolean) as RawTask[] : dayAssignments.map((assignment) => assignment.raw).filter(Boolean) as RawTask[];
  const routeUrl = mapsDirectionsUrl(routeTasks);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BackButton onBack={onBack} />
        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-[11px] font-black text-blue-200">Tagesroute</span>
      </div>

      <section className="rounded-3xl border border-blue-500/25 bg-slate-900/80 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-blue-200">Route planen</p>
        <h1 className="mt-2 text-2xl font-black text-white">Tagesroute</h1>
        <p className="mt-1 text-sm text-slate-400">Nur Einsätze vom gewählten Tag. Alte Aufträge werden hier nicht angezeigt.</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Einsätze</p>
            <p className="mt-1 text-xl font-black text-white">{dayAssignments.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Offen</p>
            <p className="mt-1 text-xl font-black text-yellow-100">{openAssignments.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-950 p-3">
            <p className="text-slate-500">Geplant</p>
            <p className="mt-1 text-xl font-black text-blue-100">{plannedMinutes ? minutesToHours(plannedMinutes) : "—"}</p>
          </div>
        </div>
      </section>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const selected = day === selectedDay;
          const count = assignments.filter((assignment) => assignment.date === day).length;
          return (
            <button key={day} onClick={() => setSelectedDay(day)} className={`min-w-16 rounded-2xl border p-3 text-sm ${selected ? "border-blue-500 bg-blue-600 text-white" : "border-slate-800 bg-slate-900 text-slate-300"}`}>
              <span className="block text-[10px] uppercase text-slate-400">{dateLabel(day).split(" ")[0]}</span>
              <span className="text-lg font-black">{dateLabel(day).split(" ")[1] || ""}</span>
              <span className="mt-1 block text-[10px] text-slate-400">{count} Einsatz{count === 1 ? "" : "e"}</span>
            </button>
          );
        })}
      </div>

      {nextAssignment ? (
        <section className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-200">Nächster Einsatz</p>
          <p className="mt-2 text-lg font-black text-white">{nextAssignment.title}</p>
          <p className="mt-1 text-sm text-emerald-100/80">{nextAssignment.time} · {nextAssignment.address}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a href={mapSearchUrl(nextAssignment.raw || null)} target="_blank" rel="noreferrer" className="rounded-2xl border border-emerald-500/30 bg-slate-950 px-3 py-3 text-center text-sm font-black text-emerald-100">Route</a>
            <button onClick={() => onOpenAssignment(nextAssignment)} className="rounded-2xl bg-blue-600 px-3 py-3 text-sm font-black text-white shadow-glow">Termin öffnen</button>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Route für den Tag</h2>
            <p className="text-xs text-slate-500">Google Maps öffnet die offenen Einsätze in Reihenfolge.</p>
          </div>
          <a href={routeUrl} target="_blank" rel="noreferrer" className={`rounded-2xl px-4 py-3 text-sm font-black ${routeTasks.length ? "bg-blue-600 text-white shadow-glow" : "bg-slate-800 text-slate-500"}`}>Route öffnen</a>
        </div>
        <div className="mt-4 space-y-3">
          {dayAssignments.length ? dayAssignments.map((assignment, index) => (
            <button key={assignment.id} onClick={() => onOpenAssignment(assignment)} className="flex w-full items-start gap-3 rounded-2xl bg-slate-950 p-3 text-left">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-sm font-black ${assignment.done ? "bg-emerald-500/15 text-emerald-200" : "bg-blue-500/15 text-blue-200"}`}>{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-white">{assignment.time} · {assignment.title}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{assignment.address}</span>
                <span className="mt-1 block text-[11px] text-slate-600">{assignment.done ? "Erledigt" : "Offen"} · {assignment.customer}</span>
              </span>
            </button>
          )) : <EmptyCard title="Keine Einsätze an diesem Tag" text="Lege im Admin-Dashboard einen Termin an oder wähle einen anderen Tag." />}
        </div>
      </section>
    </div>
  );
}

function workSiteName(site: WorkSite | null | undefined) {
  return site?.name || site?.site_name || site?.object_name || site?.site || "Unbenanntes Objekt";
}

function workSiteAddress(site: WorkSite | null | undefined) {
  return site?.address || site?.site || site?.site_name || site?.object_name || "Keine Adresse hinterlegt";
}

function tasksForWorkSite(tasks: RawTask[], site: WorkSite | null) {
  if (!site?.id) return [];
  return tasks.filter((task) => task.work_site_id === site.id || task.site === workSiteName(site) || task.site === site.site_name || task.site === site.object_name || task.site === site.name);
}

function ObjectsScreen({ data, onBack, onOpenAssignment }: { data: AppData | null; onBack: () => void; onOpenAssignment: (assignment: Assignment) => void }) {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const assignments = useMemo(() => assignmentsFromTasks(data?.tasks || []), [data?.tasks]);
  const sites = useMemo(() => {
    const map = new Map<string, WorkSite>();
    (data?.workSites || []).forEach((site) => {
      if (site.id) map.set(site.id, site);
    });
    (data?.employeeWorkSites || []).forEach((site) => {
      if (!site.work_site_id) return;
      if (!map.has(site.work_site_id)) {
        map.set(site.work_site_id, {
          id: site.work_site_id,
          name: site.site_name,
          site_name: site.site_name,
          active: site.active
        });
      }
    });
    (data?.tasks || []).forEach((task) => {
      const key = task.work_site_id || task.site || task.customer_name || task.id;
      if (!key || map.has(key)) return;
      map.set(key, {
        id: key,
        name: task.site || task.customer_name || task.title || "Objekt",
        site_name: task.site || task.customer_name || task.title || "Objekt",
        customer_name: task.customer_name,
        active: true
      });
    });
    return Array.from(map.values()).sort((a, b) => workSiteName(a).localeCompare(workSiteName(b), "de"));
  }, [data]);

  const selectedSite = sites.find((site) => site.id === selectedSiteId) || sites[0] || null;
  const siteTasks = useMemo(() => tasksForWorkSite(data?.tasks || [], selectedSite).sort((a, b) => String(a.task_date || "9999-12-31").localeCompare(String(b.task_date || "9999-12-31"))), [data?.tasks, selectedSite]);
  const futureTasks = siteTasks.filter((task) => (task.task_date || "") >= todayIso()).slice(0, 5);
  const siteAssignments = assignments.filter((assignment) => siteTasks.some((task) => task.id === assignment.id));
  const plan = planForTask(data, siteTasks[0] || null) || (data?.cleaningPlans || []).find((item) => item.work_site_id === selectedSite?.id) || null;
  const planItems = plan ? (data?.cleaningPlanItems || []).filter((item) => item.plan_id === plan.id) : [];
  const materials = (data?.materialProducts || []).filter((item) => !item.work_site_id || item.work_site_id === selectedSite?.id || item.object_name === workSiteName(selectedSite));
  const gpsReady = selectedSite ? getSiteLatitude(selectedSite) !== null && getSiteLongitude(selectedSite) !== null : false;
  const radius = selectedSite ? getSiteRadius(selectedSite) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BackButton onBack={onBack} />
        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-[11px] font-black text-blue-200">Objektmappe</span>
      </div>

      <section className="rounded-3xl border border-blue-500/25 bg-slate-900/80 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-blue-200">Objektmappe</p>
        <h1 className="mt-2 text-2xl font-black text-white">Objekte & Reinigungspläne</h1>
        <p className="mt-1 text-sm text-slate-400">Alle Objektinfos, Tages-Termine, Checklisten und Material auf einen Blick.</p>
      </section>

      <label className="block rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Objekt auswählen</span>
        <select value={selectedSite?.id || ""} onChange={(event) => setSelectedSiteId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500">
          {sites.map((site) => <option key={site.id} value={site.id}>{workSiteName(site)}</option>)}
        </select>
      </label>

      {!selectedSite ? <EmptyCard title="Keine Objekte gefunden" text="Ordne dem Mitarbeiter ein Objekt zu oder lege einen Einsatz mit Objekt an." /> : (
        <>
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-black text-white">{workSiteName(selectedSite)}</h2>
                <p className="mt-1 text-sm text-slate-400">{selectedSite.customer_name || plan?.customer_name || "Kein Kunde hinterlegt"}</p>
                <p className="mt-1 text-xs text-slate-500">{workSiteAddress(selectedSite)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${gpsReady ? "bg-emerald-500/15 text-emerald-200" : "bg-yellow-500/15 text-yellow-100"}`}>{gpsReady ? "GPS aktiv" : "GPS fehlt"}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-2xl bg-slate-950 p-3"><p className="text-slate-500">Einsätze</p><p className="mt-1 text-xl font-black text-white">{siteTasks.length}</p></div>
              <div className="rounded-2xl bg-slate-950 p-3"><p className="text-slate-500">Planpunkte</p><p className="mt-1 text-xl font-black text-blue-100">{planItems.length}</p></div>
              <div className="rounded-2xl bg-slate-950 p-3"><p className="text-slate-500">Radius</p><p className="mt-1 text-xl font-black text-emerald-100">{radius ? `${radius}m` : "—"}</p></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <a href={mapSearchUrl(siteTasks[0] || { site: workSiteName(selectedSite), customer_name: selectedSite.customer_name || null })} target="_blank" rel="noreferrer" className="rounded-2xl bg-blue-600 px-3 py-3 text-center text-sm font-black text-white shadow-glow">Route öffnen</a>
              <button onClick={() => futureTasks[0] && onOpenAssignment(assignmentsFromTasks([futureTasks[0]])[0])} disabled={!futureTasks.length} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-black text-blue-100 disabled:text-slate-600">Nächsten Termin</button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="font-black">Nächste Einsätze</h2>
            <div className="mt-3 space-y-3">
              {futureTasks.length ? futureTasks.map((task) => {
                const assignment = siteAssignments.find((item) => item.id === task.id) || assignmentFromTask(task);
                return <button key={task.id} onClick={() => onOpenAssignment(assignment)} className="flex w-full items-start justify-between gap-3 rounded-2xl bg-slate-950 p-3 text-left"><span><span className="block text-sm font-black text-white">{dateLabel(task.task_date)} · {taskTime(task)}</span><span className="mt-1 block text-xs text-slate-500">{task.title || "Einsatz"}</span></span><span className="rounded-xl bg-blue-500/15 px-2 py-1 text-[11px] font-bold text-blue-100">Öffnen</span></button>;
              }) : <p className="text-sm text-slate-500">Keine kommenden Einsätze für dieses Objekt.</p>}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="font-black">Reinigungsplan</h2>
            {plan ? <p className="mt-1 text-xs text-slate-500">{plan.name || plan.site_name || "Plan"} · {plan.status || "aktiv"}</p> : <p className="mt-1 text-xs text-slate-500">Kein Reinigungsplan gefunden.</p>}
            <div className="mt-3 space-y-2">
              {planItems.length ? planItems.slice(0, 12).map((item) => (
                <div key={item.id} className="rounded-2xl bg-slate-950 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-white">{item.task_title || item.area || "Aufgabe"}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.area || "Bereich offen"} · {item.interval_type || "Intervall offen"}</p>
                    </div>
                    {item.calculation_minutes ? <span className="rounded-lg bg-blue-500/15 px-2 py-1 text-[11px] font-bold text-blue-100">{item.calculation_minutes} min</span> : null}
                  </div>
                  {item.task_description ? <p className="mt-2 text-xs text-slate-400">{item.task_description}</p> : null}
                </div>
              )) : <p className="text-sm text-slate-500">Noch keine Planpunkte für dieses Objekt.</p>}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="font-black">Material am Objekt</h2>
            <div className="mt-3 space-y-2">
              {materials.length ? materials.slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-950 p-3">
                  <span><span className="block text-sm font-black text-white">{item.name || "Material"}</span><span className="block text-xs text-slate-500">{item.category || item.supplier || ""}</span></span>
                  <span className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{item.current_stock ?? "—"} {item.unit || ""}</span>
                </div>
              )) : <p className="text-sm text-slate-500">Kein Material zugeordnet.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}


function IssueScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const sites = useMemo(() => menuSites(data, data?.tasks || []), [data]);
  const openTasks = useMemo(() => (data?.tasks || []).filter((task) => !task.done && (task.task_date || "") >= todayIso()).sort((a, b) => `${a.task_date || "9999-12-31"}-${a.start_time || "99:99"}`.localeCompare(`${b.task_date || "9999-12-31"}-${b.start_time || "99:99"}`)), [data?.tasks]);
  const [siteIndex, setSiteIndex] = useState(0);
  const [taskId, setTaskId] = useState("");
  const [category, setCategory] = useState("Mangel / Schaden");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId && openTasks[0]?.id) setTaskId(openTasks[0].id);
  }, [taskId, openTasks]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const selectedSite = sites[siteIndex] || null;
      const selectedTask = openTasks.find((task) => task.id === taskId) || null;
      const formData = new FormData();
      formData.set("taskId", selectedTask?.id || "");
      formData.set("workSiteId", selectedSite?.workSiteId || selectedTask?.work_site_id || "");
      formData.set("workSiteName", selectedSite?.siteName || selectedTask?.site || selectedTask?.customer_name || "");
      formData.set("category", category);
      formData.set("priority", priority);
      formData.set("description", description);
      photos.forEach((photo) => formData.append("photos", photo));

      const response = await fetch("/api/mobile/issues", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Objektmeldung konnte nicht gesendet werden.");
      setMessage(photos.length ? "Objektmeldung mit Foto wurde an das Büro gesendet." : "Objektmeldung wurde an das Büro gesendet.");
      setDescription("");
      setPhotos([]);
      setPhotoInputKey((key) => key + 1);
      await onReload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Objektmeldung konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  const recentIssueNotifications = (data?.notifications || [])
    .filter((item) => String(item.notification_type || "").toLowerCase().includes("issue") || String(item.title || "").toLowerCase().includes("objektmeldung"))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Objektmeldung</h1>
          <p className="text-xs text-slate-400">Schäden, Mängel oder Besonderheiten direkt ans Büro melden</p>
        </div>
        <BackButton onBack={onBack} />
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Objekt</span>
          <select value={siteIndex} onChange={(event) => setSiteIndex(Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
            {sites.length ? sites.map((site, index) => <option key={`${site.workSiteId || "site"}-${site.siteName}`} value={index}>{site.siteName}</option>) : <option>Kein Objekt gefunden</option>}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Termin optional</span>
          <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
            <option value="">Ohne konkreten Termin</option>
            {openTasks.map((task) => <option key={task.id} value={task.id}>{dateLabel(task.task_date)} · {taskTime(task)} · {task.site || task.customer_name || task.title || "Einsatz"}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Art</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
              <option>Mangel / Schaden</option>
              <option>Kundenhinweis</option>
              <option>Zugang / Schlüssel</option>
              <option>Sonderreinigung</option>
              <option>Sicherheitsproblem</option>
              <option>Sonstiges</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Dringlichkeit</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
              <option value="normal">Normal</option>
              <option value="urgent">Dringend</option>
              <option value="critical">Sofort prüfen</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Beschreibung</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} required rows={4} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="Was ist passiert? Wo genau? Was muss das Büro wissen?" />
        </label>

        <label className="block rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-4">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Foto optional</span>
          <input
            key={photoInputKey}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, 6))}
            className="mt-3 block w-full text-xs text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
          />
          <p className="mt-2 text-xs text-slate-500">Bis zu 6 Fotos, max. 8 MB pro Foto.</p>
          {photos.length ? (
            <div className="mt-3 space-y-1">
              {photos.map((photo) => <p key={`${photo.name}-${photo.size}`} className="truncate rounded-xl bg-slate-900 px-3 py-2 text-xs text-blue-100">📷 {photo.name}</p>)}
            </div>
          ) : null}
        </label>

        {message && <p className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-blue-100">{message}</p>}
        <button disabled={saving || !description.trim()} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Sende…" : "Objektmeldung senden"}</button>
      </form>

      <section className="space-y-2">
        <h2 className="font-black">Letzte Objektmeldungen</h2>
        {recentIssueNotifications.length ? recentIssueNotifications.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black">{item.title || "Objektmeldung"}</p>
                <p className="mt-1 line-clamp-3 text-xs text-slate-400">{item.message || "Meldung gespeichert"}</p>
                <p className="mt-2 text-xs text-slate-500">{item.object_name || item.site || item.work_site_name || "Objekt"} · {item.status || "open"}</p>
              </div>
              {item.read === false ? <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[11px] font-black text-blue-200">neu</span> : null}
            </div>
          </article>
        )) : <EmptyCard title="Noch keine Objektmeldung" text="Mängel, Schäden oder Kundenhinweise erscheinen nach dem Senden hier." />}
      </section>
    </div>
  );
}


function ServiceReportScreen({ data, authToken, selectedTaskId, onBack, onReload }: { data: AppData | null; authToken: string; selectedTaskId: string | null; onBack: () => void; onReload: () => void }) {
  const today = todayIso();
  const taskOptions = useMemo(() => {
    const rows = [...(data?.tasks || [])]
      .filter((task) => (task.task_date || "") >= today || task.id === selectedTaskId)
      .sort((a, b) => `${a.task_date || "9999-12-31"}-${a.start_time || "99:99"}`.localeCompare(`${b.task_date || "9999-12-31"}-${b.start_time || "99:99"}`));
    return rows.length ? rows : [...(data?.tasks || [])].slice(0, 20);
  }, [data?.tasks, selectedTaskId, today]);
  const [taskId, setTaskId] = useState(selectedTaskId || taskOptions[0]?.id || "");
  const [signerName, setSignerName] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    if (!taskId && taskOptions[0]?.id) setTaskId(taskOptions[0].id);
  }, [taskId, taskOptions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parentWidth = canvas.parentElement?.clientWidth || 360;
      const ratio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = Math.max(320, parentWidth) * ratio;
      canvas.height = 180 * ratio;
      canvas.style.width = "100%";
      canvas.style.height = "180px";
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.lineWidth = 3;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#e2e8f0";
    };
    resize();
    if (typeof window !== "undefined") window.addEventListener("resize", resize);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("resize", resize);
    };
  }, []);

  const selectedTask = useMemo(() => taskOptions.find((task) => task.id === taskId) || null, [taskOptions, taskId]);
  const recentReports = data?.serviceReports || [];

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) return;
    drawingRef.current = true;
    canvas?.setPointerCapture(event.pointerId);
    const pos = point(event);
    context.beginPath();
    context.moveTo(pos.x, pos.y);
    setHasSignature(true);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const pos = point(event);
    context.lineTo(pos.x, pos.y);
    context.stroke();
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    try { canvasRef.current?.releasePointerCapture(event.pointerId); } catch {}
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask) {
      setMessage("Bitte zuerst einen Einsatz auswählen.");
      return;
    }
    if (!hasSignature) {
      setMessage("Bitte zuerst unterschreiben lassen.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/service-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          taskId: selectedTask.id,
          workSiteId: selectedTask.work_site_id,
          workSiteName: selectedTask.site || selectedTask.customer_name,
          customerName: selectedTask.customer_name,
          signerName,
          notes,
          signatureDataUrl: canvas.toDataURL("image/png")
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Leistungsnachweis konnte nicht gespeichert werden.");
      setMessage("Leistungsnachweis gespeichert. Der Admin sieht ihn jetzt in den Freigaben.");
      setSignerName("");
      setNotes("");
      clearSignature();
      onReload();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Leistungsnachweis konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Leistungsnachweis</h1>
          <p className="mt-1 text-xs text-slate-400">Kunde bestätigt den erledigten Einsatz direkt auf dem Handy.</p>
        </div>
        <button onClick={onBack} className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-black text-blue-100">Zurück</button>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Einsatz</span>
          <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
            {taskOptions.map((task) => (
              <option key={task.id} value={task.id}>{dateLabel(task.task_date)} · {taskTime(task)} · {task.site || task.customer_name || task.title || "Einsatz"}</option>
            ))}
          </select>
        </label>

        {selectedTask ? (
          <section className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3">
            <p className="font-black text-blue-100">{selectedTask.title || "Einsatz"}</p>
            <p className="mt-1 text-sm text-slate-300">{selectedTask.site || selectedTask.customer_name || "Objekt ohne Name"}</p>
            <p className="mt-1 text-xs text-slate-500">{dateLabel(selectedTask.task_date)} · {taskTime(selectedTask)} · {taskDuration(selectedTask)}</p>
          </section>
        ) : <EmptyCard title="Kein Einsatz vorhanden" text="Bitte zuerst im Admin einen Termin für den Mitarbeiter anlegen." />}

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Name des Kunden / Ansprechpartners</span>
          <input value={signerName} onChange={(event) => setSignerName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="z. B. Herr Müller" />
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Notiz optional</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="Was wurde bestätigt? Besonderheiten?" />
        </label>

        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Unterschrift Kunde</p>
            <button type="button" onClick={clearSignature} className="rounded-xl border border-slate-700 px-3 py-1 text-xs font-black text-slate-300">Löschen</button>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            className="touch-none rounded-2xl border border-slate-800 bg-slate-900"
          />
          <p className="mt-2 text-xs text-slate-500">Mit Finger oder Stift unterschreiben lassen.</p>
        </div>

        {message && <p className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-blue-100">{message}</p>}
        <button disabled={saving || !selectedTask || !hasSignature} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : "Leistungsnachweis senden"}</button>
      </form>

      <section className="space-y-2">
        <h2 className="font-black">Letzte Leistungsnachweise</h2>
        {recentReports.length ? recentReports.slice(0, 5).map((report) => (
          <article key={report.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black">{report.work_site_name || "Objekt"}</p>
                <p className="mt-1 text-xs text-slate-400">{report.signer_name || "Kunde"} · {report.status || "signed"}</p>
                <p className="mt-1 text-xs text-slate-500">{report.created_at ? new Date(report.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
              </div>
              {report.signature_url ? <a href={report.signature_url} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white">Signatur</a> : null}
            </div>
          </article>
        )) : <EmptyCard title="Noch kein Leistungsnachweis" text="Gespeicherte Kundenbestätigungen erscheinen hier." />}
      </section>
    </div>
  );
}


function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function PushSettingsScreen({ authToken, onBack }: { authToken: string; onBack: () => void }) {
  const [status, setStatus] = useState<string>("Prüfe Benachrichtigungen…");
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [lastTest, setLastTest] = useState<string | null>(null);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

  useEffect(() => {
    async function check() {
      if (!pushSupported()) {
        setStatus("Dieses Gerät oder dieser Browser unterstützt Push-Benachrichtigungen nicht.");
        return;
      }
      const permission = Notification.permission;
      if (permission === "denied") {
        setStatus("Benachrichtigungen sind blockiert. Bitte in den Browser-/Handy-Einstellungen erlauben.");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      setEnabled(Boolean(subscription));
      setStatus(subscription ? "Push ist auf diesem Gerät aktiv." : "Push ist noch nicht aktiv.");
    }
    check().catch((error) => setStatus(error instanceof Error ? error.message : "Push-Status konnte nicht geprüft werden."));
  }, []);

  async function enablePush() {
    setSaving(true);
    setLastTest(null);
    try {
      if (!pushSupported()) throw new Error("Push wird auf diesem Gerät nicht unterstützt.");
      if (!vapidPublicKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY fehlt in Vercel.");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Benachrichtigungen wurden nicht erlaubt.");

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      const response = await fetch("/api/mobile/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ subscription })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Push konnte nicht gespeichert werden.");

      setEnabled(true);
      setStatus("Push ist aktiv. Dieses Gerät kann jetzt Meldungen empfangen.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Push konnte nicht aktiviert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setSaving(true);
    setLastTest(null);
    try {
      const response = await fetch("/api/mobile/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Testmeldung konnte nicht gesendet werden.");
      setLastTest(`Test gesendet: ${result.sent || 0} Gerät(e)`);
    } catch (error) {
      setLastTest(error instanceof Error ? error.message : "Testmeldung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300">← Zurück</button>
      <div>
        <h1 className="text-2xl font-black">Push aktivieren</h1>
        <p className="text-xs text-slate-400">Damit bekomme ich Einsatz-Erinnerungen, Büro-Meldungen und Freigaben direkt aufs Handy.</p>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
        <p className="mt-2 font-black text-blue-100">{enabled ? "Aktiv" : "Noch nicht aktiv"}</p>
        <p className="mt-2 text-sm text-slate-400">{status}</p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <p className="font-black">So funktioniert es</p>
        <div className="mt-3 space-y-2 text-sm text-slate-400">
          <p>1. Ich tippe auf „Push auf diesem Gerät aktivieren“.</p>
          <p>2. Ich erlaube die Browser-Benachrichtigung.</p>
          <p>3. Das Büro kann mir später Meldungen aufs Handy schicken.</p>
        </div>
      </section>

      <button disabled={saving} onClick={enablePush} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">
        {saving ? "Speichere…" : "Push auf diesem Gerät aktivieren"}
      </button>
      <button disabled={saving || !enabled} onClick={sendTest} className="w-full rounded-2xl border border-slate-700 bg-slate-950 py-4 font-black text-blue-100 disabled:opacity-40">
        Testmeldung senden
      </button>
      {lastTest ? <p className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-100">{lastTest}</p> : null}

      <p className="text-xs text-slate-500">Hinweis: Auf iPhone/iPad müssen Web-Apps oft erst zum Home-Bildschirm hinzugefügt werden, bevor Push zuverlässig funktioniert.</p>
    </div>
  );
}

function Menu({ data, employeeName, onEmployeeChange, onLogout, setActive }: { data: AppData | null; employeeName: string; onEmployeeChange: (name: string) => void; onLogout: () => Promise<void>; setActive: (tab: Tab) => void }) {
  const qualityOpen = (data?.tasks || []).filter((task) => !task.done).length;
  const items: Array<{ title: string; subtitle: string; icon: string; tab: Tab }> = [
    { title: "Qualitätsnachweis", subtitle: `${qualityOpen} offene Einsätze`, icon: "shield", tab: "quality" },
    { title: "Material melden", subtitle: `${data?.materialReports?.length || 0} vorhandene Meldungen`, icon: "box", tab: "material" },
    { title: "Abwesenheit", subtitle: `${data?.absences?.length || 0} vorhandene Anträge`, icon: "calendar", tab: "absence" },
    { title: "Chat", subtitle: `${data?.chatMessages?.length || 0} Nachrichten`, icon: "chat", tab: "chat" },
    { title: "Meldungen", subtitle: `${unreadCountFromData(data)} ungelesen`, icon: "bell", tab: "notifications" },
    { title: "Tagesroute", subtitle: "Heute sauber abfahren", icon: "map", tab: "route" },
    { title: "Objektmappe", subtitle: `${(data?.workSites?.length || data?.employeeWorkSites?.length || 0)} Objekte`, icon: "building", tab: "objects" },
    { title: "Objektmeldung", subtitle: "Schaden, Mangel oder Hinweis", icon: "shield", tab: "issue" },
    { title: "Leistungsnachweis", subtitle: `${data?.serviceReports?.length || 0} Kundenbestätigungen`, icon: "sheet", tab: "service" },
    { title: "Push aktivieren", subtitle: "Einsatz-Erinnerungen auf dem Handy", icon: "bell", tab: "push" },
    { title: "Tagesabschluss", subtitle: "Arbeitsende ans Büro melden", icon: "sheet", tab: "dayclose" },
    { title: "Profil", subtitle: data?.employee?.email || "Stammdaten", icon: "user", tab: "profile" }
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
          <div className="mt-4 grid grid-cols-1 gap-2">
            <a href="/mitarbeiter/admin/tageszentrale" className="block rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white shadow-glow">Tageszentrale</a>
            <a href="/mitarbeiter/admin/auswertung" className="block rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black text-blue-100">Monatsauswertung</a>
            <a href="/mitarbeiter/admin/push" className="block rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black text-blue-100">Push-Zentrale</a>
            <a href="/mitarbeiter/admin" className="block rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black text-blue-100">Admin-Dashboard</a>
            <a href="/mitarbeiter/freigaben" className="block rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black text-blue-100">Admin-Freigaben</a>
            <a href="/mitarbeiter/aktivieren" className="block rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black text-blue-100">Mitarbeiter aktivieren</a>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Angemeldet als</p>
          <p className="font-black text-blue-100">{data?.employee?.name || employeeName}</p>
          <p className="mt-1 text-xs text-slate-500">Die App lädt automatisch nur die eigenen Einsätze und Zeiten.</p>
        </section>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <button key={item.title} onClick={() => setActive(item.tab)} className="flex w-full items-center gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-blue-600">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/15 text-blue-200"><Icon name={item.icon} /></div>
            <div className="min-w-0">
              <p className="font-black">{item.title}</p>
              <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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
    setSelectedTaskId(null);
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

  function openAssignment(assignment: Assignment) {
    setSelectedTaskId(assignment.id);
    setActive("taskdetail");
  }

  function openClockForTask(task: RawTask) {
    setSelectedTaskId(task.id);
    setActive("clock");
  }

  function openQualityForTask(task: RawTask) {
    setSelectedTaskId(task.id);
    setActive("quality");
  }

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
    <AppShell active={active} setActive={setActive} unreadCount={unreadCountFromData(data)}>
      {loading && <LoadingScreen />}
      {!loading && error && <ErrorScreen error={error} onRetry={() => loadData()} />}
      {!loading && !error && (
        <>
          {active === "home" && <Dashboard data={data} assignments={assignments} setActive={setActive} employeeName={employeeName} onEmployeeChange={handleEmployeeChange} onOpenAssignment={openAssignment} />}
          {active === "schedule" && <Schedule assignments={assignments} onOpenAssignment={openAssignment} />}
          {active === "taskdetail" && <TaskDetail data={data} authToken={authToken} taskId={selectedTaskId} onBack={() => setActive("schedule")} onOpenClock={openClockForTask} onOpenQuality={openQualityForTask} onReload={() => loadData(employeeName)} />}
          {active === "clock" && <Clock data={data} authToken={authToken} onReload={() => loadData(employeeName)} selectedTaskId={selectedTaskId} onOpenSchedule={() => setActive("schedule")} />}
          {active === "timesheet" && <Timesheet entries={timeEntries} absences={data?.absences || []} />}
          {active === "tasks" && <Tasks tasks={data?.tasks || []} authToken={authToken} onReload={() => loadData(employeeName)} />}
          {active === "menu" && <Menu data={data} employeeName={employeeName} onEmployeeChange={handleEmployeeChange} onLogout={handleLogout} setActive={setActive} />}
          {active === "material" && <MaterialScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => loadData(employeeName)} />}
          {active === "quality" && <QualityScreen data={data} authToken={authToken} selectedTaskId={selectedTaskId} onBack={() => selectedTaskId ? setActive("taskdetail") : setActive("menu")} onReload={() => loadData(employeeName)} />}
          {active === "absence" && <AbsenceScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => loadData(employeeName)} />}
          {active === "chat" && <ChatScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => loadData(employeeName)} />}
          {active === "notifications" && <NotificationsScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => loadData(employeeName)} />}
          {active === "dayclose" && <DayCloseScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => loadData(employeeName)} />}
          {active === "route" && <RoutePlanScreen assignments={assignments} onBack={() => setActive("menu")} onOpenAssignment={openAssignment} />}
          {active === "objects" && <ObjectsScreen data={data} onBack={() => setActive("menu")} onOpenAssignment={openAssignment} />}
          {active === "issue" && <IssueScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => loadData(employeeName)} />}
          {active === "service" && <ServiceReportScreen data={data} authToken={authToken} selectedTaskId={selectedTaskId} onBack={() => setActive("menu")} onReload={() => loadData(employeeName)} />}
          {active === "push" && <PushSettingsScreen authToken={authToken} onBack={() => setActive("menu")} />}
          {active === "profile" && <ProfileScreen data={data} onBack={() => setActive("menu")} onLogout={handleLogout} />}
        </>
      )}
    </AppShell>
  );
}
