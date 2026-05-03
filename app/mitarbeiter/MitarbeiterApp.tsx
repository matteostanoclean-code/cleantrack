"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { supabase } from "../../lib/supabase";

type Status = "none" | "working" | "break";
type Tab = "home" | "tasks" | "clock" | "schedule" | "search" | "chat" | "profile" | "admin";

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
};

type WorkSite = {
  id: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  allowed_radius_m?: number | null;
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

type TimeEntry = {
  id: string;
  employee_name: string;
  work_site_name: string | null;
  action: "start" | "break_start" | "break_end" | "end";
  created_at: string;
  auto_clock_out: boolean | null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function formatDate(value: Date) {
  return value.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
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
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatError, setChatError] = useState("");
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<Status>("none");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  const name = profile?.name || "";
  const role = profile?.role || "employee";
  const today = todayISO();
  const todayTasks = useMemo(() => sortTasksByTime(tasks.filter((task) => task.task_date === today)), [tasks, today]);
  const openTasks = todayTasks.filter((task) => !task.done).length;
  const doneTasks = todayTasks.filter((task) => task.done).length;
  const plannedMinutes = todayTasks.reduce((sum, task) => sum + (task.planned_minutes || task.max_minutes || 0), 0);
  const workedMinutes = useMemo(() => calculateWorkedMinutes(todayEntries), [todayEntries]);
  const pauseMinutes = useMemo(() => calculatePauseMinutes(todayEntries), [todayEntries]);
  const progress = plannedMinutes > 0 ? Math.min(100, Math.round((workedMinutes / plannedMinutes) * 100)) : 0;
  const selectedTask = todayTasks.find((task) => task.id === selectedTaskId) || todayTasks.find((task) => !task.done) || todayTasks[0] || null;

  useEffect(() => {
    checkExistingSession();
  }, []);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, () => loadTodayEntries(name))
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
    const last = todayEntries[0];
    if (!last) {
      setStatus("none");
      return;
    }

    if (last.action === "start" || last.action === "break_end") setStatus("working");
    if (last.action === "break_start") setStatus("break");
    if (last.action === "end") setStatus("none");
  }, [todayEntries]);

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

  async function loadAllData(employeeName: string, silent = false) {
    if (!silent) setLoadingData(true);
    await Promise.all([
      loadTasks(employeeName),
      loadWorkSites(),
      loadTodayEntries(employeeName),
      loadNotifications(employeeName),
      loadUnreadChatCount(employeeName),
      activeTab === "chat" ? loadChatMessages(employeeName) : Promise.resolve(),
    ]);
    if (!silent) setLoadingData(false);
  }

  async function loadWorkSites() {
    const { data } = await supabase.from("work_sites").select("*").order("name");
    setWorkSites((data || []) as WorkSite[]);
  }

  async function loadTasks(employeeName: string) {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("employee_name", employeeName)
      .gte("task_date", todayISO())
      .order("task_date", { ascending: true });
    setTasks((data || []) as Task[]);
  }

  async function loadTodayEntries(employeeName: string) {
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
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("employee_name", employeeName)
      .order("created_at", { ascending: true });

    setChatMessages((data || []) as ChatMessage[]);
    await supabase
      .from("chat_messages")
      .update({ read_by_employee: true })
      .eq("employee_name", employeeName)
      .eq("sender_role", "admin");
    setUnreadChatCount(0);
  }

  function calculateWorkedMinutes(entries: TimeEntry[]) {
    const chronological = [...entries].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let total = 0;
    let lastStart: Date | null = null;

    for (const entry of chronological) {
      const time = new Date(entry.created_at);
      if (entry.action === "start" || entry.action === "break_end") lastStart = time;
      if ((entry.action === "break_start" || entry.action === "end") && lastStart) {
        total += Math.max(0, Math.round((time.getTime() - lastStart.getTime()) / 60000));
        lastStart = null;
      }
    }

    if (lastStart && status === "working") {
      total += Math.max(0, Math.round((Date.now() - lastStart.getTime()) / 60000));
    }
    return total;
  }

  function calculatePauseMinutes(entries: TimeEntry[]) {
    const chronological = [...entries].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let total = 0;
    let lastBreak: Date | null = null;

    for (const entry of chronological) {
      const time = new Date(entry.created_at);
      if (entry.action === "break_start") lastBreak = time;
      if (entry.action === "break_end" && lastBreak) {
        total += Math.max(0, Math.round((time.getTime() - lastBreak.getTime()) / 60000));
        lastBreak = null;
      }
    }

    if (lastBreak && status === "break") {
      total += Math.max(0, Math.round((Date.now() - lastBreak.getTime()) / 60000));
    }
    return total;
  }

  async function createEntry(action: TimeEntry["action"]) {
    if (!name) return;
    setMessage("");

    const task = selectedTask;
    const site = task?.site || workSites.find((item) => item.id === task?.work_site_id)?.name || "Ohne Objekt";

    const { error } = await supabase.from("time_entries").insert([
      {
        employee_name: name,
        work_site_name: site,
        action,
        task_id: task?.id || null,
        auto_clock_out: false,
      },
    ]);

    if (error) {
      setMessage("Zeit konnte nicht gespeichert werden. Bitte Supabase/Rechte prüfen.");
      return;
    }

    await loadTodayEntries(name);
    setMessage(action === "start" ? "Arbeitszeit gestartet." : action === "end" ? "Arbeitszeit beendet." : action === "break_start" ? "Pause gestartet." : "Pause beendet.");
  }

  async function toggleTask(task: Task) {
    const { error } = await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
    if (error) {
      setMessage("Aufgabe konnte nicht aktualisiert werden.");
      return;
    }
    if (name) await loadTasks(name);
  }

  async function sendChatMessage() {
    setChatError("");
    const text = chatText.trim();
    if (!text || !name) return;

    const { error } = await supabase.from("chat_messages").insert([
      {
        employee_name: name,
        sender_role: "employee",
        sender_name: name,
        message: text,
        read_by_admin: false,
        read_by_employee: true,
      },
    ]);

    if (error) {
      setChatError("Nachricht konnte nicht gesendet werden.");
      return;
    }

    setChatText("");
    await loadChatMessages(name);
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
    if (tab === "chat" && name) loadChatMessages(name);
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
            todayTasks={todayTasks}
            openTasks={openTasks}
            doneTasks={doneTasks}
            progress={progress}
            workedMinutes={workedMinutes}
            plannedMinutes={plannedMinutes}
            loadingData={loadingData}
            refresh={() => name && loadAllData(name)}
            openTab={openTab}
          />
        )}

        {activeTab === "tasks" && (
          <TasksScreen tasks={todayTasks} toggleTask={toggleTask} openTab={openTab} />
        )}

        {activeTab === "clock" && (
          <ClockScreen
            tasks={todayTasks}
            entries={todayEntries}
            status={status}
            selectedTaskId={selectedTaskId}
            setSelectedTaskId={setSelectedTaskId}
            workedMinutes={workedMinutes}
            pauseMinutes={pauseMinutes}
            message={message}
            createEntry={createEntry}
            openTab={openTab}
          />
        )}

        {activeTab === "schedule" && (
          <ScheduleScreen tasks={tasks} openTab={openTab} />
        )}

        {activeTab === "search" && (
          <SearchScreen tasks={tasks} notifications={notifications} openTab={openTab} />
        )}

        {activeTab === "chat" && (
          <ChatScreen messages={chatMessages} chatText={chatText} setChatText={setChatText} sendChatMessage={sendChatMessage} chatError={chatError} chatEndRef={chatEndRef} openTab={openTab} />
        )}

        {activeTab === "profile" && (
          <ProfileScreen profile={profile} workedMinutes={workedMinutes} pauseMinutes={pauseMinutes} notifications={notifications} logout={logout} openTab={openTab} />
        )}

        {activeTab === "admin" && (
          <SimplePage title="Admin" openTab={openTab}>
            {role === "admin" ? (
              <button type="button" onClick={() => (window.location.href = "/admin")} className="w-full rounded-2xl bg-blue-600 py-4 text-white font-black">Admin Dashboard öffnen</button>
            ) : (
              <p className="text-center text-sm text-slate-400">Nur Administratoren können diesen Bereich öffnen.</p>
            )}
          </SimplePage>
        )}
      </div>

      <BottomNav activeTab={activeTab} openTab={openTab} unreadChatCount={unreadChatCount} role={role} />
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
}) {
  const quickLinks = [
    { icon: "📊", title: "Einsatzübersicht", text: "Übersicht aller Einsätze für heute", tab: "schedule" as Tab, bg: "bg-blue-50" },
    { icon: "⏱️", title: "Zeiterfassung", text: "Arbeitszeit starten und beenden", tab: "clock" as Tab, bg: "bg-green-50" },
    { icon: "🌴", title: "Abwesenheit", text: "Abwesenheit einreichen und einsehen", tab: "profile" as Tab, bg: "bg-emerald-50" },
    { icon: "📦", title: "Materialbestellung", text: "Benötigtes Material melden", tab: "chat" as Tab, bg: "bg-orange-50" },
    { icon: "📋", title: "Aufgaben", text: "Aufgaben ansehen und abhaken", tab: "tasks" as Tab, bg: "bg-purple-50" },
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

      <button type="button" onClick={() => props.openTab("clock")} className="mt-7 w-full rounded-[24px] bg-blue-50 p-4 text-left shadow-sm border border-blue-100">
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

      <div className="mt-7 flex items-center justify-between">
        <h2 className="text-sm font-black">Heutige Aufgaben</h2>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><span>{props.doneTasks}/{props.todayTasks.length}</span><span className="h-1 w-10 rounded-full bg-slate-200"><span className="block h-1 rounded-full bg-blue-500" style={{ width: `${props.todayTasks.length ? (props.doneTasks / props.todayTasks.length) * 100 : 0}%` }} /></span></div>
      </div>

      <div className="mt-5 rounded-[24px] bg-white p-5 text-center shadow-sm border border-slate-100">
        {props.openTasks === 0 ? (
          <>
            <div className="text-4xl">🎉</div>
            <p className="mt-2 font-black">Alles erledigt!</p>
            <p className="mt-1 text-xs text-slate-400">Ich habe heute keine offenen Aufgaben.</p>
          </>
        ) : (
          <button type="button" onClick={() => props.openTab("tasks")} className="w-full text-left">
            <p className="font-black">{props.openTasks} Aufgaben offen</p>
            <p className="mt-1 text-sm text-slate-400">Antippen und Aufgaben bearbeiten.</p>
          </button>
        )}
      </div>

      <h2 className="mt-7 text-sm font-black">Schnellzugriffe</h2>
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

function TasksScreen({ tasks, toggleTask, openTab }: { tasks: Task[]; toggleTask: (task: Task) => void; openTab: (tab: Tab) => void }) {
  return (
    <SimplePage title="Aufgaben" openTab={openTab} searchPlaceholder="Aufgaben suchen">
      <div className="flex gap-5 border-b border-slate-100 text-sm font-bold text-slate-400">
        <span className="border-b-2 border-blue-500 pb-3 text-blue-600">Alle</span>
        <span className="pb-3">Mir zugewiesen</span>
        <span className="pb-3">Von mir erstellt</span>
      </div>
      <div className="mt-5 space-y-3">
        {tasks.length === 0 && <EmptyState text="Keine Aufgaben" />}
        {tasks.map((task) => (
          <button key={task.id} type="button" onClick={() => toggleTask(task)} className="w-full rounded-[22px] bg-white p-4 text-left shadow-sm border border-slate-100">
            <div className="flex items-start gap-3">
              <span className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full border ${task.done ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300"}`}>{task.done ? "✓" : ""}</span>
              <div className="flex-1"><p className="font-black">{task.title}</p><p className="mt-1 text-xs font-semibold text-slate-400">{task.site || "Kein Objekt"}</p><p className="mt-2 text-xs text-slate-500">{formatClock(task.start_time)} - {formatClock(task.end_time)}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${task.done ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>{task.done ? "Erledigt" : "Offen"}</span>
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
  workedMinutes: number;
  pauseMinutes: number;
  message: string;
  createEntry: (action: TimeEntry["action"]) => void;
  openTab: (tab: Tab) => void;
}) {
  return (
    <SimplePage title="Stundenzettel" openTab={props.openTab}>
      <div className="rounded-[24px] bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-end justify-between">
          <div><p className="text-sm font-bold text-slate-400">Heute geleistet</p><p className="text-4xl font-black">{formatMinutes(props.workedMinutes)}</p></div>
          <div className="text-right"><p className="text-sm font-bold text-slate-400">Pause</p><p className="text-xl font-black">{formatMinutes(props.pauseMinutes)}</p></div>
        </div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-3">
          <select className="w-full bg-transparent font-bold outline-none" value={props.selectedTaskId} onChange={(e) => props.setSelectedTaskId(e.target.value)}>
            <option value="">Aufgabe automatisch wählen</option>
            {props.tasks.map((task) => <option key={task.id} value={task.id}>{task.site || "Objekt"} · {task.title}</option>)}
          </select>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {props.status === "none" && <button type="button" onClick={() => props.createEntry("start")} className="col-span-2 rounded-2xl bg-blue-600 py-4 text-white font-black">Einstempeln</button>}
          {props.status === "working" && <><button type="button" onClick={() => props.createEntry("break_start")} className="rounded-2xl bg-orange-100 py-4 text-orange-700 font-black">Pause</button><button type="button" onClick={() => props.createEntry("end")} className="rounded-2xl bg-red-100 py-4 text-red-700 font-black">Ausstempeln</button></>}
          {props.status === "break" && <button type="button" onClick={() => props.createEntry("break_end")} className="col-span-2 rounded-2xl bg-green-600 py-4 text-white font-black">Pause beenden</button>}
        </div>
        {props.message && <p className="mt-4 text-center text-sm font-bold text-blue-600">{props.message}</p>}
      </div>
      <div className="mt-5 space-y-3">
        {props.entries.length === 0 && <EmptyState text="Keine Zeiten erfasst" />}
        {props.entries.map((entry) => <div key={entry.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100"><p className="font-black">{entryLabel(entry.action)}</p><p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · {entry.work_site_name || "Ohne Objekt"}</p></div>)}
      </div>
    </SimplePage>
  );
}

function ScheduleScreen({ tasks, openTab }: { tasks: Task[]; openTab: (tab: Tab) => void }) {
  const today = todayISO();
  const upcoming = sortTasksByTime(tasks.filter((task) => task.task_date >= today));
  return (
    <SimplePage title="Einsätze" openTab={openTab} searchPlaceholder="Suchen...">
      <div className="grid gap-2">
        <StatusBox color="red" title="Nicht zugewiesen" count={0} />
        <StatusBox color="orange" title="Überfällig" count={0} />
        <StatusBox color="green" title="Aktiv" count={upcoming.length} />
      </div>
      <h2 className="mt-6 mb-3 text-sm font-black">Anstehend</h2>
      <div className="space-y-3">
        {upcoming.length === 0 && <EmptyState text="Keine Einsätze geplant" />}
        {upcoming.map((task) => <div key={task.id} className="rounded-[22px] bg-white p-4 shadow-sm border border-slate-100"><p className="text-xs font-bold text-slate-400">{new Date(task.task_date).toLocaleDateString("de-DE")} · {formatClock(task.start_time)} - {formatClock(task.end_time)}</p><p className="mt-1 font-black">{task.site || "Kein Objekt"}</p><p className="mt-1 text-sm text-slate-500">{task.title}</p></div>)}
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
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Aufgaben, Objekte oder Nachrichten suchen..." className="w-full rounded-2xl bg-white px-4 py-4 font-semibold outline-none shadow-sm border border-slate-100" />
      <div className="mt-5 space-y-3">
        {query && resultTasks.map((task) => <div key={task.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100"><p className="font-black">{task.title}</p><p className="text-xs text-slate-400">{task.site || "Kein Objekt"}</p></div>)}
        {query && resultNotes.map((note) => <div key={note.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100"><p className="font-black">{note.title}</p><p className="text-xs text-slate-400">{note.message}</p></div>)}
        {!query && <EmptyState text="Suchbegriff eingeben" />}
        {query && resultTasks.length === 0 && resultNotes.length === 0 && <EmptyState text="Nichts gefunden" />}
      </div>
    </SimplePage>
  );
}

function ChatScreen(props: { messages: ChatMessage[]; chatText: string; setChatText: (value: string) => void; sendChatMessage: () => void; chatError: string; chatEndRef: RefObject<HTMLDivElement | null>; openTab: (tab: Tab) => void }) {
  return (
    <SimplePage title="Nachrichten" openTab={props.openTab} searchPlaceholder="Suche">
      <div className="min-h-[55vh] space-y-3">
        {props.messages.length === 0 && <EmptyState text="Keine Nachrichten bisher" />}
        {props.messages.map((msg) => <div key={msg.id} className={`max-w-[85%] rounded-[22px] p-4 ${msg.sender_role === "employee" ? "ml-auto bg-blue-600 text-white" : "bg-white text-slate-950 shadow-sm border border-slate-100"}`}><p className="text-sm font-semibold">{msg.message}</p><p className={`mt-1 text-[11px] ${msg.sender_role === "employee" ? "text-blue-100" : "text-slate-400"}`}>{new Date(msg.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</p></div>)}
        <div ref={props.chatEndRef} />
      </div>
      <div className="fixed bottom-[72px] left-0 right-0 mx-auto max-w-md bg-[#f5f7fb]/95 p-4 backdrop-blur">
        <div className="flex gap-2">
          <input value={props.chatText} onChange={(e) => props.setChatText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") props.sendChatMessage(); }} placeholder="Nachricht schreiben..." className="flex-1 rounded-2xl bg-white px-4 py-4 outline-none shadow-sm" />
          <button type="button" onClick={props.sendChatMessage} className="rounded-2xl bg-blue-600 px-5 text-white font-black">➤</button>
        </div>
        {props.chatError && <p className="mt-2 text-sm font-bold text-red-500">{props.chatError}</p>}
      </div>
    </SimplePage>
  );
}

function ProfileScreen(props: { profile: EmployeeProfile | null; workedMinutes: number; pauseMinutes: number; notifications: AdminNotification[]; logout: () => void; openTab: (tab: Tab) => void }) {
  return (
    <SimplePage title="Profil" openTab={props.openTab}>
      <div className="rounded-[24px] bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <Avatar name={props.profile?.name || "M"} src={props.profile?.avatar_url || ""} large />
          <div><p className="text-xl font-black">{props.profile?.name}</p><p className="text-sm font-bold text-slate-400">{props.profile?.email}</p></div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <InfoBox label="Arbeitszeit" value={formatMinutes(props.workedMinutes)} />
          <InfoBox label="Pause" value={formatMinutes(props.pauseMinutes)} />
        </div>
        <button type="button" onClick={props.logout} className="mt-5 w-full rounded-2xl bg-red-50 py-4 text-red-600 font-black">Abmelden</button>
      </div>
      <h2 className="mt-6 mb-3 text-sm font-black">Meine Meldungen</h2>
      <div className="space-y-3">
        {props.notifications.length === 0 && <EmptyState text="Keine Meldungen vorhanden" />}
        {props.notifications.map((note) => <div key={note.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100"><p className="font-black">{note.title}</p><p className="mt-1 text-sm text-slate-500">{note.message}</p></div>)}
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

function BottomNav({ activeTab, openTab, unreadChatCount, role }: { activeTab: Tab; openTab: (tab: Tab) => void; unreadChatCount: number; role: string }) {
  const items = [
    { tab: "home" as Tab, icon: "⌂", label: "Home" },
    { tab: "tasks" as Tab, icon: "▣", label: "Inbox" },
    { tab: "schedule" as Tab, icon: "▦", label: "Kalender" },
    { tab: "search" as Tab, icon: "⌕", label: "Suche" },
    { tab: "chat" as Tab, icon: "●", label: "Chat" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 mx-auto grid max-w-md grid-cols-5 border-t border-slate-100 bg-white px-2 pb-3 pt-2 text-[11px] font-bold text-slate-400">
      {items.map((item) => (
        <button key={item.tab} type="button" onClick={() => openTab(item.tab === "schedule" && role === "admin" ? "admin" : item.tab)} className={`relative rounded-2xl py-1 ${activeTab === item.tab ? "text-blue-600" : ""}`}>
          <span className="block text-2xl leading-none">{item.icon}</span>
          <span>{item.label}</span>
          {item.tab === "chat" && unreadChatCount > 0 && <span className="absolute right-4 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">{unreadChatCount}</span>}
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
