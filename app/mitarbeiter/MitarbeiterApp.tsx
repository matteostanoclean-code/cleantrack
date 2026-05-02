"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type Status = "none" | "working" | "break";

type Tab =
  | "home"
  | "tasks"
  | "clock"
  | "schedule"
  | "search"
  | "chat"
  | "profile"
  | "admin";

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
  work_site_name: string;
  action: "start" | "break_start" | "break_end" | "end";
  created_at: string;
  auto_clock_out: boolean | null;
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
function normalizePhone(phone: string) {
  let cleaned = phone.replace(/\s/g, "").replace(/-/g, "");

  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  if (cleaned.startsWith("0")) {
    cleaned = "+49" + cleaned.slice(1);
  }

  return cleaned;
}
export default function MitarbeiterApp({ initialTab = "home" }: { initialTab?: Tab }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loginLoading, setLoginLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
const [profileMessage, setProfileMessage] = useState("");
const [showPushPrompt, setShowPushPrompt] = useState(false);
const [profileImageLoading, setProfileImageLoading] = useState(false);

const [profilePassword, setProfilePassword] = useState("");
const [profilePasswordRepeat, setProfilePasswordRepeat] = useState("");
const [profilePasswordLoading, setProfilePasswordLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
const [newPassword, setNewPassword] = useState("");
const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
const [changePasswordMessage, setChangePasswordMessage] = useState("");
const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [workSites, setWorkSites] = useState<WorkSite[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedSite, setSelectedSite] = useState<WorkSite | null>(null);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);

  const [status, setStatus] = useState<Status>("none");
  const [message, setMessage] = useState("");

  const [startTime, setStartTime] = useState<Date | null>(null);
  const [breakStart, setBreakStart] = useState<Date | null>(null);
  const [workedMinutes, setWorkedMinutes] = useState(0);
  const [pauseMinutes, setPauseMinutes] = useState(0);

  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [outsideObject, setOutsideObject] = useState(false);

  const [overtimeWarningSent, setOvertimeWarningSent] = useState(false);
  const [overtimeBlocked, setOvertimeBlocked] = useState(false);
  const [overtimeRequestSent, setOvertimeRequestSent] = useState(false);

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  const [chatText, setChatText] = useState("");
const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
const [chatError, setChatError] = useState("");
const chatEndRef = useRef<HTMLDivElement | null>(null);
const [unreadChatCount, setUnreadChatCount] = useState(0);

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

  const totalPlannedMinutes = todayTasks.reduce(
    (sum, task) => sum + (task.planned_minutes || task.max_minutes || 0),
    0
  );

  const overtimeMinutes =
    totalPlannedMinutes > 0 && workedMinutes > totalPlannedMinutes
      ? workedMinutes - totalPlannedMinutes
      : 0;
     useEffect(() => {
  if (!loggedIn || !employeeName) return;

  loadUnreadChatCount();

  const timer = setInterval(() => {
    loadUnreadChatCount();
  }, 10000);

  
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return () => clearInterval(timer);
}, [loggedIn, employeeName]);
 useEffect(() => {
  if (!loggedIn || !employeeName) return;

  async function checkPushState() {
    if (!("serviceWorker" in navigator)) return;
    if (!("Notification" in window)) return;
    if (!("PushManager" in window)) return;

    if (Notification.permission === "denied") {
      setShowPushPrompt(false);
      return;
    }

    if (Notification.permission === "granted") {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const token = await getAccessToken();

        if (token) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              subscription,
            }),
          });
        }

        localStorage.setItem("cleantrack_push_asked", "true");
        setShowPushPrompt(false);
        return;
      }
    }

    const alreadyAsked = localStorage.getItem("cleantrack_push_asked");

    if (!alreadyAsked && Notification.permission === "default") {
      setShowPushPrompt(true);
    }
  }

  checkPushState();
}, [loggedIn, employeeName]);
useEffect(() => {
  checkExistingSession();
}, []);

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");

  if (tab === "chat") {
    setActiveTab("chat");
  }
}, []);
async function checkExistingSession() {
  const { data } = await supabase.auth.getSession();

  if (!data.session?.user) {
    return;
  }

  const { data: profile } = await supabase
    .from("employee_profiles")
    .select("id, name, role, avatar_url, must_change_password")
    .eq("auth_user_id", data.session.user.id)
    .single();

  if (!profile) {
    return;
  }

  const name = profile.name;

  setEmployeeName(name);
  setEmployeeId(profile.id);
  setRole(profile.role || "employee");
  setAvatarUrl(profile.avatar_url || "");
  setMustChangePassword(Boolean(profile.must_change_password));
  setLoggedIn(true);

  await loadAllData(name);
}
useEffect(() => {
  if (activeTab !== "chat") return;

  const timer = setTimeout(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, 150);

  
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return () => clearTimeout(timer);
}, [chatMessages, activeTab]);
  useEffect(() => {
    if (!loggedIn) return;

    const timer = setInterval(() => {
      const total = calculateWorkedMinutes(todayEntries);
      const pauses = calculatePauseMinutes(todayEntries);

      setWorkedMinutes(total);
      setPauseMinutes(pauses);

      if (
        status === "working" &&
        plannedMinutes > 0 &&
        total > plannedMinutes + 5 &&
        !overtimeWarningSent
      ) {
        setOvertimeWarningSent(true);
        setOvertimeBlocked(true);
        setOvertimeRequestSent(true);

        setMessage(
          "Planzeit überschritten. Die Zeituhr wurde gestoppt. Bitte warte auf Freigabe vom Admin."
        );

        createEntry("end", false);
        notifyAdminOvertime(total - plannedMinutes);

        setStatus("none");
        setStartTime(null);
      }
    }, 1000);

    
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return () => clearInterval(timer);
  }, [
    loggedIn,
    status,
    plannedMinutes,
    overtimeWarningSent,
    todayEntries,
  ]);

  useEffect(() => {
    if (!loggedIn || status === "none" || !selectedSite) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
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
          createEntry("end", true);
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

    
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return () => navigator.geolocation.clearWatch(watchId);
  }, [loggedIn, status, selectedSite]);

  useEffect(() => {
    if (!selectedTask || workSites.length === 0) return;

    const foundSite =
      workSites.find((item) => item.id === selectedTask.work_site_id) ||
      workSites.find((item) => item.name === selectedTask.site) ||
      null;

    setSelectedSite(foundSite);
  }, [selectedTask, workSites]);

  useEffect(() => {
    if (!loggedIn || !employeeName || !overtimeBlocked) return;

    const timer = setInterval(() => {
      checkOvertimeApproval(employeeName);
    }, 10000);

    
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return () => clearInterval(timer);
  }, [loggedIn, employeeName, overtimeBlocked]);
