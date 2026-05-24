"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Row = Record<string, any>;

type AdminData = {
  ok: boolean;
  error?: string;
  profile?: Row;
  employees: Row[];
  customers: Row[];
  workSites: Row[];
  tasks: Row[];
  timeEntries: Row[];
  absences: Row[];
  materialReports: Row[];
  notifications: Row[];
};

type TaskState = "done" | "working" | "break" | "late" | "upcoming" | "open";

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function taskTime(task: Row) {
  const start = clean(task.start_time) || "--:--";
  const end = clean(task.end_time) || "--:--";
  return `${start} - ${end}`;
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function timeText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function minutesFromTimes(start?: string | null, end?: string | null, fallback?: unknown) {
  const known = Number(fallback || 0);
  if (Number.isFinite(known) && known > 0) return known;
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(":").map(Number);
  const [eh, em] = String(end).split(":").map(Number);
  let a = (sh || 0) * 60 + (sm || 0);
  let b = (eh || 0) * 60 + (em || 0);
  if (b < a) b += 1440;
  return Math.max(0, b - a);
}

function hoursLabel(minutes: number) {
  if (!minutes) return "0:00 h";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")} h`;
}

function asTimestamp(task: Row) {
  if (!task.task_date || !task.start_time) return 0;
  const start = `${task.task_date}T${String(task.start_time).length === 5 ? `${task.start_time}:00` : task.start_time}`;
  const date = new Date(start);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isSuccessful(entry: Row) {
  return entry.success !== false;
}

function taskEntries(entries: Row[], task: Row) {
  return entries
    .filter((entry) => isSuccessful(entry))
    .filter((entry) => {
      if (entry.task_id && task.id) return entry.task_id === task.id;
      const sameEmployee = clean(entry.employee_name) && clean(entry.employee_name) === clean(task.employee_name);
      const sameSite = clean(entry.work_site_name) && clean(entry.work_site_name) === clean(task.site || task.customer_name);
      const sameDay = clean(entry.created_at).slice(0, 10) === clean(task.task_date);
      return sameEmployee && sameSite && sameDay;
    })
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

function stateForTask(task: Row, entries: Row[]): TaskState {
  if (task.done || ["done", "completed", "approved", "erledigt"].includes(clean(task.status).toLowerCase())) return "done";
  const last = entries[entries.length - 1];
  const action = clean(last?.action).toLowerCase();
  if (["clock_out", "end", "check_out"].includes(action)) return "done";
  if (["break_start", "pause_start"].includes(action)) return "break";
  if (["clock_in", "start", "check_in", "break_end", "pause_end"].includes(action)) return "working";
  const startedAt = asTimestamp(task);
  if (startedAt && Date.now() > startedAt + 15 * 60000) return "late";
  if (startedAt && Date.now() < startedAt) return "upcoming";
  return "open";
}

function statusLabel(state: TaskState) {
  return {
    done: "Erledigt",
    working: "In Arbeit",
    break: "Pause",
    late: "Überfällig",
    upcoming: "Geplant",
    open: "Offen"
  }[state];
}

function statusClass(state: TaskState) {
  if (state === "done") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  if (state === "working") return "border-blue-500/30 bg-blue-500/10 text-blue-100";
  if (state === "break") return "border-yellow-500/30 bg-yellow-500/10 text-yellow-100";
  if (state === "late") return "border-red-500/30 bg-red-500/10 text-red-100";
  return "border-slate-700 bg-slate-950 text-slate-200";
}

function mapUrl(task: Row) {
  const target = clean(task.site || task.customer_name || task.title);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="phone-bg min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-5">
      <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-[430px] overflow-hidden rounded-[2rem] border border-blue-500/30 bg-slate-950 shadow-2xl shadow-blue-950/40">
        <div className="min-h-[calc(100vh-2rem)] bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-4 py-5">
          {children}
        </div>
      </div>
    </main>
  );
}

function LoginBox({ onLogin }: { onLogin: (token: string) => Promise<void> }) {
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
      if (!token) throw new Error("Session fehlt.");
      await onLogin(token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <div className="flex min-h-[calc(100vh-4rem)] flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-blue-500/40 bg-blue-500/10 text-3xl">📍</div>
          <h1 className="text-3xl font-black">Tageszentrale</h1>
          <p className="mt-2 text-sm text-slate-400">Live-Status für heutige Einsätze.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">E-Mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Passwort</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" />
          </label>
          {error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
          <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Melde an…" : "Anmelden"}</button>
        </form>
      </div>
    </Shell>
  );
}

function StatCard({ title, value, caption }: { title: string; value: string | number; caption: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </div>
  );
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="font-black text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}

export default function TageszentralePage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TaskState>("all");
  const today = localToday();

  const load = useCallback(async (overrideToken?: string) => {
    const currentToken = overrideToken || token;
    if (!currentToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/admin/dashboard", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Tagesdaten konnten nicht geladen werden.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Tagesdaten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionToken = sessionData.session?.access_token || "";
      setToken(sessionToken);
      setAuthLoading(false);
      if (sessionToken) await load(sessionToken);
    }
    init();
  }, [load]);

  async function handleLogin(nextToken: string) {
    setToken(nextToken);
    await load(nextToken);
  }

  async function logout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setToken("");
    setData(null);
  }

  const todayTasks = useMemo(() => {
    return (data?.tasks || [])
      .filter((task) => clean(task.task_date) === today)
      .sort((a, b) => `${clean(a.start_time) || "99:99"}-${clean(a.employee_name)}`.localeCompare(`${clean(b.start_time) || "99:99"}-${clean(b.employee_name)}`));
  }, [data?.tasks, today]);

  const enriched = useMemo(() => {
    return todayTasks.map((task) => {
      const entries = taskEntries(data?.timeEntries || [], task);
      const state = stateForTask(task, entries);
      const last = entries[entries.length - 1] || null;
      return { task, entries, state, last };
    });
  }, [todayTasks, data?.timeEntries]);

  const shown = useMemo(() => filter === "all" ? enriched : enriched.filter((item) => item.state === filter), [enriched, filter]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: enriched.length, done: 0, working: 0, break: 0, late: 0, upcoming: 0, open: 0 };
    enriched.forEach((item) => { result[item.state] = (result[item.state] || 0) + 1; });
    return result;
  }, [enriched]);
  const plannedMinutes = useMemo(() => todayTasks.reduce((sum, task) => sum + minutesFromTimes(task.start_time, task.end_time, task.planned_minutes || task.max_minutes), 0), [todayTasks]);

  async function updateTaskStatus(task: Row, done: boolean) {
    if (!token) return;
    setSavingId(task.id);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/mobile/admin/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "task_status", id: task.id, done, status: done ? "done" : "open" })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Status konnte nicht gespeichert werden.");
      setMessage(done ? "Einsatz wurde als erledigt markiert." : "Einsatz wurde wieder geöffnet.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Status konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  if (authLoading) {
    return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-slate-400">Lade Anmeldung…</div></Shell>;
  }

  if (!token) return <LoginBox onLogin={handleLogin} />;

  return (
    <Shell>
      <div className="space-y-4 pb-24">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-300">CleanTrack Admin</p>
            <h1 className="text-3xl font-black">Tageszentrale</h1>
            <p className="mt-1 text-xs text-slate-400">{dateText(today)} · {data?.profile?.name || "Admin"}</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-black text-slate-200">Logout</button>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Heute" value={counts.all} caption="Einsätze" />
          <StatCard title="Planzeit" value={hoursLabel(plannedMinutes)} caption="geplante Zeit" />
          <StatCard title="Aktiv" value={counts.working + counts.break} caption="in Arbeit / Pause" />
          <StatCard title="Problem" value={counts.late} caption="überfällig" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => load()} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-glow">{loading ? "Lade…" : "Neu laden"}</button>
          <Link href="/mitarbeiter/admin/auswertung" className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black text-blue-100">Auswertung</Link>
          <Link href="/mitarbeiter/admin" className="col-span-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black text-blue-100">Admin-Dashboard</Link>
        </div>

        {error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
        {message && <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</p>}
        {loading && <p className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">Aktualisiere Live-Status…</p>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {([
            ["all", "Alle", counts.all],
            ["late", "Überfällig", counts.late],
            ["working", "In Arbeit", counts.working],
            ["break", "Pause", counts.break],
            ["open", "Offen", counts.open],
            ["upcoming", "Geplant", counts.upcoming],
            ["done", "Erledigt", counts.done]
          ] as Array<["all" | TaskState, string, number]>).map(([key, label, count]) => (
            <button key={key} onClick={() => setFilter(key)} className={`w-full rounded-2xl border px-3 py-2 text-left text-xs ${filter === key ? "border-blue-500 bg-blue-600 text-white" : "border-slate-800 bg-slate-900 text-slate-300"}`}>
              <span className="block font-black">{label}</span>
              <span className="opacity-80">{count}</span>
            </button>
          ))}
        </div>

        <section className="space-y-3">
          {shown.length ? shown.map(({ task, entries, state, last }) => (
            <article key={task.id} className={`rounded-3xl border p-4 ${state === "late" ? "border-red-500/40 bg-red-500/10" : "border-slate-800 bg-slate-900/80"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-blue-300">{taskTime(task)}</p>
                  <h2 className="mt-1 text-lg font-black text-white">{task.title || "Einsatz"}</h2>
                  <p className="mt-1 truncate text-sm text-slate-300">{task.site || task.customer_name || "Ohne Objekt"}</p>
                  <p className="mt-1 text-xs text-slate-500">{task.employee_name || "Ohne Mitarbeiter"}</p>
                </div>
                <span className={`min-w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass(state)}`}>{statusLabel(state)}</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-2xl bg-slate-950 px-3 py-2">
                  <p className="text-slate-500">Plan</p>
                  <p className="font-black text-blue-100">{hoursLabel(minutesFromTimes(task.start_time, task.end_time, task.planned_minutes || task.max_minutes))}</p>
                </div>
                <div className="rounded-2xl bg-slate-950 px-3 py-2">
                  <p className="text-slate-500">Buchungen</p>
                  <p className="font-black text-blue-100">{entries.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-950 px-3 py-2">
                  <p className="text-slate-500">Letzte</p>
                  <p className="font-black text-blue-100">{last ? timeText(last.created_at) : "—"}</p>
                </div>
              </div>

              {last ? (
                <p className="mt-3 rounded-2xl bg-slate-950 px-3 py-2 text-xs text-slate-300">
                  Letzte Aktion: <span className="font-black text-blue-100">{clean(last.action) || "Stempel"}</span>
                  {typeof last.distance_m === "number" ? ` · GPS ${last.distance_m} m` : ""}
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={mapUrl(task)} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm font-black text-blue-100">Route</a>
                <button disabled={savingId === task.id} onClick={() => updateTaskStatus(task, state !== "done")} className="rounded-2xl bg-blue-600 px-3 py-2 text-sm font-black text-white disabled:opacity-60">
                  {savingId === task.id ? "Speichere…" : state === "done" ? "Wieder öffnen" : "Erledigt"}
                </button>
              </div>
            </article>
          )) : <EmptyCard title="Keine Einsätze für heute" text="Hier erscheinen nur Termine mit dem heutigen Datum. Alte Aufträge werden bewusst nicht angezeigt." />}
        </section>
      </div>
    </Shell>
  );
}
