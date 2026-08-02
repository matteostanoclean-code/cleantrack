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

const today = new Date().toISOString().slice(0, 10);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function labelEmployee(row: Row | null | undefined) {
  return clean(row?.name) || "Mitarbeiter ohne Name";
}

function labelCustomer(row: Row | null | undefined) {
  return clean(row?.name || row?.customer_name || row?.company_name || row?.contact_person) || "Kunde ohne Name";
}

function taskPlace(task: Row) {
  return clean(task.site || task.work_site_name || task.customer_name) || "Ohne Objekt";
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekStartIso(value = today) {
  const date = parseIso(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return iso(addDays(date, diff));
}

function minutesFromTask(task: Row) {
  const known = Number(task.planned_minutes || task.max_minutes || task.paid_minutes || task.wage_minutes || 0);
  if (Number.isFinite(known) && known > 0) return known;
  const start = clean(task.start_time);
  const end = clean(task.end_time);
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let a = (sh || 0) * 60 + (sm || 0);
  let b = (eh || 0) * 60 + (em || 0);
  if (b < a) b += 1440;
  return Math.max(0, b - a);
}

function hoursLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

function activeStatus(task: Row) {
  const status = clean(task.status || "open").toLowerCase();
  if (task.done || ["done", "cancelled", "storniert", "paused"].includes(status)) return false;
  return true;
}

function seriesKey(task: Row) {
  return clean(task.recurrence_group_id) || "";
}

function dayLabelsFromTasks(tasks: Row[]) {
  const labels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const days = Array.from(new Set(tasks.map((task) => parseIso(clean(task.task_date || today)).getDay()))).sort((a, b) => a - b);
  return days.map((day) => labels[day]).join(", ");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="phone-bg min-h-screen bg-paper-100 px-3 py-4 text-ink-900 sm:px-5">
      <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-[430px] overflow-hidden rounded-[2rem] border border-brand-500/30 bg-paper-100 shadow-2xl shadow-ink-900/10">
        <div className="min-h-[calc(100vh-2rem)] bg-gradient-to-b from-paper-100 via-paper-100 to-paper-50 px-4 py-5">
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
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-brand-500/40 bg-brand-50 text-3xl">📅</div>
          <h1 className="text-3xl font-black">Planungszentrale</h1>
          <p className="mt-2 text-sm text-ink-400">Serien, offene Termine und Wochenplanung verwalten.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-paper-300 bg-white p-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">E-Mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Passwort</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500" />
          </label>
          {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Melde an…" : "Anmelden"}</button>
        </form>
      </div>
    </Shell>
  );
}

function StatCard({ title, value, caption }: { title: string; value: string | number; caption: string }) {
  return (
    <div className="rounded-3xl border border-paper-300 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</p>
      <p className="mt-2 text-2xl font-black text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-400">{caption}</p>
    </div>
  );
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-paper-300 bg-white p-4">
      <p className="font-black text-ink-800">{title}</p>
      <p className="mt-1 text-sm text-ink-400">{text}</p>
    </div>
  );
}

const inputClass = "w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500";

export default function AdminPlanningPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [weekStart, setWeekStart] = useState(weekStartIso());
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, Row>>({});

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
      if (!response.ok || !result.ok) throw new Error(result.error || "Planungsdaten konnten nicht geladen werden.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Planungsdaten konnten nicht geladen werden.");
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

  async function patch(payload: Row, success: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/admin/planning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Planung konnte nicht gespeichert werden.");
      const count = Number(result.count || 0);
      setMessage(count > 1 ? `${success} (${count} Termine)` : success);
      await load();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Planung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  const tasks = useMemo(() => (data?.tasks || []).filter((task) => clean(task.task_date) >= today).sort((a, b) => `${a.task_date || "9999-12-31"}-${a.start_time || "99:99"}`.localeCompare(`${b.task_date || "9999-12-31"}-${b.start_time || "99:99"}`)), [data]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => iso(addDays(parseIso(weekStart), index))), [weekStart]);
  const weekTasks = useMemo(() => tasks.filter((task) => weekDays.includes(clean(task.task_date))), [tasks, weekDays]);
  const unassignedTasks = useMemo(() => tasks.filter((task) => !clean(task.employee_name) && activeStatus(task)), [tasks]);

  const seriesGroups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const task of tasks) {
      const key = seriesKey(task);
      if (!key) continue;
      map.set(key, [...(map.get(key) || []), task]);
    }
    return Array.from(map.entries()).map(([id, groupTasks]) => {
      const sorted = [...groupTasks].sort((a, b) => `${a.task_date || ""}-${a.start_time || ""}`.localeCompare(`${b.task_date || ""}-${b.start_time || ""}`));
      const first = sorted[0] || {};
      const employees = Array.from(new Set(sorted.map((task) => clean(task.employee_name)).filter(Boolean)));
      const open = sorted.filter(activeStatus).length;
      return {
        id,
        first,
        tasks: sorted,
        count: sorted.length,
        open,
        unassigned: sorted.filter((task) => !clean(task.employee_name)).length,
        from: sorted[0]?.task_date,
        to: sorted[sorted.length - 1]?.task_date,
        employees,
        days: dayLabelsFromTasks(sorted),
        minutes: minutesFromTask(first)
      };
    }).filter((group) => group.count > 1 || clean(group.first.repeat_mode) === "customer_year_plan").sort((a, b) => `${a.from || ""}-${a.first.start_time || ""}`.localeCompare(`${b.from || ""}-${b.first.start_time || ""}`));
  }, [tasks]);

  const q = query.trim().toLowerCase();
  const filteredSeries = seriesGroups.filter((group) => !q || JSON.stringify(group).toLowerCase().includes(q));
  const filteredUnassigned = unassignedTasks.filter((task) => !q || JSON.stringify(task).toLowerCase().includes(q));
  const weekMinutes = weekTasks.reduce((sum, task) => sum + minutesFromTask(task), 0);
  const missingObject = tasks.filter((task) => !clean(task.work_site_id)).length;

  if (authLoading) return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-ink-400">Lade Anmeldung…</div></Shell>;
  if (!token) return <LoginBox onLogin={handleLogin} />;

  return (
    <Shell>
      <div className="space-y-4 pb-24">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Schichtklar Admin</p>
            <h1 className="text-3xl font-black">Planungszentrale</h1>
            <p className="mt-1 text-xs text-ink-400">Offene Termine, Serien und Wochenplan.</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-black text-ink-600">Logout</button>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/mitarbeiter/admin" className="rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center text-sm font-black text-brand-700">Admin</Link>
          <Link href="/mitarbeiter/admin/tageszentrale" className="rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center text-sm font-black text-brand-700">Tageszentrale</Link>
        </div>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {message && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">{message}</p>}
        {loading && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">Aktualisiere Daten…</p>}

        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Offen" value={unassignedTasks.length} caption="ohne Mitarbeiter" />
          <StatCard title="Serien" value={seriesGroups.length} caption="sichtbarer Zeitraum" />
          <StatCard title="Woche" value={hoursLabel(weekMinutes)} caption="Planzeit" />
          <StatCard title="Prüfen" value={missingObject} caption="ohne Objekt-ID" />
        </div>

        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kunde, Objekt, Mitarbeiter suchen…" className={inputClass} />

        <section className="rounded-3xl border border-paper-300 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-black">Wochenplan</p>
              <p className="text-xs text-ink-400">{dateText(weekDays[0])} bis {dateText(weekDays[6])}</p>
            </div>
            <button onClick={() => load()} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-black text-brand-700">Neu laden</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setWeekStart(iso(addDays(parseIso(weekStart), -7)))} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-black text-ink-600">← Woche</button>
            <button onClick={() => setWeekStart(weekStartIso())} className="rounded-2xl bg-brand-600 px-3 py-2 text-xs font-black text-white">Heute</button>
            <button onClick={() => setWeekStart(iso(addDays(parseIso(weekStart), 7)))} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-black text-ink-600">Woche →</button>
          </div>
          <div className="mt-4 space-y-3">
            {weekDays.map((day) => {
              const dayTasks = weekTasks.filter((task) => task.task_date === day);
              return (
                <div key={day} className="rounded-3xl border border-paper-300 bg-paper-100/80 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-black">{dateText(day)}</p>
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-[11px] font-black text-brand-700">{dayTasks.length} Termine</span>
                  </div>
                  <div className="space-y-2">
                    {dayTasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-paper-300 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-black">{task.start_time || "—"} · {task.title || "Einsatz"}</p>
                            <p className="text-xs text-ink-400">{taskPlace(task)}</p>
                            <p className="mt-1 text-xs text-ink-400">{task.employee_name || "Ohne Mitarbeiter"}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${activeStatus(task) ? "bg-brand-100 text-brand-700" : "bg-paper-300 text-ink-600"}`}>{task.status || (task.done ? "done" : "open")}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                          <select value={assignments[task.id] ?? clean(task.employee_name)} onChange={(event) => setAssignments({ ...assignments, [task.id]: event.target.value })} className={inputClass}>
                            <option value="">Ohne Mitarbeiter</option>
                            {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
                          </select>
                          <button disabled={saving} onClick={() => patch({ type: "task_assign", id: task.id, employee_name: assignments[task.id] ?? clean(task.employee_name) }, "Einsatz wurde zugewiesen.")} className="rounded-2xl bg-brand-600 px-3 text-xs font-black text-white disabled:opacity-50">OK</button>
                        </div>
                      </div>
                    ))}
                    {!dayTasks.length && <p className="rounded-2xl border border-paper-300 bg-white p-3 text-sm text-ink-400">Keine Termine an diesem Tag.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-paper-300 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-black">Nicht zugewiesen</p>
              <p className="text-xs text-ink-400">Diese Einsätze müssen noch verteilt werden.</p>
            </div>
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-black text-amber-100">{filteredUnassigned.length}</span>
          </div>
          <div className="space-y-3">
            {filteredUnassigned.slice(0, 25).map((task) => (
              <div key={task.id} className="rounded-2xl border border-paper-300 bg-paper-100 p-3">
                <p className="font-black">{dateText(task.task_date)} · {task.start_time || "—"} - {task.end_time || "—"}</p>
                <p className="text-sm text-ink-600">{task.title || "Einsatz"}</p>
                <p className="text-xs text-ink-400">{taskPlace(task)} · {hoursLabel(minutesFromTask(task))}</p>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <select value={assignments[task.id] || ""} onChange={(event) => setAssignments({ ...assignments, [task.id]: event.target.value })} className={inputClass}>
                    <option value="">Mitarbeiter wählen</option>
                    {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
                  </select>
                  <button disabled={saving || !assignments[task.id]} onClick={() => patch({ type: "task_assign", id: task.id, employee_name: assignments[task.id] }, "Einsatz wurde zugewiesen.")} className="rounded-2xl bg-brand-600 px-3 text-xs font-black text-white disabled:opacity-50">Zuweisen</button>
                </div>
              </div>
            ))}
            {!filteredUnassigned.length && <EmptyCard title="Keine offenen Verteilungen" text="Alle kommenden Einsätze haben bereits einen Mitarbeiter." />}
          </div>
        </section>

        <section className="rounded-3xl border border-paper-300 bg-white p-4">
          <div className="mb-3">
            <p className="font-black">Serienverwaltung</p>
            <p className="text-xs text-ink-400">Hier ändere ich ganze Jahresplanungen oder Serien ab heute.</p>
          </div>
          <div className="space-y-3">
            {filteredSeries.map((series) => {
              const edit = edits[series.id] || {};
              const assigned = assignments[series.id] ?? (series.employees.length === 1 ? series.employees[0] : "");
              return (
                <div key={series.id} className="rounded-3xl border border-brand-500/20 bg-brand-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{series.first.title || "Einsatz-Serie"}</p>
                      <p className="mt-1 text-xs text-brand-700/80">{taskPlace(series.first)}</p>
                      <p className="mt-1 text-xs text-ink-400">{series.days || "Tage offen"} · {series.first.start_time || "—"} - {series.first.end_time || "—"}</p>
                    </div>
                    <span className="rounded-full bg-paper-100 px-3 py-1 text-[11px] font-black text-brand-700">{series.count} Termine</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-2xl bg-paper-100 p-2"><p className="text-ink-400">Von</p><p className="font-black">{dateText(series.from)}</p></div>
                    <div className="rounded-2xl bg-paper-100 p-2"><p className="text-ink-400">Bis</p><p className="font-black">{dateText(series.to)}</p></div>
                    <div className="rounded-2xl bg-paper-100 p-2"><p className="text-ink-400">Offen</p><p className="font-black">{series.open}</p></div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <select value={assigned} onChange={(event) => setAssignments({ ...assignments, [series.id]: event.target.value })} className={inputClass}>
                      <option value="">Ohne Mitarbeiter</option>
                      {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
                    </select>
                    <button disabled={saving} onClick={() => patch({ type: "series_assign", recurrence_group_id: series.id, employee_name: assigned, scope: "future", from_date: today }, "Serie wurde ab heute zugewiesen.")} className="w-full rounded-2xl bg-brand-600 py-3 text-sm font-black text-white disabled:opacity-50">Serie ab heute zuweisen</button>
                  </div>
                  <details className="mt-3 rounded-2xl border border-paper-300 bg-paper-100 p-3">
                    <summary className="cursor-pointer text-sm font-black text-brand-700">Serie bearbeiten</summary>
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-ink-400">Start</span><input type="time" value={edit.start_time ?? clean(series.first.start_time)} onChange={(event) => setEdits({ ...edits, [series.id]: { ...edit, start_time: event.target.value } })} className={inputClass} /></label>
                        <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-ink-400">Ende</span><input type="time" value={edit.end_time ?? clean(series.first.end_time)} onChange={(event) => setEdits({ ...edits, [series.id]: { ...edit, end_time: event.target.value } })} className={inputClass} /></label>
                      </div>
                      <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-ink-400">Planminuten</span><input type="number" value={edit.planned_minutes ?? String(series.minutes || "")} onChange={(event) => setEdits({ ...edits, [series.id]: { ...edit, planned_minutes: event.target.value } })} className={inputClass} /></label>
                      <button disabled={saving} onClick={() => patch({ type: "series_update", recurrence_group_id: series.id, scope: "future", from_date: today, employee_name: assigned, start_time: edit.start_time ?? series.first.start_time, end_time: edit.end_time ?? series.first.end_time, planned_minutes: edit.planned_minutes ?? series.minutes }, "Serie wurde ab heute geändert.")} className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-black text-ink-900 disabled:opacity-50">Änderungen ab heute speichern</button>
                      <div className="grid grid-cols-2 gap-2">
                        <button disabled={saving} onClick={() => patch({ type: "series_status", recurrence_group_id: series.id, scope: "future", from_date: today, status: "paused", done: true }, "Serie wurde ab heute pausiert.")} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs font-black text-amber-100 disabled:opacity-50">Pausieren</button>
                        <button disabled={saving} onClick={() => patch({ type: "series_status", recurrence_group_id: series.id, scope: "future", from_date: today, status: "open", done: false }, "Serie wurde ab heute geöffnet.")} className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-3 text-xs font-black text-brand-700 disabled:opacity-50">Öffnen</button>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
            {!filteredSeries.length && <EmptyCard title="Keine Serien gefunden" text="Sobald Jahresplanungen oder wiederkehrende Einsätze vorhanden sind, erscheinen sie hier." />}
          </div>
        </section>
      </div>
    </Shell>
  );
}
