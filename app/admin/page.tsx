"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Entry = {
  id: string;
  employee_name: string;
  work_site_name: string;
  action: string;
  created_at: string;
  auto_clock_out: boolean | null;
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
};

type EmployeeProfile = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  role: string | null;
  phone: string | null;
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
type AdminTab =
  | "dashboard"
  | "planung"
  | "objekte"
  | "einladen"
  | "aufgaben"
  | "mitarbeiter"
  | "stempelungen"
  | "kosten"
  | "chat"
  | "meldungen";

export default function AdminPage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [workSites, setWorkSites] = useState<WorkSite[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([]);
  const [, setTick] = useState(0);

  const [selectedDate, setSelectedDate] = useState(new Date());

  const [site, setSite] = useState("");
  const [employee, setEmployee] = useState("");
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("18:00");
  const [maxMinutes, setMaxMinutes] = useState("60");
  const [taskTitles, setTaskTitles] = useState<string[]>([""]);

  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteLat, setNewSiteLat] = useState("");
  const [newSiteLng, setNewSiteLng] = useState("");
  const [newSiteRadius, setNewSiteRadius] = useState("100");
  const [siteMessage, setSiteMessage] = useState("");

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

  const [chatText, setChatText] = useState("");
const [chatMessages, setChatMessages] = useState<ChatMessageDb[]>([]);
const [selectedChatEmployee, setSelectedChatEmployee] = useState("");
const [chatError, setChatError] = useState("");

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
  const interval = setInterval(() => {
    setTick((old) => old + 1);
  }, 60000);

  return () => clearInterval(interval);
}, []);