useEffect(() => {
  if (!loggedIn || !employeeName || activeTab !== "chat") return;

  loadChatMessages();

  const timer = setInterval(() => {
    loadChatMessages();
  }, 5000);

  
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return () => clearInterval(timer);
}, [loggedIn, employeeName, activeTab]);

async function loadUnreadChatCount() {
  if (!employeeName) return;

  const { count } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("employee_name", employeeName)
    .eq("sender_role", "admin")
    .eq("read_by_employee", false);

  setUnreadChatCount(count || 0);
}
  async function login() {
  setMessage("");
  setLoginLoading(true);

  if (!email.trim() || !password.trim()) {
    setMessage("Bitte E-Mail oder Handynummer und Passwort eingeben.");
    setLoginLoading(false);
    return;
  }

  try {
    const loginValue = email.trim().toLowerCase();

const { data, error } = await supabase.auth.signInWithPassword({
  email: loginValue,
  password: password.trim(),
});

    if (error || !data.user) {
      setMessage("Login-Daten sind falsch.");
      setLoginLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("employee_profiles")
     .select("id, name, role, avatar_url, must_change_password")
      .eq("auth_user_id", data.user.id)
      .single();

    const name = profile?.name || loginValue;

    setEmployeeName(name);
    setEmployeeId(profile?.id || data.user.id);
    setRole(profile?.role || "employee");
    setAvatarUrl(profile?.avatar_url || "");
setMustChangePassword(Boolean(profile?.must_change_password));
setLoggedIn(true);

    await loadAllData(name);
  } catch {
    setMessage("Login konnte nicht ausgeführt werden. Bitte Internet prüfen.");
  }

  setLoginLoading(false);
}

  async function loadAllData(name: string) {
    await loadWorkSites();
    await loadTasks(name);
    await loadNotifications(name);
    await loadTodayEntries(name);
  }

  async function resetPassword() {
  setMessage("");

  if (!email.trim()) {
    setMessage("Bitte zuerst deine E-Mail eingeben.");
    return;
  }

  if (!email.includes("@")) {
    setMessage("Passwort zurücksetzen geht nur mit E-Mail.");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    {
      redirectTo: `${window.location.origin}/mitarbeiter/passwort-neu`,
    }
  );

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
      .select(
        "id, title, message, status, notification_type, overtime_minutes, created_at"
      )
      .eq("employee_name", name)
      .order("created_at", { ascending: false })
      .limit(10);

    setNotifications(data || []);
  }

  async function loadTodayEntries(name: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("time_entries")
      .select("id, employee_name, work_site_name, action, created_at, auto_clock_out")
      .eq("employee_name", name)
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: true });

    const entries = (data || []) as TimeEntry[];

    setTodayEntries(entries);
    restoreShiftFromEntries(entries);
    setWorkedMinutes(calculateWorkedMinutes(entries));
    setPauseMinutes(calculatePauseMinutes(entries));
  }

  function restoreShiftFromEntries(entries: TimeEntry[]) {
    if (entries.length === 0) {
      setStatus("none");
      setStartTime(null);
      setBreakStart(null);
      return;
    }

    const lastEntry = entries[entries.length - 1];

    if (lastEntry.action === "start" || lastEntry.action === "break_end") {
      setStatus("working");
      setStartTime(new Date(lastEntry.created_at));
      setBreakStart(null);
      return;
    }

    if (lastEntry.action === "break_start") {
      setStatus("break");
      setBreakStart(new Date(lastEntry.created_at));
      return;
    }

    if (lastEntry.action === "end") {
      setStatus("none");
      setStartTime(null);
      setBreakStart(null);
    }
  }

  function calculateWorkedMinutes(entries: TimeEntry[]) {
    let total = 0;
    let lastStart: Date | null = null;

    entries.forEach((entry) => {
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

    return Math.max(0, Math.floor(total));
  }

  function calculatePauseMinutes(entries: TimeEntry[]) {
    let total = 0;
    let pauseStart: Date | null = null;

    entries.forEach((entry) => {
      const time = new Date(entry.created_at);

      if (entry.action === "break_start") {
        pauseStart = time;
      }

      if (entry.action === "break_end" && pauseStart) {
        total += (time.getTime() - (pauseStart as Date).getTime()) / 1000 / 60;
        pauseStart = null;
      }
    });

    if (pauseStart) {
      total += (new Date().getTime() - (pauseStart as Date).getTime()) / 1000 / 60;
    }

    return Math.max(0, Math.floor(total));
  }

  async function checkOvertimeApproval(name: string) {
    const { data } = await supabase
      .from("admin_notifications")
      .select("id, status, notification_type")
      .eq("employee_name", name)
      .eq("notification_type", "overtime")
      .order("created_at", { ascending: false })
      .limit(1);

    const latest = data?.[0];

    if (latest?.status === "approved") {
      setOvertimeBlocked(false);
      setOvertimeWarningSent(false);
      setOvertimeRequestSent(false);
      setMessage("Überstunden wurden genehmigt. Du kannst weiterarbeiten.");
      await loadNotifications(name);
    }

    if (latest?.status === "rejected") {
      setMessage("Überstunden wurden abgelehnt. Bitte Schicht beendet lassen.");
      await loadNotifications(name);
    }
  }

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

  function isInsidePlannedWindow(task: Task | null) {
    if (!task?.start_time || !task?.end_time) return true;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = task.start_time.split(":").map(Number);
    const [endHour, endMinute] = task.end_time.split(":").map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  async function createEntry(
    action: "start" | "break_start" | "break_end" | "end",
    autoClockOut = false
  ) {
    if (!selectedTask || !selectedSite) {
      setMessage("Heute ist kein Einsatz ausgewählt.");
      return;
    }

    if (action === "start" && overtimeBlocked) {
      setMessage("Du wartest noch auf Freigabe für Überstunden.");
      return;
    }

    if (action === "start" && !isInsidePlannedWindow(selectedTask)) {
      setMessage("Du bist außerhalb deines geplanten Zeitfensters.");
      return;
    }

    const geo = await checkInsideObject();
    if (!geo) return;

    if (action === "start" && !geo.inside) {
      setMessage("Du bist zu weit vom Objekt entfernt. Einstempeln nicht möglich.");
      return;
    }

    const overtimeNow =
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
        overtime_minutes: overtimeNow,
        auto_clock_out: autoClockOut,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      setMessage("Stempelung konnte nicht gespeichert werden.");
      return;
    }

    await loadTodayEntries(employeeName);

    if (action === "start") {
      setStatus("working");
      setStartTime(new Date());
      setOvertimeWarningSent(false);
      setOvertimeBlocked(false);
      setOvertimeRequestSent(false);
      setMessage("Schicht gestartet.");
    }

    if (action === "break_start") {
      setStatus("break");
      setBreakStart(new Date());
      setMessage("Pause gestartet.");
    }

    if (action === "break_end") {
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

    await loadNotifications(employeeName);
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
   async function loadChatMessages() {
  if (!employeeName) return;

  const { data } = await supabase
    .from("chat_messages")
    .select(
      "id, employee_name, sender_role, sender_name, message, read_by_admin, read_by_employee, created_at"
    )
    .eq("employee_name", employeeName)
    .order("created_at", { ascending: true })
    .limit(100);

  setChatMessages((data || []) as ChatMessage[]);

  await supabase
    .from("chat_messages")
    .update({ read_by_employee: true })
    .eq("employee_name", employeeName)
    .eq("sender_role", "admin");

  setUnreadChatCount(0);
}

  async function sendChatMessage() {
  setChatError("");

  if (!chatText.trim()) return;

  if (!employeeName) {
    setChatError("Mitarbeiter konnte nicht erkannt werden.");
    return;
  }

  const text = chatText.trim();
  setChatText("");

  const { error } = await supabase.from("chat_messages").insert([
    {
      employee_name: employeeName,
      sender_role: "employee",
      sender_name: employeeName,
      message: text,
      read_by_admin: false,
      read_by_employee: true,
    },
  ]);

  if (error) {
    setChatError(error.message || "Nachricht konnte nicht gesendet werden.");
    setChatText(text);
    return;
  }

  await loadChatMessages();
}

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
async function changeOwnPassword() {
  setChangePasswordMessage("");

  if (newPassword.length < 6) {
    setChangePasswordMessage("Das neue Passwort muss mindestens 6 Zeichen haben.");
    return;
  }

  if (newPassword !== newPasswordRepeat) {
    setChangePasswordMessage("Die Passwörter stimmen nicht überein.");
    return;
  }

  setChangePasswordLoading(true);

  try {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setChangePasswordMessage("Benutzer konnte nicht gefunden werden.");
      setChangePasswordLoading(false);
      return;
    }

    const { error: passwordError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (passwordError) {
      setChangePasswordMessage("Passwort konnte nicht geändert werden.");
      setChangePasswordLoading(false);
      return;
    }

    await supabase
      .from("employee_profiles")
      .update({ must_change_password: false })
      .eq("auth_user_id", userData.user.id);

    setMustChangePassword(false);
    setNewPassword("");
    setNewPasswordRepeat("");
    setChangePasswordMessage("Passwort wurde geändert.");
  } catch {
    setChangePasswordMessage("Passwort konnte nicht geändert werden. Bitte Internet prüfen.");
  }

  setChangePasswordLoading(false);
}
function roleText(value: string | null) {
  if (value === "admin") return "Admin";
  return "Mitarbeiter";
}
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function enablePushNotifications() {
  setProfileMessage("Push wird geprüft...");

  try {
    if (!("serviceWorker" in navigator)) {
      setProfileMessage("Push wird von diesem Browser nicht unterstützt.");
      return;
    }

    if (!("Notification" in window)) {
      setProfileMessage("Benachrichtigungen werden von diesem Gerät nicht unterstützt.");
      return;
    }

    if (!("PushManager" in window)) {
      setProfileMessage("PushManager wird von diesem Browser nicht unterstützt.");
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!vapidPublicKey) {
      setProfileMessage("VAPID Public Key fehlt. Bitte Vercel ENV prüfen.");
      return;
    }

    setProfileMessage("Browser fragt nach Erlaubnis...");

    const permission = await Notification.requestPermission();

    localStorage.setItem("cleantrack_push_asked", "true");
    setShowPushPrompt(false);

    if (permission !== "granted") {
      setProfileMessage("Benachrichtigungen wurden nicht erlaubt.");
      return;
    }

    setProfileMessage("Service Worker wird registriert...");

    const registration = await navigator.serviceWorker.register("/sw.js");

    await navigator.serviceWorker.ready;

    setProfileMessage("Push-Abo wird erstellt...");

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    setProfileMessage("Push-Abo wird gespeichert...");

    const token = await getAccessToken();

    if (!token) {
      setProfileMessage("Sitzung fehlt. Bitte neu einloggen.");
      return;
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscription,
      }),
    });

    const text = await response.text();

    let result: { error?: string; message?: string; success?: boolean } = {};

    try {
      result = JSON.parse(text);
    } catch {
      setProfileMessage(
        `Push API antwortet nicht als JSON. Status: ${response.status}. Antwort: ${text.slice(
          0,
          120
        )}`
      );
      return;
    }

    if (!response.ok) {
      setProfileMessage(result.error || "Push konnte nicht aktiviert werden.");
      return;
    }

    setProfileMessage("Push-Benachrichtigungen wurden aktiviert.");
  } catch (error) {
    setProfileMessage(
      error instanceof Error
        ? `Push-Fehler: ${error.message}`
        : "Push konnte nicht aktiviert werden."
    );
  }
}
async function uploadProfileImage(file: File | null) {
  setProfileMessage("");

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setProfileMessage("Bitte ein Bild auswählen.");
    return;
  }

  setProfileImageLoading(true);

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    setProfileMessage("Benutzer wurde nicht gefunden.");
    setProfileImageLoading(false);
    return;
  }

  const fileExt = file.name.split(".").pop() || "jpg";
  const filePath = `${userData.user.id}/avatar-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, file, {
      upsert: true,
    });

  if (uploadError) {
    setProfileMessage("Profilbild konnte nicht hochgeladen werden.");
    setProfileImageLoading(false);
    return;
  }

  const { data: publicUrlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(filePath);

  const publicUrl = publicUrlData.publicUrl;

  const { error: profileError } = await supabase
    .from("employee_profiles")
    .update({ avatar_url: publicUrl })
    .eq("auth_user_id", userData.user.id);

  if (profileError) {
    setProfileMessage("Profilbild wurde hochgeladen, aber nicht gespeichert.");
    setProfileImageLoading(false);
    return;
  }

  setAvatarUrl(publicUrl);
  setProfileMessage("Profilbild wurde gespeichert.");
  setProfileImageLoading(false);
}

async function changeProfilePassword() {
  setProfileMessage("");

  if (profilePassword.length < 6) {
    setProfileMessage("Das Passwort muss mindestens 6 Zeichen haben.");
    return;
  }

  if (profilePassword !== profilePasswordRepeat) {
    setProfileMessage("Die Passwörter stimmen nicht überein.");
    return;
  }

  setProfilePasswordLoading(true);

  const { error } = await supabase.auth.updateUser({
    password: profilePassword,
  });

  if (error) {
    setProfileMessage("Passwort konnte nicht geändert werden.");
    setProfilePasswordLoading(false);
    return;
  }

  setProfilePassword("");
  setProfilePasswordRepeat("");
  setProfileMessage("Passwort wurde geändert.");
  setProfilePasswordLoading(false);
}
  function BackButton() {
    
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return (
      <button
        type="button"
        onClick={() => setActiveTab("home")}
        className="mb-5 px-5 py-3 rounded-2xl bg-white shadow-sm font-bold"
      >
        ← Zurück
      </button>
    );
  }

  if (!loggedIn) {
    
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return (
      <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
        {showPushPrompt && (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-5">
    <div className="bg-white rounded-[28px] p-6 shadow-sm max-w-sm w-full">
      <h2 className="text-xl font-bold mb-2">Benachrichtigungen aktivieren?</h2>

      <p className="text-gray-500 mb-5">
        Ich kann Push aktivieren, damit neue Nachrichten vom Admin auch angezeigt werden, wenn die App nicht geöffnet ist.
      </p>

      <button
        type="button"
        onClick={enablePushNotifications}
        className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold mb-3"
      >
        Push aktivieren
      </button>

      <button
        type="button"
        onClick={() => {
          localStorage.setItem("cleantrack_push_asked", "true");
          setShowPushPrompt(false);
        }}
        className="w-full p-4 rounded-2xl bg-gray-100 text-gray-600 font-bold"
      >
        Später
      </button>
    </div>
  </div>
)}
        <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-sm">
          <h1 className="text-2xl font-bold mb-2">Mitarbeiter Login</h1>
          <p className="text-gray-500 mb-6">Bitte einloggen.</p>

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
            disabled={loginLoading}
            onClick={login}
            className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold disabled:opacity-50"
          >
            {loginLoading ? "Login wird geprüft..." : "Login"}
          </button>

          <button
            type="button"
            onClick={resetPassword}
            className="w-full mt-3 p-4 rounded-2xl bg-gray-100 text-gray-600 font-bold"
          >
            Passwort vergessen?
          </button>

          {message && (
            <p className="mt-4 text-center text-red-500 font-medium">
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }
if (mustChangePassword) {
  
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return (
    <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Neues Passwort erstellen</h1>

        <p className="text-gray-500 mb-6">
          Bitte ändere dein Passwort, bevor du die App nutzt.
        </p>

        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Neues Passwort"
          className="w-full mb-3 p-4 rounded-2xl bg-gray-100 outline-none"
        />

        <input
          type="password"
          value={newPasswordRepeat}
          onChange={(e) => setNewPasswordRepeat(e.target.value)}
          placeholder="Passwort wiederholen"
          className="w-full mb-4 p-4 rounded-2xl bg-gray-100 outline-none"
        />

        <button
          type="button"
          disabled={changePasswordLoading}
          onClick={changeOwnPassword}
          className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold disabled:opacity-50"
        >
          {changePasswordLoading ? "Wird gespeichert..." : "Passwort speichern"}
        </button>

        {changePasswordMessage && (
          <p className="mt-4 text-center text-gray-700 font-medium">
            {changePasswordMessage}
          </p>
        )}
      </div>
    </main>
  );
}
  
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900 pb-24">
      {activeTab === "home" && (
        <>
          <section className="bg-white p-5 shadow-sm rounded-b-[32px]">
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

              <button
                type="button"
                onClick={() => loadAllData(employeeName)}
                className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-600 font-bold"
              >
                Aktualisieren
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("tasks")}
                className="bg-cyan-50 rounded-[24px] p-4 text-center shadow-sm"
              >
                <div className="text-3xl mb-2">☑️</div>
                <p className="text-sm font-medium">Aufgaben</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("clock")}
                className="bg-indigo-50 rounded-[24px] p-4 text-center shadow-sm"
              >
                <div className="text-3xl mb-2">⏱️</div>
                <p className="text-sm font-medium">Stempeluhr</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("schedule")}
                className="bg-orange-50 rounded-[24px] p-4 text-center shadow-sm"
              >
                <div className="text-3xl mb-2">📅</div>
                <p className="text-sm font-medium">Planung</p>
              </button>
            </div>
          </section>

          <section className="mt-4 px-5">
            <h2 className="text-lg font-bold mb-3">Heute</h2>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-[24px] p-4 shadow-sm">
                <p className="text-xs text-gray-400">Arbeitszeit</p>
                <p className="font-bold text-lg">{formatMinutes(workedMinutes)}</p>
              </div>

              <div className="bg-white rounded-[24px] p-4 shadow-sm">
                <p className="text-xs text-gray-400">Pause</p>
                <p className="font-bold text-lg">{formatMinutes(pauseMinutes)}</p>
              </div>

              <div className="bg-white rounded-[24px] p-4 shadow-sm">
                <p className="text-xs text-gray-400">Planzeit</p>
                <p className="font-bold text-lg">{formatMinutes(totalPlannedMinutes)}</p>
              </div>
            </div>

            {overtimeMinutes > 0 && (
              <div className="mt-3 bg-red-50 border border-red-100 rounded-[24px] p-4">
                <p className="font-bold text-red-600">
                  Überzeit: {formatMinutes(overtimeMinutes)}
                </p>
                <p className="text-sm text-gray-600">
                  Bitte mit dem Admin abstimmen.
                </p>
              </div>
            )}
          </section>

          <section className="mt-4 px-5">
            <h2 className="text-lg font-bold mb-3">Heutige Objekte</h2>

            <div className="grid grid-cols-1 gap-3">
              {todayTasks.length === 0 && (
                <div className="bg-white rounded-[28px] p-5 shadow-sm text-gray-400">
                  Heute keine Objekte geplant.
                </div>
              )}

              {Array.from(
                new Set(todayTasks.map((task) => task.site || "Kein Objekt"))
              ).map((siteName) => {
                const siteTasks = todayTasks.filter(
                  (task) => (task.site || "Kein Objekt") === siteName
                );

                
  // 🔴 Live Updates (Realtime)
  useEffect(() => {
    if (!employeeName) return;

    const channel = supabase
      .channel('tasks-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `employee_name=eq.${employeeName}`
        },
        () => {
          loadTasks(employeeName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeName]);

  // 🔁 Fallback Polling
  useEffect(() => {
    if (!employeeName) return;

    const interval = setInterval(() => {
      loadTasks(employeeName);
    }, 10000);

    return () => clearInterval(interval);
  }, [employeeName]);

return (
                  <button
                    type="button"
                    key={siteName}
                    onClick={() => setActiveTab("schedule")}
                    className="bg-white rounded-[28px] p-5 shadow-sm text-left flex justify-between items-center"
                  >
                    <div>
                      <p className="font-bold text-lg">{siteName}</p>
                      <p className="text-sm text-gray-500">
                        {siteTasks[0]?.start_time || "--:--"} -{" "}
                        {siteTasks[0]?.end_time || "--:--"} ·{" "}
                        {siteTasks.length} Aufgabe(n)
                      </p>
                    </div>

                    <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-500 flex items-center justify-center text-xl">
                      📍
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4 px-5">
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className="w-full bg-white rounded-[28px] p-5 shadow-sm flex items-center justify-between"
            >
              <div className="text-left">
                <p className="font-bold text-lg">
                  {openTasks} Aufgaben warten auf dich
                </p>
                <p className="text-sm text-gray-500">
                  {doneTasks} erledigt · {openTasks} offen
                </p>
              </div>

              <span className="px-5 py-2 rounded-full bg-blue-50 text-blue-500 font-bold">
                Öffnen
              </span>
            </button>
          </section>
        </>
      )}

      {activeTab === "clock" && (
        <>
          <section className="relative min-h-[42vh] bg-gradient-to-br from-slate-200 to-slate-100 overflow-hidden">
            <div className="relative p-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("home")}
                  className="w-14 h-14 rounded-full bg-gray-700 text-white text-3xl"
                >
                  ←
                </button>

                <div className="flex-1 bg-white rounded-full px-6 py-4 shadow-sm flex justify-between items-center">
                  <span className="text-gray-500">Arbeitszeit heute</span>
                  <strong className="text-xl">{formatMinutes(workedMinutes)}</strong>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                  <p className="text-xs text-gray-400">Pause</p>
                  <p className="font-bold">{formatMinutes(pauseMinutes)}</p>
                </div>

                <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                  <p className="text-xs text-gray-400">Planzeit</p>
                  <p className="font-bold">{formatMinutes(plannedMinutes)}</p>
                </div>

                <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                  <p className="text-xs text-gray-400">Überzeit</p>
                  <p className={overtimeMinutes > 0 ? "font-bold text-red-500" : "font-bold"}>
                    {formatMinutes(overtimeMinutes)}
                  </p>
                </div>
              </div>

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
                <p className="text-center text-gray-400 mb-4">Heutiger Einsatz</p>

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
                      {task.start_time} - {task.end_time} · {task.site} ·{" "}
                      {task.title}
                    </option>
                  ))}
                </select>
              </>
            )}

            <div className="flex justify-center mt-8">
              <button
                type="button"
                disabled={status !== "none" || tasks.length === 0}
                onClick={() => {
                  if (overtimeBlocked) {
                    setMessage("Du musst erst mit dem Admin sprechen.");
                    return;
                  }
                  createEntry("start");
                }}
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
                  type="button"
                  onClick={() => createEntry("break_start")}
                  className="px-6 py-3 rounded-full border text-purple-500 font-bold"
                >
                  Pause starten
                </button>
              )}

              {status === "break" && (
                <button
                  type="button"
                  onClick={() => createEntry("break_end")}
                  className="px-6 py-3 rounded-full border text-purple-500 font-bold"
                >
                  Pause beenden
                </button>
              )}

              {status !== "none" && (
                <button
                  type="button"
                  onClick={() => createEntry("end")}
                  className="px-6 py-3 rounded-full bg-red-100 text-red-600 font-bold"
                >
                  Schicht beenden
                </button>
              )}
            </div>

            {overtimeBlocked && (
              <div className="mt-6 p-4 bg-red-100 text-red-700 rounded-2xl text-center font-bold">
                <p>⚠️ Überstunden erreicht – bitte Admin kontaktieren</p>

                {overtimeRequestSent && (
                  <p className="text-sm text-green-700 mt-2">
                    Anfrage wurde an den Admin gesendet.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => checkOvertimeApproval(employeeName)}
                  className="mt-3 px-5 py-3 rounded-2xl bg-white text-red-600 font-bold"
                >
                  Freigabe prüfen
                </button>
              </div>
            )}

            {message && (
              <p className="mt-4 text-center font-medium text-gray-700">
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
                type="button"
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className="w-full bg-white rounded-[24px] p-4 shadow-sm flex justify-between items-center text-left"
              >
                <div>
                  <p
                    className={
                      task.done
                        ? "font-bold line-through text-gray-400"
                        : "font-bold"
                    }
                  >
                    {task.title}
                  </p>
                  <p className="text-sm text-gray-500">
                    {task.site || "Kein Objekt"} · {task.start_time} -{" "}
                    {task.end_time}
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
          <h1 className="text-2xl font-bold mb-5">Planung</h1>

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
      <div className="space-y-3 mb-5 max-h-[55vh] overflow-y-auto">
        {chatMessages.length === 0 && (
          <p className="text-gray-400 text-center">
            Noch keine Nachrichten vorhanden.
          </p>
        )}

        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={
              msg.sender_role === "employee"
                ? "bg-blue-100 rounded-2xl p-4 ml-8"
                : "bg-gray-100 rounded-2xl p-4 mr-8"
            }
          >
            <div className="flex justify-between text-sm mb-1">
              <p className="font-bold">
                {msg.sender_role === "employee" ? "Ich" : "Admin"}
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
        <div ref={chatEndRef} />
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
      className="px-5 rounded-2xl bg-blue-500 text-white font-bold"
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
    </div>
  </section>
)}

      {activeTab === "profile" && (
  <section className="p-5">
    <BackButton />

    <h1 className="text-2xl font-bold mb-5">Profil</h1>

    <div className="bg-white rounded-[28px] p-5 shadow-sm space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-orange-400 overflow-hidden flex items-center justify-center text-white text-2xl font-bold">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Profilbild"
              className="w-full h-full object-cover"
            />
          ) : (
            employeeName.charAt(0).toUpperCase()
          )}
        </div>

        <div>
          <p className="font-bold text-lg">{employeeName}</p>
          <p className="text-gray-500">{roleText(role)}</p>
        </div>
      </div>

      <div>
        <p className="font-bold mb-2">Profilbild ändern</p>

        <input
          type="file"
          accept="image/*"
          onChange={(e) => uploadProfileImage(e.target.files?.[0] || null)}
          className="w-full p-4 rounded-2xl bg-gray-100 outline-none"
        />

        {profileImageLoading && (
          <p className="text-sm text-gray-500 mt-2">Bild wird hochgeladen...</p>
        )}
      </div>
<div className="border-t pt-5">
  <h2 className="font-bold mb-2">Benachrichtigungen</h2>

  <p className="text-sm text-gray-500 mb-3">
    Aktiviere Push, damit du neue Nachrichten vom Admin auch bekommst, wenn die App nicht geöffnet ist.
  </p>

  <button
    type="button"
    onClick={enablePushNotifications}
    className="w-full p-4 rounded-2xl bg-purple-100 text-purple-600 font-bold"
  >
    Push-Benachrichtigungen aktivieren
  </button>
</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-100 rounded-2xl p-4">
          <p className="text-gray-400 text-sm">Arbeitszeit</p>
          <p className="font-bold">{formatMinutes(workedMinutes)}</p>
        </div>

        <div className="bg-gray-100 rounded-2xl p-4">
          <p className="text-gray-400 text-sm">Pause</p>
          <p className="font-bold">{formatMinutes(pauseMinutes)}</p>
        </div>
      </div>

      <div className="border-t pt-5">
        <h2 className="font-bold mb-3">Passwort ändern</h2>

        <input
          type="password"
          value={profilePassword}
          onChange={(e) => setProfilePassword(e.target.value)}
          placeholder="Neues Passwort"
          className="w-full mb-3 p-4 rounded-2xl bg-gray-100 outline-none"
        />

        <input
          type="password"
          value={profilePasswordRepeat}
          onChange={(e) => setProfilePasswordRepeat(e.target.value)}
          placeholder="Passwort wiederholen"
          className="w-full mb-3 p-4 rounded-2xl bg-gray-100 outline-none"
        />

        <button
          type="button"
          disabled={profilePasswordLoading}
          onClick={changeProfilePassword}
          className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold disabled:opacity-50"
        >
          {profilePasswordLoading ? "Wird geändert..." : "Passwort ändern"}
        </button>
      </div>

      {profileMessage && (
        <p className="text-center font-bold text-blue-600">
          {profileMessage}
        </p>
      )}

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
        type="button"
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
                type="button"
                onClick={() => (window.location.href = "/admin")}
                className="w-full p-4 rounded-2xl bg-blue-500 text-white font-bold"
              >
                Admin Dashboard öffnen
              </button>
            ) : (
              <p className="text-gray-400">
                Nur Administratoren können das sehen.
              </p>
            )}
          </div>
        </section>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t grid grid-cols-5 p-2 text-xs text-gray-500">
        <button
          type="button"
          onClick={() => setActiveTab("home")}
          className={activeTab === "home" ? "text-blue-500 font-bold" : ""}
        >
          <div className="text-2xl">⌂</div>
          Startseite
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={activeTab === "search" ? "text-blue-500 font-bold" : ""}
        >
          <div className="text-2xl">⌕</div>
          Suche
        </button>

        <button
  type="button"
  onClick={() => setActiveTab("chat")}
  className={activeTab === "chat" ? "text-blue-500 font-bold relative" : "relative"}
>
  <div className="relative text-2xl">
    ▢
    {unreadChatCount > 0 && activeTab !== "chat" && (
      <span className="absolute -top-2 -right-3 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
        {unreadChatCount}
      </span>
    )}
  </div>
  Chat
</button>

        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={activeTab === "profile" ? "text-blue-500 font-bold" : ""}
        >
          <div className="text-2xl">○</div>
          Profil
        </button>

        <button
          type="button"
          onClick={() => setActiveTab(role === "admin" ? "admin" : "schedule")}
          className={
            activeTab === "admin" || activeTab === "schedule"
              ? "text-blue-500 font-bold"
              : ""
          }
        >
          <div className="text-2xl">♕</div>
          {role === "admin" ? "Admin" : "Planung"}
        </button>
      </nav>
    </main>
  );
}