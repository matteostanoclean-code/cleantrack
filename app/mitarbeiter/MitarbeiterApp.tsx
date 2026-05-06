"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { supabase } from "../../lib/supabase";

type AdminMobileRow = Record<string, any>;

type Status = "none" | "working" | "break";
type Tab = "home" | "tasks" | "clock" | "timesheet" | "schedule" | "search" | "chat" | "profile" | "absence" | "material" | "admin";

type EmployeeProfile = {
  id: string;
  auth_user_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  active?: boolean | null;
  avatar_url?: string | null;
  must_change_password?: boolean | null;
  monthly_hour_limit?: number | null;
  monthly_hours?: number | null;
  vacation_days?: number | null;
  annual_vacation_days?: number | null;
};

type WorkSite = {
  id: string;
  name: string;
  address?: string | null;
  customer_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  allowed_radius_m?: number | null;
};

type MaterialProduct = {
  id: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  work_site_id?: string | null;
  object_name?: string | null;
  minimum_stock?: number | null;
  current_stock?: number | null;
  image_url?: string | null;
};

type Task = {
  id: string;
  title: string;
  site: string | null;
  employee_name: string | null;
  task_date: string;
  done: boolean;
  start_time: string | null;
  end_time: string | null;
  max_minutes: number | null;
  planned_minutes: number | null;
  approved_overtime_minutes?: number | null;
  overtime_status?: string | null;
  priority?: string | null;
  task_category?: string | null;
  due_date?: string | null;
  status?: string | null;
  notes?: string | null;
  quality_required?: boolean | null;
  quality_photo_required?: boolean | null;
  quality_checklist?: string[] | null;
  customer_name?: string | null;
  item_type?: string | null;
  task_type?: string | null;
  work_site_id: string | null;
};

type ChatMessage = {
  id: string;
  employee_name: string;
  sender_role: string;
  sender_name: string | null;
  message: string;
  read_by_admin: boolean | null;
  read_by_employee: boolean | null;
  created_at: string;
};

type AdminNotification = {
  id: string;
  title: string;
  message: string;
  status: string | null;
  notification_type: string | null;
  overtime_minutes: number | null;
  created_at: string;
};

