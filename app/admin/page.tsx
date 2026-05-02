"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type EntryAction = "start" | "break_start" | "break_end" | "end" | string;

type Entry = {
  id: string;
  employee_id?: string | null;
  employee_name: string;
  work_site_name: string;
  action: EntryAction;
  created_at: string;
  auto_clock_out: boolean | null;
  correction_reason?: string | null;
  approved?: boolean | null;
  status?: string | null;
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
  notes?: string | null;
  recurrence_group_id?: string | null;
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
  latitude: number | null;
  longitude: number | null;
  allowed_radius_m: number | null;
  address?: string | null;
  notes?: string | null;
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
  address?: string | null;
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

type MaterialProduct = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  current_stock: number | null;
  min_stock: number | null;
  image_url: string | null;
  notes: string | null;
  created_at?: string | null;
};

type AbsenceRequest = {
  id: string;
  employee_name: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  status: string | null;
  reason: string | null;
  created_at?: string | null;
};

type AdminTab =
  | "planung"
  | "zeitfreigabe"
  | "abwesenheiten"
  | "lohn"
  | "mitarbeiter"
  | "objekte"
  | "aufgaben"
  | "material"
  | "geraete"
  | "schluessel"
  | "faktura"
  | "hilfe"
  | "einstellungen"
  | "chat";

type PlannerMode = "single" | "repeat";

const todayIso = new Date().toISOString().split("T")[0];

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return 0;
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin < startMin) endMin += 24 * 60;
  return Math.max(0, endMin - startMin);
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function actionText(action: EntryAction) {
  if (action === "start") return "Start";
  if (action === "break_start") return "Pause Start";
  if (action === "break_end") return "Pause Ende";
  if (action === "end") return "Ende";
  return action;
}

function dateToInput(date: Date) {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
}

