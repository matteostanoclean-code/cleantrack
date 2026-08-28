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
const currentYear = new Date().getFullYear();

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function parseDate(value?: string | null) {
  const text = clean(value);
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function countWorkDays(start?: string | null, end?: string | null) {
  const startDate = parseDate(start);
  const endDate = parseDate(end || start);
  if (!startDate || !endDate || endDate < startDate) return 0;
  let count = 0;
  for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
    if (cursor.getDay() !== 0) count += 1; // Gebäudereinigung läuft oft auch samstags, Sonntag zählt nicht.
  }
  return count;
}

function labelEmployee(row: Row | null | undefined) {
  return clean(row?.name) || "Mitarbeiter ohne Name";
}

function taskPlace(task: Row) {
  return clean(task.site || task.work_site_name || task.customer_name) || "Ohne Objekt";
}

function isActiveTask(task: Row) {
  const status = clean(task.status || "open").toLowerCase();
  if (task.done) return false;
  return !["done", "erledigt", "cancelled", "canceled", "storniert", "paused", "pause"].includes(status);
}

function overlap(task: Row, absence: Row) {
  const taskDate = clean(task.task_date);
  const start = clean(absence.start_date);
  const end = clean(absence.end_date || absence.start_date);
  if (!taskDate || !start) return false;
  return taskDate >= start && taskDate <= end;
}

function statusTone(value?: unknown) {
  const text = clean(value || "open").toLowerCase();
  if (["approved", "genehmigt", "done"].includes(text)) return "border-brand-500/30 bg-brand-50 text-brand-700";
  if (["rejected", "abgelehnt", "cancelled"].includes(text)) return "border-rose-500/30 bg-rose-100 text-rose-700";
  return "border-amber-500/30 bg-amber-500/10 text-amber-100";
}

function typeLabel(value?: unknown) {
  const text = clean(value || "urlaub").toLowerCase();
  if (text.includes("krank")) return "Krank";
  if (text.includes("sonder")) return "Sonderurlaub";
  if (text.includes("frei")) return "Frei";
  return "Urlaub";
}

/** "2:30" oder "2,5" oder "150" -> Minuten. Leer -> 0. */
function minutenAusEingabe(text: string) {
  const wert = clean(text).replace(",", ".");
  if (!wert) return 0;
  if (wert.includes(":")) {
    const [h, m] = wert.split(":");
    return Math.max(0, (Number(h) || 0) * 60 + (Number(m) || 0));
  }
  const zahl = Number(wert);
  if (!Number.isFinite(zahl) || zahl < 0) return 0;
  // Unter 24 als Stunden lesen, darüber als Minuten. Niemand trägt 30 Stunden
  // für einen einzelnen Tag ein, aber 30 Minuten kommt vor.
  return zahl < 24 ? Math.round(zahl * 60) : Math.round(zahl);
}

