"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Status = "none" | "working" | "break";
type Tab = "home" | "tasks" | "clock" | "schedule" | "search" | "chat" | "profile" | "admin";

type WorkSite = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_m: number | null;
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
  id: number;
  sender: string;
  text: string;
  time: string;
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
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export default function MitarbeiterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [loggedIn, setLoggedIn] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("home");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [workSites, setWorkSites] = useState<WorkSite[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedSite, setSelectedSite] = useState<WorkSite | null>(null);

  const [status, setStatus] = useState<Status>("none");
  const [message, setMessage] = useState("");
  const [appReady, setAppReady] = useState(false);
useEffect(() => {
  setAppReady(true);
}, []);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [breakStart, setBreakStart] = useState<Date | null>(null);
  const [workedMinutes, setWorkedMinutes] = useState(0);
  const [pauseMinutes, setPauseMinutes] = useState(0);
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [outsideObject, setOutsideObject] = useState(false);
  const [overtimeWarningSent, setOvertimeWarningSent] = useState(false);
const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: "Admin",
      text: "Willkommen im Chat. Hier kannst du später Nachrichten senden.",
      time: "09:00",
    },
  ]);

  const todayISO = new Date().toISOString().split("T")[0];

  const todayText = new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const todayTasks = tasks.filter((task) => task.task_date === todayISO);
  const openTasks = todayTasks.filter((task) => !task.done).length;
  const doneTasks = todayTasks.filter((task) => task.done).length;

  const plannedMinutes =
    selectedTask?.planned_minutes || selectedTask?.max_minutes || 0;

  useEffect(() => {
    if (!loggedIn) return;

    const timer = setInterval(() => {
      if (status === "working" && startTime) {
        const diff = (new Date().getTime() - startTime.getTime()) / 1000 / 60;
        const total = Math.max(0, Math.floor(diff - pauseMinutes));
        setWorkedMinutes(total);

        if (
          plannedMinutes > 0 &&
          total > plannedMinutes + 5 &&
          !overtimeWarningSent
        ) {
          setOvertimeWarningSent(true);
          setMessage("Du bist über der geplanten Zeit. Bitte frage Überstunden beim Admin an.");
          notifyAdminOvertime(total - plannedMinutes);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [loggedIn, status, startTime, pauseMinutes, plannedMinutes, overtimeWarningSent]);

  useEffect(() => {
    if (!loggedIn || status === "none" || !selectedSite) return;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (
          selectedSite.latitude === null ||
          selectedSite.longitude === null ||
          selectedSite.allowed_radius_m === null
        ) {
          return;
        }

        const distance = distanceMeters(
          position.coords.latitude,
          position.coords.longitude,
          selectedSite.latitude,
          selectedSite.longitude
        );

        setCurrentDistance(Math.round(distance));

        const outside = distance > selectedSite.allowed_radius_m;
        setOutsideObject(outside);

if (outside && status === "working") {
            await createEntry("end", true);
          setMessage("Automatisch ausgestempelt: Du hast das Objekt verlassen.");
        }
      },
      () => {
        setMessage("Standort konnte nicht geprüft werden.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [loggedIn, status, selectedSite]);

  async function login() {
  setMessage("");
  setLoginLoading(true);

  if (!email.trim() || !password.trim()) {
    setMessage("Bitte E-Mail und Passwort eingeben.");
    setLoginLoading(false);
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (error || !data.user) {
      setMessage("E-Mail oder Passwort ist falsch.");
      setLoginLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("employee_profiles")
      .select("id, name, role")
      .eq("auth_user_id", data.user.id)
      .single();

    const name = profile?.name || email;

    setEmployeeName(name);
    setEmployeeId(profile?.id || data.user.id);
    setRole(profile?.role || "employee");
    setLoggedIn(true);

    await loadWorkSites();
    await loadTasks(name);
    await loadNotifications(name);
  } catch {
    setMessage("Login konnte nicht ausgeführt werden. Bitte Internet prüfen.");
  }

  setLoginLoading(false);
}
async function resetPassword() {
  if (!email.trim()) {
    setMessage("Bitte zuerst deine E-Mail eingeben.");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    setMessage("Passwort-Link konnte nicht gesendet werden.");
    return;
  }

  setMessage("Passwort-Link wurde gesendet. Bitte E-Mail prüfen.");
}

  async function loadWorkSites() {
    const { data } = await supabase
      .from("work_sites")
      .select("id, name, latitude, longitude, allowed_radius_m")
      .order("name");

    setWorkSites(data || []);
  }

  async function loadTasks(name: string) {
    const { data } = await supabase
      .from("tasks")
      .select(
        "id, title, site, employee_name, task_date, done, start_time, end_time, max_minutes, planned_minutes, work_site_id"
      )
      .eq("employee_name", name)
      .eq("task_date", todayISO)
      .order("start_time", { ascending: true });

    setTasks(data || []);

    if (data && data.length > 0) {
      setSelectedTask(data[0]);
    }
  }
async function loadNotifications(name: string) {
  const { data } = await supabase
    .from("admin_notifications")
    .select("id, title, message, status, notification_type, overtime_minutes, created_at")
    .eq("employee_name", name)
    .order("created_at", { ascending: false })
    .limit(10);

  setNotifications(data || []);
}
  useEffect(() => {
    if (!selectedTask || workSites.length === 0) return;

    const foundSite =
      workSites.find((item) => item.id === selectedTask.work_site_id) ||
      workSites.find((item) => item.name === selectedTask.site) ||
      null;

    setSelectedSite(foundSite);
  }, [selectedTask, workSites]);

  async function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
  }

  async function checkInsideObject() {
    if (!selectedSite) {
      setMessage("Kein Objekt ausgewählt.");
      return null;
    }

    if (
      selectedSite.latitude === null ||
      selectedSite.longitude === null ||
      selectedSite.allowed_radius_m === null
    ) {
      setMessage("Für dieses Objekt fehlen Standortdaten.");
      return null;
    }

    const pos = await getPosition();

    const distance = distanceMeters(
      pos.coords.latitude,
      pos.coords.longitude,
      selectedSite.latitude,
      selectedSite.longitude
    );

    setCurrentDistance(Math.round(distance));

    return {
      inside: distance <= selectedSite.allowed_radius_m,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      distance,
    };
  }

  async function createEntry(
    action: "start" | "break_start" | "break_end" | "end",
    autoClockOut = false
  ) {
    if (!selectedTask || !selectedSite) {
      setMessage("Heute ist kein Einsatz ausgewählt.");
      return;
    }

    const geo = await checkInsideObject();
    if (!geo) return;

    if (action === "start" && !geo.inside) {
      setMessage("Du bist zu weit vom Objekt entfernt. Einstempeln nicht möglich.");
      return;
    }

    const overtimeMinutes =
      plannedMinutes > 0 && workedMinutes > plannedMinutes
        ? workedMinutes - plannedMinutes
        : 0;

    const { error } = await supabase.from("time_entries").insert([
      {
        employee_id: employeeId,
        employee_name: employeeName,
        work_site_id: selectedSite.id,
        work_site_name: selectedSite.name,
        action,
        success: true,
        latitude: geo.latitude,
        longitude: geo.longitude,
        distance_m: geo.distance,
        planned_minutes: plannedMinutes,
        overtime_minutes: overtimeMinutes,
        auto_clock_out: autoClockOut,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      setMessage("Stempelung konnte nicht gespeichert werden.");
      return;
    }

    if (action === "start") {
      setStatus("working");
      setStartTime(new Date());
      setWorkedMinutes(0);
      setPauseMinutes(0);
      setOvertimeWarningSent(false);
      setMessage("Schicht gestartet.");
    }

    if (action === "break_start") {
      setStatus("break");
      setBreakStart(new Date());
      setMessage("Pause gestartet.");
    }

    if (action === "break_end") {
      if (breakStart) {
        const pauseDiff = (new Date().getTime() - breakStart.getTime()) / 1000 / 60;
        setPauseMinutes((old) => old + Math.floor(pauseDiff));
      }

      setBreakStart(null);
      setStatus("working");
      setMessage("Pause beendet.");
    }

    if (action === "end") {
      setStatus("none");
      setStartTime(null);
      setBreakStart(null);
      setMessage(autoClockOut ? "Automatisch ausgestempelt." : "Schicht beendet.");
    }
  }

  async function notifyAdminOvertime(minutes: number) {
  await supabase.from("admin_notifications").insert([
    {
      title: "Überstunden-Freigabe nötig",
      message: `${employeeName} ist ${minutes} Minuten über der geplanten Zeit bei ${selectedSite?.name}.`,
      employee_name: employeeName,
      work_site_name: selectedSite?.name || null,
      status: "open",
      notification_type: "overtime",
      overtime_minutes: minutes,
      read: false,
    },
  ]);
}

  async function toggleTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const { error } = await supabase
      .from("tasks")
      .update({ done: !task.done })
      .eq("id", taskId);

    if (error) {
      setMessage("Aufgabe konnte nicht aktualisiert werden.");
      return;
    }

    setTasks((old) =>
      old.map((item) =>
        item.id === taskId ? { ...item, done: !item.done } : item
      )
    );
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

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  if (!loggedIn) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Mitarbeiter Login</h1>

        <p className="text-sm mb-4 font-bold text-green-600">
          {appReady ? "App ist bereit" : "App lädt..."}
        </p>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
          className="w-full mb-3 p-4 rounded-2xl bg-gray-100 outline-none"
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Passwort"
          className="w-full mb-4 p-4 rounded-2xl bg-gray-100 outline-none"
        />

        <button
          type="button"
          onClick={() => {
            setMessage("Login Button wurde gedrückt");
            login();
          }}
          className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold"
        >
          Login
        </button>

        <button
          type="button"
          onClick={() => {
            setMessage("Passwort vergessen wurde gedrückt");
            resetPassword();
          }}
          className="w-full mt-3 p-4 rounded-2xl bg-gray-100 text-gray-600 font-bold"
        >
          Passwort vergessen?
        </button>

        {message && (
          <p className="mt-4 text-center text-red-500 font-bold">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
function BackButton() {
  return (
    <button
      onClick={() => setActiveTab("home")}
      className="mb-5 px-5 py-3 rounded-2xl bg-white shadow-sm font-bold"
    >
      ← Zurück
    </button>
  );
}
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900 pb-24">
      {activeTab === "home" && (
        <>
          <section className="bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-400 text-white flex items-center justify-center font-bold">
                  {employeeName.charAt(0).toUpperCase()}
                </div>

                <div>
                  <p className="font-bold">Guten Tag, {employeeName} 👋</p>
                  <p className="text-sm text-gray-400">{todayText}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                  🔊
                </div>

                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                    🔔
                  </div>
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center">
                    {openTasks}
                  </span>
                </div>
              </div>
            </div>
<section className="mt-3 px-5">
  <h2 className="text-lg font-bold mb-3">Heutige Objekte</h2>

  <div className="grid grid-cols-1 gap-3">
    {todayTasks.length === 0 && (
      <div className="bg-white rounded-[28px] p-5 shadow-sm text-gray-400">
        Heute keine Objekte geplant.
      </div>
    )}

    {Array.from(new Set(todayTasks.map((task) => task.site || "Kein Objekt"))).map(
      (siteName) => {
        const siteTasks = todayTasks.filter(
          (task) => (task.site || "Kein Objekt") === siteName
        );

        return (
          <button
            key={siteName}
            onClick={() => setActiveTab("schedule")}
            className="bg-white rounded-[28px] p-5 shadow-sm text-left flex justify-between items-center"
          >
            <div>
              <p className="font-bold text-lg">{siteName}</p>
              <p className="text-sm text-gray-500">
                {siteTasks[0]?.start_time || "--:--"} -{" "}
                {siteTasks[0]?.end_time || "--:--"} · {siteTasks.length} Aufgabe(n)
              </p>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-500 flex items-center justify-center text-xl">
              📍
            </div>
          </button>
        );
      }
    )}
  </div>
</section>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setActiveTab("tasks")}
                className="bg-cyan-50 rounded-[24px] p-4 text-center"
              >
                <div className="text-3xl mb-2">☑️</div>
                <p className="text-sm">Aufgaben</p>
              </button>

              <button
                onClick={() => setActiveTab("clock")}
                className="bg-indigo-50 rounded-[24px] p-4 text-center"
              >
                <div className="text-3xl mb-2">⏱️</div>
                <p className="text-sm">Stempeluhr</p>
              </button>

              <button
                onClick={() => setActiveTab("schedule")}
                className="bg-orange-50 rounded-[24px] p-4 text-center"
              >
                <div className="text-3xl mb-2">📅</div>
                <p className="text-sm">Schedule</p>
              </button>
            </div>
          </section>

          <section className="mt-3 px-5">
  <button
    onClick={() => setActiveTab("tasks")}
    className="w-full bg-white rounded-[28px] p-5 shadow-sm flex items-center justify-between"
  >
    <div className="flex items-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-500 flex items-center justify-center text-2xl">
        ✅
      </div>

      <div className="text-left">
        <p className="font-bold text-lg">
          {openTasks} Aufgaben warten auf dich
        </p>
        <p className="text-sm text-gray-500">
          {doneTasks} erledigt · {openTasks} offen
        </p>
      </div>
    </div>

    <span className="px-5 py-2 rounded-full bg-blue-50 text-blue-500 font-bold">
      Öffnen
    </span>
  </button>
</section>

          <section className="mt-3 bg-white p-5">
            <h2 className="text-xl font-bold mb-1">Lerne, wie es funktioniert!</h2>
            <p className="text-gray-500 mb-5">
              Deine wichtigsten Schritte für heute.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => setActiveTab("clock")}
                className="w-full p-4 rounded-2xl border flex justify-between items-center"
              >
                <span>⏱️ Einstempeln über die Stempeluhr</span>
                <span>›</span>
              </button>

              <button
                onClick={() => setActiveTab("schedule")}
                className="w-full p-4 rounded-2xl border flex justify-between items-center"
              >
                <span>📅 Zugriff auf den Jobplaner</span>
                <span>›</span>
              </button>

              <button
                onClick={() => setActiveTab("chat")}
                className="w-full p-4 rounded-2xl border flex justify-between items-center"
              >
                <span>💬 Nachricht im Chat senden</span>
                <span>›</span>
              </button>

              {role === "admin" && (
                <button
                  onClick={() => setActiveTab("admin")}
                  className="w-full p-4 rounded-2xl border flex justify-between items-center"
                >
                  <span>👑 Administrator-Tab erkunden</span>
                  <span>›</span>
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {activeTab === "clock" && (
        <>
          <section className="relative min-h-[42vh] bg-gradient-to-br from-slate-200 to-slate-100 overflow-hidden">
            <div className="absolute inset-0 opacity-60">
              <div className="absolute top-16 left-10 w-72 h-20 bg-white/60 rounded-full rotate-12" />
              <div className="absolute top-32 right-10 w-96 h-24 bg-white/50 rounded-full -rotate-12" />
              <div className="absolute bottom-20 left-24 w-80 h-20 bg-white/50 rounded-full rotate-6" />
            </div>

            <div className="relative p-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab("home")}
                  className="w-14 h-14 rounded-full bg-gray-700 text-white text-3xl"
                >
                  ←
                </button>

                <div className="flex-1 bg-white rounded-full px-6 py-4 shadow-sm flex justify-between items-center">
                  <span className="text-gray-500">Arbeitsstunden heute gesamt</span>
                  <strong className="text-xl">{formatMinutes(workedMinutes)}</strong>
                </div>
              </div>

              <div className="mt-16 mx-auto w-5 h-5 rounded-full bg-blue-500 ring-8 ring-blue-200" />

              {selectedSite && (
                <div className="mt-6 text-center">
                  <p className="font-bold">{selectedSite.name}</p>
                  <p className={outsideObject ? "text-red-500" : "text-green-600"}>
                    {currentDistance === null
                      ? "Standort wird geprüft..."
                      : `${currentDistance} m vom Objekt entfernt`}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="-mt-8 relative bg-white rounded-t-[36px] p-6 min-h-[52vh] shadow-sm">
            {tasks.length === 0 ? (
              <p className="text-center text-gray-400 mt-4">
                Für heute ist nichts geplant
              </p>
            ) : (
              <>
                <p className="text-center text-gray-400 mb-4">
                  Heutiger Einsatz
                </p>

                <select
                  value={selectedTask?.id || ""}
                  onChange={(e) => {
                    const task = tasks.find((item) => item.id === e.target.value);
                    setSelectedTask(task || null);
                  }}
                  className="w-full p-4 rounded-2xl bg-gray-100 outline-none mb-5"
                >
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.start_time} - {task.end_time} · {task.site} · {task.title}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-gray-100 rounded-2xl p-4">
                    <p className="text-gray-400 text-sm">Planzeit</p>
                    <p className="font-bold">
                      {plannedMinutes > 0 ? `${plannedMinutes} Min.` : "Nicht gesetzt"}
                    </p>
                  </div>

                  <div className="bg-gray-100 rounded-2xl p-4">
                    <p className="text-gray-400 text-sm">Status</p>
                    <p className="font-bold">
                      {status === "working"
                        ? "Schicht läuft"
                        : status === "break"
                        ? "Pause"
                        : "Nicht gestartet"}
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-center mt-8">
              <button
                disabled={status !== "none" || tasks.length === 0}
                onClick={() => createEntry("start")}
                className={
                  status === "none"
                    ? "w-56 h-56 rounded-full border border-gray-300 bg-white text-gray-500 flex flex-col items-center justify-center text-2xl font-bold shadow-sm disabled:opacity-40"
                    : status === "working"
                    ? "w-56 h-56 rounded-full bg-green-500 text-white flex flex-col items-center justify-center text-2xl font-bold shadow-md"
                    : "w-56 h-56 rounded-full bg-purple-500 text-white flex flex-col items-center justify-center text-2xl font-bold shadow-md"
                }
              >
                <span className="text-5xl mb-3">⏱</span>
                {status === "none" && "Schicht starten"}
                {status === "working" && "Schicht läuft"}
                {status === "break" && "Pause läuft"}
              </button>
            </div>

            <div className="mt-8 flex justify-center gap-3">
              {status === "working" && (
                <button
                  onClick={() => createEntry("break_start")}
                  className="px-6 py-3 rounded-full border text-purple-500 font-bold"
                >
                  Pause starten
                </button>
              )}

              {status === "break" && (
                <button
                  onClick={() => createEntry("break_end")}
                  className="px-6 py-3 rounded-full border text-purple-500 font-bold"
                >
                  Pause beenden
                </button>
              )}

              {status !== "none" && (
                <button
                  onClick={() => createEntry("end")}
                  className="px-6 py-3 rounded-full bg-red-100 text-red-600 font-bold"
                >
                  Schicht beenden
                </button>
              )}
            </div>

            {message && (
              <p className="mt-6 text-center font-medium text-gray-700">
                {message}
              </p>
            )}
          </section>
        </>
      )}

      {activeTab === "tasks" && (
        <section className="p-5">
          <BackButton />
          <h1 className="text-2xl font-bold mb-1">Aufgaben</h1>
          <p className="text-gray-500 mb-5">
            {doneTasks} erledigt · {openTasks} offen
          </p>

          <div className="space-y-3">
            {todayTasks.length === 0 && (
              <div className="bg-white rounded-[28px] p-6 shadow-sm text-center text-gray-400">
                Keine Aufgaben für heute.
              </div>
            )}

            {todayTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className="w-full bg-white rounded-[24px] p-4 shadow-sm flex justify-between items-center text-left"
              >
                <div>
                  <p className={task.done ? "font-bold line-through text-gray-400" : "font-bold"}>
                    {task.title}
                  </p>
                  <p className="text-sm text-gray-500">
                    {task.site || "Kein Objekt"} · {task.start_time} - {task.end_time}
                  </p>
                </div>

                <div
                  className={
                    task.done
                      ? "w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center"
                      : "w-9 h-9 rounded-full bg-gray-100"
                  }
                >
                  {task.done ? "✓" : ""}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === "schedule" && (
        <section className="p-5">
          <BackButton />
          <h1 className="text-2xl font-bold mb-5">Schedule</h1>

          <div className="bg-white rounded-[28px] p-5 shadow-sm">
            <p className="font-bold mb-4">Heute</p>

            <div className="space-y-3">
              {todayTasks.length === 0 && (
                <p className="text-gray-400">Heute ist nichts geplant.</p>
              )}

              {todayTasks.map((task) => (
                <div key={task.id} className="bg-gray-100 rounded-2xl p-4">
                  <p className="font-bold">
                    {task.start_time} - {task.end_time}
                  </p>
                  <p>{task.site || "Kein Objekt"}</p>
                  <p className="text-sm text-gray-500">{task.title}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "search" && (
        <section className="p-5">
          <BackButton />
          <h1 className="text-2xl font-bold mb-5">Suche</h1>
          <div className="bg-white rounded-[28px] p-5 shadow-sm">
            <input
              placeholder="Aufgaben, Objekte oder Nachrichten suchen..."
              className="w-full p-4 rounded-2xl bg-gray-100 outline-none"
            />
          </div>
        </section>
      )}

      {activeTab === "chat" && (
        <section className="p-5">
          <BackButton />
          <h1 className="text-2xl font-bold mb-5">Chat</h1>

          <div className="bg-white rounded-[28px] p-5 shadow-sm">
            <div className="space-y-3 mb-5">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.sender === "Ich"
                      ? "bg-blue-100 rounded-2xl p-4 ml-8"
                      : "bg-gray-100 rounded-2xl p-4 mr-8"
                  }
                >
                  <div className="flex justify-between text-sm mb-1">
                    <p className="font-bold">{msg.sender}</p>
                    <p className="text-gray-400">{msg.time}</p>
                  </div>
                  <p>{msg.text}</p>
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
        </section>
      )}

      {activeTab === "profile" && (
        <section className="p-5">
          <BackButton />
          <h1 className="text-2xl font-bold mb-5">Profil</h1>

          <div className="bg-white rounded-[28px] p-5 shadow-sm space-y-3">
            <p>
              <strong>Name:</strong> {employeeName}
            </p>
            <p>
              <strong>Rolle:</strong> {role}
            </p>
<div className="mt-5">
  <h2 className="font-bold mb-3">Meine Meldungen</h2>

  <div className="space-y-3">
    {notifications.length === 0 && (
      <p className="text-gray-400">Keine Meldungen vorhanden.</p>
    )}

    {notifications.map((note) => (
      <div key={note.id} className="bg-gray-100 rounded-2xl p-4">
        <p className="font-bold">{note.title}</p>
        <p className="text-sm text-gray-600">{note.message}</p>

        {note.status === "approved" && (
          <p className="mt-2 text-green-600 font-bold">
            Überstunden genehmigt
          </p>
        )}

        {note.status === "rejected" && (
          <p className="mt-2 text-red-600 font-bold">
            Überstunden abgelehnt
          </p>
        )}

        {(!note.status || note.status === "open") && (
          <p className="mt-2 text-orange-500 font-bold">
            Wartet auf Freigabe
          </p>
        )}
      </div>
    ))}
  </div>
</div>
            <button
              onClick={() => setLoggedIn(false)}
              className="w-full p-4 rounded-2xl bg-red-100 text-red-600 font-bold"
            >
              Abmelden
            </button>
          </div>
        </section>
      )}

      {activeTab === "admin" && (
        <section className="p-5">
          <BackButton />
          <h1 className="text-2xl font-bold mb-5">Administrator</h1>

          <div className="bg-white rounded-[28px] p-5 shadow-sm">
            {role === "admin" ? (
              <button
                onClick={() => (window.location.href = "/admin")}
                className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold"
              >
                Admin Dashboard öffnen
              </button>
            ) : (
              <p className="text-gray-400">Nur Administratoren können das sehen.</p>
            )}
          </div>
        </section>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t grid grid-cols-5 p-2 text-xs text-gray-500">
        <button
          onClick={() => setActiveTab("home")}
          className={activeTab === "home" ? "text-blue-500 font-bold" : ""}
        >
          <div className="text-2xl">⌂</div>
          Startseite
        </button>

        <button
          onClick={() => setActiveTab("search")}
          className={activeTab === "search" ? "text-blue-500 font-bold" : ""}
        >
          <div className="text-2xl">⌕</div>
          Suche
        </button>

        <button
          onClick={() => setActiveTab("chat")}
          className={activeTab === "chat" ? "text-blue-500 font-bold" : ""}
        >
          <div className="text-2xl">▢</div>
          Chat
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          className={activeTab === "profile" ? "text-blue-500 font-bold" : ""}
        >
          <div className="text-2xl">○</div>
          Profil
        </button>

        <button
          onClick={() => setActiveTab(role === "admin" ? "admin" : "schedule")}
          className={activeTab === "admin" || activeTab === "schedule" ? "text-blue-500 font-bold" : ""}
        >
          <div className="text-2xl">♕</div>
          {role === "admin" ? "Administrator" : "Schedule"}
        </button>
      </nav>
    </main>
  );
}