export default function AdminPage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("planung");
  const [search, setSearch] = useState("");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [workSites, setWorkSites] = useState<WorkSite[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageDb[]>([]);
  const [materialProducts, setMaterialProducts] = useState<MaterialProduct[]>([]);
  const [absenceRequests, setAbsenceRequests] = useState<AbsenceRequest[]>([]);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState("");
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("single");
  const [taskSiteId, setTaskSiteId] = useState("");
  const [taskEmployee, setTaskEmployee] = useState("");
  const [taskTitle, setTaskTitle] = useState("Unterhaltsreinigung");
  const [taskDate, setTaskDate] = useState(todayIso);
  const [taskStartTime, setTaskStartTime] = useState("08:00");
  const [taskEndTime, setTaskEndTime] = useState("10:00");
  const [taskRepeatEvery, setTaskRepeatEvery] = useState("1");
  const [taskRepeatWeekday, setTaskRepeatWeekday] = useState("1");
  const [taskRepeatEndDate, setTaskRepeatEndDate] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [notifyEmployee, setNotifyEmployee] = useState(true);
  const [taskMessage, setTaskMessage] = useState("");

  const [siteId, setSiteId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteRadius, setSiteRadius] = useState("50");
  const [siteLat, setSiteLat] = useState("");
  const [siteLng, setSiteLng] = useState("");
  const [siteNotes, setSiteNotes] = useState("");
  const [siteMessage, setSiteMessage] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [resetEmployeeId, setResetEmployeeId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [employeeMessage, setEmployeeMessage] = useState("");

  const [correctionEmployee, setCorrectionEmployee] = useState("");
  const [correctionSite, setCorrectionSite] = useState("");
  const [correctionAction, setCorrectionAction] = useState<EntryAction>("start");
  const [correctionDate, setCorrectionDate] = useState(todayIso);
  const [correctionTime, setCorrectionTime] = useState("08:00");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionMessage, setCorrectionMessage] = useState("");

  const [selectedChatEmployee, setSelectedChatEmployee] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatMessage, setChatMessage] = useState("");

  const [materialId, setMaterialId] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [materialCategory, setMaterialCategory] = useState("");
  const [materialUnit, setMaterialUnit] = useState("Stück");
  const [materialStock, setMaterialStock] = useState("0");
  const [materialMinStock, setMaterialMinStock] = useState("0");
  const [materialImageUrl, setMaterialImageUrl] = useState("");
  const [materialNotes, setMaterialNotes] = useState("");
  const [materialMessage, setMaterialMessage] = useState("");
  const [materialUploading, setMaterialUploading] = useState(false);

  const [absenceEmployee, setAbsenceEmployee] = useState("");
  const [absenceType, setAbsenceType] = useState("Urlaub");
  const [absenceStart, setAbsenceStart] = useState(todayIso);
  const [absenceEnd, setAbsenceEnd] = useState(todayIso);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceMessage, setAbsenceMessage] = useState("");

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
        .select("role")
        .eq("auth_user_id", data.user.id)
        .single();

      if (profile?.role === "admin") {
        setAllowed(true);
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
      loadMaterialProducts(),
      loadAbsenceRequests(),
    ]);
  }

  async function loadEntries() {
    const { data } = await supabase
      .from("time_entries")
      .select("id, employee_id, employee_name, work_site_name, action, created_at, auto_clock_out, correction_reason, approved, status")
      .order("created_at", { ascending: false })
      .limit(500);
    setEntries((data || []) as Entry[]);
  }

  async function loadTasks() {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, site, employee_name, task_date, done, start_time, end_time, max_minutes, planned_minutes, work_site_id, notes, recurrence_group_id")
      .order("task_date", { ascending: true });
    setTasks((data || []) as Task[]);
  }

  async function loadNotifications() {
    const { data } = await supabase
      .from("admin_notifications")
      .select("id, title, message, employee_name, work_site_name, read, status, notification_type, overtime_minutes, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setNotifications((data || []) as AdminNotification[]);
  }

  async function loadWorkSites() {
    const { data } = await supabase
      .from("work_sites")
      .select("id, name, latitude, longitude, allowed_radius_m, address, notes, active")
      .order("name");
    setWorkSites((data || []) as WorkSite[]);
  }

  async function loadEmployeeProfiles() {
    const { data } = await supabase
      .from("employee_profiles")
      .select("id, auth_user_id, name, email, role, phone, active, avatar_url, address, hourly_rate, employer_cost_factor")
      .order("name");
    setEmployeeProfiles((data || []) as EmployeeProfile[]);
  }

  async function loadMaterialProducts() {
    const { data } = await supabase
      .from("material_products")
      .select("id, name, category, unit, current_stock, min_stock, image_url, notes, created_at")
      .order("name");
    setMaterialProducts((data || []) as MaterialProduct[]);
  }

  async function loadAbsenceRequests() {
    const { data } = await supabase
      .from("absence_requests")
      .select("id, employee_name, absence_type, start_date, end_date, status, reason, created_at")
      .order("start_date", { ascending: false })
      .limit(200);
    setAbsenceRequests((data || []) as AbsenceRequest[]);
  }

  const week = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }).map((_, index) => addDays(start, index));
  }, [selectedDate]);

  const activeEmployees = employeeProfiles.filter((employee) => employee.active !== false);
  const activeSites = workSites.filter((site) => site.active !== false);
  const openNotifications = notifications.filter((note) => !note.read).length;
  const pendingAbsences = absenceRequests.filter((item) => !item.status || item.status === "open").length;

  function tasksForDayAndEmployee(date: Date, employeeName: string) {
    const iso = dateToInput(date);
    return tasks.filter((task) => task.task_date === iso && task.employee_name === employeeName);
  }

  function filteredEmployees() {
    const term = search.trim().toLowerCase();
    if (!term) return activeEmployees;
    return activeEmployees.filter((employee) =>
      [employee.name, employee.email, employee.phone, employee.address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }

  async function sendPushToEmployee(employeeName: string, title: string, message: string, url = "/mitarbeiter") {
    const token = await getAccessToken();
    if (!token || !employeeName.trim()) return;

    await fetch("/api/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ employeeName, title, message, url }),
    });
  }

  function resetTaskForm() {
    setEditingTaskId("");
    setPlannerMode("single");
    setTaskSiteId("");
    setTaskEmployee("");
    setTaskTitle("Unterhaltsreinigung");
    setTaskDate(dateToInput(selectedDate));
    setTaskStartTime("08:00");
    setTaskEndTime("10:00");
    setTaskRepeatEvery("1");
    setTaskRepeatWeekday("1");
    setTaskRepeatEndDate("");
    setTaskNotes("");
    setNotifyEmployee(true);
    setTaskMessage("");
  }

  function openCreateTask(date = selectedDate, employeeName = "") {
    resetTaskForm();
    setTaskDate(dateToInput(date));
    setTaskEmployee(employeeName);
    setShowTaskModal(true);
  }

  function openEditTask(task: Task) {
    setEditingTaskId(task.id);
    const site = workSites.find((item) => item.id === task.work_site_id || item.name === task.site);
    setTaskSiteId(site?.id || "");
    setTaskEmployee(task.employee_name || "");
    setTaskTitle(task.title || "Unterhaltsreinigung");
    setTaskDate(task.task_date || todayIso);
    setTaskStartTime(task.start_time || "08:00");
    setTaskEndTime(task.end_time || "10:00");
    setTaskNotes(task.notes || "");
    setNotifyEmployee(true);
    setPlannerMode("single");
    setTaskMessage("");
    setShowTaskModal(true);
  }

  async function saveTask() {
    setTaskMessage("");
    const selectedSite = workSites.find((item) => item.id === taskSiteId);

    if (!selectedSite || !taskEmployee.trim() || !taskTitle.trim()) {
      setTaskMessage("Bitte Objekt, Mitarbeiter und Auftrag auswählen.");
      return;
    }

    const planned = minutesBetween(taskStartTime, taskEndTime);

    if (editingTaskId) {
      const { error } = await supabase
        .from("tasks")
        .update({
          title: taskTitle.trim(),
          site: selectedSite.name,
          work_site_id: selectedSite.id,
          employee_name: taskEmployee,
          task_date: taskDate,
          start_time: taskStartTime,
          end_time: taskEndTime,
          max_minutes: planned,
          planned_minutes: planned,
          notes: taskNotes.trim() || null,
        })
        .eq("id", editingTaskId);

      if (error) {
        setTaskMessage(error.message || "Einsatz konnte nicht geändert werden.");
        return;
      }

      if (notifyEmployee) {
        await sendPushToEmployee(taskEmployee, "Einsatz geändert", `${selectedSite.name} am ${taskDate} um ${taskStartTime}`, "/mitarbeiter?tab=schedule");
      }

      await loadTasks();
      setShowTaskModal(false);
      return;
    }

    const rows: Partial<Task>[] = [];

    if (plannerMode === "repeat" && taskRepeatEndDate) {
      const repeatGroup = crypto.randomUUID();
      let current = new Date(taskDate);
      const end = new Date(taskRepeatEndDate);
      const wantedDay = Number(taskRepeatWeekday);
      const every = Math.max(1, Number(taskRepeatEvery) || 1);

      while (current.getDay() !== wantedDay) current = addDays(current, 1);

      while (current <= end) {
        rows.push({
          title: taskTitle.trim(),
          site: selectedSite.name,
          work_site_id: selectedSite.id,
          employee_name: taskEmployee,
          task_date: dateToInput(current),
          done: false,
          start_time: taskStartTime,
          end_time: taskEndTime,
          max_minutes: planned,
          planned_minutes: planned,
          notes: taskNotes.trim() || null,
          recurrence_group_id: repeatGroup,
        });
        current = addDays(current, every * 7);
      }
    } else {
      rows.push({
        title: taskTitle.trim(),
        site: selectedSite.name,
        work_site_id: selectedSite.id,
        employee_name: taskEmployee,
        task_date: taskDate,
        done: false,
        start_time: taskStartTime,
        end_time: taskEndTime,
        max_minutes: planned,
        planned_minutes: planned,
        notes: taskNotes.trim() || null,
      });
    }

    if (rows.length === 0) {
      setTaskMessage("Keine Einsätze erzeugt. Bitte Enddatum prüfen.");
      return;
    }

    const { error } = await supabase.from("tasks").insert(rows);

    if (error) {
      setTaskMessage(error.message || "Einsatz konnte nicht erstellt werden.");
      return;
    }

    if (notifyEmployee) {
      await sendPushToEmployee(taskEmployee, "Neuer Einsatz", `${selectedSite.name} am ${taskDate} um ${taskStartTime}`, "/mitarbeiter?tab=schedule");
    }

    await loadTasks();
    setShowTaskModal(false);
  }

  async function deleteTask(task: Task) {
    if (!window.confirm("Einsatz wirklich löschen?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      setTaskMessage(error.message || "Einsatz konnte nicht gelöscht werden.");
      return;
    }
    if (task.employee_name) {
      await sendPushToEmployee(task.employee_name, "Einsatz gelöscht", `${task.site || "Einsatz"} am ${task.task_date}`, "/mitarbeiter?tab=schedule");
    }
    await loadTasks();
  }

  async function geocodeAddress() {
    setSiteMessage("");

    if (!siteAddress.trim()) {
      setSiteMessage("Bitte Adresse eintragen.");
      return;
    }

    setGeoLoading(true);

    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: siteAddress.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        setSiteMessage(result.error || "GPS konnte nicht ermittelt werden.");
        setGeoLoading(false);
        return;
      }

      setSiteLat(String(result.latitude));
      setSiteLng(String(result.longitude));
      setSiteMessage("GPS wurde ermittelt.");
    } catch (error) {
      setSiteMessage(error instanceof Error ? error.message : "GPS konnte nicht ermittelt werden.");
    }

    setGeoLoading(false);
  }

  function resetSiteForm() {
    setSiteId("");
    setSiteName("");
    setSiteAddress("");
    setSiteRadius("50");
    setSiteLat("");
    setSiteLng("");
    setSiteNotes("");
    setSiteMessage("");
  }

  function editSite(site: WorkSite) {
    setSiteId(site.id);
    setSiteName(site.name || "");
    setSiteAddress(site.address || "");
    setSiteRadius(String(site.allowed_radius_m || 50));
    setSiteLat(site.latitude === null ? "" : String(site.latitude));
    setSiteLng(site.longitude === null ? "" : String(site.longitude));
    setSiteNotes(site.notes || "");
    setActiveTab("objekte");
  }

  async function saveSite() {
    setSiteMessage("");

    if (!siteName.trim() || !siteAddress.trim()) {
      setSiteMessage("Objektname und Adresse sind Pflicht.");
      return;
    }

    const latitude = Number(siteLat);
    const longitude = Number(siteLng);
    const radius = Number(siteRadius || 50);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      setSiteMessage("Bitte zuerst GPS ermitteln.");
      return;
    }

    const payload = {
      name: siteName.trim(),
      address: siteAddress.trim(),
      latitude,
      longitude,
      allowed_radius_m: radius,
      notes: siteNotes.trim() || null,
      active: true,
    };

    const request = siteId
      ? supabase.from("work_sites").update(payload).eq("id", siteId)
      : supabase.from("work_sites").insert([payload]);

    const { error } = await request;

    if (error) {
      setSiteMessage(error.message || "Objekt konnte nicht gespeichert werden.");
      return;
    }

    resetSiteForm();
    await loadWorkSites();
    setSiteMessage("Objekt wurde gespeichert.");
  }

  async function deactivateSite(id: string) {
    if (!window.confirm("Objekt deaktivieren?")) return;
    const { error } = await supabase.from("work_sites").update({ active: false }).eq("id", id);
    if (error) {
      setSiteMessage(error.message || "Objekt konnte nicht deaktiviert werden.");
      return;
    }
    await loadWorkSites();
  }

  async function createEmployeeInvite() {
    setInviteMessage("");
    setInviteLink("");

    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteMessage("Bitte Name und E-Mail eintragen.");
      return;
    }

    const token = await getAccessToken();

    const response = await fetch("/api/admin/create-employee-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: inviteName.trim(), email: inviteEmail.trim(), phone: invitePhone.trim() }),
    });

    const result = await response.json();

    if (!response.ok) {
      setInviteMessage(result.error || "Einladung konnte nicht erstellt werden.");
      return;
    }

    setInviteLink(result.inviteLink || "");
    setInviteMessage("Einladung wurde erstellt.");
    setInviteName("");
    setInviteEmail("");
    setInvitePhone("");
    await loadEmployeeProfiles();
  }

  async function resetEmployeePassword() {
    setEmployeeMessage("");
    const employee = employeeProfiles.find((item) => item.id === resetEmployeeId);

    if (!employee?.auth_user_id || resetPassword.length < 6) {
      setEmployeeMessage("Bitte Mitarbeiter wählen und Passwort mit mindestens 6 Zeichen eintragen.");
      return;
    }

    const token = await getAccessToken();

    const response = await fetch("/api/admin/reset-employee-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ authUserId: employee.auth_user_id, password: resetPassword }),
    });

    const result = await response.json();
    setEmployeeMessage(result.message || result.error || "Passwort wurde geändert.");
    setResetPassword("");
  }

  async function updateEmployee(employee: EmployeeProfile, updates: Partial<EmployeeProfile>) {
    const { error } = await supabase.from("employee_profiles").update(updates).eq("id", employee.id);
    if (error) {
      setEmployeeMessage(error.message || "Mitarbeiter konnte nicht geändert werden.");
      return;
    }
    await loadEmployeeProfiles();
  }

  async function addCorrectionEntry() {
    setCorrectionMessage("");

    if (!correctionEmployee || !correctionSite || !correctionReason.trim()) {
      setCorrectionMessage("Bitte Mitarbeiter, Objekt und Grund eintragen.");
      return;
    }

    const employee = employeeProfiles.find((item) => item.name === correctionEmployee);
    const date = new Date(`${correctionDate}T${correctionTime}:00`);

    const { error } = await supabase.from("time_entries").insert([
      {
        employee_id: employee?.id || null,
        employee_name: correctionEmployee,
        work_site_name: correctionSite,
        action: correctionAction,
        success: true,
        created_at: date.toISOString(),
        correction_reason: correctionReason.trim(),
        corrected_by: "Admin",
        corrected_at: new Date().toISOString(),
        approved: true,
        status: "approved",
      },
    ]);

    if (error) {
      setCorrectionMessage(error.message || "Stempelung konnte nicht gespeichert werden.");
      return;
    }

    setCorrectionReason("");
    setCorrectionMessage("Stempelung wurde gespeichert.");
    await loadEntries();
  }

  async function setEntryApproval(entry: Entry, approved: boolean) {
    const { error } = await supabase
      .from("time_entries")
      .update({ approved, status: approved ? "approved" : "rejected" })
      .eq("id", entry.id);

    if (error) {
      setCorrectionMessage(error.message || "Status konnte nicht gespeichert werden.");
      return;
    }

    await loadEntries();
  }

  async function deleteEntry(entry: Entry) {
    if (!window.confirm("Stempelung wirklich löschen?")) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", entry.id);
    if (error) {
      setCorrectionMessage(error.message || "Stempelung konnte nicht gelöscht werden.");
      return;
    }
    await loadEntries();
  }

  async function decideOvertime(note: AdminNotification, decision: "approved" | "rejected") {
    await supabase
      .from("admin_notifications")
      .update({ status: decision, read: true })
      .eq("id", note.id);

    if (note.employee_name) {
      await sendPushToEmployee(
        note.employee_name,
        decision === "approved" ? "Zeit freigegeben" : "Zeit abgelehnt",
        decision === "approved" ? "Deine Überzeit wurde genehmigt." : "Deine Überzeit wurde abgelehnt.",
        "/mitarbeiter"
      );
    }

    await loadNotifications();
  }

  async function loadAdminChatMessages(employeeName?: string) {
    const selectedName = employeeName || selectedChatEmployee;
    let query = supabase
      .from("chat_messages")
      .select("id, employee_name, sender_role, sender_name, message, read_by_admin, read_by_employee, created_at")
      .order("created_at", { ascending: true })
      .limit(200);

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
    setChatMessage("");

    if (!selectedChatEmployee || !chatText.trim()) {
      setChatMessage("Bitte Mitarbeiter auswählen und Nachricht schreiben.");
      return;
    }

    const text = chatText.trim();
    setChatText("");

    const { error } = await supabase.from("chat_messages").insert([
      {
        employee_name: selectedChatEmployee,
        sender_role: "admin",
        sender_name: "Admin",
        message: text,
        read_by_admin: true,
        read_by_employee: false,
      },
    ]);

    if (error) {
      setChatText(text);
      setChatMessage(error.message || "Nachricht konnte nicht gesendet werden.");
      return;
    }

    await sendPushToEmployee(selectedChatEmployee, "Neue Nachricht", text, "/mitarbeiter?tab=chat");
    await loadAdminChatMessages(selectedChatEmployee);
  }

  async function uploadMaterialImage(file: File | null) {
    setMaterialMessage("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMaterialMessage("Bitte ein Bild auswählen.");
      return;
    }

    setMaterialUploading(true);
    const fileExt = file.name.split(".").pop() || "jpg";
    const filePath = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { error } = await supabase.storage.from("materials").upload(filePath, file, { upsert: true });

    if (error) {
      setMaterialMessage(error.message || "Bild konnte nicht hochgeladen werden.");
      setMaterialUploading(false);
      return;
    }

    const { data } = supabase.storage.from("materials").getPublicUrl(filePath);
    setMaterialImageUrl(data.publicUrl);
    setMaterialMessage("Bild wurde hochgeladen.");
    setMaterialUploading(false);
  }

  function resetMaterialForm() {
    setMaterialId("");
    setMaterialName("");
    setMaterialCategory("");
    setMaterialUnit("Stück");
    setMaterialStock("0");
    setMaterialMinStock("0");
    setMaterialImageUrl("");
    setMaterialNotes("");
    setMaterialMessage("");
  }

  function editMaterial(product: MaterialProduct) {
    setMaterialId(product.id);
    setMaterialName(product.name || "");
    setMaterialCategory(product.category || "");
    setMaterialUnit(product.unit || "Stück");
    setMaterialStock(String(product.current_stock || 0));
    setMaterialMinStock(String(product.min_stock || 0));
    setMaterialImageUrl(product.image_url || "");
    setMaterialNotes(product.notes || "");
  }

  async function saveMaterialProduct() {
    setMaterialMessage("");

    if (!materialName.trim()) {
      setMaterialMessage("Bitte Produktname eintragen.");
      return;
    }

    const payload = {
      name: materialName.trim(),
      category: materialCategory.trim() || null,
      unit: materialUnit.trim() || "Stück",
      current_stock: Number(materialStock || 0),
      min_stock: Number(materialMinStock || 0),
      image_url: materialImageUrl || null,
      notes: materialNotes.trim() || null,
    };

    const request = materialId
      ? supabase.from("material_products").update(payload).eq("id", materialId)
      : supabase.from("material_products").insert([payload]);

    const { error } = await request;

    if (error) {
      setMaterialMessage(error.message || "Produkt konnte nicht gespeichert werden.");
      return;
    }

    resetMaterialForm();
    await loadMaterialProducts();
    setMaterialMessage("Produkt wurde gespeichert.");
  }

  async function deleteMaterialProduct(product: MaterialProduct) {
    if (!window.confirm("Produkt wirklich löschen?")) return;
    const { error } = await supabase.from("material_products").delete().eq("id", product.id);
    if (error) {
      setMaterialMessage(error.message || "Produkt konnte nicht gelöscht werden.");
      return;
    }
    await loadMaterialProducts();
  }

  async function createAbsence() {
    setAbsenceMessage("");
    if (!absenceEmployee || !absenceType || !absenceStart || !absenceEnd) {
      setAbsenceMessage("Bitte alle Pflichtfelder ausfüllen.");
      return;
    }

    const { error } = await supabase.from("absence_requests").insert([
      {
        employee_name: absenceEmployee,
        absence_type: absenceType,
        start_date: absenceStart,
        end_date: absenceEnd,
        reason: absenceReason.trim() || null,
        status: "open",
      },
    ]);

    if (error) {
      setAbsenceMessage(error.message || "Abwesenheit konnte nicht gespeichert werden.");
      return;
    }

    setAbsenceReason("");
    setAbsenceMessage("Abwesenheit wurde angelegt.");
    await loadAbsenceRequests();
  }

  async function decideAbsence(item: AbsenceRequest, decision: "approved" | "rejected") {
    const { error } = await supabase.from("absence_requests").update({ status: decision }).eq("id", item.id);
    if (error) {
      setAbsenceMessage(error.message || "Abwesenheit konnte nicht geändert werden.");
      return;
    }
    await sendPushToEmployee(item.employee_name, decision === "approved" ? "Abwesenheit genehmigt" : "Abwesenheit abgelehnt", `${item.absence_type}: ${item.start_date} bis ${item.end_date}`);
    await loadAbsenceRequests();
  }

  const pendingTimeRows = entries.filter((entry) => entry.status !== "approved" && entry.status !== "rejected").slice(0, 100);

  const monthlyStats = useMemo(() => {
    const map = new Map<string, { minutes: number; entries: number; cost: number }>();
    const monthKey = dateToInput(selectedDate).slice(0, 7);
    const sorted = [...entries]
      .filter((entry) => entry.created_at.startsWith(monthKey))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    for (const employee of activeEmployees) {
      const employeeEntries = sorted.filter((entry) => entry.employee_name === employee.name);
      let total = 0;
      let lastStart: Date | null = null;

      employeeEntries.forEach((entry) => {
        const time = new Date(entry.created_at);
        if (entry.action === "start" || entry.action === "break_end") lastStart = time;
        if ((entry.action === "break_start" || entry.action === "end") && lastStart) {
          total += (time.getTime() - lastStart.getTime()) / 1000 / 60;
          lastStart = null;
        }
      });

      const rate = Number(employee.hourly_rate || 0);
      const factor = Number(employee.employer_cost_factor || 1);
      map.set(employee.name, { minutes: Math.floor(total), entries: employeeEntries.length, cost: (total / 60) * rate * factor });
    }

    return map;
  }, [activeEmployees, entries, selectedDate]);

  if (loading) return <main className="p-8">Lade...</main>;

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">Kein Zugriff</h1>
          <p className="mt-2 text-slate-500">Dieser Bereich ist nur für den Admin sichtbar.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col bg-[#151d37] text-white lg:flex">
          <div className="flex items-center gap-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2a3b74] text-xl font-bold">C</div>
            <div>
              <p className="font-bold leading-tight">Matteo Stano Clean</p>
              <p className="font-bold leading-tight">Gebäudereinigung</p>
            </div>
            <span className="ml-auto">🔔</span>
          </div>

          <div className="mx-5 mb-4 flex items-center gap-2 rounded-lg bg-[#334274] px-4 py-3 text-sm">
            <span>🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent outline-none placeholder:text-slate-300" placeholder="Suche" />
          </div>

          <nav className="flex-1 overflow-y-auto px-2 pb-5">
            <SidebarButton active={activeTab === "planung"} icon="🗓️" label="Einsatzplaner" onClick={() => setActiveTab("planung")} />
            <SidebarButton active={activeTab === "zeitfreigabe"} icon="⏱️" label="Zeitenfreigabe" onClick={() => setActiveTab("zeitfreigabe")} />
            <SidebarButton active={activeTab === "abwesenheiten"} icon="✈️" label="Abwesenheiten" badge={pendingAbsences} onClick={() => setActiveTab("abwesenheiten")} />
            <SidebarButton active={activeTab === "lohn"} icon="💰" label="Lohnabrechnung" onClick={() => setActiveTab("lohn")} />

            <Divider />
            <SidebarButton active={activeTab === "mitarbeiter"} icon="👥" label="Mitarbeiter" onClick={() => setActiveTab("mitarbeiter")} />
            <SidebarButton active={activeTab === "objekte"} icon="🏢" label="Objekte" onClick={() => setActiveTab("objekte")} />
            <SidebarButton active={activeTab === "aufgaben"} icon="🧾" label="Aufgaben" onClick={() => setActiveTab("aufgaben")} />
            <SidebarButton active={activeTab === "material"} icon="📦" label="Materialwesen" onClick={() => setActiveTab("material")} />
            <SidebarButton active={activeTab === "geraete"} icon="🔧" label="Geräte" onClick={() => setActiveTab("geraete")} />
            <SidebarButton active={activeTab === "schluessel"} icon="🔑" label="Schlüssel" onClick={() => setActiveTab("schluessel")} />

            <Divider />
            <SidebarButton active={activeTab === "faktura"} icon="📊" label="Faktura" onClick={() => setActiveTab("faktura")} />
            <SidebarButton active={activeTab === "chat"} icon="💬" label="Chat" onClick={() => setActiveTab("chat")} />
            <SidebarButton active={activeTab === "hilfe"} icon="⚽" label="Hilfe" onClick={() => setActiveTab("hilfe")} />
            <SidebarButton active={activeTab === "einstellungen"} icon="⚙️" label="Einstellungen" onClick={() => setActiveTab("einstellungen")} />
          </nav>

          <div className="border-t border-white/10 p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-600" />
              <div>
                <p className="font-bold">Matteo Stano</p>
                <p className="text-sm text-slate-300">Admin</p>
              </div>
              <span className="ml-auto">⋮</span>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 lg:ml-[280px]">
          <TopBar openNotifications={openNotifications} onRefresh={loadData} />

          <div className="p-4 lg:p-6">
            {activeTab === "planung" && (
              <PlannerView
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                week={week}
                employees={activeEmployees}
                tasksForDayAndEmployee={tasksForDayAndEmployee}
                openCreateTask={openCreateTask}
                openEditTask={openEditTask}
                deleteTask={deleteTask}
                taskMessage={taskMessage}
                search={search}
              />
            )}

            {activeTab === "zeitfreigabe" && (
              <TimeApprovalView
                entries={pendingTimeRows}
                allEntries={entries}
                employees={activeEmployees}
                workSites={activeSites}
                correctionEmployee={correctionEmployee}
                setCorrectionEmployee={setCorrectionEmployee}
                correctionSite={correctionSite}
                setCorrectionSite={setCorrectionSite}
                correctionAction={correctionAction}
                setCorrectionAction={setCorrectionAction}
                correctionDate={correctionDate}
                setCorrectionDate={setCorrectionDate}
                correctionTime={correctionTime}
                setCorrectionTime={setCorrectionTime}
                correctionReason={correctionReason}
                setCorrectionReason={setCorrectionReason}
                addCorrectionEntry={addCorrectionEntry}
                correctionMessage={correctionMessage}
                setEntryApproval={setEntryApproval}
                deleteEntry={deleteEntry}
              />
            )}

            {activeTab === "abwesenheiten" && (
              <AbsenceView
                employees={activeEmployees}
                absenceRequests={absenceRequests}
                absenceEmployee={absenceEmployee}
                setAbsenceEmployee={setAbsenceEmployee}
                absenceType={absenceType}
                setAbsenceType={setAbsenceType}
                absenceStart={absenceStart}
                setAbsenceStart={setAbsenceStart}
                absenceEnd={absenceEnd}
                setAbsenceEnd={setAbsenceEnd}
                absenceReason={absenceReason}
                setAbsenceReason={setAbsenceReason}
                createAbsence={createAbsence}
                decideAbsence={decideAbsence}
                absenceMessage={absenceMessage}
              />
            )}

            {activeTab === "lohn" && <PayrollView employees={activeEmployees} monthlyStats={monthlyStats} />}

            {activeTab === "mitarbeiter" && (
              <EmployeeView
                employees={filteredEmployees()}
                inviteName={inviteName}
                setInviteName={setInviteName}
                inviteEmail={inviteEmail}
                setInviteEmail={setInviteEmail}
                invitePhone={invitePhone}
                setInvitePhone={setInvitePhone}
                createEmployeeInvite={createEmployeeInvite}
                inviteMessage={inviteMessage}
                inviteLink={inviteLink}
                resetEmployeeId={resetEmployeeId}
                setResetEmployeeId={setResetEmployeeId}
                resetPassword={resetPassword}
                setResetPassword={setResetPassword}
                resetEmployeePassword={resetEmployeePassword}
                employeeMessage={employeeMessage}
                updateEmployee={updateEmployee}
              />
            )}

            {activeTab === "objekte" && (
              <ObjectView
                sites={activeSites}
                siteId={siteId}
                siteName={siteName}
                setSiteName={setSiteName}
                siteAddress={siteAddress}
                setSiteAddress={setSiteAddress}
                siteRadius={siteRadius}
                setSiteRadius={setSiteRadius}
                siteLat={siteLat}
                setSiteLat={setSiteLat}
                siteLng={siteLng}
                setSiteLng={setSiteLng}
                siteNotes={siteNotes}
                setSiteNotes={setSiteNotes}
                geocodeAddress={geocodeAddress}
                geoLoading={geoLoading}
                saveSite={saveSite}
                resetSiteForm={resetSiteForm}
                editSite={editSite}
                deactivateSite={deactivateSite}
                siteMessage={siteMessage}
              />
            )}

            {activeTab === "aufgaben" && <TaskListView tasks={tasks} openEditTask={openEditTask} deleteTask={deleteTask} />}

            {activeTab === "material" && (
              <MaterialView
                products={materialProducts}
                materialId={materialId}
                materialName={materialName}
                setMaterialName={setMaterialName}
                materialCategory={materialCategory}
                setMaterialCategory={setMaterialCategory}
                materialUnit={materialUnit}
                setMaterialUnit={setMaterialUnit}
                materialStock={materialStock}
                setMaterialStock={setMaterialStock}
                materialMinStock={materialMinStock}
                setMaterialMinStock={setMaterialMinStock}
                materialImageUrl={materialImageUrl}
                materialNotes={materialNotes}
                setMaterialNotes={setMaterialNotes}
                uploadMaterialImage={uploadMaterialImage}
                materialUploading={materialUploading}
                saveMaterialProduct={saveMaterialProduct}
                resetMaterialForm={resetMaterialForm}
                editMaterial={editMaterial}
                deleteMaterialProduct={deleteMaterialProduct}
                materialMessage={materialMessage}
              />
            )}

            {activeTab === "chat" && (
              <ChatView
                employees={activeEmployees}
                selectedChatEmployee={selectedChatEmployee}
                setSelectedChatEmployee={(name) => {
                  setSelectedChatEmployee(name);
                  loadAdminChatMessages(name);
                }}
                messages={chatMessages.filter((msg) => !selectedChatEmployee || msg.employee_name === selectedChatEmployee)}
                chatText={chatText}
                setChatText={setChatText}
                sendChatMessage={sendChatMessage}
                chatMessage={chatMessage}
              />
            )}

            {["geraete", "schluessel", "faktura", "hilfe", "einstellungen"].includes(activeTab) && (
              <PlaceholderView title={tabTitle(activeTab)} />
            )}
          </div>
        </section>
      </div>

      {showTaskModal && (
        <TaskModal
          close={() => setShowTaskModal(false)}
          editingTaskId={editingTaskId}
          plannerMode={plannerMode}
          setPlannerMode={setPlannerMode}
          taskSiteId={taskSiteId}
          setTaskSiteId={setTaskSiteId}
          sites={activeSites}
          taskTitle={taskTitle}
          setTaskTitle={setTaskTitle}
          taskDate={taskDate}
          setTaskDate={setTaskDate}
          taskStartTime={taskStartTime}
          setTaskStartTime={setTaskStartTime}
          taskEndTime={taskEndTime}
          setTaskEndTime={setTaskEndTime}
          taskRepeatEvery={taskRepeatEvery}
          setTaskRepeatEvery={setTaskRepeatEvery}
          taskRepeatWeekday={taskRepeatWeekday}
          setTaskRepeatWeekday={setTaskRepeatWeekday}
          taskRepeatEndDate={taskRepeatEndDate}
          setTaskRepeatEndDate={setTaskRepeatEndDate}
          employees={activeEmployees}
          taskEmployee={taskEmployee}
          setTaskEmployee={setTaskEmployee}
          taskNotes={taskNotes}
          setTaskNotes={setTaskNotes}
          notifyEmployee={notifyEmployee}
          setNotifyEmployee={setNotifyEmployee}
          saveTask={saveTask}
          message={taskMessage}
        />
      )}
    </main>
  );
}

