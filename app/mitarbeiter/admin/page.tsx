"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Row = Record<string, any>;
type Tab = "overview" | "tasks" | "employees" | "customers" | "sites" | "times";

/** Offene Punkte, geliefert von /api/admin/aufgaben. */
type Aufgaben = {
  gesamt: number;
  zeiten: number;
  zeitenProblem: number;
  urlaub: number;
  material: number;
  qualitaet: number;
  ohneMitarbeiter: number;
  chat: number;
  meldungen: number;
};

/** Einrichtungsstand je Person, geliefert von /api/admin/einrichtung. */
type Einrichtung = {
  gesamt: number;
  personen: Array<{
    id: string;
    name: string;
    email: string;
    einsatz: boolean;
    login: boolean;
    angemeldet: boolean;
    gestempelt: boolean;
    push: boolean;
    fortschritt: number;
  }>;
  kennzahlen: { einsatz: number; login: number; angemeldet: number; gestempelt: number; push: number; fertig: number };
};

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

const emptyEmployee = { id: "", name: "", email: "", phone: "", role: "employee", active: false, hourly_rate: "0", monthly_hour_limit: "0", vacation_days: "0", annual_vacation_days: "0", birthday: "" };
const emptyCustomer = { id: "", name: "", address: "", phone: "", email: "", customer_number: "", notes: "", active: true, work_days: [] as string[], plan_start_date: today, plan_start_time: "08:00", plan_end_time: "10:00", planning_limit_hours_per_day: "2", default_task_title: "Unterhaltsreinigung", work_site_id: "", generate_year_plan: false };
const emptySite = { id: "", name: "", customer_id: "", address: "", latitude: "", longitude: "", gps_required: false, allowed_radius_m: "150", monthly_hour_quota: "0", notes: "", active: true };
const emptyTask: Row = { id: "", title: "Unterhaltsreinigung", task_date: today, start_time: "08:00", end_time: "10:00", planned_minutes: "120", employee_name: "", customer_id: "", work_site_id: "", site: "", priority: "Normal", status: "open", notes: "", notify_employee: true, repeat_mode: "none", recurrence_interval: "1", recurrence_end_date: "", recurrence_days: [] as string[] };

