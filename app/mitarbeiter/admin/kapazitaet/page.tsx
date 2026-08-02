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

const now = new Date();
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const inputClass = "w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function employeeName(row: Row | null | undefined) {
  return clean(row?.name) || "Mitarbeiter ohne Name";
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value || 0);
}

function hours(minutes: number) {
  const value = Math.round((minutes / 60) * 10) / 10;
  return `${value.toLocaleString("de-DE")} h`;
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function monthRange(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(year, monthIndex, 1, 12, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 12, 0, 0);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  return { start, end, startIso, endIso, label: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(start) };
}

function inMonth(dateValue: unknown, range: ReturnType<typeof monthRange>) {
  const date = clean(dateValue).slice(0, 10);
  return Boolean(date && date >= range.startIso && date <= range.endIso);
}

function isActiveTask(task: Row) {
  const status = clean(task.status || "open").toLowerCase();
  if (task.done) return false;
  return !["done", "erledigt", "cancelled", "canceled", "storniert", "paused", "pause"].includes(status);
}

function taskMinutes(task: Row) {
  const direct = numberValue(task.planned_minutes ?? task.max_minutes ?? task.paid_minutes ?? task.wage_minutes, 0);
  if (direct > 0) return direct;
  const [sh, sm] = clean(task.start_time).split(":").map(Number);
  const [eh, em] = clean(task.end_time).split(":").map(Number);
  if (Number.isFinite(sh) && Number.isFinite(eh)) {
    let a = (sh || 0) * 60 + (sm || 0);
    let b = (eh || 0) * 60 + (em || 0);
    if (b < a) b += 1440;
    return Math.max(0, b - a);
  }
  return 0;
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function taskPlace(task: Row) {
  return clean(task.site || task.work_site_name || task.customer_name) || "Ohne Objekt";
}

function parseDate(value: unknown) {
  const text = clean(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function absenceWorkDays(absence: Row, range: ReturnType<typeof monthRange>) {
  const status = clean(absence.status || "").toLowerCase();
  if (!["approved", "genehmigt"].includes(status)) return 0;
  const start = parseDate(absence.start_date);
  const end = parseDate(absence.end_date || absence.start_date);
  if (!start || !end) return 0;
  const from = start < range.start ? range.start : start;
  const to = end > range.end ? range.end : end;
  if (to < from) return 0;
  let count = 0;
  for (let cursor = new Date(from); cursor <= to; cursor = addDays(cursor, 1)) {
    if (cursor.getDay() !== 0) count += 1;
  }
  return count;
}

function minutesFromTimeEntries(entries: Row[]) {
  const sorted = entries
    .filter((entry) => entry.success !== false)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let activeStart: Date | null = null;
  let breakStart: Date | null = null;
  let total = 0;
  let open = false;

  for (const entry of sorted) {
    const action = clean(entry.action).toLowerCase();
    const created = new Date(entry.created_at);
    if (Number.isNaN(created.getTime())) continue;

    if (["clock_in", "start", "check_in"].includes(action)) {
      activeStart = created;
      breakStart = null;
      open = true;
      continue;
    }

    if (["break_start", "pause_start"].includes(action) && activeStart) {
      breakStart = created;
      continue;
    }

    if (["break_end", "pause_end"].includes(action) && breakStart) {
      const pause = Math.max(0, created.getTime() - breakStart.getTime()) / 60000;
      total -= pause;
      breakStart = null;
      continue;
    }

    if (["clock_out", "end", "check_out", "auto_clock_out"].includes(action) && activeStart) {
      total += Math.max(0, created.getTime() - activeStart.getTime()) / 60000;
      activeStart = null;
      breakStart = null;
      open = false;
    }
  }

  return { minutes: Math.max(0, Math.round(total)), open };
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
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-brand-500/40 bg-brand-50 text-3xl">📊</div>
          <h1 className="text-3xl font-black">Kapazitätsplanung</h1>
          <p className="mt-2 text-sm text-ink-400">Mitarbeiterstunden, Lohnkosten und Überlastung prüfen.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-paper-300 bg-white p-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">E-Mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Passwort</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className={inputClass} />
          </label>
          {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Melde an…" : "Anmelden"}</button>
        </form>
      </div>
    </Shell>
  );
}

function StatCard({ title, value, caption, tone = "blue" }: { title: string; value: string | number; caption: string; tone?: "blue" | "green" | "red" | "amber" }) {
  const toneClass = tone === "red" ? "text-rose-700" : tone === "green" ? "text-brand-700" : tone === "amber" ? "text-amber-100" : "text-ink-900";
  return (
    <div className="rounded-3xl border border-paper-300 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</p>
      <p className={`mt-2 text-2xl font-black ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-400">{caption}</p>
    </div>
  );
}

export default function AdminCapacityPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(defaultMonth);
  const [query, setQuery] = useState("");

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
      if (!response.ok || !result.ok) throw new Error(result.error || "Kapazitätsdaten konnten nicht geladen werden.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kapazitätsdaten konnten nicht geladen werden.");
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

  const range = useMemo(() => monthRange(month), [month]);

  const monthTasks = useMemo(() => (data?.tasks || []).filter((task) => inMonth(task.task_date, range)), [data?.tasks, range]);
  const activeMonthTasks = useMemo(() => monthTasks.filter(isActiveTask), [monthTasks]);
  const monthEntries = useMemo(() => (data?.timeEntries || []).filter((entry) => inMonth(entry.created_at, range)), [data?.timeEntries, range]);

  const rows = useMemo(() => {
    return (data?.employees || [])
      .filter((employee) => !query || employeeName(employee).toLowerCase().includes(query.toLowerCase()))
      .map((employee) => {
        const name = employeeName(employee);
        const assigned = activeMonthTasks.filter((task) => clean(task.employee_name) === name);
        const planMinutes = assigned.reduce((sum, task) => sum + taskMinutes(task), 0);
        const entries = monthEntries.filter((entry) => clean(entry.employee_name) === name);
        const timeResult = minutesFromTimeEntries(entries);
        const monthlyLimitHours = numberValue(employee.monthly_hour_limit ?? employee.monthly_hours, 0);
        const limitMinutes = Math.round(monthlyLimitHours * 60);
        const hourlyRate = numberValue(employee.hourly_rate, 0);
        const factor = numberValue(employee.employer_cost_factor, 1) || 1;
        const vacationDays = (data?.absences || [])
          .filter((absence) => clean(absence.employee_name) === name)
          .reduce((sum, absence) => sum + absenceWorkDays(absence, range), 0);
        const utilization = limitMinutes > 0 ? (planMinutes / limitMinutes) * 100 : 0;
        return {
          employee,
          name,
          assigned,
          planMinutes,
          actualMinutes: timeResult.minutes,
          openClock: timeResult.open,
          limitMinutes,
          hourlyRate,
          factor,
          vacationDays,
          utilization,
          planCost: (planMinutes / 60) * hourlyRate * factor,
          actualCost: (timeResult.minutes / 60) * hourlyRate * factor,
          remainingMinutes: limitMinutes ? limitMinutes - planMinutes : 0
        };
      })
      .sort((a, b) => b.utilization - a.utilization);
  }, [activeMonthTasks, data?.absences, data?.employees, monthEntries, query, range]);

  const unassigned = useMemo(() => activeMonthTasks.filter((task) => !clean(task.employee_name)).slice(0, 25), [activeMonthTasks]);
  const totals = useMemo(() => {
    const planMinutes = rows.reduce((sum, row) => sum + row.planMinutes, 0);
    const actualMinutes = rows.reduce((sum, row) => sum + row.actualMinutes, 0);
    const limitMinutes = rows.reduce((sum, row) => sum + row.limitMinutes, 0);
    const planCost = rows.reduce((sum, row) => sum + row.planCost, 0);
    const overloads = rows.filter((row) => row.limitMinutes > 0 && row.planMinutes > row.limitMinutes).length;
    return { planMinutes, actualMinutes, limitMinutes, planCost, overloads, utilization: limitMinutes ? (planMinutes / limitMinutes) * 100 : 0 };
  }, [rows]);

  function exportCsv() {
    const header = ["Mitarbeiter", "Sollstunden", "Planstunden", "Iststunden", "Reststunden", "Auslastung", "Stundensatz", "AG-Faktor", "Plan-Lohnkosten", "Urlaubstage", "Offene Stempeluhr"];
    const lines = rows.map((row) => [
      row.name,
      (row.limitMinutes / 60).toFixed(2),
      (row.planMinutes / 60).toFixed(2),
      (row.actualMinutes / 60).toFixed(2),
      (row.remainingMinutes / 60).toFixed(2),
      Math.round(row.utilization),
      row.hourlyRate.toFixed(2),
      row.factor.toFixed(2),
      row.planCost.toFixed(2),
      String(row.vacationDays),
      row.openClock ? "ja" : "nein"
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cleantrack-kapazitaet-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) return <Shell><p className="p-4 text-sm text-ink-400">Prüfe Login…</p></Shell>;
  if (!token) return <LoginBox onLogin={handleLogin} />;

  return (
    <Shell>
      <div className="space-y-4 pb-24">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Schichtklar Admin</p>
            <h1 className="text-3xl font-black">Kapazität</h1>
            <p className="mt-1 text-xs text-ink-400">Monatsplanung · {range.label}</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-black text-ink-600">Logout</button>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Monat</span>
            <input value={month} onChange={(event) => setMonth(event.target.value)} type="month" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Suche</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name" className={inputClass} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Planstunden" value={hours(totals.planMinutes)} caption="geplante Einsätze" />
          <StatCard title="Iststunden" value={hours(totals.actualMinutes)} caption="Stempelzeiten" />
          <StatCard title="Auslastung" value={percent(totals.utilization)} caption="Plan / Soll" tone={totals.utilization > 100 ? "red" : totals.utilization > 85 ? "amber" : "green"} />
          <StatCard title="Lohnkosten" value={money(totals.planCost)} caption="Plan inkl. Faktor" />
        </div>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {loading && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">Aktualisiere Daten…</p>}

        <section className="rounded-3xl border border-paper-300 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-black">Warnungen</p>
              <p className="text-xs text-ink-400">Überlastung, offene Stempeluhren und unbesetzte Einsätze.</p>
            </div>
            <button onClick={exportCsv} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-black text-white shadow-glow">CSV</button>
          </div>
          <div className="mt-3 grid gap-2">
            {totals.overloads ? <p className="rounded-2xl border border-rose-500/30 bg-rose-100 p-3 text-sm text-rose-700">{totals.overloads} Mitarbeiter sind über dem Monatslimit geplant.</p> : <p className="rounded-2xl border border-brand-500/30 bg-brand-50 p-3 text-sm text-brand-700">Keine Überlastung im sichtbaren Monat.</p>}
            {unassigned.length ? <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{unassigned.length} offene Einsätze ohne Mitarbeiter gefunden.</p> : null}
            {rows.some((row) => row.openClock) ? <p className="rounded-2xl border border-brand-500/30 bg-brand-50 p-3 text-sm text-brand-700">Mindestens eine Stempeluhr ist noch offen.</p> : null}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-black">Mitarbeiter-Kapazität</p>
            <button onClick={() => load()} className="text-xs font-black text-brand-700">Neu laden</button>
          </div>
          {rows.map((row) => {
            const overload = row.limitMinutes > 0 && row.planMinutes > row.limitMinutes;
            const progress = Math.min(140, row.utilization || 0);
            return (
              <div key={row.employee.id || row.name} className={`rounded-3xl border p-4 ${overload ? "border-rose-500/30 bg-rose-100" : "border-paper-300 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-ink-900">{row.name}</p>
                    <p className="mt-1 text-xs text-ink-400">{row.assigned.length} Einsätze · {row.vacationDays} Urlaub/Frei-Tage</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${overload ? "bg-rose-500/20 text-rose-700" : "bg-brand-100 text-brand-700"}`}>{percent(row.utilization)}</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-200">
                  <div className={`h-full rounded-full ${overload ? "bg-rose-500" : "bg-brand-500"}`} style={{ width: `${Math.min(100, progress)}%` }} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-2xl bg-paper-100 p-3"><p className="text-xs text-ink-400">Soll</p><p className="font-black">{row.limitMinutes ? hours(row.limitMinutes) : "nicht gesetzt"}</p></div>
                  <div className="rounded-2xl bg-paper-100 p-3"><p className="text-xs text-ink-400">Plan</p><p className="font-black">{hours(row.planMinutes)}</p></div>
                  <div className="rounded-2xl bg-paper-100 p-3"><p className="text-xs text-ink-400">Ist</p><p className="font-black">{hours(row.actualMinutes)}</p></div>
                  <div className="rounded-2xl bg-paper-100 p-3"><p className="text-xs text-ink-400">Lohnkosten</p><p className="font-black">{money(row.planCost)}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wide">
                  <span className="rounded-full bg-paper-200 px-3 py-1 text-ink-600">{row.hourlyRate ? `${row.hourlyRate.toLocaleString("de-DE")} €/h` : "kein Stundensatz"}</span>
                  <span className="rounded-full bg-paper-200 px-3 py-1 text-ink-600">Faktor {row.factor.toLocaleString("de-DE")}</span>
                  {row.openClock ? <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-100">Stempeluhr offen</span> : null}
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-3xl border border-paper-300 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-black">Offene Einsätze ohne Mitarbeiter</p>
              <p className="text-xs text-ink-400">Diese Einsätze sollten in der Planungszentrale verteilt werden.</p>
            </div>
            <Link href="/mitarbeiter/admin/planung" className="text-xs font-black text-brand-700">Planen</Link>
          </div>
          <div className="space-y-2">
            {unassigned.length ? unassigned.map((task) => (
              <div key={task.id} className="rounded-2xl border border-paper-300 bg-paper-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{clean(task.title) || "Einsatz"}</p>
                    <p className="mt-1 text-xs text-ink-400">{dateText(task.task_date)} · {clean(task.start_time) || "—"} - {clean(task.end_time) || "—"}</p>
                    <p className="mt-1 text-xs text-ink-400">{taskPlace(task)}</p>
                  </div>
                  <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-black text-brand-700">{hours(taskMinutes(task))}</span>
                </div>
              </div>
            )) : <p className="rounded-2xl border border-brand-500/30 bg-brand-50 p-3 text-sm text-brand-700">Alle sichtbaren Einsätze sind zugewiesen.</p>}
          </div>
        </section>

        <section className="grid gap-2">
          <Link href="/mitarbeiter/admin" className="rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center font-black text-brand-700">Zurück zum Admin-Dashboard</Link>
          <Link href="/mitarbeiter" className="rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center font-black text-ink-600">Zur Mitarbeiter-App</Link>
        </section>
      </div>
    </Shell>
  );
}