type AbsenceRequest = {
  id: string;
  employee_name: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type TimeEntry = {
  id: string;
  employee_name: string;
  work_site_name: string | null;
  site?: string | null;
  work_site_id?: string | null;
  task_id?: string | null;
  absence_request_id?: string | null;
  absence_type?: string | null;
  action: "start" | "break_start" | "break_end" | "end" | "manual" | "absence" | "auto_clock_out" | "check_in" | "check_out" | "pause_start" | "pause_end";
  created_at: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
  work_date?: string | null;
  auto_clock_out: boolean | null;
  worked_minutes?: number | null;
  payroll_minutes?: number | null;
  planned_minutes?: number | null;
  reason?: string | null;
  status?: string | null;
  approved?: boolean | null;
  entry_type?: string | null;
  pause_minutes?: number | null;
  pause_started_at?: string | null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function formatDate(value: Date) {
  return value.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function dateLabel(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatClock(value: string | null) {
  if (!value) return "--:--";
  if (value.length <= 5) return value;
  return value.slice(0, 5);
}

function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

function initials(name: string) {
  return (name || "M")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function sortTasksByTime(items: Task[]) {
  return [...items].sort((a, b) => `${a.start_time || "99:99"}`.localeCompare(`${b.start_time || "99:99"}`));
}

function toMinutes(time: string | null | undefined) {
  if (!time) return 0;
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function taskChecklist(task?: Task | null) {
  return Array.isArray(task?.quality_checklist) ? task.quality_checklist.map(String).filter(Boolean) : [];
}

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Foto konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function isNowInsideWindow(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return true;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const a = toMinutes(start);
  let b = toMinutes(end);
  let c = current;
  if (b < a) b += 1440;
  if (c < a && b > 1440) c += 1440;
  return c >= a && c <= b;
}

function dateRangeDays(startValue?: string | null, endValue?: string | null) {
  if (!startValue) return 0;
  const start = new Date(`${startValue.slice(0, 10)}T00:00:00`);
  const end = new Date(`${(endValue || startValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function absenceType(value?: string | null) {
  return String(value || "").toLowerCase();
}

function approvedAbsenceDays(requests: AbsenceRequest[], typeNeedle: string) {
  return requests
    .filter((item) => ["approved", "genehmigt"].includes(String(item.status || "").toLowerCase()))
    .filter((item) => absenceType(item.absence_type).includes(typeNeedle))
    .reduce((sum, item) => sum + dateRangeDays(item.start_date, item.end_date), 0);
}

function absenceEntryTypeKey(entry: TimeEntry) {
  return String(entry.absence_type || entry.reason || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function isAbsenceEntry(entry: TimeEntry) {
  const action = String(entry.action || "").trim().toLowerCase();
  const type = String(entry.entry_type || "").trim().toLowerCase();
  return action === "absence" || type === "absence" || Boolean(entry.absence_request_id);
}

function isApprovedTimeEntry(entry: TimeEntry) {
  const status = String(entry.status || "").trim().toLowerCase();
  return entry.approved === true || status === "approved" || status === "freigegeben";
}

function entryMinutes(entry: TimeEntry) {
  const direct = Number(entry.payroll_minutes || entry.worked_minutes || 0);
  if (direct > 0) return direct;

  const startRaw = entry.check_in_at || entry.created_at;
  const endRaw = entry.check_out_at || entry.finished_at || entry.updated_at;
  if (!startRaw || !endRaw) return 0;

  const start = new Date(startRaw).getTime();
  const end = new Date(endRaw).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  const pause = Number(entry.pause_minutes || 0);
  return Math.max(0, Math.round((end - start) / 60000) - pause);
}

function timeEntryDay(entry: TimeEntry) {
  return String(entry.work_date || entry.check_in_at || entry.check_out_at || entry.created_at || "").slice(0, 10);
}

function uniqueTimeEntries(entries: TimeEntry[]) {
  const map = new Map<string, TimeEntry>();

  for (const entry of entries) {
    const day = timeEntryDay(entry);
    const isAbsence = isAbsenceEntry(entry);
    const key = isAbsence
      ? `absence-${entry.absence_request_id || ""}-${entry.absence_type || entry.reason || ""}-${day}`
      : `time-${entry.id || ""}-${entry.task_id || ""}-${entry.employee_name || ""}-${entry.work_site_id || entry.site || entry.work_site_name || ""}-${day}-${entry.check_in_at || entry.created_at || ""}`;

    const existing = map.get(key);
    if (!existing || entryMinutes(entry) >= entryMinutes(existing)) {
      map.set(key, entry);
    }
  }

  return [...map.values()];
}

function absenceEntryMinutes(entries: TimeEntry[], predicate: (entry: TimeEntry) => boolean) {
  return uniqueTimeEntries(entries)
    .filter(isAbsenceEntry)
    .filter(isApprovedTimeEntry)
    .filter(predicate)
    .reduce((sum, entry) => sum + entryMinutes(entry), 0);
}

function vacationEntryMinutes(entries: TimeEntry[]) {
  return absenceEntryMinutes(entries, (entry) => absenceEntryTypeKey(entry).includes("urlaub"));
}

function sickEntryMinutes(entries: TimeEntry[]) {
  return absenceEntryMinutes(entries, (entry) => absenceEntryTypeKey(entry).includes("krank"));
}

function unpaidEntryMinutes(entries: TimeEntry[]) {
  return absenceEntryMinutes(entries, (entry) => absenceEntryTypeKey(entry).includes("unbezahlt"));
}

function paidFreeEntryMinutes(entries: TimeEntry[]) {
  return absenceEntryMinutes(entries, (entry) => {
    const type = absenceEntryTypeKey(entry);
    return !type.includes("unbezahlt") && (type.includes("bezahlt") || type.includes("frei"));
  });
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  });
}


export default function MitarbeiterApp({ initialTab = "home" }: { initialTab?: Tab }) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [workSites, setWorkSites] = useState<WorkSite[]>([]);
  const [materials, setMaterials] = useState<MaterialProduct[]>([]);
  const [materialSiteId, setMaterialSiteId] = useState("");
  const [materialProductId, setMaterialProductId] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("1");
  const [materialNotes, setMaterialNotes] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCart, setMaterialCart] = useState<Record<string, number>>({});
  const [materialSaving, setMaterialSaving] = useState(false);
  const [materialMessage, setMaterialMessage] = useState("");
  const [adminMobileTab, setAdminMobileTab] = useState<"today" | "approval" | "material" | "assignment">("today");
  const [adminMobileData, setAdminMobileData] = useState<{ employees: AdminMobileRow[]; tasks: AdminMobileRow[]; entries: AdminMobileRow[]; absenceRequests: AdminMobileRow[]; materialReports: AdminMobileRow[]; qualityReports: AdminMobileRow[]; materials: AdminMobileRow[]; sites: AdminMobileRow[]; chats: AdminMobileRow[] }>({ employees: [], tasks: [], entries: [], absenceRequests: [], materialReports: [], qualityReports: [], materials: [], sites: [], chats: [] });
  const [adminMaterialSiteId, setAdminMaterialSiteId] = useState("");
  const [adminMaterialName, setAdminMaterialName] = useState("");
  const [adminMaterialUnit, setAdminMaterialUnit] = useState("Stk.");
  const [adminMaterialCategory, setAdminMaterialCategory] = useState("Artikel ohne Gruppe");
  const [adminAssignmentSiteId, setAdminAssignmentSiteId] = useState("");
  const [adminAssignmentEmployeeName, setAdminAssignmentEmployeeName] = useState("");
  const [adminAssignmentDate, setAdminAssignmentDate] = useState(todayISO());
  const [adminAssignmentStart, setAdminAssignmentStart] = useState("08:00");
  const [adminAssignmentEnd, setAdminAssignmentEnd] = useState("09:00");
  const [adminAssignmentPlanned, setAdminAssignmentPlanned] = useState("60");
  const [adminAssignmentNotes, setAdminAssignmentNotes] = useState("");
  const [adminManualEmployeeName, setAdminManualEmployeeName] = useState("");
  const [adminManualSiteId, setAdminManualSiteId] = useState("");
  const [adminManualDate, setAdminManualDate] = useState(todayISO());
  const [adminManualStart, setAdminManualStart] = useState("08:00");
  const [adminManualEnd, setAdminManualEnd] = useState("09:00");
  const [adminManualReason, setAdminManualReason] = useState("Zeit nachgetragen");
  const [adminManualNotes, setAdminManualNotes] = useState("");
  const [adminMobileMessage, setAdminMobileMessage] = useState("");
  const [adminMobileSaving, setAdminMobileSaving] = useState(false);
  const [absenceType, setAbsenceType] = useState("Urlaub");
  const [absenceStartDate, setAbsenceStartDate] = useState(todayISO());
  const [absenceEndDate, setAbsenceEndDate] = useState(todayISO());
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceMessage, setAbsenceMessage] = useState("");
  const [absenceRequests, setAbsenceRequests] = useState<AbsenceRequest[]>([]);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<TimeEntry[]>([]);
  const [serverWorkedMinutes, setServerWorkedMinutes] = useState(0);
  const [serverPayrollMinutes, setServerPayrollMinutes] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatError, setChatError] = useState("");
  const [adminChatEmployee, setAdminChatEmployee] = useState("");
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<Status>("none");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedActionTask, setSelectedActionTask] = useState<Task | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Task | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [clockSaving, setClockSaving] = useState(false);
  const [clockNotice, setClockNotice] = useState("");
  const [pushNotice, setPushNotice] = useState("");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const autoClockOutRef = useRef(false);
  const lastOvertimeRequestRef = useRef("");

  const name = profile?.name || "";
  const role = profile?.role || "employee";
  const today = todayISO();
  const todayAssignments = useMemo(() => sortTasksByTime(tasks.filter((task) => task.task_date === today && task.item_type !== "task" && task.task_type !== "task")), [tasks, today]);
  const todayActionTasks = useMemo(() => sortTasksByTime(tasks.filter((task) => task.task_date === today && (task.item_type === "task" || task.task_type === "task"))), [tasks, today]);
  const openTasks = todayAssignments.filter((task) => !task.done).length;
  const doneTasks = todayAssignments.filter((task) => task.done).length;
  const plannedMinutes = todayAssignments.reduce((sum, task) => sum + (task.planned_minutes || task.max_minutes || 0), 0);
  const calculatedWorkedMinutes = useMemo(() => calculateWorkedMinutes(todayEntries), [todayEntries, status]);
  const workedMinutes = Math.max(calculatedWorkedMinutes, serverWorkedMinutes);
  const payrollMinutesToday = Math.max(serverPayrollMinutes, todayEntries.reduce((sum, entry) => sum + Number(entry.payroll_minutes || entry.worked_minutes || 0), 0), calculatedWorkedMinutes);
  const pauseMinutes = useMemo(() => calculatePauseMinutes(todayEntries), [todayEntries, status]);
  const progress = plannedMinutes > 0 ? Math.min(100, Math.round((workedMinutes / plannedMinutes) * 100)) : 0;
  const selectedTask = todayAssignments.find((task) => task.id === selectedTaskId) || todayAssignments.find((task) => !task.done) || todayAssignments[0] || null;
  const selectedSite = selectedTask ? workSites.find((site) => site.id === selectedTask.work_site_id || site.name === selectedTask.site) || null : null;
  const isAdminRole = role === "admin" || role === "objektleiter";

  function adminRowDate(row: AdminMobileRow) {
    return String(row.work_date || row.task_date || row.due_date || row.created_at || "").slice(0, 10);
  }

  function adminTaskDate(row: AdminMobileRow) {
    return String(row.task_date || row.due_date || "").slice(0, 10);
  }

  function adminEntryMatchesTask(entry: AdminMobileRow, task: AdminMobileRow) {
    const taskDate = adminTaskDate(task);
    if (!taskDate || adminRowDate(entry) !== taskDate) return false;

    const employee = String(task.employee_name || "").trim();
    if (employee && String(entry.employee_name || "").trim() !== employee) return false;

    const taskId = String(task.id || "");
    if (taskId && String(entry.task_id || "") === taskId) return true;

    const siteId = String(task.work_site_id || task.site_id || "");
    if (siteId && String(entry.work_site_id || entry.site_id || "") === siteId) return true;

    const siteName = String(task.site || task.work_site_name || "").trim().toLowerCase();
    const entrySiteName = String(entry.site || entry.work_site_name || "").trim().toLowerCase();
    return Boolean(siteName && entrySiteName && siteName === entrySiteName);
  }

  function adminTaskDueForMissingTime(task: AdminMobileRow) {
    const taskDate = adminTaskDate(task);
    if (!taskDate) return false;
    if (taskDate < today) return true;
    if (taskDate > today) return false;
    const endTime = String(task.end_time || "").slice(0, 5);
    if (!endTime) return true;
    return endTime <= new Date().toTimeString().slice(0, 5);
  }

  const adminUnreadChatGroups = useMemo(() => {
    const unread = adminMobileData.chats
      .filter((row) => String(row.sender_role || "").toLowerCase() !== "admin")
      .filter((row) => row.read_by_admin !== true);

    return Object.values(unread.reduce((acc: Record<string, AdminMobileRow & { unread_count: number }>, row) => {
      const key = String(row.employee_name || row.sender_name || "Unbekannt");
      const current = acc[key];
      const currentTime = current ? new Date(String(current.created_at || "")).getTime() : 0;
      const rowTime = new Date(String(row.created_at || "")).getTime();
      if (!current || rowTime >= currentTime) acc[key] = { ...row, employee_name: key, unread_count: (current?.unread_count || 0) + 1 };
      else current.unread_count = (current.unread_count || 0) + 1;
      return acc;
    }, {}));
  }, [adminMobileData.chats]);

  const adminOpenTimeEntries = useMemo(() => adminMobileData.entries
    .filter((entry) => Number(entry.worked_minutes || entry.payroll_minutes || 0) > 0)
    .filter((entry) => !(entry.approved === true || String(entry.status || "").toLowerCase() === "approved")), [adminMobileData.entries]);

  const adminOpenAbsences = useMemo(() => adminMobileData.absenceRequests
    .filter((row) => !["approved", "genehmigt", "rejected", "abgelehnt"].includes(String(row.status || "").toLowerCase())), [adminMobileData.absenceRequests]);

  const adminOpenMaterials = useMemo(() => adminMobileData.materialReports
    .filter((row) => String(row.status || "open").toLowerCase() !== "done"), [adminMobileData.materialReports]);

  const adminOpenQualityReports = useMemo(() => adminMobileData.qualityReports
    .filter((row) => !["reviewed", "geprüft"].includes(String(row.status || "").toLowerCase())), [adminMobileData.qualityReports]);

  const adminMissingTimes = useMemo(() => adminMobileData.tasks
    .filter((task) => String(task.item_type || "").toLowerCase() !== "task" && String(task.task_type || "").toLowerCase() !== "task")
    .filter((task) => Boolean(String(task.employee_name || "").trim()))
    .filter(adminTaskDueForMissingTime)
    .filter((task) => !adminMobileData.entries.some((entry) => adminEntryMatchesTask(entry, task))), [adminMobileData.tasks, adminMobileData.entries, today]);

  const adminTodoCount = isAdminRole
    ? adminUnreadChatGroups.length + adminOpenTimeEntries.length + adminOpenAbsences.length + adminOpenMaterials.length + adminOpenQualityReports.length + adminMissingTimes.length
    : 0;

  const adminChatBadgeCount = isAdminRole ? adminUnreadChatGroups.length : unreadChatCount;

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  async function savePushSubscription(subscription: PushSubscription) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sitzung fehlt. Bitte neu einloggen.");

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription }),
    });

    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Push konnte nicht aktiviert werden.");

    setPushEnabled(true);
    return true;
  }

  async function getPushRegistration() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushSupported(false);
      return null;
    }

    setPushSupported(true);
    const registration = await navigator.serviceWorker.register("/sw.js");
    return registration;
  }

  async function checkPushSubscription(silent = true) {
    if (typeof window === "undefined") return;

    try {
      const registration = await getPushRegistration();
      if (!registration) return;

      if (Notification.permission === "granted") {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await savePushSubscription(existing);
          if (!silent) setPushNotice("Push-Benachrichtigungen sind aktiv.");
          return;
        }
      }

      setPushEnabled(false);
      if (!silent && Notification.permission === "denied") {
        setPushNotice("Push wurde im Browser blockiert. Bitte in den Browser-/App-Einstellungen erlauben.");
      }
    } catch {
      setPushEnabled(false);
      if (!silent) setPushNotice("Push-Status konnte nicht geprüft werden.");
    }
  }

  async function activatePushNotifications() {
    setPushNotice("");

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setPushNotice("Push-Schlüssel fehlt.");
      return;
    }

    try {
      const registration = await getPushRegistration();
      if (!registration) {
        setPushNotice("Push wird auf diesem Gerät nicht unterstützt.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushEnabled(false);
        setPushNotice("Push wurde nicht erlaubt.");
        return;
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await savePushSubscription(subscription);
      setPushNotice("Push-Benachrichtigungen sind aktiv.");
    } catch (error) {
      setPushEnabled(false);
      setPushNotice(error instanceof Error ? error.message : "Push konnte nicht aktiviert werden.");
    }
  }


  useEffect(() => {
    checkExistingSession();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPushSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    checkPushSubscription(true);
  }, []);

  useEffect(() => {
    if (!loggedIn || !name) return;
    checkPushSubscription(true);
  }, [loggedIn, name]);

  useEffect(() => {
    if (!loggedIn || !name) return;
    loadAllData(name);
    const timer = window.setInterval(() => loadAllData(name, true), 15000);
    return () => window.clearInterval(timer);
  }, [loggedIn, name]);

  useEffect(() => {
    if (!loggedIn || !name) return;

    const channel = supabase
      .channel(`cleantrack-employee-${name}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks(name))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        loadUnreadChatCount(name);
        if (activeTab === "chat") loadChatMessages(name);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, () => {
        loadTodayEntries(name);
        loadMonthEntries(name);
        if (role === "admin" || role === "objektleiter") loadMobileAdminData(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "absence_requests" }, () => {
        loadAbsenceRequests(name);
        if (role === "admin" || role === "objektleiter") loadMobileAdminData(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loggedIn, name, activeTab]);

  useEffect(() => {
    if (activeTab !== "chat") return;
    const timer = window.setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    return () => window.clearTimeout(timer);
  }, [activeTab, chatMessages]);

  useEffect(() => {
    const clockActions = new Set(["start", "break_start", "break_end", "end", "check_out"]);
    const last = todayEntries.find((entry) => clockActions.has(String(entry.action || "")));
    if (!last) {
      setStatus("none");
      return;
    }

    if (String(last.status || "") === "running" || last.action === "start" || last.action === "break_end") setStatus("working");
    else if (String(last.status || "") === "paused" || last.action === "break_start") setStatus("break");
    else setStatus("none");
  }, [todayEntries]);

  useEffect(() => {
    if (status !== "working" || !selectedTask) return;
    const maxMinutes = Number(selectedTask.max_minutes || selectedTask.planned_minutes || 0);
    if (!maxMinutes || workedMinutes < maxMinutes || autoClockOutRef.current) return;

    autoClockOutRef.current = true;
    createEntry("end", "max_time_reached");
    setClockNotice("Die geplante Zeit ist erreicht. Ich habe automatisch ausgestempelt. Wenn ich länger brauche, frage ich Überstunden an.");
  }, [status, selectedTask?.id, selectedTask?.max_minutes, selectedTask?.planned_minutes, workedMinutes]);

  useEffect(() => {
    if (status !== "working" || !selectedTask || !selectedSite?.latitude || !selectedSite?.longitude) return;
    if (!navigator.geolocation) return;

    const radius = Number(selectedSite.allowed_radius_m || 150);
    let outsideCount = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (autoClockOutRef.current) return;
        const distance = distanceMeters(pos.coords.latitude, pos.coords.longitude, Number(selectedSite.latitude), Number(selectedSite.longitude));
        if (distance > radius) {
          outsideCount += 1;
          setClockNotice(`GPS-Warnung: ${Math.round(distance)} m entfernt. Ich prüfe erneut, bevor automatisch ausgestempelt wird (${outsideCount}/3).`);
          if (outsideCount >= 3) {
            autoClockOutRef.current = true;
            createEntry("end", "left_geofence");
            setClockNotice(`Ich bin mehrfach außerhalb des Radius gemessen worden (${Math.round(distance)} m). Die Arbeitszeit wurde automatisch beendet.`);
          }
        } else {
          outsideCount = 0;
        }
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [status, selectedTask?.id, selectedSite?.id]);


  async function checkExistingSession() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return;

    const { data: row } = await supabase
      .from("employee_profiles")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();

    if (!row) return;
    setProfile(row);
    setMustChangePassword(Boolean(row.must_change_password));
    setLoggedIn(true);
  }

  async function login() {
    setMessage("");
    setLoginLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setMessage("Login fehlgeschlagen. Bitte E-Mail und Passwort prüfen.");
      setLoginLoading(false);
      return;
    }

    const { data: row } = await supabase
      .from("employee_profiles")
      .select("*")
      .eq("auth_user_id", data.user.id)
      .single();

    if (!row || row.active === false) {
      setMessage("Dein Mitarbeiterprofil ist nicht aktiv.");
      setLoginLoading(false);
      return;
    }

    setProfile(row);
    setMustChangePassword(Boolean(row.must_change_password));
    setLoggedIn(true);
    setLoginLoading(false);
  }

  async function resetPassword() {
    if (!email) {
      setMessage("Bitte zuerst deine E-Mail eintragen.");
      return;
    }
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/mitarbeiter/passwort-neu`,
    });
    setMessage("Wenn die E-Mail bekannt ist, wurde ein Link zum Zurücksetzen gesendet.");
  }

  async function logout() {
    await supabase.auth.signOut();
    setLoggedIn(false);
    setProfile(null);
    setPassword("");
  }

  async function adminApi(body: Record<string, any>) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Admin-Sitzung fehlt. Bitte neu einloggen.");

    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Admin-Aktion fehlgeschlagen.");
    return json;
  }

  async function notifyAdmins(title: string, message: string, type = "admin_todo") {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      await fetch("/api/push/admin-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          message,
          type,
          url: "/mitarbeiter?tab=admin",
        }),
      });
    } catch {
      // Push darf nie die eigentliche Aktion blockieren.
    }
  }

  async function adminSelect(table: string, orderBy = "created_at", limit = 150) {
    const json = await adminApi({ action: "select", table, orderBy, ascending: false, limit });
    return (json.data || []) as AdminMobileRow[];
  }

  async function loadMobileAdminData(silent = true) {
    if (role !== "admin" && role !== "objektleiter") return;
    if (!silent) setAdminMobileMessage("Lade Admin-Daten...");
    try {
      const [employees, adminTasks, adminEntries, absenceRequests, materialReports, qualityReports, adminMaterials, adminSites, chats] = await Promise.all([
        adminSelect("employee_profiles", "name", 200),
        adminSelect("tasks", "task_date", 300),
        adminSelect("time_entries", "created_at", 300),
        adminSelect("absence_requests", "created_at", 200),
        adminSelect("material_reports", "created_at", 200),
        adminSelect("quality_reports", "created_at", 200),
        adminSelect("material_products", "name", 300),
        adminSelect("work_sites", "name", 300),
        adminSelect("chat_messages", "created_at", 200),
      ]);
      setAdminMobileData({ employees, tasks: adminTasks, entries: adminEntries, absenceRequests, materialReports, qualityReports, materials: adminMaterials, sites: adminSites, chats });
      setAdminMobileMessage("");
    } catch (error) {
      setAdminMobileMessage(error instanceof Error ? error.message : "Admin-Daten konnten nicht geladen werden.");
    }
  }

  async function approveMobileTime(row: AdminMobileRow, approved: boolean) {
    setAdminMobileSaving(true);
    setAdminMobileMessage("");
    try {
      await adminApi({
        action: "update",
        table: "time_entries",
        id: row.id,
        payload: {
          approved,
          status: approved ? "approved" : "rejected",
          approved_at: new Date().toISOString(),
        },
      });
      await loadMobileAdminData(true);
      setAdminMobileMessage(approved ? "Zeit freigegeben." : "Zeit abgelehnt.");
    } catch (error) {
      setAdminMobileMessage(error instanceof Error ? error.message : "Zeit konnte nicht geändert werden.");
    } finally {
      setAdminMobileSaving(false);
    }
  }

  async function resolveMobileMaterialReport(row: AdminMobileRow) {
    setAdminMobileSaving(true);
    setAdminMobileMessage("");
    try {
      await adminApi({
        action: "update",
        table: "material_reports",
        id: row.id,
        payload: {
          status: "done",
          resolved_at: new Date().toISOString(),
        },
      });
      await loadMobileAdminData(true);
      setAdminMobileMessage("Materialmeldung wurde erledigt.");
    } catch (error) {
      setAdminMobileMessage(error instanceof Error ? error.message : "Materialmeldung konnte nicht erledigt werden.");
    } finally {
      setAdminMobileSaving(false);
    }
  }

  function dateListBetween(startDate: string, endDate: string) {
    const result: string[] = [];
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate || startDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return startDate ? [startDate] : [];
    for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
      result.push(current.toISOString().slice(0, 10));
    }
    return result;
  }

  function isPaidAbsenceType(typeValue: unknown) {
    const type = String(typeValue || "").toLowerCase();
    if (type.includes("unbezahlt")) return false;
    return type.includes("urlaub") || type.includes("krank") || type.includes("bezahlt") || type.includes("frei");
  }

  async function decideMobileAbsence(row: AdminMobileRow, approved: boolean) {
    setAdminMobileSaving(true);
    setAdminMobileMessage("");
    try {
      const nextStatus = approved ? "approved" : "rejected";
      await adminApi({
        action: "update",
        table: "absence_requests",
        id: row.id,
        payload: {
          status: nextStatus,
          decided_at: new Date().toISOString(),
        },
      });

      if (approved) {
        const days = dateListBetween(String(row.start_date || ""), String(row.end_date || row.start_date || ""));
        const paid = isPaidAbsenceType(row.absence_type);
        for (const day of days) {
          const planned = adminMobileData.tasks
            .filter((task) => String(task.employee_name || "") === String(row.employee_name || ""))
            .filter((task) => String(task.task_date || task.due_date || "").slice(0, 10) === day)
            .filter((task) => task.item_type !== "task" && task.task_type !== "task")
            .reduce((sum, task) => sum + Number(task.planned_minutes || task.max_minutes || 0), 0);

          const existingAbsenceEntries = await adminApi({
            action: "select",
            table: "time_entries",
            filters: {
              employee_name: row.employee_name,
              absence_request_id: row.id,
              work_date: day,
            },
          });

          const alreadyExists = Array.isArray(existingAbsenceEntries?.data)
            ? existingAbsenceEntries.data.length > 0
            : adminMobileData.entries.some((entry) => String(entry.absence_request_id || "") === String(row.id || "") && String(entry.work_date || "").slice(0, 10) === day);

          if (!alreadyExists) {
            await adminApi({
              action: "insert",
              table: "time_entries",
              payload: {
                employee_name: row.employee_name,
                work_date: day,
                absence_request_id: row.id,
                absence_type: row.absence_type,
                entry_type: "absence",
                action: "absence",
                source: "absence_approval",
                status: "approved",
                approved: true,
                planned_minutes: planned,
                worked_minutes: 0,
                payroll_minutes: paid ? planned : 0,
                reason: paid ? row.absence_type : "Unbezahlt Frei",
                notes: paid ? "Planzeit aus Einsatz gutgeschrieben" : "0:00 Stunden gutgeschrieben",
              },
            });
          }
        }
      }

      await loadMobileAdminData(true);
      setAdminMobileMessage(approved ? "Abwesenheit genehmigt." : "Abwesenheit abgelehnt.");
    } catch (error) {
      setAdminMobileMessage(error instanceof Error ? error.message : "Abwesenheit konnte nicht bearbeitet werden.");
    } finally {
      setAdminMobileSaving(false);
    }
  }

  async function reviewMobileQualityReport(row: AdminMobileRow, approved: boolean) {
    setAdminMobileSaving(true);
    setAdminMobileMessage("");
    try {
      await adminApi({
        action: "update",
        table: "quality_reports",
        id: row.id,
        payload: {
          status: approved ? "reviewed" : "rework",
          reviewed_at: new Date().toISOString(),
          review_notes: approved ? "Mobil geprüft und freigegeben" : "Mobil Nacharbeit angefordert",
        },
      });
      await loadMobileAdminData(true);
      setAdminMobileMessage(approved ? "Qualitätsnachweis geprüft." : "Nacharbeit markiert.");
    } catch (error) {
      setAdminMobileMessage(error instanceof Error ? error.message : "Qualitätsnachweis konnte nicht bearbeitet werden.");
    } finally {
      setAdminMobileSaving(false);
    }
  }

  function adminTimeToMinutes(value: string) {
    const [hours, minutes] = String(value || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function adminDateTimeIso(dateValue: string, timeValue: string, addDay = false) {
    const value = new Date(`${dateValue}T${timeValue}:00`);
    if (addDay) value.setDate(value.getDate() + 1);
    return value.toISOString();
  }

  async function createMobileManualTimeEntry() {
    setAdminMobileMessage("");

    if (!adminManualEmployeeName) {
      setAdminMobileMessage("Bitte Mitarbeiter auswählen.");
      return;
    }

    if (!adminManualDate || !adminManualStart || !adminManualEnd) {
      setAdminMobileMessage("Bitte Datum, Start und Ende eintragen.");
      return;
    }

    const startMinutes = adminTimeToMinutes(adminManualStart);
    const endMinutes = adminTimeToMinutes(adminManualEnd);

    if (startMinutes === null || endMinutes === null) {
      setAdminMobileMessage("Bitte gültige Zeiten eintragen.");
      return;
    }

    let duration = endMinutes - startMinutes;
    const overnight = duration < 0;
    if (overnight) duration += 1440;

    if (duration <= 0) {
      setAdminMobileMessage("Die nachgetragene Zeit muss größer als 0 Minuten sein.");
      return;
    }

    const site = adminMobileData.sites.find((item) => item.id === adminManualSiteId) || workSites.find((item) => item.id === adminManualSiteId);

    setAdminMobileSaving(true);
    try {
      await adminApi({
        action: "insert",
        table: "time_entries",
        payload: {
          employee_name: adminManualEmployeeName,
          work_date: adminManualDate,
          check_in_at: adminDateTimeIso(adminManualDate, adminManualStart),
          check_out_at: adminDateTimeIso(adminManualDate, adminManualEnd, overnight),
          site: site?.name || null,
          work_site_name: site?.name || null,
          work_site_id: site?.id || null,
          action: "manual",
          entry_type: "manual",
          source: "admin_manual_time",
          reason: adminManualReason || "Zeit nachgetragen",
          notes: adminManualNotes || null,
          planned_minutes: duration,
          worked_minutes: duration,
          payroll_minutes: duration,
          approved: true,
          status: "approved",
        },
      });

      setAdminManualNotes("");
      setAdminMobileMessage(`Zeit wurde nachgetragen und freigegeben: ${formatMinutes(duration)}.`);
      await loadMobileAdminData(true);
      if (name) {
        await loadTodayEntries(name);
        await loadMonthEntries(name);
      }
    } catch (error) {
      setAdminMobileMessage(error instanceof Error ? error.message : "Zeit konnte nicht nachgetragen werden.");
    } finally {
      setAdminMobileSaving(false);
    }
  }

  async function createMobileAssignment() {
    setAdminMobileMessage("");

    if (!adminAssignmentSiteId) {
      setAdminMobileMessage("Bitte Objekt auswählen.");
      return;
    }

    if (!adminAssignmentEmployeeName) {
      setAdminMobileMessage("Bitte Mitarbeiter auswählen.");
      return;
    }

    if (!adminAssignmentDate || !adminAssignmentStart || !adminAssignmentEnd) {
      setAdminMobileMessage("Bitte Datum und Zeitfenster eintragen.");
      return;
    }

    const site = adminMobileData.sites.find((item) => item.id === adminAssignmentSiteId) || workSites.find((item) => item.id === adminAssignmentSiteId);
    const planned = Math.max(1, Number(adminAssignmentPlanned || 0));

    setAdminMobileSaving(true);
    try {
      await adminApi({
        action: "insert",
        table: "tasks",
        payload: {
          title: site?.name ? `Einsatz ${site.name}` : "Einsatz",
          item_type: "assignment",
          task_type: "assignment",
          task_date: adminAssignmentDate,
          due_date: adminAssignmentDate,
          start_time: adminAssignmentStart,
          end_time: adminAssignmentEnd,
          planned_minutes: planned,
          max_minutes: planned,
          employee_name: adminAssignmentEmployeeName,
          work_site_id: adminAssignmentSiteId,
          site: site?.name || null,
          customer_name: site?.customer_name || null,
          status: "open",
          done: false,
          notes: adminAssignmentNotes || null,
          priority: "Normal",
        },
      });

      setAdminAssignmentNotes("");
      await loadMobileAdminData(true);
      if (name) await loadTasks(name);
      setAdminMobileMessage("Einsatz wurde erstellt.");
    } catch (error) {
      setAdminMobileMessage(error instanceof Error ? error.message : "Einsatz konnte nicht erstellt werden.");
    } finally {
      setAdminMobileSaving(false);
    }
  }

  async function createObjectMaterial() {
    setAdminMobileMessage("");
    if (!adminMaterialSiteId) {
      setAdminMobileMessage("Bitte Objekt auswählen.");
      return;
    }
    if (!adminMaterialName.trim()) {
      setAdminMobileMessage("Bitte Materialname eintragen.");
      return;
    }

    const site = adminMobileData.sites.find((item) => item.id === adminMaterialSiteId) || workSites.find((item) => item.id === adminMaterialSiteId);
    setAdminMobileSaving(true);
    try {
      await adminApi({
        action: "insert",
        table: "material_products",
        payload: {
          name: adminMaterialName.trim(),
          unit: adminMaterialUnit.trim() || "Stk.",
          category: adminMaterialCategory.trim() || "Artikel ohne Gruppe",
          work_site_id: adminMaterialSiteId,
          object_name: site?.name || null,
        },
      });
      setAdminMaterialName("");
      await loadMaterials();
      await loadMobileAdminData(true);
      setAdminMobileMessage("Material wurde objektbezogen angelegt.");
    } catch (error) {
      setAdminMobileMessage(error instanceof Error ? error.message : "Material konnte nicht angelegt werden.");
    } finally {
      setAdminMobileSaving(false);
    }
  }

  async function loadAllData(employeeName: string, silent = false) {
    if (!silent) setLoadingData(true);
    await Promise.all([
      loadTasks(employeeName),
      loadWorkSites(),
      loadMaterials(),
      loadTodayEntries(employeeName),
      loadMonthEntries(employeeName),
      loadAbsenceRequests(employeeName),
      loadNotifications(employeeName),
      loadUnreadChatCount(employeeName),
      activeTab === "chat" ? loadChatMessages(employeeName) : Promise.resolve(),
      role === "admin" || role === "objektleiter" ? loadMobileAdminData(true) : Promise.resolve(),
    ]);
    if (!silent) setLoadingData(false);
  }

  async function loadWorkSites() {
    const { data } = await supabase.from("work_sites").select("*").order("name");
    setWorkSites((data || []) as WorkSite[]);
  }

  async function loadMaterials() {
    const { data } = await supabase.from("material_products").select("id,name,category,unit,work_site_id,object_name,current_stock,minimum_stock,image_url").order("name");
    setMaterials((data || []) as MaterialProduct[]);
  }

  async function loadTasks(employeeName: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("employee_name", employeeName)
      .gte("task_date", monthStart)
      .order("task_date", { ascending: true });
    setTasks((data || []) as Task[]);
  }

  async function loadTodayEntries(employeeName: string) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sitzung fehlt.");

      const response = await fetch("/api/time/clock", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Zeiten konnten nicht geladen werden.");

      setTodayEntries((json.entries || []) as TimeEntry[]);
      setServerWorkedMinutes(Number(json.worked_minutes || 0));
      setServerPayrollMinutes(Number(json.payroll_minutes || 0));
    } catch {
      const start = `${todayISO()}T00:00:00`;
      const end = `${todayISO()}T23:59:59`;
      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("employee_name", employeeName)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      setTodayEntries((data || []) as TimeEntry[]);
      setServerWorkedMinutes(0);
      setServerPayrollMinutes(0);
    }
  }

  async function loadMonthEntries(employeeName: string) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sitzung fehlt.");

      const month = todayISO().slice(0, 7);
      const response = await fetch(`/api/time/month?month=${month}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Monatszeiten konnten nicht geladen werden.");

      setMonthEntries((json.entries || []) as TimeEntry[]);
    } catch {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("employee_name", employeeName)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false });

      setMonthEntries((data || []) as TimeEntry[]);
    }
  }

  async function loadNotifications(employeeName: string) {
    const { data } = await supabase
      .from("admin_notifications")
      .select("*")
      .eq("employee_name", employeeName)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data || []) as AdminNotification[]);
  }

  async function loadAbsenceRequests(employeeName: string) {
    const { data } = await supabase
      .from("absence_requests")
      .select("*")
      .eq("employee_name", employeeName)
      .order("created_at", { ascending: false })
      .limit(20);
    setAbsenceRequests((data || []) as AbsenceRequest[]);
  }

  async function loadUnreadChatCount(employeeName: string) {
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("employee_name", employeeName)
      .eq("sender_role", "admin")
      .eq("read_by_employee", false);
    setUnreadChatCount(count || 0);
  }

  async function loadChatMessages(employeeName: string) {
    if (!employeeName) {
      setChatMessages([]);
      return;
    }

    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("employee_name", employeeName)
      .order("created_at", { ascending: true });

    setChatMessages((data || []) as ChatMessage[]);

    if (role === "admin" || role === "objektleiter") {
      await supabase
        .from("chat_messages")
        .update({ read_by_admin: true })
        .eq("employee_name", employeeName)
        .eq("sender_role", "employee");
      await loadMobileAdminData(true);
    } else {
      await supabase
        .from("chat_messages")
        .update({ read_by_employee: true })
        .eq("employee_name", employeeName)
        .eq("sender_role", "admin");
      setUnreadChatCount(0);
    }
  }

  function entryAction(entry: TimeEntry) {
    return String(entry.action || "").trim().toLowerCase();
  }

  function entryTime(entry: TimeEntry) {
    return new Date(entry.created_at || entry.check_in_at || entry.check_out_at || new Date().toISOString());
  }

  function calculateWorkedMinutes(entries: TimeEntry[]) {
    const directTotal = entries.reduce((sum, entry) => sum + Number(entry.worked_minutes || entry.payroll_minutes || 0), 0);
    const chronological = [...entries].sort((a, b) => entryTime(a).getTime() - entryTime(b).getTime());
    let total = 0;
    let lastStart: Date | null = null;

    for (const entry of chronological) {
      const action = entryAction(entry);

      if (entry.check_in_at && entry.check_out_at) {
        const minutes = Math.round((new Date(entry.check_out_at).getTime() - new Date(entry.check_in_at).getTime()) / 60000);
        if (minutes > 0) total += minutes;
        continue;
      }

      const time = entryTime(entry);
      if (action === "start" || action === "break_end" || action === "check_in") lastStart = time;

      if ((action === "break_start" || action === "end" || action === "check_out" || action === "auto_clock_out") && lastStart) {
        const minutes = Math.round((time.getTime() - lastStart.getTime()) / 60000);
        if (minutes > 0) total += minutes;
        lastStart = null;
      }

      if ((action === "manual" || action === "absence") && Number(entry.planned_minutes || 0) > 0) {
        total += Number(entry.planned_minutes || 0);
      }
    }

    if (lastStart && status === "working") {
      total += Math.max(0, Math.round((Date.now() - lastStart.getTime()) / 60000));
    }

    return Math.max(total, directTotal);
  }

  function calculatePauseMinutes(entries: TimeEntry[]) {
    const chronological = [...entries].sort((a, b) => entryTime(a).getTime() - entryTime(b).getTime());
    let total = 0;
    let lastBreak: Date | null = null;

    for (const entry of chronological) {
      const time = entryTime(entry);
      const action = entryAction(entry);
      if (action === "break_start") lastBreak = time;
      if (action === "break_end" && lastBreak) {
        total += Math.max(0, Math.round((time.getTime() - lastBreak.getTime()) / 60000));
        lastBreak = null;
      }
    }

    if (lastBreak && status === "break") {
      total += Math.max(0, Math.round((Date.now() - lastBreak.getTime()) / 60000));
    }
    return total;
  }

  async function createEntry(action: TimeEntry["action"], reason = "manual") {
    if (!name) return;
    setMessage("");
    setClockNotice("");

    const task = selectedTask;
    if (!task) {
      setMessage("Ich habe keinen Einsatz für heute gefunden.");
      return;
    }

    if (action === "start" && !isNowInsideWindow(task.start_time, task.end_time)) {
      setMessage(`Einstempeln ist nur im Zeitfenster ${formatClock(task.start_time)} - ${formatClock(task.end_time)} möglich.`);
      return;
    }

    if (action === "start") {
      autoClockOutRef.current = false;
    }

    setClockSaving(true);
    try {
      const position = await getCurrentPosition();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sitzung fehlt. Bitte neu einloggen.");

      const response = await fetch("/api/time/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          task_id: task.id,
          reason,
          local_time: new Date().toTimeString().slice(0, 5),
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Zeit konnte nicht gespeichert werden.");

      await loadTodayEntries(name);
      await loadMonthEntries(name);
      setMessage(json.message || (action === "start" ? "Arbeitszeit gestartet." : action === "end" ? "Arbeitszeit beendet." : action === "break_start" ? "Pause gestartet." : "Pause beendet."));
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Zeit konnte nicht gespeichert werden.";
      setMessage(errorText);
      if (action === "end" && /Qualitätsnachweis|Checklistenpunkt|Foto|ausstempeln/i.test(errorText)) {
        setClockNotice(errorText);
      }
    } finally {
      setClockSaving(false);
    }
  }

  async function requestOvertime(minutes: number) {
    if (!selectedTask || !name) return;
    const requestKey = `${selectedTask.id}-${minutes}-${todayISO()}`;
    if (lastOvertimeRequestRef.current === requestKey) {
      setClockNotice("Überstundenanfrage wurde bereits gesendet.");
      return;
    }

    setClockSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sitzung fehlt. Bitte neu einloggen.");

      const response = await fetch("/api/time/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "request_overtime", task_id: selectedTask.id, overtime_minutes: minutes }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Überstunden konnten nicht angefragt werden.");
      lastOvertimeRequestRef.current = requestKey;
      setClockNotice("Überstunden wurden angefragt. Ich warte auf Freigabe.");
      await loadNotifications(name);
    } catch (error) {
      setClockNotice(error instanceof Error ? error.message : "Überstunden konnten nicht angefragt werden.");
    } finally {
      setClockSaving(false);
    }
  }


  async function updateActionTask(task: Task, done: boolean) {
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Bitte neu einloggen. Die Sitzung fehlt.");

      const response = await fetch("/api/employee/task", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ task_id: task.id, done }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Aufgabe konnte nicht gespeichert werden.");

      const updatedTask = { ...task, ...(json.task || {}), done, status: done ? "done" : "open" };
      setTasks((old) => old.map((item) => item.id === task.id ? updatedTask : item));
      setSelectedActionTask(updatedTask);
      setMessage(done ? "Aufgabe als erledigt markiert." : "Aufgabe wieder geöffnet.");
      if (name) await loadTasks(name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aufgabe konnte nicht gespeichert werden.");
    }
  }

  async function toggleTask(task: Task) {
    await updateActionTask(task, !task.done);
  }

  async function sendChatMessage() {
    setChatError("");
    const text = chatText.trim();
    if (!text || !name) return;

    const isAdminUser = role === "admin" || role === "objektleiter";
    const targetEmployee = isAdminUser ? adminChatEmployee : name;

    if (!targetEmployee) {
      setChatError("Bitte zuerst einen Mitarbeiter auswählen.");
      return;
    }

    const { error } = await supabase.from("chat_messages").insert([
      {
        employee_name: targetEmployee,
        sender_role: isAdminUser ? "admin" : "employee",
        sender_name: name,
        message: text,
        read_by_admin: true,
        read_by_employee: isAdminUser ? false : true,
      },
    ]);

    if (error) {
      setChatError("Nachricht konnte nicht gesendet werden.");
      return;
    }

    if (!isAdminUser) {
      await notifyAdmins("Neue Chatnachricht", `${name} hat eine neue Nachricht geschrieben.`, "chat_message");
    }

    setChatText("");
    await loadChatMessages(targetEmployee);
  }

  async function openAdminChatWith(employeeName: string) {
    if (!employeeName) return;
    setAdminChatEmployee(employeeName);
    setActiveTab("chat");
    await loadChatMessages(employeeName);
  }

  async function submitAbsenceRequest() {
    setAbsenceMessage("");

    if (!absenceStartDate || !absenceEndDate) {
      setAbsenceMessage("Bitte Start- und Enddatum eintragen.");
      return;
    }

    if (new Date(absenceEndDate) < new Date(absenceStartDate)) {
      setAbsenceMessage("Das Enddatum darf nicht vor dem Startdatum liegen.");
      return;
    }

    setAbsenceSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sitzung fehlt. Bitte neu einloggen.");

      const response = await fetch("/api/absence/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          absence_type: absenceType,
          start_date: absenceStartDate,
          end_date: absenceEndDate,
          reason: absenceReason,
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Abwesenheit konnte nicht gesendet werden.");

      setAbsenceReason("");
      setAbsenceMessage("Abwesenheit wurde eingereicht. Ich sehe sie im Adminbereich unter Abwesenheiten.");
      if (name) {
        await loadAbsenceRequests(name);
        await loadNotifications(name);
      }
    } catch (error) {
      setAbsenceMessage(error instanceof Error ? error.message : "Abwesenheit konnte nicht gesendet werden.");
    } finally {
      setAbsenceSaving(false);
    }
  }

  async function submitMaterialReport() {
    setMaterialMessage("");

    if (!materialSiteId) {
      setMaterialMessage("Bitte Objekt auswählen.");
      return;
    }

    const selectedItems = Object.entries(materialCart).filter(([, quantity]) => Number(quantity) > 0);
    if (selectedItems.length === 0) {
      setMaterialMessage("Bitte mindestens einen Artikel auswählen.");
      return;
    }

    setMaterialSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sitzung fehlt. Bitte neu einloggen.");

      for (const [productId, quantity] of selectedItems) {
        const response = await fetch("/api/material/report", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            work_site_id: materialSiteId,
            material_product_id: productId,
            quantity_requested: String(quantity),
            notes: materialNotes,
          }),
        });

        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Materialmeldung konnte nicht gesendet werden.");
      }

      setMaterialProductId("");
      setMaterialQuantity("1");
      setMaterialCart({});
      setMaterialNotes("");
      setMaterialMessage("Materialbestellung gesendet.");
    } catch (error) {
      setMaterialMessage(error instanceof Error ? error.message : "Materialbestellung konnte nicht gesendet werden.");
    } finally {
      setMaterialSaving(false);
    }
  }

  async function changeOwnPassword() {
    setMessage("");
    if (newPassword.length < 6) {
      setMessage("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    if (newPassword !== newPasswordRepeat) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }

    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage("Passwort konnte nicht geändert werden.");
      setPasswordLoading(false);
      return;
    }

    if (profile?.id) {
      await supabase.from("employee_profiles").update({ must_change_password: false }).eq("id", profile.id);
    }

    setMustChangePassword(false);
    setNewPassword("");
    setNewPasswordRepeat("");
    setPasswordLoading(false);
  }

  function openTab(tab: Tab) {
    setMessage("");
    setActiveTab(tab);
    if (tab === "chat") {
      const isAdminUser = role === "admin" || role === "objektleiter";
      const target = isAdminUser ? adminChatEmployee : name;
      if (target) loadChatMessages(target);
    }
    if (tab === "admin") loadMobileAdminData(false);
  }

  if (!loggedIn) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-8 flex items-center justify-center text-slate-950">
        <div className="w-full max-w-sm">
          <div className="text-center mb-7">
            <img src="/logo.png" alt="Matteo Stano Clean" className="mx-auto mb-5 h-28 w-auto object-contain" />
            <h1 className="text-2xl font-black">Mitarbeiter Login</h1>
            <p className="text-sm text-slate-400 mt-1">CleanTrack Mitarbeiter-App</p>
          </div>

          <div className="bg-white rounded-[30px] p-5 shadow-sm border border-slate-100">
            <input className="mb-3 w-full rounded-2xl bg-slate-50 px-4 py-4 outline-none border border-transparent focus:border-blue-400" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" autoComplete="email" />
            <input className="mb-4 w-full rounded-2xl bg-slate-50 px-4 py-4 outline-none border border-transparent focus:border-blue-400" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" type="password" autoComplete="current-password" />
            <button type="button" disabled={loginLoading} onClick={login} className="w-full rounded-2xl bg-blue-600 py-4 text-white font-black shadow-sm disabled:opacity-60">
              {loginLoading ? "Wird geprüft..." : "Einloggen"}
            </button>
            <button type="button" onClick={resetPassword} className="mt-3 w-full rounded-2xl bg-slate-100 py-4 text-slate-600 font-bold">
              Passwort vergessen?
            </button>
            {message && <p className="mt-4 text-center text-sm font-bold text-red-500">{message}</p>}
          </div>
        </div>
      </main>
    );
  }

  if (mustChangePassword) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-8 flex items-center justify-center text-slate-950">
        <div className="w-full max-w-sm bg-white rounded-[30px] p-5 shadow-sm border border-slate-100">
          <h1 className="text-2xl font-black mb-2">Neues Passwort</h1>
          <p className="text-sm text-slate-500 mb-5">Ich vergebe jetzt mein eigenes Passwort für die App.</p>
          <input className="mb-3 w-full rounded-2xl bg-slate-50 px-4 py-4 outline-none" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="Neues Passwort" />
          <input className="mb-4 w-full rounded-2xl bg-slate-50 px-4 py-4 outline-none" value={newPasswordRepeat} onChange={(e) => setNewPasswordRepeat(e.target.value)} type="password" placeholder="Passwort wiederholen" />
          <button type="button" disabled={passwordLoading} onClick={changeOwnPassword} className="w-full rounded-2xl bg-blue-600 py-4 text-white font-black disabled:opacity-60">
            {passwordLoading ? "Wird gespeichert..." : "Passwort speichern"}
          </button>
          {message && <p className="mt-4 text-sm font-bold text-red-500">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950 pb-24">
      <div className="mx-auto min-h-screen w-full max-w-md bg-[#f5f7fb]">
        {activeTab === "home" && (
          <HomeScreen
            name={name}
            avatar={profile?.avatar_url || ""}
            todayTasks={todayAssignments}
            openTasks={openTasks}
            doneTasks={doneTasks}
            progress={progress}
            workedMinutes={workedMinutes}
            plannedMinutes={plannedMinutes}
            loadingData={loadingData}
            refresh={() => name && loadAllData(name)}
            openTab={openTab}
            pushSupported={pushSupported}
            pushEnabled={pushEnabled}
            pushNotice={pushNotice}
            activatePush={activatePushNotifications}
          />
        )}

        {activeTab === "tasks" && (
          <TasksScreen
            tasks={todayActionTasks}
            selectedTask={selectedActionTask}
            openTask={setSelectedActionTask}
            closeTask={() => setSelectedActionTask(null)}
            toggleTask={toggleTask}
            openTab={openTab}
            message={message}
          />
        )}

        {activeTab === "clock" && (
          <ClockScreen
            tasks={todayAssignments}
            entries={todayEntries}
            status={status}
            selectedTaskId={selectedTaskId}
            setSelectedTaskId={setSelectedTaskId}
            selectedTask={selectedTask}
            selectedSite={selectedSite}
            workedMinutes={workedMinutes}
            payrollMinutes={payrollMinutesToday}
            pauseMinutes={pauseMinutes}
            message={message}
            clockNotice={clockNotice}
            clockSaving={clockSaving}
            createEntry={createEntry}
            requestOvertime={requestOvertime}
            openTab={openTab}
          />
        )}

        {activeTab === "timesheet" && (
          <TimesheetScreen
            profile={profile}
            tasks={tasks}
            entries={monthEntries}
            absenceRequests={absenceRequests}
            openTab={openTab}
          />
        )}

        {activeTab === "schedule" && (
          <ScheduleScreen
            tasks={tasks}
            workSites={workSites}
            selectedAssignment={selectedAssignment}
            openAssignment={setSelectedAssignment}
            closeAssignment={() => setSelectedAssignment(null)}
            startAssignment={(task) => {
              setSelectedTaskId(task.id);
              setSelectedAssignment(null);
              openTab("clock");
            }}
            reportMaterial={(task) => {
              if (task.work_site_id) setMaterialSiteId(task.work_site_id);
              setSelectedAssignment(null);
              openTab("material");
            }}
            openTab={openTab}
          />
        )}

        {activeTab === "search" && (
          <SearchScreen tasks={tasks} notifications={notifications} openTab={openTab} />
        )}

        {activeTab === "chat" && (
          <ChatScreen
            messages={chatMessages}
            chatText={chatText}
            setChatText={setChatText}
            sendChatMessage={sendChatMessage}
            chatError={chatError}
            chatEndRef={chatEndRef}
            role={role}
            employees={adminMobileData.employees}
            selectedEmployee={adminChatEmployee}
            selectEmployee={openAdminChatWith}
            openTab={openTab}
          />
        )}

        {activeTab === "profile" && (
          <ProfileScreen profile={profile} workedMinutes={workedMinutes} payrollMinutes={payrollMinutesToday} pauseMinutes={pauseMinutes} notifications={notifications} absenceRequests={absenceRequests} tasks={tasks} todayEntries={todayEntries} monthEntries={monthEntries} logout={logout} openTab={openTab} />
        )}

        {activeTab === "absence" && (
          <AbsenceRequestScreen
            absenceType={absenceType}
            setAbsenceType={setAbsenceType}
            startDate={absenceStartDate}
            setStartDate={setAbsenceStartDate}
            endDate={absenceEndDate}
            setEndDate={setAbsenceEndDate}
            reason={absenceReason}
            setReason={setAbsenceReason}
            saving={absenceSaving}
            message={absenceMessage}
            requests={absenceRequests}
            submit={submitAbsenceRequest}
            openTab={openTab}
          />
        )}

        {activeTab === "material" && (
          <MaterialReportScreen
            workSites={workSites}
            materials={materials}
            siteId={materialSiteId}
            setSiteId={setMaterialSiteId}
            materialId={materialProductId}
            setMaterialId={setMaterialProductId}
            quantity={materialQuantity}
            setQuantity={setMaterialQuantity}
            search={materialSearch}
            setSearch={setMaterialSearch}
            cart={materialCart}
            setCart={setMaterialCart}
            notes={materialNotes}
            setNotes={setMaterialNotes}
            saving={materialSaving}
            message={materialMessage}
            submit={submitMaterialReport}
            openTab={openTab}
          />
        )}

        {activeTab === "admin" && (
          <AdminMobileScreen
            role={role}
            data={adminMobileData}
            tab={adminMobileTab}
            setTab={setAdminMobileTab}
            message={adminMobileMessage}
            saving={adminMobileSaving}
            refresh={() => loadMobileAdminData(false)}
            approveTime={approveMobileTime}
            resolveMaterialReport={resolveMobileMaterialReport}
            decideAbsence={decideMobileAbsence}
            reviewQualityReport={reviewMobileQualityReport}
            selectedSiteId={adminMaterialSiteId}
            setSelectedSiteId={setAdminMaterialSiteId}
            materialName={adminMaterialName}
            setMaterialName={setAdminMaterialName}
            materialUnit={adminMaterialUnit}
            setMaterialUnit={setAdminMaterialUnit}
            materialCategory={adminMaterialCategory}
            setMaterialCategory={setAdminMaterialCategory}
            createMaterial={createObjectMaterial}
            assignmentSiteId={adminAssignmentSiteId}
            setAssignmentSiteId={setAdminAssignmentSiteId}
            assignmentEmployeeName={adminAssignmentEmployeeName}
            setAssignmentEmployeeName={setAdminAssignmentEmployeeName}
            assignmentDate={adminAssignmentDate}
            setAssignmentDate={setAdminAssignmentDate}
            assignmentStart={adminAssignmentStart}
            setAssignmentStart={setAdminAssignmentStart}
            assignmentEnd={adminAssignmentEnd}
            setAssignmentEnd={setAdminAssignmentEnd}
            assignmentPlanned={adminAssignmentPlanned}
            setAssignmentPlanned={setAdminAssignmentPlanned}
            assignmentNotes={adminAssignmentNotes}
            setAssignmentNotes={setAdminAssignmentNotes}
            createAssignment={createMobileAssignment}
            manualEmployeeName={adminManualEmployeeName}
            setManualEmployeeName={setAdminManualEmployeeName}
            manualSiteId={adminManualSiteId}
            setManualSiteId={setAdminManualSiteId}
            manualDate={adminManualDate}
            setManualDate={setAdminManualDate}
            manualStart={adminManualStart}
            setManualStart={setAdminManualStart}
            manualEnd={adminManualEnd}
            setManualEnd={setAdminManualEnd}
            manualReason={adminManualReason}
            setManualReason={setAdminManualReason}
            manualNotes={adminManualNotes}
            setManualNotes={setAdminManualNotes}
            createManualTimeEntry={createMobileManualTimeEntry}
            openChatWith={openAdminChatWith}
            openTab={openTab}
          />
        )}
      </div>

      <BottomNav activeTab={activeTab} openTab={openTab} unreadChatCount={adminChatBadgeCount} adminTodoCount={adminTodoCount} role={role} />
    </main>
  );
}

