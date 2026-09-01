"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Einsatzplaner: eine Zeile je Mitarbeiter, eine Spalte je Tag.
 *
 * Man sieht auf einen Blick, wer wann wo ist — und wer eine leere Woche hat.
 * Die Wochenansicht in der Planungszentrale zeigt dieselben Einsätze nach
 * Tagen; hier stehen sie nach Personen, weil die Frage beim Planen meistens
 * "wer kann das noch machen" lautet.
 *
 * Ein Einsatz ist ein Blocker: Objekt, Tag, Zeitvorgabe. Uhrzeiten sind
 * freiwillig, gestempelt wird am Objekt. Steht kein Fenster drin, zeigt die
 * Karte die Dauer.
 */

type Row = Record<string, any>;

const AUFTRAGSARTEN = ["Unterhaltsreinigung", "Treppenhausreinigung", "Grundreinigung", "Glasreinigung", "Sonderreinigung"];

const weekdayOptions = [
  { value: "1", label: "Mo" }, { value: "2", label: "Di" }, { value: "3", label: "Mi" },
  { value: "4", label: "Do" }, { value: "5", label: "Fr" }, { value: "6", label: "Sa" }, { value: "0", label: "So" }
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function iso(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function parseIso(text: string) {
  return new Date(`${text}T12:00:00`);
}

function addDays(datum: Date, tage: number) {
  const naechster = new Date(datum);
  naechster.setDate(naechster.getDate() + tage);
  return naechster;
}

function montagVon(text: string) {
  const datum = parseIso(text);
  const tag = datum.getDay();
  return iso(addDays(datum, tag === 0 ? -6 : 1 - tag));
}

function kalenderwoche(text: string) {
  const datum = parseIso(text);
  const ziel = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const wochentag = ziel.getUTCDay() || 7;
  ziel.setUTCDate(ziel.getUTCDate() + 4 - wochentag);
  const jahresanfang = new Date(Date.UTC(ziel.getUTCFullYear(), 0, 1));
  return Math.ceil(((ziel.getTime() - jahresanfang.getTime()) / 86400000 + 1) / 7);
}

function minutesBetween(start: string, end: string) {
  if (!/^\d{2}:\d{2}/.test(start) || !/^\d{2}:\d{2}/.test(end)) return 0;
  const a = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  let b = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));
  if (b < a) b += 1440;
  return Math.max(0, b - a);
}

function planMinuten(task: Row) {
  const direkt = Number(task.planned_minutes || task.max_minutes || task.paid_minutes || task.wage_minutes || 0);
  if (Number.isFinite(direkt) && direkt > 0) return Math.round(direkt);
  return minutesBetween(clean(task.start_time).slice(0, 5), clean(task.end_time).slice(0, 5));
}