const weekdayOptions = [
  { value: "1", label: "Mo" },
  { value: "2", label: "Di" },
  { value: "3", label: "Mi" },
  { value: "4", label: "Do" },
  { value: "5", label: "Fr" },
  { value: "6", label: "Sa" },
  { value: "0", label: "So" }
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function labelCustomer(row: Row | null | undefined) {
  return clean(row?.name || row?.customer_name || row?.company_name || row?.contact_person) || "Kunde ohne Name";
}

function labelSite(row: Row | null | undefined) {
  return clean(row?.name || row?.site || row?.object_name) || "Objekt ohne Name";
}

function labelEmployee(row: Row | null | undefined) {
  return clean(row?.name) || "Mitarbeiter ohne Name";
}

function rowAddress(row: Row | null | undefined) {
  return clean(row?.address || row?.customer_address || [row?.street, row?.postal_code, row?.city].filter(Boolean).join(" "));
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
}

function dateTimeText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dateText(value);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateOnly(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function birthdayInfo(row?: Row | null) {
  const raw = row?.birthday;
  if (!raw) return null;
  const parts = String(raw).slice(0, 10).split("-").map(Number);
  if (parts.length < 3 || !parts[1] || !parts[2]) return null;
  const todayDate = new Date();
  const todayStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  let next = new Date(todayDate.getFullYear(), parts[1] - 1, parts[2]);
  if (next < todayStart) next = new Date(todayDate.getFullYear() + 1, parts[1] - 1, parts[2]);
  const daysUntil = Math.round((next.getTime() - todayStart.getTime()) / 86400000);
  return {
    date: formatDateOnly(raw),
    daysUntil,
    isToday: daysUntil === 0,
    label: daysUntil === 0 ? "Heute" : daysUntil === 1 ? "Morgen" : `in ${daysUntil} Tagen`
  };
}

function moneyPerHour(value?: unknown) {
  const number = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(number)) return "—";
  return `${number.toFixed(2).replace(".", ",")} €/h`;
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
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

function StatusPill({ value }: { value?: unknown }) {
  const text = clean(value) || "open";
  const tone = ["done", "approved", "active", "true"].includes(text.toLowerCase()) ? "border-brand-500/30 bg-brand-50 text-brand-700" : text.toLowerCase().includes("reject") || text.toLowerCase() === "false" ? "border-rose-500/30 bg-rose-100 text-rose-700" : "border-brand-500/30 bg-brand-50 text-brand-700";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${tone}`}>{text}</span>;
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
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-brand-500/40 bg-brand-50 text-3xl">🧽</div>
          <h1 className="text-3xl font-bold">Admin-Dashboard</h1>
          <p className="mt-2 text-sm text-ink-400">Kunden, Objekte, Einsätze und Mitarbeiter verwalten.</p>
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

/** Anteilskachel: große Prozentzahl, daneben die rohen Zahlen, darunter ein Balken. */
function QuoteCard({ titel, wert, gesamt, hervorgehoben }: { titel: string; wert: number; gesamt: number; hervorgehoben?: boolean }) {
  const prozent = gesamt > 0 ? Math.round((wert / gesamt) * 1000) / 10 : 0;
  const voll = gesamt > 0 && wert === gesamt;
  return (
    <div className={`rounded-2xl border p-4 ${hervorgehoben ? "border-transparent bg-[#141d33]" : "border-paper-200 bg-white"}`}>
      <p className={`text-[13px] ${hervorgehoben ? "text-white/70" : "text-ink-400"}`}>{titel}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={`text-[28px] font-bold leading-none ${hervorgehoben ? "text-white" : "text-ink-900"}`}>{prozent}%</p>
        <p className={`text-[13px] ${hervorgehoben ? "text-white/70" : "text-ink-400"}`}>{wert} / {gesamt}</p>
      </div>
      <span className={`mt-3 block h-1.5 overflow-hidden rounded-full ${hervorgehoben ? "bg-white/20" : "bg-paper-200"}`}>
        <span className={`block h-1.5 rounded-full ${voll ? "bg-success-500" : "bg-danger-500"}`} style={{ width: `${Math.max(2, prozent)}%` }} />
      </span>
    </div>
  );
}

/** Tabellenzelle mit Haken oder Kreuz. */
function Haken({ an }: { an: boolean }) {
  return (
    <td className="px-3 py-3 text-center">
      <span className={`text-[16px] font-bold ${an ? "text-success-600" : "text-ink-200"}`}>{an ? "✓" : "✕"}</span>
    </td>
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

/** Eine Zeile im Adminmenü: Titel, optionaler Hinweis, optionale Zahl, Pfeil. */
function NavRow({ label, hint, count, href, onClick }: { label: string; hint?: string; count?: number; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-ink-900">{label}</span>
        {hint ? <span className="mt-0.5 block truncate text-[13px] text-ink-400">{hint}</span> : null}
      </span>
      {typeof count === "number" && count > 0 ? (
        <span className="shrink-0 rounded-md bg-paper-200 px-2 py-0.5 text-[13px] font-semibold text-ink-600">{count}</span>
      ) : null}
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-200" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
    </>
  );
  const className = "flex w-full items-center gap-3 border-b border-paper-200 py-3.5 text-left";
  if (href) return <Link href={href} className={className}>{inner}</Link>;
  return <button onClick={onClick} className={className}>{inner}</button>;
}

function TabButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full rounded-2xl border px-3 py-3 text-center text-xs ${active ? "border-brand-500 bg-brand-600 text-white" : "border-paper-300 bg-white text-ink-600"}`}>
      <span className="block truncate font-bold">{label}</span>
      {typeof count === "number" ? <span className="text-[10px] opacity-80">{count} Einträge</span> : null}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-ink-400">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3.5 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-paper-200 bg-white p-4">
      <p className="font-bold text-ink-800">{title}</p>
      <p className="mt-1 text-sm text-ink-400">{text}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [aufgaben, setAufgaben] = useState<Aufgaben | null>(null);
  const [einrichtung, setEinrichtung] = useState<Einrichtung | null>(null);
  // Erlaubt Direktlinks wie /mitarbeiter/admin?tab=employees aus anderen Seiten.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    const wanted = new URLSearchParams(window.location.search).get("tab");
    const allowed: Tab[] = ["overview", "tasks", "employees", "customers", "sites", "times"];
    return allowed.includes(wanted as Tab) ? (wanted as Tab) : "overview";
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState({ ...emptyEmployee });
  const [customerForm, setCustomerForm] = useState({ ...emptyCustomer });
  const [siteForm, setSiteForm] = useState({ ...emptySite });
  const [taskForm, setTaskForm] = useState({ ...emptyTask });
  const [seriesAssign, setSeriesAssign] = useState<Record<string, string>>({});

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
      if (!response.ok || !result.ok) throw new Error(result.error || "Admin-Daten konnten nicht geladen werden.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Admin-Daten konnten nicht geladen werden.");
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

  /**
   * Offene Punkte für "Zu erledigen". Kommt von derselben Stelle wie die
   * Zahlen in der Seitenleiste, damit beides zusammenpasst.
   */
  useEffect(() => {
    if (!token) return;
    let aktiv = true;

    async function holen() {
      try {
        const antwort = await fetch("/api/admin/aufgaben", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` }
        });
        const ergebnis = await antwort.json();
        if (aktiv && ergebnis?.ok) setAufgaben(ergebnis);

        const stand = await fetch("/api/admin/einrichtung", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` }
        });
        const standErgebnis = await stand.json();
        if (aktiv && standErgebnis?.ok) setEinrichtung(standErgebnis);
      } catch {
        /* Die Übersicht darf ohne diese Zahlen weiterlaufen. */
      }
    }

    holen();
    const uhr = setInterval(holen, 60000);
    return () => {
      aktiv = false;
      clearInterval(uhr);
    };
  }, [token]);

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

  async function save(type: "employee" | "customer" | "site" | "task", form: Row, reset: () => void) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const method = form.id ? "PATCH" : "POST";
      const response = await fetch("/api/mobile/admin/dashboard", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, type })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || `Speichern fehlgeschlagen (HTTP ${response.status}).`);
      const savedCount = Number(result.count || 0);
      setMessage(form.id ? "Änderung gespeichert." : savedCount > 1 ? `${savedCount} Einsätze gespeichert.` : "Neuer Datensatz gespeichert.");
      setQuery("");
      if (type === "task") setTab("tasks");
      reset();
      await load(token);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(payload: Row, success: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/admin/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Aktion fehlgeschlagen.");
      setMessage(success);
      await load();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Aktion fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }


  function toggleTaskWeekday(value: string) {
    const current = Array.isArray(taskForm.recurrence_days) ? taskForm.recurrence_days.map(String) : [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setTaskForm({ ...taskForm, recurrence_days: next });
  }

  function toggleCustomerWeekday(value: string) {
    const current = Array.isArray(customerForm.work_days) ? customerForm.work_days.map(String) : [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setCustomerForm({ ...customerForm, work_days: next });
  }

  function scrollToTop() {
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  async function useCurrentLocationForSite() {
    setError(null);
    setMessage("Standort wird gelesen…");
    try {
      if (typeof navigator === "undefined" || !navigator.geolocation) throw new Error("GPS wird auf diesem Gerät nicht unterstützt.");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
      });
      setSiteForm((current) => ({
        ...current,
        latitude: position.coords.latitude.toFixed(7),
        longitude: position.coords.longitude.toFixed(7),
        gps_required: true
      }));
      setMessage("GPS-Koordinaten wurden ins Objektformular übernommen.");
    } catch (locationError) {
      setMessage(null);
      setError(locationError instanceof Error ? locationError.message : "Standort konnte nicht gelesen werden.");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = (row: Row) => !q || JSON.stringify(row).toLowerCase().includes(q);
    return {
      employees: (data?.employees || []).filter(test),
      customers: (data?.customers || []).filter(test),
      workSites: (data?.workSites || []).filter(test),
      tasks: (data?.tasks || []).filter(test),
      timeEntries: (data?.timeEntries || []).filter(test)
    };
  }, [data, query]);

  const stats = useMemo(() => {
    const tasks = data?.tasks || [];
    const todayTasks = tasks.filter((task) => task.task_date === today).length;
    const openTasks = tasks.filter((task) => !task.done && clean(task.status || "open").toLowerCase() !== "done").length;
    const monthMinutes = (data?.tasks || []).reduce((sum, task) => sum + minutesFromTimes(task.start_time, task.end_time, task.planned_minutes || task.max_minutes), 0);
    const openRequests = (data?.absences || []).filter((item) => !["approved", "rejected", "done", "resolved"].includes(clean(item.status || "open").toLowerCase())).length
      + (data?.materialReports || []).filter((item) => !["approved", "rejected", "done", "resolved"].includes(clean(item.status || "open").toLowerCase())).length
      + (data?.notifications || []).filter((item) => !["approved", "rejected", "done", "resolved"].includes(clean(item.status || "open").toLowerCase())).length;
    const unassignedTasks = tasks.filter((task) => String(task.task_date || "") >= today && !clean(task.employee_name)).length;
    return { todayTasks, openTasks, monthMinutes, openRequests, unassignedTasks };
  }, [data]);

  const upcomingBirthdays = useMemo(() => (data?.employees || [])
    .map((employee) => ({ employee, info: birthdayInfo(employee) }))
    .filter((item) => item.info && item.info.daysUntil <= 30)
    .sort((a, b) => (a.info?.daysUntil || 0) - (b.info?.daysUntil || 0))
    .slice(0, 6), [data?.employees]);


  const upcomingTasks = useMemo(() => (data?.tasks || [])
    .filter((task) => String(task.task_date || "") >= today)
    .sort((a, b) => `${a.task_date || "9999-12-31"}-${a.start_time || "99:99"}`.localeCompare(`${b.task_date || "9999-12-31"}-${b.start_time || "99:99"}`))
    .slice(0, 5), [data?.tasks]);

  const selectedCustomer = (data?.customers || []).find((customer) => customer.id === siteForm.customer_id || customer.id === taskForm.customer_id);
  const sitesForTask = (data?.workSites || []).filter((site) => !taskForm.customer_id || site.customer_id === taskForm.customer_id || clean(site.customer_name).toLowerCase() === labelCustomer(selectedCustomer).toLowerCase());
  const selectedTaskSite = (data?.workSites || []).find((site) => site.id === taskForm.work_site_id);
  const customerSitesForPlan = (data?.workSites || []).filter((site) => !customerForm.id || site.customer_id === customerForm.id || clean(site.customer_name).toLowerCase() === clean(customerForm.name).toLowerCase());

  useEffect(() => {
    if (selectedTaskSite && !taskForm.site) {
      setTaskForm((current) => ({ ...current, site: labelSite(selectedTaskSite) }));
    }
  }, [selectedTaskSite, taskForm.site]);

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
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="mt-1 text-xs text-ink-400">Angemeldet als {data?.profile?.name || "Admin"}</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-bold text-ink-600">Logout</button>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <TabButton active={tab === "overview"} label="Übersicht" onClick={() => setTab("overview")} />
          <TabButton active={tab === "tasks"} label="Einsätze" count={data?.tasks?.length || 0} onClick={() => setTab("tasks")} />
          <TabButton active={tab === "employees"} label="Mitarbeiter" count={data?.employees?.length || 0} onClick={() => setTab("employees")} />
          <TabButton active={tab === "customers"} label="Kunden" count={data?.customers?.length || 0} onClick={() => setTab("customers")} />
          <TabButton active={tab === "sites"} label="Objekte" count={data?.workSites?.length || 0} onClick={() => setTab("sites")} />
          <TabButton active={tab === "times"} label="Zeiten" count={data?.timeEntries?.length || 0} onClick={() => setTab("times")} />
        </div>

        {loading && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">Aktualisiere Daten…</p>}

        {/* Rueckmeldung fest am unteren Rand. Vorher stand sie oben auf der Seite,
            waehrend die Speichern-Knoepfe weit unten sitzen - am Handy war sie
            damit unsichtbar und Speichern sah aus, als passiere nichts. */}
        {(error || message) && (
          <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
            <div className={`mx-auto flex max-w-[520px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8 items-start gap-3 rounded-xl px-4 py-3.5 text-[15px] text-white shadow-lg ${error ? "bg-danger-500" : "bg-success-500"}`}>
              <span className="min-w-0 flex-1">{error || message}</span>
              <button onClick={() => { setError(null); setMessage(null); }} className="shrink-0 text-[14px] font-semibold opacity-90">Schließen</button>
            </div>
          </div>
        )}

        {tab !== "overview" && (
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suchen…" className={inputClass} />
        )}

        {tab === "overview" && (
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-3 pb-2">
              <StatCard title="Heute" value={stats.todayTasks} caption="Einsätze" />
              <StatCard title="Offen" value={stats.openTasks} caption="nicht erledigt" />
              <StatCard title="Planzeit" value={hoursLabel(stats.monthMinutes)} caption="Zeitraum" />
            </div>

            {/*
              Wie weit das Team wirklich in der App angekommen ist. Ein
              vergebener Login, den nie jemand benutzt, sieht in einer Liste
              aus wie Fortschritt und ist keiner — deshalb vier Schritte je
              Person statt einer Ja-Nein-Spalte.
            */}
            {einrichtung && einrichtung.gesamt > 0 ? (
              <section className="pt-3">
                <h2 className="pb-2 text-[17px] font-bold text-ink-900">Einrichtung im Team</h2>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <QuoteCard titel="Mit Einsätzen" wert={einrichtung.kennzahlen.einsatz} gesamt={einrichtung.gesamt} />
                  <QuoteCard titel="Login vergeben" wert={einrichtung.kennzahlen.login} gesamt={einrichtung.gesamt} />
                  <QuoteCard titel="Schon angemeldet" wert={einrichtung.kennzahlen.angemeldet} gesamt={einrichtung.gesamt} />
                  <QuoteCard titel="Schon gestempelt" wert={einrichtung.kennzahlen.gestempelt} gesamt={einrichtung.gesamt} />
                  <QuoteCard titel="Push aktiv" wert={einrichtung.kennzahlen.push} gesamt={einrichtung.gesamt} />
                  <QuoteCard titel="Vollständig" wert={einrichtung.kennzahlen.fertig} gesamt={einrichtung.gesamt} hervorgehoben />
                </div>

                <div className="mt-3 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
                  <table className="w-full min-w-[620px] text-left">
                    <thead>
                      <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Fortschritt</th>
                        <th className="px-3 py-3 text-center">Einsatz</th>
                        <th className="px-3 py-3 text-center">Login</th>
                        <th className="px-3 py-3 text-center">Angemeldet</th>
                        <th className="px-3 py-3 text-center">Gestempelt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {einrichtung.personen.map((person) => (
                        <tr key={person.id} className="border-b border-paper-200 last:border-0">
                          <td className="px-4 py-3">
                            <p className="text-[15px] font-semibold text-ink-900">{person.name}</p>
                            {person.email ? <p className="text-[12px] text-ink-400">{person.email}</p> : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-1.5 w-[110px] shrink-0 overflow-hidden rounded-full bg-paper-200">
                                <span
                                  className={`block h-1.5 rounded-full ${person.fortschritt === 100 ? "bg-success-500" : "bg-amber-500"}`}
                                  style={{ width: `${person.fortschritt}%` }}
                                />
                              </span>
                              <span className="text-[13px] font-semibold text-ink-600">{person.fortschritt}%</span>
                            </div>
                          </td>
                          <Haken an={person.einsatz} />
                          <Haken an={person.login} />
                          <Haken an={person.angemeldet} />
                          <Haken an={person.gestempelt} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {einrichtung.kennzahlen.login < einrichtung.gesamt ? (
                  <NavRow
                    href="/mitarbeiter/admin/aktivieren"
                    label="Login vergeben"
                    hint={`${einrichtung.gesamt - einrichtung.kennzahlen.login} Leute haben noch keinen Zugang`}
                    count={einrichtung.gesamt - einrichtung.kennzahlen.login}
                  />
                ) : null}
              </section>
            ) : null}

            {/*
              Eine Zeile je Sache, mit eigener Zahl. Vorher stand hier eine
              Sammelzahl "Freigaben und Meldungen 17" — daraus ging nicht
              hervor, ob das drei Urlaubsanträge oder vierzehn Materialzettel
              sind und wo man anfangen soll.
            */}
            <section className="pt-3">
              <h2 className="pb-1 text-[17px] font-bold text-ink-900">Zu erledigen</h2>
              {aufgaben === null ? (
                <p className="py-3 text-[14px] text-ink-400">Zähle offene Punkte…</p>
              ) : aufgaben.gesamt === 0 ? (
                <div className="rounded-2xl border border-paper-200 bg-white px-4 py-5 text-center">
                  <p className="text-[16px] font-semibold text-ink-900">Nichts offen</p>
                  <p className="mt-1 text-[14px] text-ink-400">Keine Zeiten, Anträge oder Meldungen, die auf dich warten.</p>
                </div>
              ) : (
                <>
                  {aufgaben.zeiten > 0 ? (
                    <NavRow
                      href="/mitarbeiter/admin/zeiten"
                      label="Zeiten prüfen"
                      hint={aufgaben.zeitenProblem > 0 ? `davon ${aufgaben.zeitenProblem} mit Standortfehler oder ohne Ausstempeln` : "Abweichungen zur geplanten Zeit"}
                      count={aufgaben.zeiten}
                    />
                  ) : null}
                  {aufgaben.chat > 0 ? (
                    <NavRow href="/mitarbeiter/admin/chat" label="Nachrichten vom Team" hint="Ungelesen im Chat" count={aufgaben.chat} />
                  ) : null}
                  {aufgaben.urlaub > 0 ? (
                    <NavRow href="/mitarbeiter/admin/urlaub" label="Urlaub und Abwesenheit" hint="Anträge ohne Entscheidung" count={aufgaben.urlaub} />
                  ) : null}
                  {aufgaben.material > 0 ? (
                    <NavRow href="/mitarbeiter/admin/freigaben?bereich=material" label="Materialbestellungen" hint="Noch nicht bestellt oder geliefert" count={aufgaben.material} />
                  ) : null}
                  {aufgaben.qualitaet > 0 ? (
                    <NavRow href="/mitarbeiter/admin/freigaben?bereich=qualitaet" label="Qualitätsnachweise" hint="Noch nicht angesehen" count={aufgaben.qualitaet} />
                  ) : null}
                  {aufgaben.ohneMitarbeiter > 0 ? (
                    <NavRow href="/mitarbeiter/admin/planung" label="Einsätze ohne Mitarbeiter" hint="Zuweisen in der Planungszentrale" count={aufgaben.ohneMitarbeiter} />
                  ) : null}
                </>
              )}
            </section>

            {/* Am Rechner steht das alles in der Seitenleiste, deshalb nur am Handy zeigen. */}
            <section className="pt-3 md:hidden">
              <h2 className="pb-1 text-[17px] font-bold text-ink-900">Planen</h2>
              <NavRow href="/mitarbeiter/admin/tageszentrale" label="Tageszentrale" hint="Was heute läuft" />
              <NavRow href="/mitarbeiter/admin/planung" label="Planungszentrale" hint="Wochenplan und Serien" />
              <NavRow href="/mitarbeiter/admin/urlaub" label="Urlaub und Abwesenheit" />
              <NavRow href="/mitarbeiter/admin/kapazitaet" label="Kapazität" hint="Soll gegen Ist je Mitarbeiter" />
              <NavRow onClick={() => setTab("tasks")} label="Einsatz erstellen" />
            </section>

            <section className="pt-3 md:hidden">
              <h2 className="pb-1 text-[17px] font-bold text-ink-900">Stammdaten</h2>
              <NavRow onClick={() => setTab("customers")} label="Kunden" count={data?.customers?.length || 0} />
              <NavRow onClick={() => setTab("sites")} label="Objekte" count={data?.workSites?.length || 0} />
              <NavRow onClick={() => setTab("employees")} label="Mitarbeiter" count={data?.employees?.length || 0} />
              <NavRow href="/mitarbeiter/admin/aktivieren" label="Mitarbeiter-Login vergeben" hint="Zugang für neue Leute" />
              <NavRow href="/mitarbeiter/admin/geraete" label="Geräte und Inventar" hint="Maschinen je Objekt, Wartung, QR-Code" />
            </section>

            <section className="pt-3 md:hidden">
              <h2 className="pb-1 text-[17px] font-bold text-ink-900">Auswerten</h2>
              <NavRow href="/mitarbeiter/admin/auswertung" label="Monatsauswertung" />
              <NavRow href="/mitarbeiter/admin/push" label="Push-Zentrale" hint="Nachricht ans Team" />
              <NavRow href="/mitarbeiter" label="Zur Mitarbeiter-App" />
            </section>

            {upcomingBirthdays.length ? (
              <section className="pt-3">
                <h2 className="pb-1 text-[17px] font-bold text-ink-900">Geburtstage</h2>
                {upcomingBirthdays.map(({ employee, info }) => (
                  <div key={employee.id} className="flex items-center justify-between gap-3 border-b border-paper-200 py-3">
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold text-ink-900">{labelEmployee(employee)}</p>
                      <p className="text-[13px] text-ink-400">{info?.date || "—"}</p>
                    </div>
                    <span className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold ${info?.isToday ? "bg-brand-600 text-white" : "bg-paper-200 text-ink-600"}`}>{info?.label}</span>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="rounded-2xl border border-paper-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">Kommende Einsätze</p>
                <button onClick={() => load(token)} className="text-xs font-bold text-brand-700">Neu laden</button>
              </div>
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-paper-300 bg-paper-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">{task.title || "Einsatz"}</p>
                        <p className="text-xs text-ink-400">{dateText(task.task_date)} · {task.start_time || "—"} - {task.end_time || "—"}</p>
                        <p className="mt-1 text-xs text-ink-400">{task.employee_name || "Ohne Mitarbeiter"} · {task.site || task.customer_name || "Ohne Objekt"}</p>
                      </div>
                      <StatusPill value={task.done ? "done" : task.status} />
                    </div>
                  </div>
                ))}
                {!upcomingTasks.length && <EmptyCard title="Keine kommenden Einsätze" text="Hier werden nur heutige und zukünftige Termine angezeigt." />}
              </div>
            </section>
          </div>
        )}

        {tab === "tasks" && (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); save("task", taskForm, () => setTaskForm({ ...emptyTask })); }} className="space-y-3 rounded-2xl border border-paper-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold">{taskForm.id ? "Einsatz bearbeiten" : "Einsatz erstellen"}</p>
                {taskForm.id && <button type="button" onClick={() => setTaskForm({ ...emptyTask })} className="text-xs font-bold text-ink-400">Abbrechen</button>}
              </div>
              <Field label="Titel"><input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} required className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Datum"><input type="date" value={taskForm.task_date} onChange={(event) => setTaskForm({ ...taskForm, task_date: event.target.value })} className={inputClass} /></Field>
                <Field label="Minuten"><input type="number" value={taskForm.planned_minutes} onChange={(event) => setTaskForm({ ...taskForm, planned_minutes: event.target.value })} className={inputClass} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start"><input type="time" value={taskForm.start_time} onChange={(event) => setTaskForm({ ...taskForm, start_time: event.target.value })} className={inputClass} /></Field>
                <Field label="Ende"><input type="time" value={taskForm.end_time} onChange={(event) => setTaskForm({ ...taskForm, end_time: event.target.value })} className={inputClass} /></Field>
              </div>
              <div className="rounded-2xl border border-paper-200 bg-white/70 p-3">
                <Field label="Wiederholung">
                  <select value={taskForm.repeat_mode || "none"} onChange={(event) => setTaskForm({ ...taskForm, repeat_mode: event.target.value, recurrence_days: event.target.value === "weekly" ? taskForm.recurrence_days : [] })} className={inputClass}>
                    <option value="none">Einmaliger Einsatz</option>
                    <option value="daily">Täglich</option>
                    <option value="weekly">Wöchentlich</option>
                    <option value="monthly">Monatlich</option>
                  </select>
                </Field>
                {taskForm.repeat_mode && taskForm.repeat_mode !== "none" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Alle X"><input type="number" min="1" max="52" value={taskForm.recurrence_interval || "1"} onChange={(event) => setTaskForm({ ...taskForm, recurrence_interval: event.target.value })} className={inputClass} /></Field>
                      <Field label="Bis Datum"><input type="date" required value={taskForm.recurrence_end_date || ""} onChange={(event) => setTaskForm({ ...taskForm, recurrence_end_date: event.target.value })} className={inputClass} /></Field>
                    </div>
                    {taskForm.repeat_mode === "weekly" && (
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Wochentage</p>
                        <div className="grid grid-cols-7 gap-1">
                          {weekdayOptions.map((day) => {
                            const active = Array.isArray(taskForm.recurrence_days) && taskForm.recurrence_days.map(String).includes(day.value);
                            return <button key={day.value} type="button" onClick={() => toggleTaskWeekday(day.value)} className={`rounded-xl border px-2 py-2 text-xs font-bold ${active ? "border-brand-500 bg-brand-600 text-white" : "border-paper-300 bg-white text-ink-600"}`}>{day.label}</button>;
                          })}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-ink-400">Die App erstellt beim Speichern automatisch mehrere Einsätze bis zum Enddatum.</p>
                  </div>
                )}
              </div>
              <Field label="Mitarbeiter">
                <select value={taskForm.employee_name} onChange={(event) => setTaskForm({ ...taskForm, employee_name: event.target.value })} className={inputClass}>
                  <option value="">Ohne Mitarbeiter / später zuweisen</option>
                  {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
                </select>
              </Field>
              <Field label="Kunde">
                <select value={taskForm.customer_id} onChange={(event) => setTaskForm({ ...taskForm, customer_id: event.target.value, work_site_id: "", site: "" })} className={inputClass}>
                  <option value="">Ohne Kunde</option>
                  {(data?.customers || []).map((customer) => <option key={customer.id} value={customer.id}>{labelCustomer(customer)}</option>)}
                </select>
              </Field>
              <Field label="Objekt">
                <select value={taskForm.work_site_id} onChange={(event) => {
                  const site = (data?.workSites || []).find((item) => item.id === event.target.value);
                  setTaskForm({ ...taskForm, work_site_id: event.target.value, site: site ? labelSite(site) : "" });
                }} className={inputClass}>
                  <option value="">Objekt manuell / leer</option>
                  {sitesForTask.map((site) => <option key={site.id} value={site.id}>{labelSite(site)}</option>)}
                </select>
              </Field>
              <Field label="Notiz"><textarea value={taskForm.notes} onChange={(event) => setTaskForm({ ...taskForm, notes: event.target.value })} rows={3} className={inputClass} /></Field>
              <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : taskForm.id ? "Einsatz speichern" : "Einsatz anlegen"}</button>
            </form>

            <div className="space-y-3">
              {filtered.tasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{task.title || "Einsatz"}</p>
                      <p className="text-xs text-ink-400">{dateText(task.task_date)} · {task.start_time || "—"} - {task.end_time || "—"}</p>
                      <p className="mt-1 text-xs text-ink-400">{task.employee_name || "Ohne Mitarbeiter"} · {task.site || task.customer_name || "Ohne Objekt"}</p>
                      {task.recurrence_group_id && <p className="mt-1 text-[11px] font-bold text-brand-600">Serien-Einsatz</p>}
                    </div>
                    <StatusPill value={task.done ? "done" : task.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setTaskForm({ ...emptyTask, ...task, planned_minutes: String(task.planned_minutes || task.max_minutes || ""), recurrence_interval: String(task.recurrence_interval || "1"), recurrence_end_date: clean(task.recurrence_end_date), recurrence_days: Array.isArray(task.recurrence_days) ? task.recurrence_days.map(String) : [], repeat_mode: clean(task.repeat_mode || "none"), notify_employee: true })} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-bold text-brand-700">Bearbeiten</button>
                    <button onClick={() => patch({ type: "task_status", id: task.id, done: !task.done, status: task.done ? "open" : "done" }, task.done ? "Einsatz wieder geöffnet." : "Einsatz erledigt.")} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-bold text-brand-700">{task.done ? "Öffnen" : "Erledigt"}</button>
                  </div>
                  {task.recurrence_group_id && (
                    <div className="mt-3 rounded-2xl border border-brand-500/20 bg-brand-50 p-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700">Serie übertragen</p>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <select value={seriesAssign[task.recurrence_group_id] || task.employee_name || ""} onChange={(event) => setSeriesAssign({ ...seriesAssign, [task.recurrence_group_id]: event.target.value })} className={inputClass}>
                          <option value="">Ohne Mitarbeiter</option>
                          {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
                        </select>
                        <button type="button" onClick={() => patch({ type: "task_series_assign", id: task.id, recurrence_group_id: task.recurrence_group_id, employee_name: seriesAssign[task.recurrence_group_id] || task.employee_name || "" }, "Serie wurde übertragen.")} className="rounded-2xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">Übertragen</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!filtered.tasks.length && <EmptyCard title="Keine Einsätze gefunden" text="Lege oben einen neuen Einsatz an oder ändere die Suche." />}
            </div>
          </div>
        )}

        {tab === "employees" && (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); save("employee", employeeForm, () => setEmployeeForm({ ...emptyEmployee })); }} className="space-y-3 rounded-2xl border border-paper-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold">{employeeForm.id ? "Mitarbeiter bearbeiten" : "Mitarbeiter anlegen"}</p>
                {employeeForm.id && <button type="button" onClick={() => setEmployeeForm({ ...emptyEmployee })} className="text-xs font-bold text-ink-400">Abbrechen</button>}
              </div>
              <Field label="Name"><input value={employeeForm.name} onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })} required className={inputClass} /></Field>
              <Field label="E-Mail"><input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} className={inputClass} /></Field>
              <Field label="Telefon"><input value={employeeForm.phone} onChange={(event) => setEmployeeForm({ ...employeeForm, phone: event.target.value })} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stundensatz €"><input type="number" step="0.01" value={employeeForm.hourly_rate} onChange={(event) => setEmployeeForm({ ...employeeForm, hourly_rate: event.target.value })} className={inputClass} /></Field>
                <Field label="Urlaub/Jahr"><input type="number" step="0.5" value={employeeForm.annual_vacation_days || employeeForm.vacation_days} onChange={(event) => setEmployeeForm({ ...employeeForm, annual_vacation_days: event.target.value, vacation_days: event.target.value })} className={inputClass} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Geburtstag"><input type="date" value={employeeForm.birthday || ""} onChange={(event) => setEmployeeForm({ ...employeeForm, birthday: event.target.value })} className={inputClass} /></Field>
                <Field label="Monatsstunden"><input type="number" step="0.5" value={employeeForm.monthly_hour_limit} onChange={(event) => setEmployeeForm({ ...employeeForm, monthly_hour_limit: event.target.value })} className={inputClass} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rolle"><select value={employeeForm.role} onChange={(event) => setEmployeeForm({ ...employeeForm, role: event.target.value })} className={inputClass}><option value="employee">employee</option><option value="admin">admin</option></select></Field>
                <Field label="Aktiv"><select value={String(employeeForm.active)} onChange={(event) => setEmployeeForm({ ...employeeForm, active: event.target.value === "true" })} className={inputClass}><option value="false">Nein</option><option value="true">Ja</option></select></Field>
              </div>
              <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : "Mitarbeiter speichern"}</button>
              <Link href="/mitarbeiter/admin/aktivieren" className="block rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center text-sm font-bold text-brand-700">Login-Zugang aktivieren</Link>
            </form>
            <div className="space-y-3">
              {filtered.employees.map((employee) => (
                <div key={employee.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{labelEmployee(employee)}</p>
                      <p className="text-xs text-ink-400">{employee.email || "Keine E-Mail"}</p>
                      <p className="mt-1 text-xs text-ink-400">{employee.role || "employee"} · {employee.auth_user_id ? "Login verbunden" : "ohne Login"}</p>
                      <p className="mt-1 text-xs text-ink-400">{moneyPerHour(employee.hourly_rate)} · Urlaub {employee.annual_vacation_days ?? employee.vacation_days ?? "—"} Tage</p>
                      <p className="mt-1 text-xs text-ink-400">Geburtstag: {birthdayInfo(employee)?.date || "nicht gepflegt"}{birthdayInfo(employee)?.isToday ? " · Heute 🎉" : birthdayInfo(employee)?.daysUntil !== undefined ? ` · ${birthdayInfo(employee)?.label}` : ""}</p>
                    </div>
                    <StatusPill value={employee.active ? "active" : "inactive"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => { setEmployeeForm({ ...emptyEmployee, ...employee, active: employee.active !== false, hourly_rate: String(employee.hourly_rate || "0"), monthly_hour_limit: String(employee.monthly_hour_limit || "0"), vacation_days: String(employee.vacation_days || employee.annual_vacation_days || "0"), annual_vacation_days: String(employee.annual_vacation_days || employee.vacation_days || "0"), birthday: clean(employee.birthday) }); scrollToTop(); }} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-bold text-brand-700">Bearbeiten</button>
                    <button onClick={() => patch({ type: "employee", ...employee, active: employee.active === false }, employee.active === false ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.")} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-bold text-ink-800">{employee.active === false ? "Aktivieren" : "Deaktivieren"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "customers" && (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); save("customer", customerForm, () => setCustomerForm({ ...emptyCustomer })); }} className="space-y-3 rounded-2xl border border-paper-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold">{customerForm.id ? "Kunde bearbeiten" : "Kunde anlegen"}</p>
                {customerForm.id && <button type="button" onClick={() => setCustomerForm({ ...emptyCustomer })} className="text-xs font-bold text-ink-400">Abbrechen</button>}
              </div>
              <Field label="Kundenname"><input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} required className={inputClass} /></Field>
              <Field label="Adresse"><input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefon"><input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} className={inputClass} /></Field>
                <Field label="E-Mail"><input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} className={inputClass} /></Field>
              </div>
              <Field label="Notizen"><textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} rows={3} className={inputClass} /></Field>
              <div className="rounded-3xl border border-brand-500/20 bg-brand-50 p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Jahresplanung</p>
                    <p className="mt-1 text-xs text-brand-700/80">Erstellt für 1 Jahr offene Termine ohne Mitarbeiter. Die Serie kann später übertragen werden.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-brand-700">
                    <input type="checkbox" checked={Boolean(customerForm.generate_year_plan)} onChange={(event) => setCustomerForm({ ...customerForm, generate_year_plan: event.target.checked })} />
                    anlegen
                  </label>
                </div>
                <Field label="Objekt für Termine">
                  <select value={customerForm.work_site_id || ""} onChange={(event) => setCustomerForm({ ...customerForm, work_site_id: event.target.value })} className={inputClass}>
                    <option value="">Kunde/Adresse verwenden</option>
                    {customerSitesForPlan.map((site) => <option key={site.id} value={site.id}>{labelSite(site)}</option>)}
                  </select>
                </Field>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Ab Datum"><input type="date" value={customerForm.plan_start_date || today} onChange={(event) => setCustomerForm({ ...customerForm, plan_start_date: event.target.value })} className={inputClass} /></Field>
                  <Field label="Titel"><input value={customerForm.default_task_title || "Unterhaltsreinigung"} onChange={(event) => setCustomerForm({ ...customerForm, default_task_title: event.target.value })} className={inputClass} /></Field>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Field label="Von"><input type="time" value={customerForm.plan_start_time || "08:00"} onChange={(event) => setCustomerForm({ ...customerForm, plan_start_time: event.target.value })} className={inputClass} /></Field>
                  <Field label="Bis"><input type="time" value={customerForm.plan_end_time || "10:00"} onChange={(event) => setCustomerForm({ ...customerForm, plan_end_time: event.target.value })} className={inputClass} /></Field>
                  <Field label="Limit h"><input type="number" step="0.25" value={customerForm.planning_limit_hours_per_day || "2"} onChange={(event) => setCustomerForm({ ...customerForm, planning_limit_hours_per_day: event.target.value })} className={inputClass} /></Field>
                </div>
                <div className="mt-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Arbeitstage</p>
                  <div className="grid grid-cols-7 gap-1">
                    {weekdayOptions.map((day) => {
                      const active = Array.isArray(customerForm.work_days) && customerForm.work_days.map(String).includes(day.value);
                      return <button key={day.value} type="button" onClick={() => toggleCustomerWeekday(day.value)} className={`rounded-xl border px-2 py-2 text-xs font-bold ${active ? "border-brand-500 bg-brand-600 text-white" : "border-paper-300 bg-white text-ink-600"}`}>{day.label}</button>;
                    })}
                  </div>
                </div>
              </div>
              <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : customerForm.generate_year_plan ? "Kunde speichern + Jahresplanung" : "Kunde speichern"}</button>
            </form>
            <div className="space-y-3">
              {filtered.customers.map((customer) => (
                <div key={customer.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{labelCustomer(customer)}</p>
                      <p className="text-xs text-ink-400">{rowAddress(customer) || "Keine Adresse"}</p>
                      <p className="mt-1 text-xs text-ink-400">{customer.phone || customer.customer_phone || "—"} · {customer.email || customer.customer_email || "—"}</p>
                      {(customer.work_days || customer.default_start_time || customer.default_end_time || customer.planning_limit_minutes_per_day) && <p className="mt-1 text-xs text-brand-700">Plan: {Array.isArray(customer.work_days) ? customer.work_days.join(",") : "—"} · {customer.default_start_time || "—"}-{customer.default_end_time || "—"} · Limit {customer.planning_limit_minutes_per_day ? `${Number(customer.planning_limit_minutes_per_day) / 60}h` : "—"}</p>}
                    </div>
                    <StatusPill value={customer.active === false ? "inactive" : "active"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => { setCustomerForm({ ...emptyCustomer, id: customer.id, name: labelCustomer(customer), address: rowAddress(customer), phone: clean(customer.phone || customer.customer_phone), email: clean(customer.email || customer.customer_email), customer_number: clean(customer.customer_number), notes: clean(customer.notes || customer.customer_notes), active: customer.active !== false, work_days: Array.isArray(customer.work_days) ? customer.work_days.map(String) : [], plan_start_time: clean(customer.default_start_time) || "08:00", plan_end_time: clean(customer.default_end_time) || "10:00", planning_limit_hours_per_day: customer.planning_limit_minutes_per_day ? String(Number(customer.planning_limit_minutes_per_day) / 60) : "2", default_task_title: clean(customer.default_task_title) || "Unterhaltsreinigung", work_site_id: clean(customer.default_work_site_id), generate_year_plan: false }); scrollToTop(); }} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-bold text-brand-700">Bearbeiten</button>
                    <button onClick={() => patch({ type: "customer", id: customer.id, name: labelCustomer(customer), address: rowAddress(customer), phone: customer.phone || customer.customer_phone, email: customer.email || customer.customer_email, notes: customer.notes || customer.customer_notes, active: customer.active === false, work_days: Array.isArray(customer.work_days) ? customer.work_days : null, plan_start_time: customer.default_start_time, plan_end_time: customer.default_end_time, planning_limit_minutes_per_day: customer.planning_limit_minutes_per_day, default_task_title: customer.default_task_title, default_work_site_id: customer.default_work_site_id }, customer.active === false ? "Kunde aktiviert." : "Kunde deaktiviert.")} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-bold text-ink-800">{customer.active === false ? "Aktivieren" : "Deaktivieren"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "sites" && (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); save("site", siteForm, () => setSiteForm({ ...emptySite })); }} className="space-y-3 rounded-2xl border border-paper-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold">{siteForm.id ? "Objekt bearbeiten" : "Objekt anlegen"}</p>
                {siteForm.id && <button type="button" onClick={() => setSiteForm({ ...emptySite })} className="text-xs font-bold text-ink-400">Abbrechen</button>}
              </div>
              <Field label="Objektname"><input value={siteForm.name} onChange={(event) => setSiteForm({ ...siteForm, name: event.target.value })} required className={inputClass} /></Field>
              <Field label="Kunde"><select value={siteForm.customer_id} onChange={(event) => setSiteForm({ ...siteForm, customer_id: event.target.value })} className={inputClass}><option value="">Ohne Kunde</option>{(data?.customers || []).map((customer) => <option key={customer.id} value={customer.id}>{labelCustomer(customer)}</option>)}</select></Field>
              <Field label="Adresse"><input value={siteForm.address} onChange={(event) => setSiteForm({ ...siteForm, address: event.target.value })} className={inputClass} /></Field>
              <div className="rounded-2xl border border-brand-500/20 bg-brand-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-700">GPS-Prüfung</p>
                    <p className="mt-1 text-xs text-brand-700/80">Standort am Objekt speichern, damit Mitarbeiter nur vor Ort stempeln.</p>
                  </div>
                  <button type="button" onClick={useCurrentLocationForSite} className="rounded-2xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">Hier bin ich</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude"><input value={siteForm.latitude} onChange={(event) => setSiteForm({ ...siteForm, latitude: event.target.value })} className={inputClass} placeholder="48.1234567" /></Field>
                  <Field label="Longitude"><input value={siteForm.longitude} onChange={(event) => setSiteForm({ ...siteForm, longitude: event.target.value })} className={inputClass} placeholder="8.1234567" /></Field>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm font-bold text-brand-700">
                  <input type="checkbox" checked={Boolean(siteForm.gps_required)} onChange={(event) => setSiteForm({ ...siteForm, gps_required: event.target.checked })} />
                  GPS für dieses Objekt erzwingen
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Radius m"><input type="number" value={siteForm.allowed_radius_m} onChange={(event) => setSiteForm({ ...siteForm, allowed_radius_m: event.target.value })} className={inputClass} /></Field>
                <Field label="Monatsstunden"><input type="number" value={siteForm.monthly_hour_quota} onChange={(event) => setSiteForm({ ...siteForm, monthly_hour_quota: event.target.value })} className={inputClass} /></Field>
              </div>
              <Field label="Notizen"><textarea value={siteForm.notes} onChange={(event) => setSiteForm({ ...siteForm, notes: event.target.value })} rows={3} className={inputClass} /></Field>
              <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : "Objekt speichern"}</button>
            </form>
            <div className="space-y-3">
              {filtered.workSites.map((site) => (
                <div key={site.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{labelSite(site)}</p>
                      <p className="text-xs text-ink-400">{rowAddress(site) || "Keine Adresse"}</p>
                      <p className="mt-1 text-xs text-ink-400">{site.customer_name || "Ohne Kunde"} · Radius {site.allowed_radius_m || 150} m</p>
                      <p className="mt-1 text-xs text-ink-400">GPS: {site.latitude && site.longitude ? `${site.latitude}, ${site.longitude}` : "nicht gesetzt"}{site.gps_required ? " · Pflicht" : ""}</p>
                    </div>
                    <StatusPill value={site.active === false ? "inactive" : "active"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => { setSiteForm({ ...emptySite, id: site.id, name: labelSite(site), customer_id: clean(site.customer_id), address: rowAddress(site), latitude: clean(site.latitude), longitude: clean(site.longitude), gps_required: Boolean(site.gps_required), allowed_radius_m: String(site.allowed_radius_m || 150), monthly_hour_quota: String(site.monthly_hour_quota || site.hour_quota || 0), notes: clean(site.notes), active: site.active !== false }); scrollToTop(); }} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-bold text-brand-700">Bearbeiten</button>
                    <button onClick={() => patch({ type: "site", id: site.id, name: labelSite(site), customer_id: site.customer_id, address: rowAddress(site), latitude: site.latitude, longitude: site.longitude, gps_required: site.gps_required, allowed_radius_m: site.allowed_radius_m, monthly_hour_quota: site.monthly_hour_quota || site.hour_quota, notes: site.notes, active: site.active === false }, site.active === false ? "Objekt aktiviert." : "Objekt deaktiviert.")} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-bold text-ink-800">{site.active === false ? "Aktivieren" : "Deaktivieren"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "times" && (
          <div className="space-y-3">
            {filtered.timeEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{entry.employee_name || "Mitarbeiter"}</p>
                    <p className="text-xs text-ink-400">{entry.work_site_name || "Ohne Objekt"}</p>
                    <p className="mt-1 text-xs text-ink-400">{dateTimeText(entry.created_at)} · {entry.action || "Stempel"}</p>
                    <p className="mt-1 text-xs text-ink-400">GPS: {entry.latitude && entry.longitude ? `${entry.latitude}, ${entry.longitude}` : "nicht gespeichert"}{typeof entry.distance_m === "number" ? ` · ${entry.distance_m} m / ${entry.allowed_radius_m || 150} m` : ""}</p>
                  </div>
                  <StatusPill value={entry.success === false ? "Fehler" : "OK"} />
                </div>
                {entry.error_message && <p className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-100 p-3 text-xs text-rose-700">{entry.error_message}</p>}
              </div>
            ))}
            {!filtered.timeEntries.length && <EmptyCard title="Keine Zeiten" text="Hier erscheinen die letzten Stempelungen aus time_entries." />}
          </div>
        )}
      </div>
    </Shell>
  );
}
