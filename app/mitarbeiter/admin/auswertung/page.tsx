"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Row = Record<string, any>;

type ReportData = {
  ok: boolean;
  error?: string;
  month: string;
  start: string;
  end: string;
  employees: Row[];
  timeEntries: Row[];
  tasks: Row[];
  absences: Row[];
  summary: {
    totalMinutes: number;
    openSessions: number;
    distanceWarnings: number;
    plannedMinutes: number;
    taskCount: number;
    doneTasks: number;
    openTasks: number;
    absenceCount: number;
    byEmployee: Array<Row & { employeeName: string; minutes: number; days: number; openSessions: number; pauses: number; distanceWarnings: number }>;
    bySite: Array<Row & { siteName: string; minutes: number; entries: number; distanceWarnings: number }>;
  };
};

const inputClass = "w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function hours(minutes: number) {
  return `${(minutes / 60).toFixed(2).replace(".", ",")} h`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    clock_in: "Eingestempelt",
    break_start: "Pause gestartet",
    break_end: "Pause beendet",
    clock_out: "Ausgestempelt"
  };
  return labels[String(action || "")] || String(action || "Zeit erfasst");
}

function csvValue(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvValue).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
          <h1 className="text-3xl font-black">Monatsauswertung</h1>
          <p className="mt-2 text-sm text-ink-400">Bitte als Admin anmelden.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-paper-300 bg-white p-4">
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="E-Mail" className={inputClass} />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required placeholder="Passwort" className={inputClass} />
          {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Melde an…" : "Anmelden"}</button>
        </form>
      </div>
    </Shell>
  );
}

function Stat({ title, value, caption, tone = "text-ink-900" }: { title: string; value: string | number; caption: string; tone?: string }) {
  return (
    <div className="rounded-3xl border border-paper-300 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</p>
      <p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-400">{caption}</p>
    </div>
  );
}