useEffect(() => {
  if (!allowed || activeTab !== "chat") return;

  loadAdminChatMessages(selectedChatEmployee);

  const timer = setInterval(() => {
    loadAdminChatMessages(selectedChatEmployee);
  }, 5000);

  return () => clearInterval(timer);
}, [allowed, activeTab, selectedChatEmployee]);

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
    await loadEntries();
    await loadTasks();
    await loadNotifications();
    await loadWorkSites();
    await loadEmployeeProfiles();
  }

  async function loadNotifications() {
    const { data } = await supabase
      .from("admin_notifications")
      .select(
        "id, title, message, employee_name, work_site_name, read, status, notification_type, overtime_minutes, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    setNotifications(data || []);
  }

  async function markNotificationAsRead(id: string) {
    await supabase
      .from("admin_notifications")
      .update({ read: true })
      .eq("id", id);

    setNotifications((old) =>
      old.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  }

  async function decideOvertime(id: string, decision: "approved" | "rejected") {
    await supabase
      .from("admin_notifications")
      .update({
        status: decision,
        read: true,
      })
      .eq("id", id);

    setNotifications((old) =>
      old.map((item) =>
        item.id === id ? { ...item, status: decision, read: true } : item
      )
    );
  }

  async function loadEntries() {
    const { data } = await supabase
      .from("time_entries")
      .select("id, employee_name, work_site_name, action, created_at, auto_clock_out")
      .order("created_at", { ascending: false })
      .limit(300);

    setEntries(data || []);
  }

  async function loadTasks() {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, site, employee_name, task_date, done, start_time, end_time, max_minutes")
      .order("task_date", { ascending: true });

    setTasks(data || []);
  }

  async function loadWorkSites() {
    const { data } = await supabase
      .from("work_sites")
      .select("id, name, latitude, longitude, allowed_radius_m")
      .order("name");

    setWorkSites(data || []);
  }

  async function loadEmployeeProfiles() {
    const { data } = await supabase
      .from("employee_profiles")
.select("id, auth_user_id, name, email, role, phone")
      .eq("role", "employee")
      .order("name");

    setEmployeeProfiles(data || []);
  }

  const employees = Array.from(
    new Set(entries.map((entry) => entry.employee_name).filter(Boolean))
  );

  const doneTasks = tasks.filter((task) => task.done).length;
  const openTasks = tasks.filter((task) => !task.done).length;
  const openNotifications = notifications.filter((note) => !note.read).length;

  const selectedISO = selectedDate.toISOString().split("T")[0];

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

  function getLastEntry(employeeName: string) {
    return entries.find((entry) => entry.employee_name === employeeName);
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

  function employeeWorkStatus(employeeName: string) {
    const lastEntry = getLastEntry(employeeName);

    if (!lastEntry) {
      return {
        text: "Noch nicht eingestempelt",
        color: "bg-red-100 text-red-700",
      };
    }

    if (lastEntry.action === "start" || lastEntry.action === "break_end") {
      return {
        text: "Arbeitet gerade",
        color: "bg-green-100 text-green-700",
      };
    }

    if (lastEntry.action === "break_start") {
      return {
        text: "In Pause",
        color: "bg-purple-100 text-purple-700",
      };
    }

    return {
      text: "Ausgestempelt",
      color: "bg-gray-100 text-gray-700",
    };
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
    const cleanTasks = taskTitles.filter((task) => task.trim());

    if (!site.trim() || !employee.trim() || cleanTasks.length === 0) {
      alert("Bitte Objekt, Mitarbeiter und mindestens eine Aufgabe eintragen.");
      return;
    }

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
    }));

    await supabase.from("tasks").insert(rows);

    setTaskTitles([""]);
    await loadTasks();
  }

  async function createWorkSite() {
    setSiteMessage("");

    if (!newSiteName.trim()) {
      setSiteMessage("Bitte Objektname eintragen.");
      return;
    }

    const latitude = newSiteLat.trim() ? Number(newSiteLat) : null;
    const longitude = newSiteLng.trim() ? Number(newSiteLng) : null;
    const allowedRadius = newSiteRadius.trim() ? Number(newSiteRadius) : 100;

    if (newSiteLat.trim() && Number.isNaN(latitude)) {
      setSiteMessage("Breitengrad ist ungültig.");
      return;
    }

    if (newSiteLng.trim() && Number.isNaN(longitude)) {
      setSiteMessage("Längengrad ist ungültig.");
      return;
    }

    if (Number.isNaN(allowedRadius) || allowedRadius <= 0) {
      setSiteMessage("Radius muss größer als 0 sein.");
      return;
    }

    const { error } = await supabase.from("work_sites").insert([
      {
        name: newSiteName.trim(),
        latitude,
        longitude,
        allowed_radius_m: allowedRadius,
      },
    ]);

    if (error) {
      setSiteMessage("Objekt konnte nicht gespeichert werden.");
      return;
    }

    setNewSiteName("");
    setNewSiteLat("");
    setNewSiteLng("");
    setNewSiteRadius("100");
    setSiteMessage("Objekt wurde gespeichert.");
    await loadWorkSites();
  }

  async function deleteWorkSite(id: string) {
    const ok = window.confirm("Objekt wirklich löschen?");
    if (!ok) return;

    const { error } = await supabase.from("work_sites").delete().eq("id", id);

    if (error) {
      setSiteMessage("Objekt konnte nicht gelöscht werden.");
      return;
    }

    setSiteMessage("Objekt wurde gelöscht.");
    await loadWorkSites();
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
    const response = await fetch("/api/admin/create-employee-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
  } catch (error) {
    setInviteMessage(
      error instanceof Error
        ? error.message
        : "Einladung konnte nicht erstellt werden. Bitte Internet prüfen."
    );
  }

  setInviteLoading(false);
}
async function resetEmployeePassword() {
  setResetMessage("");

  const employeeProfile = employeeProfiles.find(
    (profile) => profile.id === resetEmployeeId
  );

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
    const response = await fetch("/api/admin/reset-employee-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authUserId: employeeProfile.auth_user_id,
        password: resetPassword,
      }),
    });

    const text = await response.text();

    let result: { error?: string; message?: string; success?: boolean } = {};

    try {
      result = JSON.parse(text);
    } catch {
      setResetMessage(
        `API antwortet nicht als JSON. Status: ${response.status}. Antwort: ${text.slice(
          0,
          120
        )}`
      );
      setResetLoading(false);
      return;
    }

    if (!response.ok) {
      setResetMessage(
        result.error || `Passwort konnte nicht geändert werden. Status: ${response.status}`
      );
      setResetLoading(false);
      return;
    }

    setResetPassword("");
    setResetMessage(
      result.message ||
        "Passwort wurde geändert. Der Mitarbeiter muss beim nächsten Login ein neues Passwort erstellen."
    );
  } catch (error) {
    setResetMessage(
      error instanceof Error
        ? `Fetch-Fehler: ${error.message}`
        : "Unbekannter Fehler beim Passwort-Reset."
    );
  }

  setResetLoading(false);
}

  async function loadAdminChatMessages(employeeName?: string) {
  const selectedName = employeeName || selectedChatEmployee;

  let query = supabase
    .from("chat_messages")
    .select("id, employee_name, sender_role, sender_name, message, read_by_admin, read_by_employee, created_at")
    .order("created_at", { ascending: true })
    .limit(200);

  if (selectedName) {
    query = query.eq("employee_name", selectedName);
  }

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
      sender_name: "Admin",
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

const pushResponse = await fetch("/api/push/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    employeeName: selectedChatEmployee,
    title: "Neue Nachricht vom Admin",
    message: text,
    url: "/mitarbeiter",
  }),
});

const pushText = await pushResponse.text();

let pushResult: {
  error?: string;
  sent?: number;
  failed?: number;
  failedMessages?: string[];
} = {};

