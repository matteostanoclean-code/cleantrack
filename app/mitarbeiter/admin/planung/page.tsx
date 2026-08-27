"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Planungszentrale.
 *
 * Hier wird geplant, nicht nur verteilt: Im Wochenplan legt das Plus an jedem
 * Tag einen neuen Einsatz an, ein Klick auf einen Termin öffnet ihn zum
 * Ändern. Darunter stehen die Einsätze ohne Mitarbeiter und die Serien.
 *
 * Der Wochenplan zeigt bewusst auch vergangene Wochen. Vorher waren alle
 * Termine vor heute herausgefiltert, dadurch war jede zurückgeblätterte Woche
 * leer und man konnte nicht nachsehen, was geplant war.
 */

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

const weekdayOptions = [
  { value: "1", label: "Mo" },
  { value: "2", label: "Di" },
  { value: "3", label: "Mi" },
  { value: "4", label: "Do" },
  { value: "5", label: "Fr" },
  { value: "6", label: "Sa" },
  { value: "0", label: "So" }
];

const emptyTask: Row = {
  id: "",
  title: "Unterhaltsreinigung",
  task_date: today,
  start_time: "08:00",
  end_time: "10:00",
  planned_minutes: "120",
  employee_name: "",
  customer_id: "",
  work_site_id: "",
  site: "",
  status: "open",
  notes: "",
  notify_employee: true,
  repeat_mode: "none",
  recurrence_interval: "1",
  recurrence_end_date: "",
  recurrence_days: [] as string[]
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function labelEmployee(row: Row | null | undefined) {
  return clean(row?.name) || "Mitarbeiter ohne Name";
}

function labelCustomer(row: Row | null | undefined) {
  return clean(row?.name || row?.customer_name || row?.company_name || row?.contact_person) || "Kunde ohne Name";
}

function labelSite(row: Row | null | undefined) {
  return clean(row?.name || row?.site || row?.object_name) || "Objekt ohne Name";
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

/** Minuten zwischen zwei Uhrzeiten, über Mitternacht hinweg. */
function minutesBetween(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const a = (sh || 0) * 60 + (sm || 0);
  let b = (eh || 0) * 60 + (em || 0);
  if (b < a) b += 1440;
  return Math.max(0, b - a);
}

function minutesFromTask(task: Row) {
  const known = Number(task.planned_minutes || task.max_minutes || task.paid_minutes || task.wage_minutes || 0);
  if (Number.isFinite(known) && known > 0) return known;
  return minutesBetween(clean(task.start_time), clean(task.end_time));
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

const inputClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="mx-auto min-h-[100dvh] max-w-[520px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8 px-4 py-5" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        {children}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-ink-400">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
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
          <h1 className="text-3xl font-bold">Planungszentrale</h1>
          <p className="mt-2 text-sm text-ink-400">Einsätze anlegen, verteilen und Serien pflegen.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-paper-200 bg-white p-4">
          <Field label="E-Mail"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className={inputClass} /></Field>
          <Field label="Passwort"><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className={inputClass} /></Field>
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

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-paper-200 bg-white p-4">
      <p className="font-bold text-ink-800">{title}</p>
      <p className="mt-1 text-sm text-ink-400">{text}</p>
    </div>
  );
}

/**
 * Formular für einen Einsatz, als Blatt über der Seite.
 *
 * Beim Anlegen ist die Wiederholung dabei, beim Ändern nicht — sonst würde
 * eine bestehende Serie beim Speichern neu erzeugt.
 */
function TaskSheet({
  form,
  setForm,
  data,
  saving,
  onClose,
  onSubmit,
  onCancelTask
}: {
  form: Row;
  setForm: (next: Row) => void;
  data: AdminData | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onCancelTask: () => void;
}) {
  const isEdit = Boolean(form.id);
  const sites = (data?.workSites || []).filter((site) => {
    if (!form.customer_id) return true;
    if (clean(site.customer_id) === clean(form.customer_id)) return true;
    const customer = (data?.customers || []).find((item) => item.id === form.customer_id);
    return clean(site.customer_name).toLowerCase() === labelCustomer(customer).toLowerCase();
  });

  function setTimes(start: string, end: string) {
    setForm({ ...form, start_time: start, end_time: end, planned_minutes: String(minutesBetween(start, end) || form.planned_minutes || "") });
  }

  function toggleWeekday(value: string) {
    const current = Array.isArray(form.recurrence_days) ? form.recurrence_days.map(String) : [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setForm({ ...form, recurrence_days: next });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 md:items-center md:p-6" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
          <div>
            <p className="text-[17px] font-bold">{isEdit ? "Einsatz ändern" : "Neuer Einsatz"}</p>
            <p className="text-xs text-ink-400">{dateText(form.task_date)}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-paper-300 px-3 py-2 text-sm font-bold text-ink-600">Schließen</button>
        </div>

        <form
          id="einsatz-formular"
          onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
          className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        >
          <Field label="Kunde">
            <select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value, work_site_id: "", site: "" })} className={inputClass}>
              <option value="">Ohne Kunde</option>
              {(data?.customers || []).map((customer) => <option key={customer.id} value={customer.id}>{labelCustomer(customer)}</option>)}
            </select>
          </Field>

          <Field label="Objekt">
            <select
              value={form.work_site_id}
              onChange={(event) => {
                const site = (data?.workSites || []).find((item) => item.id === event.target.value);
                setForm({ ...form, work_site_id: event.target.value, site: site ? labelSite(site) : "" });
              }}
              className={inputClass}
            >
              <option value="">Objekt offen lassen</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{labelSite(site)}</option>)}
            </select>
          </Field>

          <Field label="Was ist zu tun"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required className={inputClass} /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum"><input type="date" value={form.task_date} onChange={(event) => setForm({ ...form, task_date: event.target.value })} required className={inputClass} /></Field>
            <Field label="Planzeit in Minuten"><input type="number" min="0" value={form.planned_minutes} onChange={(event) => setForm({ ...form, planned_minutes: event.target.value })} className={inputClass} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Von"><input type="time" value={form.start_time} onChange={(event) => setTimes(event.target.value, form.end_time)} className={inputClass} /></Field>
            <Field label="Bis"><input type="time" value={form.end_time} onChange={(event) => setTimes(form.start_time, event.target.value)} className={inputClass} /></Field>
          </div>

          <Field label="Mitarbeiter">
            <select value={form.employee_name} onChange={(event) => setForm({ ...form, employee_name: event.target.value })} className={inputClass}>
              <option value="">Ohne Mitarbeiter, später zuweisen</option>
              {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
            </select>
          </Field>

          {!isEdit && (
            <div className="rounded-2xl border border-paper-200 bg-paper-100/70 p-3">
              <Field label="Wiederholung">
                <select
                  value={form.repeat_mode || "none"}
                  onChange={(event) => setForm({ ...form, repeat_mode: event.target.value, recurrence_days: event.target.value === "weekly" ? form.recurrence_days : [] })}
                  className={inputClass}
                >
                  <option value="none">Einmaliger Einsatz</option>
                  <option value="weekly">Jede Woche</option>
                  <option value="daily">Jeden Tag</option>
                  <option value="monthly">Jeden Monat</option>
                </select>
              </Field>
              {form.repeat_mode && form.repeat_mode !== "none" && (
                <div className="mt-3 space-y-3">
                  {form.repeat_mode === "weekly" && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">An diesen Tagen</p>
                      <div className="grid grid-cols-7 gap-1">
                        {weekdayOptions.map((day) => {
                          const active = Array.isArray(form.recurrence_days) && form.recurrence_days.map(String).includes(day.value);
                          return (
                            <button key={day.value} type="button" onClick={() => toggleWeekday(day.value)} className={`rounded-xl border px-2 py-2 text-xs font-bold ${active ? "border-brand-500 bg-brand-600 text-white" : "border-paper-300 bg-white text-ink-600"}`}>
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Alle X"><input type="number" min="1" max="52" value={form.recurrence_interval || "1"} onChange={(event) => setForm({ ...form, recurrence_interval: event.target.value })} className={inputClass} /></Field>
                    <Field label="Bis zum"><input type="date" required value={form.recurrence_end_date || ""} onChange={(event) => setForm({ ...form, recurrence_end_date: event.target.value })} className={inputClass} /></Field>
                  </div>
                  <p className="text-xs text-ink-400">Beim Speichern werden alle Termine bis zu diesem Datum auf einmal angelegt.</p>
                </div>
              )}
            </div>
          )}

          <Field label="Notiz für den Mitarbeiter"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} className={inputClass} /></Field>

          {isEdit && (
            <button type="button" onClick={onCancelTask} className="w-full rounded-xl border border-rose-300 bg-rose-50 py-3 text-sm font-bold text-rose-700">
              Einsatz absagen
            </button>
          )}
        </form>

        <div className="border-t border-paper-200 px-5 py-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <button form="einsatz-formular" disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white disabled:opacity-60">
            {saving ? "Speichere…" : isEdit ? "Änderung speichern" : "Einsatz anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<Row>({ ...emptyTask });

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

  function openNew(date: string) {
    setTaskForm({ ...emptyTask, task_date: date, recurrence_end_date: "" });
    setSheetOpen(true);
  }

  function openEdit(task: Row) {
    setTaskForm({
      ...emptyTask,
      id: task.id,
      title: clean(task.title) || "Einsatz",
      task_date: clean(task.task_date) || today,
      start_time: clean(task.start_time) || "",
      end_time: clean(task.end_time) || "",
      planned_minutes: String(minutesFromTask(task) || ""),
      employee_name: clean(task.employee_name),
      customer_id: clean(task.customer_id),
      work_site_id: clean(task.work_site_id),
      site: clean(task.site || task.work_site_name),
      status: clean(task.status) || "open",
      notes: clean(task.notes),
      repeat_mode: "",
      // Serienangaben unverändert mitgeben, sonst verliert der Termin beim
      // Speichern seine Zugehörigkeit zur Serie.
      recurrence_unit: task.recurrence_unit ?? null,
      recurrence_interval: task.recurrence_interval ?? null,
      recurrence_days: task.recurrence_days ?? null,
      recurrence_end_date: task.recurrence_end_date ?? ""
    });
    setSheetOpen(true);
  }

  async function saveTask() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const method = taskForm.id ? "PATCH" : "POST";
      const response = await fetch("/api/mobile/admin/dashboard", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...taskForm, type: "task" })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || `Speichern fehlgeschlagen (HTTP ${response.status}).`);
      const count = Number(result.count || 0);
      setMessage(taskForm.id ? "Einsatz geändert." : count > 1 ? `${count} Einsätze angelegt.` : "Einsatz angelegt.");
      setSheetOpen(false);
      setTaskForm({ ...emptyTask });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelTask() {
    if (!taskForm.id) return;
    if (!window.confirm("Diesen Einsatz absagen? Er bleibt zur Nachvollziehbarkeit stehen, zählt aber nicht mehr.")) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/admin/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "task_status", id: taskForm.id, status: "cancelled", done: true })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Absagen fehlgeschlagen.");
      setMessage("Einsatz wurde abgesagt.");
      setSheetOpen(false);
      setTaskForm({ ...emptyTask });
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Absagen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  // Alle Termine für den Wochenplan, damit auch zurückgeblätterte Wochen gefüllt sind.
  const allTasks = useMemo(
    () => (data?.tasks || []).slice().sort((a, b) => `${a.task_date || "9999-12-31"}-${a.start_time || "99:99"}`.localeCompare(`${b.task_date || "9999-12-31"}-${b.start_time || "99:99"}`)),
    [data]
  );
  // Ab heute — für offene Verteilungen und Serien, Vergangenes lässt sich nicht mehr planen.
  const tasks = useMemo(() => allTasks.filter((task) => clean(task.task_date) >= today), [allTasks]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => iso(addDays(parseIso(weekStart), index))), [weekStart]);
  const weekTasks = useMemo(() => allTasks.filter((task) => weekDays.includes(clean(task.task_date))), [allTasks, weekDays]);

  /**
   * Genehmigte Abwesenheiten je Tag. Der Urlaub steht damit im Wochenplan,
   * nicht nur in der Urlaubsliste — sonst plant man jemanden ein, der weg ist.
   */
  const abwesenheitenProTag = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const absence of data?.absences || []) {
      if (clean(absence.status).toLowerCase() !== "approved") continue;
      const von = clean(absence.start_date).slice(0, 10);
      const bis = clean(absence.end_date || absence.start_date).slice(0, 10);
      if (!von) continue;
      for (const tag of weekDays) {
        if (tag >= von && tag <= (bis || von)) map.set(tag, [...(map.get(tag) || []), absence]);
      }
    }
    return map;
  }, [data?.absences, weekDays]);
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

  if (authLoading) return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-ink-400">Lade Anmeldung…</div></Shell>;
  if (!token) return <LoginBox onLogin={handleLogin} />;

  return (
    <Shell>
      <div className="space-y-4 pb-24">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Schichtklar Admin</p>
            <h1 className="text-3xl font-bold">Planungszentrale</h1>
            <p className="mt-1 text-xs text-ink-400">Einsätze anlegen, verteilen und Serien pflegen.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openNew(weekDays.includes(today) ? today : weekDays[0])} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-bold text-white">
              + Neuer Einsatz
            </button>
            <button onClick={logout} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-3 text-xs font-bold text-ink-600">Logout</button>
          </div>
        </header>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {message && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">{message}</p>}
        {loading && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">Aktualisiere Daten…</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard title="Diese Woche" value={weekTasks.length} caption="Termine" />
          <StatCard title="Planzeit" value={hoursLabel(weekMinutes)} caption="in dieser Woche" />
          <StatCard title="Offen" value={unassignedTasks.length} caption="ohne Mitarbeiter" />
          <StatCard title="Serien" value={seriesGroups.length} caption="laufende Wiederholungen" />
        </div>

        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kunde, Objekt, Mitarbeiter suchen…" className={inputClass} />

        <section className="rounded-2xl border border-paper-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">Wochenplan</p>
              <p className="text-xs text-ink-400">{dateText(weekDays[0])} bis {dateText(weekDays[6])}</p>
            </div>
            <button onClick={() => load()} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-bold text-brand-700">Neu laden</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setWeekStart(iso(addDays(parseIso(weekStart), -7)))} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-bold text-ink-600">← Woche</button>
            <button onClick={() => setWeekStart(weekStartIso())} className="rounded-2xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">Heute</button>
            <button onClick={() => setWeekStart(iso(addDays(parseIso(weekStart), 7)))} className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-xs font-bold text-ink-600">Woche →</button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {weekDays.map((day) => {
              const dayTasks = weekTasks.filter((task) => task.task_date === day);
              const isToday = day === today;
              return (
                <div key={day} className={`rounded-2xl border p-3 ${isToday ? "border-brand-500/40 bg-brand-50" : "border-paper-200 bg-paper-100/80"}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-bold">{dateText(day)}</p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-ink-500">{dayTasks.length}</span>
                      <button onClick={() => openNew(day)} aria-label={`Einsatz am ${dateText(day)} anlegen`} className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-[18px] font-bold leading-none text-white">
                        +
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(abwesenheitenProTag.get(day) || []).map((absence) => (
                      <div key={`abwesend-${absence.id}`} className="rounded-2xl border border-amber-300 bg-amber-50 p-3">
                        <p className="text-sm font-bold text-amber-800">
                          {clean(absence.employee_name) || "Mitarbeiter"} ist nicht da
                        </p>
                        <p className="text-xs text-amber-700">
                          {clean(absence.request_type || absence.absence_type) || "Abwesenheit"}
                          {" · "}
                          {dateText(absence.start_date)} bis {dateText(absence.end_date || absence.start_date)}
                          {Number(absence.credited_minutes) > 0 ? ` · ${hoursLabel(Number(absence.credited_minutes))} gutgeschrieben` : ""}
                        </p>
                      </div>
                    ))}

                    {dayTasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-paper-300 bg-white p-3">
                        <button onClick={() => openEdit(task)} className="block w-full text-left">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">{task.start_time || "—"} · {task.title || "Einsatz"}</p>
                              <p className="truncate text-xs text-ink-400">{taskPlace(task)}</p>
                              <p className="mt-1 truncate text-xs text-ink-400">{task.employee_name || "Ohne Mitarbeiter"}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${activeStatus(task) ? "bg-brand-100 text-brand-700" : "bg-paper-300 text-ink-600"}`}>{task.status || (task.done ? "done" : "open")}</span>
                          </div>
                        </button>
                        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                          <select value={assignments[task.id] ?? clean(task.employee_name)} onChange={(event) => setAssignments({ ...assignments, [task.id]: event.target.value })} className={inputClass}>
                            <option value="">Ohne Mitarbeiter</option>
                            {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
                          </select>
                          <button disabled={saving} onClick={() => patch({ type: "task_assign", id: task.id, employee_name: assignments[task.id] ?? clean(task.employee_name) }, "Einsatz wurde zugewiesen.")} className="rounded-2xl bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-50">OK</button>
                        </div>
                      </div>
                    ))}
                    {!dayTasks.length && (
                      <button onClick={() => openNew(day)} className="w-full rounded-2xl border border-dashed border-paper-300 bg-white p-3 text-sm text-ink-400">
                        Nichts geplant. Hier tippen zum Anlegen.
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-paper-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">Nicht zugewiesen</p>
              <p className="text-xs text-ink-400">Diese Einsätze müssen noch verteilt werden.</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700">{filteredUnassigned.length}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredUnassigned.slice(0, 25).map((task) => (
              <div key={task.id} className="rounded-2xl border border-paper-300 bg-paper-100 p-3">
                <button onClick={() => openEdit(task)} className="block w-full text-left">
                  <p className="font-bold">{dateText(task.task_date)} · {task.start_time || "—"} - {task.end_time || "—"}</p>
                  <p className="text-sm text-ink-600">{task.title || "Einsatz"}</p>
                  <p className="text-xs text-ink-400">{taskPlace(task)} · {hoursLabel(minutesFromTask(task))}</p>
                </button>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <select value={assignments[task.id] || ""} onChange={(event) => setAssignments({ ...assignments, [task.id]: event.target.value })} className={inputClass}>
                    <option value="">Mitarbeiter wählen</option>
                    {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
                  </select>
                  <button disabled={saving || !assignments[task.id]} onClick={() => patch({ type: "task_assign", id: task.id, employee_name: assignments[task.id] }, "Einsatz wurde zugewiesen.")} className="rounded-2xl bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-50">Zuweisen</button>
                </div>
              </div>
            ))}
            {!filteredUnassigned.length && <EmptyCard title="Keine offenen Verteilungen" text="Alle kommenden Einsätze haben bereits einen Mitarbeiter." />}
          </div>
        </section>

        <section className="rounded-2xl border border-paper-200 bg-white p-4">
          <div className="mb-3">
            <p className="font-bold">Serienverwaltung</p>
            <p className="text-xs text-ink-400">Hier ändere ich ganze Jahresplanungen oder Serien ab heute.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredSeries.map((series) => {
              const edit = edits[series.id] || {};
              const assigned = assignments[series.id] ?? (series.employees.length === 1 ? series.employees[0] : "");
              return (
                <div key={series.id} className="rounded-3xl border border-brand-500/20 bg-brand-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{series.first.title || "Einsatz-Serie"}</p>
                      <p className="mt-1 text-xs text-brand-700/80">{taskPlace(series.first)}</p>
                      <p className="mt-1 text-xs text-ink-400">{series.days || "Tage offen"} · {series.first.start_time || "—"} - {series.first.end_time || "—"}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-paper-100 px-3 py-1 text-[11px] font-bold text-brand-700">{series.count} Termine</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-2xl bg-paper-100 p-2"><p className="text-ink-400">Von</p><p className="font-bold">{dateText(series.from)}</p></div>
                    <div className="rounded-2xl bg-paper-100 p-2"><p className="text-ink-400">Bis</p><p className="font-bold">{dateText(series.to)}</p></div>
                    <div className="rounded-2xl bg-paper-100 p-2"><p className="text-ink-400">Offen</p><p className="font-bold">{series.open}</p></div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <select value={assigned} onChange={(event) => setAssignments({ ...assignments, [series.id]: event.target.value })} className={inputClass}>
                      <option value="">Ohne Mitarbeiter</option>
                      {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{labelEmployee(employee)}</option>)}
                    </select>
                    <button disabled={saving} onClick={() => patch({ type: "series_assign", recurrence_group_id: series.id, employee_name: assigned, scope: "future", from_date: today }, "Serie wurde ab heute zugewiesen.")} className="w-full rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white disabled:opacity-50">Serie ab heute zuweisen</button>
                  </div>
                  <details className="mt-3 rounded-2xl border border-paper-300 bg-paper-100 p-3">
                    <summary className="cursor-pointer text-sm font-bold text-brand-700">Serie bearbeiten</summary>
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Start"><input type="time" value={edit.start_time ?? clean(series.first.start_time)} onChange={(event) => setEdits({ ...edits, [series.id]: { ...edit, start_time: event.target.value } })} className={inputClass} /></Field>
                        <Field label="Ende"><input type="time" value={edit.end_time ?? clean(series.first.end_time)} onChange={(event) => setEdits({ ...edits, [series.id]: { ...edit, end_time: event.target.value } })} className={inputClass} /></Field>
                      </div>
                      <Field label="Planminuten"><input type="number" value={edit.planned_minutes ?? String(series.minutes || "")} onChange={(event) => setEdits({ ...edits, [series.id]: { ...edit, planned_minutes: event.target.value } })} className={inputClass} /></Field>
                      <button disabled={saving} onClick={() => patch({ type: "series_update", recurrence_group_id: series.id, scope: "future", from_date: today, employee_name: assigned, start_time: edit.start_time ?? series.first.start_time, end_time: edit.end_time ?? series.first.end_time, planned_minutes: edit.planned_minutes ?? series.minutes }, "Serie wurde ab heute geändert.")} className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">Änderungen ab heute speichern</button>
                      <div className="grid grid-cols-2 gap-2">
                        <button disabled={saving} onClick={() => patch({ type: "series_status", recurrence_group_id: series.id, scope: "future", from_date: today, status: "paused", done: true }, "Serie wurde ab heute pausiert.")} className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-700 disabled:opacity-50">Pausieren</button>
                        <button disabled={saving} onClick={() => patch({ type: "series_status", recurrence_group_id: series.id, scope: "future", from_date: today, status: "open", done: false }, "Serie wurde ab heute geöffnet.")} className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-3 text-xs font-bold text-brand-700 disabled:opacity-50">Öffnen</button>
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

      {sheetOpen && (
        <TaskSheet
          form={taskForm}
          setForm={setTaskForm}
          data={data}
          saving={saving}
          onClose={() => setSheetOpen(false)}
          onSubmit={saveTask}
          onCancelTask={cancelTask}
        />
      )}
    </Shell>
  );
}
