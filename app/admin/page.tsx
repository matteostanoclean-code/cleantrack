"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type EntryAction = "start" | "break_start" | "break_end" | "end";

type Entry = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  work_site_id: string | null;
  work_site_name: string;
  action: EntryAction | string;
  created_at: string;
  auto_clock_out: boolean | null;
  planned_minutes?: number | null;
  overtime_minutes?: number | null;
  correction_reason?: string | null;
  corrected_by?: string | null;
  corrected_at?: string | null;
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
  planned_minutes?: number | null;
  work_site_id?: string | null;
};

type AdminNotification = {
  id: string;
  title: string;
  message: string;
  employee_name: string | null;
  work_site_name: string | null;
  read: boolean;
  status: string | null;
  notification_type: string | null;
  overtime_minutes: number | null;
  created_at: string;
};

type WorkSite = {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_m: number | null;
  active?: boolean | null;
};

type EmployeeProfile = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  role: string | null;
  phone: string | null;
  active?: boolean | null;
  avatar_url?: string | null;
  hourly_rate?: number | null;
  employer_cost_factor?: number | null;
};

type ChatMessageDb = {
  id: string;
  employee_name: string;
  sender_role: string;
  sender_name: string | null;
  message: string;
  read_by_admin: boolean | null;
  read_by_employee: boolean | null;
  created_at: string;
};

type AbsenceRequest = {
  id: string;
  employee_name: string;
  request_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string | null;
  created_at: string;
};

type AuditLog = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  message: string | null;
  created_by: string | null;
  created_at: string;
};

type TaskTemplate = {
  id: string;
  work_site_id: string | null;
  work_site_name: string | null;
  title: string;
  active: boolean | null;
};

type AdminTab =
  | "dashboard"
  | "planung"
  | "objekte"
  | "einladen"
  | "mitarbeiter"
  | "stempelungen"
  | "auswertung"
  | "abwesenheit"
  | "kosten"
  | "chat"
  | "meldungen"
  | "audit";

const actionOptions: { value: EntryAction; label: string }[] = [
  { value: "start", label: "Eingestempelt" },
  { value: "break_start", label: "Pause gestartet" },
  { value: "break_end", label: "Pause beendet" },
  { value: "end", label: "Ausgestempelt" },
];

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function localDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function toDateTimeInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return localDateTimeValue();
  return localDateTimeValue(date);
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000 / 60));
}

