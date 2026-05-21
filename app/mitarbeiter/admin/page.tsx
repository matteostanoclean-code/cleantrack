"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Row = Record<string, any>;
type Tab = "overview" | "tasks" | "employees" | "customers" | "sites" | "times";

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

const emptyEmployee = { id: "", name: "", email: "", phone: "", role: "employee", active: false, monthly_hour_limit: "0", vacation_days: "0" };
const emptyCustomer = { id: "", name: "", address: "", phone: "", email: "", customer_number: "", notes: "", active: true };
const emptySite = { id: "", name: "", customer_id: "", address: "", allowed_radius_m: "150", monthly_hour_quota: "0", notes: "", active: true };
const emptyTask = { id: "", title: "Unterhaltsreinigung", task_date: today, start_time: "08:00", end_time: "10:00", planned_minutes: "120", employee_name: "", customer_id: "", work_site_id: "", site: "", priority: "Normal", status: "open", notes: "", notify_employee: true };

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
  const tone = ["done", "approved", "active", "true"].includes(text.toLowerCase()) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : text.toLowerCase().includes("reject") || text.toLowerCase() === "false" ? "border-red-500/30 bg-red-500/10 text-red-100" : "border-blue-500/30 bg-blue-500/10 text-blue-100";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tone}`}>{text}</span>;
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
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-blue-500/40 bg-blue-500/10 text-3xl">🧽</div>
          <h1 className="text-3xl font-black">Admin-Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">Kunden, Objekte, Einsätze und Mitarbeiter verwalten.</p>
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

function TabButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`min-w-fit rounded-2xl border px-4 py-3 text-left text-sm ${active ? "border-blue-500 bg-blue-600 text-white" : "border-slate-800 bg-slate-900 text-slate-300"}`}>
      <span className="block font-black">{label}</span>
      {typeof count === "number" ? <span className="text-[11px] opacity-80">{count} Einträge</span> : null}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass = "w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="font-black text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState({ ...emptyEmployee });
  const [customerForm, setCustomerForm] = useState({ ...emptyCustomer });
  const [siteForm, setSiteForm] = useState({ ...emptySite });
  const [taskForm, setTaskForm] = useState({ ...emptyTask });

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
      if (!response.ok || !result.ok) throw new Error(result.error || "Speichern fehlgeschlagen.");
      setMessage(form.id ? "Änderung gespeichert." : "Neuer Datensatz gespeichert.");
      reset();
      await load();
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
    return { todayTasks, openTasks, monthMinutes, openRequests };
  }, [data]);

  const selectedCustomer = (data?.customers || []).find((customer) => customer.id === siteForm.customer_id || customer.id === taskForm.customer_id);
  const sitesForTask = (data?.workSites || []).filter((site) => !taskForm.customer_id || site.customer_id === taskForm.customer_id || clean(site.customer_name).toLowerCase() === labelCustomer(selectedCustomer).toLowerCase());
  const selectedTaskSite = (data?.workSites || []).find((site) => site.id === taskForm.work_site_id);

  useEffect(() => {
    if (selectedTaskSite && !taskForm.site) {
      setTaskForm((current) => ({ ...current, site: labelSite(selectedTaskSite) }));
    }
  }, [selectedTaskSite, taskForm.site]);

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
            <h1 className="text-3xl font-black">Dashboard</h1>
            <p className="mt-1 text-xs text-slate-400">Angemeldet als {data?.profile?.name || "Admin"}</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-black text-slate-200">Logout</button>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <TabButton active={tab === "overview"} label="Übersicht" onClick={() => setTab("overview")} />
          <TabButton active={tab === "tasks"} label="Einsätze" count={data?.tasks?.length || 0} onClick={() => setTab("tasks")} />
          <TabButton active={tab === "employees"} label="Mitarbeiter" count={data?.employees?.length || 0} onClick={() => setTab("employees")} />
          <TabButton active={tab === "customers"} label="Kunden" count={data?.customers?.length || 0} onClick={() => setTab("customers")} />
          <TabButton active={tab === "sites"} label="Objekte" count={data?.workSites?.length || 0} onClick={() => setTab("sites")} />
          <TabButton active={tab === "times"} label="Zeiten" count={data?.timeEntries?.length || 0} onClick={() => setTab("times")} />
        </div>

        {error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
        {message && <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</p>}
        {loading && <p className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">Aktualisiere Daten…</p>}

        {tab !== "overview" && (
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suchen…" className={inputClass} />
        )}

        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard title="Heute" value={stats.todayTasks} caption="Einsätze" />
              <StatCard title="Offen" value={stats.openTasks} caption="nicht erledigt" />
              <StatCard title="Planzeit" value={hoursLabel(stats.monthMinutes)} caption="sichtbarer Zeitraum" />
              <StatCard title="Freigaben" value={stats.openRequests} caption="offene Meldungen" />
            </div>
            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <p className="font-black">Schnellzugriff</p>
              <div className="mt-3 grid gap-2">
                <button onClick={() => setTab("tasks")} className="rounded-2xl bg-blue-600 px-4 py-3 text-left font-black text-white">Einsatz erstellen</button>
                <button onClick={() => setTab("customers")} className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-left font-black text-blue-100">Kunde anlegen</button>
                <Link href="/mitarbeiter/freigaben" className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-black text-blue-100">Freigaben bearbeiten</Link>
                <Link href="/mitarbeiter/aktivieren" className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-black text-blue-100">Mitarbeiter aktivieren</Link>
                <Link href="/mitarbeiter" className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-black text-slate-200">Zur Mitarbeiter-App</Link>
              </div>
            </section>
            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-black">Nächste Einsätze</p>
                <button onClick={() => load()} className="text-xs font-black text-blue-200">Neu laden</button>
              </div>
              <div className="space-y-3">
                {(data?.tasks || []).slice(0, 5).map((task) => (
                  <div key={task.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black">{task.title || "Einsatz"}</p>
                        <p className="text-xs text-slate-400">{dateText(task.task_date)} · {task.start_time || "—"} - {task.end_time || "—"}</p>
                        <p className="mt-1 text-xs text-slate-500">{task.employee_name || "Ohne Mitarbeiter"} · {task.site || task.customer_name || "Ohne Objekt"}</p>
                      </div>
                      <StatusPill value={task.done ? "done" : task.status} />
                    </div>
                  </div>
                ))}
                {!(data?.tasks || []).length && <EmptyCard title="Keine Einsätze" text="Sobald Einsätze angelegt sind, erscheinen sie hier." />}
              </div>
            </section>
          </div>
        )}

        {tab === "tasks" && (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); save("task", taskForm, () => setTaskForm({ ...emptyTask })); }} className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between">
                <p className="font-black">{taskForm.id ? "Einsatz bearbeiten" : "Einsatz erstellen"}</p>
                {taskForm.id && <button type="button" onClick={() => setTaskForm({ ...emptyTask })} className="text-xs font-black text-slate-400">Abbrechen</button>}
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
              <Field label="Mitarbeiter">
                <select value={taskForm.employee_name} onChange={(event) => setTaskForm({ ...taskForm, employee_name: event.target.value })} className={inputClass}>
                  <option value="">Ohne Mitarbeiter</option>
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
              <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : taskForm.id ? "Einsatz speichern" : "Einsatz anlegen"}</button>
            </form>

            <div className="space-y-3">
              {filtered.tasks.map((task) => (
                <div key={task.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black">{task.title || "Einsatz"}</p>
                      <p className="text-xs text-slate-400">{dateText(task.task_date)} · {task.start_time || "—"} - {task.end_time || "—"}</p>
                      <p className="mt-1 text-xs text-slate-500">{task.employee_name || "Ohne Mitarbeiter"} · {task.site || task.customer_name || "Ohne Objekt"}</p>
                    </div>
                    <StatusPill value={task.done ? "done" : task.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setTaskForm({ ...emptyTask, ...task, planned_minutes: String(task.planned_minutes || task.max_minutes || ""), notify_employee: true })} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-black text-blue-100">Bearbeiten</button>
                    <button onClick={() => patch({ type: "task_status", id: task.id, done: !task.done, status: task.done ? "open" : "done" }, task.done ? "Einsatz wieder geöffnet." : "Einsatz erledigt.")} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-black text-emerald-100">{task.done ? "Öffnen" : "Erledigt"}</button>
                  </div>
                </div>
              ))}
              {!filtered.tasks.length && <EmptyCard title="Keine Einsätze gefunden" text="Lege oben einen neuen Einsatz an oder ändere die Suche." />}
            </div>
          </div>
        )}

        {tab === "employees" && (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); save("employee", employeeForm, () => setEmployeeForm({ ...emptyEmployee })); }} className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between">
                <p className="font-black">{employeeForm.id ? "Mitarbeiter bearbeiten" : "Mitarbeiter anlegen"}</p>
                {employeeForm.id && <button type="button" onClick={() => setEmployeeForm({ ...emptyEmployee })} className="text-xs font-black text-slate-400">Abbrechen</button>}
              </div>
              <Field label="Name"><input value={employeeForm.name} onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })} required className={inputClass} /></Field>
              <Field label="E-Mail"><input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} className={inputClass} /></Field>
              <Field label="Telefon"><input value={employeeForm.phone} onChange={(event) => setEmployeeForm({ ...employeeForm, phone: event.target.value })} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rolle"><select value={employeeForm.role} onChange={(event) => setEmployeeForm({ ...employeeForm, role: event.target.value })} className={inputClass}><option value="employee">employee</option><option value="admin">admin</option></select></Field>
                <Field label="Aktiv"><select value={String(employeeForm.active)} onChange={(event) => setEmployeeForm({ ...employeeForm, active: event.target.value === "true" })} className={inputClass}><option value="false">Nein</option><option value="true">Ja</option></select></Field>
              </div>
              <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : "Mitarbeiter speichern"}</button>
              <Link href="/mitarbeiter/aktivieren" className="block rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black text-blue-100">Login-Zugang aktivieren</Link>
            </form>
            <div className="space-y-3">
              {filtered.employees.map((employee) => (
                <div key={employee.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black">{labelEmployee(employee)}</p>
                      <p className="text-xs text-slate-400">{employee.email || "Keine E-Mail"}</p>
                      <p className="mt-1 text-xs text-slate-500">{employee.role || "employee"} · {employee.auth_user_id ? "Login verbunden" : "ohne Login"}</p>
                    </div>
                    <StatusPill value={employee.active ? "active" : "inactive"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setEmployeeForm({ ...emptyEmployee, ...employee, active: employee.active !== false, monthly_hour_limit: String(employee.monthly_hour_limit || "0"), vacation_days: String(employee.vacation_days || employee.annual_vacation_days || "0") })} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-black text-blue-100">Bearbeiten</button>
                    <button onClick={() => patch({ type: "employee", ...employee, active: employee.active === false }, employee.active === false ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.")} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-black text-slate-100">{employee.active === false ? "Aktivieren" : "Deaktivieren"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "customers" && (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); save("customer", customerForm, () => setCustomerForm({ ...emptyCustomer })); }} className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between">
                <p className="font-black">{customerForm.id ? "Kunde bearbeiten" : "Kunde anlegen"}</p>
                {customerForm.id && <button type="button" onClick={() => setCustomerForm({ ...emptyCustomer })} className="text-xs font-black text-slate-400">Abbrechen</button>}
              </div>
              <Field label="Kundenname"><input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} required className={inputClass} /></Field>
              <Field label="Adresse"><input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefon"><input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} className={inputClass} /></Field>
                <Field label="E-Mail"><input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} className={inputClass} /></Field>
              </div>
              <Field label="Notizen"><textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} rows={3} className={inputClass} /></Field>
              <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : "Kunde speichern"}</button>
            </form>
            <div className="space-y-3">
              {filtered.customers.map((customer) => (
                <div key={customer.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black">{labelCustomer(customer)}</p>
                      <p className="text-xs text-slate-400">{rowAddress(customer) || "Keine Adresse"}</p>
                      <p className="mt-1 text-xs text-slate-500">{customer.phone || customer.customer_phone || "—"} · {customer.email || customer.customer_email || "—"}</p>
                    </div>
                    <StatusPill value={customer.active === false ? "inactive" : "active"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setCustomerForm({ ...emptyCustomer, id: customer.id, name: labelCustomer(customer), address: rowAddress(customer), phone: clean(customer.phone || customer.customer_phone), email: clean(customer.email || customer.customer_email), customer_number: clean(customer.customer_number), notes: clean(customer.notes || customer.customer_notes), active: customer.active !== false })} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-black text-blue-100">Bearbeiten</button>
                    <button onClick={() => patch({ type: "customer", id: customer.id, name: labelCustomer(customer), address: rowAddress(customer), phone: customer.phone || customer.customer_phone, email: customer.email || customer.customer_email, notes: customer.notes || customer.customer_notes, active: customer.active === false }, customer.active === false ? "Kunde aktiviert." : "Kunde deaktiviert.")} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-black text-slate-100">{customer.active === false ? "Aktivieren" : "Deaktivieren"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "sites" && (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); save("site", siteForm, () => setSiteForm({ ...emptySite })); }} className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between">
                <p className="font-black">{siteForm.id ? "Objekt bearbeiten" : "Objekt anlegen"}</p>
                {siteForm.id && <button type="button" onClick={() => setSiteForm({ ...emptySite })} className="text-xs font-black text-slate-400">Abbrechen</button>}
              </div>
              <Field label="Objektname"><input value={siteForm.name} onChange={(event) => setSiteForm({ ...siteForm, name: event.target.value })} required className={inputClass} /></Field>
              <Field label="Kunde"><select value={siteForm.customer_id} onChange={(event) => setSiteForm({ ...siteForm, customer_id: event.target.value })} className={inputClass}><option value="">Ohne Kunde</option>{(data?.customers || []).map((customer) => <option key={customer.id} value={customer.id}>{labelCustomer(customer)}</option>)}</select></Field>
              <Field label="Adresse"><input value={siteForm.address} onChange={(event) => setSiteForm({ ...siteForm, address: event.target.value })} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Radius m"><input type="number" value={siteForm.allowed_radius_m} onChange={(event) => setSiteForm({ ...siteForm, allowed_radius_m: event.target.value })} className={inputClass} /></Field>
                <Field label="Monatsstunden"><input type="number" value={siteForm.monthly_hour_quota} onChange={(event) => setSiteForm({ ...siteForm, monthly_hour_quota: event.target.value })} className={inputClass} /></Field>
              </div>
              <Field label="Notizen"><textarea value={siteForm.notes} onChange={(event) => setSiteForm({ ...siteForm, notes: event.target.value })} rows={3} className={inputClass} /></Field>
              <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Speichere…" : "Objekt speichern"}</button>
            </form>
            <div className="space-y-3">
              {filtered.workSites.map((site) => (
                <div key={site.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black">{labelSite(site)}</p>
                      <p className="text-xs text-slate-400">{rowAddress(site) || "Keine Adresse"}</p>
                      <p className="mt-1 text-xs text-slate-500">{site.customer_name || "Ohne Kunde"} · Radius {site.allowed_radius_m || 150} m</p>
                    </div>
                    <StatusPill value={site.active === false ? "inactive" : "active"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setSiteForm({ ...emptySite, id: site.id, name: labelSite(site), customer_id: clean(site.customer_id), address: rowAddress(site), allowed_radius_m: String(site.allowed_radius_m || 150), monthly_hour_quota: String(site.monthly_hour_quota || site.hour_quota || 0), notes: clean(site.notes), active: site.active !== false })} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-black text-blue-100">Bearbeiten</button>
                    <button onClick={() => patch({ type: "site", id: site.id, name: labelSite(site), customer_id: site.customer_id, address: rowAddress(site), allowed_radius_m: site.allowed_radius_m, monthly_hour_quota: site.monthly_hour_quota || site.hour_quota, notes: site.notes, active: site.active === false }, site.active === false ? "Objekt aktiviert." : "Objekt deaktiviert.")} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-black text-slate-100">{site.active === false ? "Aktivieren" : "Deaktivieren"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "times" && (
          <div className="space-y-3">
            {filtered.timeEntries.map((entry) => (
              <div key={entry.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-black">{entry.employee_name || "Mitarbeiter"}</p>
                    <p className="text-xs text-slate-400">{entry.work_site_name || "Ohne Objekt"}</p>
                    <p className="mt-1 text-xs text-slate-500">{dateTimeText(entry.created_at)} · {entry.action || "Stempel"}</p>
                  </div>
                  <StatusPill value={entry.success === false ? "Fehler" : "OK"} />
                </div>
                {entry.error_message && <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">{entry.error_message}</p>}
              </div>
            ))}
            {!filtered.timeEntries.length && <EmptyCard title="Keine Zeiten" text="Hier erscheinen die letzten Stempelungen aus time_entries." />}
          </div>
        )}
      </div>
    </Shell>
  );
}
