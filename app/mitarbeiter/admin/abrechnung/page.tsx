"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Row = Record<string, any>;

type BillingCustomer = {
  key: string;
  customerId: string | null;
  customerName: string;
  customerNumber: string | null;
  address: string | null;
  taskCount: number;
  doneTasks: number;
  openTasks: number;
  plannedMinutes: number;
  actualMinutes: number;
  billableMinutes: number;
  signedReports: number;
  employees: string[];
  sites: string[];
  warnings: string[];
  tasks: Row[];
  timeEntries: Row[];
  serviceReports: Row[];
};

type BillingData = {
  ok: boolean;
  error?: string;
  month: string;
  start: string;
  end: string;
  hourlyRate: number;
  customers: BillingCustomer[];
  totals: {
    taskCount: number;
    doneTasks: number;
    openTasks: number;
    plannedMinutes: number;
    actualMinutes: number;
    billableMinutes: number;
    signedReports: number;
    netAmount: number;
  };
  csv: string;
};

const now = new Date();
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const inputClass = "w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function hours(minutes: number) {
  const value = Math.round((minutes / 60) * 100) / 100;
  return `${value.toLocaleString("de-DE")} h`;
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value || 0);
}

function dateText(value: unknown) {
  const text = clean(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "—";
  const date = new Date(`${text}T12:00:00`);
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function dateTimeText(value: unknown) {
  const text = clean(value);
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function taskTime(task: Row) {
  const start = clean(task.start_time);
  const end = clean(task.end_time);
  if (start && end) return `${start} - ${end}`;
  return start || end || "ohne Uhrzeit";
}

function statusText(task: Row) {
  const status = clean(task.status || (task.done ? "done" : "open")).toLowerCase();
  if (task.done || ["done", "erledigt", "completed"].includes(status)) return "erledigt";
  if (["paused", "pause"].includes(status)) return "pausiert";
  return "offen";
}

function monthLabel(month: string) {
  const date = new Date(`${month}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date);
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function StatCard({ title, value, caption }: { title: string; value: string | number; caption: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{caption}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-800 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-bold text-slate-100">{value}</span>
    </div>
  );
}

function CustomerCard({ customer, hourlyRate }: { customer: BillingCustomer; hourlyRate: number }) {
  const [open, setOpen] = useState(false);
  const netAmount = (customer.billableMinutes / 60) * hourlyRate;
  const latestTasks = customer.tasks.slice(0, 8);
  const latestEntries = customer.timeEntries.slice(-8).reverse();

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
      <button onClick={() => setOpen((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-white">{customer.customerName}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{customer.customerNumber ? `Kdnr. ${customer.customerNumber} · ` : ""}{customer.address || "keine Adresse"}</p>
        </div>
        <div className="rounded-2xl bg-blue-500/15 px-3 py-2 text-right">
          <p className="text-xs text-blue-200">Netto</p>
          <p className="font-black text-blue-100">{money(netAmount)}</p>
        </div>
      </button>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-slate-950 p-3">
          <p className="text-xs text-slate-500">Abrechenbar</p>
          <p className="font-black text-white">{hours(customer.billableMinutes)}</p>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3">
          <p className="text-xs text-slate-500">Einsätze</p>
          <p className="font-black text-white">{customer.taskCount}</p>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3">
          <p className="text-xs text-slate-500">Plan</p>
          <p className="font-black text-white">{hours(customer.plannedMinutes)}</p>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3">
          <p className="text-xs text-slate-500">Ist</p>
          <p className="font-black text-white">{hours(customer.actualMinutes)}</p>
        </div>
      </div>

      {customer.warnings.length ? (
        <div className="mt-3 space-y-2">
          {customer.warnings.map((warning) => (
            <p key={warning} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100">{warning}</p>
          ))}
        </div>
      ) : null}

      <button onClick={() => setOpen((value) => !value)} className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 py-3 text-sm font-black text-blue-100">
        {open ? "Details schließen" : "Details öffnen"}
      </button>

      {open ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl bg-slate-950 p-3">
            <DetailRow label="Erledigt" value={`${customer.doneTasks}`} />
            <DetailRow label="Offen" value={`${customer.openTasks}`} />
            <DetailRow label="Leistungsnachweise" value={`${customer.signedReports}`} />
            <DetailRow label="Mitarbeiter" value={customer.employees.join(", ") || "—"} />
            <DetailRow label="Objekte" value={customer.sites.slice(0, 4).join(", ") || "—"} />
          </div>

          <div>
            <p className="mb-2 text-sm font-black text-slate-200">Einsätze im Monat</p>
            <div className="space-y-2">
              {latestTasks.length ? latestTasks.map((task) => (
                <div key={task.id || `${task.task_date}-${task.site}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex justify-between gap-2">
                    <p className="font-bold text-white">{clean(task.title) || "Einsatz"}</p>
                    <p className="text-xs text-slate-500">{statusText(task)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{dateText(task.task_date)} · {taskTime(task)} · {clean(task.employee_name) || "ohne Mitarbeiter"}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{clean(task.site || task.work_site_name) || "ohne Objekt"}</p>
                </div>
              )) : <p className="rounded-2xl bg-slate-950 p-3 text-sm text-slate-500">Keine Einsätze in diesem Monat.</p>}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-black text-slate-200">Letzte Stempelungen</p>
            <div className="space-y-2">
              {latestEntries.length ? latestEntries.map((entry) => (
                <div key={entry.id || `${entry.created_at}-${entry.action}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex justify-between gap-2">
                    <p className="font-bold text-white">{clean(entry.employee_name) || "Mitarbeiter"}</p>
                    <p className="text-xs text-slate-500">{clean(entry.action) || "Aktion"}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{dateTimeText(entry.created_at)} · {clean(entry.work_site_name) || "ohne Objekt"}</p>
                </div>
              )) : <p className="rounded-2xl bg-slate-950 p-3 text-sm text-slate-500">Keine Stempelungen in diesem Monat.</p>}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function AdminBillingPage() {
  const [month, setMonth] = useState(defaultMonth);
  const [hourlyRate, setHourlyRate] = useState("35");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Bitte neu einloggen.");
      const params = new URLSearchParams({ month, hourlyRate: hourlyRate || "0" });
      const response = await fetch(`/api/mobile/admin/billing?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const json = (await response.json()) as BillingData;
      if (!response.ok || !json.ok) throw new Error(json.error || "Abrechnung konnte nicht geladen werden.");
      setData(json);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Abrechnung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [month, hourlyRate]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCustomers = useMemo(() => {
    const search = query.trim().toLowerCase();
    const rows = data?.customers || [];
    if (!search) return rows;
    return rows.filter((customer) => [customer.customerName, customer.customerNumber, customer.address, customer.employees.join(" "), customer.sites.join(" ")].join(" ").toLowerCase().includes(search));
  }, [data?.customers, query]);

  const rate = Number(String(hourlyRate).replace(",", ".")) || 0;
  const displayedNet = filteredCustomers.reduce((sum, customer) => sum + (customer.billableMinutes / 60) * rate, 0);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 pb-28 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Admin</p>
            <h1 className="text-2xl font-black">Kundenabrechnung</h1>
            <p className="text-xs text-slate-500">Planzeit, Ist-Zeit und Leistungsnachweise pro Kunde.</p>
          </div>
          <Link href="/mitarbeiter" className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-black text-blue-100">App</Link>
        </div>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="text-xs text-slate-500">Monat</span>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-slate-500">Stundensatz netto</span>
              <input value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} inputMode="decimal" className={inputClass} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-xs text-slate-500">Suchen</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kunde, Objekt oder Mitarbeiter" className={inputClass} />
            </label>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <button onClick={() => void load()} className="rounded-2xl bg-blue-600 px-4 py-3 font-black text-white shadow-glow">Aktualisieren</button>
            <button disabled={!data?.csv} onClick={() => data?.csv && downloadCsv(`cleantrack-abrechnung-${month}.csv`, data.csv)} className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-black text-blue-100 disabled:opacity-50">CSV exportieren</button>
            <Link href="/mitarbeiter/admin/auswertung" className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center font-black text-blue-100">Monatsauswertung</Link>
          </div>
        </section>

        {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
        {loading ? <p className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">Lade Abrechnung…</p> : null}

        {data ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard title="Monat" value={monthLabel(data.month)} caption="Abrechnungszeitraum" />
              <StatCard title="Abrechenbar" value={hours(filteredCustomers.reduce((sum, customer) => sum + customer.billableMinutes, 0))} caption="Ist, sonst Plan" />
              <StatCard title="Netto" value={money(displayedNet)} caption={`${rate.toLocaleString("de-DE")} €/h`} />
              <StatCard title="Offen" value={filteredCustomers.reduce((sum, customer) => sum + customer.openTasks, 0)} caption="offene Einsätze" />
            </div>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <p className="font-black">So lese ich die Abrechnung</p>
              <div className="mt-3 space-y-2 text-sm text-slate-400">
                <p><b className="text-slate-100">Plan</b> kommt aus den angelegten Einsätzen.</p>
                <p><b className="text-slate-100">Ist</b> kommt aus der Stempeluhr.</p>
                <p><b className="text-slate-100">Abrechenbar</b> nimmt Ist-Stunden, wenn Stempelzeiten vorhanden sind. Sonst nimmt die App Planstunden.</p>
              </div>
            </section>

            <div className="space-y-3">
              {filteredCustomers.length ? filteredCustomers.map((customer) => (
                <CustomerCard key={customer.key} customer={customer} hourlyRate={rate} />
              )) : <p className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-500">Für diesen Monat gibt es keine abrechenbaren Daten.</p>}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