export default function AdminPage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("Admin");
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [workSites, setWorkSites] = useState<WorkSite[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageDb[]>([]);
  const [absenceRequests, setAbsenceRequests] = useState<AbsenceRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedISO = selectedDate.toISOString().split("T")[0];

  const [site, setSite] = useState("");
  const [employee, setEmployee] = useState("");
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("18:00");
  const [maxMinutes, setMaxMinutes] = useState("60");
  const [taskTitles, setTaskTitles] = useState<string[]>([""]);
  const [planningMessage, setPlanningMessage] = useState("");

  const [editingTaskId, setEditingTaskId] = useState("");
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskSite, setEditTaskSite] = useState("");
  const [editTaskEmployee, setEditTaskEmployee] = useState("");
  const [editTaskDate, setEditTaskDate] = useState(todayIso());
  const [editTaskStart, setEditTaskStart] = useState("08:00");
  const [editTaskEnd, setEditTaskEnd] = useState("09:00");
  const [editTaskMinutes, setEditTaskMinutes] = useState("60");

  const [recurringWeeks, setRecurringWeeks] = useState("4");
  const [recurringEvery, setRecurringEvery] = useState("1");

  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteNotes, setNewSiteNotes] = useState("");
  const [newSiteLat, setNewSiteLat] = useState("");
  const [newSiteLng, setNewSiteLng] = useState("");
  const [newSiteRadius, setNewSiteRadius] = useState("100");
  const [siteMessage, setSiteMessage] = useState("");
  const [siteGeocoding, setSiteGeocoding] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState("");

  const [templateSiteId, setTemplateSiteId] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteWhatsappLink, setInviteWhatsappLink] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const [resetEmployeeId, setResetEmployeeId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  const [employeeEditMessage, setEmployeeEditMessage] = useState("");
  const [editEmployeeName, setEditEmployeeName] = useState("");
  const [editEmployeeEmail, setEditEmployeeEmail] = useState("");
  const [editEmployeePhone, setEditEmployeePhone] = useState("");
  const [editEmployeeRole, setEditEmployeeRole] = useState("employee");
  const [editEmployeeActive, setEditEmployeeActive] = useState(true);
  const [editEmployeeHourlyRate, setEditEmployeeHourlyRate] = useState("0");
  const [editEmployeeFactor, setEditEmployeeFactor] = useState("1.25");

  const [correctionEmployee, setCorrectionEmployee] = useState("");
  const [correctionSiteId, setCorrectionSiteId] = useState("");
  const [correctionAction, setCorrectionAction] = useState<EntryAction>("start");
  const [correctionTime, setCorrectionTime] = useState(localDateTimeValue());
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [editingEntryId, setEditingEntryId] = useState("");

  const [reportMonth, setReportMonth] = useState(todayIso().slice(0, 7));

  const [chatText, setChatText] = useState("");
  const [selectedChatEmployee, setSelectedChatEmployee] = useState("");
  const [chatError, setChatError] = useState("");

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (!allowed || activeTab !== "chat") return;
    loadAdminChatMessages(selectedChatEmployee);
    const timer = setInterval(() => loadAdminChatMessages(selectedChatEmployee), 5000);
    return () => clearInterval(timer);
  }, [allowed, activeTab, selectedChatEmployee]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function checkAdmin() {
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      const { data: profile } = await supabase
        .from("employee_profiles")
        .select("name, role")
        .eq("auth_user_id", data.user.id)
        .single();

      if (profile?.role === "admin") {
        setAllowed(true);
        setAdminName(profile.name || "Admin");
        await loadData();
      }
    }

    setLoading(false);
  }

  async function loadData() {
    await Promise.all([
      loadEntries(),
      loadTasks(),
      loadNotifications(),
      loadWorkSites(),
      loadEmployeeProfiles(),
      loadAbsenceRequests(),
      loadTaskTemplates(),
      loadAuditLogs(),
    ]);
  }

  async function logAudit(action: string, entity: string, entityId: string | null, message: string) {
    await supabase.from("audit_logs").insert([
      {
        action,
        entity,
        entity_id: entityId,
        message,
        created_by: adminName,
      },
    ]);
    await loadAuditLogs();
  }

  async function loadEntries() {
    const { data } = await supabase
      .from("time_entries")
      .select(
        "id, employee_id, employee_name, work_site_id, work_site_name, action, created_at, auto_clock_out, planned_minutes, overtime_minutes, correction_reason, corrected_by, corrected_at"
      )
      .order("created_at", { ascending: false })
      .limit(600);

    setEntries((data || []) as Entry[]);
  }

  async function loadTasks() {
    const { data } = await supabase
      .from("tasks")
      .select(
        "id, title, site, employee_name, task_date, done, start_time, end_time, max_minutes, planned_minutes, work_site_id"
      )
      .order("task_date", { ascending: true })
      .limit(1000);

    setTasks((data || []) as Task[]);
  }

  async function loadNotifications() {
    const { data } = await supabase
      .from("admin_notifications")
      .select(
        "id, title, message, employee_name, work_site_name, read, status, notification_type, overtime_minutes, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    setNotifications((data || []) as AdminNotification[]);
  }

  async function loadWorkSites() {
    const { data } = await supabase
      .from("work_sites")
      .select("id, name, address, notes, latitude, longitude, allowed_radius_m, active")
      .order("name");

    setWorkSites((data || []) as WorkSite[]);
  }

  async function loadEmployeeProfiles() {
    const { data } = await supabase
      .from("employee_profiles")
      .select(
        "id, auth_user_id, name, email, role, phone, active, avatar_url, hourly_rate, employer_cost_factor"
      )
      .order("name");

    setEmployeeProfiles((data || []) as EmployeeProfile[]);
  }

  async function loadAbsenceRequests() {
    const { data } = await supabase
      .from("absence_requests")
      .select("id, employee_name, request_type, start_date, end_date, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    setAbsenceRequests((data || []) as AbsenceRequest[]);
  }

  async function loadAuditLogs() {
    const { data } = await supabase
      .from("audit_logs")
      .select("id, action, entity, entity_id, message, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    setAuditLogs((data || []) as AuditLog[]);
  }

  async function loadTaskTemplates() {
    const { data } = await supabase
      .from("task_templates")
      .select("id, work_site_id, work_site_name, title, active")
      .order("title");

    setTaskTemplates((data || []) as TaskTemplate[]);
  }

  const activeEmployees = employeeProfiles.filter((profile) => profile.active !== false);
  const activeSites = workSites.filter((item) => item.active !== false);
  const doneTasks = tasks.filter((task) => task.done).length;
  const openTasks = tasks.filter((task) => !task.done).length;
  const openNotifications = notifications.filter((note) => !note.read).length;

  const employeesFromEntries = Array.from(
    new Set(entries.map((entry) => entry.employee_name).filter(Boolean))
  );

  const allEmployeeNames = Array.from(
    new Set([...activeEmployees.map((profile) => profile.name), ...employeesFromEntries].filter(Boolean))
  );

  const monthlyStats = useMemo(() => {
    const monthEntries = entries
      .filter((entry) => entry.created_at.slice(0, 7) === reportMonth)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const byEmployee = new Map<string, { worked: number; pause: number; overtime: number; cost: number }>();

    for (const name of allEmployeeNames) {
      const employeeEntries = monthEntries.filter((entry) => entry.employee_name === name);
      const worked = calculateWorkedMinutes(employeeEntries);
      const pause = calculatePauseMinutes(employeeEntries);
      const overtime = employeeEntries.reduce((sum, entry) => sum + (entry.overtime_minutes || 0), 0);
      const profile = employeeProfiles.find((item) => item.name === name);
      const hourly = Number(profile?.hourly_rate || 0);
      const factor = Number(profile?.employer_cost_factor || 1.25);
      byEmployee.set(name, {
        worked,
        pause,
        overtime,
        cost: (worked / 60) * hourly * factor,
      });
    }

    return byEmployee;
  }, [entries, reportMonth, employeeProfiles, allEmployeeNames]);

  function weekDays() {
    const monday = new Date(selectedDate);
    const day = monday.getDay() === 0 ? 7 : monday.getDay();
    monday.setDate(monday.getDate() - day + 1);

    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }

  function changeWeek(days: number) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    setSelectedDate(next);
  }

  function tasksForDate(date: Date) {
    const iso = date.toISOString().split("T")[0];
    return tasks.filter((task) => task.task_date === iso);
  }

  function actionText(action: string) {
    if (action === "start") return "Eingestempelt";
    if (action === "break_start") return "Pause gestartet";
    if (action === "break_end") return "Pause beendet";
    if (action === "end") return "Ausgestempelt";
    return action;
  }

  function actionBadge(action: string) {
    if (action === "start" || action === "break_end") return "bg-green-100 text-green-700";
    if (action === "break_start") return "bg-purple-100 text-purple-700";
    if (action === "end") return "bg-gray-200 text-gray-700";
    return "bg-gray-100 text-gray-600";
  }

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  function calculateWorkedMinutes(employeeEntries: Entry[]) {
    let total = 0;
    let lastStart: Date | null = null;

    employeeEntries
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((entry) => {
        const time = new Date(entry.created_at);
        if (entry.action === "start" || entry.action === "break_end") lastStart = time;
        if ((entry.action === "break_start" || entry.action === "end") && lastStart) {
          total += minutesBetween(lastStart, time);
          lastStart = null;
        }
      });

    return total;
  }

  function calculatePauseMinutes(employeeEntries: Entry[]) {
    let total = 0;
    let pauseStart: Date | null = null;

    employeeEntries
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((entry) => {
        const time = new Date(entry.created_at);
        if (entry.action === "break_start") pauseStart = time;
        if (entry.action === "break_end" && pauseStart) {
          total += minutesBetween(pauseStart, time);
          pauseStart = null;
        }
      });

    return total;
  }

  async function sendPush(employeeName: string, title: string, message: string, url = "/mitarbeiter") {
    const token = await getAccessToken();
    if (!token) return { error: "Admin-Sitzung fehlt." };

    const response = await fetch("/api/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ employeeName, title, message, url }),
    });

    const text = await response.text();
    try {
      return JSON.parse(text) as { error?: string; sent?: number; failed?: number };
    } catch {
      return { error: `Push API antwortet nicht als JSON. Status ${response.status}` };
    }
  }

  async function createEmployeeInvite() {
    setInviteMessage("");
    setInviteLink("");
    setInviteWhatsappLink("");

    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteMessage("Bitte Name und E-Mail eintragen.");
      return;
    }

    setInviteLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setInviteMessage("Admin-Sitzung fehlt. Bitte neu einloggen.");
        setInviteLoading(false);
        return;
      }

      const response = await fetch("/api/admin/create-employee-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          phone: invitePhone.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setInviteMessage(result.error || "Einladung konnte nicht erstellt werden.");
        setInviteLoading(false);
        return;
      }

      setInviteLink(result.inviteLink || "");
      setInviteWhatsappLink(result.whatsappLink || "");
      setInviteMessage("Einladung wurde erstellt. Du kannst den Link jetzt versenden.");
      setInviteName("");
      setInviteEmail("");
      setInvitePhone("");
      await logAudit("invite_created", "employee_invites", null, `Einladung für ${result.email || inviteEmail} erstellt.`);
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : "Einladung konnte nicht erstellt werden.");
    }

    setInviteLoading(false);
  }

  async function resetEmployeePassword() {
    setResetMessage("");

    const employeeProfile = employeeProfiles.find((profile) => profile.id === resetEmployeeId);
    if (!employeeProfile?.auth_user_id) {
      setResetMessage("Bitte Mitarbeiter auswählen. Auth-ID fehlt.");
      return;
    }

    if (resetPassword.length < 6) {
      setResetMessage("Das neue Passwort muss mindestens 6 Zeichen haben.");
      return;
    }

    setResetLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setResetMessage("Admin-Sitzung fehlt. Bitte neu einloggen.");
        setResetLoading(false);
        return;
      }

      const response = await fetch("/api/admin/reset-employee-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ authUserId: employeeProfile.auth_user_id, password: resetPassword }),
      });

      const result = await response.json();
      if (!response.ok) {
        setResetMessage(result.error || "Passwort konnte nicht geändert werden.");
        setResetLoading(false);
        return;
      }

      setResetPassword("");
      setResetMessage(result.message || "Passwort wurde geändert.");
      await logAudit("password_reset", "employee_profiles", employeeProfile.id, `${employeeProfile.name}: Passwort zurückgesetzt.`);
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : "Unbekannter Fehler beim Passwort-Reset.");
    }

    setResetLoading(false);
  }

  function addTaskField() {
    setTaskTitles([...taskTitles, ""]);
  }

  function updateTaskField(index: number, value: string) {
    const copy = [...taskTitles];
    copy[index] = value;
    setTaskTitles(copy);
  }

  function removeTaskField(index: number) {
    setTaskTitles(taskTitles.filter((_, i) => i !== index));
  }

  async function createShift() {
    setPlanningMessage("");
    const cleanTasks = taskTitles.filter((task) => task.trim());

    if (!site.trim() || !employee.trim() || cleanTasks.length === 0) {
      setPlanningMessage("Bitte Objekt, Mitarbeiter und mindestens eine Aufgabe eintragen.");
      return;
    }

    const siteItem = workSites.find((item) => item.name === site);
    const rows = cleanTasks.map((task) => ({
      title: task.trim(),
      site: site.trim(),
      employee_name: employee.trim(),
      task_date: selectedISO,
      done: false,
      start_time: startTime,
      end_time: endTime,
      max_minutes: Number(maxMinutes),
      planned_minutes: Number(maxMinutes),
      work_site_id: siteItem?.id || null,
    }));

    const { error } = await supabase.from("tasks").insert(rows);

    if (error) {
      setPlanningMessage(error.message || "Einsatz konnte nicht gespeichert werden.");
      return;
    }

    await sendPush(
      employee.trim(),
      "Neuer Einsatz geplant",
      `${site} am ${new Date(selectedISO).toLocaleDateString("de-DE")} von ${startTime} bis ${endTime}`,
      "/mitarbeiter?tab=schedule"
    );
    await logAudit("task_created", "tasks", null, `${employee}: Einsatz ${site} am ${selectedISO} erstellt.`);
    setTaskTitles([""]);
    setPlanningMessage("Einsatz wurde gespeichert und Push wurde gesendet.");
    await loadTasks();
  }

  async function createRecurringShifts() {
    setPlanningMessage("");
    const cleanTasks = taskTitles.filter((task) => task.trim());
    if (!site.trim() || !employee.trim() || cleanTasks.length === 0) {
      setPlanningMessage("Bitte Objekt, Mitarbeiter und Aufgaben eintragen.");
      return;
    }

    const weeks = Math.max(1, Number(recurringWeeks) || 1);
    const every = Math.max(1, Number(recurringEvery) || 1);
    const siteItem = workSites.find((item) => item.name === site);
    const rows = [];

    for (let i = 0; i < weeks; i += every) {
      const date = new Date(selectedDate);
      date.setDate(selectedDate.getDate() + i * 7);
      const iso = date.toISOString().split("T")[0];
      for (const task of cleanTasks) {
        rows.push({
          title: task.trim(),
          site: site.trim(),
          employee_name: employee.trim(),
          task_date: iso,
          done: false,
          start_time: startTime,
          end_time: endTime,
          max_minutes: Number(maxMinutes),
          planned_minutes: Number(maxMinutes),
          work_site_id: siteItem?.id || null,
        });
      }
    }

    const { error } = await supabase.from("tasks").insert(rows);
    if (error) {
      setPlanningMessage(error.message || "Serie konnte nicht gespeichert werden.");
      return;
    }

    await sendPush(employee.trim(), "Neue Einsatzserie geplant", `${site}: ${rows.length} Aufgaben wurden geplant.`, "/mitarbeiter?tab=schedule");
    await logAudit("recurring_tasks_created", "tasks", null, `${rows.length} Serien-Aufgaben für ${employee} erstellt.`);
    setPlanningMessage(`${rows.length} Serien-Aufgaben wurden gespeichert.`);
    await loadTasks();
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id);
    setEditTaskTitle(task.title);
    setEditTaskSite(task.site || "");
    setEditTaskEmployee(task.employee_name || "");
    setEditTaskDate(task.task_date);
    setEditTaskStart(task.start_time || "08:00");
    setEditTaskEnd(task.end_time || "09:00");
    setEditTaskMinutes(String(task.max_minutes || task.planned_minutes || 60));
    setPlanningMessage("");
  }

  async function updateTask() {
    setPlanningMessage("");
    if (!editingTaskId) return;
    if (!editTaskTitle.trim() || !editTaskSite.trim() || !editTaskEmployee.trim()) {
      setPlanningMessage("Bitte Aufgabe, Objekt und Mitarbeiter eintragen.");
      return;
    }

    const siteItem = workSites.find((item) => item.name === editTaskSite);
    const { error } = await supabase
      .from("tasks")
      .update({
        title: editTaskTitle.trim(),
        site: editTaskSite.trim(),
        employee_name: editTaskEmployee.trim(),
        task_date: editTaskDate,
        start_time: editTaskStart,
        end_time: editTaskEnd,
        max_minutes: Number(editTaskMinutes),
        planned_minutes: Number(editTaskMinutes),
        work_site_id: siteItem?.id || null,
      })
      .eq("id", editingTaskId);

    if (error) {
      setPlanningMessage(error.message || "Aufgabe konnte nicht geändert werden.");
      return;
    }

    await sendPush(editTaskEmployee.trim(), "Einsatz wurde geändert", `${editTaskSite}: ${editTaskDate} ${editTaskStart}-${editTaskEnd}`, "/mitarbeiter?tab=schedule");
    await logAudit("task_updated", "tasks", editingTaskId, `${editTaskEmployee}: Einsatz ${editTaskTitle} geändert.`);
    setEditingTaskId("");
    setPlanningMessage("Einsatz wurde geändert und Push wurde gesendet.");
    await loadTasks();
  }

  async function deleteTask(task: Task) {
    const ok = window.confirm(`Einsatz wirklich löschen?\n${task.title}`);
    if (!ok) return;

    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      setPlanningMessage(error.message || "Einsatz konnte nicht gelöscht werden.");
      return;
    }

    if (task.employee_name) {
      await sendPush(task.employee_name, "Einsatz wurde gelöscht", `${task.site || "Objekt"}: ${task.task_date}`, "/mitarbeiter?tab=schedule");
    }
    await logAudit("task_deleted", "tasks", task.id, `${task.employee_name || "Mitarbeiter"}: ${task.title} gelöscht.`);
    setPlanningMessage("Einsatz wurde gelöscht.");
    await loadTasks();
  }

  async function geocodeAddress() {
    setSiteMessage("");
    if (!newSiteAddress.trim()) {
      setSiteMessage("Bitte zuerst eine Adresse eintragen.");
      return;
    }

    setSiteGeocoding(true);
    try {
      const response = await fetch(`/api/geocode?address=${encodeURIComponent(newSiteAddress.trim())}`);
      const result = await response.json();

      if (!response.ok) {
        setSiteMessage(result.error || "Adresse konnte nicht gefunden werden.");
        setSiteGeocoding(false);
        return;
      }

      setNewSiteLat(String(result.latitude));
      setNewSiteLng(String(result.longitude));
      setSiteMessage(`GPS gefunden: ${result.latitude}, ${result.longitude}`);
    } catch (error) {
      setSiteMessage(error instanceof Error ? error.message : "GPS konnte nicht ermittelt werden.");
    }
    setSiteGeocoding(false);
  }

  function clearSiteForm() {
    setEditingSiteId("");
    setNewSiteName("");
    setNewSiteAddress("");
    setNewSiteNotes("");
    setNewSiteLat("");
    setNewSiteLng("");
    setNewSiteRadius("100");
  }

  function startEditSite(item: WorkSite) {
    setEditingSiteId(item.id);
    setNewSiteName(item.name || "");
    setNewSiteAddress(item.address || "");
    setNewSiteNotes(item.notes || "");
    setNewSiteLat(item.latitude === null || item.latitude === undefined ? "" : String(item.latitude));
    setNewSiteLng(item.longitude === null || item.longitude === undefined ? "" : String(item.longitude));
    setNewSiteRadius(String(item.allowed_radius_m || 100));
    setSiteMessage("Bearbeitung geladen.");
  }

  async function saveWorkSite() {
    setSiteMessage("");
    if (!newSiteName.trim()) {
      setSiteMessage("Bitte Objektname eintragen.");
      return;
    }
    if (!newSiteAddress.trim()) {
      setSiteMessage("Bitte Adresse eintragen.");
      return;
    }

    const latitude = newSiteLat.trim() ? Number(newSiteLat) : null;
    const longitude = newSiteLng.trim() ? Number(newSiteLng) : null;
    const allowedRadius = newSiteRadius.trim() ? Number(newSiteRadius) : 100;

    if (latitude === null || longitude === null) {
      setSiteMessage("Bitte zuerst GPS aus Adresse ermitteln.");
      return;
    }

    if (Number.isNaN(latitude) || Number.isNaN(longitude) || Number.isNaN(allowedRadius) || allowedRadius <= 0) {
      setSiteMessage("GPS oder Radius ist ungültig.");
      return;
    }

    const payload = {
      name: newSiteName.trim(),
      address: newSiteAddress.trim(),
      notes: newSiteNotes.trim() || null,
      latitude,
      longitude,
      allowed_radius_m: allowedRadius,
      active: true,
    };

    const query = editingSiteId
      ? supabase.from("work_sites").update(payload).eq("id", editingSiteId)
      : supabase.from("work_sites").insert([payload]);

    const { error } = await query;
    if (error) {
      setSiteMessage(error.message || "Objekt konnte nicht gespeichert werden.");
      return;
    }

    await logAudit(editingSiteId ? "work_site_updated" : "work_site_created", "work_sites", editingSiteId || null, `${payload.name} gespeichert.`);
    setSiteMessage(editingSiteId ? "Objekt wurde geändert." : "Objekt wurde gespeichert.");
    clearSiteForm();
    await loadWorkSites();
  }

  async function deactivateWorkSite(id: string, name: string) {
    const ok = window.confirm("Objekt deaktivieren? Es bleibt in alten Daten erhalten.");
    if (!ok) return;

    const { error } = await supabase.from("work_sites").update({ active: false }).eq("id", id);
    if (error) {
      setSiteMessage(error.message || "Objekt konnte nicht deaktiviert werden.");
      return;
    }

    await logAudit("work_site_deactivated", "work_sites", id, `${name} deaktiviert.`);
    setSiteMessage("Objekt wurde deaktiviert.");
    await loadWorkSites();
  }

  async function createTemplate() {
    setTemplateMessage("");
    const siteItem = workSites.find((item) => item.id === templateSiteId);
    if (!siteItem || !templateTitle.trim()) {
      setTemplateMessage("Bitte Objekt und Aufgabe eintragen.");
      return;
    }

    const { error } = await supabase.from("task_templates").insert([
      {
        work_site_id: siteItem.id,
        work_site_name: siteItem.name,
        title: templateTitle.trim(),
        active: true,
      },
    ]);

    if (error) {
      setTemplateMessage(error.message || "Vorlage konnte nicht gespeichert werden.");
      return;
    }

    setTemplateTitle("");
    setTemplateMessage("Vorlage wurde gespeichert.");
    await loadTaskTemplates();
  }

  function useTemplatesForSelectedSite() {
    const siteItem = workSites.find((item) => item.name === site);
    if (!siteItem) {
      setPlanningMessage("Bitte zuerst Objekt auswählen.");
      return;
    }

    const templates = taskTemplates.filter((item) => item.work_site_id === siteItem.id && item.active !== false);
    if (templates.length === 0) {
      setPlanningMessage("Für dieses Objekt gibt es keine Vorlagen.");
      return;
    }

    setTaskTitles(templates.map((item) => item.title));
    setPlanningMessage("Aufgaben-Vorlagen wurden übernommen.");
  }

  function startEditEmployee(profile: EmployeeProfile) {
    setEditingEmployeeId(profile.id);
    setEditEmployeeName(profile.name || "");
    setEditEmployeeEmail(profile.email || "");
    setEditEmployeePhone(profile.phone || "");
    setEditEmployeeRole(profile.role || "employee");
    setEditEmployeeActive(profile.active !== false);
    setEditEmployeeHourlyRate(String(profile.hourly_rate || 0));
    setEditEmployeeFactor(String(profile.employer_cost_factor || 1.25));
    setEmployeeEditMessage("");
  }

  async function updateEmployee() {
    setEmployeeEditMessage("");
    if (!editingEmployeeId || !editEmployeeName.trim()) {
      setEmployeeEditMessage("Bitte Mitarbeiter auswählen und Namen eintragen.");
      return;
    }

    const { error } = await supabase
      .from("employee_profiles")
      .update({
        name: editEmployeeName.trim(),
        email: editEmployeeEmail.trim() || null,
        phone: editEmployeePhone.trim() || null,
        role: editEmployeeRole,
        active: editEmployeeActive,
        hourly_rate: Number(editEmployeeHourlyRate) || 0,
        employer_cost_factor: Number(editEmployeeFactor) || 1.25,
      })
      .eq("id", editingEmployeeId);

    if (error) {
      setEmployeeEditMessage(error.message || "Mitarbeiter konnte nicht gespeichert werden.");
      return;
    }

    await logAudit("employee_updated", "employee_profiles", editingEmployeeId, `${editEmployeeName} geändert.`);
    setEmployeeEditMessage("Mitarbeiter wurde gespeichert.");
    setEditingEmployeeId("");
    await loadEmployeeProfiles();
  }

  async function saveCorrection() {
    setCorrectionMessage("");
    if (!correctionEmployee || !correctionSiteId || !correctionReason.trim()) {
      setCorrectionMessage("Bitte Mitarbeiter, Objekt und Grund eintragen.");
      return;
    }

    const siteItem = workSites.find((item) => item.id === correctionSiteId);
    const employeeProfile = employeeProfiles.find((item) => item.name === correctionEmployee);
    const payload = {
      employee_id: employeeProfile?.id || null,
      employee_name: correctionEmployee,
      work_site_id: siteItem?.id || null,
      work_site_name: siteItem?.name || "Korrektur",
      action: correctionAction,
      success: true,
      auto_clock_out: false,
      created_at: new Date(correctionTime).toISOString(),
      correction_reason: correctionReason.trim(),
      corrected_by: adminName,
      corrected_at: new Date().toISOString(),
    };

    const query = editingEntryId
      ? supabase.from("time_entries").update(payload).eq("id", editingEntryId)
      : supabase.from("time_entries").insert([payload]);

    const { error } = await query;
    if (error) {
      setCorrectionMessage(error.message || "Korrektur konnte nicht gespeichert werden.");
      return;
    }

    await logAudit(editingEntryId ? "time_entry_updated" : "time_entry_created", "time_entries", editingEntryId || null, `${correctionEmployee}: ${actionText(correctionAction)} korrigiert.`);
    setCorrectionMessage(editingEntryId ? "Stempelung wurde geändert." : "Stempelung wurde hinzugefügt.");
    setEditingEntryId("");
    setCorrectionReason("");
    await loadEntries();
  }

  function startEditEntry(entry: Entry) {
    setEditingEntryId(entry.id);
    setCorrectionEmployee(entry.employee_name);
    const siteItem = workSites.find((item) => item.name === entry.work_site_name || item.id === entry.work_site_id);
    setCorrectionSiteId(siteItem?.id || "");
    setCorrectionAction((entry.action as EntryAction) || "start");
    setCorrectionTime(toDateTimeInputValue(entry.created_at));
    setCorrectionReason(entry.correction_reason || "Korrektur durch Admin");
    setCorrectionMessage("Stempelung zur Bearbeitung geladen.");
  }

  async function deleteEntry(entry: Entry) {
    const ok = window.confirm("Stempelung wirklich löschen?");
    if (!ok) return;

    const { error } = await supabase.from("time_entries").delete().eq("id", entry.id);
    if (error) {
      setCorrectionMessage(error.message || "Stempelung konnte nicht gelöscht werden.");
      return;
    }

    await logAudit("time_entry_deleted", "time_entries", entry.id, `${entry.employee_name}: ${actionText(entry.action)} gelöscht.`);
    setCorrectionMessage("Stempelung wurde gelöscht.");
    await loadEntries();
  }

  async function decideOvertime(id: string, decision: "approved" | "rejected") {
    const note = notifications.find((item) => item.id === id);
    await supabase.from("admin_notifications").update({ status: decision, read: true }).eq("id", id);
    await loadNotifications();

    if (note?.employee_name) {
      await sendPush(
        note.employee_name,
        decision === "approved" ? "Überstunden genehmigt" : "Überstunden abgelehnt",
        decision === "approved" ? "Du kannst weiterarbeiten." : "Bitte Schicht beendet lassen.",
        "/mitarbeiter?tab=profile"
      );
    }
    await logAudit("overtime_decided", "admin_notifications", id, `${note?.employee_name || "Mitarbeiter"}: ${decision}`);
  }

  async function markNotificationAsRead(id: string) {
    await supabase.from("admin_notifications").update({ read: true }).eq("id", id);
    await loadNotifications();
  }

  async function decideAbsence(id: string, decision: "approved" | "rejected") {
    const request = absenceRequests.find((item) => item.id === id);
    await supabase.from("absence_requests").update({ status: decision }).eq("id", id);
    await loadAbsenceRequests();

    if (request?.employee_name) {
      await sendPush(
        request.employee_name,
        decision === "approved" ? "Abwesenheit genehmigt" : "Abwesenheit abgelehnt",
        `${request.request_type}: ${request.start_date} bis ${request.end_date}`,
        "/mitarbeiter?tab=profile"
      );
    }
    await logAudit("absence_decided", "absence_requests", id, `${request?.employee_name || "Mitarbeiter"}: ${decision}`);
  }

  async function loadAdminChatMessages(employeeName?: string) {
    const selectedName = employeeName || selectedChatEmployee;
    let query = supabase
      .from("chat_messages")
      .select("id, employee_name, sender_role, sender_name, message, read_by_admin, read_by_employee, created_at")
      .order("created_at", { ascending: true })
      .limit(300);

    if (selectedName) query = query.eq("employee_name", selectedName);
    const { data } = await query;
    setChatMessages((data || []) as ChatMessageDb[]);

    if (selectedName) {
      await supabase
        .from("chat_messages")
        .update({ read_by_admin: true })
        .eq("employee_name", selectedName)
        .eq("sender_role", "employee");
    }
  }

  async function sendChatMessage() {
    setChatError("");
    if (!chatText.trim()) return;
    if (!selectedChatEmployee) {
      setChatError("Bitte zuerst einen Mitarbeiter auswählen.");
      return;
    }

    const text = chatText.trim();
    setChatText("");

    const { error } = await supabase.from("chat_messages").insert([
      {
        employee_name: selectedChatEmployee,
        sender_role: "admin",
        sender_name: adminName,
        message: text,
        read_by_admin: true,
        read_by_employee: false,
      },
    ]);

    if (error) {
      setChatError(error.message || "Nachricht konnte nicht gesendet werden.");
      setChatText(text);
      return;
    }

    const push = await sendPush(selectedChatEmployee, `Neue Nachricht von ${adminName}`, text, "/mitarbeiter?tab=chat");
    if (push.error) setChatError(`Nachricht gespeichert, aber Push: ${push.error}`);
    else setChatError(`Nachricht gesendet. Push: ${push.sent ?? 0}`);
    await loadAdminChatMessages(selectedChatEmployee);
  }

  if (loading) return <main className="p-6">Lade...</main>;

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="bg-white rounded-3xl p-6">
          <h1 className="text-2xl font-bold mb-2">Kein Zugriff</h1>
          <p className="text-gray-500">Dieser Bereich ist nur für den Admin sichtbar.</p>
        </div>
      </main>
    );
  }

  const week = weekDays();
  const selectedSiteForTemplates = workSites.find((item) => item.name === site);

  return (
    <main className="min-h-screen bg-[#e3eaf2] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-72 bg-white hidden md:flex flex-col shadow-sm">
          <div className="p-6">
            <p className="text-xs text-gray-400">CleanTrack</p>
            <h1 className="text-xl font-bold">Admin</h1>
          </div>

          <nav className="p-4 space-y-2 overflow-y-auto">
            {[
              ["dashboard", "Übersicht"],
              ["planung", "Planung"],
              ["objekte", "Objekte"],
              ["einladen", "Einladen"],
              ["mitarbeiter", "Mitarbeiter"],
              ["stempelungen", "Stempelungen"],
              ["auswertung", "Zeitauswertung"],
              ["abwesenheit", "Urlaub & Krankheit"],
              ["kosten", "Kosten"],
              ["chat", "Chat"],
              ["meldungen", "Meldungen"],
              ["audit", "Audit-Log"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as AdminTab)}
                className={
                  activeTab === id
                    ? "w-full text-left px-4 py-3 rounded-2xl bg-blue-500 text-white font-bold shadow-sm"
                    : "w-full text-left px-4 py-3 rounded-2xl hover:bg-gray-100"
                }
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex-1">
          <header className="bg-white px-6 py-4 flex justify-between items-center shadow-sm">
            <div>
              <p className="text-xs text-gray-400">Angemeldet als</p>
              <p className="font-bold">{adminName}</p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={loadData} className="text-sm text-blue-500 font-bold">
                Aktualisieren
              </button>
              <button onClick={() => setActiveTab("meldungen")} className="relative text-sm text-blue-500">
                🔔
                {openNotifications > 0 && (
                  <span className="absolute -top-3 -right-3 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {openNotifications}
                  </span>
                )}
              </button>
            </div>
          </header>

          <div className="p-6 pb-24">
            {activeTab === "dashboard" && (
              <>
                <h1 className="text-2xl font-bold mb-6">Dashboard Übersicht</h1>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
                  {[
                    ["Mitarbeiter", String(activeEmployees.length), "mitarbeiter"],
                    ["Objekte", String(activeSites.length), "objekte"],
                    ["Offene Aufgaben", String(openTasks), "aufgaben"],
                    ["Erledigt", String(doneTasks), "aufgaben"],
                    ["Meldungen", String(openNotifications), "meldungen"],
                    ["Abwesenheit", String(absenceRequests.filter((item) => item.status === "open").length), "abwesenheit"],
                  ].map(([label, value, tab]) => (
                    <button
                      key={label}
                      onClick={() => setActiveTab(tab as AdminTab)}
                      className="bg-white rounded-[28px] p-6 shadow-sm text-left"
                    >
                      <p className="text-gray-400 text-sm">{label}</p>
                      <p className="text-3xl font-bold">{value}</p>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 bg-white rounded-[28px] p-6 shadow-sm">
                    <div className="flex justify-between mb-5">
                      <h2 className="text-xl font-bold">Aktuelle Woche</h2>
                      <button onClick={() => setActiveTab("planung")} className="px-4 py-2 rounded-2xl bg-blue-500 text-white font-bold">
                        Öffnen
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-3">
                      {week.map((date) => (
                        <button key={date.toISOString()} onClick={() => setSelectedDate(date)} className="min-h-44 rounded-2xl bg-white p-3 text-left shadow-md border border-gray-200">
                          <p className="font-bold">
                            {date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                          </p>
                          <div className="mt-3 space-y-2">
                            {tasksForDate(date).slice(0, 3).map((task) => (
                              <div key={task.id} className="rounded-xl bg-blue-500 p-2 text-xs text-white shadow-sm">
                                <p className="font-bold">{task.start_time} - {task.end_time}</p>
                                <p>{task.site || "Kein Objekt"}</p>
                                <p className="opacity-80">{task.title}</p>
                              </div>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-[28px] p-6 shadow-sm">
                    <h2 className="text-xl font-bold mb-4">Letzte Stempelungen</h2>
                    <div className="space-y-3">
                      {entries.slice(0, 6).map((entry) => (
                        <div key={entry.id} className="bg-gray-100 rounded-2xl p-3">
                          <div className="flex justify-between items-center gap-2">
                            <div>
                              <p className="font-bold">{entry.employee_name}</p>
                              <p className="text-sm text-gray-500">{entry.work_site_name}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${actionBadge(entry.action)}`}>
                              {actionText(entry.action)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">{new Date(entry.created_at).toLocaleString("de-DE")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "planung" && (
              <div className="space-y-6">
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h1 className="text-2xl font-bold">Planung</h1>
                    <p className="text-gray-500">Einsätze erstellen, bearbeiten, löschen und als Serie anlegen.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => changeWeek(-7)} className="px-4 py-3 rounded-2xl bg-white border font-bold">←</button>
                    <button className="px-5 py-3 rounded-2xl bg-white border font-bold">{selectedDate.toLocaleDateString("de-DE")}</button>
                    <button onClick={() => changeWeek(7)} className="px-4 py-3 rounded-2xl bg-white border font-bold">→</button>
                  </div>
                </div>

                <div className="bg-white rounded-[28px] shadow-sm p-6">
                  <div className="flex justify-between items-center mb-5">
                    <div>
                      <h2 className="text-xl font-bold">Einsatz erstellen</h2>
                      <p className="text-sm text-gray-500">Datum: {selectedDate.toLocaleDateString("de-DE")}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={createShift} className="px-5 py-3 rounded-2xl bg-blue-500 text-white font-bold">Speichern</button>
                      <button onClick={createRecurringShifts} className="px-5 py-3 rounded-2xl bg-purple-500 text-white font-bold">Als Serie</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mb-4">
                    <select value={site} onChange={(e) => setSite(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none md:col-span-2">
                      <option value="">Objekt auswählen</option>
                      {activeSites.map((siteItem) => <option key={siteItem.id} value={siteItem.name}>{siteItem.name}</option>)}
                    </select>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input type="number" value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} placeholder="Minuten" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <select value={employee} onChange={(e) => setEmployee(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none md:col-span-2">
                      <option value="">Mitarbeiter auswählen</option>
                      {activeEmployees.map((profile) => <option key={profile.id} value={profile.name}>{profile.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <input type="number" value={recurringWeeks} onChange={(e) => setRecurringWeeks(e.target.value)} placeholder="Anzahl Wochen" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input type="number" value={recurringEvery} onChange={(e) => setRecurringEvery(e.target.value)} placeholder="Jede x. Woche" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                  </div>

                  {selectedSiteForTemplates && (
                    <button type="button" onClick={useTemplatesForSelectedSite} className="mb-4 px-5 py-3 rounded-2xl bg-orange-100 text-orange-700 font-bold">
                      Aufgaben-Vorlagen für {selectedSiteForTemplates.name} übernehmen
                    </button>
                  )}

                  <div className="space-y-3">
                    {taskTitles.map((task, index) => (
                      <div key={index} className="flex gap-2">
                        <input value={task} onChange={(e) => updateTaskField(index, e.target.value)} placeholder={`Aufgabe ${index + 1}`} className="flex-1 p-4 rounded-2xl bg-gray-100 outline-none" />
                        {taskTitles.length > 1 && <button onClick={() => removeTaskField(index)} className="px-4 rounded-2xl bg-red-100 text-red-600 font-bold">X</button>}
                      </div>
                    ))}
                    <button onClick={addTaskField} className="w-full p-4 rounded-2xl bg-purple-100 text-purple-600 font-bold">+ Aufgabe hinzufügen</button>
                  </div>

                  {planningMessage && <p className="mt-4 text-sm font-bold text-blue-600">{planningMessage}</p>}
                </div>

                {editingTaskId && (
                  <div className="bg-white rounded-[28px] shadow-sm p-6 border border-blue-100">
                    <h2 className="text-xl font-bold mb-4">Einsatz bearbeiten</h2>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      <input value={editTaskTitle} onChange={(e) => setEditTaskTitle(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none md:col-span-2" />
                      <select value={editTaskSite} onChange={(e) => setEditTaskSite(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none">
                        {activeSites.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                      <select value={editTaskEmployee} onChange={(e) => setEditTaskEmployee(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none">
                        {activeEmployees.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                      <input type="date" value={editTaskDate} onChange={(e) => setEditTaskDate(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none" />
                      <input type="number" value={editTaskMinutes} onChange={(e) => setEditTaskMinutes(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none" />
                      <input type="time" value={editTaskStart} onChange={(e) => setEditTaskStart(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none" />
                      <input type="time" value={editTaskEnd} onChange={(e) => setEditTaskEnd(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none" />
                      <button onClick={updateTask} className="p-4 rounded-2xl bg-blue-500 text-white font-bold">Änderung speichern</button>
                      <button onClick={() => setEditingTaskId("")} className="p-4 rounded-2xl bg-gray-100 text-gray-600 font-bold">Abbrechen</button>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-[28px] shadow-sm p-6">
                  <h2 className="text-xl font-bold mb-4">Wochenplan</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-7 gap-3">
                    {week.map((date) => (
                      <div key={date.toISOString()} className="rounded-2xl bg-gray-100 p-3 min-h-64">
                        <button onClick={() => setSelectedDate(date)} className="font-bold mb-3 text-left">
                          {date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        </button>
                        <div className="space-y-3">
                          {tasksForDate(date).map((task) => (
                            <div key={task.id} className={task.done ? "rounded-xl p-3 bg-green-100" : "rounded-xl p-3 bg-white border border-blue-200"}>
                              <p className="font-bold text-sm">{task.start_time} - {task.end_time}</p>
                              <p className="text-sm font-semibold">{task.site || "Kein Objekt"}</p>
                              <p className="text-sm text-gray-600">{task.title}</p>
                              <p className="text-xs text-gray-500 mt-1">{task.employee_name || "Kein Mitarbeiter"}</p>
                              <div className="flex gap-2 mt-3">
                                <button onClick={() => startEditTask(task)} className="px-3 py-2 rounded-xl bg-blue-100 text-blue-600 text-xs font-bold">Bearbeiten</button>
                                <button onClick={() => deleteTask(task)} className="px-3 py-2 rounded-xl bg-red-100 text-red-600 text-xs font-bold">Löschen</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "objekte" && (
              <div className="space-y-6">
                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h1 className="text-2xl font-bold mb-2">Objekte</h1>
                  <p className="text-gray-500 mb-6">Adresse eingeben, GPS automatisch berechnen, Notizen speichern.</p>
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                    <input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder="Objektname" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input value={newSiteAddress} onChange={(e) => setNewSiteAddress(e.target.value)} placeholder="Adresse" className="p-4 rounded-2xl bg-gray-100 outline-none md:col-span-2" />
                    <input value={newSiteRadius} onChange={(e) => setNewSiteRadius(e.target.value)} placeholder="Radius Meter" type="number" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input value={newSiteLat} onChange={(e) => setNewSiteLat(e.target.value)} placeholder="Breitengrad" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input value={newSiteLng} onChange={(e) => setNewSiteLng(e.target.value)} placeholder="Längengrad" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <button onClick={geocodeAddress} disabled={siteGeocoding} className="p-4 rounded-2xl bg-purple-100 text-purple-700 font-bold disabled:opacity-50">
                      {siteGeocoding ? "Suche..." : "GPS ermitteln"}
                    </button>
                    <textarea value={newSiteNotes} onChange={(e) => setNewSiteNotes(e.target.value)} placeholder="Notizen: Schlüssel, Zugang, Besonderheiten" className="md:col-span-5 p-4 rounded-2xl bg-gray-100 outline-none" />
                    <button onClick={saveWorkSite} className="p-4 rounded-2xl bg-blue-500 text-white font-bold md:col-span-1">{editingSiteId ? "Ändern" : "Speichern"}</button>
                    <button onClick={clearSiteForm} className="p-4 rounded-2xl bg-gray-100 text-gray-600 font-bold md:col-span-1">Neu</button>
                  </div>
                  {siteMessage && <p className="mt-4 text-sm font-bold text-blue-600">{siteMessage}</p>}
                </div>

                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h2 className="text-xl font-bold mb-4">Aufgaben-Vorlagen pro Objekt</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <select value={templateSiteId} onChange={(e) => setTemplateSiteId(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none">
                      <option value="">Objekt auswählen</option>
                      {activeSites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <input value={templateTitle} onChange={(e) => setTemplateTitle(e.target.value)} placeholder="Standard-Aufgabe" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <button onClick={createTemplate} className="p-4 rounded-2xl bg-blue-500 text-white font-bold">Vorlage speichern</button>
                  </div>
                  {templateMessage && <p className="text-sm font-bold text-blue-600 mb-3">{templateMessage}</p>}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {taskTemplates.map((item) => (
                      <div key={item.id} className="bg-gray-100 rounded-2xl p-4">
                        <p className="font-bold">{item.title}</p>
                        <p className="text-sm text-gray-500">{item.work_site_name}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h2 className="text-xl font-bold mb-4">Alle Objekte</h2>
                  <div className="space-y-3">
                    {workSites.map((item) => (
                      <div key={item.id} className={item.active === false ? "bg-gray-200 rounded-2xl p-4 opacity-60" : "bg-gray-100 rounded-2xl p-4"}>
                        <div className="flex justify-between gap-4">
                          <div>
                            <p className="font-bold">{item.name}</p>
                            <p className="text-sm text-gray-500">{item.address || "Adresse fehlt"}</p>
                            <p className="text-sm text-gray-500">GPS: {item.latitude ?? "fehlt"}, {item.longitude ?? "fehlt"} · Radius: {item.allowed_radius_m ?? 100} m</p>
                            {item.notes && <p className="text-sm text-gray-600 mt-2">Notiz: {item.notes}</p>}
                          </div>
                          <div className="flex gap-2 h-fit">
                            <button onClick={() => startEditSite(item)} className="px-4 py-2 rounded-2xl bg-blue-100 text-blue-600 font-bold">Bearbeiten</button>
                            {item.active !== false && <button onClick={() => deactivateWorkSite(item.id, item.name)} className="px-4 py-2 rounded-2xl bg-red-100 text-red-600 font-bold">Deaktivieren</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "einladen" && (
              <div className="space-y-6">
                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h1 className="text-2xl font-bold mb-2">Mitarbeiter einladen</h1>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Name des Mitarbeiters" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="E-Mail des Mitarbeiters" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} placeholder="Handynummer optional" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <button onClick={createEmployeeInvite} disabled={inviteLoading} className="p-4 rounded-2xl bg-blue-500 text-white font-bold disabled:opacity-50">{inviteLoading ? "Wird erstellt..." : "Einladung erstellen"}</button>
                  </div>
                  {inviteMessage && <p className="mt-4 text-sm font-bold text-blue-600">{inviteMessage}</p>}
                </div>

                {inviteLink && (
                  <div className="bg-white rounded-[28px] p-6 shadow-sm">
                    <h2 className="text-xl font-bold mb-4">Aktivierungslink</h2>
                    <div className="bg-gray-100 rounded-2xl p-4 break-all text-sm mb-4">{inviteLink}</div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => navigator.clipboard.writeText(inviteLink)} className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold">Link kopieren</button>
                      {inviteWhatsappLink && <a href={inviteWhatsappLink} target="_blank" rel="noreferrer" className="px-5 py-3 rounded-2xl bg-green-500 text-white font-bold">Per WhatsApp senden</a>}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h2 className="text-xl font-bold mb-2">Passwort neu setzen</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select value={resetEmployeeId} onChange={(e) => setResetEmployeeId(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none">
                      <option value="">Mitarbeiter auswählen</option>
                      {activeEmployees.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                    </select>
                    <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Neues Passwort" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <button type="button" onClick={resetEmployeePassword} disabled={resetLoading} className="p-4 rounded-2xl bg-red-500 text-white font-bold disabled:opacity-50">{resetLoading ? "Wird geändert..." : "Passwort setzen"}</button>
                  </div>
                  {resetMessage && <p className="mt-4 text-sm font-bold text-blue-600">{resetMessage}</p>}
                </div>
              </div>
            )}

            {activeTab === "mitarbeiter" && (
              <div className="space-y-6">
                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h1 className="text-2xl font-bold mb-6">Mitarbeiterverwaltung</h1>
                  {editingEmployeeId && (
                    <div className="bg-blue-50 rounded-2xl p-4 mb-5">
                      <h2 className="font-bold mb-3">Mitarbeiter bearbeiten</h2>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input value={editEmployeeName} onChange={(e) => setEditEmployeeName(e.target.value)} placeholder="Name" className="p-4 rounded-2xl bg-white outline-none" />
                        <input value={editEmployeeEmail} onChange={(e) => setEditEmployeeEmail(e.target.value)} placeholder="E-Mail" className="p-4 rounded-2xl bg-white outline-none" />
                        <input value={editEmployeePhone} onChange={(e) => setEditEmployeePhone(e.target.value)} placeholder="Telefon" className="p-4 rounded-2xl bg-white outline-none" />
                        <select value={editEmployeeRole} onChange={(e) => setEditEmployeeRole(e.target.value)} className="p-4 rounded-2xl bg-white outline-none">
                          <option value="employee">Mitarbeiter</option>
                          <option value="admin">Admin</option>
                        </select>
                        <input value={editEmployeeHourlyRate} onChange={(e) => setEditEmployeeHourlyRate(e.target.value)} placeholder="Stundenlohn" type="number" className="p-4 rounded-2xl bg-white outline-none" />
                        <input value={editEmployeeFactor} onChange={(e) => setEditEmployeeFactor(e.target.value)} placeholder="AG-Faktor" type="number" className="p-4 rounded-2xl bg-white outline-none" />
                        <label className="p-4 rounded-2xl bg-white flex items-center gap-2"><input type="checkbox" checked={editEmployeeActive} onChange={(e) => setEditEmployeeActive(e.target.checked)} /> Aktiv</label>
                        <button onClick={updateEmployee} className="p-4 rounded-2xl bg-blue-500 text-white font-bold">Speichern</button>
                      </div>
                      {employeeEditMessage && <p className="mt-3 text-sm font-bold text-blue-600">{employeeEditMessage}</p>}
                    </div>
                  )}
                  <div className="space-y-3">
                    {employeeProfiles.map((profile) => {
                      const stats = monthlyStats.get(profile.name);
                      return (
                        <div key={profile.id} className={profile.active === false ? "bg-gray-200 rounded-2xl p-4 opacity-60" : "bg-gray-100 rounded-2xl p-4"}>
                          <div className="flex justify-between gap-4">
                            <div>
                              <p className="font-bold">{profile.name}</p>
                              <p className="text-sm text-gray-500">{profile.email || "Keine E-Mail"} · {profile.phone || "Keine Nummer"}</p>
                              <p className="text-sm text-gray-500">Rolle: {profile.role === "admin" ? "Admin" : "Mitarbeiter"} · Status: {profile.active === false ? "inaktiv" : "aktiv"}</p>
                              <p className="text-sm text-gray-500">Monat: {formatMinutes(stats?.worked || 0)} · Kosten: {(stats?.cost || 0).toFixed(2)} €</p>
                            </div>
                            <button onClick={() => startEditEmployee(profile)} className="h-fit px-4 py-2 rounded-2xl bg-blue-100 text-blue-600 font-bold">Bearbeiten</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "stempelungen" && (
              <div className="space-y-6">
                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h1 className="text-2xl font-bold mb-4">Arbeitszeiten-Korrektur</h1>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <select value={correctionEmployee} onChange={(e) => setCorrectionEmployee(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none">
                      <option value="">Mitarbeiter</option>
                      {allEmployeeNames.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <select value={correctionSiteId} onChange={(e) => setCorrectionSiteId(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none">
                      <option value="">Objekt</option>
                      {workSites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <select value={correctionAction} onChange={(e) => setCorrectionAction(e.target.value as EntryAction)} className="p-4 rounded-2xl bg-gray-100 outline-none">
                      {actionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                    <input type="datetime-local" value={correctionTime} onChange={(e) => setCorrectionTime(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <input value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Grund der Korrektur" className="p-4 rounded-2xl bg-gray-100 outline-none" />
                    <button onClick={saveCorrection} className="p-4 rounded-2xl bg-blue-500 text-white font-bold">{editingEntryId ? "Ändern" : "Hinzufügen"}</button>
                  </div>
                  {correctionMessage && <p className="mt-4 text-sm font-bold text-blue-600">{correctionMessage}</p>}
                </div>

                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Stempelungen</h1>
                    <button onClick={loadEntries} className="px-4 py-2 rounded-2xl bg-blue-500 text-white font-bold">Aktualisieren</button>
                  </div>
                  <div className="space-y-3">
                    {entries.map((entry) => (
                      <div key={entry.id} className="bg-gray-100 rounded-2xl p-4">
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="font-bold">{entry.employee_name}</p>
                            <p className="text-sm text-gray-500">{entry.work_site_name}</p>
                            <p className="text-xs text-gray-400 mt-1">{new Date(entry.created_at).toLocaleString("de-DE")}</p>
                            {entry.correction_reason && <p className="text-xs text-blue-600 mt-1">Korrektur: {entry.correction_reason}</p>}
                          </div>
                          <div className="flex flex-col gap-2 items-end">
                            <span className={`h-fit px-3 py-1 rounded-full text-xs font-bold ${actionBadge(entry.action)}`}>{actionText(entry.action)}</span>
                            <div className="flex gap-2">
                              <button onClick={() => startEditEntry(entry)} className="px-3 py-1 rounded-xl bg-blue-100 text-blue-600 text-xs font-bold">Bearbeiten</button>
                              <button onClick={() => deleteEntry(entry)} className="px-3 py-1 rounded-xl bg-red-100 text-red-600 text-xs font-bold">Löschen</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "auswertung" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-4">Tages- und Monatsübersicht</h1>
                <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none mb-5" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="p-3">Mitarbeiter</th>
                        <th className="p-3">Arbeitszeit</th>
                        <th className="p-3">Pause</th>
                        <th className="p-3">Überstunden</th>
                        <th className="p-3">Kosten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(monthlyStats.entries()).map(([name, stat]) => (
                        <tr key={name} className="border-b">
                          <td className="p-3 font-bold">{name}</td>
                          <td className="p-3">{formatMinutes(stat.worked)}</td>
                          <td className="p-3">{formatMinutes(stat.pause)}</td>
                          <td className="p-3">{formatMinutes(stat.overtime)}</td>
                          <td className="p-3">{stat.cost.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "abwesenheit" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Urlaub, Krankheit & Abwesenheit</h1>
                <div className="space-y-3">
                  {absenceRequests.length === 0 && <p className="text-gray-400">Keine Anträge vorhanden.</p>}
                  {absenceRequests.map((request) => (
                    <div key={request.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex justify-between gap-4">
                        <div>
                          <p className="font-bold">{request.employee_name}</p>
                          <p className="text-sm text-gray-500">{request.request_type} · {request.start_date} bis {request.end_date}</p>
                          {request.reason && <p className="text-sm text-gray-600 mt-1">{request.reason}</p>}
                          <p className="text-xs text-gray-400 mt-1">Status: {request.status || "open"}</p>
                        </div>
                        {(!request.status || request.status === "open") && (
                          <div className="flex gap-2 h-fit">
                            <button onClick={() => decideAbsence(request.id, "approved")} className="px-4 py-2 rounded-2xl bg-green-500 text-white font-bold">Genehmigen</button>
                            <button onClick={() => decideAbsence(request.id, "rejected")} className="px-4 py-2 rounded-2xl bg-red-100 text-red-600 font-bold">Ablehnen</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "kosten" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Kosten & Abrechnung</h1>
                <p className="text-gray-500 mb-4">Kosten werden aus Monatsarbeitszeit, Stundenlohn und AG-Faktor berechnet.</p>
                <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="p-4 rounded-2xl bg-gray-100 outline-none mb-5" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Array.from(monthlyStats.entries()).map(([name, stat]) => (
                    <div key={name} className="bg-gray-100 rounded-2xl p-4">
                      <p className="font-bold">{name}</p>
                      <p className="text-sm text-gray-500">Zeit: {formatMinutes(stat.worked)}</p>
                      <p className="text-2xl font-bold mt-2">{stat.cost.toFixed(2)} €</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "meldungen" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Meldungen</h1>
                <div className="space-y-3">
                  {notifications.length === 0 && <p className="text-gray-400">Keine Meldungen vorhanden.</p>}
                  {notifications.map((note) => (
                    <div key={note.id} className={note.status === "approved" ? "bg-green-50 rounded-2xl p-4 border border-green-100" : note.status === "rejected" ? "bg-gray-100 rounded-2xl p-4" : "bg-red-50 rounded-2xl p-4 border border-red-100"}>
                      <p className="font-bold">{note.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{note.message}</p>
                      {note.overtime_minutes !== null && note.overtime_minutes > 0 && <p className="text-sm text-red-600 mt-2">Überzeit: {note.overtime_minutes} Minuten</p>}
                      <p className="text-xs text-gray-400 mt-2">{new Date(note.created_at).toLocaleString("de-DE")}</p>
                      {(!note.status || note.status === "open") && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => decideOvertime(note.id, "approved")} className="px-4 py-2 rounded-2xl bg-green-500 text-white font-bold">Genehmigen</button>
                          <button onClick={() => decideOvertime(note.id, "rejected")} className="px-4 py-2 rounded-2xl bg-red-100 text-red-600 font-bold">Ablehnen</button>
                        </div>
                      )}
                      {!note.read && note.status !== "open" && <button onClick={() => markNotificationAsRead(note.id)} className="mt-3 px-4 py-2 rounded-2xl bg-blue-100 text-blue-600 font-bold">Als gelesen markieren</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "chat" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Chat</h1>
                <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
                  <div className="bg-gray-100 rounded-2xl p-4">
                    <h2 className="font-bold mb-3">Mitarbeiter</h2>
                    <div className="space-y-2">
                      {activeEmployees.map((profile) => {
                        const unread = chatMessages.filter((msg) => msg.employee_name === profile.name && msg.sender_role === "employee" && !msg.read_by_admin).length;
                        return (
                          <button key={profile.id} type="button" onClick={() => { setSelectedChatEmployee(profile.name); loadAdminChatMessages(profile.name); }} className={selectedChatEmployee === profile.name ? "w-full text-left p-3 rounded-2xl bg-blue-500 text-white font-bold" : "w-full text-left p-3 rounded-2xl bg-white hover:bg-blue-50"}>
                            <div className="flex justify-between"><span>{profile.name}</span>{unread > 0 && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">{unread}</span>}</div>
                            {profile.email && <p className="text-xs opacity-70">{profile.email}</p>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    {!selectedChatEmployee ? <div className="bg-gray-100 rounded-2xl p-6 text-center text-gray-400">Bitte Mitarbeiter auswählen.</div> : (
                      <>
                        <h2 className="font-bold mb-4">Chat mit {selectedChatEmployee}</h2>
                        <div className="bg-gray-100 rounded-2xl p-4 h-[55vh] overflow-y-auto space-y-3 mb-4">
                          {chatMessages.length === 0 && <p className="text-gray-400 text-center">Noch keine Nachrichten vorhanden.</p>}
                          {chatMessages.map((msg) => (
                            <div key={msg.id} className={msg.sender_role === "admin" ? "bg-blue-100 rounded-2xl p-4 ml-20" : "bg-white rounded-2xl p-4 mr-20"}>
                              <div className="flex justify-between text-sm mb-1"><p className="font-bold">{msg.sender_role === "admin" ? "Ich" : msg.sender_name || msg.employee_name}</p><p className="text-gray-400">{new Date(msg.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</p></div>
                              <p>{msg.message}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendChatMessage(); } }} placeholder="Nachricht schreiben..." className="flex-1 p-4 rounded-2xl bg-gray-100 outline-none" />
                          <button type="button" onClick={sendChatMessage} className="px-6 rounded-2xl bg-blue-500 text-white font-bold">Senden</button>
                        </div>
                        {chatError && <p className="mt-3 text-sm font-bold text-red-500">{chatError}</p>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "audit" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Audit-Log</h1>
                <div className="space-y-3">
                  {auditLogs.length === 0 && <p className="text-gray-400">Noch keine Einträge vorhanden.</p>}
                  {auditLogs.map((log) => (
                    <div key={log.id} className="bg-gray-100 rounded-2xl p-4">
                      <p className="font-bold">{log.action}</p>
                      <p className="text-sm text-gray-600">{log.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{log.created_by || "System"} · {new Date(log.created_at).toLocaleString("de-DE")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