function stundenText(minuten: number) {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

function tageZwischen(von?: string | null, bis?: string | null) {
  const start = parseDate(von);
  const ende = parseDate(bis || von);
  const tage: string[] = [];
  if (!start || !ende || ende < start) return tage;
  for (let cursor = new Date(start); cursor <= ende; cursor = addDays(cursor, 1)) {
    tage.push(iso(cursor));
    if (tage.length > 120) break;
  }
  return tage;
}

const QUELLE_TEXT: Record<string, string> = {
  einsatz: "aus dem Einsatz an dem Tag",
  muster: "aus dem gleichen Wochentag der letzten Wochen",
  keine: "nichts gefunden, bitte eintragen",
  manuell: "von Hand eingetragen"
};

/**
 * Stunden je Urlaubstag von Hand setzen.
 *
 * Die automatische Rechnung findet nicht immer etwas — bei jemandem, der neu
 * ist, oder an einem Wochentag, an dem er sonst nie arbeitet. Dann steht hier
 * eine Null, und das Büro trägt ein, was der Tag wert ist.
 */
function GutschriftBlatt({ absence, saving, onClose, onSave }: {
  absence: Row;
  saving: boolean;
  onClose: () => void;
  onSave: (detail: Array<{ tag: string; minuten: number; quelle: string }>) => Promise<void>;
}) {
  const vorhanden: Row[] = Array.isArray(absence.credit_detail) ? absence.credit_detail : [];
  const tage = tageZwischen(absence.start_date, absence.end_date || absence.start_date);

  const [werte, setWerte] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const tag of tage) {
      const treffer = vorhanden.find((eintrag) => clean(eintrag.tag) === tag);
      const minuten = Number(treffer?.minuten || 0);
      start[tag] = minuten > 0 ? stundenText(minuten) : "";
    }
    return start;
  });

  const summe = tage.reduce((gesamt, tag) => gesamt + minutenAusEingabe(werte[tag] || ""), 0);

  function speichern() {
    const detail = tage.map((tag) => {
      const minuten = minutenAusEingabe(werte[tag] || "");
      const alt = vorhanden.find((eintrag) => clean(eintrag.tag) === tag);
      const unveraendert = Number(alt?.minuten || 0) === minuten;
      return { tag, minuten, quelle: unveraendert ? clean(alt?.quelle) || "manuell" : "manuell" };
    });
    return onSave(detail);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
          <div>
            <p className="text-[17px] font-bold">Stunden je Tag</p>
            <p className="text-xs text-ink-400">{absence.employee_name} · {shortDate(absence.start_date)} bis {shortDate(absence.end_date || absence.start_date)}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-paper-300 px-3 py-2 text-sm font-bold text-ink-600">Schließen</button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          <p className="pb-1 text-[13px] text-ink-400">
            Angabe als Stunden, zum Beispiel <strong>2</strong> oder <strong>1:30</strong>. Leer lassen heißt: an dem Tag hätte er nicht gearbeitet.
          </p>
          {tage.map((tag) => {
            const treffer = vorhanden.find((eintrag) => clean(eintrag.tag) === tag);
            const quelle = clean(treffer?.quelle) || "keine";
            return (
              <div key={tag} className="flex items-center gap-3 rounded-xl border border-paper-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{shortDate(tag)}</p>
                  <p className="truncate text-[12px] text-ink-400">{QUELLE_TEXT[quelle] || quelle}</p>
                </div>
                <input
                  value={werte[tag] || ""}
                  onChange={(event) => setWerte({ ...werte, [tag]: event.target.value })}
                  placeholder="0:00"
                  inputMode="decimal"
                  className="w-24 shrink-0 rounded-xl border border-paper-300 px-3 py-2.5 text-right text-[15px] outline-none focus:border-brand-500"
                />
              </div>
            );
          })}
        </div>

        <div className="border-t border-paper-200 px-5 py-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[14px] text-ink-600">Zusammen</span>
            <span className="text-[17px] font-bold">{stundenText(summe)} h</span>
          </div>
          <button disabled={saving} onClick={speichern} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white disabled:opacity-60">
            {saving ? "Speichere…" : "Stunden gutschreiben"}
          </button>
        </div>
      </div>
    </div>
  );
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
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-brand-500/40 bg-brand-50 text-3xl">🌴</div>
          <h1 className="text-3xl font-bold">Urlaubsplanung</h1>
          <p className="mt-2 text-sm text-ink-400">Abwesenheiten prüfen und Einsätze absichern.</p>
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

function StatCard({ title, value, caption }: { title: string; value: string | number; caption: string }) {
  return (
    <div className="rounded-2xl border border-paper-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</p>
      <p className="mt-2 text-2xl font-bold text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-400">{caption}</p>
    </div>
  );
}

const inputClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3.5 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