export default function AdminAuswertungPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [employee, setEmployee] = useState("");

  const load = useCallback(async (overrideToken?: string, overrideMonth?: string, overrideEmployee?: string) => {
    const currentToken = overrideToken || token;
    if (!currentToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month: overrideMonth || month });
      const employeeFilter = overrideEmployee ?? employee;
      if (employeeFilter) params.set("employee", employeeFilter);
      const response = await fetch(`/api/mobile/admin/reports?${params.toString()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Auswertung konnte nicht geladen werden.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Auswertung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [employee, month, token]);

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

  const latestEntries = useMemo(() => (data?.timeEntries || []).slice().reverse().slice(0, 12), [data?.timeEntries]);

  function exportEmployeeCsv() {
    if (!data) return;
    downloadCsv(`cleantrack-mitarbeiter-${data.month}.csv`, [
      ["Mitarbeiter", "Stunden", "Tage", "Offene Buchungen", "Pausen", "GPS-Warnungen"],
      ...data.summary.byEmployee.map((item) => [item.employeeName, (item.minutes / 60).toFixed(2), String(item.days), String(item.openSessions), String(item.pauses), String(item.distanceWarnings)])
    ]);
  }

  function exportEntriesCsv() {
    if (!data) return;
    downloadCsv(`cleantrack-stempelzeiten-${data.month}.csv`, [
      ["Datum/Zeit", "Mitarbeiter", "Objekt", "Aktion", "Entfernung m", "Radius m", "Erfolgreich", "Fehler"],
      ...data.timeEntries.map((entry) => [
        formatDateTime(entry.created_at),
        String(entry.employee_name || ""),
        String(entry.work_site_name || ""),
        actionLabel(entry.action),
        String(entry.distance_m ?? ""),
        String(entry.allowed_radius_m ?? ""),
        entry.success === false ? "Nein" : "Ja",
        String(entry.error_message || "")
      ])
    ]);
  }

  if (authLoading) {
    return <Shell><div className="grid min-h-[70vh] place-items-center text-center text-ink-400">Lade Login…</div></Shell>;
  }

  if (!token) return <LoginBox onLogin={handleLogin} />;

  return (
    <Shell>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-brand-600">Admin</p>
            <h1 className="text-3xl font-black">Monatsauswertung</h1>
            <p className="mt-1 text-sm text-ink-400">Stunden, Einsätze und GPS-Kontrolle.</p>
          </div>
          <Link href="/mitarbeiter" className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-black text-brand-700">App</Link>
        </div>

        <section className="rounded-3xl border border-paper-300 bg-white p-4">
          <div className="grid gap-3">
            <label>
              <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Monat</span>
              <input value={month} onChange={(event) => setMonth(event.target.value)} type="month" className={`${inputClass} mt-2`} />
            </label>
            <label>
              <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Mitarbeiter</span>
              <select value={employee} onChange={(event) => setEmployee(event.target.value)} className={`${inputClass} mt-2`}>
                <option value="">Alle Mitarbeiter</option>
                {(data?.employees || []).map((item) => <option key={item.id} value={String(item.name || "")}>{String(item.name || "Ohne Name")}</option>)}
              </select>
            </label>
            <button onClick={() => load()} disabled={loading} className="rounded-2xl bg-brand-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{loading ? "Lade…" : "Auswertung laden"}</button>
          </div>
        </section>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p>}

        {data ? (
          <>
            <section className="grid grid-cols-2 gap-3">
              <Stat title="Ist-Stunden" value={hours(data.summary.totalMinutes)} caption="aus Stempelzeiten" tone="text-brand-700" />
              <Stat title="Plan-Stunden" value={hours(data.summary.plannedMinutes)} caption="aus Einsätzen" />
              <Stat title="Einsätze" value={data.summary.taskCount} caption={`${data.summary.doneTasks} erledigt · ${data.summary.openTasks} offen`} tone="text-brand-700" />
              <Stat title="Kontrolle" value={data.summary.distanceWarnings} caption={`${data.summary.openSessions} offene Buchungen`} tone={data.summary.distanceWarnings || data.summary.openSessions ? "text-rose-700" : "text-ink-800"} />
            </section>

            <section className="rounded-3xl border border-paper-300 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black">Mitarbeiter-Stunden</h2>
                  <p className="text-xs text-ink-400">Für Lohnabrechnung und Kontrolle</p>
                </div>
                <button onClick={exportEmployeeCsv} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-black text-white">CSV</button>
              </div>
              <div className="space-y-2">
                {data.summary.byEmployee.length ? data.summary.byEmployee.map((item) => (
                  <article key={item.employeeName} className="rounded-2xl border border-paper-300 bg-paper-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-ink-900">{item.employeeName}</p>
                        <p className="text-xs text-ink-400">{item.days} Tage · {item.pauses} Pausen</p>
                      </div>
                      <p className="text-lg font-black text-brand-700">{hours(item.minutes)}</p>
                    </div>
                    {item.openSessions || item.distanceWarnings ? <p className="mt-2 text-xs text-rose-700">Prüfen: {item.openSessions} offene Buchung(en), {item.distanceWarnings} GPS-Warnung(en)</p> : null}
                  </article>
                )) : <p className="text-sm text-ink-400">Keine Stempelzeiten im gewählten Monat.</p>}
              </div>
            </section>

            <section className="rounded-3xl border border-paper-300 bg-white p-4">
              <h2 className="mb-3 font-black">Objekt-Stunden</h2>
              <div className="space-y-2">
                {data.summary.bySite.slice(0, 15).map((item) => (
                  <div key={item.siteName} className="flex items-center justify-between gap-3 rounded-2xl bg-paper-100 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-800">{item.siteName}</p>
                      <p className="text-xs text-ink-400">{item.entries} Buchungen</p>
                    </div>
                    <p className="font-black text-brand-700">{hours(item.minutes)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-paper-300 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black">Stempelprotokoll</h2>
                  <p className="text-xs text-ink-400">Letzte Buchungen im Monat</p>
                </div>
                <button onClick={exportEntriesCsv} className="rounded-xl border border-paper-300 px-3 py-2 text-xs font-black text-brand-700">Export</button>
              </div>
              <div className="space-y-2">
                {latestEntries.length ? latestEntries.map((entry) => (
                  <article key={entry.id} className="rounded-2xl border border-paper-300 bg-paper-100 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-ink-900">{actionLabel(entry.action)}</p>
                        <p className="truncate text-xs text-ink-400">{entry.employee_name || "Ohne Mitarbeiter"} · {entry.work_site_name || "Ohne Objekt"}</p>
                      </div>
                      <p className="text-xs font-bold text-brand-700">{formatDateTime(entry.created_at)}</p>
                    </div>
                    {typeof entry.distance_m === "number" ? <p className="mt-2 text-xs text-ink-400">GPS: {entry.distance_m} m · Radius {entry.allowed_radius_m || "—"} m</p> : null}
                  </article>
                )) : <p className="text-sm text-ink-400">Keine Buchungen gefunden.</p>}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
