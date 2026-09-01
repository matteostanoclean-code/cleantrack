"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon } from "@/components/ui";

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
/** Tabellenzelle mit Haken oder Kreuz. */
/**
 * Kachel für einen offenen Punkt auf dem Dashboard.
 *
 * Steht die Zahl auf null, wird gar nichts gezeigt — eine Kachel mit einer
 * Null ist keine Aufgabe. Dringendes bekommt einen roten Rand, alles andere
 * bleibt blau; sonst schreit die ganze Seite und man sieht nicht mehr, was
 * wirklich eilt.
 */
function AufgabenKachel({ zahl, titel, hinweis, icon, href, dringend }: {
  zahl: number;
  titel: string;
  hinweis: string;
  icon: string;
  href: string;
  dringend?: boolean;
}) {
  if (!zahl) return null;
  return (
    <a
      href={href}
      className={`group flex items-start gap-4 rounded-2xl border bg-white p-4 transition hover:shadow-md ${dringend ? "border-danger-500/40" : "border-paper-200"}`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${dringend ? "bg-danger-50 text-danger-600" : "bg-brand-50 text-brand-600"}`}>
        <UiIcon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink-900">{titel}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-400">{hinweis}</span>
      </span>
      <span className={`shrink-0 text-[30px] font-bold leading-none ${dringend ? "text-danger-600" : "text-brand-600"}`}>{zahl}</span>
    </a>
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

  /**
   * Wer in den nächsten zwei Wochen nicht da ist.
   *
   * Nur Genehmigtes: Ein Antrag, über den noch nicht entschieden ist, gehört
   * unter "Zu erledigen", nicht in die Planung. Sonst plant man um jemanden
   * herum, der am Ende doch da ist.
   */
  const abwesendDemnaechst = useMemo(() => {
    const bis = new Date();
    bis.setDate(bis.getDate() + 14);
    const bisIso = bis.toISOString().slice(0, 10);
    return (data?.absences || [])
      .filter((eintrag) => {
        if (!["approved", "genehmigt"].includes(clean(eintrag.status).toLowerCase())) return false;
        const von = clean(eintrag.start_date).slice(0, 10);
        const ende = clean(eintrag.end_date || eintrag.start_date).slice(0, 10);
        return von && ende >= today && von <= bisIso;
      })
      .sort((a, b) => clean(a.start_date).localeCompare(clean(b.start_date)))
      .slice(0, 6);
  }, [data?.absences]);

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


        {/* Nur noch die Uebersicht: die Stammdaten haben eigene Seiten. */}
          <div className="space-y-1">

            {/*
              Eine Zeile je Sache, mit eigener Zahl. Vorher stand hier eine
              Sammelzahl "Freigaben und Meldungen 17" — daraus ging nicht
              hervor, ob das drei Urlaubsanträge oder vierzehn Materialzettel
              sind und wo man anfangen soll.
            */}
            {/*
              Kacheln statt Zeilen. Eine Kachel je Sache, die Zahl gross, damit
              man sie im Vorbeigehen liest. Was auf null steht, verschwindet —
              eine Kachel mit einer Null ist keine Aufgabe, sondern Ballast.
            */}
            <section className="pt-3">
              <h2 className="pb-2 text-[17px] font-bold text-ink-900">Zu erledigen</h2>
              {aufgaben === null ? (
                <p className="py-3 text-[14px] text-ink-400">Zähle offene Punkte…</p>
              ) : aufgaben.gesamt === 0 ? (
                <div className="rounded-2xl border border-paper-200 bg-white px-4 py-8 text-center">
                  <p className="text-[17px] font-semibold text-ink-900">Nichts offen</p>
                  <p className="mt-1 text-[14px] text-ink-400">Keine Zeiten, Anträge oder Meldungen, die auf dich warten.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <AufgabenKachel
                    zahl={aufgaben.zeiten}
                    titel="Zeiten prüfen"
                    hinweis={aufgaben.zeitenProblem > 0 ? `${aufgaben.zeitenProblem} mit Standortfehler oder ohne Ausstempeln` : "Abweichungen zur Zeitvorgabe"}
                    icon="stopwatch"
                    href="/mitarbeiter/admin/zeiten"
                    dringend={aufgaben.zeitenProblem > 0}
                  />
                  <AufgabenKachel zahl={aufgaben.chat} titel="Nachrichten vom Team" hinweis="Ungelesen im Chat" icon="chat" href="/mitarbeiter/admin/chat" />
                  <AufgabenKachel zahl={aufgaben.urlaub} titel="Urlaub und Abwesenheit" hinweis="Anträge ohne Entscheidung" icon="plane" href="/mitarbeiter/admin/urlaub" />
                  <AufgabenKachel zahl={aufgaben.material} titel="Materialbestellungen" hinweis="Noch nicht bestellt oder geliefert" icon="box" href="/mitarbeiter/admin/bestellungen" />
                  <AufgabenKachel zahl={aufgaben.qualitaet} titel="Qualitätsnachweise" hinweis="Noch nicht angesehen" icon="check" href="/mitarbeiter/admin/freigaben" />
                  <AufgabenKachel zahl={aufgaben.ohneMitarbeiter} titel="Einsätze ohne Mitarbeiter" hinweis="Noch niemand eingeteilt" icon="users" href="/mitarbeiter/admin/einsatzplaner" dringend />
                </div>
              )}
            </section>

            {/*
              Wer weg ist und wer Geburtstag hat, nebeneinander. Beides ist
              keine Aufgabe, sondern etwas, das man wissen will, bevor man
              plant oder jemandem gegenübersteht.
            */}
            {abwesendDemnaechst.length || upcomingBirthdays.length ? (
              <div className="grid gap-3 pt-4 lg:grid-cols-2">
                {abwesendDemnaechst.length ? (
                  <section className="rounded-2xl border border-paper-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-[16px] font-bold text-ink-900">Wer ist nicht da</h2>
                      <a href="/mitarbeiter/admin/abwesenheiten" className="text-[13px] font-semibold text-brand-700">Zeitleiste</a>
                    </div>
                    <div className="space-y-2">
                      {abwesendDemnaechst.map((eintrag) => {
                        const laeuft = clean(eintrag.start_date).slice(0, 10) <= today;
                        return (
                          <div key={eintrag.id} className="flex items-center gap-3 rounded-xl border border-paper-200 px-3 py-2.5">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${clean(eintrag.request_type || eintrag.absence_type).toLowerCase().includes("krank") ? "bg-danger-500" : "bg-amber-500"}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-semibold text-ink-900">{clean(eintrag.employee_name) || "Mitarbeiter"}</span>
                              <span className="block truncate text-[13px] text-ink-400">
                                {clean(eintrag.request_type || eintrag.absence_type) || "Abwesend"} · {dateText(eintrag.start_date)} bis {dateText(eintrag.end_date || eintrag.start_date)}
                              </span>
                            </span>
                            <span className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold ${laeuft ? "bg-amber-100 text-amber-800" : "bg-paper-200 text-ink-600"}`}>
                              {laeuft ? "läuft" : "kommt"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                {upcomingBirthdays.length ? (
                  <section className="rounded-2xl border border-paper-200 bg-white p-4">
                    <h2 className="mb-3 text-[16px] font-bold text-ink-900">Kommende Geburtstage</h2>
                    <div className="space-y-2">
                      {upcomingBirthdays.map(({ employee, info }) => (
                        <div key={employee.id} className="flex items-center gap-3 rounded-xl border border-paper-200 px-3 py-2.5">
                          <span className="text-[18px]">{info?.isToday ? "🎉" : "🎂"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-ink-900">{labelEmployee(employee)}</span>
                            <span className="block text-[13px] text-ink-400">{info?.date || "—"}</span>
                          </span>
                          <span className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold ${info?.isToday ? "bg-brand-600 text-white" : "bg-paper-200 text-ink-600"}`}>
                            {info?.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

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

      </div>
    </Shell>
  );
}