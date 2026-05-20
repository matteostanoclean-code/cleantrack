"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "home" | "schedule" | "clock" | "timesheet" | "tasks" | "menu";
type ClockStatus = "idle" | "working" | "break";

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
};

const assignments: Assignment[] = [
  {
    id: "a1",
    time: "08:00 - 12:00",
    title: "Nexus Hub Station",
    address: "402 Innovation Way, EG",
    customer: "Facility Maintenance",
    tag: "Deep Cleaning",
    priority: "overdue",
    duration: "4h"
  },
  {
    id: "a2",
    time: "13:30 - 15:00",
    title: "Silverline Towers",
    address: "Am Markt 5, Flur 14-16",
    customer: "Routine Inspection",
    tag: "Kontrolle",
    priority: "normal",
    duration: "1.5h"
  },
  {
    id: "a3",
    time: "16:00 - 18:00",
    title: "Greenfield Medical",
    address: "1220 Wellness Blvd, Wing B",
    customer: "Emergency Repair",
    tag: "Hygiene",
    priority: "urgent",
    duration: "2h"
  }
];

const starterEntries: TimeEntry[] = [
  {
    id: "t1",
    day: "Mo 23",
    start: "08:00",
    end: "17:00",
    site: "Facility Maintenance · Wing A",
    status: "approved",
    minutes: 510,
    note: "Freigegeben"
  },
  {
    id: "t2",
    day: "Di 24",
    start: "08:15",
    end: "17:45",
    site: "Electrical Inspection · Floor 4",
    status: "open",
    minutes: 540,
    note: "Offen"
  },
  {
    id: "t3",
    day: "Mi 25",
    start: "Krank",
    end: "",
    site: "Doctor certificate uploaded",
    status: "sick",
    minutes: 0,
    note: "Krankmeldung"
  },
  {
    id: "t4",
    day: "Do 26",
    start: "09:00",
    end: "18:00",
    site: "System Calibration · Server Room",
    status: "approved",
    minutes: 480,
    note: "Freigegeben"
  }
];

const tabFromProp = (value?: string): Tab => {
  if (value === "schedule" || value === "clock" || value === "timesheet" || value === "tasks") return value;
  if (value === "search" || value === "chat" || value === "profile" || value === "material" || value === "admin") return "menu";
  return "home";
};

const two = (value: number) => String(value).padStart(2, "0");
const timeNow = () => `${two(new Date().getHours())}:${two(new Date().getMinutes())}`;

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
    user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
  };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.home} />
    </svg>
  );
}