function HomeScreen(props: {
  name: string;
  avatar: string;
  todayTasks: Task[];
  openTasks: number;
  doneTasks: number;
  progress: number;
  workedMinutes: number;
  plannedMinutes: number;
  loadingData: boolean;
  refresh: () => void;
  openTab: (tab: Tab) => void;
  pushSupported: boolean;
  pushEnabled: boolean;
  pushNotice: string;
  activatePush: () => void;
}) {
  const nextTask = props.todayTasks.find((task) => !task.done) || props.todayTasks[0] || null;
  const quickLinks = [
    { icon: "🌴", title: "Abwesenheit", text: "Urlaub oder Krankheit melden", tab: "absence" as Tab, bg: "bg-emerald-50" },
    { icon: "📦", title: "Material melden", text: "Leeres Material am Objekt melden", tab: "material" as Tab, bg: "bg-orange-50" },
    { icon: "📋", title: "Aufgaben", text: "Zusätzliche Aufgaben abhaken", tab: "tasks" as Tab, bg: "bg-purple-50" },
    { icon: "💬", title: "Nachrichten", text: "Chat und Rückfragen", tab: "chat" as Tab, bg: "bg-blue-50" },
  ];

  return (
    <section className="px-5 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={props.name} src={props.avatar} />
          <div>
            <h1 className="text-xl font-black">Hallo, {props.name || "Mitarbeiter"} 👋</h1>
            <p className="text-xs font-semibold text-slate-400">{formatDate(new Date())}</p>
          </div>
        </div>
        <button type="button" onClick={props.refresh} className="h-10 w-10 rounded-full bg-white text-slate-500 shadow-sm border border-slate-100">{props.loadingData ? "…" : "⚙"}</button>
      </div>

      <button type="button" onClick={() => props.openTab("timesheet")} className="mt-7 w-full rounded-[24px] bg-blue-50 p-4 text-left shadow-sm border border-blue-100">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white">
            <div className="absolute inset-2 rounded-full border-[7px] border-blue-100" />
            <div className="absolute inset-2 rounded-full border-[7px] border-blue-500" style={{ clipPath: `inset(${100 - props.progress}% 0 0 0)` }} />
            <span className="relative text-sm font-black text-blue-600">{props.progress}%</span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-500">Dein Stundenzettel</p>
            <p className="mt-1 text-3xl font-black">{formatMinutes(props.workedMinutes)}</p>
            <p className="text-sm font-semibold text-slate-400">/ {formatMinutes(props.plannedMinutes)}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-blue-600 font-black">→</div>
        </div>
      </button>

      <div className="mt-5 rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Nächster Einsatz</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{nextTask ? (nextTask.site || "Objekt") : "Kein Einsatz offen"}</h2>
            <p className="mt-1 text-sm font-bold text-slate-400">{nextTask ? `${formatClock(nextTask.start_time)} - ${formatClock(nextTask.end_time)} · ${formatMinutes(Number(nextTask.planned_minutes || nextTask.max_minutes || 0))}` : "Heute ist nichts geplant."}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${nextTask ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{nextTask ? "offen" : "frei"}</span>
        </div>
        {nextTask && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => props.openTab("schedule")} className="rounded-2xl bg-blue-600 py-4 text-sm font-black text-white">Einsatz öffnen</button>
            <button type="button" onClick={() => props.openTab("clock")} className="rounded-2xl bg-green-50 py-4 text-sm font-black text-green-700">Stempeln</button>
          </div>
        )}
      </div>

      <div className="mt-7 flex items-center justify-between">
        <h2 className="text-sm font-black">Heutige Einsätze</h2>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><span>{props.doneTasks}/{props.todayTasks.length}</span><span className="h-1 w-10 rounded-full bg-slate-200"><span className="block h-1 rounded-full bg-blue-500" style={{ width: `${props.todayTasks.length ? (props.doneTasks / props.todayTasks.length) * 100 : 0}%` }} /></span></div>
      </div>

      <div className="mt-5 rounded-[24px] bg-white p-5 text-center shadow-sm border border-slate-100">
        {props.openTasks === 0 ? (
          <>
            <div className="text-4xl">🎉</div>
            <p className="mt-2 font-black">Alles erledigt!</p>
            <p className="mt-1 text-xs text-slate-400">Ich habe heute keine offenen Einsätze.</p>
          </>
        ) : (
          <button type="button" onClick={() => props.openTab("schedule")} className="w-full text-left">
            <p className="font-black">{props.openTasks} Einsätze offen</p>
            <p className="mt-1 text-sm text-slate-400">Antippen und Einsätze ansehen.</p>
          </button>
        )}
      </div>

      <div className="mt-5 rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black">Benachrichtigungen</p>
            <p className="mt-1 text-xs font-bold text-slate-400">{props.pushEnabled ? "Push ist aktiv und bleibt gespeichert." : "Ich erhalte Infos zu Einsätzen, Änderungen und Freigaben."}</p>
          </div>
          <button type="button" onClick={props.activatePush} className={`rounded-2xl px-4 py-3 text-xs font-black disabled:opacity-50 ${props.pushEnabled ? "bg-emerald-100 text-emerald-700" : "bg-blue-600 text-white"}`} disabled={!props.pushSupported}>
            {props.pushEnabled ? "Aktiv" : "Aktivieren"}
          </button>
        </div>
        {props.pushNotice && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500">{props.pushNotice}</p>}
      </div>

      <h2 className="mt-7 text-sm font-black">Weitere Funktionen</h2>
      <div className="mt-3 overflow-hidden rounded-[24px] bg-white shadow-sm border border-slate-100">
        {quickLinks.map((item) => (
          <button key={item.title} type="button" onClick={() => props.openTab(item.tab)} className="flex w-full items-center gap-4 border-b border-slate-100 px-4 py-4 text-left last:border-b-0">
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.bg} text-2xl`}>{item.icon}</span>
            <span className="flex-1"><span className="block font-black">{item.title}</span><span className="block text-xs font-medium text-slate-400">{item.text}</span></span>
            <span className="text-slate-300">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function priorityClass(priority?: string | null) {
  if (priority === "Dringend") return "bg-red-100 text-red-700";
  if (priority === "Hoch") return "bg-amber-100 text-amber-700";
  if (priority === "Mittel") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function InfoCard({ label, value, badgeClass = "" }: { label: string; value: string; badgeClass?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 font-black ${badgeClass || "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function MobileInfoRow({ icon, label, value, iconClass = "text-slate-400" }: { icon: string; label: string; value: string; iconClass?: string }) {
  return (
    <div className="flex items-center gap-5 py-5">
      <span className={`w-10 text-3xl ${iconClass}`}>{icon}</span>
      <div>
        <p className="text-lg font-semibold text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function TasksScreen({ tasks, selectedTask, openTask, closeTask, toggleTask, openTab, message }: { tasks: Task[]; selectedTask: Task | null; openTask: (task: Task) => void; closeTask: () => void; toggleTask: (task: Task) => void; openTab: (tab: Tab) => void; message: string }) {
  if (selectedTask) {
    const due = selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString("de-DE", { month: "short", day: "2-digit" }) : selectedTask.task_date ? new Date(selectedTask.task_date).toLocaleDateString("de-DE", { month: "short", day: "2-digit" }) : "-";

    return (
      <SimplePage title={selectedTask.title || "Aufgabe"} openTab={openTab}>
        <div className="rounded-[30px] bg-white p-5 shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-3xl font-black text-slate-950">{selectedTask.title}</h2>
              <p className="mt-1 text-lg font-bold text-slate-400">{selectedTask.task_category || "Aufgabe"}</p>
            </div>
            <button type="button" onClick={() => toggleTask(selectedTask)} className={`h-12 w-12 rounded-full border-4 ${selectedTask.done ? "border-green-400 bg-green-50" : "border-slate-200 bg-white"}`} />
          </div>

          <div className="mt-6 flex gap-6 border-b border-slate-100">
            <span className="border-b-4 border-blue-500 pb-3 text-lg font-bold text-slate-950">Aufgabe</span>
            <span className="pb-3 text-lg font-bold text-slate-500">Logbuch</span>
          </div>

          <div className="mt-6 divide-y divide-slate-100">
            <MobileInfoRow icon="⚠" label="Aufgabentyp" value={selectedTask.task_category || "Sonstiges"} iconClass="text-orange-500" />
            <MobileInfoRow icon="▥" label="Priorität" value={selectedTask.priority || "Mittel"} iconClass="text-blue-500" />
            <MobileInfoRow icon="▦" label="Fälligkeitsdatum" value={due} iconClass="text-slate-400" />
            <MobileInfoRow icon="●" label="Zugewiesen an" value={selectedTask.employee_name || "Nicht zugewiesen"} iconClass="text-slate-400" />
            <MobileInfoRow icon="⌂" label="Objekt" value={selectedTask.site || "Kein Objekt"} iconClass="text-slate-400" />
          </div>

          {selectedTask.notes && (
            <div className="mt-6 rounded-[22px] bg-slate-50 p-4">
              <p className="text-sm font-black uppercase tracking-wide text-slate-400">Beschreibung</p>
              <p className="mt-2 whitespace-pre-wrap text-lg font-semibold text-slate-700">{selectedTask.notes}</p>
            </div>
          )}

          {message && <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-black text-blue-800">{message}</div>}
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto grid max-w-md grid-cols-2 gap-3 border-t border-slate-100 bg-white p-4">
          <button type="button" onClick={() => toggleTask(selectedTask)} className="rounded-2xl bg-green-100 py-4 font-black text-green-700">
            {selectedTask.done ? "Wieder öffnen" : "Aufgabe erledigen"}
          </button>
          <button type="button" onClick={closeTask} className="rounded-2xl bg-slate-50 py-4 font-black text-slate-700">Zurück</button>
        </div>
      </SimplePage>
    );
  }

  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);
  const progress = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  return (
    <SimplePage title="Aufgaben" openTab={openTab} searchPlaceholder="Aufgabe suchen">
      <div className="mb-5 flex items-center justify-between">
        <p className="font-black text-slate-500">Heutige Aufgaben</p>
        <div className="flex items-center gap-3">
          <span className="text-sm font-black text-slate-500">{done.length}/{tasks.length}</span>
          <div className="h-3 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-green-400" style={{ width: `${progress}%` }} /></div>
        </div>
      </div>

      <div className="space-y-8">
        {tasks.length === 0 && <EmptyState text="Keine Aufgaben vorhanden" />}
        {tasks.map((task) => (
          <button key={task.id} type="button" onClick={() => openTask(task)} className="block w-full text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-orange-400">● {task.task_category || "Aufgabe"}</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">{task.title}</h2>
                <p className="mt-2 text-lg font-semibold text-slate-600">{task.due_date ? new Date(task.due_date).toLocaleDateString("de-DE", { day: "numeric", month: "short" }) : task.task_date ? new Date(task.task_date).toLocaleDateString("de-DE", { day: "numeric", month: "short" }) : ""}</p>
              </div>
              <span className={`rounded-xl px-4 py-2 text-sm font-black ${task.done ? "bg-green-400 text-white" : "bg-slate-300 text-white"}`}>{task.done ? "Erledigt" : "Offen"}</span>
            </div>
          </button>
        ))}
      </div>
    </SimplePage>
  );
}

function ClockScreen(props: {
  tasks: Task[];
  entries: TimeEntry[];
  status: Status;
  selectedTaskId: string;
  setSelectedTaskId: (id: string) => void;
  selectedTask: Task | null;
  selectedSite: WorkSite | null;
  workedMinutes: number;
  payrollMinutes: number;
  pauseMinutes: number;
  message: string;
  clockNotice: string;
  clockSaving: boolean;
  createEntry: (action: TimeEntry["action"], reason?: string) => void;
  requestOvertime: (minutes: number) => void;
  openTab: (tab: Tab) => void;
}) {
  const approvedOvertime = Number(props.selectedTask?.approved_overtime_minutes || 0);
  const maxMinutes = Number(props.selectedTask?.max_minutes || props.selectedTask?.planned_minutes || 0);
  const basePlan = Number(props.selectedTask?.planned_minutes || 0);
  const remaining = maxMinutes ? Math.max(0, maxMinutes - props.workedMinutes) : 0;
  const gpsReady = Boolean(props.selectedSite?.latitude && props.selectedSite?.longitude);
  const canRequestOvertime = Boolean(props.selectedTask && maxMinutes && props.workedMinutes >= maxMinutes);
  const checklist = taskChecklist(props.selectedTask);
  const needsQualityReport = Boolean(props.selectedTask?.quality_required || props.selectedTask?.quality_photo_required || checklist.length > 0);
  const qualityHint = needsQualityReport
    ? `Vor dem Ausstempeln muss ich den Qualitätsnachweis speichern${props.selectedTask?.quality_photo_required ? " und ein Foto hochladen" : ""}${checklist.length > 0 ? ` (${checklist.length} Punkt${checklist.length === 1 ? "" : "e"}).` : "."}`
    : "";

  return (
    <SimplePage title="Stempeln" openTab={props.openTab}>
      <div className="rounded-[24px] bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-end justify-between">
          <div><p className="text-sm font-bold text-slate-400">Heute geleistet</p><p className="text-4xl font-black">{formatMinutes(props.workedMinutes)}</p><p className="mt-1 text-xs font-bold text-slate-400">Lohnzeit: {formatMinutes(props.payrollMinutes || props.workedMinutes)}</p></div>
          <div className="text-right"><p className="text-sm font-bold text-slate-400">Pause</p><p className="text-xl font-black">{formatMinutes(props.pauseMinutes)}</p></div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">Zeitfenster</p><p className="font-black">{formatClock(props.selectedTask?.start_time || null)} - {formatClock(props.selectedTask?.end_time || null)}</p></div>
          <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">Rest-Planzeit</p><p className="font-black">{formatMinutes(remaining)}</p></div>
        </div>

        {approvedOvertime > 0 && <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-black text-emerald-700">Überstunden genehmigt: +{approvedOvertime} Min. · Gesamtlimit {formatMinutes(maxMinutes || basePlan)}</div>}

        <div className="mt-5 rounded-2xl bg-slate-50 p-3">
          <select className="w-full bg-transparent font-bold outline-none" value={props.selectedTaskId} onChange={(e) => props.setSelectedTaskId(e.target.value)}>
            <option value="">Einsatz automatisch wählen</option>
            {props.tasks.map((task) => <option key={task.id} value={task.id}>{formatClock(task.start_time)} - {formatClock(task.end_time)} · {task.site || "Objekt"} · {task.title}</option>)}
          </select>
        </div>

        {props.selectedTask && <div className="mt-3 rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-800">{props.selectedTask.site || "Objekt"} · {props.selectedTask.title}</div>}
        {qualityHint && <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-black text-amber-800">{qualityHint}</div>}
        <div className={`mt-3 rounded-2xl p-3 text-sm font-black ${gpsReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{gpsReady ? `GPS aktiv · Radius ${props.selectedSite?.allowed_radius_m || 150} m` : "GPS fehlt beim Objekt. Bitte im Adminbereich am Objekt setzen."}</div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {props.status === "none" && <button type="button" disabled={props.clockSaving} onClick={() => props.createEntry("start")} className="col-span-2 rounded-2xl bg-blue-600 py-4 text-white font-black disabled:opacity-60">Einstempeln</button>}
          {props.status === "working" && <><button type="button" disabled={props.clockSaving} onClick={() => props.createEntry("break_start")} className="rounded-2xl bg-orange-100 py-4 text-orange-700 font-black disabled:opacity-60">Pause</button><button type="button" disabled={props.clockSaving} onClick={() => props.createEntry("end")} className="rounded-2xl bg-red-100 py-4 text-red-700 font-black disabled:opacity-60">Ausstempeln</button></>}
          {props.status === "break" && <button type="button" disabled={props.clockSaving} onClick={() => props.createEntry("break_end")} className="col-span-2 rounded-2xl bg-green-600 py-4 text-white font-black disabled:opacity-60">Pause beenden</button>}
        </div>

        {canRequestOvertime && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="font-black text-amber-800">Planzeit erreicht</p><p className="mt-1 text-sm font-bold text-amber-700">Wenn ich länger brauche, muss ich Überstunden anfragen. Nach Genehmigung kann ich weiterarbeiten.</p><div className="mt-3 grid grid-cols-3 gap-2"><button type="button" onClick={() => props.requestOvertime(15)} className="rounded-xl bg-white py-3 font-black text-amber-700">+15 Min.</button><button type="button" onClick={() => props.requestOvertime(30)} className="rounded-xl bg-white py-3 font-black text-amber-700">+30 Min.</button><button type="button" onClick={() => props.requestOvertime(60)} className="rounded-xl bg-white py-3 font-black text-amber-700">+60 Min.</button></div></div>}

        {props.clockNotice && <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-700">{props.clockNotice}</p>}
        {props.message && <p className="mt-4 text-center text-sm font-bold text-blue-600">{props.message}</p>}
      </div>
      <div className="mt-5 space-y-3">
        {props.entries.length === 0 && <EmptyState text="Keine Zeiten erfasst" />}
        {props.entries.map((entry) => <div key={entry.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100"><p className="font-black">{entryLabel(entry.action)}</p><p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · {entry.work_site_name || entry.site || "Ohne Objekt"}{entry.auto_clock_out ? " · automatisch" : ""}</p></div>)}
      </div>
    </SimplePage>
  );
}


function TimesheetScreen(props: {
  profile: EmployeeProfile | null;
  tasks: Task[];
  entries: TimeEntry[];
  absenceRequests: AbsenceRequest[];
  openTab: (tab: Tab) => void;
}) {
  const monthKey = todayISO().slice(0, 7);
  const monthTasks = props.tasks.filter((task) => String(task.task_date || "").slice(0, 7) === monthKey && task.item_type !== "task" && task.task_type !== "task");
  const approvedWorkEntries = props.entries.filter((entry) => !isAbsenceEntry(entry)).filter(isApprovedTimeEntry);
  const approvedWorkMinutes = approvedWorkEntries.reduce((sum, entry) => sum + entryMinutes(entry), 0);
  const vacationMinutes = vacationEntryMinutes(props.entries);
  const sickMinutes = sickEntryMinutes(props.entries);
  const paidFreeMinutes = paidFreeEntryMinutes(props.entries);
  const unpaidMinutes = unpaidEntryMinutes(props.entries);
  const paidAbsenceMinutes = vacationMinutes + sickMinutes + paidFreeMinutes;
  const payrollMinutes = approvedWorkMinutes + paidAbsenceMinutes;
  const plannedMinutes = monthTasks.reduce((sum, task) => sum + Number(task.planned_minutes || task.max_minutes || 0), 0);
  const monthLimit = Number(props.profile?.monthly_hour_limit || props.profile?.monthly_hours || 0) * 60;
  const target = monthLimit || plannedMinutes;
  const progress = target > 0 ? Math.min(100, Math.round((payrollMinutes / target) * 100)) : 0;

  const recordedTaskIds = new Set(props.entries.map((entry) => String(entry.task_id || "")).filter(Boolean));
  const missingTasks = monthTasks.filter((task) => String(task.task_date || "") <= todayISO() && !recordedTaskIds.has(task.id));
  const visibleEntries = uniqueTimeEntries(props.entries).sort((a, b) => String(timeEntryDay(b) || "").localeCompare(String(timeEntryDay(a) || ""))).slice(0, 20);

  return (
    <SimplePage title="Stundenzettel" openTab={props.openTab}>
      <div className="space-y-5">
        <div className="rounded-[30px] bg-white p-5 shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-slate-400">Aktueller Monat</p>
              <h2 className="mt-1 text-3xl font-black text-slate-950">{formatMinutes(payrollMinutes)}</h2>
              <p className="mt-1 text-sm font-bold text-slate-400">Freigegebene Lohnzeit inkl. bezahlter Abwesenheit</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">{progress}%</span>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <InfoBox label="Planzeit" value={formatMinutes(plannedMinutes)} />
            <InfoBox label="Arbeitszeit" value={formatMinutes(approvedWorkMinutes)} />
            <InfoBox label="Urlaub" value={formatMinutes(vacationMinutes)} />
            <InfoBox label="Krank/Frei" value={formatMinutes(sickMinutes + paidFreeMinutes)} />
          </div>
        </div>

        <div className="rounded-[26px] bg-white p-5 shadow-sm border border-slate-100">
          <h2 className="text-xl font-black text-slate-950">Status</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="text-sm font-black text-green-700">Freigegeben</p>
              <p className="mt-1 text-2xl font-black text-green-800">{formatMinutes(payrollMinutes)}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-700">Nicht erfasst / offen</p>
              <p className="mt-1 text-2xl font-black text-amber-800">{missingTasks.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-500">Unbezahlt frei</p>
              <p className="mt-1 text-2xl font-black text-slate-700">{formatMinutes(unpaidMinutes)}</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-black text-slate-500">Einträge</h2>
          <div className="space-y-3">
            {visibleEntries.length === 0 && <EmptyState text="Noch keine Zeiten vorhanden." />}
            {visibleEntries.map((entry) => {
              const isAbsence = isAbsenceEntry(entry);
              const approved = isApprovedTimeEntry(entry);
              return (
                <div key={entry.id} className="rounded-[24px] bg-white p-4 shadow-sm border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-slate-950">{dateLabel(timeEntryDay(entry))}</p>
                      <p className="mt-1 text-sm font-bold text-slate-500">{isAbsence ? (entry.absence_type || entry.reason || "Abwesenheit") : (entry.site || entry.work_site_name || "Arbeitszeit")}</p>
                    </div>
                    <span className={`rounded-xl px-3 py-1 text-xs font-black ${approved ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{approved ? "freigegeben" : "offen"}</span>
                  </div>
                  <p className="mt-3 text-2xl font-black text-slate-950">{formatMinutes(entryMinutes(entry))}</p>
                </div>
              );
            })}
          </div>
        </div>

        {missingTasks.length > 0 && (
          <div>
            <h2 className="mb-3 text-xl font-black text-slate-500">Nicht erfasst</h2>
            <div className="space-y-3">
              {missingTasks.slice(0, 10).map((task) => (
                <div key={task.id} className="rounded-[24px] border border-amber-100 bg-amber-50 p-4">
                  <p className="font-black text-amber-900">{dateLabel(task.task_date)} · {task.site || "Objekt"}</p>
                  <p className="mt-1 text-sm font-bold text-amber-700">{formatClock(task.start_time)} - {formatClock(task.end_time)} · {formatMinutes(Number(task.planned_minutes || task.max_minutes || 0))}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SimplePage>
  );
}

function ScheduleScreen({
  tasks,
  workSites,
  selectedAssignment,
  openAssignment,
  closeAssignment,
  startAssignment,
  reportMaterial,
  openTab,
}: {
  tasks: Task[];
  workSites: WorkSite[];
  selectedAssignment: Task | null;
  openAssignment: (task: Task) => void;
  closeAssignment: () => void;
  startAssignment: (task: Task) => void;
  reportMaterial: (task: Task) => void;
  openTab: (tab: Tab) => void;
}) {
  const today = todayISO();
  const upcoming = sortTasksByTime(tasks.filter((task) => task.task_date >= today && task.item_type !== "task" && task.task_type !== "task"));
  const todayItems = upcoming.filter((task) => task.task_date === today);
  const overdue = tasks.filter((task) => task.task_date < today && task.item_type !== "task" && task.task_type !== "task" && !task.done).length;

  function getSite(task: Task) {
    return workSites.find((site) => site.id === task.work_site_id || site.name === task.site) || null;
  }

  const [qualityChecked, setQualityChecked] = useState<string[]>([]);
  const [qualityNotes, setQualityNotes] = useState("");
  const [qualityPhotoBase64, setQualityPhotoBase64] = useState("");
  const [qualityPhotoName, setQualityPhotoName] = useState("");
  const [qualitySaving, setQualitySaving] = useState(false);
  const [qualityMessage, setQualityMessage] = useState("");

  useEffect(() => {
    setQualityChecked([]);
    setQualityNotes("");
    setQualityPhotoBase64("");
    setQualityPhotoName("");
    setQualityMessage("");
  }, [selectedAssignment?.id]);

  function toggleQualityItem(item: string) {
    setQualityChecked((old) => old.includes(item) ? old.filter((value) => value !== item) : [...old, item]);
  }

  async function selectQualityPhoto(file?: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setQualityPhotoBase64(dataUrl);
      setQualityPhotoName(file.name || "Foto");
    } catch (error) {
      setQualityMessage(error instanceof Error ? error.message : "Foto konnte nicht geladen werden.");
    }
  }

  async function submitQualityReport(task: Task) {
    const checklist = taskChecklist(task);
    const photoRequired = Boolean(task.quality_photo_required);

    setQualityMessage("");

    if (checklist.length > 0 && qualityChecked.length === 0) {
      setQualityMessage("Bitte mindestens einen Checklistenpunkt abhaken.");
      return;
    }

    if (photoRequired && !qualityPhotoBase64) {
      setQualityMessage("Für diesen Einsatz ist ein Foto erforderlich.");
      return;
    }

    setQualitySaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sitzung fehlt. Bitte neu einloggen.");

      const response = await fetch("/api/quality/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          task_id: task.id,
          site: task.site,
          work_site_id: task.work_site_id,
          checked_items: qualityChecked,
          total_items: checklist.length,
          notes: qualityNotes,
          photo_base64: qualityPhotoBase64,
          photo_name: qualityPhotoName,
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Qualitätsnachweis konnte nicht gespeichert werden.");

      setQualityMessage(json.message || "Qualitätsnachweis wurde gespeichert.");
      setQualityChecked([]);
      setQualityNotes("");
      setQualityPhotoBase64("");
      setQualityPhotoName("");
    } catch (error) {
      setQualityMessage(error instanceof Error ? error.message : "Qualitätsnachweis konnte nicht gespeichert werden.");
    } finally {
      setQualitySaving(false);
    }
  }

  if (selectedAssignment) {
    const site = getSite(selectedAssignment);
    const gpsReady = Boolean(site?.latitude && site?.longitude);
    const windowText = `${formatClock(selectedAssignment.start_time)} - ${formatClock(selectedAssignment.end_time)}`;

    return (
      <SimplePage title="Einsatzdetails" openTab={openTab}>
        <div className="rounded-[26px] bg-white p-5 shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Einsatz</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{selectedAssignment.title}</h2>
              <p className="mt-1 text-sm font-bold text-slate-400">{selectedAssignment.customer_name || "Kein Kunde hinterlegt"}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${selectedAssignment.done ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{selectedAssignment.done ? "Erledigt" : "Geplant"}</span>
          </div>

          <div className="mt-5 grid gap-3 text-sm">
            <InfoCard label="Datum" value={new Date(selectedAssignment.task_date).toLocaleDateString("de-DE")} />
            <InfoCard label="Einstempel-Zeitfenster" value={windowText} />
            <InfoCard label="Maximale Planzeit" value={formatMinutes(Number(selectedAssignment.max_minutes || selectedAssignment.planned_minutes || 0))} />
            <InfoCard label="Objekt" value={selectedAssignment.site || site?.name || "Kein Objekt hinterlegt"} />
            <InfoCard label="Adresse" value={site?.address || "Keine Adresse hinterlegt"} />
            <InfoCard label="GPS-Prüfung" value={gpsReady ? `Aktiv · Radius ${site?.allowed_radius_m || 50} m` : "GPS fehlt am Objekt"} badgeClass={gpsReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"} />
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Hinweise / Leistung</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-700">{selectedAssignment.notes || "Keine zusätzlichen Hinweise hinterlegt."}</p>
          </div>

          {(selectedAssignment.quality_required || selectedAssignment.quality_photo_required || taskChecklist(selectedAssignment).length > 0) && (
            <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-indigo-950">Qualitätsnachweis direkt im Einsatz</p>
                  <p className="mt-1 text-sm font-bold text-indigo-700">Ich hake die Punkte ab und kann direkt ein Foto aufnehmen.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-indigo-700">{qualityChecked.length}/{taskChecklist(selectedAssignment).length || 1}</span>
              </div>

              {taskChecklist(selectedAssignment).length > 0 && (
                <div className="mt-4 space-y-3">
                  {taskChecklist(selectedAssignment).map((item) => (
                    <button key={item} type="button" onClick={() => toggleQualityItem(item)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left font-bold ${qualityChecked.includes(item) ? "border-indigo-200 bg-white text-indigo-800" : "border-white/80 bg-white/70 text-slate-600"}`}>
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${qualityChecked.includes(item) ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-300"}`}>{qualityChecked.includes(item) ? "✓" : ""}</span>
                      <span>{item}</span>
                    </button>
                  ))}
                </div>
              )}

              <textarea className="mt-4 min-h-[90px] w-full rounded-2xl bg-white px-4 py-4 text-sm font-semibold outline-none" value={qualityNotes} onChange={(event) => setQualityNotes(event.target.value)} placeholder="Notiz, Besonderheit oder Reklamation" />

              <label className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-white px-4 py-4 text-sm font-black text-indigo-700">
                Foto aufnehmen / hochladen
                <input className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => selectQualityPhoto(event.target.files?.[0])} />
              </label>
              {qualityPhotoName && <p className="mt-2 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-500">Foto ausgewählt: {qualityPhotoName}</p>}

              <button type="button" disabled={qualitySaving} onClick={() => submitQualityReport(selectedAssignment)} className="mt-4 w-full rounded-2xl bg-indigo-600 py-4 font-black text-white disabled:opacity-60">
                {qualitySaving ? "Wird gespeichert..." : "Qualitätsnachweis speichern"}
              </button>
              {qualityMessage && <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-bold text-slate-600">{qualityMessage}</p>}
            </div>
          )}

          {(selectedAssignment.quality_required || selectedAssignment.quality_photo_required || taskChecklist(selectedAssignment).length > 0) && (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
              Wichtig: Dieser Qualitätsnachweis muss gespeichert sein, bevor ich den Einsatz beenden kann.
            </p>
          )}

          <div className="mt-5 grid gap-3">
            <button type="button" onClick={() => startAssignment(selectedAssignment)} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white">Zum Einstempeln</button>
            <button type="button" onClick={() => reportMaterial(selectedAssignment)} className="w-full rounded-2xl bg-orange-50 py-4 font-black text-orange-700">Material zu diesem Objekt melden</button>
            <button type="button" onClick={closeAssignment} className="w-full rounded-2xl border border-slate-200 bg-white py-4 font-black text-slate-600">Zurück zu Einsätzen</button>
          </div>
        </div>
      </SimplePage>
    );
  }

  return (
    <SimplePage title="Einsätze" openTab={openTab} searchPlaceholder="Suchen...">
      <div className="grid gap-2">
        <StatusBox color="red" title="Überfällig" count={overdue} />
        <StatusBox color="orange" title="Heute" count={todayItems.length} />
        <StatusBox color="green" title="Anstehend" count={upcoming.length} />
      </div>
      <h2 className="mt-6 mb-3 text-sm font-black">Anstehend</h2>
      <div className="space-y-3">
        {upcoming.length === 0 && <EmptyState text="Keine Einsätze geplant" />}
        {upcoming.map((task) => {
          const site = getSite(task);
          const gpsReady = Boolean(site?.latitude && site?.longitude);
          return (
            <button key={task.id} type="button" onClick={() => openAssignment(task)} className="w-full rounded-[22px] bg-white p-4 text-left shadow-sm border border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-400">{new Date(task.task_date).toLocaleDateString("de-DE")} · {formatClock(task.start_time)} - {formatClock(task.end_time)}</p>
                  <p className="mt-1 truncate font-black">{task.site || site?.name || "Kein Objekt"}</p>
                  <p className="mt-1 text-sm text-slate-500">{task.title}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${gpsReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{gpsReady ? "GPS" : "GPS fehlt"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </SimplePage>
  );
}

function SearchScreen({ tasks, notifications, openTab }: { tasks: Task[]; notifications: AdminNotification[]; openTab: (tab: Tab) => void }) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();
  const resultTasks = tasks.filter((task) => `${task.title} ${task.site || ""}`.toLowerCase().includes(q));
  const resultNotes = notifications.filter((note) => `${note.title} ${note.message}`.toLowerCase().includes(q));
  return (
    <SimplePage title="Suche" openTab={openTab}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Einsätze, Aufgaben, Objekte oder Nachrichten suchen..." className="w-full rounded-2xl bg-white px-4 py-4 font-semibold outline-none shadow-sm border border-slate-100" />
      <div className="mt-5 space-y-3">
        {query && resultTasks.map((task) => <div key={task.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100"><p className="font-black">{task.title}</p><p className="text-xs text-slate-400">{task.site || "Kein Objekt"}</p></div>)}
        {query && resultNotes.map((note) => <div key={note.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100"><p className="font-black">{note.title}</p><p className="text-xs text-slate-400">{note.message}</p></div>)}
        {!query && <EmptyState text="Suchbegriff eingeben" />}
        {query && resultTasks.length === 0 && resultNotes.length === 0 && <EmptyState text="Nichts gefunden" />}
      </div>
    </SimplePage>
  );
}

function ChatScreen(props: {
  messages: ChatMessage[];
  chatText: string;
  setChatText: (value: string) => void;
  sendChatMessage: () => void;
  chatError: string;
  chatEndRef: RefObject<HTMLDivElement | null>;
  role: string;
  employees: AdminMobileRow[];
  selectedEmployee: string;
  selectEmployee: (employeeName: string) => void;
  openTab: (tab: Tab) => void;
}) {
  const isAdminUser = props.role === "admin" || props.role === "objektleiter";
  const activeEmployee = isAdminUser ? props.selectedEmployee : "";

  return (
    <SimplePage title="Nachrichten" openTab={props.openTab} searchPlaceholder="Suche">
      {isAdminUser && (
        <div className="mb-4 rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
          <p className="text-sm font-black uppercase tracking-wide text-slate-400">Unterhaltung</p>
          <select
            value={activeEmployee}
            onChange={(e) => props.selectEmployee(e.target.value)}
            className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-4 text-lg font-black outline-none"
          >
            <option value="">Mitarbeiter auswählen</option>
            {props.employees
              .filter((employee) => employee.active !== false && String(employee.role || "").toLowerCase() !== "admin")
              .map((employee) => (
                <option key={employee.id || employee.name} value={employee.name}>{employee.name}</option>
              ))}
          </select>
        </div>
      )}

      {isAdminUser && !activeEmployee ? (
        <EmptyState text="Bitte Mitarbeiter auswählen, um den Chat zu öffnen." />
      ) : (
        <>
          <div className="min-h-[55vh] space-y-3 pb-28">
            {props.messages.length === 0 && <EmptyState text="Keine Nachrichten bisher" />}
            {props.messages.map((msg) => {
              const mine = isAdminUser ? msg.sender_role === "admin" : msg.sender_role === "employee";
              return (
                <div key={msg.id} className={`max-w-[85%] rounded-[22px] p-4 ${mine ? "ml-auto bg-blue-600 text-white" : "bg-white text-slate-950 shadow-sm border border-slate-100"}`}>
                  <p className="text-sm font-semibold">{msg.message}</p>
                  <p className={`mt-1 text-[11px] ${mine ? "text-blue-100" : "text-slate-400"}`}>
                    {msg.sender_name || (msg.sender_role === "admin" ? "Admin" : "Mitarbeiter")} · {new Date(msg.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
            <div ref={props.chatEndRef} />
          </div>

          <div className="fixed bottom-[72px] left-0 right-0 mx-auto max-w-md bg-[#f5f7fb]/95 p-4 backdrop-blur">
            <div className="flex gap-2">
              <input value={props.chatText} onChange={(e) => props.setChatText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") props.sendChatMessage(); }} placeholder="Nachricht schreiben..." className="flex-1 rounded-2xl bg-white px-4 py-4 outline-none shadow-sm" />
              <button type="button" onClick={props.sendChatMessage} className="rounded-2xl bg-blue-600 px-5 text-white font-black">➤</button>
            </div>
            {props.chatError && <p className="mt-2 text-sm font-bold text-red-500">{props.chatError}</p>}
          </div>
        </>
      )}
    </SimplePage>
  );
}

function AbsenceRequestScreen(props: {
  absenceType: string;
  setAbsenceType: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  saving: boolean;
  message: string;
  requests: AbsenceRequest[];
  submit: () => void;
  openTab: (tab: Tab) => void;
}) {
  const chips = ["Urlaub", "Krankheit", "Bezahlt Frei", "Unbezahlt Frei"];

  return (
    <SimplePage title="Abwesenheit" openTab={props.openTab}>
      <div className="space-y-5">
        <div className="rounded-[30px] bg-white p-5 shadow-sm border border-slate-100">
          <h2 className="text-2xl font-black text-slate-950">Abwesenheit einreichen</h2>
          <p className="mt-1 text-sm font-bold text-slate-400">Urlaub wird mit den geplanten Einsatzstunden berechnet.</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {chips.map((chip) => (
              <button key={chip} type="button" onClick={() => props.setAbsenceType(chip)} className={`rounded-2xl border py-4 text-sm font-black ${props.absenceType === chip ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-100 bg-white text-slate-500"}`}>{chip}</button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="rounded-[22px] border border-slate-100 p-4">
              <span className="text-sm font-bold text-slate-400">Von</span>
              <input type="date" value={props.startDate} onChange={(e) => props.setStartDate(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
            </label>
            <label className="rounded-[22px] border border-slate-100 p-4">
              <span className="text-sm font-bold text-slate-400">Bis</span>
              <input type="date" value={props.endDate} onChange={(e) => props.setEndDate(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
            </label>
          </div>

          <label className="mt-3 block rounded-[22px] border border-slate-100 p-4">
            <span className="text-sm font-bold text-slate-400">Grund / Notiz</span>
            <textarea value={props.reason} onChange={(e) => props.setReason(e.target.value)} placeholder="Optional" className="mt-2 min-h-24 w-full bg-transparent text-lg font-semibold outline-none placeholder:text-slate-300" />
          </label>

          {props.message && <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-black text-blue-800">{props.message}</div>}

          <button type="button" disabled={props.saving} onClick={props.submit} className="mt-5 w-full rounded-2xl bg-blue-600 py-5 text-lg font-black text-white disabled:bg-slate-200">
            {props.saving ? "Wird eingereicht..." : "Abwesenheit einreichen"}
          </button>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-black text-slate-500">Meine Anträge</h2>
          <div className="space-y-3">
            {props.requests.length === 0 && <EmptyState text="Noch keine Abwesenheiten eingereicht." />}
            {props.requests.map((request) => {
              const status = String(request.status || "open").toLowerCase();
              return (
                <div key={request.id} className="rounded-[24px] bg-white p-4 shadow-sm border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-black text-slate-950">{request.absence_type}</p>
                      <p className="mt-1 text-sm font-bold text-slate-500">{dateLabel(request.start_date)} → {dateLabel(request.end_date || request.start_date)}</p>
                      {request.reason && <p className="mt-2 text-sm font-semibold text-slate-500">{request.reason}</p>}
                    </div>
                    <span className={`rounded-xl px-3 py-1 text-xs font-black ${status.includes("approved") || status.includes("genehmigt") ? "bg-green-100 text-green-700" : status.includes("rejected") || status.includes("abgelehnt") ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>{request.status || "offen"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SimplePage>
  );
}

function MaterialReportScreen(props: {
  workSites: WorkSite[];
  materials: MaterialProduct[];
  siteId: string;
  setSiteId: (value: string) => void;
  materialId: string;
  setMaterialId: (value: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  cart: Record<string, number>;
  setCart: (value: Record<string, number>) => void;
  notes: string;
  setNotes: (value: string) => void;
  saving: boolean;
  message: string;
  submit: () => void;
  openTab: (tab: Tab) => void;
}) {
  const selectedSite = props.workSites.find((site) => site.id === props.siteId) || null;
  const filteredMaterials = props.materials
    .filter((item) => !item.work_site_id || item.work_site_id === props.siteId)
    .filter((item) => {
      const q = props.search.trim().toLowerCase();
      if (!q) return true;
      return `${item.name || ""} ${item.category || ""}`.toLowerCase().includes(q);
    });
  const grouped = filteredMaterials.reduce((acc: Record<string, MaterialProduct[]>, item) => {
    const key = item.category || "Artikel ohne Gruppe";
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
  const selectedCount = Object.values(props.cart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);

  function changeQuantity(id: string, delta: number) {
    const next = { ...props.cart };
    next[id] = Math.max(0, Number(next[id] || 0) + delta);
    if (next[id] <= 0) delete next[id];
    props.setCart(next);
  }

  return (
    <SimplePage title="Material bestellen" openTab={props.openTab}>
      <div className="space-y-4">
        <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
          <label className="flex items-center gap-4 rounded-[22px] border border-slate-100 px-4 py-4">
            <span className="text-3xl text-slate-400">▦</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-400">Objekt</p>
              <select value={props.siteId} onChange={(e) => { props.setSiteId(e.target.value); props.setMaterialId(""); props.setCart({}); }} className="mt-1 w-full bg-transparent text-xl font-bold outline-none">
                <option value="">Objekt auswählen</option>
                {props.workSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </div>
          </label>

          <label className="mt-3 flex items-center gap-4 rounded-[22px] border border-slate-100 px-4 py-4">
            <span className="text-3xl text-slate-400">✎</span>
            <input value={props.notes} onChange={(e) => props.setNotes(e.target.value)} placeholder="Bemerkung" className="min-w-0 flex-1 text-xl font-semibold outline-none placeholder:text-slate-300" />
          </label>
        </div>

        <div>
          <h2 className="px-1 text-xl font-black text-slate-500">Artikel</h2>
          <div className="mt-3 flex items-center gap-3 rounded-[22px] bg-slate-50 px-5 py-4">
            <span className="text-3xl text-slate-400">⌕</span>
            <input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="Suche" className="min-w-0 flex-1 bg-transparent text-2xl font-semibold outline-none placeholder:text-slate-300" />
          </div>
        </div>

        {!props.siteId && <div className="rounded-[24px] bg-amber-50 p-4 text-sm font-black text-amber-800">Bitte zuerst ein Objekt auswählen. Danach sehe ich die objektbezogenen Materialien.</div>}

        {Object.keys(grouped).length === 0 && props.siteId && <EmptyState text="Für dieses Objekt sind noch keine Materialien angelegt." />}

        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <div className="mb-3 mt-5 flex items-center justify-between px-1">
              <h3 className="text-lg font-black text-slate-500">{category}</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-400">{items.length}</span>
            </div>
            <div className="space-y-4">
              {items.map((item) => {
                const qty = Number(props.cart[item.id] || 0);
                return (
                  <div key={item.id} className="flex items-center gap-4 rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 text-2xl">
                      {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : "📦"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-400">{Number(item.current_stock || 0)} / {Number(item.minimum_stock || 1)} {item.unit || "Stk."}</p>
                      <p className="text-lg font-black text-slate-950">{item.name}</p>
                    </div>
                    <div className="flex items-center rounded-2xl border border-slate-100 bg-white">
                      <button type="button" onClick={() => changeQuantity(item.id, -1)} className="px-4 py-3 text-2xl font-black text-slate-200">−</button>
                      <span className="min-w-8 text-center text-2xl font-black text-slate-500">{qty}</span>
                      <button type="button" onClick={() => changeQuantity(item.id, 1)} className="px-4 py-3 text-3xl font-black text-blue-600">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {props.message && <div className="rounded-2xl bg-blue-50 p-3 text-sm font-black text-blue-800">{props.message}</div>}

        <button type="button" onClick={props.submit} disabled={props.saving || !props.siteId || selectedCount <= 0} className="sticky bottom-24 w-full rounded-[22px] bg-blue-600 py-5 text-xl font-black text-white shadow-sm disabled:bg-slate-100 disabled:text-white">
          {props.saving ? "Wird gesendet..." : selectedCount > 0 ? `Material bestellen (${selectedCount})` : "Material bestellen"}
        </button>
      </div>
    </SimplePage>
  );
}

function ProfileScreen(props: { profile: EmployeeProfile | null; workedMinutes: number; payrollMinutes: number; pauseMinutes: number; notifications: AdminNotification[]; absenceRequests: AbsenceRequest[]; tasks: Task[]; todayEntries: TimeEntry[]; monthEntries: TimeEntry[]; logout: () => void; openTab: (tab: Tab) => void }) {
  const vacationTotal = Number(props.profile?.vacation_days ?? props.profile?.annual_vacation_days ?? 0);
  const vacationTaken = approvedAbsenceDays(props.absenceRequests, "urlaub");
  const vacationOpen = Math.max(0, vacationTotal - vacationTaken);
  const sickDays = approvedAbsenceDays(props.absenceRequests, "krank");
  const paidFreeDays = props.absenceRequests
    .filter((item) => ["approved", "genehmigt"].includes(String(item.status || "").toLowerCase()))
    .filter((item) => {
      const type = absenceType(item.absence_type);
      return !type.includes("unbezahlt") && type.includes("frei");
    })
    .reduce((sum, item) => sum + dateRangeDays(item.start_date, item.end_date), 0);
  const unpaidDays = props.absenceRequests
    .filter((item) => ["approved", "genehmigt"].includes(String(item.status || "").toLowerCase()))
    .filter((item) => absenceType(item.absence_type).includes("unbezahlt"))
    .reduce((sum, item) => sum + dateRangeDays(item.start_date, item.end_date), 0);

  const monthKey = todayISO().slice(0, 7);
  const monthPlan = props.tasks.filter((task) => String(task.task_date || "").slice(0, 7) === monthKey).reduce((sum, task) => sum + Number(task.planned_minutes || task.max_minutes || 0), 0);
  const monthLimit = Number(props.profile?.monthly_hour_limit || props.profile?.monthly_hours || 0) * 60;
  const vacationMinutes = vacationEntryMinutes(props.monthEntries);
  const sickMinutes = sickEntryMinutes(props.monthEntries);
  const paidFreeMinutes = paidFreeEntryMinutes(props.monthEntries);
  const unpaidMinutes = unpaidEntryMinutes(props.monthEntries);
  const paidAbsenceMinutes = vacationMinutes + sickMinutes + paidFreeMinutes;
  const approvedWorkMinutes = props.monthEntries
    .filter((entry) => !isAbsenceEntry(entry))
    .filter(isApprovedTimeEntry)
    .reduce((sum, entry) => sum + entryMinutes(entry), 0);

  return (
    <SimplePage title="Profil" openTab={props.openTab}>
      <div className="rounded-[24px] bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <Avatar name={props.profile?.name || "M"} src={props.profile?.avatar_url || ""} large />
          <div><p className="text-xl font-black">{props.profile?.name}</p><p className="text-sm font-bold text-slate-400">{props.profile?.email}</p></div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <InfoBox label="Heute geleistet" value={formatMinutes(props.workedMinutes)} />
          <InfoBox label="Lohnzeit heute" value={formatMinutes(props.payrollMinutes || props.workedMinutes)} />
          <InfoBox label="Pause" value={formatMinutes(props.pauseMinutes)} />
          <InfoBox label="Monat geplant" value={formatMinutes(monthPlan)} />
          <InfoBox label="Monatslimit" value={monthLimit ? formatMinutes(monthLimit) : "-"} />
          <InfoBox label="Freigegebene Arbeit" value={formatMinutes(approvedWorkMinutes)} />
        </div>

        <div className="mt-5 rounded-[22px] bg-blue-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black text-blue-950">Urlaubskonto</p>
              <p className="mt-1 text-xs font-bold text-blue-700">Urlaubsstunden werden aus den geplanten Einsatzzeiten berechnet.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">{vacationOpen} Tage offen</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <InfoBox label="Urlaub genommen" value={`${vacationTaken} / ${vacationTotal} Tage`} />
            <InfoBox label="Urlaub bezahlt" value={formatMinutes(vacationMinutes)} />
            <InfoBox label="Krank" value={`${sickDays} Tage · ${formatMinutes(sickMinutes)}`} />
            <InfoBox label="Bezahlt frei" value={`${paidFreeDays} Tage · ${formatMinutes(paidFreeMinutes)}`} />
            <InfoBox label="Unbezahlt frei" value={`${unpaidDays} Tage · ${formatMinutes(unpaidMinutes)}`} />
            <InfoBox label="Bezahlte Abwesenheit" value={formatMinutes(paidAbsenceMinutes)} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => props.openTab("absence")} className="rounded-2xl bg-emerald-50 py-4 text-sm font-black text-emerald-700">Abwesenheit melden</button>
          <button type="button" onClick={() => props.openTab("chat")} className="rounded-2xl bg-blue-50 py-4 text-sm font-black text-blue-700">Nachricht schreiben</button>
        </div>

        <button type="button" onClick={props.logout} className="mt-5 w-full rounded-2xl bg-red-50 py-4 text-red-600 font-black">Abmelden</button>
      </div>

      <h2 className="mt-6 mb-3 text-sm font-black">Meine Meldungen</h2>
      <div className="space-y-3">
        {props.notifications.length === 0 && <EmptyState text="Keine Meldungen vorhanden" />}
        {props.notifications.map((note) => <div key={note.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100"><div className="flex items-start justify-between gap-3"><p className="font-black">{note.title}</p><span className={`rounded-full px-3 py-1 text-[11px] font-black ${note.status === "approved" ? "bg-green-100 text-green-700" : note.status === "rejected" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>{note.status || "open"}</span></div><p className="mt-1 text-sm text-slate-500">{note.message}</p></div>)}
      </div>
    </SimplePage>
  );
}

function SimplePage({ title, children, openTab, searchPlaceholder }: { title: string; children: ReactNode; openTab: (tab: Tab) => void; searchPlaceholder?: string }) {
  return (
    <section className="px-5 pt-5">
      <div className="mb-5 flex items-center justify-between">
        <button type="button" onClick={() => openTab("home")} className="text-2xl">‹</button>
        <h1 className="font-black">{title}</h1>
        <span className="w-6" />
      </div>
      {searchPlaceholder && <input placeholder={searchPlaceholder} className="mb-5 w-full rounded-2xl bg-white px-4 py-4 outline-none shadow-sm border border-slate-100" />}
      {children}
    </section>
  );
}

function AdminMobileScreen(props: {
  role: string;
  data: { employees: AdminMobileRow[]; tasks: AdminMobileRow[]; entries: AdminMobileRow[]; absenceRequests: AdminMobileRow[]; materialReports: AdminMobileRow[]; qualityReports: AdminMobileRow[]; materials: AdminMobileRow[]; sites: AdminMobileRow[]; chats: AdminMobileRow[] };
  tab: "today" | "approval" | "material" | "assignment";
  setTab: (value: "today" | "approval" | "material" | "assignment") => void;
  message: string;
  saving: boolean;
  refresh: () => void;
  approveTime: (row: AdminMobileRow, approved: boolean) => void;
  resolveMaterialReport: (row: AdminMobileRow) => void;
  decideAbsence: (row: AdminMobileRow, approved: boolean) => void;
  reviewQualityReport: (row: AdminMobileRow, approved: boolean) => void;
  selectedSiteId: string;
  setSelectedSiteId: (value: string) => void;
  materialName: string;
  setMaterialName: (value: string) => void;
  materialUnit: string;
  setMaterialUnit: (value: string) => void;
  materialCategory: string;
  setMaterialCategory: (value: string) => void;
  createMaterial: () => void;
  assignmentSiteId: string;
  setAssignmentSiteId: (value: string) => void;
  assignmentEmployeeName: string;
  setAssignmentEmployeeName: (value: string) => void;
  assignmentDate: string;
  setAssignmentDate: (value: string) => void;
  assignmentStart: string;
  setAssignmentStart: (value: string) => void;
  assignmentEnd: string;
  setAssignmentEnd: (value: string) => void;
  assignmentPlanned: string;
  setAssignmentPlanned: (value: string) => void;
  assignmentNotes: string;
  setAssignmentNotes: (value: string) => void;
  createAssignment: () => void;
  manualEmployeeName: string;
  setManualEmployeeName: (value: string) => void;
  manualSiteId: string;
  setManualSiteId: (value: string) => void;
  manualDate: string;
  setManualDate: (value: string) => void;
  manualStart: string;
  setManualStart: (value: string) => void;
  manualEnd: string;
  setManualEnd: (value: string) => void;
  manualReason: string;
  setManualReason: (value: string) => void;
  manualNotes: string;
  setManualNotes: (value: string) => void;
  createManualTimeEntry: () => void;
  openChatWith: (employeeName: string) => void;
  openTab: (tab: Tab) => void;
}) {
  const canAdmin = props.role === "admin" || props.role === "objektleiter";
  const today = todayISO();
  const todayTasks = props.data.tasks.filter((task) => String(task.task_date || task.due_date || "").slice(0, 10) === today);
  const openTimeEntries = props.data.entries
    .filter((entry) => Number(entry.worked_minutes || entry.payroll_minutes || 0) > 0)
    .filter((entry) => !(entry.approved === true || String(entry.status || "").toLowerCase() === "approved"))
    .slice(0, 30);
  const selectedSite = props.data.sites.find((site) => site.id === props.selectedSiteId) || null;
  const objectMaterials = props.data.materials.filter((item) => !props.selectedSiteId || item.work_site_id === props.selectedSiteId);
  const materialReports = props.data.materialReports.slice(0, 20);
  const openAbsences = props.data.absenceRequests
    .filter((row) => !["approved", "genehmigt", "rejected", "abgelehnt"].includes(String(row.status || "").toLowerCase()))
    .slice(0, 20);
  const openQualityReports = props.data.qualityReports
    .filter((row) => !["reviewed", "geprüft"].includes(String(row.status || "").toLowerCase()))
    .slice(0, 20);
  const unreadChats = props.data.chats
    .filter((row) => String(row.sender_role || "").toLowerCase() !== "admin")
    .filter((row) => row.read_by_admin !== true)
    .slice(0, 50);

  const unreadChatGroups = Object.values(unreadChats.reduce((acc: Record<string, AdminMobileRow & { unread_count: number }>, row) => {
    const key = String(row.employee_name || row.sender_name || "Unbekannt");
    const current = acc[key];
    const currentTime = current ? new Date(String(current.created_at || "")).getTime() : 0;
    const rowTime = new Date(String(row.created_at || "")).getTime();
    if (!current || rowTime >= currentTime) {
      acc[key] = { ...row, employee_name: key, unread_count: (current?.unread_count || 0) + 1 };
    } else {
      current.unread_count = (current.unread_count || 0) + 1;
    }
    return acc;
  }, {})).slice(0, 20);

  const openMaterials = props.data.materialReports
    .filter((row) => String(row.status || "open").toLowerCase() !== "done")
    .slice(0, 20);

  function taskDateValue(task: AdminMobileRow) {
    return String(task.task_date || task.due_date || "").slice(0, 10);
  }

  function entryDateValue(entry: AdminMobileRow) {
    return String(entry.work_date || entry.check_in_at || entry.created_at || "").slice(0, 10);
  }

  function isTaskDueForTimeCheck(task: AdminMobileRow) {
    const taskDate = taskDateValue(task);
    if (!taskDate) return false;
    if (taskDate < today) return true;
    if (taskDate > today) return false;
    const endTime = String(task.end_time || "").slice(0, 5);
    if (!endTime) return true;
    const nowText = new Date().toTimeString().slice(0, 5);
    return endTime <= nowText;
  }

  function entryMatchesTask(entry: AdminMobileRow, task: AdminMobileRow) {
    const taskDate = taskDateValue(task);
    if (!taskDate || entryDateValue(entry) !== taskDate) return false;

    const employee = String(task.employee_name || "").trim();
    if (employee && String(entry.employee_name || "").trim() !== employee) return false;

    const taskId = String(task.id || "");
    if (taskId && String(entry.task_id || "") === taskId) return true;

    const siteId = String(task.work_site_id || task.site_id || "");
    if (siteId && String(entry.work_site_id || entry.site_id || "") === siteId) return true;

    const siteName = String(task.site || task.work_site_name || "").trim().toLowerCase();
    const entrySiteName = String(entry.site || entry.work_site_name || "").trim().toLowerCase();
    return Boolean(siteName && entrySiteName && siteName === entrySiteName);
  }

  function isAssignmentTask(task: AdminMobileRow) {
    const itemType = String(task.item_type || "").toLowerCase();
    const taskType = String(task.task_type || "").toLowerCase();
    return itemType !== "task" && taskType !== "task";
  }

  const missingTimeTasks = props.data.tasks
    .filter(isAssignmentTask)
    .filter((task) => Boolean(String(task.employee_name || "").trim()))
    .filter(isTaskDueForTimeCheck)
    .filter((task) => !props.data.entries.some((entry) => entryMatchesTask(entry, task)))
    .slice(0, 20);

  function prefillManualTimeFromTask(task: AdminMobileRow) {
    props.setManualEmployeeName(String(task.employee_name || ""));
    props.setManualSiteId(String(task.work_site_id || task.site_id || ""));
    props.setManualDate(taskDateValue(task) || today);
    props.setManualStart(String(task.start_time || "08:00").slice(0, 5));
    props.setManualEnd(String(task.end_time || "09:00").slice(0, 5));
    props.setManualReason("Zeit nachgetragen");
    props.setManualNotes(`Nachgetragen aus fehlendem Einsatz: ${task.site || "Objekt"}`);
    props.setTab("approval");
  }

  const totalTodos = openTimeEntries.length + openAbsences.length + openMaterials.length + openQualityReports.length + unreadChatGroups.length + missingTimeTasks.length;
  const urgentTodos = [
    ...unreadChatGroups.map((row) => ({ id: `chat-${row.employee_name}`, kind: "Chat", title: row.employee_name || row.sender_name || "Nachricht", text: `${row.message || "Neue Nachricht"}${Number(row.unread_count || 0) > 1 ? ` · ${row.unread_count} ungelesen` : ""}`, action: "Antworten", onClick: () => props.openChatWith(String(row.employee_name || "")) })),
    ...openAbsences.map((row) => ({ id: `absence-${row.id}`, kind: "Antrag", title: row.absence_type || "Abwesenheit", text: `${row.employee_name || "-"} · ${dateLabel(row.start_date)} → ${dateLabel(row.end_date || row.start_date)}`, action: "Genehmigen", onClick: () => props.decideAbsence(row, true) })),
    ...openMaterials.map((row) => ({ id: `material-${row.id}`, kind: "Material", title: row.material_name || row.product_name || "Material", text: `${row.employee_name || "-"} · ${row.object_name || row.site || row.work_site_name || "Objekt"}`, action: "Erledigt", onClick: () => props.resolveMaterialReport(row) })),
    ...openQualityReports.map((row) => ({ id: `quality-${row.id}`, kind: "Qualität", title: row.site || row.title || "Qualitätsnachweis", text: `${row.employee_name || "-"} · ${Number(row.passed_items || 0)}/${Number(row.total_items || 0)}`, action: "Prüfen", onClick: () => props.reviewQualityReport(row, true) })),
    ...missingTimeTasks.map((row) => ({ id: `missing-${row.id}`, kind: "Fehlzeit", title: row.employee_name || "Zeit fehlt", text: `${row.site || "Objekt"} · ${dateLabel(taskDateValue(row))} · ${formatClock(row.start_time)} - ${formatClock(row.end_time)}`, action: "Nachtragen", onClick: () => prefillManualTimeFromTask(row) })),
    ...openTimeEntries.map((row) => ({ id: `time-${row.id}`, kind: "Zeit", title: row.employee_name || "Zeit", text: `${row.site || row.work_site_name || "Objekt"} · ${formatMinutes(Number(row.worked_minutes || row.payroll_minutes || 0))}`, action: "Freigeben", onClick: () => props.approveTime(row, true) })),
  ].slice(0, 8);

  if (!canAdmin) {
    return (
      <SimplePage title="Admin" openTab={props.openTab}>
        <EmptyState text="Nur Admins oder Objektleiter können diesen Bereich öffnen." />
      </SimplePage>
    );
  }

  return (
    <SimplePage title="Adminportal" openTab={props.openTab}>
      <div className="space-y-5">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            ["today", "Heute"],
            ["assignment", "Einsatz"],
            ["approval", "Freigaben"],
            ["material", "Material"],
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => props.setTab(id as "today" | "approval" | "material" | "assignment")} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${props.tab === id ? "bg-blue-600 text-white" : "bg-white text-slate-500 border border-slate-100"}`}>{label}</button>
          ))}
          <button type="button" onClick={props.refresh} className="ml-auto shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-500">↻</button>
        </div>

        {props.message && <div className="rounded-2xl bg-blue-50 p-3 text-sm font-black text-blue-800">{props.message}</div>}

        {props.tab === "today" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <InfoBox label="Heute zu tun" value={String(totalTodos)} />
              <InfoBox label="Chat offen" value={String(unreadChatGroups.length)} />
              <InfoBox label="Zeiten offen" value={String(openTimeEntries.length + missingTimeTasks.length)} />
              <InfoBox label="Material / Qualität" value={String(openMaterials.length + openQualityReports.length)} />
            </div>

            <div className="rounded-[30px] bg-white p-5 shadow-sm border border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-950">To-do-Zentrale</h2>
                  <p className="mt-1 text-sm font-bold text-slate-400">Alles, was ich heute direkt abarbeiten muss.</p>
                </div>
                <button type="button" onClick={props.refresh} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-500">↻</button>
              </div>

              <div className="mt-5 space-y-3">
                {urgentTodos.length === 0 && <EmptyState text="Alles erledigt. Keine offenen Admin-Aufgaben." />}
                {urgentTodos.map((todo) => (
                  <div key={todo.id} className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">{todo.kind}</span>
                        <p className="mt-3 text-xl font-black text-slate-950">{todo.title}</p>
                        <p className="mt-1 text-sm font-bold text-slate-500">{todo.text}</p>
                      </div>
                      <button type="button" disabled={props.saving} onClick={todo.onClick} className="shrink-0 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:bg-slate-200">{todo.action}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Heutige Einsätze</h2>
              <div className="mt-4 space-y-3">
                {todayTasks.length === 0 && <EmptyState text="Heute sind keine Einsätze geplant." />}
                {todayTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="rounded-[22px] border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">{task.site || "Objekt"}</p>
                        <p className="mt-1 text-sm font-bold text-slate-500">{task.employee_name || "Nicht zugewiesen"} · {formatClock(task.start_time)} → {formatClock(task.end_time)}</p>
                      </div>
                      <span className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{formatMinutes(Number(task.planned_minutes || task.max_minutes || 0))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {props.tab === "assignment" && (
          <div className="space-y-4">
            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Einsatz erstellen</h2>
              <p className="mt-1 text-sm font-bold text-slate-400">Schnellplanung direkt am Handy.</p>

              <label className="mt-4 block rounded-[22px] border border-slate-100 p-4">
                <span className="text-sm font-bold text-slate-400">Objekt</span>
                <select value={props.assignmentSiteId} onChange={(e) => props.setAssignmentSiteId(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none">
                  <option value="">Objekt auswählen</option>
                  {props.data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </label>

              <label className="mt-3 block rounded-[22px] border border-slate-100 p-4">
                <span className="text-sm font-bold text-slate-400">Mitarbeiter</span>
                <select value={props.assignmentEmployeeName} onChange={(e) => props.setAssignmentEmployeeName(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none">
                  <option value="">Mitarbeiter auswählen</option>
                  {props.data.employees.filter((employee) => employee.active !== false && String(employee.role || "").toLowerCase() !== "admin").map((employee) => <option key={employee.id || employee.name} value={employee.name}>{employee.name}</option>)}
                </select>
              </label>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="rounded-[22px] border border-slate-100 p-4">
                  <span className="text-sm font-bold text-slate-400">Datum</span>
                  <input type="date" value={props.assignmentDate} onChange={(e) => props.setAssignmentDate(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
                </label>
                <label className="rounded-[22px] border border-slate-100 p-4">
                  <span className="text-sm font-bold text-slate-400">Planzeit Min.</span>
                  <input type="number" min="1" value={props.assignmentPlanned} onChange={(e) => props.setAssignmentPlanned(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="rounded-[22px] border border-slate-100 p-4">
                  <span className="text-sm font-bold text-slate-400">Von</span>
                  <input type="time" value={props.assignmentStart} onChange={(e) => props.setAssignmentStart(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
                </label>
                <label className="rounded-[22px] border border-slate-100 p-4">
                  <span className="text-sm font-bold text-slate-400">Bis</span>
                  <input type="time" value={props.assignmentEnd} onChange={(e) => props.setAssignmentEnd(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
                </label>
              </div>

              <label className="mt-3 block rounded-[22px] border border-slate-100 p-4">
                <span className="text-sm font-bold text-slate-400">Hinweis</span>
                <textarea value={props.assignmentNotes} onChange={(e) => props.setAssignmentNotes(e.target.value)} placeholder="Optional" className="mt-2 min-h-20 w-full bg-transparent text-lg font-semibold outline-none placeholder:text-slate-300" />
              </label>

              <button type="button" disabled={props.saving} onClick={props.createAssignment} className="mt-4 w-full rounded-2xl bg-blue-600 py-5 text-lg font-black text-white disabled:bg-slate-200">
                {props.saving ? "Wird gespeichert..." : "+ Einsatz erstellen"}
              </button>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Letzte Einsätze</h2>
              <div className="mt-4 space-y-3">
                {props.data.tasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="rounded-2xl border border-slate-100 p-4">
                    <p className="font-black">{task.site || "Objekt"}</p>
                    <p className="text-sm font-bold text-slate-400">{dateLabel(task.task_date || task.due_date)} · {task.employee_name || "Nicht zugewiesen"} · {formatClock(task.start_time)} - {formatClock(task.end_time)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {props.tab === "approval" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <InfoBox label="Offene Zeiten" value={String(openTimeEntries.length + missingTimeTasks.length)} />
              <InfoBox label="Abwesenheit" value={String(openAbsences.length)} />
              <InfoBox label="Material offen" value={String(openMaterials.length)} />
              <InfoBox label="Qualität" value={String(openQualityReports.length)} />
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Fehlende Zeiten</h2>
              <p className="mt-1 text-sm font-bold text-slate-400">Geplante Einsätze ohne Zeiteintrag.</p>
              <div className="mt-4 space-y-3">
                {missingTimeTasks.length === 0 && <EmptyState text="Keine fehlenden Zeiten erkannt." />}
                {missingTimeTasks.map((task) => (
                  <div key={task.id} className="rounded-[24px] border border-red-100 bg-red-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-red-950">{task.employee_name || "Mitarbeiter"}</p>
                        <p className="mt-1 text-sm font-bold text-red-700">{task.site || "Objekt"} · {dateLabel(taskDateValue(task))}</p>
                        <p className="mt-1 text-sm font-bold text-red-700">{formatClock(task.start_time)} - {formatClock(task.end_time)} · {formatMinutes(Number(task.planned_minutes || task.max_minutes || 0))}</p>
                      </div>
                      <span className="rounded-xl bg-white px-3 py-1 text-xs font-black text-red-700">fehlt</span>
                    </div>
                    <button type="button" onClick={() => prefillManualTimeFromTask(task)} className="mt-4 w-full rounded-2xl bg-white py-3 font-black text-red-700">
                      Zeit nachtragen
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Zeit nachtragen</h2>
              <p className="mt-1 text-sm font-bold text-slate-400">Wenn ein Mitarbeiter das Stempeln vergessen hat, trage ich die Zeit hier manuell nach.</p>

              <label className="mt-4 block rounded-[22px] border border-slate-100 p-4">
                <span className="text-sm font-bold text-slate-400">Mitarbeiter</span>
                <select value={props.manualEmployeeName} onChange={(e) => props.setManualEmployeeName(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none">
                  <option value="">Mitarbeiter auswählen</option>
                  {props.data.employees.filter((employee) => employee.active !== false && String(employee.role || "").toLowerCase() !== "admin").map((employee) => <option key={employee.id || employee.name} value={employee.name}>{employee.name}</option>)}
                </select>
              </label>

              <label className="mt-3 block rounded-[22px] border border-slate-100 p-4">
                <span className="text-sm font-bold text-slate-400">Objekt</span>
                <select value={props.manualSiteId} onChange={(e) => props.setManualSiteId(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none">
                  <option value="">Objekt auswählen</option>
                  {props.data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </label>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="rounded-[22px] border border-slate-100 p-4">
                  <span className="text-sm font-bold text-slate-400">Datum</span>
                  <input type="date" value={props.manualDate} onChange={(e) => props.setManualDate(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
                </label>
                <label className="rounded-[22px] border border-slate-100 p-4">
                  <span className="text-sm font-bold text-slate-400">Grund</span>
                  <input value={props.manualReason} onChange={(e) => props.setManualReason(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="rounded-[22px] border border-slate-100 p-4">
                  <span className="text-sm font-bold text-slate-400">Von</span>
                  <input type="time" value={props.manualStart} onChange={(e) => props.setManualStart(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
                </label>
                <label className="rounded-[22px] border border-slate-100 p-4">
                  <span className="text-sm font-bold text-slate-400">Bis</span>
                  <input type="time" value={props.manualEnd} onChange={(e) => props.setManualEnd(e.target.value)} className="mt-2 w-full bg-transparent text-lg font-black outline-none" />
                </label>
              </div>

              <label className="mt-3 block rounded-[22px] border border-slate-100 p-4">
                <span className="text-sm font-bold text-slate-400">Kommentar</span>
                <textarea value={props.manualNotes} onChange={(e) => props.setManualNotes(e.target.value)} placeholder="Optional" className="mt-2 min-h-20 w-full bg-transparent text-lg font-semibold outline-none placeholder:text-slate-300" />
              </label>

              <button type="button" disabled={props.saving} onClick={props.createManualTimeEntry} className="mt-4 w-full rounded-2xl bg-blue-600 py-5 text-lg font-black text-white disabled:bg-slate-200">
                {props.saving ? "Wird gespeichert..." : "+ Zeit nachtragen"}
              </button>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Zeiten freigeben</h2>
              <div className="mt-4 space-y-4">
                {openTimeEntries.length === 0 && <EmptyState text="Keine offenen Zeiten zur Freigabe." />}
                {openTimeEntries.map((entry) => {
                  const planned = Number(entry.planned_minutes || 0);
                  const worked = Number(entry.worked_minutes || entry.payroll_minutes || 0);
                  const diff = worked - planned;
                  return (
                    <div key={entry.id} className="rounded-[28px] bg-slate-50 p-5 border border-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xl font-black">{dateLabel(entry.work_date || entry.created_at)}</p>
                          <p className="mt-2 text-sm font-bold text-slate-500">{entry.employee_name || "-"} · {entry.site || entry.work_site_name || "Objekt"}</p>
                          <p className="mt-4 text-sm font-bold text-slate-500">Soll: {formatMinutes(planned)} · Ist: {formatMinutes(worked)}</p>
                          <p className={`mt-1 font-black ${diff < 0 ? "text-red-500" : "text-emerald-600"}`}>{diff >= 0 ? "+" : "-"} {formatMinutes(Math.abs(diff))}</p>
                        </div>
                        <button type="button" disabled={props.saving} onClick={() => props.approveTime(entry, true)} className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-green-500 text-4xl font-black text-white">✓</button>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button type="button" disabled={props.saving} onClick={() => props.approveTime(entry, false)} className="rounded-2xl bg-red-50 py-3 font-black text-red-600">Ablehnen</button>
                        <button type="button" disabled={props.saving} onClick={() => props.approveTime(entry, true)} className="rounded-2xl bg-green-50 py-3 font-black text-green-700">Freigeben</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Abwesenheiten freigeben</h2>
              <div className="mt-4 space-y-4">
                {openAbsences.length === 0 && <EmptyState text="Keine offenen Abwesenheiten." />}
                {openAbsences.map((row) => (
                  <div key={row.id} className="rounded-[24px] bg-emerald-50 p-4 border border-emerald-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-black text-emerald-950">{row.absence_type || "Abwesenheit"}</p>
                        <p className="mt-1 text-sm font-bold text-emerald-700">{row.employee_name || "-"} · {dateLabel(row.start_date)} → {dateLabel(row.end_date || row.start_date)}</p>
                        {row.reason && <p className="mt-2 text-sm font-semibold text-emerald-800">{row.reason}</p>}
                      </div>
                      <span className="rounded-xl bg-white px-3 py-1 text-xs font-black text-emerald-700">{row.status || "open"}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button type="button" disabled={props.saving} onClick={() => props.decideAbsence(row, false)} className="rounded-2xl bg-white py-3 font-black text-red-600">Ablehnen</button>
                      <button type="button" disabled={props.saving} onClick={() => props.decideAbsence(row, true)} className="rounded-2xl bg-green-600 py-3 font-black text-white">Genehmigen</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Material erledigen</h2>
              <div className="mt-4 space-y-4">
                {openMaterials.length === 0 && <EmptyState text="Keine offenen Materialmeldungen." />}
                {openMaterials.map((report) => (
                  <div key={report.id} className="rounded-[24px] bg-orange-50 p-4 border border-orange-100">
                    <p className="text-xl font-black text-orange-950">{report.material_name || report.product_name || "Material"}</p>
                    <p className="mt-1 text-sm font-bold text-orange-700">{report.employee_name || "-"} · {report.site || report.work_site_name || "Objekt"} · Menge {report.quantity_requested || 1}</p>
                    {report.notes && <p className="mt-2 text-sm font-semibold text-orange-800">{report.notes}</p>}
                    <button type="button" disabled={props.saving} onClick={() => props.resolveMaterialReport(report)} className="mt-4 w-full rounded-2xl bg-white py-3 font-black text-orange-700">Erledigt markieren</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Qualitätsnachweise prüfen</h2>
              <div className="mt-4 space-y-4">
                {openQualityReports.length === 0 && <EmptyState text="Keine offenen Qualitätsnachweise." />}
                {openQualityReports.map((report) => (
                  <div key={report.id} className="rounded-[24px] bg-blue-50 p-4 border border-blue-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-black text-blue-950">{report.site || report.title || "Qualitätsnachweis"}</p>
                        <p className="mt-1 text-sm font-bold text-blue-700">{report.employee_name || "-"} · Checkliste {Number(report.passed_items || 0)}/{Number(report.total_items || 0)}</p>
                        {report.notes && <p className="mt-2 text-sm font-semibold text-blue-800">{report.notes}</p>}
                      </div>
                      {report.photo_url && <a href={report.photo_url} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700">Foto</a>}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button type="button" disabled={props.saving} onClick={() => props.reviewQualityReport(report, false)} className="rounded-2xl bg-white py-3 font-black text-red-600">Nacharbeit</button>
                      <button type="button" disabled={props.saving} onClick={() => props.reviewQualityReport(report, true)} className="rounded-2xl bg-blue-600 py-3 font-black text-white">Geprüft</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {props.tab === "material" && (
          <div className="space-y-4">
            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Material objektbezogen anlegen</h2>
              <select value={props.selectedSiteId} onChange={(e) => props.setSelectedSiteId(e.target.value)} className="mt-4 w-full rounded-2xl bg-slate-50 px-4 py-4 text-lg font-bold outline-none">
                <option value="">Objekt auswählen</option>
                {props.data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
              <input value={props.materialName} onChange={(e) => props.setMaterialName(e.target.value)} placeholder="Materialname" className="mt-3 w-full rounded-2xl bg-slate-50 px-4 py-4 text-lg font-bold outline-none" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <input value={props.materialCategory} onChange={(e) => props.setMaterialCategory(e.target.value)} placeholder="Gruppe" className="rounded-2xl bg-slate-50 px-4 py-4 font-bold outline-none" />
                <input value={props.materialUnit} onChange={(e) => props.setMaterialUnit(e.target.value)} placeholder="Einheit" className="rounded-2xl bg-slate-50 px-4 py-4 font-bold outline-none" />
              </div>
              <button type="button" disabled={props.saving} onClick={props.createMaterial} className="mt-4 w-full rounded-2xl bg-blue-600 py-4 font-black text-white">+ Material anlegen</button>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">{selectedSite ? selectedSite.name : "Alle Materialien"}</h2>
              <p className="mt-1 text-sm font-bold text-slate-400">{objectMaterials.length} Artikel</p>
              <div className="mt-4 space-y-3">
                {objectMaterials.length === 0 && <EmptyState text="Für dieses Objekt sind noch keine Materialien angelegt." />}
                {objectMaterials.slice(0, 30).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-100 p-4">
                    <p className="font-black">{item.name}</p>
                    <p className="text-sm font-bold text-slate-400">{item.category || "Artikel ohne Gruppe"} · {item.unit || "Stk."}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] bg-white p-4 shadow-sm border border-slate-100">
              <h2 className="text-xl font-black">Materialmeldungen</h2>
              <div className="mt-4 space-y-3">
                {materialReports.length === 0 && <EmptyState text="Keine Materialmeldungen vorhanden." />}
                {materialReports.map((report) => (
                  <div key={report.id} className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{report.material_name || report.product_name || "Material"}</p>
                        <p className="text-sm font-bold text-orange-700">{report.employee_name || "-"} · {report.site || report.work_site_name || "Objekt"} · {report.quantity_requested || 1}</p>
                        {report.notes && <p className="mt-2 text-sm font-semibold text-orange-800">{report.notes}</p>}
                      </div>
                      <span className={`rounded-xl px-3 py-1 text-xs font-black ${String(report.status || "").toLowerCase() === "done" ? "bg-green-100 text-green-700" : "bg-white text-orange-700"}`}>{String(report.status || "open")}</span>
                    </div>
                    {String(report.status || "").toLowerCase() !== "done" && (
                      <button type="button" disabled={props.saving} onClick={() => props.resolveMaterialReport(report)} className="mt-3 w-full rounded-2xl bg-white py-3 font-black text-orange-700">Erledigt markieren</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </SimplePage>
  );
}

function BottomNav({ activeTab, openTab, unreadChatCount, adminTodoCount, role }: { activeTab: Tab; openTab: (tab: Tab) => void; unreadChatCount: number; adminTodoCount: number; role: string }) {
  const isAdminRole = role === "admin" || role === "objektleiter";
  const items = isAdminRole
    ? [
        { tab: "home" as Tab, icon: "⌂", label: "Home" },
        { tab: "admin" as Tab, icon: "▣", label: "Admin" },
        { tab: "schedule" as Tab, icon: "▦", label: "Kalender" },
        { tab: "search" as Tab, icon: "⌕", label: "Suche" },
        { tab: "chat" as Tab, icon: "●", label: "Chat" },
      ]
    : [
        { tab: "home" as Tab, icon: "⌂", label: "Home" },
        { tab: "tasks" as Tab, icon: "▣", label: "Inbox" },
        { tab: "schedule" as Tab, icon: "▦", label: "Kalender" },
        { tab: "search" as Tab, icon: "⌕", label: "Suche" },
        { tab: "chat" as Tab, icon: "●", label: "Chat" },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 mx-auto grid max-w-md grid-cols-5 border-t border-slate-100 bg-white px-2 pb-3 pt-2 text-[11px] font-bold text-slate-400">
      {items.map((item) => (
        <button key={item.tab} type="button" onClick={() => openTab(item.tab)} className={`relative rounded-2xl py-1 ${activeTab === item.tab ? "text-blue-600" : ""}`}>
          <span className="block text-2xl leading-none">{item.icon}</span>
          <span>{item.label}</span>
          {item.tab === "admin" && adminTodoCount > 0 && <span className="absolute right-4 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">{adminTodoCount > 9 ? "9+" : adminTodoCount}</span>}
          {item.tab === "chat" && unreadChatCount > 0 && <span className="absolute right-4 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">{unreadChatCount > 9 ? "9+" : unreadChatCount}</span>}
        </button>
      ))}
    </nav>
  );
}

function Avatar({ name, src, large = false }: { name: string; src?: string; large?: boolean }) {
  const size = large ? "h-20 w-20 text-2xl" : "h-11 w-11 text-sm";
  return <div className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 font-black text-white`}>{src ? <img src={src} alt="Profilbild" className="h-full w-full object-cover" /> : initials(name)}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-[22px] bg-white p-8 text-center text-sm font-bold text-slate-400 shadow-sm border border-slate-100">{text}</div>;
}

function StatusBox({ color, title, count }: { color: "red" | "orange" | "green"; title: string; count: number }) {
  const colors = {
    red: "border-red-200 bg-red-50 text-red-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    green: "border-green-200 bg-green-50 text-green-700",
  };
  return <div className={`rounded-2xl border px-4 py-3 font-black ${colors[color]}`}>{title} <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs">{count}</span></div>;
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}

function entryLabel(action: TimeEntry["action"]) {
  if (action === "start") return "Eingestempelt";
  if (action === "break_start") return "Pause gestartet";
  if (action === "break_end") return "Pause beendet";
  return "Ausgestempelt";
}
