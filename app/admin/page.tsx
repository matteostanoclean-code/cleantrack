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
};

type EmployeeProfile = {
  id: string;
  name: string;
  role: string | null;
};
type AdminTab =
  | "dashboard"
  | "planung"
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
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [site, setSite] = useState("");
  const [employee, setEmployee] = useState("");
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("18:00");
  const [maxMinutes, setMaxMinutes] = useState("60");
  const [taskTitles, setTaskTitles] = useState<string[]>([""]);

  const [chatText, setChatText] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      sender: "Max Mustermann",
      text: "Alles klar, danke!",
      time: "10:42",
    },
    {
      id: 2,
      sender: "Lisa Schneider",
      text: "Kannst du mir bitte die Adresse schicken?",
      time: "10:21",
    },
  ]);

  useEffect(() => {
    checkAdmin();
  }, []);

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
    .select("id, title, message, employee_name, work_site_name, read, status, notification_type, overtime_minutes, created_at")
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
      .select(
        "id, title, site, employee_name, task_date, done, start_time, end_time, max_minutes"
      )
      .order("task_date", { ascending: true });

    setTasks(data || []);
  }
async function loadWorkSites() {
  const { data } = await supabase
    .from("work_sites")
    .select("id, name")
    .order("name");

  setWorkSites(data || []);
}

async function loadEmployeeProfiles() {
  const { data } = await supabase
    .from("employee_profiles")
    .select("id, name, role")
    .eq("role", "employee")
    .order("name");

  setEmployeeProfiles(data || []);
}
  const employees = Array.from(
    new Set(entries.map((entry) => entry.employee_name).filter(Boolean))
  );

  const doneTasks = tasks.filter((task) => task.done).length;
  const openTasks = tasks.filter((task) => !task.done).length;

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
    if (action === "break_start") return "Pause";
    if (action === "break_end") return "Pause beendet";
    if (action === "end") return "Ausgestempelt";
    return action;
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
  function statusColor(action?: string) {
    if (action === "start" || action === "break_end")
      return "bg-green-100 text-green-700";
    if (action === "break_start") return "bg-purple-100 text-purple-700";
    return "bg-red-100 text-red-700";
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

  function sendChatMessage() {
    if (!chatText.trim()) return;

    setChatMessages((old) => [
      ...old,
      {
        id: Date.now(),
        sender: "Ich",
        text: chatText.trim(),
        time: new Date().toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);

    setChatText("");
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
    <button className="text-sm text-blue-500">Hilfe</button>

    <button
      onClick={() => setActiveTab("meldungen")}
      className="relative text-sm text-blue-500"
    >
      🔔
      {notifications.filter((n) => !n.read).length > 0 && (
        <span className="absolute -top-3 -right-3 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
          {notifications.filter((n) => !n.read).length}
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
    <h1 className="text-2xl font-bold mb-6">
      Dashboard Übersicht
    </h1>

    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-[28px] p-6 shadow-sm">
        <p className="text-gray-400 text-sm">Mitarbeiter</p>
        <p className="text-3xl font-bold">{employees.length}</p>
        <p className="text-green-600 text-sm">Aktiv</p>
      </div>

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
        <p className="text-3xl font-bold">
          {notifications.filter((n) => !n.read).length}
        </p>
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
        <h2 className="text-xl font-bold mb-4">Chat</h2>

        <div className="space-y-3 mb-4">
          {chatMessages.map((msg) => (
            <div key={msg.id} className="bg-gray-100 rounded-2xl p-3">
              <div className="flex justify-between text-sm">
                <p className="font-bold">{msg.sender}</p>
                <p className="text-gray-400">{msg.time}</p>
              </div>
              <p className="text-sm text-gray-600">{msg.text}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Nachricht..."
            className="flex-1 p-3 rounded-2xl bg-gray-100 outline-none"
          />
          <button
            onClick={sendChatMessage}
            className="px-4 rounded-2xl bg-blue-500 text-white font-bold"
          >
            Senden
          </button>
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
                          onChange={(e) =>
                            updateTaskField(index, e.target.value)
                          }
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
                    <div className="border-r border-gray-300 p-3 space-y-3 bg-white rounded-xl shadow-sm hover:shadow-md transition">
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

                            <p className="text-sm text-gray-600">
                              {task.title}
                            </p>

                            <div className="mt-3 h-1 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 w-1/2" />
                            </div>

                            <div className="flex justify-between mt-1 text-xs text-gray-500">
                              <span>
                                {task.employee_name || "Kein Mitarbeiter"}
                              </span>
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
                      <div
                        key={employeeName}
                        className="bg-gray-100 rounded-2xl p-4"
                      >
                        <div className="flex justify-between">
                          <div>
                            <p className="font-bold">{employeeName}</p>
                            <p className="text-sm text-gray-500">
                              {last?.work_site_name || "Kein Objekt"}
                            </p>
                          </div>

                          <span
  className={`px-3 py-1 rounded-full text-xs font-bold ${workStatus.color}`}
>
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
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "stempelungen" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm">
                <h1 className="text-2xl font-bold mb-6">Stempelungen</h1>

                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div key={entry.id} className="bg-gray-100 rounded-2xl p-4">
                      <p className="font-bold">{entry.employee_name}</p>
                      <p className="text-sm text-gray-500">
                        {entry.work_site_name}
                      </p>
                      <p>{actionText(entry.action)}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(entry.created_at).toLocaleString("de-DE")}
                      </p>
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
        </div>
      ))}
    </div>
  </div>
)}
            {activeTab === "chat" && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm max-w-3xl">
                <h1 className="text-2xl font-bold mb-6">Chat</h1>

                <div className="space-y-3 mb-5">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex justify-between">
                        <p className="font-bold">{msg.sender}</p>
                        <p className="text-gray-400 text-sm">{msg.time}</p>
                      </div>
                      <p className="text-gray-600">{msg.text}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Nachricht schreiben..."
                    className="flex-1 p-4 rounded-2xl bg-gray-100 outline-none"
                  />

                  <button
                    onClick={sendChatMessage}
                    className="px-5 rounded-2xl bg-blue-500 text-white font-bold"
                  >
                    Senden
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}