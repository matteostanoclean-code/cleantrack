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

/** Netz darunter: Die Tätigkeiten kommen aus den Einstellungen, Auftragsarten. */
const AUFTRAGSARTEN_ERSATZ = ["Unterhaltsreinigung", "Treppenhausreinigung", "Grundreinigung", "Glasreinigung", "Sonderreinigung"];

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

/**
 * Fällt die Uhrzeit in die Nachtarbeit? 22:00 bis 5:00 nach RTV § 3 Nr. 4.2.
 * Nur für den Hinweis in der Maske — gerechnet wird damit nichts.
 */
function nachtarbeit(zeit: unknown) {
  const text = clean(zeit).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(text)) return false;
  const minuten = Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
  return minuten >= 22 * 60 || minuten < 5 * 60;
}

/**
 * Die vier Tage mit 200 % statt 80 %: 1. Mai, Neujahr, 1. und 2.
 * Weihnachtsfeiertag (RTV § 3 Nr. 4.7 c, "genau diese vier Tage").
 */
function hoherFeiertag(name: unknown) {
  const text = clean(name).toLowerCase();
  return ["neujahr", "tag der arbeit", "1. weihnachtsfeiertag", "2. weihnachtsfeiertag"].some((eintrag) => text.includes(eintrag));
}

/**
 * Der Zeitraum der Woche in Worten: "26. Okt. – 1. Nov. 2026".
 *
 * Steht da, weil der Wochenplan sonst nur Tagesnummern zeigt und man beim
 * Blättern nicht mehr weiß, in welchem Monat man gelandet ist. Liegt die
 * Woche in einem Monat, wird er nur einmal genannt.
 */
function wochenText(tage: string[]) {
  if (!tage.length) return "";
  const von = parseIso(tage[0]);
  const bis = parseIso(tage[tage.length - 1]);
  const monat = (datum: Date) => new Intl.DateTimeFormat("de-DE", { month: "short" }).format(datum);
  if (von.getFullYear() !== bis.getFullYear()) {
    // Über den Jahreswechsel gehören beide Jahre hin, sonst liest man
    // "28. Dez – 3. Jan 2027" und der Dezember wirkt wie 2027.
    return `${von.getDate()}. ${monat(von)} ${von.getFullYear()} – ${bis.getDate()}. ${monat(bis)} ${bis.getFullYear()}`;
  }
  return von.getMonth() === bis.getMonth()
    ? `${von.getDate()}.–${bis.getDate()}. ${monat(bis)} ${bis.getFullYear()}`
    : `${von.getDate()}. ${monat(von)} – ${bis.getDate()}. ${monat(bis)} ${bis.getFullYear()}`;
}