export default function AdminVacationPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gutschrift, setGutschrift] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ employee_name: "", request_type: "urlaub", start_date: today, end_date: today, reason: "" });

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
      if (!response.ok || !result.ok) throw new Error(result.error || "Urlaubsdaten konnten nicht geladen werden.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Urlaubsdaten konnten nicht geladen werden.");
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

  async function postAbsence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/admin/vacation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Abwesenheit konnte nicht gespeichert werden.");
      setMessage("Abwesenheit wurde eingetragen.");
      await load();
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Abwesenheit konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function speichereGutschrift(detail: Array<{ tag: string; minuten: number; quelle: string }>) {
    if (!gutschrift) return;
    await patchAbsence({ id: gutschrift.id, action: "credit", detail }, "Stunden wurden gutgeschrieben.");
    setGutschrift(null);
  }

  async function patchAbsence(payload: Row, success: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/admin/vacation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Urlaub konnte nicht gespeichert werden.");
      const released = Number(result.conflictsReleased || 0);
      setMessage(released ? `${success} ${released} Einsätze wurden wieder freigegeben.` : success);
      await load();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Urlaub konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  const employees = data?.employees || [];
  const absences = data?.absences || [];
  const tasks = data?.tasks || [];

  const pendingAbsences = useMemo(() => absences.filter((absence) => {
    const status = clean(absence.status || "open").toLowerCase();
    return !["approved", "genehmigt", "rejected", "abgelehnt"].includes(status);
  }), [absences]);

  const approvedThisYear = useMemo(() => absences.filter((absence) => {
    const status = clean(absence.status).toLowerCase();
    const year = Number(clean(absence.start_date).slice(0, 4));
    return ["approved", "genehmigt"].includes(status) && year === currentYear;
  }), [absences]);

  const employeeStats = useMemo(() => employees.map((employee) => {
    const name = labelEmployee(employee);
    const quota = Number(employee.annual_vacation_days ?? employee.vacation_days ?? 0) || 0;
    const used = approvedThisYear
      .filter((absence) => clean(absence.employee_name) === name && !clean(absence.request_type || absence.absence_type).toLowerCase().includes("krank"))
      .reduce((sum, absence) => sum + countWorkDays(absence.start_date, absence.end_date), 0);
    const open = pendingAbsences.filter((absence) => clean(absence.employee_name) === name).length;
    const upcoming = absences
      .filter((absence) => clean(absence.employee_name) === name && clean(absence.start_date) >= today)
      .sort((a, b) => clean(a.start_date).localeCompare(clean(b.start_date)))[0];
    return { employee, name, quota, used, remaining: Math.max(0, quota - used), open, upcoming };
  }), [employees, approvedThisYear, pendingAbsences, absences]);

  const conflictMap = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const absence of absences) {
      const id = clean(absence.id);
      if (!id) continue;
      map[id] = tasks
        .filter((task) => clean(task.employee_name) === clean(absence.employee_name) && overlap(task, absence) && isActiveTask(task))
        .sort((a, b) => `${a.task_date || ""}-${a.start_time || ""}`.localeCompare(`${b.task_date || ""}-${b.start_time || ""}`));
    }
    return map;
  }, [absences, tasks]);

  const q = query.trim().toLowerCase();
  const visibleAbsences = absences.filter((absence) => !q || JSON.stringify(absence).toLowerCase().includes(q));
  const conflictCount = Object.values(conflictMap).reduce((sum, list) => sum + list.length, 0);
  const onVacationToday = approvedThisYear.filter((absence) => clean(absence.start_date) <= today && clean(absence.end_date || absence.start_date) >= today).length;

  if (authLoading) return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-ink-400">Lade Anmeldung…</div></Shell>;
  if (!token) return <LoginBox onLogin={handleLogin} />;

  return (
    <Shell>
      <div className="space-y-4 pb-24">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Schichtklar Admin</p>
            <h1 className="text-3xl font-bold">Urlaubsplanung</h1>
            <p className="mt-1 text-xs text-ink-400">Urlaub, Kranktage und Einsatz-Konflikte.</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-bold text-ink-600">Logout</button>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/mitarbeiter/admin" className="rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center text-sm font-bold text-brand-700">Admin</Link>
          <Link href="/mitarbeiter/admin/planung" className="rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center text-sm font-bold text-brand-700">Planung</Link>
        </div>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {message && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">{message}</p>}
        {loading && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">Aktualisiere Daten…</p>}

        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Offen" value={pendingAbsences.length} caption="Anträge" />
          <StatCard title="Heute" value={onVacationToday} caption="abwesend" />
          <StatCard title="Konflikte" value={conflictCount} caption="Einsätze betroffen" />
          <StatCard title="Mitarbeiter" value={employees.length} caption="Stammdaten" />
        </div>

        <form onSubmit={postAbsence} className="space-y-3 rounded-3xl border border-brand-500/20 bg-brand-50 p-4">
          <div>
            <p className="font-bold">Abwesenheit eintragen</p>
            <p className="text-xs text-ink-400">Für Urlaub, Krankmeldung oder freie Tage.</p>
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Mitarbeiter</span>
            <select value={form.employee_name} onChange={(event) => setForm({ ...form, employee_name: event.target.value })} required className={`${inputClass} mt-2`}>
              <option value="">Bitte wählen</option>
              {employees.map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Von</span>
              <input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value, end_date: form.end_date < event.target.value ? event.target.value : form.end_date })} className={`${inputClass} mt-2`} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Bis</span>
              <input type="date" value={form.end_date} min={form.start_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} className={`${inputClass} mt-2`} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Art</span>
            <select value={form.request_type} onChange={(event) => setForm({ ...form, request_type: event.target.value })} className={`${inputClass} mt-2`}>
              <option value="urlaub">Urlaub</option>
              <option value="krank">Krank</option>
              <option value="frei">Frei</option>
              <option value="sonderurlaub">Sonderurlaub</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Notiz</span>
            <textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} rows={3} className={`${inputClass} mt-2 resize-none`} placeholder="z. B. Telefonisch gemeldet" />
          </label>
          <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white shadow-glow disabled:opacity-50">Abwesenheit speichern</button>
        </form>

        <section className="rounded-2xl border border-paper-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">Urlaubskonto {currentYear}</p>
              <p className="text-xs text-ink-400">Anspruch, genommen, Rest.</p>
            </div>
            <button onClick={() => load()} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-bold text-brand-700">Neu laden</button>
          </div>
          <div className="space-y-2">
            {employeeStats.map((stat) => (
              <div key={stat.employee.id || stat.name} className="rounded-2xl border border-paper-300 bg-paper-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{stat.name}</p>
                    <p className="mt-1 text-xs text-ink-400">Anspruch {stat.quota || 0} Tage · genommen {stat.used} · Rest {stat.remaining}</p>
                  </div>
                  {stat.open ? <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-100">{stat.open} offen</span> : null}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-200">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, stat.quota ? (stat.used / stat.quota) * 100 : 0)}%` }} />
                </div>
                {stat.upcoming ? <p className="mt-2 text-xs text-brand-700">Nächste Abwesenheit: {shortDate(stat.upcoming.start_date)} - {shortDate(stat.upcoming.end_date || stat.upcoming.start_date)}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mitarbeiter, Status oder Grund suchen…" className={inputClass} />

        <section className="rounded-2xl border border-paper-200 bg-white p-4">
          <div className="mb-3">
            <p className="font-bold">Abwesenheiten & Konflikte</p>
            <p className="text-xs text-ink-400">Beim Genehmigen kann ich betroffene Einsätze direkt wieder freigeben.</p>
          </div>
          <div className="space-y-3">
            {visibleAbsences.map((absence) => {
              const conflicts = conflictMap[clean(absence.id)] || [];
              const status = clean(absence.status || "open");
              const isClosed = ["approved", "genehmigt", "rejected", "abgelehnt"].includes(status.toLowerCase());
              return (
                <div key={absence.id} className="rounded-2xl border border-paper-200 bg-paper-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{absence.employee_name || "Ohne Mitarbeiter"}</p>
                      <p className="mt-1 text-sm text-ink-600">{shortDate(absence.start_date)} - {shortDate(absence.end_date || absence.start_date)} · {typeLabel(absence.request_type || absence.absence_type)}</p>
                      <p className="mt-1 text-xs text-ink-400">{countWorkDays(absence.start_date, absence.end_date)} Arbeitstage</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase ${statusTone(status)}`}>{status || "open"}</span>
                  </div>
                  {absence.reason ? <p className="mt-3 rounded-2xl border border-paper-300 bg-white p-3 text-sm text-ink-600">{absence.reason}</p> : null}
                  {conflicts.length ? (
                    <details className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <summary className="cursor-pointer text-sm font-bold text-amber-100">{conflicts.length} Einsatz-Konflikte ansehen</summary>
                      <div className="mt-3 space-y-2">
                        {conflicts.slice(0, 12).map((task) => (
                          <div key={task.id} className="rounded-2xl bg-paper-100 p-3 text-sm">
                            <p className="font-bold">{shortDate(task.task_date)} · {task.start_time || "—"} - {task.end_time || "—"}</p>
                            <p className="text-ink-400">{task.title || "Einsatz"} · {taskPlace(task)}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <p className="mt-3 rounded-2xl border border-emerald-500/20 bg-brand-50 p-3 text-sm text-brand-700">Keine Einsatz-Konflikte gefunden.</p>
                  )}
                  {/*
                    Was der Urlaub an Stunden wert ist. Immer sichtbar, auch
                    wenn noch nichts entschieden ist oder längst genehmigt
                    wurde — es fällt oft erst später auf, dass eine Zahl nicht
                    passt, und dann muss man drankommen.

                    Gezählt wird die Gutschrift im Stundenzettel erst, wenn die
                    Abwesenheit genehmigt ist. Ein Eintrag bei einem offenen
                    Antrag schreibt also noch niemandem etwas gut.
                  */}
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-paper-300 bg-white px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Gutgeschrieben</p>
                      <p className="text-[15px] font-semibold">
                        {Number(absence.credited_minutes) > 0
                          ? `${stundenText(Number(absence.credited_minutes))} h · ${absence.credited_days || 0} ${Number(absence.credited_days) === 1 ? "Tag" : "Tage"}`
                          : "Noch keine Stunden"}
                      </p>
                      {!["approved", "genehmigt"].includes(status.toLowerCase()) && Number(absence.credited_minutes) > 0 ? (
                        <p className="text-[12px] text-amber-700">Zählt erst nach der Genehmigung</p>
                      ) : null}
                    </div>
                    <button onClick={() => setGutschrift(absence)} className="shrink-0 rounded-xl border border-brand-500/40 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">
                      {Number(absence.credited_minutes) > 0 ? "Ändern" : "Eintragen"}
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {!isClosed ? (
                      <>
                        <button disabled={saving} onClick={() => patchAbsence({ id: absence.id, action: "approve_and_unassign", admin_response: "Genehmigt. Betroffene Einsätze wurden neu zur Planung freigegeben." }, "Urlaub wurde genehmigt.")} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-ink-900 disabled:opacity-50">Genehmigen + Einsätze freigeben</button>
                        <div className="grid grid-cols-2 gap-2">
                          <button disabled={saving} onClick={() => patchAbsence({ id: absence.id, action: "approve", admin_response: "Genehmigt." }, "Urlaub wurde genehmigt.")} className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-3 text-xs font-bold text-brand-700 disabled:opacity-50">Nur genehmigen</button>
                          <button disabled={saving} onClick={() => patchAbsence({ id: absence.id, action: "reject", admin_response: "Abgelehnt." }, "Urlaub wurde abgelehnt.")} className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-3 text-xs font-bold text-rose-700 disabled:opacity-50">Ablehnen</button>
                        </div>
                      </>
                    ) : conflicts.length ? (
                      <button disabled={saving} onClick={() => patchAbsence({ id: absence.id, action: "unassign_conflicts" }, "Einsatz-Konflikte wurden freigegeben.")} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-100 disabled:opacity-50">Konflikte jetzt freigeben</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!visibleAbsences.length && <p className="rounded-2xl border border-paper-300 bg-paper-100 p-4 text-sm text-ink-400">Keine Abwesenheiten gefunden.</p>}
          </div>
        </section>
      </div>

      {gutschrift ? (
        <GutschriftBlatt
          absence={gutschrift}
          saving={saving}
          onClose={() => setGutschrift(null)}
          onSave={speichereGutschrift}
        />
      ) : null}
    </Shell>
  );
}