function AppShell({ children, active, setActive }: { children: React.ReactNode; active: Tab; setActive: (tab: Tab) => void }) {
  const nav: Array<{ key: Tab; label: string; icon: string }> = [
    { key: "home", label: "Home", icon: "home" },
    { key: "timesheet", label: "Zeiten", icon: "sheet" },
    { key: "schedule", label: "Plan", icon: "calendar" },
    { key: "clock", label: "Stempel", icon: "clock" },
    { key: "menu", label: "Mehr", icon: "menu" }
  ];

  return (
    <main className="phone-bg min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-5">
      <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-[430px] overflow-hidden rounded-[2rem] border border-blue-500/30 bg-slate-950 shadow-2xl shadow-blue-950/40">
        <div className="flex min-h-[calc(100vh-2rem)] flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
          <Header />
          <section className="flex-1 overflow-y-auto px-4 pb-28 pt-3">{children}</section>
          <nav className="fixed bottom-4 left-1/2 z-40 grid w-[calc(100%-1.5rem)] max-w-[430px] -translate-x-1/2 grid-cols-5 rounded-3xl border border-slate-800 bg-slate-950/95 p-2 shadow-2xl backdrop-blur md:absolute md:bottom-4">
            {nav.map((item) => {
              const selected = active === item.key;
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

function Header() {
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
        <button className="rounded-2xl border border-slate-800 bg-slate-900 p-2 text-blue-200">
          <Icon name="bell" />
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

function Dashboard({ setActive }: { setActive: (tab: Tab) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xl font-black tracking-tight">Hallo, Matteo</p>
        <p className="text-xs text-slate-400">Schicht läuft gut. Heute stehen 3 Einsätze an.</p>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Tagesfortschritt</p>
            <p className="mt-1 text-3xl font-black text-white">5.5h</p>
            <p className="text-xs text-slate-400">von 8h gearbeitet</p>
          </div>
          <ProgressRing percent={68} />
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-800">
          <div className="h-2 w-[68%] rounded-full bg-blue-600" />
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Eingestempelt um 08:00 · Schicht endet 16:30</p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Nächster Einsatz</h2>
          <button onClick={() => setActive("schedule")} className="text-xs font-semibold text-blue-300">Plan ansehen</button>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-800/80">
          <div className="flex gap-3 p-4">
            <div className="min-w-0 flex-1">
              <span className="rounded-md bg-blue-500/20 px-2 py-1 text-[11px] font-semibold text-blue-200">Upcoming · 13:30 - 15:00</span>
              <h3 className="mt-3 font-black">Nexus Tech Plaza</h3>
              <p className="mt-1 text-xs text-slate-400">Flur 4 & 5, Tower A</p>
            </div>
            <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-blue-300 via-slate-700 to-slate-950 shadow-inner" />
          </div>
          <div className="grid grid-cols-2 border-t border-slate-700 text-sm">
            <button className="flex items-center justify-center gap-2 py-3 text-blue-100"><Icon name="map" />Route</button>
            <button className="flex items-center justify-center gap-2 py-3 text-blue-100"><Icon name="shield" />Info</button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Schnellaktionen</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setActive("tasks")} className="rounded-3xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-blue-600">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-200"><Icon name="tasks" /></div>
            <p className="font-bold">Aufgaben</p>
            <p className="text-xs text-slate-400">Heute abhaken</p>
          </button>
          <button onClick={() => setActive("menu")} className="rounded-3xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-blue-600">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-200"><Icon name="box" /></div>
            <p className="font-bold">Material</p>
            <p className="text-xs text-slate-400">Mangel melden</p>
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 font-bold">Heutige Aktivität</h2>
        <div className="space-y-3 text-sm">
          <Activity label="Einsatz Orion Lofts abgeschlossen" time="12:45 · 2.5 Stunden" />
          <Activity label="Pause gestartet" time="12:00 · 45 Minuten" />
          <Activity label="GPS-Check erfolgreich" time="08:01 · Main Entrance" />
        </div>
      </section>
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

function Schedule() {
  const days = ["Mo 12", "Di 13", "Mi 14", "Do 15", "Fr 16"];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Einsatzplan</h1>
        <p className="text-xs text-slate-400">Heute im Fokus</p>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {days.map((day, index) => (
          <button key={day} className={`min-w-16 rounded-2xl border p-3 text-sm ${index === 1 ? "border-blue-500 bg-blue-600 text-white" : "border-slate-800 bg-slate-900 text-slate-300"}`}>
            <span className="block text-[10px] uppercase text-slate-400">{day.split(" ")[0]}</span>
            <span className="text-lg font-black">{day.split(" ")[1]}</span>
          </button>
        ))}
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Today's Focus</h2>
          <span className="rounded-md bg-red-500/15 px-2 py-1 text-[10px] font-bold uppercase text-red-300">Overdue</span>
        </div>
        <AssignmentCard assignment={assignments[0]} featured />
      </section>

      <section>
        <h2 className="mb-2 font-bold">Nächste Einsätze</h2>
        <div className="space-y-3">
          {assignments.slice(1).map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}
        </div>
      </section>
    </div>
  );
}

function AssignmentCard({ assignment, featured }: { assignment: Assignment; featured?: boolean }) {
  const priorityColor = assignment.priority === "urgent" ? "bg-orange-400" : assignment.priority === "overdue" ? "bg-red-400" : "bg-blue-400";
  return (
    <article className={`rounded-3xl border border-slate-800 ${featured ? "bg-slate-800" : "bg-slate-900/70"} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-blue-200">{assignment.time}</p>
          <h3 className="mt-2 font-black text-white">{assignment.title}</h3>
          <p className="mt-1 text-xs text-slate-400">{assignment.address}</p>
        </div>
        <span className="rounded-full bg-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200">{assignment.duration}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-lg bg-blue-500/15 px-2 py-1 text-[11px] font-semibold text-blue-200">{assignment.tag}</span>
        <span className="rounded-lg bg-slate-700/70 px-2 py-1 text-[11px] text-slate-300">{assignment.customer}</span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400"><span className={`h-2 w-2 rounded-full ${priorityColor}`} />{assignment.priority === "normal" ? "Normal" : assignment.priority === "urgent" ? "Dringend" : "Überfällig"}</div>
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Öffnen</button>
      </div>
    </article>
  );
}

function Clock({ entries, setEntries }: { entries: TimeEntry[]; setEntries: (entries: TimeEntry[]) => void }) {
  const [status, setStatus] = useState<ClockStatus>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const raw = window.localStorage.getItem("cleantrack-clock");
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { status: ClockStatus; startedAt: number | null };
      setStatus(data.status || "idle");
      setStartedAt(data.startedAt || null);
    } catch {
      window.localStorage.removeItem("cleantrack-clock");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("cleantrack-clock", JSON.stringify({ status, startedAt }));
  }, [status, startedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!startedAt || status === "idle") {
        setSeconds(0);
        return;
      }
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, status]);

  function clockIn() {
    setStatus("working");
    setStartedAt(Date.now());
  }

  function startBreak() {
    if (status === "working") setStatus("break");
  }

  function endBreak() {
    if (status === "break") setStatus("working");
  }

  function clockOut() {
    const minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 1;
    const newEntry: TimeEntry = {
      id: safeId(),
      day: "Heute",
      start: startedAt ? new Date(startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : timeNow(),
      end: timeNow(),
      site: "Terminal B · Karl-Hall Cleaning",
      status: "open",
      minutes,
      note: "Neu erfasst"
    };
    const nextEntries = [newEntry, ...entries].slice(0, 12);
    setEntries(nextEntries);
    window.localStorage.setItem("cleantrack-entries", JSON.stringify(nextEntries));
    setStatus("idle");
    setStartedAt(null);
  }

  const statusText = status === "working" ? "In Progress" : status === "break" ? "Pause läuft" : "Bereit";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Stempeluhr</h1>
        <p className="text-xs text-slate-400">GPS-Prüfung und Tageszeit</p>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-center">
        <div className="flex items-center justify-between text-xs">
          <div className="text-left">
            <p className="uppercase tracking-wide text-slate-500">Status</p>
            <p className="font-bold text-blue-200">• {statusText}</p>
          </div>
          <div className="text-right">
            <p className="uppercase tracking-wide text-slate-500">Daily Total</p>
            <p className="font-bold text-blue-100">06:42:15</p>
          </div>
        </div>
        <p className="mt-8 text-5xl font-black tracking-[0.15em] text-blue-100">{formatDuration(seconds || 8045)}</p>
        <p className="mt-2 text-sm italic text-slate-400">Shift: Terminal B · Janitorial</p>
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-left text-xs">
          <div>
            <p className="font-bold text-slate-100">Position GPS aktiv</p>
            <p className="text-slate-500">Innerhalb 15m vom Einsatzort</p>
          </div>
          <span className="grid h-7 w-7 place-items-center rounded-full border border-blue-500 text-blue-300">✓</span>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Aktueller Einsatz</p>
        <select className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none">
          <option>Terminal B · Karl-Hall Cleaning</option>
          <option>Nexus Hub Station</option>
          <option>Silverline Towers</option>
        </select>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {status === "idle" ? (
            <button onClick={clockIn} className="col-span-2 rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow">Clock In</button>
          ) : (
            <>
              {status === "break" ? (
                <button onClick={endBreak} className="rounded-2xl bg-blue-600 py-4 font-black text-white">Pause beenden</button>
              ) : (
                <button onClick={startBreak} className="rounded-2xl bg-slate-800 py-4 font-black text-white">Pause</button>
              )}
              <button onClick={clockOut} className="rounded-2xl bg-red-600 py-4 font-black text-white">Clock Out</button>
            </>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-blue-400/20 bg-blue-400/10 p-4">
        <h2 className="font-black">Schichtlimit erreicht</h2>
        <p className="mt-2 text-sm text-slate-300">Du hast die geplanten 8.0 Stunden erreicht. Überstunden können separat angefragt werden.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="rounded-xl bg-slate-900 py-3 text-sm font-bold text-slate-200">Schließen</button>
          <button className="rounded-xl bg-blue-200 py-3 text-sm font-black text-slate-950">+1h anfragen</button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Timeline</h2>
        <div className="space-y-2">
          <Timeline label="Clock In" details="Main Entrance · GPS verified" time="08:00" />
          <Timeline label="Break Start" details="30 Minuten geplant" time="12:15" />
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

function Timesheet({ entries }: { entries: TimeEntry[] }) {
  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.minutes, 0), [entries]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Stundenzettel</h1>
          <p className="text-xs text-slate-400">Oktober 2026</p>
        </div>
        <div className="flex gap-2">
          <button className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-blue-200">‹</button>
          <button className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-blue-200">›</button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Total Work Hours</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-black text-white">{minutesToHours(total)}</p>
            <p className="text-xs text-slate-400">von 168h</p>
          </div>
          <div className="h-16 flex-1 rounded-2xl bg-slate-950 p-3">
            <div className="mt-8 h-2 rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.round((total / (168 * 60)) * 100))}%` }} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard title="Urlaub" value="18 Tage" caption="verfügbar" accent="text-blue-100" />
        <MetricCard title="Krank" value="2 Tage" caption="laufender Monat" accent="text-red-200" />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Tageseinträge</h2>
          <button className="text-xs font-semibold text-blue-300">Filter</button>
        </div>
        <div className="space-y-2">
          {entries.map((entry) => <TimeRow key={entry.id} entry={entry} />)}
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

function Tasks() {
  const tasks = [
    ["Eingangsbereich wischen", "Terminal B", true],
    ["Sanitärkontrolle dokumentieren", "Nexus Hub", false],
    ["Materialbestand prüfen", "Silverline Towers", false]
  ] as const;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Aufgaben</h1>
        <p className="text-xs text-slate-400">Heute abhaken und sauber dokumentieren</p>
      </div>
      <div className="space-y-3">
        {tasks.map(([title, site, done]) => (
          <label key={title} className="flex items-center gap-3 rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <input type="checkbox" defaultChecked={done} className="h-5 w-5 accent-blue-600" />
            <div>
              <p className="font-black">{title}</p>
              <p className="text-xs text-slate-500">{site}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function Menu() {
  const items = [
    ["Material melden", "Verbrauchsmaterial nachbestellen", "box"],
    ["Abwesenheit", "Urlaub oder Krankheit einreichen", "calendar"],
    ["Chat", "Nachricht an die Verwaltung", "chat"],
    ["Profil", "Stammdaten und Einstellungen", "user"]
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Mehr</h1>
        <p className="text-xs text-slate-400">Weitere Funktionen für den Arbeitsalltag</p>
      </div>
      <div className="space-y-3">
        {items.map(([title, subtitle, icon]) => (
          <button key={title} className="flex w-full items-center gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-blue-600">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/15 text-blue-200"><Icon name={icon} /></div>
            <div>
              <p className="font-black">{title}</p>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MitarbeiterApp({ initialTab = "home" }: { initialTab?: string }) {
  const [active, setActive] = useState<Tab>(() => tabFromProp(initialTab));
  const [entries, setEntriesState] = useState<TimeEntry[]>(starterEntries);

  useEffect(() => {
    const raw = window.localStorage.getItem("cleantrack-entries");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as TimeEntry[];
      if (Array.isArray(parsed) && parsed.length) setEntriesState(parsed);
    } catch {
      window.localStorage.removeItem("cleantrack-entries");
    }
  }, []);

  function setEntries(nextEntries: TimeEntry[]) {
    setEntriesState(nextEntries);
    if (typeof window !== "undefined") window.localStorage.setItem("cleantrack-entries", JSON.stringify(nextEntries));
  }

  return (
    <AppShell active={active} setActive={setActive}>
      {active === "home" && <Dashboard setActive={setActive} />}
      {active === "schedule" && <Schedule />}
      {active === "clock" && <Clock entries={entries} setEntries={setEntries} />}
      {active === "timesheet" && <Timesheet entries={entries} />}
      {active === "tasks" && <Tasks />}
      {active === "menu" && <Menu />}
    </AppShell>
  );
}
