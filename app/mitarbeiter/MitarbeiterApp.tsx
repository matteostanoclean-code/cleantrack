"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import {
  ActionBar,
  Banner,
  Button,
  Chip,
  ChipRow,
  DetailRow,
  DetailSheet,
  EmptyState,
  SearchInput,
  SectionHeading,
  SegmentedTabs,
  StatusPill,
  Stepper,
  TileInput,
  UiIcon,
  ValueTile,
  cx
} from "@/components/ui";
import { addDaysIso, formatDateDE, formatDayMonthDE, formatShortDateDE, hhmm, minutesBetweenHm, startOfWeekIso } from "@/lib/format";
import { antwortLesen, bilderVerkleinern } from "@/lib/bild";

type Tab = "home" | "schedule" | "taskdetail" | "clock" | "timesheet" | "tasks" | "menu" | "material" | "absence" | "chat" | "profile" | "quality" | "notifications" | "dayclose" | "route" | "objects" | "issue" | "service" | "push" | "search" | "admin";
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
  travel_minutes?: number | null;
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
  planned_minutes?: number | null;
  actual_minutes?: number | null;
  overtime_minutes?: number | null;
  approved_minutes?: number | null;
  approval_status?: string | null;
  admin_response?: string | null;
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
  image_url?: string | null;
  photo_url?: string | null;
  image?: string | null;
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
  site?: string | null;
  rating?: number | null;
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
  viewer?: { name: string; role: string } | null;
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
  if (value === "schedule" || value === "taskdetail" || value === "clock" || value === "timesheet" || value === "tasks" || value === "material" || value === "absence" || value === "chat" || value === "profile" || value === "quality" || value === "notifications" || value === "dayclose" || value === "route" || value === "objects" || value === "issue" || value === "service" || value === "push" || value === "search") return value;
  if (value === "admin") return "menu";
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

/**
 * Kartenausschnitt von OpenStreetMap, der Objekt und eigenen Standort zeigt.
 * Absichtlich ohne Zusatzbibliothek: eingebettete Karte, kein Schlüssel nötig,
 * keine zusätzlichen Pakete im Projekt.
 */
function osmEmbedUrl(siteLat: number, siteLng: number, meLat?: number | null, meLng?: number | null) {
  const lats = [siteLat, ...(typeof meLat === "number" ? [meLat] : [])];
  const lngs = [siteLng, ...(typeof meLng === "number" ? [meLng] : [])];
  const pad = 0.0035;
  const bbox = [
    (Math.min(...lngs) - pad).toFixed(5),
    (Math.min(...lats) - pad).toFixed(5),
    (Math.max(...lngs) + pad).toFixed(5),
    (Math.max(...lats) + pad).toFixed(5)
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${siteLat},${siteLng}`;
}

/** Luftlinie zwischen zwei Punkten in Metern. */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earthRadius = 6371000;
  const toRad = (degree: number) => (degree * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
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
  // Eigene Nachrichten zaehlen nicht als ungelesen. Sonst erzeugt sich ein Admin,
  // der in seinem eigenen Verlauf schreibt, selbst eine Benachrichtigung.
  // Nicht auf "=== false" pruefen: In aelteren Zeilen steht dort null. Die
  // waeren sonst nie als ungelesen gezaehlt worden.
  const unreadChats = (data.chatMessages || []).filter((item) =>
    String(item.sender_role || "").toLowerCase() === "admin"
    && item.read_by_employee !== true
    && String(item.sender_name || "").trim() !== String(item.employee_name || "").trim()
  ).length;
  const pendingAbsences = (data.absences || []).filter((item) => ["approved", "rejected"].includes(String(item.status || "").toLowerCase()) && item.admin_response).length;
  return unreadNotifications + unreadChats + pendingAbsences;
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
      const rawMinutes = startTime && endTime && endTime > startTime ? Math.round((endTime - startTime) / 60000) : 0;
      const approvalStatus = String(lastClockOut?.approval_status || "").toLowerCase();
      const creditedMinutes = approvalStatus === "pending"
        ? Math.max(0, Number(lastClockOut?.approved_minutes || lastClockOut?.planned_minutes || rawMinutes))
        : Math.max(0, Number(lastClockOut?.approved_minutes || rawMinutes));
      const day = key.slice(0, 10);
      return {
        id: key,
        day: dateLabel(day),
        start: firstClockIn?.created_at ? formatTime(firstClockIn.created_at) : "—",
        end: lastClockOut?.created_at ? formatTime(lastClockOut.created_at) : "",
        site: rows[0]?.work_site_name || "Ohne Objekt",
        status: lastClockOut ? approvalStatus === "pending" ? "open" : "approved" : "missing",
        minutes: creditedMinutes,
        note: lastClockOut
          ? approvalStatus === "pending"
            ? `Überzeit wartet auf Freigabe · gutgeschrieben: ${minutesToHours(creditedMinutes)}`
            : "Freigegeben / gebucht"
          : "Noch offen"
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

function monthlyWorkedSeconds(entries: RawTimeEntry[]) {
  const rows = entries
    .filter((entry) => isSuccessfulTimeEntry(entry))
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  let seconds = 0;
  let clockIn: number | null = null;

  for (const row of rows) {
    const timestamp = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (!timestamp) continue;
    if (row.action === "clock_in" || row.action === "break_end") {
      clockIn = timestamp;
    }
    if (row.action === "break_start" && clockIn) {
      seconds += Math.max(0, Math.round((timestamp - clockIn) / 1000));
      clockIn = null;
    }
    if (row.action === "clock_out" && clockIn) {
      seconds += Math.max(0, Math.round((timestamp - clockIn) / 1000));
      clockIn = null;
    }
  }

  if (clockIn) seconds += Math.max(0, Math.round((Date.now() - clockIn) / 1000));
  return seconds;
}

function formatHM(seconds: number) {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
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
    building: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M3 21h18M8 7h2M8 11h2M8 15h2M14 9h3M14 13h3M14 17h3",
    inbox: "M4 12h4l2 3h4l2-3h4M4 12l1.5-6.5A2 2 0 0 1 7.44 4h9.12a2 2 0 0 1 1.94 1.5L20 12M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6",
    settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1.04-1.56V4.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1.04h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
    edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
    star: "m12 3 2.6 5.9 6.4.6-4.9 4.3 1.5 6.3L12 16.9 6.4 20.1l1.5-6.3-4.9-4.3 6.4-.6L12 3Z"
  };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.home} />
    </svg>
  );
}

function AppShell({ children, active, setActive, unreadCount = 0, employee, onOpenMenu, isAdmin }: { children: React.ReactNode; active: Tab; setActive: (tab: Tab) => void; unreadCount?: number; employee?: Employee | null; onOpenMenu: () => void; isAdmin?: boolean }) {
  // Fünf feste Reiter wie in der Vorlage. Beim Admin steht an zweiter Stelle
  // der Adminbereich statt der Inbox, beim Mitarbeiter die Inbox.
  const nav: Array<{ key: Tab; label: string; icon: string; badge?: number }> = [
    { key: "home", label: "Home", icon: "home" },
    isAdmin
      ? { key: "admin", label: "Admin", icon: "shield" }
      : { key: "notifications", label: "Inbox", icon: "inbox", badge: unreadCount },
    { key: "schedule", label: "Kalender", icon: "calendar" },
    { key: "search", label: "Suche", icon: "search" },
    { key: "chat", label: "Chat", icon: "chat" }
  ];

  return (
    <main className="min-h-[100dvh] bg-white text-ink-900 md:flex md:items-center md:justify-center md:bg-paper-100 md:p-6">
      <div className="relative flex h-[100dvh] min-h-0 w-full flex-col bg-white md:h-[860px] md:max-w-[430px] md:overflow-hidden md:rounded-[2rem] md:border md:border-paper-300 md:shadow-card">
        <Header unreadCount={unreadCount} employee={employee} onOpenNotifications={() => setActive("notifications")} onOpenMenu={onOpenMenu} />
        <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4">{children}</section>
        <nav
          className="grid grid-cols-5 gap-1 border-t border-paper-300 bg-white px-2 pt-2"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          {nav.map((item) => {
            const selected = active === item.key || (item.key === "schedule" && active === "taskdetail");
            return (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={`relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition ${selected ? "text-brand-600" : "text-ink-400 hover:text-ink-800"}`}
              >
                <Icon name={item.icon} />
                {item.label}
                {item.badge ? (
                  <span className="absolute right-2 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger-500 px-1 text-[9px] font-bold text-white">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>
    </main>
  );
}

function Header({ unreadCount = 0, employee, onOpenNotifications, onOpenMenu }: { unreadCount?: number; employee?: Employee | null; onOpenNotifications: () => void; onOpenMenu: () => void }) {
  const firstName = (employee?.name || "").split(" ")[0] || "Team";
  const initials = (employee?.name || "?").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
  return (
    <header
      className="sticky top-0 z-30 bg-white px-4 pb-3"
      style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
    >
      {/* Kopfzeile wie in der Vorlage: Bild, Begrüßung, Zahnrad. Die Glocke ist
          weg, ungelesene Meldungen stehen jetzt am Inbox-Reiter unten. */}
      <div className="flex items-center justify-between">
        <button onClick={onOpenMenu} className="flex min-w-0 items-center gap-3 text-left">
          {employee?.avatar_url ? (
            <img src={employee.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{initials}</div>
          )}
          <p className="truncate text-[22px] font-bold tracking-tight text-ink-900">Hallo, {firstName} 👋</p>
        </button>
        <button onClick={onOpenMenu} className="shrink-0 rounded-full p-2 text-ink-600" aria-label="Einstellungen öffnen">
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const angle = Math.round((percent / 100) * 360);
  return (
    <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#1D5FE0 ${angle}deg, #FFFFFF 0deg)` }}>
      <div className="grid h-[3.4rem] w-[3.4rem] place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{percent}%</div>
    </div>
  );
}

function EmployeeSelect({ employees, employeeName, onChange }: { employees: Employee[]; employeeName: string; onChange: (name: string) => void }) {
  if (!employees.length) return null;
  return (
    <select
      value={employeeName}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-paper-300 bg-white px-3 py-3 text-sm font-bold text-brand-700 outline-none"
    >
      {employees.map((employee) => (
        <option key={employee.id} value={employee.name}>{employee.name}</option>
      ))}
    </select>
  );
}

