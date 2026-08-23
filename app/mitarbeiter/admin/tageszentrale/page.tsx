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
  if (state === "done") return "border-brand-500/30 bg-brand-50 text-brand-700";
  if (state === "working") return "border-brand-500/30 bg-brand-50 text-brand-700";
  if (state === "break") return "border-amber-500/30 bg-amber-100 text-amber-700";
  if (state === "late") return "border-rose-500/30 bg-rose-100 text-rose-700";
  return "border-paper-300 bg-paper-100 text-ink-600";
}

function mapUrl(task: Row) {
  const target = clean(task.site || task.customer_name || task.title);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="mx-auto min-h-[100dvh] max-w-[520px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8 px-4 py-5" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        {children}
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
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-brand-500/40 bg-brand-50 text-3xl">📍</div>
          <h1 className="text-3xl font-bold">Tageszentrale</h1>
          <p className="mt-2 text-sm text-ink-400">Live-Status für heutige Einsätze.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-paper-200 bg-white p-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">E-Mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Passwort</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500" />
          </label>
          {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white shadow-glow disabled:opacity-60">{saving ? "Melde an…" : "Anmelden"}</button>
        </form>
      </div>
    </Shell>
  );
}

/** Farbige Statusbox mit Zahl, gleichzeitig Filter. */
function StatusBox({ tone, label, count, onClick, active }: { tone: "danger" | "warn" | "success"; label: string; count: number; onClick: () => void; active: boolean }) {
  const styles = {
    danger: "border-danger-500 bg-danger-50 text-danger-700",
    warn: "border-amber-500 bg-amber-100 text-amber-700",
    success: "border-success-500 bg-success-50 text-success-700"
  }[tone];
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${styles} ${active ? "ring-2 ring-ink-900/10" : ""}`}>
      <span className="text-[16px] font-semibold">{label}</span>
      <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-[14px] font-bold">{count}</span>
    </button>
  );
}

function StatCard({ title, value, caption }: { title: string; value: string | number; caption: string }) {
  return (
    <div className="rounded-2xl border border-paper-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</p>
      <p className="mt-2 text-2xl font-bold text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-400">{caption}</p>
    </div>
  );
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-paper-200 bg-white p-4">
      <p className="font-bold text-ink-800">{title}</p>
      <p className="mt-1 text-sm text-ink-400">{text}</p>
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
  const [filter, setFilter] = useState<"all" | "unassigned" | TaskState>("all");
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

  const shown = useMemo(() => {
    if (filter === "all") return enriched;
    if (filter === "unassigned") return enriched.filter((item) => !clean(item.task.employee_name));
    if (filter === "working") return enriched.filter((item) => item.state === "working" || item.state === "break");
    return enriched.filter((item) => item.state === filter);
  }, [enriched, filter]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: enriched.length, done: 0, working: 0, break: 0, late: 0, upcoming: 0, open: 0 };
    enriched.forEach((item) => { result[item.state] = (result[item.state] || 0) + 1; });
    // Einsätze ohne Mitarbeiter fallen sonst durch: sie stecken in "offen" und
    // niemand sieht, dass gar keiner zugewiesen ist.
    result.unassigned = enriched.filter((item) => !clean(item.task.employee_name)).length;
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
    return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-ink-400">Lade Anmeldung…</div></Shell>;
  }

  if (!token) return <LoginBox onLogin={handleLogin} />;

  return (
    <Shell>
      <div className="space-y-4 pb-24">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Schichtklar Admin</p>
            <h1 className="text-3xl font-bold">Tageszentrale</h1>
            <p className="mt-1 text-xs text-ink-400">{dateText(today)} · {data?.profile?.name || "Admin"}</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-bold text-ink-600">Logout</button>
        </header>

        {/* Die drei Zustaende, die sofort Handlung verlangen. Antippen filtert. */}
        <div className="space-y-2">
          <StatusBox tone="danger" label="Nicht zugewiesen" count={counts.unassigned} onClick={() => setFilter(filter === "unassigned" ? "all" : "unassigned")} active={filter === "unassigned"} />
          <StatusBox tone="warn" label="Überfällig" count={counts.late} onClick={() => setFilter(filter === "late" ? "all" : "late")} active={filter === "late"} />
          <StatusBox tone="success" label="Aktiv" count={counts.working + counts.break} onClick={() => setFilter(filter === "working" ? "all" : "working")} active={filter === "working"} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard title="Heute" value={counts.all} caption="Einsätze" />
          <StatCard title="Planzeit" value={hoursLabel(plannedMinutes)} caption="geplant" />
          <StatCard title="Erledigt" value={counts.done} caption="fertig" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => load()} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-glow">{loading ? "Lade…" : "Neu laden"}</button>
          <Link href="/mitarbeiter/admin" className="rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center text-sm font-bold text-brand-700">Adminbereich</Link>
        </div>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {message && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">{message}</p>}
        {loading && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">Aktualisiere Live-Status…</p>}

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {([
            ["all", "Alle", counts.all],
            ["open", "Offen", counts.open],
            ["upcoming", "Geplant", counts.upcoming],
            ["break", "Pause", counts.break],
            ["done", "Erledigt", counts.done]
          ] as Array<["all" | TaskState, string, number]>).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] ${filter === key ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600"}`}
            >
              {label}
              {count > 0 ? <span className={`rounded-full px-1.5 text-[11px] font-bold ${filter === key ? "bg-white/25" : "bg-paper-200"}`}>{count}</span> : null}
            </button>
          ))}
        </div>

        <section className="grid gap-3 sm:grid-cols-2">
          {shown.length ? shown.map(({ task, entries, state, last }) => (
            <article key={task.id} className={`rounded-3xl border p-4 ${state === "late" ? "border-red-500/40 bg-rose-100" : "border-paper-300 bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-600">{taskTime(task)}</p>
                  <h2 className="mt-1 text-lg font-bold text-ink-900">{task.title || "Einsatz"}</h2>
                  <p className="mt-1 truncate text-sm text-ink-600">{task.site || task.customer_name || "Ohne Objekt"}</p>
                  <p className="mt-1 text-xs text-ink-400">{task.employee_name || "Ohne Mitarbeiter"}</p>
                </div>
                <span className={`min-w-fit rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(state)}`}>{statusLabel(state)}</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-2xl bg-paper-100 px-3 py-2">
                  <p className="text-ink-400">Plan</p>
                  <p className="font-bold text-brand-700">{hoursLabel(minutesFromTimes(task.start_time, task.end_time, task.planned_minutes || task.max_minutes))}</p>
                </div>
                <div className="rounded-2xl bg-paper-100 px-3 py-2">
                  <p className="text-ink-400">Buchungen</p>
                  <p className="font-bold text-brand-700">{entries.length}</p>
                </div>
                <div className="rounded-2xl bg-paper-100 px-3 py-2">
                  <p className="text-ink-400">Letzte</p>
                  <p className="font-bold text-brand-700">{last ? timeText(last.created_at) : "—"}</p>
                </div>
              </div>

              {last ? (
                <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2 text-xs text-ink-600">
                  Letzte Aktion: <span className="font-bold text-brand-700">{clean(last.action) || "Stempel"}</span>
                  {typeof last.distance_m === "number" ? ` · GPS ${last.distance_m} m` : ""}
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={mapUrl(task)} target="_blank" rel="noreferrer" className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-center text-sm font-bold text-brand-700">Route</a>
                <button disabled={savingId === task.id} onClick={() => updateTaskStatus(task, state !== "done")} className="rounded-2xl bg-brand-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
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