function stundenText(minuten: number) {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Was auf der Karte oben steht: Zeitfenster wenn eines da ist, sonst die Dauer. */
function zeitText(task: Row) {
  const von = clean(task.start_time).slice(0, 5);
  const bis = clean(task.end_time).slice(0, 5);
  if (von && bis) return `${von} → ${bis}`;
  if (von) return `ab ${von}`;
  return `${stundenText(planMinuten(task))} Std.`;
}

function aktiv(task: Row) {
  const status = clean(task.status || "open").toLowerCase();
  return !task.done && !["done", "cancelled", "storniert"].includes(status);
}

const feldClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

function Feld({ label, pflicht, hinweis, children }: { label: string; pflicht?: boolean; hinweis?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-ink-500">{label}{pflicht ? <span className="text-danger-500"> *</span> : null}</span>
      <div className="mt-1.5">{children}</div>
      {hinweis ? <span className="mt-1 block text-[12px] text-ink-400">{hinweis}</span> : null}
    </label>
  );
}

const leererEinsatz: Row = {
  id: "",
  work_site_id: "",
  customer_id: "",
  title: "Unterhaltsreinigung",
  task_date: "",
  planned_minutes: "120",
  mit_fenster: false,
  window_binding: false,
  start_time: "",
  end_time: "",
  employee_name: "",
  notes: "",
  notify_employee: true,
  repeat_mode: "none",
  recurrence_interval: "1",
  recurrence_end_date: "",
  recurrence_days: [] as string[]
};

export default function EinsatzplanerSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<Row | null>(null);

  const heute = iso(new Date());
  const [start, setStart] = useState(() => montagVon(iso(new Date())));
  const [suche, setSuche] = useState("");
  const [nurUnbesetzt, setNurUnbesetzt] = useState(false);
  const [maxProTag, setMaxProTag] = useState(2);

  const [blattOffen, setBlattOffen] = useState(false);
  const [form, setForm] = useState<Row>({ ...leererEinsatz });

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/mobile/admin/dashboard", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Planung konnte nicht geladen werden.");
      setData(ergebnis);
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Planung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: sitzung } = await supabase.auth.getSession();
      const sessionToken = sitzung.session?.access_token || "";
      setToken(sessionToken);
      setAuthLoading(false);
      if (sessionToken) await load(sessionToken);
    }
    init();
  }, [load]);

  const tage = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(addDays(parseIso(start), i))), [start]);
  const mitarbeiter = useMemo(() => ((data?.employees || []) as Row[]).filter((row) => clean(row.name) && row.active !== false), [data?.employees]);
  const objekte = useMemo(() => (data?.workSites || []) as Row[], [data?.workSites]);

  const einsaetze = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    return ((data?.tasks || []) as Row[]).filter((task) => {
      if (!tage.includes(clean(task.task_date).slice(0, 10))) return false;
      if (nurUnbesetzt && clean(task.employee_name)) return false;
      if (!needle) return true;
      return `${clean(task.title)} ${clean(task.site)} ${clean(task.customer_name)} ${clean(task.employee_name)}`.toLowerCase().includes(needle);
    });
  }, [data?.tasks, tage, suche, nurUnbesetzt]);

  const unbesetzt = useMemo(() => einsaetze.filter((task) => !clean(task.employee_name) && aktiv(task)), [einsaetze]);

  function einsaetzeVon(name: string, tag: string) {
    return einsaetze
      .filter((task) => clean(task.employee_name) === name && clean(task.task_date).slice(0, 10) === tag)
      .sort((a, b) => clean(a.start_time).localeCompare(clean(b.start_time)));
  }

  function wochenMinuten(name: string) {
    return einsaetze.filter((task) => clean(task.employee_name) === name).reduce((summe, task) => summe + planMinuten(task), 0);
  }

  function neuerEinsatz(tag: string, name = "") {
    setForm({ ...leererEinsatz, task_date: tag, employee_name: name });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  function bearbeiten(task: Row) {
    setForm({
      ...leererEinsatz,
      id: task.id,
      work_site_id: clean(task.work_site_id),
      customer_id: clean(task.customer_id),
      title: clean(task.title) || "Einsatz",
      task_date: clean(task.task_date).slice(0, 10),
      planned_minutes: String(planMinuten(task) || ""),
      mit_fenster: Boolean(clean(task.start_time) || clean(task.end_time)),
      window_binding: task.window_binding === true,
      start_time: clean(task.start_time).slice(0, 5),
      end_time: clean(task.end_time).slice(0, 5),
      employee_name: clean(task.employee_name),
      notes: clean(task.notes),
      repeat_mode: ""
    });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  async function speichern(weitere = false) {
    if (!clean(form.work_site_id)) { setError("Bitte ein Objekt wählen."); return; }
    if (!clean(form.task_date)) { setError("Bitte einen Tag wählen."); return; }
    if (!Number(form.planned_minutes)) { setError("Bitte eine Zeitvorgabe eintragen."); return; }

    setSaving(true);
    setError(null);
    try {
      const objekt = objekte.find((row) => row.id === clean(form.work_site_id));
      const antwort = await fetch("/api/mobile/admin/dashboard", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, type: "task", site: clean(objekt?.name), customer_id: clean(objekt?.customer_id) || form.customer_id })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");

      const anzahl = Number(ergebnis.count || 0);
      setMessage(form.id ? "Einsatz geändert." : anzahl > 1 ? `${anzahl} Einsätze angelegt.` : "Einsatz angelegt.");
      if (weitere) setForm({ ...leererEinsatz, task_date: form.task_date, work_site_id: form.work_site_id });
      else setBlattOffen(false);
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function zuweisen(task: Row, name: string) {
    setSaving(true);
    try {
      await fetch("/api/mobile/admin/planning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "task_assign", id: task.id, employee_name: name })
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  function wochentageUmschalten(wert: string) {
    const aktuelle = Array.isArray(form.recurrence_days) ? form.recurrence_days.map(String) : [];
    setForm({ ...form, recurrence_days: aktuelle.includes(wert) ? aktuelle.filter((eintrag) => eintrag !== wert) : [...aktuelle, wert] });
  }

  if (authLoading) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Lade Anmeldung…</main>;
  if (!token) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</main>;

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="px-4 py-5 md:px-6 xl:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
              <UiIcon name="calendar" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Einsatzplaner</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/mitarbeiter/admin/tageszentrale" className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700">Einsatzübersicht</a>
            <a href="/mitarbeiter/admin/planung" className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700">Serien</a>
            <button onClick={() => neuerEinsatz(tage.includes(heute) ? heute : tage[0])} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white">+ Einsatz erstellen</button>
          </div>
        </header>

        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{message}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-paper-300 bg-white">
            <button onClick={() => setStart(iso(addDays(parseIso(start), -7)))} className="px-3 py-2.5 text-ink-600" aria-label="Woche zurück"><UiIcon name="chevronLeft" className="h-4 w-4" /></button>
            <button onClick={() => setStart(montagVon(heute))} className="border-x border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700">Heute</button>
            <button onClick={() => setStart(iso(addDays(parseIso(start), 7)))} className="px-3 py-2.5 text-ink-600" aria-label="Woche vor"><UiIcon name="chevronRight" className="h-4 w-4" /></button>
          </div>
          <span className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] text-ink-700">KW {kalenderwoche(start)}</span>
          <div className="flex w-full max-w-[260px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
            <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-paper-300 bg-white px-3.5 py-2.5">
            <input type="checkbox" checked={nurUnbesetzt} onChange={(e) => setNurUnbesetzt(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            <span className="text-[14px] text-ink-700">Nur unbesetzte</span>
          </label>
          <select value={maxProTag} onChange={(e) => setMaxProTag(Number(e.target.value))} className="rounded-xl border border-paper-300 bg-white px-3 py-2.5 text-[14px] text-ink-700 outline-none">
            <option value={2}>2 je Tag zeigen</option>
            <option value={4}>4 je Tag zeigen</option>
            <option value={99}>Alle zeigen</option>
          </select>
        </div>

        {/* Unbesetzte Einsätze der Woche */}
        {unbesetzt.length ? (
          <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-[15px] font-bold text-amber-900">{unbesetzt.length} Einsätze ohne Mitarbeiter</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {unbesetzt.map((task) => (
                <div key={task.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <p className="text-[13px] text-ink-400">{new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(parseIso(clean(task.task_date)))} · {zeitText(task)}</p>
                  <p className="truncate text-[15px] font-semibold">{clean(task.site) || clean(task.customer_name) || "Ohne Objekt"}</p>
                  <select
                    value=""
                    onChange={(e) => e.target.value && zuweisen(task, e.target.value)}
                    disabled={saving}
                    className="mt-2 w-full rounded-lg border border-paper-300 px-3 py-2 text-[14px] outline-none"
                  >
                    <option value="">Mitarbeiter zuweisen…</option>
                    {mitarbeiter.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Wochenraster: Zeile je Mitarbeiter */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
          <div style={{ minWidth: "1120px" }}>
            <div className="flex border-b border-paper-200">
              <div className="w-[220px] shrink-0 px-4 py-3">
                <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Mitarbeiter</p>
                <p className="text-[12px] text-brand-600">KW {kalenderwoche(start)}</p>
              </div>
              {tage.map((tag) => {
                const datum = parseIso(tag);
                const wochenende = datum.getDay() === 0 || datum.getDay() === 6;
                return (
                  <div key={tag} className={cx("flex-1 border-l border-paper-200 px-2 py-3 text-center", wochenende && "bg-paper-100", tag === heute && "bg-brand-50")}>
                    <p className={cx("text-[13px] font-semibold", tag === heute ? "text-brand-700" : "text-ink-700")}>
                      {new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(datum)}, {datum.getDate()}.
                    </p>
                  </div>
                );
              })}
            </div>

            {mitarbeiter.map((person) => {
              const name = clean(person.name);
              const minuten = wochenMinuten(name);
              const soll = Number(person.monthly_hour_limit || 0) ? Number(person.monthly_hour_limit) * 60 / 4.33 : 0;
              const anteil = soll > 0 ? Math.min(100, Math.round((minuten / soll) * 100)) : 0;
              return (
                <div key={person.id} className="flex border-b border-paper-200 last:border-0">
                  <div className="w-[220px] shrink-0 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                        {name.split(" ").filter(Boolean).map((teil) => teil[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{name}</span>
                    </div>
                    <p className="mt-2 text-[12px] text-ink-400">{stundenText(minuten)} Std. in dieser Woche</p>
                    {soll > 0 ? (
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-paper-200">
                        <span className={cx("block h-1.5 rounded-full", anteil > 100 ? "bg-danger-500" : "bg-brand-600")} style={{ width: `${anteil}%` }} />
                      </span>
                    ) : null}
                  </div>

                  {tage.map((tag) => {
                    const eigene = einsaetzeVon(name, tag);
                    const datum = parseIso(tag);
                    const wochenende = datum.getDay() === 0 || datum.getDay() === 6;
                    return (
                      <div key={tag} className={cx("min-h-[92px] flex-1 border-l border-paper-200 p-1.5", wochenende && "bg-paper-100/60", tag === heute && "bg-brand-50/40")}>
                        {eigene.slice(0, maxProTag).map((task) => (
                          <button
                            key={task.id}
                            onClick={() => bearbeiten(task)}
                            className={cx(
                              "mb-1.5 block w-full rounded-md border-l-[3px] bg-white px-2 py-1.5 text-left shadow-sm",
                              aktiv(task) ? "border-brand-600" : "border-paper-300 opacity-60"
                            )}
                          >
                            <span className="block text-[11px] text-ink-400">{zeitText(task)}</span>
                            <span className="block truncate text-[12px] font-semibold text-ink-900">{clean(task.site) || clean(task.customer_name) || "Ohne Objekt"}</span>
                            <span className="mt-0.5 inline-block truncate rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              {clean(task.title) || "Einsatz"}
                            </span>
                          </button>
                        ))}
                        {eigene.length > maxProTag ? (
                          <button onClick={() => setMaxProTag(99)} className="w-full rounded-md px-2 py-1 text-left text-[11px] text-brand-700">
                            + weitere {eigene.length - maxProTag}
                          </button>
                        ) : null}
                        {!eigene.length ? (
                          <button onClick={() => neuerEinsatz(tag, name)} className="grid h-full min-h-[70px] w-full place-items-center rounded-md text-[18px] text-ink-200 hover:bg-paper-100 hover:text-brand-600">
                            +
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {!mitarbeiter.length && !loading ? <p className="px-4 py-10 text-center text-[14px] text-ink-400">Keine aktiven Mitarbeiter.</p> : null}
          </div>
        </div>
      </div>

      {blattOffen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setBlattOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <p className="text-[19px] font-bold">{form.id ? "Einsatz ändern" : "Einsatz erstellen"}</p>
              <button onClick={() => setBlattOffen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <Feld label="Objekt" pflicht>
                <select value={form.work_site_id} onChange={(e) => setForm({ ...form, work_site_id: e.target.value })} className={feldClass}>
                  <option value="">Objekt auswählen</option>
                  {objekte.map((objekt) => <option key={objekt.id} value={objekt.id}>{clean(objekt.name)}</option>)}
                </select>
              </Feld>

              <Feld label="Auftrag" pflicht>
                <input list="auftragsarten" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={feldClass} />
                <datalist id="auftragsarten">
                  {AUFTRAGSARTEN.map((art) => <option key={art} value={art} />)}
                </datalist>
              </Feld>

              {!form.id ? (
                <div className="flex overflow-hidden rounded-xl border border-paper-300">
                  <button onClick={() => setForm({ ...form, repeat_mode: "none" })} className={cx("flex-1 px-4 py-2.5 text-[14px]", clean(form.repeat_mode) !== "weekly" ? "bg-brand-600 font-semibold text-white" : "bg-white text-ink-600")}>Einmalig</button>
                  <button onClick={() => setForm({ ...form, repeat_mode: "weekly" })} className={cx("flex-1 px-4 py-2.5 text-[14px]", clean(form.repeat_mode) === "weekly" ? "bg-brand-600 font-semibold text-white" : "bg-white text-ink-600")}>Wiederholend</button>
                </div>
              ) : null}

              <div className="rounded-2xl border border-paper-200 bg-paper-100/70 p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Feld label="Termin" pflicht>
                    <input type="date" value={clean(form.task_date)} onChange={(e) => setForm({ ...form, task_date: e.target.value })} className={feldClass} />
                  </Feld>
                  <Feld label="Zeitvorgabe in Minuten" pflicht hinweis="Wie lange der Einsatz dauern soll.">
                    <input type="number" min="0" step="5" value={form.planned_minutes} onChange={(e) => setForm({ ...form, planned_minutes: e.target.value })} className={feldClass} />
                  </Feld>
                </div>

                {/*
                  Uhrzeiten sind freiwillig. Gestempelt wird ueber den Aufkleber
                  am Objekt, wann jemand kommt, entscheidet er selbst. Nur wo
                  der Kunde eine Uhrzeit erwartet, wird ein Fenster gesetzt.
                */}
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(form.mit_fenster)}
                    onChange={(e) => setForm({ ...form, mit_fenster: e.target.checked, start_time: e.target.checked ? form.start_time : "", end_time: e.target.checked ? form.end_time : "", window_binding: e.target.checked ? form.window_binding : false })}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold text-ink-800">Zeitfenster vorgeben</span>
                    <span className="block text-[13px] text-ink-400">Nur nötig, wenn der Kunde eine Uhrzeit erwartet.</span>
                  </span>
                </label>

                {form.mit_fenster ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Feld label="Frühestens ab"><input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={feldClass} /></Feld>
                      <Feld label="Spätestens bis"><input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={feldClass} /></Feld>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={Boolean(form.window_binding)} onChange={(e) => setForm({ ...form, window_binding: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                      <span className="text-[13px] text-ink-600">Fenster einhalten — außerhalb wird in der Zeitenfreigabe angezeigt</span>
                    </label>
                  </div>
                ) : null}

                <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3.5 py-3">
                  <span className="text-[14px] text-ink-600">Lohnzeit</span>
                  <span className="text-[17px] font-semibold">{stundenText(Number(form.planned_minutes) || 0)} Std.</span>
                </div>
              </div>

              {!form.id && clean(form.repeat_mode) === "weekly" ? (
                <div className="rounded-2xl border border-paper-200 p-3">
                  <p className="mb-2 text-[13px] font-semibold text-ink-700">An diesen Tagen</p>
                  <div className="grid grid-cols-7 gap-1">
                    {weekdayOptions.map((tag) => {
                      const gesetzt = Array.isArray(form.recurrence_days) && form.recurrence_days.map(String).includes(tag.value);
                      return (
                        <button key={tag.value} type="button" onClick={() => wochentageUmschalten(tag.value)} className={cx("rounded-lg border px-2 py-2 text-[12px] font-bold", gesetzt ? "border-brand-500 bg-brand-600 text-white" : "border-paper-300 text-ink-600")}>
                          {tag.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <Feld label="Bis zum" pflicht>
                      <input type="date" value={clean(form.recurrence_end_date)} onChange={(e) => setForm({ ...form, recurrence_end_date: e.target.value })} className={feldClass} />
                    </Feld>
                  </div>
                </div>
              ) : null}

              <Feld label="Mitarbeiter">
                <select value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} className={feldClass}>
                  <option value="">Noch niemand, später zuweisen</option>
                  {mitarbeiter.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                </select>
              </Feld>

              <Feld label="Kommentar">
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={feldClass} />
              </Feld>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-paper-200 px-5 py-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.notify_employee !== false} onChange={(e) => setForm({ ...form, notify_employee: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                <span className="text-[14px] text-ink-600">Mitarbeiter benachrichtigen</span>
              </label>
              <span className="flex-1" />
              {!form.id ? (
                <button onClick={() => speichern(true)} disabled={saving} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">Weiteren erstellen</button>
              ) : null}
              <button onClick={() => speichern(false)} disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60">
                {saving ? "Speichere…" : form.id ? "Speichern" : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