try {
  pushResult = JSON.parse(pushText);
} catch {
  setChatError(
    `Nachricht gespeichert, aber Push antwortet nicht als JSON. Status: ${pushResponse.status}`
  );
}

if (!pushResponse.ok) {
  setChatError(
    pushResult.error ||
      `Nachricht gespeichert, aber Push fehlgeschlagen. Status: ${pushResponse.status}`
  );
} else if ((pushResult.failed ?? 0) > 0) {
  setChatError(
    `Nachricht gespeichert, aber Push fehlgeschlagen: ${
      pushResult.failedMessages?.join(" | ") || "Unbekannter Fehler"
    }`
  );
} else {
  setChatError(
    `Nachricht gesendet. Push gesendet: ${pushResult.sent ?? 0}, fehlgeschlagen: ${
      pushResult.failed ?? 0
    }`
  );
}

await loadAdminChatMessages(selectedChatEmployee);
}
  function calculateEmployeeWorkedMinutes(employeeName: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const employeeEntries = entries
      .filter(
        (entry) =>
          entry.employee_name === employeeName &&
          new Date(entry.created_at) >= today
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

    let total = 0;
    let lastStart: Date | null = null;

    employeeEntries.forEach((entry) => {
      const time = new Date(entry.created_at);

      if (entry.action === "start" || entry.action === "break_end") {
        lastStart = time;
      }

      if ((entry.action === "break_start" || entry.action === "end") && lastStart) {
        total += (time.getTime() - (lastStart as Date).getTime()) / 1000 / 60;
        lastStart = null;
      }
    });

    if (lastStart) {
      total += (new Date().getTime() - (lastStart as Date).getTime()) / 1000 / 60;
    }

    return Math.floor(total);
  }

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  function getPlannedMinutes(employeeName: string) {
    const today = new Date().toISOString().split("T")[0];

    return tasks
      .filter(
        (task) =>
          task.employee_name === employeeName &&
          task.task_date === today
      )
      .reduce((sum, task) => sum + (task.max_minutes || 0), 0);
  }

  if (loading) return <main className="p-6">Lade...</main>;

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="bg-white rounded-3xl p-6">
          <h1 className="text-2xl font-bold mb-2">Kein Zugriff</h1>
          <p className="text-gray-500">
            Dieser Bereich ist nur für den Admin sichtbar.
          </p>
        </div>
      </main>
    );
  }

  const week = weekDays();

  return (
    <main className="min-h-screen bg-[#e3eaf2] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 bg-white hidden md:flex flex-col shadow-sm">
          <div className="p-6">
            <p className="text-xs text-gray-400">CleanTrack</p>
            <h1 className="text-xl font-bold">Admin</h1>
          </div>

          <nav className="p-4 space-y-2">
            {[
              ["dashboard", "Übersicht"],
              ["planung", "Planung"],
              ["objekte", "Objekte"],
              ["einladen", "Mitarbeiter einladen"],
              ["aufgaben", "Aufgaben"],
              ["mitarbeiter", "Mitarbeiter"],
              ["stempelungen", "Stempelungen"],
              ["kosten", "Kosten & Urlaub"],
              ["chat", "Chat"],
              ["meldungen", "Meldungen"],
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
            <input
              placeholder="Alles durchsuchen"
              className="w-full max-w-sm px-5 py-3 rounded-2xl bg-gray-100 outline-none"
            />

            <div className="flex items-center gap-4">
              <button
                onClick={() => loadData()}
                className="text-sm text-blue-500 font-bold"
              >
                Aktualisieren
              </button>

              <button
                onClick={() => setActiveTab("meldungen")}
                className="relative text-sm text-blue-500"
              >
                🔔
                {openNotifications > 0 && (
                  <span className="absolute -top-3 -right-3 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {openNotifications}
                  </span>
                )}
              </button>

              <div className="w-10 h-10 rounded-full bg-orange-400 text-white flex items-center justify-center font-bold">
                MS
              </div>
            </div>
          </header>

          <div className="p-6 pb-24">
            {activeTab === "dashboard" && (
              <>
                <h1 className="text-2xl font-bold mb-6">Dashboard Übersicht</h1>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
                  <button
                    onClick={() => setActiveTab("einladen")}
                    className="bg-white rounded-[28px] p-6 shadow-sm text-left"
                  >
                    <p className="text-gray-400 text-sm">Mitarbeiter</p>
                    <p className="text-3xl font-bold">{employeeProfiles.length}</p>
                    <p className="text-green-600 text-sm">Einladen</p>
                  </button>

                  <button
                    onClick={() => setActiveTab("objekte")}
                    className="bg-white rounded-[28px] p-6 shadow-sm text-left"
                  >
                    <p className="text-gray-400 text-sm">Objekte</p>
                    <p className="text-3xl font-bold">{workSites.length}</p>
                    <p className="text-blue-500 text-sm">Verwaltet</p>
                  </button>

                  <div className="bg-white rounded-[28px] p-6 shadow-sm">
                    <p className="text-gray-400 text-sm">Offene Aufgaben</p>
                    <p className="text-3xl font-bold">{openTasks}</p>
                    <p className="text-red-500 text-sm">Nicht erledigt</p>
                  </div>

                  <div className="bg-white rounded-[28px] p-6 shadow-sm">
                    <p className="text-gray-400 text-sm">Erledigt</p>
                    <p className="text-3xl font-bold">{doneTasks}</p>
                    <p className="text-green-600 text-sm">Abgeschlossen</p>
                  </div>

                  <button
                    onClick={() => setActiveTab("meldungen")}
                    className="bg-white rounded-[28px] p-6 shadow-sm text-left"
                  >
                    <p className="text-gray-400 text-sm">Meldungen</p>
                    <p className="text-3xl font-bold">{openNotifications}</p>
                    <p className="text-red-500 text-sm">Offen</p>
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 bg-white rounded-[28px] p-6 shadow-sm">
                    <div className="flex justify-between mb-5">
                      <h2 className="text-xl font-bold">Aktuelle Woche</h2>

                      <button
                        onClick={() => setActiveTab("planung")}
                        className="px-4 py-2 rounded-2xl bg-blue-500 text-white font-bold"
                      >
                        Öffnen
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-3">
                      {week.map((date) => {
                        const isSelected =
                          date.toDateString() === selectedDate.toDateString();

                        return (
                          <button
                            key={date.toISOString()}
                            onClick={() => setSelectedDate(date)}
                            className={
                              isSelected
                                ? "min-h-48 rounded-2xl bg-blue-100 p-3 text-left shadow-md border border-blue-200"
                                : "min-h-48 rounded-2xl bg-white p-3 text-left shadow-md border border-gray-200"
                            }
                          >
                            <p className={isSelected ? "font-bold text-blue-600" : "font-bold"}>
                              {date.toLocaleDateString("de-DE", {
                                weekday: "short",
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </p>

                            <div className="mt-3 space-y-2">
                              {tasksForDate(date).slice(0, 3).map((task) => (
                                <div
                                  key={task.id}
                                  className="rounded-xl bg-blue-500 p-2 text-xs text-white shadow-sm"
                                >
                                  <p className="font-bold">
                                    {task.start_time} - {task.end_time}
                                  </p>
                                  <p>{task.site || "Kein Objekt"}</p>
                                  <p className="opacity-80">{task.title}</p>
                                </div>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-white rounded-[28px] p-6 shadow-sm">
                    <h2 className="text-xl font-bold mb-4">Letzte Stempelungen</h2>

                    <div className="space-y-3">
                      {entries.slice(0, 5).map((entry) => (
                        <div key={entry.id} className="bg-gray-100 rounded-2xl p-3">
                          <div className="flex justify-between items-center gap-2">
                            <div>
                              <p className="font-bold">{entry.employee_name}</p>
                              <p className="text-sm text-gray-500">
                                {entry.work_site_name}
                              </p>
                            </div>

                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${actionBadge(entry.action)}`}>
                              {actionText(entry.action)}
                            </span>
                          </div>

                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(entry.created_at).toLocaleString("de-DE")}
                          </p>

                          {entry.auto_clock_out && (
                            <p className="text-xs text-red-500 font-bold mt-1">
                              Automatisch ausgestempelt
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "planung" && (
              <>
                <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                  <div>
                    <h1 className="text-2xl font-bold">Planungsübersicht</h1>
                    <p className="text-gray-500">
                      Einsätze planen, Mitarbeiter zuweisen und Aufgaben verwalten
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => changeWeek(-7)}
                      className="px-4 py-3 rounded-2xl bg-white border font-bold"
                    >
                      ←
                    </button>

                    <button className="px-5 py-3 rounded-2xl bg-white border font-bold">
                      Woche
                    </button>

                    <button
                      onClick={() => changeWeek(7)}
                      className="px-4 py-3 rounded-2xl bg-white border font-bold"
                    >
                      →
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-[28px] shadow-sm p-6 mb-6">
                  <div className="flex justify-between items-center mb-5">
                    <div>
                      <h2 className="text-xl font-bold">Einsatz erstellen</h2>
                      <p className="text-sm text-gray-500">
                        Datum: {selectedDate.toLocaleDateString("de-DE")}
                      </p>
                    </div>

                    <button
                      onClick={createShift}
                      className="px-5 py-3 rounded-2xl bg-blue-500 text-white font-bold"
                    >
                      Speichern
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
                    <select
                      value={site}
                      onChange={(e) => setSite(e.target.value)}
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    >
                      <option value="">Objekt auswählen</option>
                      {workSites.map((siteItem) => (
                        <option key={siteItem.id} value={siteItem.name}>
                          {siteItem.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    />

                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    />

                    <input
                      type="number"
                      value={maxMinutes}
                      onChange={(e) => setMaxMinutes(e.target.value)}
                      placeholder="Max. Minuten"
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    />

                    <select
                      value={employee}
                      onChange={(e) => setEmployee(e.target.value)}
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    >
                      <option value="">Mitarbeiter auswählen</option>
                      {employeeProfiles.map((profile) => (
                        <option key={profile.id} value={profile.name}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    {taskTitles.map((task, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          value={task}
                          onChange={(e) => updateTaskField(index, e.target.value)}
                          placeholder={`Aufgabe ${index + 1}`}
                          className="flex-1 p-4 rounded-2xl bg-gray-100 outline-none"
                        />

                        {taskTitles.length > 1 && (
                          <button
                            onClick={() => removeTaskField(index)}
                            className="px-4 rounded-2xl bg-red-100 text-red-600 font-bold"
                          >
                            X
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      onClick={addTaskField}
                      className="w-full p-4 rounded-2xl bg-purple-100 text-purple-600 font-bold"
                    >
                      + Aufgabe hinzufügen
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-[28px] shadow-sm overflow-hidden">
                  <div className="grid grid-cols-[180px_repeat(7,1fr)] bg-white border-b border-gray-300 shadow-sm">
                    <div className="p-4 border-r border-gray-200">
                      <input
                        placeholder="Benutzer ..."
                        className="w-full p-3 rounded-2xl bg-gray-100 outline-none"
                      />
                    </div>

                    {week.map((date) => {
                      const isSelected =
                        date.toDateString() === selectedDate.toDateString();

                      return (
                        <button
                          key={date.toISOString()}
                          onClick={() => setSelectedDate(date)}
                          className={
                            isSelected
                              ? "p-4 border-r border-gray-100 bg-blue-50 text-blue-600 font-bold"
                              : "p-4 border-r border-gray-100 bg-white font-bold"
                          }
                        >
                          <p>
                            {date.toLocaleDateString("de-DE", {
                              weekday: "short",
                            })}
                          </p>
                          <p>
                            {date.toLocaleDateString("de-DE", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </p>

                          <div className="mt-3 h-1 bg-red-400 rounded-full" />
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-[180px_repeat(7,1fr)] min-h-[560px] bg-[#eef2f7]">
                    <div className="border-r border-gray-300 p-3 space-y-3 bg-white">
                      <div className="p-4 border-b border-gray-100">
                        <p className="font-bold">Tägliche Informationen</p>
                      </div>

                      <div className="p-4 border-b border-gray-100 h-32">
                        <p className="text-sm">Schicht ohne Benutzer</p>
                      </div>

                      {employees.map((name) => (
                        <div key={name} className="p-4 border-b border-gray-100 h-24">
                          <p className="font-bold">{name}</p>
                          <p className="text-xs text-gray-400">0 Schichten</p>
                        </div>
                      ))}
                    </div>

                    {week.map((date) => (
                      <div
                        key={date.toISOString()}
                        className={
                          date.toDateString() === selectedDate.toDateString()
                            ? "border-r border-gray-300 p-3 space-y-3 bg-blue-50"
                            : "border-r border-gray-300 p-3 space-y-3 bg-white"
                        }
                      >
                        {tasksForDate(date).map((task) => (
                          <div
                            key={task.id}
                            className={
                              task.done
                                ? "rounded-xl p-3 bg-green-100 border border-green-400"
                                : "rounded-xl p-3 bg-white border-2 border-blue-500 shadow-sm"
                            }
                          >
                            <p className="font-bold text-sm">
                              {task.start_time} - {task.end_time}
                            </p>

                            <p className="text-sm font-semibold">
                              {task.site || "Kein Objekt"}
                            </p>

                            <p className="text-sm text-gray-600">{task.title}</p>

                            <div className="mt-3 h-1 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 w-1/2" />
                            </div>

                            <div className="flex justify-between mt-1 text-xs text-gray-500">
                              <span>{task.employee_name || "Kein Mitarbeiter"}</span>
                              <span>0/{task.max_minutes || 0}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === "objekte" && (
              <div className="space-y-6">
                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h1 className="text-2xl font-bold mb-2">Objekte</h1>
                  <p className="text-gray-500 mb-6">
                    Hier legst du Reinigungsobjekte an. GPS-Daten sind optional, werden aber für die Standortprüfung der Stempeluhr genutzt.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <input
                      value={newSiteName}
                      onChange={(e) => setNewSiteName(e.target.value)}
                      placeholder="Objektname"
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    />

                    <input
                      value={newSiteLat}
                      onChange={(e) => setNewSiteLat(e.target.value)}
                      placeholder="Breitengrad"
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    />

                    <input
                      value={newSiteLng}
                      onChange={(e) => setNewSiteLng(e.target.value)}
                      placeholder="Längengrad"
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    />

                    <input
                      value={newSiteRadius}
                      onChange={(e) => setNewSiteRadius(e.target.value)}
                      placeholder="Radius Meter"
                      type="number"
                      className="p-4 rounded-2xl bg-gray-100 outline-none"
                    />

                    <button
                      onClick={createWorkSite}
                      className="p-4 rounded-2xl bg-blue-500 text-white font-bold"
                    >
                      Objekt speichern
                    </button>
                  </div>

                  {siteMessage && (
                    <p className="mt-4 text-sm font-bold text-blue-600">
                      {siteMessage}
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-5">
                    <h2 className="text-xl font-bold">Alle Objekte</h2>
                    <button
                      onClick={loadWorkSites}
                      className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-600 font-bold"
                    >
                      Aktualisieren
                    </button>
                  </div>

                  <div className="space-y-3">
                    {workSites.length === 0 && (
                      <p className="text-gray-400">Noch keine Objekte vorhanden.</p>
                    )}

                    {workSites.map((item) => (
                      <div key={item.id} className="bg-gray-100 rounded-2xl p-4 flex justify-between gap-4">
                        <div>
                          <p className="font-bold">{item.name}</p>
                          <p className="text-sm text-gray-500">
                            GPS: {item.latitude ?? "fehlt"}, {item.longitude ?? "fehlt"}
                          </p>
                          <p className="text-sm text-gray-500">
                            Radius: {item.allowed_radius_m ?? 100} m
                          </p>
                        </div>

                        <button
                          onClick={() => deleteWorkSite(item.id)}
                          className="h-fit px-4 py-2 rounded-2xl bg-red-100 text-red-600 font-bold"
                        >
                          Löschen
                        </button>
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
                  <p className="text-gray-500 mb-6">
                    Hier erstellst du einen Aktivierungslink. Den Link kannst du danach per WhatsApp oder SMS an den Mitarbeiter senden.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
  <input
    value={inviteName}
    onChange={(e) => setInviteName(e.target.value)}
    placeholder="Name des Mitarbeiters"
    className="p-4 rounded-2xl bg-gray-100 outline-none"
  />

  <input
    value={inviteEmail}
    onChange={(e) => setInviteEmail(e.target.value)}
    placeholder="E-Mail des Mitarbeiters"
    className="p-4 rounded-2xl bg-gray-100 outline-none"
  />

  <input
    value={invitePhone}
    onChange={(e) => setInvitePhone(e.target.value)}
    placeholder="Handynummer optional"
    className="p-4 rounded-2xl bg-gray-100 outline-none"
  />

  <button
    onClick={createEmployeeInvite}
    disabled={inviteLoading}
    className="p-4 rounded-2xl bg-blue-500 text-white font-bold disabled:opacity-50"
  >
    {inviteLoading ? "Wird erstellt..." : "Einladung erstellen"}
  </button>
</div>
                  {inviteMessage && (
                    <p className="mt-4 text-sm font-bold text-blue-600">
                      {inviteMessage}
                    </p>
                  )}
                </div>

                {inviteLink && (
                  <div className="bg-white rounded-[28px] p-6 shadow-sm">
                    <h2 className="text-xl font-bold mb-4">Aktivierungslink</h2>

                    <div className="bg-gray-100 rounded-2xl p-4 break-all text-sm mb-4">
                      {inviteLink}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(inviteLink)}
                        className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold"
                      >
                        Link kopieren
                      </button>

                      {inviteWhatsappLink && (
                        <a
                          href={inviteWhatsappLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-5 py-3 rounded-2xl bg-green-500 text-white font-bold"
                        >
                          Per WhatsApp senden
                        </a>
                      )}
                    </div>

                    <p className="text-sm text-gray-500 mt-4">
                      Der Mitarbeiter öffnet den Link, vergibt sein Passwort und kann sich danach mit seiner Handynummer einloggen.
                    </p>
                  </div>
                )}
<div className="bg-white rounded-[28px] p-6 shadow-sm">
  <h2 className="text-xl font-bold mb-2">Passwort neu setzen</h2>
  <p className="text-gray-500 mb-5">
    Nutze das, wenn ein Mitarbeiter sein Passwort vergessen hat oder sich nach der Aktivierung nicht einloggen kann.
  </p>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <select
      value={resetEmployeeId}
      onChange={(e) => setResetEmployeeId(e.target.value)}
      className="p-4 rounded-2xl bg-gray-100 outline-none"
    >
      <option value="">Mitarbeiter auswählen</option>

      {employeeProfiles.map((profile) => (
        <option key={profile.id} value={profile.id}>
          {profile.name} {profile.phone ? `· ${profile.phone}` : ""}
        </option>
      ))}
    </select>

    <input
      type="password"
      value={resetPassword}
      onChange={(e) => setResetPassword(e.target.value)}
      placeholder="Neues Passwort"
      className="p-4 rounded-2xl bg-gray-100 outline-none"
    />

    <button
      type="button"
      onClick={resetEmployeePassword}
      disabled={resetLoading}
      className="p-4 rounded-2xl bg-red-500 text-white font-bold disabled:opacity-50"
    >
      {resetLoading ? "Wird geändert..." : "Passwort setzen"}
    </button>
  </div>

  {resetMessage && (
    <p className="mt-4 text-sm font-bold text-blue-600">
      {resetMessage}
    </p>
  )}
</div>
                <div className="bg-white rounded-[28px] p-6 shadow-sm">
                  <h2 className="text-xl font-bold mb-4">Aktuelle Mitarbeiter</h2>

                  <div className="space-y-3">
                    {employeeProfiles.length === 0 && (
                      <p className="text-gray-400">Noch keine Mitarbeiterprofile vorhanden.</p>
                    )}

                    {employeeProfiles.map((profile) => (
                      <div key={profile.id} className="bg-gray-100 rounded-2xl p-4">
                        <p className="font-bold">{profile.name}</p>
                        <p className="text-sm text-gray-500">
                          Rolle: {profile.role === "admin" ? "Admin" : "Mitarbeiter"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "aufgaben" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Aufgaben</h1>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-green-100 rounded-2xl p-4">
                    <p className="text-green-700">Erledigt</p>
                    <p className="text-3xl font-bold text-green-700">
                      {doneTasks}
                    </p>
                  </div>

                  <div className="bg-red-100 rounded-2xl p-4">
                    <p className="text-red-700">Offen</p>
                    <p className="text-3xl font-bold text-red-700">
                      {openTasks}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="bg-gray-100 rounded-2xl p-4">
                      <p className="font-bold">{task.title}</p>
                      <p className="text-sm text-gray-500">
                        {task.site} · {task.employee_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(task.task_date).toLocaleDateString("de-DE")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "mitarbeiter" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Mitarbeiter</h1>

                <div className="space-y-3">
                  {employees.map((employeeName) => {
                    const last = getLastEntry(employeeName);
                    const workStatus = employeeWorkStatus(employeeName);
                    const worked = calculateEmployeeWorkedMinutes(employeeName);
                    const planned = getPlannedMinutes(employeeName);

                    return (
                      <div key={employeeName} className="bg-gray-100 rounded-2xl p-4">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-bold">{employeeName}</p>
                            <p className="text-sm text-gray-500">
                              {last?.work_site_name || "Kein Objekt"}
                            </p>
                          </div>

                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${workStatus.color}`}>
                            {workStatus.text}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                          <div>
                            <p className="text-gray-400">Arbeitszeit</p>
                            <p className={`font-bold ${planned > 0 && worked > planned ? "text-red-500" : ""}`}>
                              {formatMinutes(worked)} / {planned > 0 ? formatMinutes(planned) : "0:00"}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-400">Kosten</p>
                            <p className="font-bold">0,00 €</p>
                          </div>

                          <div>
                            <p className="text-gray-400">Urlaub</p>
                            <p className="font-bold">0 / 0</p>
                          </div>
                        </div>

                        {last?.auto_clock_out && (
                          <p className="mt-3 text-xs text-red-500 font-bold">
                            Letzte Aktion: automatisch ausgestempelt
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "stempelungen" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h1 className="text-2xl font-bold">Stempelungen</h1>

                  <button
                    onClick={loadEntries}
                    className="px-4 py-2 rounded-2xl bg-blue-500 text-white font-bold"
                  >
                    Aktualisieren
                  </button>
                </div>

                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div key={entry.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-bold">{entry.employee_name}</p>
                          <p className="text-sm text-gray-500">
                            {entry.work_site_name}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(entry.created_at).toLocaleString("de-DE")}
                          </p>
                        </div>

                        <span className={`h-fit px-3 py-1 rounded-full text-xs font-bold ${actionBadge(entry.action)}`}>
                          {actionText(entry.action)}
                        </span>
                      </div>

                      {entry.auto_clock_out && (
                        <p className="mt-3 text-sm text-red-500 font-bold">
                          Automatisch ausgestempelt wegen Objekt verlassen
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "kosten" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Kosten & Urlaub</h1>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-100 rounded-2xl p-4">
                    <p className="text-gray-400">Lohnkosten</p>
                    <p className="text-2xl font-bold">0,00 €</p>
                  </div>

                  <div className="bg-gray-100 rounded-2xl p-4">
                    <p className="text-gray-400">AG-Kosten</p>
                    <p className="text-2xl font-bold">0,00 €</p>
                  </div>

                  <div className="bg-gray-100 rounded-2xl p-4">
                    <p className="text-gray-400">Urlaub offen</p>
                    <p className="text-2xl font-bold">0 Tage</p>
                  </div>

                  <div className="bg-gray-100 rounded-2xl p-4">
                    <p className="text-gray-400">Urlaub geplant</p>
                    <p className="text-2xl font-bold">0 Tage</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "meldungen" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Meldungen</h1>

                <div className="space-y-3">
                  {notifications.length === 0 && (
                    <p className="text-gray-400">Keine Meldungen vorhanden.</p>
                  )}

                  {notifications.map((note) => (
                    <div
                      key={note.id}
                      className={
                        note.status === "approved"
                          ? "bg-green-50 rounded-2xl p-4 border border-green-100"
                          : note.status === "rejected"
                          ? "bg-gray-100 rounded-2xl p-4"
                          : "bg-red-50 rounded-2xl p-4 border border-red-100"
                      }
                    >
                      <p className="font-bold">{note.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{note.message}</p>

                      {note.overtime_minutes !== null && note.overtime_minutes > 0 && (
                        <p className="text-sm text-red-600 mt-2">
                          Überzeit: {note.overtime_minutes} Minuten
                        </p>
                      )}

                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(note.created_at).toLocaleString("de-DE")}
                      </p>

                      {(!note.status || note.status === "open") && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => decideOvertime(note.id, "approved")}
                            className="px-4 py-2 rounded-2xl bg-green-500 text-white font-bold"
                          >
                            Genehmigen
                          </button>

                          <button
                            onClick={() => decideOvertime(note.id, "rejected")}
                            className="px-4 py-2 rounded-2xl bg-red-100 text-red-600 font-bold"
                          >
                            Ablehnen
                          </button>
                        </div>
                      )}

                      {!note.read && note.status !== "open" && (
                        <button
                          onClick={() => markNotificationAsRead(note.id)}
                          className="mt-3 px-4 py-2 rounded-2xl bg-blue-100 text-blue-600 font-bold"
                        >
                          Als gelesen markieren
                        </button>
                      )}
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
          {employeeProfiles.map((profile) => {
            const unread = chatMessages.filter(
              (msg) =>
                msg.employee_name === profile.name &&
                msg.sender_role === "employee" &&
                !msg.read_by_admin
            ).length;

            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setSelectedChatEmployee(profile.name);
                  loadAdminChatMessages(profile.name);
                }}
                className={
                  selectedChatEmployee === profile.name
                    ? "w-full text-left p-3 rounded-2xl bg-blue-500 text-white font-bold"
                    : "w-full text-left p-3 rounded-2xl bg-white hover:bg-blue-50"
                }
              >
                <div className="flex justify-between">
                  <span>{profile.name}</span>
                  {unread > 0 && (
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                      {unread}
                    </span>
                  )}
                </div>

                {profile.email && (
                  <p className="text-xs opacity-70">{profile.email}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {!selectedChatEmployee ? (
          <div className="bg-gray-100 rounded-2xl p-6 text-center text-gray-400">
            Bitte Mitarbeiter auswählen.
          </div>
        ) : (
          <>
            <h2 className="font-bold mb-4">Chat mit {selectedChatEmployee}</h2>

            <div className="bg-gray-100 rounded-2xl p-4 h-[55vh] overflow-y-auto space-y-3 mb-4">
              {chatMessages.length === 0 && (
                <p className="text-gray-400 text-center">
                  Noch keine Nachrichten vorhanden.
                </p>
              )}

              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.sender_role === "admin"
                      ? "bg-blue-100 rounded-2xl p-4 ml-20"
                      : "bg-white rounded-2xl p-4 mr-20"
                  }
                >
                  <div className="flex justify-between text-sm mb-1">
                    <p className="font-bold">
                      {msg.sender_role === "admin"
                        ? "Ich"
                        : msg.sender_name || msg.employee_name}
                    </p>
                    <p className="text-gray-400">
                      {new Date(msg.created_at).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <p>{msg.message}</p>
                </div>
              ))}
            </div>

           <div>
  <div className="flex gap-2">
    <input
      value={chatText}
      onChange={(e) => setChatText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          sendChatMessage();
        }
      }}
      placeholder="Nachricht schreiben..."
      className="flex-1 p-4 rounded-2xl bg-gray-100 outline-none"
    />

    <button
      type="button"
      onClick={sendChatMessage}
      className="px-6 rounded-2xl bg-blue-500 text-white font-bold"
    >
      Senden
    </button>
  </div>

  {chatError && (
    <p className="mt-3 text-sm font-bold text-red-500">
      {chatError}
    </p>
  )}
</div>
          </>
        )}
      </div>
    </div>
  </div>
)} 
</div>
        </section>
      </div>
    </main>
  );
}