function Dashboard({ data, assignments, setActive, employeeName, onEmployeeChange, onOpenAssignment, onStartAssignment }: { data: AppData | null; assignments: Assignment[]; setActive: (tab: Tab) => void; employeeName: string; onEmployeeChange: (name: string) => void; onOpenAssignment: (assignment: Assignment) => void; onStartAssignment: (assignment: Assignment) => void }) {
  const employee = data?.employee;
  const todayTasks = assignments.filter((assignment) => assignment.date === todayIso());
  const doneToday = todayTasks.filter((assignment) => assignment.done).length;
  const openToday = todayTasks.length - doneToday;
  const progress = todayTasks.length ? Math.round((doneToday / todayTasks.length) * 100) : 0;
  const monthlySeconds = monthlyWorkedSeconds(data?.timeEntries || []);
  const monthlyLimitHours = employee?.monthly_hour_limit || 0;
  const monthlyPercent = monthlyLimitHours ? Math.min(100, Math.round((monthlySeconds / 3600 / monthlyLimitHours) * 100)) : 0;
  const birthday = birthdayInfo(employee);

  // Sieht ein Admin gerade jemand anderen an, zeigen wir dessen Arbeitsalltag,
  // nicht die Bueroeinstiege. Sonst steht bei "Matteo Stano" die Zeitenfreigabe.
  const viewingOther = Boolean(data?.isAdmin && data?.viewer?.name && data.viewer.name !== employee?.name);
  const showAdminShortcuts = Boolean(data?.isAdmin) && !viewingOther;

  // Schnellzugriffe wie in der Vorlage: Titel, erklärender Untertitel, farbige
  // Kachel. Für Admins die Büro-Einstiege, für Mitarbeiter der Arbeitsalltag.
  const quickAccess: Array<{ title: string; subtitle: string; icon: string; tile: string; tab?: Tab; href?: string }> = showAdminShortcuts
    ? [
        { title: "Einsatzübersicht", subtitle: "Übersicht aller Einsätze für heute", icon: "list", tile: "bg-sky-50 text-sky-600", href: "/mitarbeiter/admin/tageszentrale" },
        { title: "Zeitenfreigabe", subtitle: "Zeitstempel prüfen und freigeben", icon: "stopwatch", tile: "bg-emerald-50 text-emerald-600", href: "/mitarbeiter/admin/zeiten" },
        { title: "Abwesenheit", subtitle: "Abwesenheiten einreichen und einsehen", icon: "calendar", tile: "bg-emerald-50 text-emerald-600", tab: "absence" },
        { title: "Materialbestellung", subtitle: "Bestellungen einreichen und einsehen", icon: "box", tile: "bg-amber-100 text-amber-700", tab: "material" },
        { title: "Aufgaben", subtitle: "Aufgaben erstellen und verwalten", icon: "check", tile: "bg-violet-50 text-violet-600", tab: "tasks" }
      ]
    : [
        { title: "Stempeluhr", subtitle: "Ein- und ausstempeln am Objekt", icon: "stopwatch", tile: "bg-brand-50 text-brand-600", tab: "clock" },
        { title: "Stundenzettel", subtitle: "Zeiten sehen und nachtragen", icon: "clock", tile: "bg-sky-50 text-sky-600", tab: "timesheet" },
        { title: "Abwesenheit", subtitle: "Abwesenheiten einreichen und einsehen", icon: "calendar", tile: "bg-emerald-50 text-emerald-600", tab: "absence" },
        { title: "Materialbestellung", subtitle: "Bestellungen einreichen und einsehen", icon: "box", tile: "bg-amber-100 text-amber-700", tab: "material" },
        { title: "Qualitätskontrolle", subtitle: "Bewerten und Nachweis senden", icon: "note", tile: "bg-violet-50 text-violet-600", tab: "quality" }
      ];

  return (
    <div className="space-y-5">
      {data?.isAdmin ? (
        <div className="space-y-2">
          <EmployeeSelect employees={data?.employees || []} employeeName={employeeName} onChange={onEmployeeChange} />
          {viewingOther ? (
            <div className="flex items-center gap-3 rounded-xl bg-amber-100 px-4 py-3">
              <span className="shrink-0 text-amber-700"><UiIcon name="user" className="h-[20px] w-[20px]" /></span>
              <p className="min-w-0 flex-1 text-[14px] text-amber-700">
                Du siehst die Ansicht von <span className="font-semibold">{employee?.name}</span>. Angemeldet bist du als {data?.viewer?.name}.
              </p>
              <button onClick={() => onEmployeeChange(data?.viewer?.name || "")} className="shrink-0 text-[14px] font-semibold text-amber-700">Zurück</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {birthday?.isToday ? (
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="text-[17px] font-bold text-ink-900">Alles Gute zum Geburtstag, {employee?.name?.split(" ")[0] || "Team"}! 🎉</p>
          <p className="mt-1 text-[14px] text-ink-600">Ich wünsche dir einen starken Tag, Gesundheit und viele gute Momente.</p>
        </div>
      ) : birthday && birthday.daysUntil <= 14 ? (
        <Banner tone="info">Dein Geburtstag ist {birthday.nextLabel} · {birthday.date}</Banner>
      ) : null}

      {/* Stundenzettel-Karte, wie im Referenzdesign: helles Blau, Fortschrittsring, große Stundenanzeige, Pfeil führt zur Detailansicht. */}
      <button onClick={() => setActive("timesheet")} className="flex w-full items-center gap-4 rounded-3xl bg-brand-50 p-5 text-left">
        <ProgressRing percent={monthlyPercent} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-600">Dein Stundenzettel</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-ink-900">{formatHM(monthlySeconds)}<span className="text-base font-bold text-ink-400"> h</span></p>
          {monthlyLimitHours ? <p className="text-sm text-ink-400">/ {monthlyLimitHours}:00 h</p> : <p className="text-sm text-ink-400">diesen Monat</p>}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-brand-600">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </span>
      </button>

      {/* Heutige Aufgaben als Karten zum Wischen, eine nach der anderen, mit
          Startknopf. So steht in der Vorlage immer genau eine im Blick. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] text-ink-400">Heutige Aufgaben</h2>
          <span className="text-[14px] text-ink-400">{doneToday}/{todayTasks.length || 0}</span>
        </div>

        {todayTasks.length === 0 ? (
          <EmptyState icon="calendar" title="Heute nichts geplant" text="Für heute sind keine Einsätze eingetragen." />
        ) : (
          <>
            <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
              {todayTasks.map((assignment) => (
                <article key={assignment.id} className="w-[85%] shrink-0 snap-start rounded-2xl border border-paper-200 p-4">
                  <button onClick={() => onOpenAssignment(assignment)} className="block w-full text-left">
                    <p className="flex items-center gap-2 text-[14px] font-medium text-amber-700">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <span className="truncate">{assignment.tag}</span>
                    </p>
                    <p className="mt-1.5 text-[18px] font-bold text-ink-900">{assignment.title}</p>
                    <p className="mt-1 text-[14px] text-ink-400">
                      {assignment.time}
                      {plannedMinutesOf(assignment.raw) ? ` · ${hhmm(plannedMinutesOf(assignment.raw))} h` : ""}
                    </p>
                  </button>
                  <div className="mt-3 flex items-center justify-between">
                    <StatusPill tone={assignment.done ? "success" : "neutral"}>{assignment.done ? "Erledigt" : "Offen"}</StatusPill>
                    {!assignment.done ? (
                      <button
                        onClick={() => onStartAssignment(assignment)}
                        className="grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white"
                        aria-label="Schicht starten"
                      >
                        <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            {todayTasks.length > 1 ? (
              <div className="mt-2 flex justify-center gap-1.5">
                {todayTasks.map((assignment) => <span key={assignment.id} className="h-1.5 w-1.5 rounded-full bg-paper-300" />)}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-[15px] text-ink-400">Schnellzugriffe</h2>
        <div className="divide-y divide-paper-200">
          {quickAccess.map((item) => {
            const inner = (
              <>
                <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", item.tile)}>
                  <UiIcon name={item.icon} className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-ink-900">{item.title}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-400">{item.subtitle}</span>
                </span>
                <UiIcon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-200" />
              </>
            );
            const className = "flex w-full items-center gap-3 py-3 text-left";
            return item.href
              ? <a key={item.title} href={item.href} className={className}>{inner}</a>
              : <button key={item.title} onClick={() => item.tab && setActive(item.tab)} className={className}>{inner}</button>;
          })}
        </div>
        <button onClick={() => setActive("menu")} className="mt-3 w-full rounded-xl border border-paper-200 py-3 text-[15px] font-semibold text-brand-700">
          Alle Funktionen
        </button>
      </section>
    </div>
  );
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-paper-300 bg-white p-4">
      <p className="font-black text-ink-800">{title}</p>
      <p className="mt-1 text-sm text-ink-400">{text}</p>
    </div>
  );
}

function Activity({ label, time }: { label: string; time: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />
      <div>
        <p className="font-semibold text-ink-800">{label}</p>
        <p className="text-xs text-ink-400">{time}</p>
      </div>
    </div>
  );
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
const MONTH_LONG = new Intl.DateTimeFormat("de-DE", { month: "long" });

function plannedMinutesOf(task?: RawTask | null) {
  return Number(task?.planned_minutes || task?.max_minutes || task?.paid_minutes || task?.wage_minutes || 0);
}

function weekdayShort(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : WEEKDAY_SHORT.format(date).replace(".", "");
}

function dayNumber(iso: string) {
  return Number(iso.slice(8, 10)) || "";
}

function monthTitle(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : MONTH_LONG.format(date);
}

/** Kurzansicht als Blatt über der Liste, wie in der Vorlage. */
function AssignmentSheet({ assignment, onClose, onOpenAssignment, onStart }: {
  assignment: Assignment;
  onClose: () => void;
  onOpenAssignment: (assignment: Assignment) => void;
  onStart: (assignment: Assignment) => void;
}) {
  const task = assignment.raw;
  const planned = plannedMinutesOf(task);

  return (
    <DetailSheet
      title={assignment.title}
      subtitle={`${formatDateDE(assignment.date)} · ${assignment.time}`}
      status={<StatusPill tone={assignment.done ? "success" : "neutral"}>{assignment.done ? "Erledigt" : "Offen"}</StatusPill>}
      onClose={onClose}
      footer={
        <ActionBar>
          <Button variant="neutral" onClick={() => { onClose(); onOpenAssignment(assignment); }}>Alle Details</Button>
          <Button variant="primary" onClick={() => { onClose(); onStart(assignment); }}>Stempeln</Button>
        </ActionBar>
      }
    >
      <DetailRow icon="pin" label="Objekt" value={assignment.address} hint={assignment.customer} />
      <DetailRow icon="list" label="Auftrag" value={assignment.tag} />
      <DetailRow icon="clock" label="Zeitraum" value={assignment.time} />
      <DetailRow icon="target" label="Eingeplante Zeit" value={planned ? `${hhmm(planned)} h` : "Keine Vorgabe"} />
      {task?.notes ? <DetailRow icon="note" label="Hinweis vom Büro" value={task.notes} /> : null}
      <div className="px-4 pt-4">
        <a
          href={mapSearchUrl(task || null)}
          target="_blank"
          rel="noreferrer"
          className="block rounded-xl border border-paper-200 px-4 py-3 text-center text-[15px] font-semibold text-ink-800"
        >
          Route öffnen
        </a>
      </div>
    </DetailSheet>
  );
}

/** Wochenkalender: Tagesstreifen oben, darunter die Aufgaben des gewählten Tages. */
function Schedule({ assignments, onOpenAssignment, onStartAssignment }: { assignments: Assignment[]; onOpenAssignment: (assignment: Assignment) => void; onStartAssignment: (assignment: Assignment) => void }) {
  const [sheetAssignment, setSheetAssignment] = useState<Assignment | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const weekStart = startOfWeekIso(selectedDay);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index)), [weekStart]);

  const countByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of assignments) {
      if (!assignment.date) continue;
      counts.set(assignment.date, (counts.get(assignment.date) || 0) + 1);
    }
    return counts;
  }, [assignments]);

  const dayAssignments = useMemo(() => assignments
    .filter((assignment) => assignment.date === selectedDay)
    .sort((a, b) => String(a.raw?.start_time || "99:99").localeCompare(String(b.raw?.start_time || "99:99"))), [assignments, selectedDay]);

  const doneCount = dayAssignments.filter((assignment) => assignment.done).length;
  const overdueCount = dayAssignments.filter((assignment) => !assignment.done && String(assignment.date || "") < todayIso()).length;
  const openCount = dayAssignments.length - doneCount - overdueCount;
  const progress = dayAssignments.length ? Math.round((doneCount / dayAssignments.length) * 100) : 0;
  const plannedMinutes = dayAssignments.reduce((sum, assignment) => sum + plannedMinutesOf(assignment.raw), 0);
  const isToday = selectedDay === todayIso();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">{monthTitle(selectedDay)}</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setSelectedDay(addDaysIso(selectedDay, -7))} className="grid h-9 w-9 place-items-center rounded-full text-ink-600" aria-label="Woche zurück">
            <UiIcon name="chevronLeft" className="h-5 w-5" />
          </button>
          <button onClick={() => setSelectedDay(todayIso())} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-brand-700">Heute</button>
          <button onClick={() => setSelectedDay(addDaysIso(selectedDay, 7))} className="grid h-9 w-9 place-items-center rounded-full text-ink-600" aria-label="Woche vor">
            <UiIcon name="chevronRight" className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const selected = day === selectedDay;
          const hasTasks = (countByDay.get(day) || 0) > 0;
          const today = day === todayIso();
          return (
            <button key={day} onClick={() => setSelectedDay(day)} className="flex flex-col items-center gap-1.5 py-1">
              <span className={cx("text-[13px]", selected ? "font-semibold text-ink-900" : "text-ink-400")}>{weekdayShort(day)}</span>
              <span
                className={cx(
                  "grid h-10 w-10 place-items-center rounded-full text-[16px]",
                  selected ? "bg-brand-600 font-semibold text-white" : today ? "border border-brand-600 font-semibold text-brand-700" : "border border-paper-200 text-ink-600"
                )}
              >
                {dayNumber(day)}
              </span>
              <span className={cx("h-1.5 w-1.5 rounded-full", hasTasks ? (selected ? "bg-brand-600" : "bg-paper-300") : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      {/* Statusboxen wie in der Vorlage: auf einen Blick, was der Tag bedeutet. */}
      <div className="space-y-2">
        <StatusBox tone="danger" label="Überfällig" count={overdueCount} />
        <StatusBox tone="warn" label="Offen" count={openCount} />
        <StatusBox tone="success" label="Erledigt" count={doneCount} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] text-ink-400">{isToday ? "Heutige Aufgaben" : `Aufgaben am ${formatDayMonthDE(selectedDay)}`}</p>
        <div className="flex items-center gap-2">
          <span className="text-[14px] text-ink-400">{doneCount}/{dayAssignments.length}</span>
          <span className="block h-1.5 w-24 rounded-full bg-paper-200">
            <span className="block h-1.5 rounded-full bg-success-500 transition-all" style={{ width: `${progress}%` }} />
          </span>
        </div>
      </div>

      {dayAssignments.length ? (
        <div className="divide-y divide-paper-200">
          {dayAssignments.map((assignment) => <TaskRow key={assignment.id} assignment={assignment} onOpenAssignment={setSheetAssignment} />)}
        </div>
      ) : (
        <EmptyState icon="calendar" title="Keine Einsätze an diesem Tag" text="Wähle oben einen anderen Tag." />
      )}

      {sheetAssignment ? (
        <AssignmentSheet
          assignment={sheetAssignment}
          onClose={() => setSheetAssignment(null)}
          onOpenAssignment={onOpenAssignment}
          onStart={onStartAssignment}
        />
      ) : null}

      {plannedMinutes ? (
        <p className="pt-1 text-[14px] text-ink-400">Geplante Zeit an diesem Tag: <span className="font-semibold text-ink-800">{hhmm(plannedMinutes)} h</span></p>
      ) : null}
    </div>
  );
}

/** Farbige Statusbox mit Zahl, wie in der Vorlage. */
function StatusBox({ tone, label, count }: { tone: "danger" | "warn" | "success"; label: string; count: number }) {
  const styles = {
    danger: "border-danger-500 bg-danger-50 text-danger-700",
    warn: "border-amber-500 bg-amber-100 text-amber-700",
    success: "border-success-500 bg-success-50 text-success-700"
  }[tone];
  return (
    <div className={cx("flex items-center justify-between rounded-xl border px-4 py-3", styles)}>
      <span className="text-[16px] font-semibold">{label}</span>
      <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-[14px] font-bold">{count}</span>
    </div>
  );
}

/** Einsatzzeile: Art farbig, Objekt fett, Zeitfenster grau, rechts Status und Dauer. */
function TaskRow({ assignment, onOpenAssignment, onStart }: { assignment: Assignment; onOpenAssignment?: (assignment: Assignment) => void; onStart?: (assignment: Assignment) => void }) {
  const minutes = plannedMinutesOf(assignment.raw);
  const start = formatTime(assignment.raw?.start_time);
  const end = formatTime(assignment.raw?.end_time);
  const overdue = !assignment.done && assignment.priority === "overdue";

  return (
    <div className="flex items-start gap-3 py-4">
      <button onClick={() => onOpenAssignment?.(assignment)} className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-2 text-[14px] font-medium text-amber-700">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <span className="truncate">{assignment.tag}</span>
        </p>
        <p className="mt-1.5 text-[17px] font-bold text-ink-900">{assignment.title}</p>
        <p className="mt-1 text-[14px] text-ink-400">
          {formatDayMonthDE(assignment.date)}
          {start !== "—" ? `  ${start}${end !== "—" ? ` → ${end}` : ""} Uhr` : "  Zeit offen"}
          {minutes ? ` · ${hhmm(minutes)} h` : ""}
        </p>
        {overdue ? <p className="mt-1 text-[13px] font-medium text-danger-600">Überfällig</p> : null}
      </button>

      {/* Direkt starten, ohne Umweg über die Detailansicht. */}
      {onStart && !assignment.done ? (
        <button
          onClick={() => onStart(assignment)}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-600 text-white"
          aria-label="Schicht starten"
        >
          <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </button>
      ) : (
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusPill tone={assignment.done ? "success" : "neutral"}>{assignment.done ? "Erledigt" : "Offen"}</StatusPill>
          {!onStart ? <span className="text-[16px] font-bold text-ink-900">{minutes ? `${hhmm(minutes)} h` : "—"}</span> : null}
        </div>
      )}
    </div>
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
  const [detailTab, setDetailTab] = useState<"task" | "log">("task");
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

  const priority = normalizePriority(task);
  const priorityLabel = priority === "urgent" ? "Hoch" : priority === "overdue" ? "Überfällig" : "Mittel";
  const planned = plannedMinutesOf(task);

  return (
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="truncate text-[22px] font-bold text-ink-900">{task.title || task.site || "Einsatz"}</h1>
          <p className="truncate text-[14px] text-ink-400">{task.site || task.customer_name || "Ohne Objekt"} · {formatDateDE(task.task_date)}</p>
        </div>
        <div className="pr-2 pt-2">
          <StatusPill tone={task.done ? "success" : "neutral"}>{task.done ? "Erledigt" : "Offen"}</StatusPill>
        </div>
      </div>

      <div className="mt-3">
        <SegmentedTabs
          tabs={[{ key: "task", label: "Aufgabe" }, { key: "log", label: "Logbuch" }]}
          value={detailTab}
          onChange={setDetailTab}
        />
      </div>

      {detailTab === "task" ? (
        <>
          <DetailRow icon="pin" label="Objekt" value={task.site || "Ohne Objekt"} hint={task.customer_name || undefined} />
          <DetailRow icon="list" label="Auftrag" value={task.task_category || task.task_type || "Reinigung"} />
          <DetailRow icon="user" label="Mitarbeiter" value={task.employee_name || "Nicht zugewiesen"} />
          <DetailRow icon="priority" label="Priorität" value={priorityLabel} tone={priority === "overdue" ? "danger" : "default"} />

          <SectionHeading>Zeitangaben</SectionHeading>
          <DetailRow icon="calendar" label="Datum" value={formatDateDE(task.task_date)} />
          <div className="px-4 pb-1 pt-2">
            <div className="grid grid-cols-3 divide-x divide-paper-200 rounded-xl bg-paper-100 py-3 text-center">
              <div>
                <p className="text-[13px] text-ink-400">Startzeit</p>
                <p className="mt-0.5 text-[17px] font-semibold text-ink-900">{formatTime(task.start_time)}</p>
              </div>
              <div>
                <p className="text-[13px] text-ink-400">Endzeit</p>
                <p className="mt-0.5 text-[17px] font-semibold text-ink-900">{formatTime(task.end_time)}</p>
              </div>
              <div>
                <p className="text-[13px] text-ink-400">Dauer</p>
                <p className="mt-0.5 text-[17px] font-semibold text-brand-600">{planned ? `${hhmm(planned)} h` : "—"}</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-paper-200 px-4">
            <div className="flex items-center justify-between py-3">
              <span className="text-[15px] text-ink-600">Pausenzeit</span>
              <span className="text-[15px] font-semibold text-ink-900">{Number(task.break_minutes || 0)} min</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[15px] text-ink-600">Fahrzeit</span>
              <span className="text-[15px] font-semibold text-ink-900">{Number(task.travel_minutes || 0)} min</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[15px] text-ink-600">Bezahlte Zeit</span>
              <span className="text-[15px] font-semibold text-brand-600">{hhmm(Number(task.paid_minutes || task.wage_minutes || planned || 0))} h</span>
            </div>
          </div>

          {task.notes ? (
            <>
              <SectionHeading>Kommentar</SectionHeading>
              <p className="px-4 pb-1 text-[15px] text-ink-800">{task.notes}</p>
            </>
          ) : null}

          <SectionHeading>Checkliste</SectionHeading>
          {planItems.length ? planItems.slice(0, 12).map((item) => (
            <DetailRow
              key={item.id}
              icon="check"
              label={item.area || "Bereich"}
              value={item.task_title || "Aufgabe"}
              hint={item.task_description || undefined}
            />
          )) : (
            <p className="px-4 py-3 text-[14px] text-ink-400">Für dieses Objekt ist noch kein Reinigungsplan hinterlegt.</p>
          )}

          <div className="space-y-3 px-4 pb-2 pt-5">
            {!siteHasGps ? (
              <Banner tone="warn">Für dieses Objekt fehlen die GPS-Koordinaten. Bis sie im Admin-Bereich hinterlegt sind, ist das Stempeln gesperrt.</Banner>
            ) : (
              <Banner tone="info">GPS-Prüfung aktiv. Erlaubter Abstand zum Objekt: {getSiteRadius(site)} m.</Banner>
            )}
            {message ? <Banner tone="success">{message}</Banner> : null}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="primary" onClick={() => onOpenClock(task)}>Stempeln</Button>
              <Button variant="neutral" onClick={() => onOpenQuality(task)}>Qualitätsnachweis</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <a href={mapSearchUrl(task)} target="_blank" rel="noreferrer" className="rounded-xl border border-paper-300 bg-paper-100 px-4 py-3.5 text-center text-[16px] font-semibold text-ink-800">Route öffnen</a>
              <Button variant={task.done ? "neutral" : "success"} disabled={saving} onClick={() => toggleDone(!task.done)}>
                {task.done ? "Wieder öffnen" : "Aufgabe erledigen"}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <SectionHeading>Ablauf</SectionHeading>
          <DetailRow icon={hasClockIn ? "check" : "clock"} label="1. Am Objekt einchecken" value={hasClockIn ? "Erledigt" : "Offen"} />
          <DetailRow icon={task.done ? "check" : "clock"} label="2. Reinigung erledigen" value={task.done ? "Erledigt" : "Offen"} />
          <DetailRow icon={hasClockOut ? "check" : "clock"} label="3. Ausstempeln" value={hasClockOut ? "Erledigt" : "Offen"} />

          <SectionHeading>Zeitbuchungen</SectionHeading>
          {entries.length ? entries.map((entry) => (
            <DetailRow
              key={entry.id}
              icon={entry.action === "clock_out" ? "logout" : entry.action === "clock_in" ? "login" : "coffee"}
              label={actionLabel(entry.action)}
              value={entry.created_at ? formatTime(entry.created_at) : "—"}
              hint={`${entry.work_site_name || task.site || "Objekt"}${typeof entry.distance_m === "number" ? ` · ${entry.distance_m} m vom Objekt` : ""}`}
            />
          )) : <p className="px-4 py-3 text-[14px] text-ink-400">Für diesen Einsatz wurde noch nicht gestempelt.</p>}
        </>
      )}
    </div>
  );
}

function expectedStartIso(task: RawTask | null) {
  if (!task?.task_date || !task.start_time) return null;
  const value = `${task.task_date}T${task.start_time.length === 5 ? `${task.start_time}:00` : task.start_time}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function Clock({ data, authToken, onReload, selectedTaskId, onOpenSchedule, autoStamp = false }: { data: AppData | null; authToken: string; onReload: () => Promise<void>; selectedTaskId: string | null; onOpenSchedule: () => void; autoStamp?: boolean }) {
  const [status, setStatus] = useState<ClockStatus>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastGps, setLastGps] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [reasonPrompt, setReasonPrompt] = useState<{ action: "clock_in" | "break_start" | "break_end" | "clock_out"; message: string } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [geoCheck, setGeoCheck] = useState<{ distance: number; allowed: number; ok: boolean; accuracy: number | null; latitude: number; longitude: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [checkingGeo, setCheckingGeo] = useState(false);
  const [autoInfo, setAutoInfo] = useState<string | null>(null);
  const autoDone = useRef(false);
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

  /** Standort messen und mit dem Objekt vergleichen, damit vor dem Tippen klar ist, ob es geht. */
  const checkPosition = useCallback(async () => {
    const siteLat = selectedClockSite?.latitude ?? null;
    const siteLng = selectedClockSite?.longitude ?? null;
    if (siteLat === null || siteLng === null) return;
    setCheckingGeo(true);
    setGeoError(null);
    try {
      const position = await getBrowserPosition();
      const distance = distanceMeters(position.latitude, position.longitude, siteLat, siteLng);
      const allowed = selectedClockSite?.allowedRadiusM || 150;
      setGeoCheck({ distance, allowed, ok: distance <= allowed, accuracy: position.accuracy, latitude: position.latitude, longitude: position.longitude });
    } catch (error) {
      setGeoCheck(null);
      setGeoError(error instanceof Error ? error.message : "Standort konnte nicht gelesen werden.");
    } finally {
      setCheckingGeo(false);
    }
  }, [selectedClockSite?.latitude, selectedClockSite?.longitude, selectedClockSite?.allowedRadiusM]);

  useEffect(() => {
    setGeoCheck(null);
    setGeoError(null);
    if (selectedTask?.id && selectedSiteHasGps) checkPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask?.id, selectedSiteHasGps]);

  async function stamp(action: "clock_in" | "break_start" | "break_end" | "clock_out", reason?: string) {
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
          reason: reason || "",
          expectedStartTime: expectedStartIso(selectedTask)
        })
      });
      const result = await response.json();

      // Das Büro braucht eine Begründung: erst nachfragen, dann noch einmal senden.
      if (!response.ok && result?.reasonRequired) {
        setReasonPrompt({ action, message: result.error || "Bitte kurz begründen." });
        setReasonText("");
        setMessage(null);
        return;
      }

      if (!response.ok || !result.ok) throw new Error(result.error || "Speichern fehlgeschlagen");
      setReasonPrompt(null);
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

  const canStamp = Boolean(selectedTask && selectedTask.work_site_id && selectedSiteHasGps);

  /**
   * Kommt der Aufruf vom Aufkleber am Objekt, wird ohne weiteres Tippen
   * eingestempelt. Ausgestempelt wird bewusst nicht automatisch: das Telefon
   * kommt beim Weggehen noch einmal am Aufkleber vorbei, und eine versehentlich
   * beendete Schicht kostet mehr als ein Fingertipp.
   *
   * Der Stand wird direkt aus den Buchungen gelesen, nicht aus dem Status im
   * Bildschirm. Der hinkt beim ersten Aufbau einen Durchlauf hinterher, sonst
   * würde bei einer laufenden Schicht ein zweites Mal eingestempelt.
   */
  useEffect(() => {
    if (!autoStamp || autoDone.current) return;
    if (!data?.employee || !selectedTask || !canStamp) return;

    autoDone.current = true;
    const laufend = latestClock(selectedTaskEntries).status;

    if (laufend === "working") {
      setAutoInfo("Du bist an diesem Objekt schon eingestempelt. Zum Beenden unten auf Ausstempeln tippen.");
      return;
    }
    if (laufend === "break") {
      setAutoInfo("Deine Pause läuft noch. Tippe auf Pause beenden, um weiterzuarbeiten.");
      return;
    }

    setAutoInfo("Aufkleber erkannt. Du wirst eingestempelt…");
    stamp("clock_in").then(() => setAutoInfo(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStamp, data?.employee, selectedTask?.id, canStamp]);

  const blockReason = !selectedTask
    ? null
    : !selectedTask.work_site_id
      ? "Dieser Einsatz hat kein Objekt. Das Büro muss zuerst eins hinterlegen."
      : !selectedSiteHasGps
        ? "Für dieses Objekt fehlen die GPS-Koordinaten. Das Büro muss sie zuerst speichern."
        : null;

  return (
    <div className="-mx-4 -mt-4">
      <div className="px-4 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Stempeluhr</h1>
      </div>

      {autoInfo ? (
        <div className="px-4 pt-3">
          <Banner tone="info">{autoInfo}</Banner>
        </div>
      ) : null}

      {!selectedTask ? (
        <div className="space-y-3 px-4 pt-4">
          <Banner tone="warn">Stempeln geht nur aus einem Einsatz heraus. Öffne im Kalender den Einsatz und tippe dort auf „Stempeln“.</Banner>
          <Button variant="primary" full onClick={onOpenSchedule}>Zum Kalender</Button>
        </div>
      ) : null}

      {/* Karte: Objekt als Markierung, Ausschnitt umfasst auch den eigenen Standort. */}
      {selectedTask && selectedSiteHasGps && selectedClockSite?.latitude !== null && selectedClockSite?.longitude !== null ? (
        <div className="px-4 pt-4">
          <div className="overflow-hidden rounded-xl border border-paper-200">
            <iframe
              key={`${selectedClockSite?.latitude}-${selectedClockSite?.longitude}-${geoCheck?.latitude || ""}`}
              title="Karte zum Objekt"
              src={osmEmbedUrl(selectedClockSite!.latitude!, selectedClockSite!.longitude!, geoCheck?.latitude, geoCheck?.longitude)}
              className="h-44 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="mt-1.5 text-[13px] text-ink-400">
            Markierung ist das Objekt{geoCheck ? ` · du bist ${geoCheck.distance} m entfernt` : ""}. Erlaubt sind {selectedClockSite?.allowedRadiusM || 150} m.
          </p>
        </div>
      ) : null}

      <div className="px-4 pt-5 text-center">
        <StatusPill tone={status === "working" ? "success" : status === "break" ? "warn" : "neutral"}>{statusText}</StatusPill>
        <p className="mt-4 font-mono text-[44px] font-bold leading-none tracking-tight text-ink-900 tabular-nums">{formatDuration(seconds)}</p>
        <p className="mt-2 text-[14px] text-ink-400">heute gesamt · {selectedSiteName}</p>
      </div>

      <div className="px-4 pb-1 pt-6">
        {status === "idle" ? (
          <Button variant="primary" full disabled={saving || locating || !data?.employee || !canStamp} onClick={() => stamp("clock_in")}>
            {locating ? "Standort wird geprüft…" : saving ? "Speichere…" : "Einstempeln"}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {status === "break" ? (
              <Button variant="primary" disabled={saving || locating || !canStamp} onClick={() => stamp("break_end")}>
                {locating ? "Standort…" : "Pause beenden"}
              </Button>
            ) : (
              <Button variant="neutral" disabled={saving || locating || !canStamp} onClick={() => stamp("break_start")}>
                {locating ? "Standort…" : "Pause"}
              </Button>
            )}
            <Button variant="danger" disabled={saving || locating || !canStamp} onClick={() => stamp("clock_out")}>
              {locating ? "Standort…" : "Ausstempeln"}
            </Button>
          </div>
        )}
      </div>

      {message ? <div className="px-4 pt-3"><Banner tone={message.startsWith("Gespeichert") ? "success" : "danger"}>{message}</Banner></div> : null}
      {blockReason ? <div className="px-4 pt-3"><Banner tone="warn">{blockReason}</Banner></div> : null}

      {/* Standortlage vor dem Tippen zeigen, damit niemand raten muss, warum es klemmt. */}
      {selectedTask && selectedSiteHasGps ? (
        <div className="px-4 pt-3">
          <div className={cx(
            "flex items-start gap-3 rounded-xl px-4 py-3",
            checkingGeo ? "bg-paper-100" : geoError ? "bg-amber-100" : geoCheck ? (geoCheck.ok ? "bg-success-50" : "bg-danger-50") : "bg-paper-100"
          )}>
            <span className={cx(
              "mt-0.5 shrink-0",
              geoError ? "text-amber-700" : geoCheck ? (geoCheck.ok ? "text-success-600" : "text-danger-500") : "text-ink-400"
            )}>
              <UiIcon name={geoCheck && !geoCheck.ok ? "warning" : "pin"} className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0 flex-1">
              {checkingGeo ? (
                <p className="text-[15px] text-ink-600">Standort wird geprüft…</p>
              ) : geoError ? (
                <>
                  <p className="text-[15px] font-semibold text-amber-700">Standort nicht verfügbar</p>
                  <p className="mt-0.5 text-[13px] text-amber-700">{geoError}</p>
                </>
              ) : geoCheck ? (
                <>
                  <p className={cx("text-[15px] font-semibold", geoCheck.ok ? "text-success-700" : "text-danger-600")}>
                    {geoCheck.ok
                      ? `Du bist am Objekt · ${geoCheck.distance} m entfernt`
                      : `Zu weit weg · ${geoCheck.distance} m entfernt`}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-600">
                    {geoCheck.ok
                      ? `Erlaubt sind ${geoCheck.allowed} m. Einstempeln ist möglich.`
                      : `Erlaubt sind ${geoCheck.allowed} m. Geh näher ans Objekt, dann geht es.`}
                    {geoCheck.accuracy ? ` Messgenauigkeit ca. ${geoCheck.accuracy} m.` : ""}
                  </p>
                </>
              ) : (
                <p className="text-[15px] text-ink-600">Standort noch nicht geprüft</p>
              )}
            </div>
            <button onClick={checkPosition} disabled={checkingGeo} className="shrink-0 text-[14px] font-semibold text-brand-700 disabled:opacity-50">
              {checkingGeo ? "…" : "Prüfen"}
            </button>
          </div>
        </div>
      ) : null}

      {selectedAssignment ? (
        <>
          <SectionHeading>Einsatz</SectionHeading>
          <DetailRow icon="pin" label="Objekt" value={selectedAssignment.title} hint={selectedAssignment.customer} />
          <DetailRow icon="calendar" label="Datum" value={formatDateDE(selectedAssignment.date)} />
          <DetailRow icon="clock" label="Zeitraum" value={selectedAssignment.time} />
          <DetailRow
            icon="target"
            label="Standortprüfung"
            value={selectedSiteHasGps ? `Aktiv · ${selectedClockSite?.allowedRadiusM || 150} m erlaubt` : "Nicht möglich"}
            hint={lastGps ? `Zuletzt gemessen: Genauigkeit ca. ${lastGps.accuracy || "—"} m` : undefined}
            tone={selectedSiteHasGps ? "default" : "danger"}
          />
        </>
      ) : null}

      <SectionHeading right={!selectedTask && assignments.length ? <button onClick={onOpenSchedule} className="text-[14px] font-semibold text-brand-700">Einsatz wählen</button> : undefined}>
        Letzte Stempel
      </SectionHeading>
      {latestTwo.length ? latestTwo.map((entry) => (
        <DetailRow
          key={entry.id}
          icon={entry.action === "clock_out" ? "logout" : entry.action === "clock_in" ? "login" : "coffee"}
          label={actionLabel(entry.action)}
          value={entry.created_at ? formatTime(entry.created_at) : "—"}
          hint={`${entry.work_site_name || "Ohne Objekt"}${typeof entry.distance_m === "number" ? ` · ${entry.distance_m} m vom Objekt` : ""}`}
        />
      )) : <p className="px-4 py-3 text-[14px] text-ink-400">Heute wurde noch nicht gestempelt.</p>}

      {reasonPrompt ? (
        <BottomSheet
          title="Kurz begründen"
          onClose={() => setReasonPrompt(null)}
          footer={
            <Button
              variant="primary"
              full
              disabled={saving || locating || reasonText.trim().length < 3}
              onClick={() => stamp(reasonPrompt.action, reasonText.trim())}
            >
              {saving ? "Sende…" : "Begründung senden und ausstempeln"}
            </Button>
          }
        >
          <Banner tone="warn">{reasonPrompt.message}</Banner>
          <div className="flex flex-wrap gap-2 pt-1">
            {["Zusatzarbeit angefallen", "Objekt war stärker verschmutzt", "Ausstempeln vergessen", "Warten auf Zugang", "Material geholt"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReasonText(preset)}
                className={cx(
                  "rounded-full border px-3.5 py-2 text-[13px]",
                  reasonText === preset ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 text-ink-600"
                )}
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            value={reasonText}
            onChange={(event) => setReasonText(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-paper-200 px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500"
            placeholder="Eigene Begründung schreiben…"
          />
          <p className="text-[13px] text-ink-400">Das Büro entscheidet danach, welche Zeit gebucht wird.</p>
        </BottomSheet>
      ) : null}
    </div>
  );
}

/** Einsatz, der gelaufen ist, aber nie gestempelt wurde. */
type MissingShift = {
  task: RawTask;
  day: string;
  plannedMinutes: number;
};

const NACHTRAG_REASONS = ["Stempeln vergessen", "Kein Empfang am Objekt", "Handy war leer", "Kurzfristig eingesprungen", "Sonstiges"];

/** Vergangene Einsätze ohne erfasste Zeit finden. */
function missingShiftsFrom(tasks: RawTask[], rawEntries: RawTimeEntry[]): MissingShift[] {
  const bookedTaskIds = new Set(
    rawEntries.filter((entry) => entry.action === "clock_out" && isSuccessfulTimeEntry(entry) && entry.task_id).map((entry) => String(entry.task_id))
  );
  const today = todayIso();
  return tasks
    .filter((task) => {
      const day = String(task.task_date || "").slice(0, 10);
      if (!day || day > today) return false;
      return !bookedTaskIds.has(task.id);
    })
    .map((task) => ({ task, day: String(task.task_date).slice(0, 10), plannedMinutes: plannedMinutesOf(task) }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

function dayGroupLabel(day: string) {
  const today = todayIso();
  if (day === today) return "Heute";
  if (day === addDaysIso(today, -1)) return "Gestern";
  return formatDateDE(day);
}

function NachtragSheet({ shift, authToken, onClose, onDone }: { shift: MissingShift; authToken: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [startTime, setStartTime] = useState(formatTime(shift.task.start_time) === "—" ? "" : formatTime(shift.task.start_time));
  const [endTime, setEndTime] = useState(formatTime(shift.task.end_time) === "—" ? "" : formatTime(shift.task.end_time));
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gross = minutesBetweenHm(startTime, endTime);
  const net = Math.max(0, gross - Number(breakMinutes || 0));

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/time-entry/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ taskId: shift.task.id, startTime, endTime, breakMinutes: Number(breakMinutes || 0), reason })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Zeit konnte nicht nachgetragen werden.");
      await onDone();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Zeit konnte nicht nachgetragen werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      title="Zeit nachtragen"
      onClose={onClose}
      footer={
        <Button variant="primary" full disabled={saving || !reason || net <= 0} onClick={submit}>
          {saving ? "Sende…" : "Zeit nachtragen"}
        </Button>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold text-ink-900">{shift.task.site || shift.task.customer_name || "Einsatz"}</p>
          <p className="text-[14px] text-ink-400">{shift.task.task_category || shift.task.task_type || "Reinigung"}</p>
        </div>
        <StatusPill tone="pending">Nicht erfasst</StatusPill>
      </div>

      <DetailRow icon="calendar" label="Erledigt am" value={formatDateDE(shift.day)} />

      <div className="grid grid-cols-2 gap-3 pt-1">
        <TileInput icon="login" label="Von" value={startTime} onChange={setStartTime} placeholder="17:00" />
        <TileInput icon="logout" label="Bis" value={endTime} onChange={setEndTime} placeholder="18:00" />
      </div>

      <TileInput icon="coffee" label="Pausenzeit" value={breakMinutes} onChange={setBreakMinutes} inputMode="numeric" suffix="min" />

      <div>
        <p className="pb-2 text-[13px] text-ink-400">Nachtragegrund</p>
        <div className="flex flex-wrap gap-2">
          {NACHTRAG_REASONS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setReason(preset)}
              className={cx(
                "rounded-full border px-3.5 py-2 text-[13px]",
                reason === preset ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 text-ink-600"
              )}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-paper-100 px-3.5 py-3">
        <span className="text-[14px] text-ink-600">Wird gemeldet</span>
        <span className="text-[17px] font-semibold text-ink-900">{hhmm(net)} h</span>
      </div>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      <p className="text-[13px] text-ink-400">Der Nachtrag geht ans Büro und wird dort freigegeben.</p>
    </BottomSheet>
  );
}

function Timesheet({ entries, absences, tasks, rawEntries, employee, authToken, onReload }: {
  entries: TimeEntry[];
  absences: Absence[];
  tasks: RawTask[];
  rawEntries: RawTimeEntry[];
  employee?: Employee | null;
  authToken: string;
  onReload: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [nachtrag, setNachtrag] = useState<MissingShift | null>(null);
  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.minutes, 0), [entries]);
  const missing = useMemo(() => missingShiftsFrom(tasks, rawEntries), [tasks, rawEntries]);
  const targetHours = Number(employee?.monthly_hour_limit || 0);
  const percent = targetHours ? Math.min(100, Math.round((total / 60 / targetHours) * 100)) : 0;
  const vacationCount = absences.filter((absence) => `${absence.request_type || absence.absence_type || ""}`.toLowerCase().includes("urlaub")).length;
  const sickCount = absences.filter((absence) => `${absence.request_type || absence.absence_type || ""}`.toLowerCase().includes("krank")).length;
  const missingByDay = useMemo(() => {
    const map = new Map<string, MissingShift[]>();
    for (const shift of missing) map.set(shift.day, [...(map.get(shift.day) || []), shift]);
    return Array.from(map.entries());
  }, [missing]);
  return (
    <div className="-mx-4 -mt-4">
      <div className="px-4 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Stundenzettel</h1>
        <p className="mt-0.5 text-[14px] text-ink-400">{monthLabel()}</p>
      </div>

      <div className="px-4 pt-5">
        <p className="text-[13px] text-ink-400">Erfasste Stunden</p>
        <p className="mt-1 text-[36px] font-bold leading-none tracking-tight text-ink-900">
          {hhmm(total)} h
          {targetHours ? <span className="text-[20px] font-semibold text-ink-200"> / {targetHours}:00 h</span> : null}
        </p>
        {targetHours ? (
          <span className="mt-3 block h-2 rounded-full bg-paper-200">
            <span className="block h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
          </span>
        ) : null}
      </div>

      <ChipRow>
        <Chip label="Alle" count={entries.length + missing.length} active={filter === "all"} onClick={() => setFilter("all")} />
        <Chip label="Nicht erfasst" count={missing.length} active={filter === "missing"} onClick={() => setFilter("missing")} />
      </ChipRow>

      {missing.length ? (
        <>
          {filter === "all" ? <SectionHeading>Nicht erfasst</SectionHeading> : null}
          {missingByDay.map(([day, shifts]) => (
            <div key={day}>
              <p className="px-4 pb-1 pt-3 text-[13px] text-ink-400">{dayGroupLabel(day)}</p>
              {shifts.map((shift) => (
                <button key={shift.task.id} onClick={() => setNachtrag(shift)} className="flex w-full items-start gap-3 border-b border-paper-200 px-4 py-3.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-amber-700">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <span className="truncate">{shift.task.task_category || shift.task.task_type || "Reinigung"}</span>
                    </span>
                    <span className="mt-1 block text-[16px] font-semibold text-ink-900">{shift.task.site || shift.task.customer_name || "Einsatz"}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-400">{taskTime(shift.task)}{shift.plannedMinutes ? ` · geplant ${hhmm(shift.plannedMinutes)} h` : ""}</span>
                  </span>
                  <StatusPill tone="pending">Nicht erfasst</StatusPill>
                </button>
              ))}
            </div>
          ))}
        </>
      ) : null}

      {filter === "missing" && !missing.length ? (
        <EmptyState icon="check" title="Alles erfasst" text="Für vergangene Einsätze liegt überall eine Zeit vor." />
      ) : null}

      {nachtrag ? <NachtragSheet shift={nachtrag} authToken={authToken} onClose={() => setNachtrag(null)} onDone={onReload} /> : null}

      {filter !== "all" ? null : (
      <>
      {vacationCount || sickCount ? (
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          <ValueTile icon="calendar" label="Urlaub" value={`${vacationCount} Anträge`} />
          <ValueTile icon="warning" label="Krank" value={`${sickCount} Meldungen`} />
        </div>
      ) : null}

      <SectionHeading>Erfasste Tage</SectionHeading>
      {entries.length ? entries.map((entry) => <TimeRow key={entry.id} entry={entry} />) : (
        <p className="px-4 py-3 text-[14px] text-ink-400">In diesem Monat wurde noch nichts gestempelt.</p>
      )}
      </>
      )}
    </div>
  );
}

function TimeRow({ entry }: { entry: TimeEntry }) {
  const label = { approved: "Freigegeben", open: "Ausstehend", sick: "Krank", missing: "Unvollständig" }[entry.status];
  const tone = entry.status === "approved" ? "success" : entry.status === "open" ? "pending" : entry.status === "sick" ? "danger" : "warn";
  return (
    <div className="flex items-start gap-3 border-b border-paper-200 px-4 py-3.5 last:border-b-0">
      <span className="w-12 shrink-0 pt-0.5 text-[13px] text-ink-400">{entry.day}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold text-ink-900">{entry.start}{entry.end ? ` – ${entry.end}` : ""}</p>
        <p className="mt-0.5 truncate text-[13px] text-ink-400">{entry.site}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusPill tone={tone}>{label}</StatusPill>
        <span className="text-[15px] font-semibold text-ink-900">{entry.minutes ? `${hhmm(entry.minutes)} h` : "—"}</span>
      </div>
    </div>
  );
}

function NotificationsScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
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

  // Alles in einem Verlauf, neueste zuerst — wie in der Vorlage. Herkunft
  // steckt im Absender, nicht in drei getrennten Überschriften.
  const feed = useMemo(() => {
    const rows: Array<{ id: string; sender: string; title: string; body: string; at: string; unread: boolean }> = [];

    for (const item of notifications) {
      rows.push({
        id: `n-${item.id}`,
        sender: item.employee_name || "Büro",
        title: item.title || "Meldung",
        body: item.message || item.work_site_name || item.object_name || "",
        at: item.created_at || "",
        unread: item.read === false
      });
    }
    for (const item of chatReplies) {
      rows.push({
        id: `c-${item.id}`,
        sender: item.sender_name || "Büro",
        title: "Nachricht vom Büro",
        body: item.message || item.body || item.text || "",
        at: item.created_at || "",
        unread: item.read_by_employee !== true
      });
    }
    for (const item of absenceUpdates) {
      const approved = String(item.status).toLowerCase() === "approved";
      rows.push({
        id: `a-${item.id}`,
        sender: "Büro",
        title: approved ? "Abwesenheit genehmigt" : "Abwesenheit abgelehnt",
        body: `${item.absence_type || item.request_type || "Abwesenheit"} · ${formatShortDateDE(item.start_date)} bis ${formatShortDateDE(item.end_date)}${item.admin_response ? ` · ${item.admin_response}` : ""}`,
        at: item.created_at || "",
        unread: false
      });
    }

    const needle = search.trim().toLowerCase();
    return rows
      .filter((row) => !needle || `${row.title} ${row.body} ${row.sender}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
  }, [absenceUpdates, chatReplies, notifications, search]);

  return (
    <div className="-mx-4 -mt-4">
      <div className="flex items-center justify-between gap-3 px-4 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Inbox</h1>
        {unread ? (
          <button disabled={saving} onClick={markAllRead} className="shrink-0 text-[15px] font-semibold text-brand-700 disabled:opacity-50">
            {saving ? "…" : "Alle gelesen"}
          </button>
        ) : null}
      </div>

      <div className="px-4 pt-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Suche" />
      </div>

      {message ? <div className="px-4 pt-3"><Banner tone="success">{message}</Banner></div> : null}

      {!feed.length ? (
        <EmptyState
          icon="bell"
          title={search.trim() ? "Nichts gefunden" : "Keine Meldungen"}
          text={search.trim() ? "Zu dieser Suche gibt es keinen Eintrag." : "Hinweise vom Büro, Antworten aus dem Chat und Entscheidungen zu deinen Anträgen erscheinen hier."}
        />
      ) : null}

      <div className="pt-2">
        {feed.map((row) => (
          <div key={row.id} className="flex items-start gap-3 border-b border-paper-200 px-4 py-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper-200 text-[13px] font-bold text-ink-600">
              {(row.sender || "?").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                {row.unread ? <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-brand-600" /> : null}
                <p className={cx("min-w-0 flex-1 text-[15px]", row.unread ? "font-bold text-ink-900" : "font-semibold text-ink-800")}>{row.title}</p>
                <span className="shrink-0 text-[13px] text-ink-400">{row.at ? formatShortDateDE(row.at.slice(0, 10)) : ""}</span>
              </div>
              {row.body ? <p className="mt-0.5 line-clamp-2 text-[14px] text-ink-400">{row.body}</p> : null}
            </div>
          </div>
        ))}
      </div>
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

  const openTasks = tasks.filter((task) => !task.task_date || task.task_date >= todayIso());

  return (
    <div className="-mx-4 -mt-4">
      <div className="px-4 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Aufgaben</h1>
        <p className="mt-0.5 text-[14px] text-ink-400">Heute und später · zum Abhaken antippen</p>
      </div>

      <div className="pt-3">
        {openTasks.length ? openTasks.map((task) => (
          <label key={task.id} className="flex items-start gap-3 border-b border-paper-200 px-4 py-3.5">
            <input
              type="checkbox"
              checked={Boolean(task.done)}
              disabled={savingId === task.id}
              onChange={(event) => toggleTask(task, event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
            />
            <span className="min-w-0 flex-1">
              <span className={cx("block text-[16px] font-semibold", task.done ? "text-ink-400 line-through" : "text-ink-900")}>{task.title || "Aufgabe"}</span>
              <span className="mt-0.5 block truncate text-[13px] text-ink-400">{formatDateDE(task.task_date)} · {task.site || task.customer_name || "Ohne Objekt"}</span>
            </span>
          </label>
        )) : <EmptyState icon="check" title="Keine offenen Aufgaben" text="Für dich ist aktuell nichts eingetragen." />}
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return <button onClick={onBack} className="rounded-2xl border border-paper-300 px-4 py-2 text-sm font-bold text-brand-700">Zurück</button>;
}

/** Bottom sheet matching the reference forms: rounded top, chevron-down close, centered title, sticky footer button. */
function BottomSheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-ink-900/40" onClick={onClose}>
      <div className="flex max-h-[92%] w-full flex-col overflow-hidden rounded-t-3xl bg-white" onClick={(event) => event.stopPropagation()}>
        <div className="relative flex items-center justify-center px-4 py-4">
          <button onClick={onClose} className="absolute left-4 text-ink-600" aria-label="Schließen">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <h2 className="text-[17px] font-bold text-ink-900">{title}</h2>
        </div>
        <div className="border-t border-paper-200" />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">{children}</div>
        </div>
        {footer && <div className="border-t border-paper-200 p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Icon-led input row, matching the reference: rounded pill, muted icon, borderless field, optional chevron for pickers. */
function SheetRow({ icon, children, showChevron }: { icon: string; children: React.ReactNode; showChevron?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-paper-300 px-4 py-3">
      <span className="shrink-0 text-ink-400"><Icon name={icon} /></span>
      <div className="min-w-0 flex-1">{children}</div>
      {showChevron ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      ) : null}
    </div>
  );
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
  const [rating, setRating] = useState(0);
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
    setRating(0);
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
      formData.append("rating", String(rating));
      formData.append("notes", notes);
      const kleinere = await bilderVerkleinern(photos.slice(0, 6));
      kleinere.forEach((file) => formData.append("photos", file));

      const response = await fetch("/api/mobile/quality-report", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      const result = await antwortLesen(response);
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
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">Qualitätsnachweis</h1>
          <p className="text-[14px] text-ink-400">Reinigungsplan abhaken und Einsatz abschließen</p>
        </div>
      </div>

      {tasks.length ? (
        <form onSubmit={submit}>
          <SectionHeading>Einsatz</SectionHeading>
          <div className="px-4 pb-1">
            <select
              value={taskIndex}
              onChange={(event) => setTaskIndex(Number(event.target.value))}
              className="w-full rounded-xl border border-paper-200 px-4 py-3.5 text-[15px] font-medium text-ink-900 outline-none"
            >
              {tasks.map((task, index) => (
                <option key={task.id} value={index}>{formatShortDateDE(task.task_date)} · {formatTime(task.start_time)} · {task.site || task.customer_name || task.title || "Einsatz"}</option>
              ))}
            </select>
          </div>
          <DetailRow icon="pin" label="Objekt" value={selectedTask?.site || "—"} hint={selectedTask?.customer_name || "Kunde offen"} />
          <DetailRow icon="note" label="Reinigungsplan" value={selectedPlan?.name || "Standard-Checkliste"} />

          <SectionHeading>Bewertung</SectionHeading>
          <div className="px-4 pb-1">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-paper-200 py-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star === rating ? 0 : star)}
                  aria-label={`${star} von 5`}
                  className={cx("transition", star <= rating ? "text-amber-500" : "text-paper-300")}
                >
                  <svg viewBox="0 0 24 24" className="h-9 w-9" fill="currentColor" aria-hidden="true">
                    <path d="m12 3 2.6 5.9 6.4.6-4.9 4.3 1.5 6.3L12 16.9 6.4 20.1l1.5-6.3-4.9-4.3 6.4-.6L12 3Z" />
                  </svg>
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[13px] text-ink-400">
              {rating ? ["", "Mangelhaft", "Ausbaufähig", "In Ordnung", "Gut", "Sehr gut"][rating] : "Wie sauber ist das Objekt geworden?"}
            </p>
          </div>

          <SectionHeading
            right={
              <button type="button" onClick={() => setChecked(Object.fromEntries(labels.map((label) => [label, true])))} className="text-[14px] font-semibold text-brand-700">
                Alle abhaken
              </button>
            }
          >
            Checkliste
          </SectionHeading>
          <p className="px-4 pb-1 text-[13px] text-ink-400">{checkedLabels.length} von {labels.length} erledigt</p>
          {labels.map((label) => (
            <label key={label} className="flex items-start gap-3 border-b border-paper-200 px-4 py-3.5">
              <input
                type="checkbox"
                checked={Boolean(checked[label])}
                onChange={(event) => setChecked((current) => ({ ...current, [label]: event.target.checked }))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
              />
              <span className="text-[15px] text-ink-900">{label}</span>
            </label>
          ))}

          <SectionHeading>Notiz und Fotos</SectionHeading>
          <div className="space-y-3 px-4 pb-6">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-paper-200 px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500"
              placeholder="z. B. Schaden, Zugang war verschlossen, Zusatzarbeit erledigt"
            />
            <label className="block rounded-xl border border-dashed border-paper-300 p-4">
              <span className="text-[13px] text-ink-400">Bis zu 6 Fotos, z. B. vorher und nachher</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(event) => {
                  const selected = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/")).slice(0, 6);
                  setPhotos(selected);
                }}
                className="mt-3 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              />
              {photos.length ? (
                <p className="mt-3 text-[13px] text-ink-600">{photos.length} Foto{photos.length === 1 ? "" : "s"} ausgewählt</p>
              ) : null}
            </label>
            {message && <Banner tone="info">{message}</Banner>}
            <Button variant="primary" full type="submit" disabled={saving || !selectedTask}>
              {saving ? "Speichere…" : "Nachweis senden und abschließen"}
            </Button>
          </div>
        </form>
      ) : <EmptyState icon="note" title="Kein Einsatz vorhanden" text="Sobald dir ein Einsatz zugeteilt ist, kannst du hier einen Nachweis erstellen." />}

      <SectionHeading>Letzte Nachweise</SectionHeading>
      {(data?.qualityReports || []).length ? (data?.qualityReports || []).slice(0, 5).map((report) => (
        <div key={report.id} className="border-b border-paper-200 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-ink-900">{report.work_site_name || report.site || "Objekt"}</p>
              <p className="mt-0.5 text-[13px] text-ink-400">
                {report.created_at ? new Date(report.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                {" · "}{report.photo_count || report.photo_urls?.length || 0} Foto(s)
              </p>
              {report.rating ? (
                <p className="mt-0.5 text-[13px] text-amber-700">{"★".repeat(report.rating)}{"☆".repeat(Math.max(0, 5 - report.rating))}</p>
              ) : null}
            </div>
            <StatusPill tone={String(report.status || "").toLowerCase() === "approved" ? "success" : "neutral"}>
              {String(report.status || "").toLowerCase() === "approved" ? "Freigegeben" : "Gesendet"}
            </StatusPill>
          </div>
          {report.photo_urls?.length ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {report.photo_urls.slice(0, 3).map((url) => <img key={url} src={url} alt="Qualitätsfoto" className="h-20 w-full rounded-xl object-cover" />)}
            </div>
          ) : null}
        </div>
      )) : <p className="px-4 py-3 text-[14px] text-ink-400">Noch keine Nachweise gesendet.</p>}
    </div>
  );
}

function productImage(product: MaterialProduct) {
  return product.image_url || product.photo_url || product.image || null;
}

/** "0 / 1 Stk." — aktueller Bestand gegen Mindestbestand, wie in der Vorlage. */
function stockLabel(product: MaterialProduct) {
  const unit = product.unit || "Stk.";
  const current = Number(product.current_stock ?? 0);
  const minimum = Number(product.min_stock ?? product.minimum_stock ?? 0);
  if (!current && !minimum) return unit;
  return `${current} / ${minimum} ${unit}`;
}

function materialStatus(status?: string | null): { label: string; tone: "success" | "info" | "danger" | "neutral" } {
  const value = String(status || "open").toLowerCase();
  if (["done", "erledigt", "resolved", "closed"].includes(value)) return { label: "Erledigt", tone: "success" };
  if (["approved", "freigegeben"].includes(value)) return { label: "Freigegeben", tone: "info" };
  if (["rejected", "abgelehnt"].includes(value)) return { label: "Abgelehnt", tone: "danger" };
  return { label: "Offen", tone: "neutral" };
}

/** Eine Bestellung, aus mehreren Meldungszeilen zusammengesetzt. */
type MaterialOrder = {
  key: string;
  createdAt: string;
  objectName: string;
  status: string;
  note: string | null;
  items: Array<{ id: string; name: string; quantity: number; photoUrls: string[] }>;
};

/** Objekte für die Auswahl: mit Adresse und, wenn Standort bekannt, mit Entfernung. */
type PickableSite = {
  workSiteId: string | null;
  siteName: string;
  address: string;
  distance: number | null;
};

/**
 * Objekte zum Auswählen.
 *
 * Zuerst die eigenen — aus den Einsätzen und den zugeteilten Objekten —,
 * danach alle übrigen aus dem Stamm. Vorher standen nur die eigenen drin.
 * Ein Objekt ohne Einsatz, etwa ein frisch angelegtes, fehlte damit
 * vollständig, und ein Aufkleber darauf lief ins Leere.
 */
function pickableSites(data: AppData | null, position: { latitude: number; longitude: number } | null): PickableSite[] {
  const byId = new Map((data?.workSites || []).map((site) => [site.id, site]));

  function bauen(workSiteId: string | null, siteName: string): PickableSite {
    const site = workSiteId ? byId.get(workSiteId) : undefined;
    const lat = getSiteLatitude(site);
    const lng = getSiteLongitude(site);
    const distance = position && lat !== null && lng !== null ? distanceMeters(position.latitude, position.longitude, lat, lng) : null;
    return {
      workSiteId,
      siteName,
      address: [site?.address, site?.customer_name].filter(Boolean).join(" · ") || "Keine Adresse hinterlegt",
      distance
    };
  }

  const eigene = menuSites(data, data?.tasks || []).map((entry) => bauen(entry.workSiteId, entry.siteName));
  const bekannt = new Set(eigene.map((entry) => entry.workSiteId).filter(Boolean));

  const uebrige = (data?.workSites || [])
    .filter((site) => site.id && !bekannt.has(site.id))
    .map((site) => bauen(site.id, workSiteName(site)))
    .sort((a, b) => a.siteName.localeCompare(b.siteName));

  return [...eigene, ...uebrige];
}

/** Auswahl-Sheet: erst was in der Nähe liegt, darunter alle Objekte. */
function SitePickerSheet({ sites, onPick, onClose }: { sites: PickableSite[]; onPick: (index: number) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const withIndex = sites.map((site, index) => ({ site, index }));
  const filtered = needle ? withIndex.filter((row) => `${row.site.siteName} ${row.site.address}`.toLowerCase().includes(needle)) : withIndex;
  const near = filtered.filter((row) => row.site.distance !== null && row.site.distance <= 2000).sort((a, b) => (a.site.distance || 0) - (b.site.distance || 0));
  const nearIds = new Set(near.map((row) => row.index));
  const rest = filtered.filter((row) => !nearIds.has(row.index));

  function row({ site, index }: { site: PickableSite; index: number }) {
    return (
      <button key={`${index}-${site.siteName}`} onClick={() => { onPick(index); onClose(); }} className="flex w-full items-center gap-3 rounded-xl border border-paper-200 p-3 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-paper-100 text-ink-400"><UiIcon name="building" className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-ink-900">{site.siteName}</span>
          <span className="mt-0.5 block truncate text-[13px] text-ink-400">
            {site.address}{site.distance !== null ? ` · ${site.distance < 1000 ? `${site.distance} m` : `${(site.distance / 1000).toFixed(1)} km`}` : ""}
          </span>
        </span>
        <UiIcon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-200" />
      </button>
    );
  }

  return (
    <BottomSheet title="Objekt wählen" onClose={onClose}>
      <SheetRow icon="search">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nach Objekt suchen" className="w-full border-0 bg-transparent p-0 text-sm text-ink-900 outline-none placeholder:text-ink-400" />
      </SheetRow>
      {near.length ? (
        <>
          <p className="pt-1 text-[13px] text-ink-400">In der Nähe</p>
          <div className="space-y-2">{near.map(row)}</div>
        </>
      ) : null}
      {rest.length ? (
        <>
          <p className="pt-2 text-[13px] text-ink-400">{near.length ? "Alle Objekte" : "Objekte"}</p>
          <div className="space-y-2">{rest.map(row)}</div>
        </>
      ) : null}
      {!filtered.length ? <p className="py-6 text-center text-[14px] text-ink-400">Kein Objekt gefunden.</p> : null}
    </BottomSheet>
  );
}

/** Materialbestellung: mehrere Artikel in einem Vorgang, gruppiert und durchsuchbar. */
function MaterialScreen({ data, authToken, onBack, onReload, initialSiteId = "", autoOpen = false }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void>; initialSiteId?: string; autoOpen?: boolean }) {
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [openOrder, setOpenOrder] = useState<MaterialOrder | null>(null);
  const [closing, setClosing] = useState(false);
  const sites = useMemo(() => pickableSites(data, position), [data, position]);
  const [siteIndex, setSiteIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(autoOpen);
  const [vorauswahlFehler, setVorauswahlFehler] = useState<string | null>(null);
  const vorauswahlGesetzt = useRef(false);

  useEffect(() => {
    getBrowserPosition().then((result) => setPosition({ latitude: result.latitude, longitude: result.longitude })).catch(() => setPosition(null));
  }, []);

  /**
   * Kommt der Aufruf vom Aufkleber am Objekt, steht die Objekt-Nummer in der
   * Adresse. Sobald die Objektliste da ist, wird das passende ausgewählt.
   * Läuft nur einmal, danach kann frei umgeschaltet werden.
   */
  useEffect(() => {
    if (!initialSiteId || vorauswahlGesetzt.current || !sites.length) return;
    const treffer = sites.findIndex((site) => String(site.workSiteId || "") === initialSiteId);
    vorauswahlGesetzt.current = true;
    if (treffer >= 0) {
      setSiteIndex(treffer);
      return;
    }
    // Lieber sagen, dass das Objekt fehlt, als still das erste der Liste
    // nehmen. Sonst bestellt jemand für ein Objekt, an dem er nicht steht.
    setVorauswahlFehler("Der Aufkleber zeigt auf ein Objekt, das hier nicht in der Liste steht. Bitte oben das richtige Objekt wählen.");
  }, [initialSiteId, sites]);

  const aktivesObjektId = sites[siteIndex]?.workSiteId || "";
  const aktivesObjektName = (sites[siteIndex]?.siteName || "").trim().toLowerCase();

  /**
   * Artikel des gewählten Objekts, dazu die allgemeinen ohne Objektbindung.
   * Vorher standen alle Artikel aller Objekte in jeder Bestellung — bei
   * Papierhandtüchern, die es nur an einem Objekt gibt, ist das Unsinn.
   */
  const products = useMemo(() => (data?.materialProducts || []).filter((product) => {
    const objektId = String(product.work_site_id || "");
    const objektName = String(product.object_name || "").trim().toLowerCase();
    if (!objektId && !objektName) return true;
    if (aktivesObjektId && objektId === aktivesObjektId) return true;
    if (aktivesObjektName && objektName === aktivesObjektName) return true;
    return false;
  }), [data?.materialProducts, aktivesObjektId, aktivesObjektName]);

  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [customMaterial, setCustomMaterial] = useState("");
  const [customQuantity, setCustomQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reports = data?.materialReports || [];
  const filteredReports = search.trim()
    ? reports.filter((report) => `${report.material_name || report.product_name || ""} ${report.object_name || report.site || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    : reports;

  // Eine Bestellung entsteht als mehrere Zeilen, eine je Artikel. Fuer die
  // Anzeige wieder zu einem Vorgang zusammensetzen: gleicher Zeitpunkt, gleiches Objekt.
  const orders = useMemo(() => {
    const map = new Map<string, MaterialOrder>();
    for (const report of filteredReports) {
      const createdAt = String(report.created_at || "");
      const objectName = report.object_name || report.site || "Ohne Objekt";
      const key = `${createdAt.slice(0, 16)}|${objectName}`;
      const item = {
        id: report.id,
        name: report.material_name || report.product_name || "Material",
        quantity: Number(report.quantity_requested || report.quantity || 1),
        photoUrls: report.photo_urls || []
      };
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        if (String(report.status || "open").toLowerCase() === "open") existing.status = "open";
      } else {
        map.set(key, { key, createdAt, objectName, status: String(report.status || "open").toLowerCase(), items: [item], note: report.notes || report.comment || null });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [filteredReports]);

  const groups = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    const matching = needle
      ? products.filter((product) => `${product.name || ""} ${product.category || ""}`.toLowerCase().includes(needle))
      : products;
    const map = new Map<string, MaterialProduct[]>();
    for (const product of matching) {
      const group = product.category?.trim() || "Artikel ohne Gruppe";
      map.set(group, [...(map.get(group) || []), product]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [productSearch, products]);

  const selectedCount = Object.values(quantities).filter((value) => value > 0).length + (customMaterial.trim() ? 1 : 0);

  function resetForm() {
    setQuantities({});
    setCustomMaterial("");
    setCustomQuantity(1);
    setNotes("");
    setPhotos([]);
    setProductSearch("");
    setPhotoInputKey((key) => key + 1);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCount) {
      setMessage("Bitte mindestens einen Artikel auswählen.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const site = sites[siteIndex] || null;
      const items = products
        .filter((product) => (quantities[product.id] || 0) > 0)
        .map((product) => ({ productId: product.id, name: product.name || "Material", quantity: quantities[product.id] }));
      if (customMaterial.trim()) items.push({ productId: "", name: customMaterial.trim(), quantity: customQuantity });

      const formData = new FormData();
      formData.set("workSiteId", site?.workSiteId || "");
      formData.set("workSiteName", site?.siteName || "");
      formData.set("items", JSON.stringify(items));
      formData.set("notes", notes);
      const kleinere = await bilderVerkleinern(photos);
      kleinere.forEach((photo) => formData.append("photos", photo));

      const response = await fetch("/api/mobile/material/report", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      const result = await antwortLesen(response);
      if (!response.ok || !result.ok) throw new Error(result.error || "Materialbestellung konnte nicht gesendet werden.");
      resetForm();
      setSheetOpen(false);
      await onReload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Materialbestellung konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Material</h1>
        <BackButton onBack={onBack} />
      </div>

      <SheetRow icon="search">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bestellung suchen…" className="w-full border-0 bg-transparent p-0 text-sm text-ink-900 outline-none placeholder:text-ink-400" />
      </SheetRow>

      {orders.length ? (
        <div className="divide-y divide-paper-200">
          {orders.map((order, index) => {
            const status = materialStatus(order.status);
            return (
              <button key={order.key} onClick={() => setOpenOrder(order)} className="flex w-full items-start gap-3 py-4 text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink-400">#{orders.length - index} · {formatShortDateDE(order.createdAt)}</p>
                  <p className="mt-0.5 text-[17px] font-bold text-ink-900">{order.objectName}</p>
                  <p className="mt-0.5 truncate text-[14px] text-ink-400">
                    {order.items.length === 1
                      ? `${order.items[0].quantity} × ${order.items[0].name}`
                      : `${order.items.length} Artikel`}
                  </p>
                </div>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="box" title="Keine Materialbestellungen" text="Sobald du etwas bestellst, erscheint es hier." />
      )}

      <button onClick={() => { setMessage(null); setSheetOpen(true); }} className="fixed inset-x-4 bottom-24 z-20 rounded-xl bg-brand-600 py-4 text-center text-[16px] font-semibold text-white shadow-glow md:absolute">Material bestellen</button>

      {sheetOpen && (
        <BottomSheet
          title="Material bestellen"
          onClose={() => setSheetOpen(false)}
          footer={
            <button
              form="material-order-form"
              disabled={saving || !selectedCount}
              className="w-full rounded-xl bg-brand-600 py-4 text-[16px] font-semibold text-white disabled:bg-paper-200 disabled:text-ink-200"
            >
              {saving ? "Sende…" : selectedCount ? `Material bestellen (${selectedCount})` : "Material bestellen"}
            </button>
          }
        >
          <form id="material-order-form" onSubmit={submit} className="space-y-3">
            {vorauswahlFehler ? <Banner tone="warn">{vorauswahlFehler}</Banner> : null}

            <button type="button" onClick={() => setSitePickerOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-paper-300 px-4 py-3 text-left">
              <span className="shrink-0 text-ink-400"><UiIcon name="building" className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink-400">Objekt</span>
                <span className="block truncate text-[15px] font-semibold text-ink-900">{sites[siteIndex]?.siteName || "Objekt wählen"}</span>
              </span>
              <UiIcon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-200" />
            </button>

            <SheetRow icon="edit">
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bemerkung" className="w-full border-0 bg-transparent p-0 text-sm text-ink-900 outline-none placeholder:text-ink-400" />
            </SheetRow>

            <p className="pt-1 text-[15px] font-bold text-ink-900">Artikel</p>

            <SheetRow icon="search">
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Suche" className="w-full border-0 bg-transparent p-0 text-sm text-ink-900 outline-none placeholder:text-ink-400" />
            </SheetRow>

            {groups.map(([group, items]) => {
              const closed = Boolean(closedGroups[group]);
              return (
                <div key={group}>
                  <button
                    type="button"
                    onClick={() => setClosedGroups((current) => ({ ...current, [group]: !closed }))}
                    className="flex w-full items-center gap-2 py-2 text-left"
                  >
                    <span className="text-[15px] text-ink-600">{group}</span>
                    <UiIcon name={closed ? "chevronRight" : "chevronDown"} className="h-4 w-4 text-ink-400" />
                    <span className="ml-auto rounded-full bg-paper-100 px-2 py-0.5 text-[12px] text-ink-600">{items.length}</span>
                  </button>

                  {!closed ? (
                    <div className="space-y-2">
                      {items.map((product) => {
                        const image = productImage(product);
                        return (
                          <div key={product.id} className="flex items-center gap-3 rounded-xl border border-paper-200 p-3">
                            {image ? (
                              <img src={image} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                            ) : (
                              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-paper-100 text-ink-200"><UiIcon name="box" className="h-5 w-5" /></span>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-ink-400">{stockLabel(product)}</p>
                              <p className="truncate text-[15px] font-medium text-ink-900">{product.name || "Material"}</p>
                            </div>
                            <Stepper
                              value={quantities[product.id] || 0}
                              onChange={(next) => setQuantities((current) => ({ ...current, [product.id]: next }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!groups.length ? (
              <Banner tone="info">
                Für dieses Objekt sind noch keine Artikel hinterlegt. Trag unten ein, was gebraucht wird — das Büro kann es danach als festen Artikel anlegen.
              </Banner>
            ) : null}

            <div className="rounded-xl border border-paper-200 p-3">
              <p className="text-[13px] text-ink-400">Nicht in der Liste?</p>
              <div className="mt-2 flex items-center gap-3">
                <input
                  value={customMaterial}
                  onChange={(event) => setCustomMaterial(event.target.value)}
                  placeholder="z. B. Müllbeutel, Reiniger, Papier"
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-[15px] text-ink-900 outline-none placeholder:text-ink-200"
                />
                <Stepper value={customQuantity} onChange={setCustomQuantity} min={1} />
              </div>
            </div>

            <label className="block rounded-xl border border-dashed border-paper-300 p-4">
              <span className="text-[13px] text-ink-400">Foto optional</span>
              <input
                key={photoInputKey}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, 6))}
                className="mt-3 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              />
              {photos.length ? (
                <div className="mt-3 space-y-1">
                  {photos.map((photo) => <p key={`${photo.name}-${photo.size}`} className="truncate rounded-lg bg-paper-100 px-3 py-2 text-xs text-brand-700">{photo.name}</p>)}
                </div>
              ) : null}
            </label>

            {message && <Banner tone="danger">{message}</Banner>}
          </form>
        </BottomSheet>
      )}

      {sitePickerOpen && (
        <SitePickerSheet sites={sites} onPick={setSiteIndex} onClose={() => setSitePickerOpen(false)} />
      )}

      {openOrder && (
        <BottomSheet
          title={`Bestellung · ${openOrder.objectName}`}
          onClose={() => setOpenOrder(null)}
          footer={
            openOrder.status === "open" ? (
              <Button
                variant="success"
                full
                disabled={closing}
                onClick={async () => {
                  setClosing(true);
                  try {
                    const response = await fetch("/api/mobile/material/report", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                      body: JSON.stringify({ ids: openOrder.items.map((item) => item.id), status: "done" })
                    });
                    const result = await response.json();
                    if (!response.ok || !result.ok) throw new Error(result.error || "Bestellung konnte nicht abgeschlossen werden.");
                    setOpenOrder(null);
                    await onReload();
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Bestellung konnte nicht abgeschlossen werden.");
                  } finally {
                    setClosing(false);
                  }
                }}
              >
                {closing ? "Speichere…" : "Als erhalten melden"}
              </Button>
            ) : undefined
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] text-ink-400">{formatDateDE(openOrder.createdAt)}</p>
              <p className="text-[17px] font-bold text-ink-900">{openOrder.objectName}</p>
            </div>
            <StatusPill tone={materialStatus(openOrder.status).tone}>{materialStatus(openOrder.status).label}</StatusPill>
          </div>

          {openOrder.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-paper-200 p-3">
              {item.photoUrls[0] ? (
                <img src={item.photoUrls[0]} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-paper-100 text-ink-200"><UiIcon name="box" className="h-5 w-5" /></span>
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink-900">{item.name}</span>
              <span className="shrink-0 text-[15px] font-semibold text-ink-900">{item.quantity} Stück</span>
            </div>
          ))}

          {openOrder.note ? <DetailRow icon="edit" label="Bemerkung" value={openOrder.note} /> : null}
          {openOrder.status === "open" ? (
            <p className="text-[13px] text-ink-400">Sobald das Material bei dir angekommen ist, melde die Bestellung hier als erhalten.</p>
          ) : null}
        </BottomSheet>
      )}
    </div>
  );
}

function AbsenceScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [absenceType, setAbsenceType] = useState("Urlaub");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const [documentKey, setDocumentKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startDate || !endDate) {
      setMessage("Bitte Start- und Enddatum auswählen.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("absenceType", absenceType);
      formData.set("startDate", startDate);
      formData.set("endDate", endDate);
      formData.set("reason", reason);
      const kleinere = await bilderVerkleinern(documents);
      kleinere.forEach((file) => formData.append("documents", file));

      const response = await fetch("/api/mobile/absence", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      const result = await antwortLesen(response);
      if (!response.ok || !result.ok) throw new Error(result.error || "Antrag konnte nicht gesendet werden.");
      setReason("");
      setStartDate("");
      setEndDate("");
      setDocuments([]);
      setDocumentKey((key) => key + 1);
      setSheetOpen(false);
      await onReload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Antrag konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  const absences = data?.absences || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Abwesenheit</h1>
        <BackButton onBack={onBack} />
      </div>

      {absences.length ? (
        <div className="divide-y divide-paper-200">
          <p className="pb-1 pt-2 text-[13px] text-ink-400">Deine Anträge</p>
          {absences.map((absence) => {
            const state = String(absence.status || "").toLowerCase();
            const tone = state === "approved" ? "success" : state === "rejected" ? "danger" : "pending";
            const label = state === "approved" ? "Genehmigt" : state === "rejected" ? "Abgelehnt" : "Ausstehend";
            return (
              <article key={absence.id} className="py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold text-ink-900">{absence.absence_type || absence.request_type || "Abwesenheit"}</p>
                    <p className="mt-0.5 text-[13px] text-ink-400">{formatShortDateDE(absence.start_date)} bis {formatShortDateDE(absence.end_date)}</p>
                  </div>
                  <StatusPill tone={tone}>{label}</StatusPill>
                </div>
                {absence.admin_response ? <p className="mt-2 text-[13px] text-ink-600">{absence.admin_response}</p> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="calendar" title="Keine Abwesenheiten" text="Hier erscheinen Urlaub, Krankheit und freie Tage." />
      )}

      <button onClick={() => { setMessage(null); setSheetOpen(true); }} className="fixed inset-x-4 bottom-24 z-20 rounded-2xl bg-brand-600 py-4 text-center font-black text-white shadow-glow md:absolute">Neue Abwesenheit einreichen</button>

      {sheetOpen && (
        <BottomSheet
          title="Neue Abwesenheit einreichen"
          onClose={() => setSheetOpen(false)}
          footer={<button form="absence-form" disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-black text-white disabled:opacity-60">{saving ? "Sende…" : "Neue Abwesenheit einreichen"}</button>}
        >
          <form id="absence-form" onSubmit={submit} className="space-y-3">
            <SheetRow icon="tasks" showChevron>
              <select value={absenceType} onChange={(event) => setAbsenceType(event.target.value)} className="w-full appearance-none border-0 bg-transparent p-0 text-sm font-semibold text-ink-900 outline-none">
                <option>Urlaub</option>
                <option>Krank</option>
                <option>Frei</option>
                <option>Sonstiges</option>
              </select>
            </SheetRow>

            <SheetRow icon="calendar">
              <div className="flex items-center gap-2 text-sm text-ink-900">
                <input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" required className="w-full border-0 bg-transparent p-0 text-sm text-ink-900 outline-none" />
                <span className="text-ink-400">–</span>
                <input value={endDate} onChange={(event) => setEndDate(event.target.value)} type="date" required className="w-full border-0 bg-transparent p-0 text-sm text-ink-900 outline-none" />
              </div>
            </SheetRow>

            <SheetRow icon="edit">
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bemerkung" className="w-full border-0 bg-transparent p-0 text-sm text-ink-900 outline-none placeholder:text-ink-400" />
            </SheetRow>

            {/* Krankmeldung fotografieren oder PDF anhängen. */}
            <label className="block rounded-xl border border-dashed border-paper-300 p-4">
              <span className="flex items-center gap-2 text-[13px] text-ink-400">
                <UiIcon name="photo" className="h-[18px] w-[18px]" />
                Dokument hochladen, z. B. Krankmeldung
              </span>
              <input
                key={documentKey}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                multiple
                onChange={(event) => setDocuments(Array.from(event.target.files || []).slice(0, 3))}
                className="mt-3 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              />
              {documents.length ? (
                <p className="mt-3 text-[13px] text-ink-600">{documents.length} Datei{documents.length === 1 ? "" : "en"} ausgewählt</p>
              ) : null}
              <p className="mt-2 text-[12px] text-ink-400">Wird geschützt abgelegt, nur das Büro kann es öffnen.</p>
            </label>

            {message && <Banner tone="danger">{message}</Banner>}
          </form>
        </BottomSheet>
      )}
    </div>
  );
}

function ChatScreen({ data, authToken, onBack, onReload }: { data: AppData | null; authToken: string; onBack: () => void; onReload: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Gerade abgeschickte Nachrichten, bis sie vom Server zurückkommen.
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const serverMessages = data?.chatMessages || [];
  const messages = useMemo(() => {
    const known = new Set(serverMessages.map((item) => item.id));
    const stillPending = pending.filter((item) => !known.has(item.id));
    return [...serverMessages, ...stillPending].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  }, [pending, serverMessages]);

  // Sobald der Server die Nachricht kennt, fliegt die Zwischenkopie raus.
  useEffect(() => {
    const known = new Set(serverMessages.map((item) => item.id));
    setPending((current) => (current.some((item) => known.has(item.id)) ? current.filter((item) => !known.has(item.id)) : current));
  }, [serverMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;

    // Sofort anzeigen und Eingabe leeren. Das Senden läuft im Hintergrund.
    const draft: ChatMessage = {
      id: `pending-${Date.now()}`,
      employee_name: data?.employee?.name || "",
      sender_name: data?.viewer?.name || data?.employee?.name || "",
      sender_role: data?.isAdmin ? "admin" : "employee",
      message: body,
      created_at: new Date().toISOString()
    };
    setPending((current) => [...current, draft]);
    setText("");
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/mobile/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        // Als Admin schreibt man in den Verlauf des gerade gewählten Mitarbeiters.
        body: JSON.stringify({ message: body, employeeName: data?.isAdmin ? data?.employee?.name || "" : "" })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Nachricht konnte nicht gesendet werden.");
      await onReload();
    } catch (sendError) {
      // Fehlgeschlagene Nachricht wieder entfernen und Text zurückgeben,
      // damit nichts verloren geht.
      setPending((current) => current.filter((item) => item.id !== draft.id));
      setText(body);
      setMessage(sendError instanceof Error ? sendError.message : "Nachricht konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Chat</h1>
          <p className="mt-0.5 text-[14px] text-ink-400">
            {data?.isAdmin ? `Verlauf mit ${data?.employee?.name || "—"}` : "Direkt ans Büro"}
          </p>
        </div>
        <BackButton onBack={onBack} />
      </div>

      <section className="max-h-[52vh] space-y-2 overflow-y-auto">
        {messages.length ? messages.map((item) => {
          const own = `${item.sender_role || ""}`.toLowerCase() === "employee";
          const body = item.message || item.body || item.text || "Nachricht";
          return (
            <article key={item.id} className={cx("max-w-[85%] rounded-2xl px-4 py-2.5", own ? "ml-auto bg-brand-600 text-white" : "mr-auto bg-paper-100 text-ink-900")}>
              <p className="text-[15px] leading-snug">{body}</p>
              <p className={cx("mt-1 text-[11px]", own ? "text-white/70" : "text-ink-400")}>
                {item.sender_name || (own ? data?.employee?.name : "Büro")} · {item.created_at ? formatTime(item.created_at) : "—"}
              </p>
            </article>
          );
        }) : <EmptyState icon="chat" title="Noch keine Nachrichten" text="Schreib dem Büro direkt aus der App." />}
        <div ref={endRef} />
      </section>

      {message && <Banner tone="danger">{message}</Banner>}
      <form onSubmit={sendMessage} className="space-y-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-paper-200 px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500"
          placeholder="Nachricht schreiben…"
        />
        <Button variant="primary" full type="submit" disabled={!text.trim()}>Nachricht senden</Button>
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
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">Tagesabschluss</h1>
          <p className="text-[14px] text-ink-400">Arbeitsende ans Büro melden</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 px-4 pt-4">
        <ValueTile icon="stopwatch" label="Zeit" value={workedMinutes ? `${hhmm(workedMinutes)} h` : "0:00 h"} />
        <ValueTile icon="check" label="Erledigt" value={String(doneTasks.length)} />
        <ValueTile icon="warning" label="Offen" value={String(openTasks.length)} />
      </div>

      {hasOpenClock ? (
        <div className="px-4 pt-3">
          <Banner tone="warn">Es läuft noch eine Stempelung oder Pause. Bitte zuerst ausstempeln, sonst fehlt die Zeit im Abschluss.</Banner>
        </div>
      ) : null}

      <SectionHeading>Heutige Einsätze</SectionHeading>
      {todayTasks.length ? todayTasks.map((task) => {
        const done = task.done || String(task.status || "").toLowerCase() === "done";
        return (
          <DetailRow
            key={task.id}
            icon={done ? "check" : "clock"}
            label={`${taskTime(task)} · ${task.site || task.customer_name || "Ohne Objekt"}`}
            value={
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1">{task.title || "Einsatz"}</span>
                <StatusPill tone={done ? "success" : "neutral"}>{done ? "Erledigt" : "Offen"}</StatusPill>
              </span>
            }
          />
        );
      }) : <p className="px-4 py-3 text-[14px] text-ink-400">Für heute war nichts geplant. Der Abschluss kann trotzdem gesendet werden.</p>}

      <SectionHeading>Notiz ans Büro</SectionHeading>
      <div className="space-y-3 px-4 pb-6">
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-paper-200 px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500"
          placeholder="z. B. Objekt fertig, Material fehlt, Kunde war nicht erreichbar…"
        />
        <label className="flex items-start gap-3 rounded-xl bg-paper-100 p-3.5 text-[14px] text-ink-600">
          <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
          <span>Ich bestätige den Tagesabschluss für heute. Offene Einsätze werden dem Büro mitgemeldet.</span>
        </label>
        {message ? <Banner tone="info">{message}</Banner> : null}
        <Button variant="primary" full disabled={!canSubmit} onClick={submit}>{saving ? "Sende…" : "Tagesabschluss senden"}</Button>
      </div>
    </div>
  );
}

function ProfileScreen({ data, onBack, onLogout }: { data: AppData | null; onBack: () => void; onLogout: () => Promise<void> }) {
  const employee = data?.employee;
  const birthday = birthdayInfo(employee);
  return (
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <h1 className="min-w-0 flex-1 pt-1 text-[22px] font-bold text-ink-900">Profil</h1>
      </div>

      <div className="flex items-center gap-4 px-4 pb-2 pt-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-brand-100 text-[22px] font-bold text-brand-700">
          {(employee?.name || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[20px] font-bold text-ink-900">{employee?.name || "Mitarbeiter"}</p>
          <p className="truncate text-[14px] text-ink-400">{employee?.email || "Keine E-Mail hinterlegt"}</p>
        </div>
      </div>

      {birthday?.isToday ? <div className="px-4 pb-1 pt-3"><Banner tone="info">Alles Gute zum Geburtstag! 🎉</Banner></div> : null}

      <SectionHeading>Deine Daten</SectionHeading>
      <DetailRow icon="user" label="Rolle" value={employee?.role === "admin" ? "Admin" : "Mitarbeiter"} />
      <DetailRow icon="calendar" label="Urlaubsanspruch" value={`${employee?.annual_vacation_days ?? employee?.vacation_days ?? "—"} Tage pro Jahr`} />
      <DetailRow icon="euro" label="Stundensatz" value={moneyPerHour(employee?.hourly_rate)} />
      <DetailRow icon="clock" label="Monatsstunden" value={employee?.monthly_hour_limit ? `${employee.monthly_hour_limit} h` : "Nicht hinterlegt"} />
      <DetailRow icon="flag" label="Geburtstag" value={birthday?.date || "Nicht hinterlegt"} hint={birthday?.nextLabel} />

      <div className="px-4 py-6">
        <Button variant="neutral" full onClick={onLogout}>Abmelden</Button>
      </div>
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
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">Tagesroute</h1>
          <p className="text-[14px] text-ink-400">{formatDateDE(selectedDay)}</p>
        </div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
        {days.map((day) => {
          const selected = day === selectedDay;
          const count = assignments.filter((assignment) => assignment.date === day).length;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={cx(
                "flex min-w-14 shrink-0 flex-col items-center gap-1 rounded-xl border px-2 py-2",
                selected ? "border-brand-600 bg-brand-600 text-white" : "border-paper-200 text-ink-600"
              )}
            >
              <span className="text-[12px]">{weekdayShort(day)}</span>
              <span className="text-[17px] font-semibold">{dayNumber(day)}</span>
              <span className={cx("h-1.5 w-1.5 rounded-full", count ? (selected ? "bg-white" : "bg-paper-300") : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 px-4">
        <ValueTile icon="pin" label="Einsätze" value={String(dayAssignments.length)} />
        <ValueTile icon="clock" label="Offen" value={String(openAssignments.length)} />
        <ValueTile icon="target" label="Geplant" value={plannedMinutes ? `${hhmm(plannedMinutes)} h` : "—"} />
      </div>

      <div className="px-4 pt-4">
        <a
          href={routeUrl}
          target="_blank"
          rel="noreferrer"
          className={cx(
            "block rounded-xl px-4 py-3.5 text-center text-[16px] font-semibold",
            routeTasks.length ? "bg-brand-600 text-white" : "pointer-events-none bg-paper-100 text-ink-200"
          )}
        >
          Route in Google Maps öffnen
        </a>
        <p className="mt-2 text-[13px] text-ink-400">Öffnet die offenen Einsätze dieses Tages in der geplanten Reihenfolge.</p>
      </div>

      {nextAssignment ? (
        <>
          <SectionHeading>Als Nächstes</SectionHeading>
          <DetailRow
            icon="pin"
            label={`${nextAssignment.time} · ${nextAssignment.customer}`}
            value={nextAssignment.title}
            hint={nextAssignment.address}
            onClick={() => onOpenAssignment(nextAssignment)}
          />
        </>
      ) : null}

      <SectionHeading>Reihenfolge</SectionHeading>
      {dayAssignments.length ? dayAssignments.map((assignment, index) => (
        <button key={assignment.id} onClick={() => onOpenAssignment(assignment)} className="flex w-full items-start gap-3 border-b border-paper-200 px-4 py-3.5 text-left">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper-100 text-[14px] font-semibold text-ink-600">{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold text-ink-900">{assignment.title}</span>
            <span className="mt-0.5 block truncate text-[13px] text-ink-400">{assignment.time} · {assignment.address}</span>
          </span>
          <StatusPill tone={assignment.done ? "success" : "neutral"}>{assignment.done ? "Erledigt" : "Offen"}</StatusPill>
        </button>
      )) : <EmptyState icon="pin" title="Keine Einsätze an diesem Tag" text="Wähle oben einen anderen Tag." />}
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
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">Objektmappe</h1>
          <p className="text-[14px] text-ink-400">Infos, Reinigungsplan und Material je Objekt</p>
        </div>
      </div>

      <div className="px-4 pt-4">
        <select
          value={selectedSite?.id || ""}
          onChange={(event) => setSelectedSiteId(event.target.value)}
          className="w-full rounded-xl border border-paper-200 px-4 py-3.5 text-[15px] font-medium text-ink-900 outline-none"
        >
          {sites.map((site) => <option key={site.id} value={site.id}>{workSiteName(site)}</option>)}
        </select>
      </div>

      {!selectedSite ? <EmptyState icon="building" title="Keine Objekte" text="Dir ist noch kein Objekt zugeordnet." /> : (
        <>
          <div className="flex items-start justify-between gap-3 px-4 pb-1 pt-5">
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold text-ink-900">{workSiteName(selectedSite)}</h2>
              <p className="mt-0.5 text-[14px] text-ink-400">{selectedSite.customer_name || plan?.customer_name || "Kein Kunde hinterlegt"}</p>
            </div>
            <StatusPill tone={gpsReady ? "success" : "warn"}>{gpsReady ? "GPS aktiv" : "GPS fehlt"}</StatusPill>
          </div>

          <DetailRow icon="pin" label="Adresse" value={workSiteAddress(selectedSite)} />
          <DetailRow icon="target" label="Erlaubter Abstand beim Stempeln" value={radius ? `${radius} m` : "Nicht hinterlegt"} />

          <div className="grid grid-cols-2 gap-3 px-4 pt-4">
            <a
              href={mapSearchUrl(siteTasks[0] || { site: workSiteName(selectedSite), customer_name: selectedSite.customer_name || null })}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-brand-600 px-4 py-3.5 text-center text-[16px] font-semibold text-white"
            >
              Route öffnen
            </a>
            <Button variant="neutral" disabled={!futureTasks.length} onClick={() => futureTasks[0] && onOpenAssignment(assignmentsFromTasks([futureTasks[0]])[0])}>
              Nächster Einsatz
            </Button>
          </div>

          <SectionHeading>Nächste Einsätze</SectionHeading>
          {futureTasks.length ? futureTasks.map((task) => {
            const assignment = siteAssignments.find((item) => item.id === task.id) || assignmentFromTask(task);
            return (
              <DetailRow
                key={task.id}
                icon="calendar"
                label={`${formatDateDE(task.task_date)} · ${taskTime(task)}`}
                value={task.title || "Einsatz"}
                onClick={() => onOpenAssignment(assignment)}
              />
            );
          }) : <p className="px-4 py-3 text-[14px] text-ink-400">Keine kommenden Einsätze für dieses Objekt.</p>}

          <SectionHeading>Reinigungsplan</SectionHeading>
          {planItems.length ? planItems.slice(0, 12).map((item) => (
            <DetailRow
              key={item.id}
              icon="check"
              label={`${item.area || "Bereich offen"} · ${item.interval_type || "Intervall offen"}`}
              value={
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">{item.task_title || item.area || "Aufgabe"}</span>
                  {item.calculation_minutes ? <span className="shrink-0 text-[13px] text-ink-400">{item.calculation_minutes} min</span> : null}
                </span>
              }
              hint={item.task_description || undefined}
            />
          )) : <p className="px-4 py-3 text-[14px] text-ink-400">Für dieses Objekt ist kein Reinigungsplan hinterlegt.</p>}

          <SectionHeading>Material am Objekt</SectionHeading>
          {materials.length ? materials.slice(0, 8).map((item) => (
            <DetailRow
              key={item.id}
              icon="box"
              label={item.category || item.supplier || "Ohne Gruppe"}
              value={
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">{item.name || "Material"}</span>
                  <span className="shrink-0 text-[13px] text-ink-400">{item.current_stock ?? "—"} {item.unit || ""}</span>
                </span>
              }
            />
          )) : <p className="px-4 py-3 pb-6 text-[14px] text-ink-400">Kein Material zugeordnet.</p>}
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
      const kleinere = await bilderVerkleinern(photos);
      kleinere.forEach((photo) => formData.append("photos", photo));

      const response = await fetch("/api/mobile/issues", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      const result = await antwortLesen(response);
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

  const fieldClass = "mt-1.5 w-full rounded-xl border border-paper-200 px-4 py-3.5 text-[15px] text-ink-900 outline-none focus:border-brand-500";
  const labelClass = "text-[13px] text-ink-400";

  return (
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">Objektmeldung</h1>
          <p className="text-[14px] text-ink-400">Schaden, Mangel oder Hinweis ans Büro</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4 px-4 pt-5">
        <label className="block">
          <span className={labelClass}>Objekt</span>
          <select value={siteIndex} onChange={(event) => setSiteIndex(Number(event.target.value))} className={fieldClass}>
            {sites.length ? sites.map((site, index) => <option key={`${site.workSiteId || "site"}-${site.siteName}`} value={index}>{site.siteName}</option>) : <option>Kein Objekt gefunden</option>}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Einsatz (optional)</span>
          <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className={fieldClass}>
            <option value="">Ohne konkreten Einsatz</option>
            {openTasks.map((task) => <option key={task.id} value={task.id}>{formatShortDateDE(task.task_date)} · {taskTime(task)} · {task.site || task.customer_name || task.title || "Einsatz"}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>Art</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClass}>
              <option>Mangel / Schaden</option>
              <option>Kundenhinweis</option>
              <option>Zugang / Schlüssel</option>
              <option>Sonderreinigung</option>
              <option>Sicherheitsproblem</option>
              <option>Sonstiges</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Dringlichkeit</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} className={fieldClass}>
              <option value="normal">Normal</option>
              <option value="urgent">Dringend</option>
              <option value="critical">Sofort prüfen</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className={labelClass}>Beschreibung</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            rows={4}
            className={`${fieldClass} placeholder:text-ink-200`}
            placeholder="Was ist passiert? Wo genau? Was muss das Büro wissen?"
          />
        </label>

        <label className="block rounded-xl border border-dashed border-paper-300 p-4">
          <span className={labelClass}>Fotos (optional, bis zu 6)</span>
          <input
            key={photoInputKey}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, 6))}
            className="mt-3 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
          />
          {photos.length ? <p className="mt-3 text-[13px] text-ink-600">{photos.length} Foto{photos.length === 1 ? "" : "s"} ausgewählt</p> : null}
        </label>

        {message && <Banner tone="info">{message}</Banner>}
        <Button variant="primary" full type="submit" disabled={saving || !description.trim()}>{saving ? "Sende…" : "Meldung senden"}</Button>
      </form>

      <SectionHeading>Zuletzt gemeldet</SectionHeading>
      {recentIssueNotifications.length ? recentIssueNotifications.map((item) => (
        <DetailRow
          key={item.id}
          icon="warning"
          label={`${item.object_name || item.site || item.work_site_name || "Objekt"}${item.created_at ? ` · ${formatShortDateDE(item.created_at.slice(0, 10))}` : ""}`}
          value={item.title || "Objektmeldung"}
          hint={item.message || undefined}
        />
      )) : <p className="px-4 py-3 pb-6 text-[14px] text-ink-400">Noch keine Meldung gesendet.</p>}
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

  const fieldClass = "mt-1.5 w-full rounded-xl border border-paper-200 px-4 py-3.5 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";
  const labelClass = "text-[13px] text-ink-400";

  return (
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">Leistungsnachweis</h1>
          <p className="text-[14px] text-ink-400">Kunde bestätigt den Einsatz auf dem Handy</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4 px-4 pt-5">
        <label className="block">
          <span className={labelClass}>Einsatz</span>
          <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className={fieldClass}>
            {taskOptions.map((task) => (
              <option key={task.id} value={task.id}>{formatShortDateDE(task.task_date)} · {taskTime(task)} · {task.site || task.customer_name || task.title || "Einsatz"}</option>
            ))}
          </select>
        </label>

        {selectedTask ? (
          <div className="rounded-xl bg-paper-100 p-3.5">
            <p className="text-[16px] font-semibold text-ink-900">{selectedTask.title || "Einsatz"}</p>
            <p className="mt-0.5 text-[14px] text-ink-600">{selectedTask.site || selectedTask.customer_name || "Objekt ohne Name"}</p>
            <p className="mt-0.5 text-[13px] text-ink-400">{formatDateDE(selectedTask.task_date)} · {taskTime(selectedTask)} · {taskDuration(selectedTask)}</p>
          </div>
        ) : <Banner tone="warn">Für dich ist kein Einsatz eingetragen. Das Büro muss zuerst einen anlegen.</Banner>}

        <label className="block">
          <span className={labelClass}>Name des Kunden oder Ansprechpartners</span>
          <input value={signerName} onChange={(event) => setSignerName(event.target.value)} className={fieldClass} placeholder="z. B. Herr Müller" />
        </label>

        <label className="block">
          <span className={labelClass}>Notiz (optional)</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={fieldClass} placeholder="Was wurde bestätigt? Besonderheiten?" />
        </label>

        <div className="rounded-xl border border-dashed border-paper-300 p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={labelClass}>Unterschrift des Kunden</p>
            <button type="button" onClick={clearSignature} className="text-[14px] font-semibold text-brand-700">Löschen</button>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            className="touch-none rounded-xl border border-paper-200 bg-white"
          />
          <p className="mt-2 text-[13px] text-ink-400">Mit dem Finger unterschreiben lassen.</p>
        </div>

        {message && <Banner tone="info">{message}</Banner>}
        <Button variant="primary" full type="submit" disabled={saving || !selectedTask || !hasSignature}>
          {saving ? "Speichere…" : "Leistungsnachweis senden"}
        </Button>
      </form>

      <SectionHeading>Zuletzt bestätigt</SectionHeading>
      {recentReports.length ? recentReports.slice(0, 5).map((report) => (
        <div key={report.id} className="flex items-start gap-3 border-b border-paper-200 px-4 py-3.5">
          <span className="mt-0.5 shrink-0 text-ink-400"><UiIcon name="note" className="h-[22px] w-[22px]" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-ink-900">{report.work_site_name || "Objekt"}</p>
            <p className="mt-0.5 text-[13px] text-ink-400">
              {report.signer_name || "Kunde"}
              {report.created_at ? ` · ${new Date(report.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          </div>
          {report.signature_url ? (
            <a href={report.signature_url} target="_blank" rel="noreferrer" className="shrink-0 text-[14px] font-semibold text-brand-700">Unterschrift</a>
          ) : null}
        </div>
      )) : <p className="px-4 py-3 pb-6 text-[14px] text-ink-400">Noch keine Kundenbestätigung gespeichert.</p>}
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
  // Rückmeldung direkt unter dem Knopf. Vorher landete sie als kleine graue
  // Zeile oberhalb — beim Tippen sah es so aus, als passiere gar nichts.
  const [meldung, setMeldung] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const alsAppInstalliert = typeof window !== "undefined"
    && (window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as any).standalone === true);
  const istApple = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

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
    setMeldung(null);
    try {
      if (istApple && !alsAppInstalliert) {
        throw new Error("Auf dem iPhone gehen Meldungen nur, wenn die App auf dem Home-Bildschirm liegt. Unten auf das Teilen-Symbol, dann „Zum Home-Bildschirm“, und von dort aus noch einmal anmelden.");
      }
      if (!pushSupported()) throw new Error("Dieser Browser kann keine Meldungen empfangen.");
      if (!vapidPublicKey) throw new Error("Der Schlüssel NEXT_PUBLIC_VAPID_PUBLIC_KEY fehlt in Vercel. Ohne ihn kann kein Gerät angemeldet werden.");

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
      setMeldung({ tone: "success", text: "Dieses Gerät ist angemeldet. Schick dir gleich eine Testmeldung." });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Push konnte nicht aktiviert werden.";
      setStatus(text);
      setMeldung({ tone: "danger", text });
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
    <div className="-mx-4 -mt-4">
      <div className="flex items-start gap-2 px-2 pt-2">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800" aria-label="Zurück">
          <UiIcon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">Benachrichtigungen</h1>
          <p className="text-[14px] text-ink-400">Erinnerungen und Hinweise aufs Handy</p>
        </div>
        <div className="pt-2"><StatusPill tone={enabled ? "success" : "neutral"}>{enabled ? "Aktiv" : "Aus"}</StatusPill></div>
      </div>

      <DetailRow icon="bell" label="Status auf diesem Gerät" value={enabled ? "Aktiv" : "Noch nicht aktiv"} hint={status} />
      <DetailRow icon="clock" label="Wofür" value="Einsatz-Erinnerungen, Meldungen vom Büro, Entscheidungen zu Anträgen" />

      <div className="space-y-3 px-4 pt-5">
        <Button variant="primary" full disabled={saving} onClick={enablePush}>
          {saving ? "Speichere…" : enabled ? "Erneut aktivieren" : "Auf diesem Gerät aktivieren"}
        </Button>
        {meldung ? <Banner tone={meldung.tone}>{meldung.text}</Banner> : null}
        <Button variant="neutral" full disabled={saving || !enabled} onClick={sendTest}>Testmeldung senden</Button>
        {lastTest ? <Banner tone="info">{lastTest}</Banner> : null}
        {istApple && !alsAppInstalliert ? (
          <Banner tone="warn">Diese Seite läuft gerade im Safari-Tab. Für Meldungen muss sie über „Teilen → Zum Home-Bildschirm“ als App abgelegt und von dort geöffnet werden.</Banner>
        ) : (
          <p className="text-[13px] text-ink-400">Auf dem iPhone muss die App zuerst über „Teilen → Zum Home-Bildschirm“ hinzugefügt werden, sonst kommen keine Meldungen an.</p>
        )}
      </div>
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
  const adminLinks = [
    { href: "/mitarbeiter/admin/tageszentrale", label: "Tageszentrale" },
    { href: "/mitarbeiter/admin/zeiten", label: "Zeitenfreigabe" },
    { href: "/mitarbeiter/admin/planung", label: "Planungszentrale" },
    { href: "/mitarbeiter/admin/urlaub", label: "Urlaubsplanung" },
    { href: "/mitarbeiter/admin/kapazitaet", label: "Kapazitätsplanung" },
    { href: "/mitarbeiter/admin/auswertung", label: "Monatsauswertung" },
    { href: "/mitarbeiter/admin/push", label: "Push-Zentrale" },
    { href: "/mitarbeiter/admin", label: "Admin-Dashboard" },
    { href: "/mitarbeiter/admin/freigaben", label: "Freigaben" },
    { href: "/mitarbeiter/admin?tab=employees", label: "Mitarbeiter anlegen" },
    { href: "/mitarbeiter/admin/aktivieren", label: "Mitarbeiter-Login vergeben" },
    { href: "/mitarbeiter/admin/geraete", label: "Geräte und Inventar" }
  ];

  return (
    <div className="-mx-4 -mt-4">
      <div className="px-4 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Mehr</h1>
        <p className="mt-0.5 text-[14px] text-ink-400">{data?.employee?.name || employeeName}</p>
      </div>

      {data?.isAdmin ? (
        <>
          <SectionHeading>Mitarbeiter ansehen</SectionHeading>
          <div className="px-4 pb-1">
            <EmployeeSelect employees={data?.employees || []} employeeName={employeeName} onChange={onEmployeeChange} />
          </div>
          <SectionHeading>Adminbereich</SectionHeading>
          {adminLinks.map((link) => (
            <a key={link.href} href={link.href} className="flex items-center gap-3 border-b border-paper-200 px-4 py-3.5">
              <span className="shrink-0 text-ink-400"><UiIcon name="shield" className="h-[22px] w-[22px]" /></span>
              <span className="min-w-0 flex-1 text-[16px] font-semibold text-ink-900">{link.label}</span>
              <UiIcon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-200" />
            </a>
          ))}
        </>
      ) : null}

      <SectionHeading>Funktionen</SectionHeading>
      {items.map((item) => (
        <button key={item.title} onClick={() => setActive(item.tab)} className="flex w-full items-center gap-3 border-b border-paper-200 px-4 py-3.5 text-left">
          <span className="shrink-0 text-ink-400"><UiIcon name={menuIcon(item.icon)} className="h-[22px] w-[22px]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold text-ink-900">{item.title}</span>
            <span className="mt-0.5 block truncate text-[13px] text-ink-400">{item.subtitle}</span>
          </span>
          <UiIcon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-200" />
        </button>
      ))}

      <div className="px-4 py-6">
        <Button variant="neutral" full onClick={onLogout}>Abmelden</Button>
      </div>
    </div>
  );
}

/** Suche über Einsätze, Objekte, Material und Nachweise. */
function SearchScreen({ data, onOpenAssignment, setActive }: { data: AppData | null; onOpenAssignment: (assignment: Assignment) => void; setActive: (tab: Tab) => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const assignments = useMemo(() => assignmentsFromTasks(data?.tasks || []), [data?.tasks]);
  const hits = useMemo(() => {
    if (needle.length < 2) return { tasks: [], sites: [], materials: [] };
    return {
      tasks: assignments.filter((assignment) =>
        `${assignment.title} ${assignment.address} ${assignment.customer} ${assignment.tag}`.toLowerCase().includes(needle)
      ).slice(0, 12),
      sites: (data?.workSites || []).filter((site) =>
        `${workSiteName(site)} ${site.address || ""} ${site.customer_name || ""}`.toLowerCase().includes(needle)
      ).slice(0, 8),
      materials: (data?.materialProducts || []).filter((product) =>
        `${product.name || ""} ${product.category || ""}`.toLowerCase().includes(needle)
      ).slice(0, 8)
    };
  }, [assignments, data?.materialProducts, data?.workSites, needle]);

  const total = hits.tasks.length + hits.sites.length + hits.materials.length;

  return (
    <div className="-mx-4 -mt-4">
      <div className="px-4 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">Suche</h1>
      </div>
      <div className="px-4 pt-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Einsatz, Objekt oder Material" />
      </div>

      {needle.length < 2 ? (
        <EmptyState icon="search" title="Wonach suchst du?" text="Tippe mindestens zwei Buchstaben. Gesucht wird in Einsätzen, Objekten und Material." />
      ) : !total ? (
        <EmptyState icon="search" title="Nichts gefunden" text={`Zu „${query}“ gibt es keinen Treffer.`} />
      ) : null}

      {hits.tasks.length ? (
        <>
          <SectionHeading>Einsätze</SectionHeading>
          {hits.tasks.map((assignment) => (
            <DetailRow
              key={assignment.id}
              icon="calendar"
              label={`${formatDateDE(assignment.date)} · ${assignment.time}`}
              value={assignment.title}
              hint={assignment.address}
              onClick={() => onOpenAssignment(assignment)}
            />
          ))}
        </>
      ) : null}

      {hits.sites.length ? (
        <>
          <SectionHeading>Objekte</SectionHeading>
          {hits.sites.map((site) => (
            <DetailRow key={site.id} icon="building" label={site.customer_name || "Objekt"} value={workSiteName(site)} hint={site.address || undefined} onClick={() => setActive("objects")} />
          ))}
        </>
      ) : null}

      {hits.materials.length ? (
        <>
          <SectionHeading>Material</SectionHeading>
          {hits.materials.map((product) => (
            <DetailRow key={product.id} icon="box" label={product.category || "Artikel"} value={product.name || "Material"} onClick={() => setActive("material")} />
          ))}
        </>
      ) : null}
    </div>
  );
}

/** Alte Icon-Namen des Menüs auf den gemeinsamen Icon-Satz abbilden. */
function menuIcon(name: string) {
  const map: Record<string, string> = { shield: "check", sheet: "note", map: "pin" };
  return map[name] || name;
}

function LoadingScreen() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-[3px] border-paper-200 border-t-brand-600" />
        <p className="text-[15px] text-ink-400">Daten werden geladen…</p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="space-y-4 pt-6">
      <Banner tone="danger">{error}</Banner>
      <Button variant="primary" full onClick={onRetry}>Erneut laden</Button>
      <p className="text-[13px] text-ink-400">Bleibt der Fehler, ist meist die Verbindung zur Datenbank gestört. Dann bitte im Büro melden.</p>
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
    <main className="min-h-[100dvh] bg-white px-5 text-ink-900">
      <div className="mx-auto flex min-h-[100dvh] max-w-[430px] flex-col justify-center py-10">
        <div className="mb-8">
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-2xl">🧼</div>
          <h1 className="text-[30px] font-bold tracking-tight">Schichtklar</h1>
          <p className="mt-1 text-[15px] text-ink-400">Melde dich mit deiner Arbeits-E-Mail an.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-[13px] text-ink-400">E-Mail</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl border border-paper-200 px-4 py-3.5 text-[16px] text-ink-900 outline-none focus:border-brand-500"
              placeholder="name@firma.de"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-ink-400">Passwort</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-paper-200 px-4 py-3.5 text-[16px] text-ink-900 outline-none focus:border-brand-500"
              placeholder="Passwort"
            />
          </label>
          {error && <Banner tone="danger">{error}</Banner>}
          <Button variant="primary" full type="submit" disabled={saving}>{saving ? "Melde an…" : "Anmelden"}</Button>
        </form>

        <p className="mt-6 text-[13px] text-ink-400">Zugang vergessen? Melde dich im Büro, dann setzen wir dir ein neues Passwort.</p>
      </div>
    </main>
  );
}

export default function MitarbeiterApp({ initialTab = "home", initialWorkSiteId = "", initialAction = "stempeln" }: { initialTab?: string; initialWorkSiteId?: string; initialAction?: "stempeln" | "material" }) {
  const [active, setActive] = useState<Tab>(() => tabFromProp(initialTab));
  const [siteHinweis, setSiteHinweis] = useState("");
  const [siteErledigt, setSiteErledigt] = useState(false);
  const [autoStempeln, setAutoStempeln] = useState(false);
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  /**
   * Daten holen. Mit silent bleibt der Bildschirm stehen und wird im
   * Hintergrund aktualisiert. Ohne silent erscheint die Ladeanzeige, das ist
   * nur beim ersten Aufbau und nach einem Fehler sinnvoll.
   */
  const loadData = useCallback(async (name?: string, tokenOverride?: string, silent = false) => {
    const token = tokenOverride || authToken;
    if (!token) {
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);
    try {
      const storedName = typeof window !== "undefined" ? window.localStorage.getItem("cleantrack-employee-name") || "" : "";
      const wantedName = name || employeeName || storedName;
      const teile: string[] = [];
      if (wantedName) teile.push(`employee=${encodeURIComponent(wantedName)}`);
      // Kommt der Aufruf von einem Aufkleber, muss dieses Objekt mitgeliefert
      // werden, auch wenn der Mitarbeiter dort keinen Einsatz hat. Sonst fehlt
      // es in der Auswahl und der Aufkleber zeigt auf ein leeres Feld.
      if (initialWorkSiteId) teile.push(`site=${encodeURIComponent(initialWorkSiteId)}`);
      const query = teile.length ? `?${teile.join("&")}` : "";
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

  /** Aktualisieren, ohne den Bildschirm auszublenden. */
  const refreshData = useCallback(async (name?: string) => {
    await loadData(name || employeeName, undefined, true);
  }, [employeeName, loadData]);

  /**
   * Service Worker beim Start anmelden, nicht erst beim Einschalten der
   * Push-Nachrichten. Er speichert die App-Hülle zwischen, damit die App auch
   * bei schlechtem Empfang sofort startet.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);

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

  /**
   * Kommt der Aufruf von einem NFC-Aufkleber am Objekt, ist die Objekt-Nummer
   * in der Adresse enthalten. Sobald die Daten geladen sind, wird der heutige
   * Einsatz an diesem Objekt gesucht und die Stempeluhr direkt geöffnet.
   * Läuft nur einmal, damit der Mitarbeiter danach frei navigieren kann.
   */
  useEffect(() => {
    if (!initialWorkSiteId || siteErledigt || !data) return;

    // Materialaufkleber: kein Einsatz nötig, das Bestellblatt kümmert sich
    // selbst um die Vorauswahl des Objekts.
    if (initialAction === "material") {
      setSiteErledigt(true);
      return;
    }

    const heute = todayIso();
    const alle = data.tasks || [];
    const passend = alle.filter((task) => String(task.work_site_id || "") === initialWorkSiteId);
    const heutige = passend.filter((task) => String(task.task_date || "").slice(0, 10) === heute);
    const treffer = heutige[0] || null;

    setSiteErledigt(true);

    if (treffer) {
      setSelectedTaskId(treffer.id);
      setActive("clock");
      setSiteHinweis("");
      // Nur bei einem eindeutigen Einsatz von allein stempeln. Stehen an einem
      // Tag mehrere an, entscheidet der Mitarbeiter, welcher gemeint ist.
      setAutoStempeln(heutige.length === 1);
      return;
    }

    if (passend.length) {
      setActive("schedule");
      setSiteHinweis("Für dieses Objekt ist heute kein Einsatz geplant. Wähle den passenden Einsatz aus.");
      return;
    }

    setActive("schedule");
    setSiteHinweis("Dieses Objekt gehört nicht zu deinen Einsätzen.");
  }, [initialWorkSiteId, siteErledigt, data]);

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
      <main className="min-h-screen bg-white px-3 py-4 text-ink-900 sm:px-5">
        <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[430px] place-items-center rounded-[2rem] border border-brand-500/30 bg-paper-100">
          <LoadingScreen />
        </div>
      </main>
    );
  }

  if (!authToken) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <AppShell
      active={active}
      setActive={(tab) => {
        // Der Admin-Reiter führt in den Adminbereich, das ist eine eigene Seite.
        if (tab === "admin") { window.location.href = "/mitarbeiter/admin"; return; }
        setActive(tab);
      }}
      unreadCount={unreadCountFromData(data)}
      employee={data?.employee}
      isAdmin={Boolean(data?.isAdmin)}
      onOpenMenu={() => setActive("menu")}
    >
      {loading && <LoadingScreen />}
      {!loading && error && <ErrorScreen error={error} onRetry={() => loadData()} />}
      {!loading && !error && siteHinweis ? (
        <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-[14px] leading-relaxed text-amber-900">{siteHinweis}</p>
          <button
            type="button"
            onClick={() => setSiteHinweis("")}
            className="mt-2 text-[13px] font-semibold text-amber-900 underline"
          >
            Verstanden
          </button>
        </div>
      ) : null}
      {!loading && !error && (
        <>
          {active === "home" && <Dashboard data={data} assignments={assignments} setActive={setActive} employeeName={employeeName} onEmployeeChange={handleEmployeeChange} onOpenAssignment={openAssignment} onStartAssignment={(assignment) => { setSelectedTaskId(assignment.id); setActive("clock"); }} />}
          {active === "schedule" && (
            <Schedule
              assignments={assignments}
              onOpenAssignment={openAssignment}
              onStartAssignment={(assignment) => { setSelectedTaskId(assignment.id); setActive("clock"); }}
            />
          )}
          {active === "taskdetail" && <TaskDetail data={data} authToken={authToken} taskId={selectedTaskId} onBack={() => setActive("schedule")} onOpenClock={openClockForTask} onOpenQuality={openQualityForTask} onReload={() => refreshData()} />}
          {active === "clock" && <Clock data={data} authToken={authToken} onReload={() => refreshData()} selectedTaskId={selectedTaskId} onOpenSchedule={() => setActive("schedule")} autoStamp={autoStempeln} />}
          {active === "timesheet" && (
            <Timesheet
              entries={timeEntries}
              absences={data?.absences || []}
              tasks={data?.tasks || []}
              rawEntries={data?.timeEntries || []}
              employee={data?.employee}
              authToken={authToken}
              onReload={() => refreshData()}
            />
          )}
          {active === "tasks" && <Tasks tasks={data?.tasks || []} authToken={authToken} onReload={() => refreshData()} />}
          {active === "menu" && <Menu data={data} employeeName={employeeName} onEmployeeChange={handleEmployeeChange} onLogout={handleLogout} setActive={setActive} />}
          {active === "material" && <MaterialScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => refreshData()} initialSiteId={initialAction === "material" ? initialWorkSiteId : ""} autoOpen={initialAction === "material"} />}
          {active === "quality" && <QualityScreen data={data} authToken={authToken} selectedTaskId={selectedTaskId} onBack={() => selectedTaskId ? setActive("taskdetail") : setActive("menu")} onReload={() => refreshData()} />}
          {active === "absence" && <AbsenceScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => refreshData()} />}
          {active === "chat" && <ChatScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => refreshData()} />}
          {active === "notifications" && <NotificationsScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => refreshData()} />}
          {active === "dayclose" && <DayCloseScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => refreshData()} />}
          {active === "route" && <RoutePlanScreen assignments={assignments} onBack={() => setActive("menu")} onOpenAssignment={openAssignment} />}
          {active === "objects" && <ObjectsScreen data={data} onBack={() => setActive("menu")} onOpenAssignment={openAssignment} />}
          {active === "issue" && <IssueScreen data={data} authToken={authToken} onBack={() => setActive("menu")} onReload={() => refreshData()} />}
          {active === "service" && <ServiceReportScreen data={data} authToken={authToken} selectedTaskId={selectedTaskId} onBack={() => setActive("menu")} onReload={() => refreshData()} />}
          {active === "push" && <PushSettingsScreen authToken={authToken} onBack={() => setActive("menu")} />}
          {active === "search" && <SearchScreen data={data} onOpenAssignment={openAssignment} setActive={setActive} />}
          {active === "profile" && <ProfileScreen data={data} onBack={() => setActive("menu")} onLogout={handleLogout} />}
        </>
      )}
    </AppShell>
  );
}