function tabTitle(tab: string) {
  const titles: Record<string, string> = {
    geraete: "Geräte",
    schluessel: "Schlüssel",
    faktura: "Faktura",
    hilfe: "Hilfe",
    einstellungen: "Einstellungen",
  };
  return titles[tab] || tab;
}

function SidebarButton({ active, icon, label, badge, onClick }: { active: boolean; icon: string; label: string; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "mb-1 flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left font-bold" : "mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-white/10"}
    >
      <span className="w-6 text-center">{icon}</span>
      <span>{label}</span>
      {!!badge && badge > 0 && <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs">{badge}</span>}
    </button>
  );
}

function Divider() {
  return <div className="my-5 border-t border-white/15" />;
}

function TopBar({ openNotifications, onRefresh }: { openNotifications: number; onRefresh: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">CleanTrack Admin</p>
          <h1 className="text-xl font-bold">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onRefresh} className="rounded-xl border px-4 py-2 text-sm font-bold">Aktualisieren</button>
          <div className="relative rounded-xl border px-4 py-2">
            🔔
            {openNotifications > 0 && <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">{openNotifications}</span>}
          </div>
        </div>
      </div>
    </header>
  );
}

function PlannerView({ selectedDate, setSelectedDate, week, employees, tasksForDayAndEmployee, openCreateTask, openEditTask, deleteTask, taskMessage, search }: {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  week: Date[];
  employees: EmployeeProfile[];
  tasksForDayAndEmployee: (date: Date, employeeName: string) => Task[];
  openCreateTask: (date?: Date, employeeName?: string) => void;
  openEditTask: (task: Task) => void;
  deleteTask: (task: Task) => void;
  taskMessage: string;
  search: string;
}) {
  const visibleEmployees = employees.filter((employee) => !search || employee.name.toLowerCase().includes(search.toLowerCase()));
  const monday = week[0];
  const sunday = week[6];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="rounded-lg border bg-white px-4 py-3" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>‹</button>
          <button className="rounded-lg border bg-white px-4 py-3" onClick={() => setSelectedDate(new Date())}>Heute</button>
          <button className="rounded-lg border bg-white px-4 py-3" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>›</button>
          <div className="rounded-lg border bg-white px-4 py-3 text-sm font-medium">📅 {monday.toLocaleDateString("de-DE")} → {sunday.toLocaleDateString("de-DE")}</div>
        </div>
        <button className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white" onClick={() => openCreateTask(selectedDate)}>⊕ Einsatz erstellen</button>
      </div>

      {taskMessage && <p className="mb-3 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-700">{taskMessage}</p>}

      <div className="mb-4 flex flex-wrap gap-3">
        <FilterBox label="Mitarbeitergruppen" />
        <FilterBox label="Objekte" />
        <button className="rounded-xl px-3 text-sm text-slate-400">+ Filter hinzufügen</button>
      </div>

      <div className="overflow-auto rounded-xl border bg-white">
        <div className="grid min-w-[1260px] grid-cols-[260px_repeat(7,1fr)] border-b bg-slate-50">
          <div className="border-r p-5 font-bold text-slate-500">Mitarbeiter</div>
          {week.map((date) => (
            <div key={date.toISOString()} className="border-r p-4 text-center font-bold text-slate-500">
              <p>{date.toLocaleDateString("de-DE", { weekday: "short" })}</p>
              <p>{date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</p>
            </div>
          ))}
        </div>

        {visibleEmployees.map((employee) => (
          <div key={employee.id} className="grid min-w-[1260px] grid-cols-[260px_repeat(7,1fr)] border-b">
            <div className="flex items-center gap-3 border-r p-4">
              <Avatar employee={employee} />
              <div>
                <p className="font-bold">{employee.name}</p>
                <div className="mt-3 flex gap-2">
                  <div className="h-1.5 w-20 rounded-full bg-red-500" />
                  <div className="h-1.5 w-20 rounded-full bg-red-500" />
                </div>
              </div>
            </div>

            {week.map((date) => {
              const dayTasks = tasksForDayAndEmployee(date, employee.name);
              return (
                <div key={date.toISOString()} className="min-h-[112px] border-r bg-white p-2">
                  {dayTasks.slice(0, 2).map((task) => (
                    <div key={task.id} className="mb-2 rounded-md border bg-white p-2 text-xs shadow-sm ring-1 ring-slate-100">
                      <div className="flex justify-between text-slate-500">
                        <span>{task.start_time} → {task.end_time}</span>
                        <span>👤 ↻</span>
                      </div>
                      <p className="mt-1 truncate font-bold">{task.site}</p>
                      <p className="mt-1 inline-block rounded bg-orange-100 px-2 py-0.5 text-[11px] text-orange-600">● {task.title}</p>
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => openEditTask(task)} className="text-blue-600">Bearbeiten</button>
                        <button onClick={() => deleteTask(task)} className="text-red-600">Löschen</button>
                      </div>
                    </div>
                  ))}
                  {dayTasks.length > 2 && <p className="text-xs text-slate-400">+ weitere {dayTasks.length - 2}</p>}
                  {dayTasks.length === 0 && <button onClick={() => openCreateTask(date, employee.name)} className="h-full w-full rounded-md text-xs text-slate-300 hover:bg-blue-50">+ Einsatz</button>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterBox({ label }: { label: string }) {
  return <button className="rounded-xl border bg-white px-4 py-3 text-sm text-slate-500">{label}⌄</button>;
}

function Avatar({ employee }: { employee: EmployeeProfile }) {
  return employee.avatar_url ? (
    <img src={employee.avatar_url} alt={employee.name} className="h-12 w-12 rounded-full object-cover" />
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 font-bold text-white">{initials(employee.name)}</div>
  );
}

function TaskModal(props: {
  close: () => void;
  editingTaskId: string;
  plannerMode: PlannerMode;
  setPlannerMode: (value: PlannerMode) => void;
  taskSiteId: string;
  setTaskSiteId: (value: string) => void;
  sites: WorkSite[];
  taskTitle: string;
  setTaskTitle: (value: string) => void;
  taskDate: string;
  setTaskDate: (value: string) => void;
  taskStartTime: string;
  setTaskStartTime: (value: string) => void;
  taskEndTime: string;
  setTaskEndTime: (value: string) => void;
  taskRepeatEvery: string;
  setTaskRepeatEvery: (value: string) => void;
  taskRepeatWeekday: string;
  setTaskRepeatWeekday: (value: string) => void;
  taskRepeatEndDate: string;
  setTaskRepeatEndDate: (value: string) => void;
  employees: EmployeeProfile[];
  taskEmployee: string;
  setTaskEmployee: (value: string) => void;
  taskNotes: string;
  setTaskNotes: (value: string) => void;
  notifyEmployee: boolean;
  setNotifyEmployee: (value: boolean) => void;
  saveTask: () => void;
  message: string;
}) {
  const duration = minutesBetween(props.taskStartTime, props.taskEndTime);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b pb-4">
          <h2 className="text-xl font-bold">{props.editingTaskId ? "Einsatz bearbeiten" : "Einsatz erstellen"}</h2>
          <button onClick={props.close} className="text-2xl text-slate-500">×</button>
        </div>

        <div className="space-y-5">
          <Label title="Objekt*">
            <select value={props.taskSiteId} onChange={(e) => props.setTaskSiteId(e.target.value)} className="field">
              <option value="">Objekt auswählen</option>
              {props.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </Label>

          <Label title="Auftrag*">
            <input value={props.taskTitle} onChange={(e) => props.setTaskTitle(e.target.value)} className="field" placeholder="Auftrag auswählen" />
          </Label>

          <div className="rounded-xl bg-slate-50 p-5">
            <div className="mb-4 flex gap-2">
              <button className={props.plannerMode === "single" ? "rounded-lg border border-blue-400 bg-white px-4 py-2 font-bold text-blue-600" : "rounded-lg border bg-white px-4 py-2"} onClick={() => props.setPlannerMode("single")}>Einmalig</button>
              <button className={props.plannerMode === "repeat" ? "rounded-lg border border-blue-400 bg-white px-4 py-2 font-bold text-blue-600" : "rounded-lg border bg-white px-4 py-2"} onClick={() => props.setPlannerMode("repeat")}>Wiederholend</button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Label title={props.plannerMode === "repeat" ? "Startdatum*" : "Termin*"}><input type="date" value={props.taskDate} onChange={(e) => props.setTaskDate(e.target.value)} className="field" /></Label>
              <Label title="Von*"><input type="time" value={props.taskStartTime} onChange={(e) => props.setTaskStartTime(e.target.value)} className="field" /></Label>
              <Label title="Bis*"><input type="time" value={props.taskEndTime} onChange={(e) => props.setTaskEndTime(e.target.value)} className="field" /></Label>
              <Label title="Dauer"><div className="field flex items-center">{formatMinutes(duration)} Std.</div></Label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-500">⊕ Fahrzeit hinzufügen</button>
              <button className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-500">⊕ Pausenzeit hinzufügen</button>
            </div>

            {props.plannerMode === "repeat" && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-[auto_80px_1fr] items-end gap-3">
                  <p className="pb-3 text-sm text-slate-500">Wiederholen alle</p>
                  <input value={props.taskRepeatEvery} onChange={(e) => props.setTaskRepeatEvery(e.target.value)} className="field" />
                  <div className="field flex items-center">Woche</div>
                </div>
                <Label title="Wiederholen am">
                  <div className="flex gap-2">
                    {["1", "2", "3", "4", "5", "6", "0"].map((day, index) => (
                      <button key={day} onClick={() => props.setTaskRepeatWeekday(day)} className={props.taskRepeatWeekday === day ? "h-10 w-10 rounded-full bg-blue-100 text-blue-600" : "h-10 w-10 rounded-full border bg-white text-slate-500"}>{["M", "D", "M", "D", "F", "S", "S"][index]}</button>
                    ))}
                  </div>
                </Label>
                <Label title="Enddatum"><input type="date" value={props.taskRepeatEndDate} onChange={(e) => props.setTaskRepeatEndDate(e.target.value)} className="field" /></Label>
              </div>
            )}

            <div className="mt-5 border-t pt-5 text-right text-lg font-bold">Lohnzeit {formatMinutes(duration)} Std.</div>
          </div>

          <Label title="Mitarbeiter">
            <select value={props.taskEmployee} onChange={(e) => props.setTaskEmployee(e.target.value)} className="field">
              <option value="">Mitarbeiter auswählen</option>
              {props.employees.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}
            </select>
          </Label>

          <Label title="Kommentar">
            <textarea value={props.taskNotes} onChange={(e) => props.setTaskNotes(e.target.value)} className="field min-h-24" placeholder="Kommentar" />
          </Label>

          {props.message && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">{props.message}</p>}
        </div>

        <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-3 border-t bg-white py-4">
          <label className="flex items-center gap-2 text-sm text-slate-500"><input type="checkbox" checked={props.notifyEmployee} onChange={(e) => props.setNotifyEmployee(e.target.checked)} /> Mitarbeiter benachrichtigen</label>
          <div className="flex gap-3">
            <button onClick={props.close} className="rounded-xl border px-5 py-3 font-bold">Abbrechen</button>
            <button onClick={props.saveTask} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">⊕ {props.editingTaskId ? "Speichern" : "Erstellen"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-medium text-slate-500">{title}</p>
      {children}
    </label>
  );
}

function TimeApprovalView(props: {
  entries: Entry[];
  allEntries: Entry[];
  employees: EmployeeProfile[];
  workSites: WorkSite[];
  correctionEmployee: string;
  setCorrectionEmployee: (value: string) => void;
  correctionSite: string;
  setCorrectionSite: (value: string) => void;
  correctionAction: EntryAction;
  setCorrectionAction: (value: EntryAction) => void;
  correctionDate: string;
  setCorrectionDate: (value: string) => void;
  correctionTime: string;
  setCorrectionTime: (value: string) => void;
  correctionReason: string;
  setCorrectionReason: (value: string) => void;
  addCorrectionEntry: () => void;
  correctionMessage: string;
  setEntryApproval: (entry: Entry, approved: boolean) => void;
  deleteEntry: (entry: Entry) => void;
}) {
  return (
    <div>
      <PageHeader icon="⏱️" title="Zeitenfreigabe" actionLabel="Exportieren" />
      <div className="mb-5 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-6">
        <select value={props.correctionEmployee} onChange={(e) => props.setCorrectionEmployee(e.target.value)} className="field"><option value="">Mitarbeiter</option>{props.employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}</select>
        <select value={props.correctionSite} onChange={(e) => props.setCorrectionSite(e.target.value)} className="field"><option value="">Objekt</option>{props.workSites.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select>
        <select value={props.correctionAction} onChange={(e) => props.setCorrectionAction(e.target.value)} className="field"><option value="start">Start</option><option value="break_start">Pause Start</option><option value="break_end">Pause Ende</option><option value="end">Ende</option></select>
        <input type="date" value={props.correctionDate} onChange={(e) => props.setCorrectionDate(e.target.value)} className="field" />
        <input type="time" value={props.correctionTime} onChange={(e) => props.setCorrectionTime(e.target.value)} className="field" />
        <button onClick={props.addCorrectionEntry} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Korrektur speichern</button>
        <input value={props.correctionReason} onChange={(e) => props.setCorrectionReason(e.target.value)} className="field md:col-span-6" placeholder="Grund der Korrektur" />
      </div>
      {props.correctionMessage && <p className="mb-3 text-sm font-bold text-blue-600">{props.correctionMessage}</p>}

      <DataTable headers={["Datum", "Name", "Einsatz", "Fehler", "Soll-Zeit", "Abweichung", "Akzeptieren", "Ablehnen"]}>
        {props.entries.length === 0 ? <EmptyRow colSpan={8} /> : props.entries.map((entry) => (
          <tr key={entry.id} className="border-b">
            <td className="p-3">{new Date(entry.created_at).toLocaleString("de-DE")}</td>
            <td className="p-3 font-medium">{entry.employee_name}</td>
            <td className="p-3">{entry.work_site_name}</td>
            <td className="p-3">{actionText(entry.action)}</td>
            <td className="p-3">-</td>
            <td className="p-3">{entry.correction_reason || "Prüfen"}</td>
            <td className="p-3"><button onClick={() => props.setEntryApproval(entry, true)} className="rounded-lg bg-green-100 px-3 py-2 font-bold text-green-700">Bestätigen</button></td>
            <td className="p-3"><button onClick={() => props.setEntryApproval(entry, false)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Ablehnen</button></td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function PageHeader({ icon, title, actionLabel }: { icon: string; title: string; actionLabel?: string }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-xl">{icon}</div><h1 className="text-2xl font-bold">{title}</h1></div>
      {actionLabel && <button className="rounded-xl border bg-white px-5 py-3 text-sm font-bold">{actionLabel}</button>}
    </div>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-500"><tr>{headers.map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="p-20 text-center text-slate-400">Noch keine Daten hinterlegt</td></tr>;
}

function AbsenceView(props: {
  employees: EmployeeProfile[];
  absenceRequests: AbsenceRequest[];
  absenceEmployee: string;
  setAbsenceEmployee: (value: string) => void;
  absenceType: string;
  setAbsenceType: (value: string) => void;
  absenceStart: string;
  setAbsenceStart: (value: string) => void;
  absenceEnd: string;
  setAbsenceEnd: (value: string) => void;
  absenceReason: string;
  setAbsenceReason: (value: string) => void;
  createAbsence: () => void;
  decideAbsence: (item: AbsenceRequest, decision: "approved" | "rejected") => void;
  absenceMessage: string;
}) {
  const days = Array.from({ length: 28 }).map((_, i) => addDays(startOfWeek(new Date()), i));
  return (
    <div>
      <PageHeader icon="✈️" title="Abwesenheiten" actionLabel="Abwesenheit erstellen" />
      <div className="mb-5 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-6">
        <select value={props.absenceEmployee} onChange={(e) => props.setAbsenceEmployee(e.target.value)} className="field"><option value="">Mitarbeiter</option>{props.employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}</select>
        <select value={props.absenceType} onChange={(e) => props.setAbsenceType(e.target.value)} className="field"><option>Urlaub</option><option>Krankheit</option><option>Frei</option><option>Sonstiges</option></select>
        <input type="date" value={props.absenceStart} onChange={(e) => props.setAbsenceStart(e.target.value)} className="field" />
        <input type="date" value={props.absenceEnd} onChange={(e) => props.setAbsenceEnd(e.target.value)} className="field" />
        <input value={props.absenceReason} onChange={(e) => props.setAbsenceReason(e.target.value)} className="field" placeholder="Kommentar" />
        <button onClick={props.createAbsence} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Erstellen</button>
      </div>
      {props.absenceMessage && <p className="mb-3 text-sm font-bold text-blue-600">{props.absenceMessage}</p>}
      <div className="overflow-auto rounded-xl border bg-white">
        <div className="grid min-w-[1250px] grid-cols-[260px_repeat(28,1fr)] border-b">
          <div className="p-5 font-bold text-slate-500">Mitarbeiter</div>
          {days.map((day) => <div key={day.toISOString()} className="border-l p-2 text-center text-xs"><p>{day.toLocaleDateString("de-DE", { weekday: "short" })}</p><p className="font-bold">{day.getDate()}</p></div>)}
        </div>
        {props.employees.map((employee) => (
          <div key={employee.id} className="grid min-w-[1250px] grid-cols-[260px_repeat(28,1fr)] border-b">
            <div className="p-4 font-bold">{employee.name}</div>
            {days.map((day) => {
              const iso = dateToInput(day);
              const absence = props.absenceRequests.find((a) => a.employee_name === employee.name && a.start_date <= iso && a.end_date >= iso);
              return <div key={iso} className={absence ? "border-l bg-blue-100 p-2 text-xs text-blue-700" : "border-l p-2 text-xs"}>{absence ? absence.absence_type : ""}</div>;
            })}
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {props.absenceRequests.map((item) => (
          <div key={item.id} className="rounded-xl border bg-white p-4">
            <p className="font-bold">{item.employee_name}</p>
            <p className="text-sm text-slate-500">{item.absence_type}: {item.start_date} bis {item.end_date}</p>
            <p className="mt-1 text-sm">Status: {item.status || "open"}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => props.decideAbsence(item, "approved")} className="rounded-lg bg-green-100 px-3 py-2 text-sm font-bold text-green-700">Genehmigen</button>
              <button onClick={() => props.decideAbsence(item, "rejected")} className="rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-700">Ablehnen</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayrollView({ employees, monthlyStats }: { employees: EmployeeProfile[]; monthlyStats: Map<string, { minutes: number; entries: number; cost: number }> }) {
  return (
    <div>
      <PageHeader icon="💰" title="Lohnabrechnung" actionLabel="Exportieren" />
      <DataTable headers={["Name", "Stunden", "Einträge", "Stundensatz", "AG-Faktor", "Kosten"]}>
        {employees.map((employee) => {
          const stat = monthlyStats.get(employee.name) || { minutes: 0, entries: 0, cost: 0 };
          return <tr key={employee.id} className="border-b"><td className="p-3 font-bold">{employee.name}</td><td className="p-3">{formatMinutes(stat.minutes)}</td><td className="p-3">{stat.entries}</td><td className="p-3">{employee.hourly_rate || 0} €</td><td className="p-3">{employee.employer_cost_factor || 1}</td><td className="p-3 font-bold">{stat.cost.toFixed(2)} €</td></tr>;
        })}
      </DataTable>
    </div>
  );
}

function EmployeeView(props: {
  employees: EmployeeProfile[];
  inviteName: string;
  setInviteName: (value: string) => void;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  invitePhone: string;
  setInvitePhone: (value: string) => void;
  createEmployeeInvite: () => void;
  inviteMessage: string;
  inviteLink: string;
  resetEmployeeId: string;
  setResetEmployeeId: (value: string) => void;
  resetPassword: string;
  setResetPassword: (value: string) => void;
  resetEmployeePassword: () => void;
  employeeMessage: string;
  updateEmployee: (employee: EmployeeProfile, updates: Partial<EmployeeProfile>) => void;
}) {
  return (
    <div>
      <PageHeader icon="👥" title="Mitarbeiter" actionLabel="Exportieren" />
      <div className="mb-5 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
        <input value={props.inviteName} onChange={(e) => props.setInviteName(e.target.value)} className="field" placeholder="Name" />
        <input value={props.inviteEmail} onChange={(e) => props.setInviteEmail(e.target.value)} className="field" placeholder="E-Mail" />
        <input value={props.invitePhone} onChange={(e) => props.setInvitePhone(e.target.value)} className="field" placeholder="Telefon" />
        <button onClick={props.createEmployeeInvite} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Mitarbeiter erstellen</button>
        {props.inviteMessage && <p className="text-sm font-bold text-blue-600 md:col-span-4">{props.inviteMessage}</p>}
        {props.inviteLink && <p className="break-all rounded-lg bg-slate-50 p-3 text-xs md:col-span-4">{props.inviteLink}</p>}
      </div>

      <div className="mb-5 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-3">
        <select value={props.resetEmployeeId} onChange={(e) => props.setResetEmployeeId(e.target.value)} className="field"><option value="">Mitarbeiter wählen</option>{props.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <input type="password" value={props.resetPassword} onChange={(e) => props.setResetPassword(e.target.value)} className="field" placeholder="Neues Passwort" />
        <button onClick={props.resetEmployeePassword} className="rounded-xl bg-red-500 px-4 py-3 font-bold text-white">Passwort setzen</button>
        {props.employeeMessage && <p className="text-sm font-bold text-blue-600 md:col-span-3">{props.employeeMessage}</p>}
      </div>

      <DataTable headers={["Name", "Nummer", "Adresse", "Rolle", "Stundenlohn", "Status"]}>
        {props.employees.map((employee, index) => (
          <tr key={employee.id} className="border-b">
            <td className="p-3"><div className="flex items-center gap-3"><Avatar employee={employee} /><span className="font-bold">{employee.name}</span></div></td>
            <td className="p-3">{index + 1}</td>
            <td className="p-3">{employee.address || "-"}</td>
            <td className="p-3"><select value={employee.role || "employee"} onChange={(e) => props.updateEmployee(employee, { role: e.target.value })} className="rounded-lg border px-2 py-1"><option value="employee">Mitarbeiter</option><option value="admin">Admin</option></select></td>
            <td className="p-3"><input defaultValue={employee.hourly_rate || 0} onBlur={(e) => props.updateEmployee(employee, { hourly_rate: Number(e.target.value || 0) })} className="w-24 rounded-lg border px-2 py-1" /></td>
            <td className="p-3"><button onClick={() => props.updateEmployee(employee, { active: employee.active === false })} className={employee.active === false ? "rounded bg-slate-200 px-3 py-1 font-bold" : "rounded bg-green-500 px-3 py-1 font-bold text-white"}>{employee.active === false ? "Passiv" : "Aktiv"}</button></td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function ObjectView(props: {
  sites: WorkSite[];
  siteId: string;
  siteName: string;
  setSiteName: (value: string) => void;
  siteAddress: string;
  setSiteAddress: (value: string) => void;
  siteRadius: string;
  setSiteRadius: (value: string) => void;
  siteLat: string;
  setSiteLat: (value: string) => void;
  siteLng: string;
  setSiteLng: (value: string) => void;
  siteNotes: string;
  setSiteNotes: (value: string) => void;
  geocodeAddress: () => void;
  geoLoading: boolean;
  saveSite: () => void;
  resetSiteForm: () => void;
  editSite: (site: WorkSite) => void;
  deactivateSite: (id: string) => void;
  siteMessage: string;
}) {
  return (
    <div>
      <PageHeader icon="🏢" title="Objekte" />
      <div className="mb-6 rounded-xl border bg-white p-5">
        <p className="mb-4 text-slate-500">Adresse eingeben, GPS automatisch berechnen, Notizen speichern.</p>
        <div className="grid gap-3 lg:grid-cols-[1fr_2fr_120px_160px_160px_180px]">
          <input value={props.siteName} onChange={(e) => props.setSiteName(e.target.value)} className="field" placeholder="Objektname" />
          <input value={props.siteAddress} onChange={(e) => props.setSiteAddress(e.target.value)} className="field" placeholder="Adresse" />
          <input value={props.siteRadius} onChange={(e) => props.setSiteRadius(e.target.value)} className="field" placeholder="Radius" />
          <input value={props.siteLat} onChange={(e) => props.setSiteLat(e.target.value)} className="field" placeholder="Breitengrad" />
          <input value={props.siteLng} onChange={(e) => props.setSiteLng(e.target.value)} className="field" placeholder="Längengrad" />
          <button onClick={props.geocodeAddress} className="rounded-xl bg-purple-100 px-4 py-3 font-bold text-purple-700">{props.geoLoading ? "Prüfe..." : "GPS ermitteln"}</button>
          <textarea value={props.siteNotes} onChange={(e) => props.setSiteNotes(e.target.value)} className="field min-h-20 lg:col-span-4" placeholder="Notizen, Schlüssel, Zugang..." />
          <button onClick={props.saveSite} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">{props.siteId ? "Speichern" : "Speichern"}</button>
          <button onClick={props.resetSiteForm} className="rounded-xl bg-slate-100 px-4 py-3 font-bold">Neu</button>
        </div>
        {props.siteMessage && <p className="mt-3 text-sm font-bold text-blue-600">{props.siteMessage}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {props.sites.map((site) => (
          <div key={site.id} className="rounded-xl border bg-white p-5">
            <p className="text-lg font-bold">{site.name}</p>
            <p className="mt-1 text-sm text-slate-500">{site.address || "Keine Adresse"}</p>
            <p className="mt-2 text-sm">GPS: {site.latitude}, {site.longitude}</p>
            <p className="text-sm">Radius: {site.allowed_radius_m || 50} m</p>
            {site.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{site.notes}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => props.editSite(site)} className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700">Bearbeiten</button>
              <button onClick={() => props.deactivateSite(site.id)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Deaktivieren</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskListView({ tasks, openEditTask, deleteTask }: { tasks: Task[]; openEditTask: (task: Task) => void; deleteTask: (task: Task) => void }) {
  return (
    <div>
      <PageHeader icon="🧾" title="Aufgaben" />
      <DataTable headers={["Datum", "Zeit", "Objekt", "Mitarbeiter", "Auftrag", "Status", "Aktion"]}>
        {tasks.map((task) => <tr key={task.id} className="border-b"><td className="p-3">{task.task_date}</td><td className="p-3">{task.start_time} - {task.end_time}</td><td className="p-3">{task.site}</td><td className="p-3">{task.employee_name}</td><td className="p-3">{task.title}</td><td className="p-3">{task.done ? "Erledigt" : "Offen"}</td><td className="p-3"><button onClick={() => openEditTask(task)} className="mr-2 text-blue-600">Bearbeiten</button><button onClick={() => deleteTask(task)} className="text-red-600">Löschen</button></td></tr>)}
      </DataTable>
    </div>
  );
}

function MaterialView(props: {
  products: MaterialProduct[];
  materialId: string;
  materialName: string;
  setMaterialName: (value: string) => void;
  materialCategory: string;
  setMaterialCategory: (value: string) => void;
  materialUnit: string;
  setMaterialUnit: (value: string) => void;
  materialStock: string;
  setMaterialStock: (value: string) => void;
  materialMinStock: string;
  setMaterialMinStock: (value: string) => void;
  materialImageUrl: string;
  materialNotes: string;
  setMaterialNotes: (value: string) => void;
  uploadMaterialImage: (file: File | null) => void;
  materialUploading: boolean;
  saveMaterialProduct: () => void;
  resetMaterialForm: () => void;
  editMaterial: (product: MaterialProduct) => void;
  deleteMaterialProduct: (product: MaterialProduct) => void;
  materialMessage: string;
}) {
  return (
    <div>
      <PageHeader icon="📦" title="Materialwesen" />
      <div className="mb-6 rounded-xl border bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">Produkt anlegen</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <input value={props.materialName} onChange={(e) => props.setMaterialName(e.target.value)} className="field" placeholder="Produktname" />
          <input value={props.materialCategory} onChange={(e) => props.setMaterialCategory(e.target.value)} className="field" placeholder="Kategorie" />
          <input value={props.materialUnit} onChange={(e) => props.setMaterialUnit(e.target.value)} className="field" placeholder="Einheit" />
          <input type="number" value={props.materialStock} onChange={(e) => props.setMaterialStock(e.target.value)} className="field" placeholder="Bestand" />
          <input type="number" value={props.materialMinStock} onChange={(e) => props.setMaterialMinStock(e.target.value)} className="field" placeholder="Mindestbestand" />
          <input type="file" accept="image/*" onChange={(e: ChangeEvent<HTMLInputElement>) => props.uploadMaterialImage(e.target.files?.[0] || null)} className="field" />
          <textarea value={props.materialNotes} onChange={(e) => props.setMaterialNotes(e.target.value)} className="field min-h-20 md:col-span-4" placeholder="Notizen" />
          <button onClick={props.saveMaterialProduct} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">{props.materialId ? "Speichern" : "Anlegen"}</button>
          <button onClick={props.resetMaterialForm} className="rounded-xl bg-slate-100 px-4 py-3 font-bold">Neu</button>
        </div>
        {props.materialUploading && <p className="mt-3 text-sm text-slate-500">Bild wird hochgeladen...</p>}
        {props.materialImageUrl && <img src={props.materialImageUrl} alt="Material" className="mt-4 h-24 w-24 rounded-xl object-cover" />}
        {props.materialMessage && <p className="mt-3 text-sm font-bold text-blue-600">{props.materialMessage}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {props.products.map((product) => (
          <div key={product.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 h-40 overflow-hidden rounded-xl bg-slate-100">
              {product.image_url ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">📦</div>}
            </div>
            <p className="font-bold">{product.name}</p>
            <p className="text-sm text-slate-500">{product.category || "Ohne Kategorie"}</p>
            <p className="mt-2 text-sm">Bestand: <b>{product.current_stock || 0}</b> {product.unit || "Stück"}</p>
            <p className={(product.current_stock || 0) <= (product.min_stock || 0) ? "text-sm font-bold text-red-600" : "text-sm text-slate-500"}>Mindestbestand: {product.min_stock || 0}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => props.editMaterial(product)} className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700">Bearbeiten</button>
              <button onClick={() => props.deleteMaterialProduct(product)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Löschen</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatView(props: {
  employees: EmployeeProfile[];
  selectedChatEmployee: string;
  setSelectedChatEmployee: (name: string) => void;
  messages: ChatMessageDb[];
  chatText: string;
  setChatText: (value: string) => void;
  sendChatMessage: () => void;
  chatMessage: string;
}) {
  return (
    <div>
      <PageHeader icon="💬" title="Chat" />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="rounded-xl bg-slate-100 p-4">
          <h2 className="mb-3 font-bold">Mitarbeiter</h2>
          {props.employees.map((employee) => <button key={employee.id} onClick={() => props.setSelectedChatEmployee(employee.name)} className={props.selectedChatEmployee === employee.name ? "mb-2 w-full rounded-xl bg-blue-600 p-3 text-left font-bold text-white" : "mb-2 w-full rounded-xl bg-white p-3 text-left"}>{employee.name}</button>)}
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 font-bold">{props.selectedChatEmployee ? `Chat mit ${props.selectedChatEmployee}` : "Bitte Mitarbeiter auswählen"}</h2>
          <div className="mb-4 h-[55vh] overflow-y-auto rounded-xl bg-slate-50 p-4">
            {props.messages.length === 0 && <p className="text-center text-slate-400">Noch keine Nachrichten vorhanden.</p>}
            {props.messages.map((msg) => <div key={msg.id} className={msg.sender_role === "admin" ? "mb-3 ml-16 rounded-xl bg-blue-100 p-3" : "mb-3 mr-16 rounded-xl bg-white p-3"}><p className="text-sm font-bold">{msg.sender_role === "admin" ? "Ich" : msg.sender_name || msg.employee_name}</p><p>{msg.message}</p></div>)}
          </div>
          <div className="flex gap-2"><input value={props.chatText} onChange={(e) => props.setChatText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") props.sendChatMessage(); }} className="field" placeholder="Nachricht schreiben..." /><button onClick={props.sendChatMessage} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Senden</button></div>
          {props.chatMessage && <p className="mt-3 text-sm font-bold text-blue-600">{props.chatMessage}</p>}
        </div>
      </div>
    </div>
  );
}

function PlaceholderView({ title }: { title: string }) {
  return <div className="rounded-xl border bg-white p-10 text-center"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 text-slate-500">Dieser Bereich ist vorbereitet und kann als nächstes ausgebaut werden.</p></div>;
}