/** 2026-12-24 wird zu 24.12. */
function datumKurz(wert: unknown) {
  const text = clean(wert).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text.slice(8, 10)}.${text.slice(5, 7)}.` : "–";
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
  latest_start: "",
  end_time: "",
  employee_name: "",
  notes: "",
  notify_employee: true,
  repeat_mode: "none",
  recurrence_interval: "1",
  recurrence_end_date: "",
  recurrence_days: [] as string[],
  recurrence_unit: "",
  recurrence_group_id: ""
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
  // Wer bei einem bestehenden Einsatz mithelfen soll.
  const [helfer, setHelfer] = useState("");

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
  const auftragsarten = useMemo(() => {
    const liste = (data?.auftragsarten || []) as string[];
    return liste.length ? liste : AUFTRAGSARTEN_ERSATZ;
  }, [data?.auftragsarten]);

  /**
   * Wann welcher Kunde zu hat.
   *
   * Der Planer kennt die Zeiträume nicht von sich aus — man plant sonst
   * fröhlich eine Reinigung in die Betriebsferien hinein und merkt es erst,
   * wenn jemand vor verschlossener Tür steht.
   */
  const schliessungen = useMemo(() => (data?.schliessungen || []) as Row[], [data?.schliessungen]);

  function geschlossenAm(task: Row, tag: string) {
    const objektId = clean(task.work_site_id);
    const name = clean(task.site);
    return schliessungen.find((zeile) => {
      const passt = objektId && clean(zeile.work_site_id)
        ? clean(zeile.work_site_id) === objektId
        : name && clean(zeile.object_name) === name;
      if (!passt) return false;
      return clean(zeile.von).slice(0, 10) <= tag && tag <= clean(zeile.bis).slice(0, 10);
    }) || null;
  }

  /** Tag → Name des Feiertags. Aus den Einstellungen, Baden-Württemberg. */
  const feiertage = useMemo(() => {
    const karte = new Map<string, string>();
    for (const eintrag of (data?.feiertage || []) as Row[]) {
      const tag = clean(eintrag.datum).slice(0, 10);
      if (tag) karte.set(tag, clean(eintrag.name));
    }
    return karte;
  }, [data?.feiertage]);

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

  /** Die Einsätze dieser Woche, die auf eine Schließzeit fallen. */
  const geschlosseneEinsaetze = useMemo(() => {
    const treffer: { task: Row; zu: Row }[] = [];
    for (const task of einsaetze) {
      if (!aktiv(task)) continue;
      const zu = geschlossenAm(task, clean(task.task_date).slice(0, 10));
      if (zu) treffer.push({ task, zu });
    }
    return treffer.sort((a, b) => clean(a.task.task_date).localeCompare(clean(b.task.task_date)));
    // geschlossenAm liest nur aus schliessungen, deshalb reichen die beiden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [einsaetze, schliessungen]);

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
      mit_fenster: Boolean(clean(task.start_time) || clean(task.end_time) || clean(task.latest_start)),
      window_binding: task.window_binding === true,
      start_time: clean(task.start_time).slice(0, 5),
      latest_start: clean(task.latest_start).slice(0, 5),
      end_time: clean(task.end_time).slice(0, 5),
      employee_name: clean(task.employee_name),
      notes: clean(task.notes),
      // Serienangaben unverändert mitgeben. Wurden sie hier geleert, verlor der
      // Tag beim Speichern seine Serienmerkmale, obwohl nur die Uhrzeit
      // geändert werden sollte.
      repeat_mode: clean(task.repeat_mode) || "none",
      recurrence_unit: clean(task.recurrence_unit),
      recurrence_interval: task.recurrence_interval ?? "",
      recurrence_days: Array.isArray(task.recurrence_days) ? task.recurrence_days : [],
      recurrence_end_date: clean(task.recurrence_end_date).slice(0, 10),
      recurrence_group_id: clean(task.recurrence_group_id)
    });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  /**
   * Denselben Einsatz für eine zweite Person anlegen.
   *
   * Bewusst eine Kopie und kein Feld für mehrere Namen: an jedem Einsatz
   * hängen Stempelzeiten, Freigabe und Lohn einer Person. Zwei Namen in einer
   * Zeile hieße, das alles noch einmal aufzuteilen.
   */
  async function helferAnlegen() {
    if (!form.id || !helfer) return;
    setSaving(true);
    setError(null);
    try {
      // Eigener Weg, damit die Zeitaufteilung dieselbe ist wie beim
      // Dazukommen per Aufkleber.
      const antwort = await fetch("/api/admin/mithilfe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ task_id: form.id, employee_name: helfer })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Helfer konnte nicht angelegt werden.");

      const aufteilung = ergebnis.aufteilung;
      setMessage(
        aufteilung
          ? `${helfer} ist dazugestellt. ${stundenText(aufteilung.gesamt)} Std. sind jetzt auf ${aufteilung.anzahl} Personen aufgeteilt, je ${stundenText(aufteilung.jeweils)} Std.`
          : `${helfer} ist dazugestellt.`
      );
      setHelfer("");
      setBlattOffen(false);
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Helfer konnte nicht angelegt werden.");
    } finally {
      setSaving(false);
    }
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

  /**
   * Einsatz löschen. Ohne Nachfrage, so war es gewünscht — wer die Maske
   * dieses Einsatzes offen hat, meint genau diesen. Der Server lässt zwei
   * Fälle nicht durch: erledigt, und schon gestempelt.
   */
  async function loeschen() {
    if (!form.id) return;
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/mobile/admin/dashboard", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "task", id: form.id })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Löschen fehlgeschlagen.");

      const aufteilung = ergebnis.aufteilung;
      setMessage(
        aufteilung
          ? aufteilung.anzahl === 1
            ? `Einsatz gelöscht. Die ${stundenText(aufteilung.gesamt)} Std. sind wieder vollständig beim verbliebenen Einsatz.`
            : `Einsatz gelöscht. ${stundenText(aufteilung.gesamt)} Std. sind jetzt auf ${aufteilung.anzahl} Personen verteilt.`
          : "Einsatz gelöscht."
      );
      setBlattOffen(false);
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Löschen fehlgeschlagen.");
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
          <span className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] text-ink-700">
            KW {kalenderwoche(start)} <span className="text-ink-400">·</span> {wochenText(tage)}
          </span>
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

        {/*
          Einsätze, die auf eine Schließzeit fallen. Steht vor dem Plan, weil
          es die Frage ist, die man sonst erst am Tag selbst stellt.
        */}
        {geschlosseneEinsaetze.length ? (
          <section className="mt-4 rounded-2xl border border-danger-100 bg-danger-50 p-4">
            <p className="text-[15px] font-bold text-danger-700">
              {geschlosseneEinsaetze.length === 1
                ? "Ein Einsatz liegt in einer Schließzeit"
                : `${geschlosseneEinsaetze.length} Einsätze liegen in einer Schließzeit`}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-500">Der Kunde hat an diesem Tag zu. Verschieben, oder den Eintrag am Objekt korrigieren.</p>
            <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {geschlosseneEinsaetze.map(({ task, zu }) => (
                <li key={task.id}>
                  <button onClick={() => bearbeiten(task)} className="w-full rounded-xl border border-danger-100 bg-white p-3 text-left">
                    <p className="text-[13px] text-ink-400">
                      {new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(parseIso(clean(task.task_date)))}
                      {clean(task.employee_name) ? ` · ${clean(task.employee_name)}` : " · ohne Mitarbeiter"}
                    </p>
                    <p className="truncate text-[15px] font-semibold text-danger-600">{clean(task.site) || clean(task.customer_name) || "Ohne Objekt"}</p>
                    <p className="truncate text-[12px] text-ink-500">
                      {zu.faellt_aus === false ? "eingeschränkt" : "geschlossen"} {datumKurz(zu.von)} bis {datumKurz(zu.bis)}
                      {clean(zu.grund) ? ` · ${clean(zu.grund)}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
          {/*
            220 für die Namensspalte, dazu mindestens 150 je Tag. Enger wird
            der Objektname zu früh abgeschnitten; schmaler als das soll das
            Raster lieber seitlich scrollen, als unleserlich zu werden.
          */}
          <div style={{ minWidth: 220 + 7 * 150 }}>
            <div className="flex border-b border-paper-200">
              <div className="w-[220px] shrink-0 px-4 py-3">
                <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Mitarbeiter</p>
                <p className="text-[12px] text-brand-600">KW {kalenderwoche(start)} · {wochenText(tage)}</p>
              </div>
              {tage.map((tag) => {
                const datum = parseIso(tag);
                const wochenende = datum.getDay() === 0 || datum.getDay() === 6;
                const feiertag = feiertage.get(tag);
                return (
                  /*
                    min-w-0 ist hier Pflicht, nicht Kosmetik: ohne das schrumpft
                    ein Flex-Element nie unter die Breite seines Inhalts. In den
                    Zeilen darunter stehen lange Objektnamen, die Spalten sind
                    dort also unterschiedlich breit geworden — und der Kopf lief
                    gegen die Karten aus dem Tritt.
                  */
                  <div key={tag} className={cx("min-w-0 flex-1 border-l border-paper-200 px-2 py-3 text-center", wochenende && "bg-paper-100", feiertag && "bg-danger-50", tag === heute && "bg-brand-50")}>
                    <p className={cx("text-[13px] font-semibold", feiertag ? "text-danger-600" : tag === heute ? "text-brand-700" : "text-ink-700")}>
                      {new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(datum)}
                    </p>
                    {feiertag ? <p className="truncate text-[11px] font-semibold text-danger-600" title={feiertag}>{feiertag}</p> : null}
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
                    const feiertag = feiertage.has(tag);
                    return (
                      <div key={tag} className={cx("min-h-[92px] min-w-0 flex-1 border-l border-paper-200 p-1.5", wochenende && "bg-paper-100/60", feiertag && "bg-danger-50/50", tag === heute && "bg-brand-50/40")}>
                        {eigene.slice(0, maxProTag).map((task) => {
                          const zu = geschlossenAm(task, tag);
                          return (
                            <button
                              key={task.id}
                              onClick={() => bearbeiten(task)}
                              title={zu ? `${clean(zu.customer_name) || clean(zu.object_name)} hat zu: ${clean(zu.grund) || "Kundenurlaub"}` : undefined}
                              className={cx(
                                "mb-1.5 block w-full rounded-md border-l-[3px] px-2 py-1.5 text-left shadow-sm",
                                zu ? "border-danger-500 bg-danger-50" : "bg-white",
                                aktiv(task) ? !zu && "border-brand-600" : "border-paper-300 opacity-60"
                              )}
                            >
                              <span className="block text-[11px] text-ink-400">{zeitText(task)}</span>
                              <span className={cx("block truncate text-[12px] font-semibold", zu ? "text-danger-600" : "text-ink-900")}>
                                {clean(task.site) || clean(task.customer_name) || "Ohne Objekt"}
                              </span>
                              {zu ? (
                                <span className="mt-0.5 block truncate text-[10px] font-semibold text-danger-600">
                                  {zu.faellt_aus === false ? "Kunde eingeschränkt" : "Kunde hat zu"}
                                  {clean(zu.grund) ? ` · ${clean(zu.grund)}` : ""}
                                </span>
                              ) : (
                                <span className="mt-0.5 inline-block max-w-full truncate rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                  {clean(task.title) || "Einsatz"}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {eigene.length > maxProTag ? (
                          <button onClick={() => setMaxProTag(99)} className="w-full rounded-md px-2 py-1 text-left text-[11px] text-brand-700">
                            + weitere {eigene.length - maxProTag}
                          </button>
                        ) : null}
                        {/*
                          In der leeren Zelle füllt das Plus die ganze Fläche,
                          damit man irgendwo hintippen kann. Steht schon etwas
                          drin, kommt es als schmale Zeile darunter — vorher
                          gab es gar keinen Weg, einen zweiten Einsatz an
                          denselben Tag zu legen.
                        */}
                        <button
                          onClick={() => neuerEinsatz(tag, name)}
                          title="Weiteren Einsatz an diesem Tag"
                          className={cx(
                            "grid w-full place-items-center rounded-md text-ink-200 hover:bg-paper-100 hover:text-brand-600",
                            eigene.length ? "h-6 text-[15px]" : "h-full min-h-[70px] text-[18px]"
                          )}
                        >
                          +
                        </button>
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
                  {auftragsarten.map((art) => <option key={art} value={art} />)}
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

                {/* Ein Einsatz am Feiertag kostet fast das Doppelte. Das gehört
                    vor die Entscheidung, nicht in die Lohnabrechnung. */}
                {feiertage.get(clean(form.task_date)) ? (
                  <p className="mt-3 rounded-xl bg-danger-50 px-3.5 py-3 text-[13px] text-danger-700">
                    {feiertage.get(clean(form.task_date))} — gesetzlicher Feiertag.{" "}
                    {hoherFeiertag(feiertage.get(clean(form.task_date)))
                      ? "Einer der vier Tage mit 200 % Zuschlag (Rahmentarifvertrag Gebäudereinigung, § 3 Nr. 4.7 c)."
                      : "Die Stunden kosten 80 % Zuschlag (Rahmentarifvertrag Gebäudereinigung, § 3 Nr. 4.7 b)."}
                  </p>
                ) : null}

                {/*
                  Uhrzeiten sind freiwillig. Gestempelt wird ueber den Aufkleber
                  am Objekt, wann jemand kommt, entscheidet er selbst. Nur wo
                  der Kunde eine Uhrzeit erwartet, wird ein Fenster gesetzt.
                */}
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(form.mit_fenster)}
                    onChange={(e) => setForm({ ...form, mit_fenster: e.target.checked, start_time: e.target.checked ? form.start_time : "", latest_start: e.target.checked ? form.latest_start : "", end_time: e.target.checked ? form.end_time : "", window_binding: e.target.checked ? form.window_binding : false })}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold text-ink-800">Uhrzeiten vorgeben</span>
                    <span className="block text-[13px] text-ink-400">Ohne das zählt nur die Dauer, angefangen wird, wann es passt.</span>
                  </span>
                </label>

                {form.mit_fenster ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Feld label="Anfangen frühestens ab"><input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={feldClass} /></Feld>
                      <Feld label="Anfangen spätestens um" hinweis="Wer später stempelt, kommt in die Zeitenfreigabe.">
                        <input type="time" value={form.latest_start} onChange={(e) => setForm({ ...form, latest_start: e.target.value })} className={feldClass} />
                      </Feld>
                    </div>
                    <Feld label="Fertig spätestens bis" hinweis="Nur nötig, wenn der Kunde das so erwartet.">
                      <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={feldClass} />
                    </Feld>

                    {/*
                      Der Grund, warum der späteste Beginn überhaupt existiert:
                      ab 22:00 Uhr wird derselbe Einsatz teurer.
                    */}
                    {[form.start_time, form.latest_start, form.end_time].some(nachtarbeit) ? (
                      <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800">
                        Ab 22:00 Uhr ist das Nachtarbeit: 30 % Zuschlag auf diese Stunden (Rahmentarifvertrag Gebäudereinigung, § 3 Nr. 4.2 und 4.7).
                      </p>
                    ) : null}

                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" checked={Boolean(form.window_binding)} onChange={(e) => setForm({ ...form, window_binding: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
                      <span className="text-[13px] text-ink-600">Auch zu früh anfangen und zu spät fertig werden in der Zeitenfreigabe zeigen</span>
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

              {/*
                Gehört der Einsatz zu einer Serie, soll das hier stehen. Sonst
                ändert man denselben Fehler zwanzigmal einzeln nach, obwohl ein
                Griff in der Serienverwaltung gereicht hätte.
              */}
              {form.id && clean(form.recurrence_group_id) ? (
                <div className="rounded-xl border border-paper-200 bg-paper-100/70 p-4">
                  <p className="text-[14px] font-semibold text-ink-800">Dieser Einsatz gehört zu einer Serie</p>
                  <p className="mt-0.5 text-[13px] text-ink-500">
                    Was du hier änderst, gilt nur für diesen einen Tag. Tätigkeit, Zeiten, Wochentage oder den Mitarbeiter für alle künftigen Termine änderst du in der Serienverwaltung.
                  </p>
                  <a
                    href={`/mitarbeiter/admin/planung?serie=${encodeURIComponent(clean(form.recurrence_group_id))}`}
                    className="mt-3 inline-block rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700"
                  >
                    Ganze Serie ändern
                  </a>
                </div>
              ) : null}

              {/*
                Helfer dazu. Ein Einsatz hängt an genau einer Person — wenn
                zwei hinfahren, braucht es zwei Einsätze. Das von Hand zweimal
                einzutippen vergisst man, und dann fehlen die Stunden des
                Zweiten in Lohn und Auswertung.
              */}
              {form.id ? (
                <div className="rounded-xl border border-paper-200 p-4">
                  <p className="text-[15px] font-semibold text-ink-900">Helfer dazu</p>
                  <p className="mt-0.5 text-[13px] text-ink-400">
                    Legt denselben Einsatz für eine zweite Person an: gleiches Objekt, gleicher Tag, gleiche Zeitvorgabe. Beide stempeln dann getrennt.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select value={helfer} onChange={(e) => setHelfer(e.target.value)} className={`${feldClass} max-w-[260px]`}>
                      <option value="">Wer hilft mit?</option>
                      {mitarbeiter
                        .filter((person) => clean(person.name) !== clean(form.employee_name))
                        .map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                    </select>
                    <button
                      onClick={helferAnlegen}
                      disabled={!helfer || saving}
                      className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-40"
                    >
                      Dazustellen
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-paper-200 px-5 py-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.notify_employee !== false} onChange={(e) => setForm({ ...form, notify_employee: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                <span className="text-[14px] text-ink-600">Mitarbeiter benachrichtigen</span>
              </label>
              {form.id ? (
                <button onClick={loeschen} disabled={saving} className="rounded-xl border border-danger-100 px-4 py-2.5 text-[14px] font-semibold text-danger-600 disabled:opacity-50">
                  Löschen
                </button>
              ) : null}
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
