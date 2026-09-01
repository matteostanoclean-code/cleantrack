"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Aufgaben: Reklamationen, Personalsachen, Kundenanfragen.
 *
 * Nicht die Einsätze — die stehen im Einsatzplaner. Hier liegen die Vorgänge,
 * die auf dem Tisch liegen und einen Zuständigen brauchen.
 *
 * Zwei Ansichten auf dieselben Daten: Liste zum Durchgehen und Filtern,
 * Kanban-Board zum Verschieben. Das Board ist kein zweiter Datenbestand,
 * es zeigt dieselben Aufgaben nach Zustand sortiert.
 */

type Row = Record<string, any>;

const ARTEN = [
  { code: "REKL", label: "Reklamation", ton: "bg-amber-100 text-amber-800" },
  { code: "PERS", label: "Personal", ton: "bg-brand-100 text-brand-700" },
  { code: "KUND", label: "Kundenanfrage", ton: "bg-success-100 text-success-700" },
  { code: "SONS", label: "Sonstiges", ton: "bg-paper-200 text-ink-600" }
];

const PRIORITAETEN = [
  { code: "gering", label: "Gering", balken: 1 },
  { code: "mittel", label: "Mittel", balken: 2 },
  { code: "hoch", label: "Hoch", balken: 3 },
  { code: "dringend", label: "Dringend", balken: 4 }
];

const ZUSTAENDE = [
  { code: "neu", label: "Neu", ton: "bg-paper-200 text-ink-600" },
  { code: "offen", label: "Offen", ton: "bg-brand-100 text-brand-700" },
  { code: "in_arbeit", label: "In Arbeit", ton: "bg-amber-100 text-amber-800" },
  { code: "in_pruefung", label: "In Prüfung", ton: "bg-amber-100 text-amber-800" },
  { code: "abgeschlossen", label: "Abgeschlossen", ton: "bg-success-100 text-success-700" }
];

const leereAufgabe: Row = {
  title: "",
  ticket_type: "",
  priority: "mittel",
  assigned_to: "",
  due_date: "",
  description: "",
  contact_person: "",
  contact_phone: "",
  contact_email: "",
  link_employee_name: "",
  link_work_site_id: "",
  link_customer_id: "",
  direkt_offen: true
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function artVon(code: unknown) {
  return ARTEN.find((art) => art.code === clean(code).toUpperCase()) || ARTEN[3];
}

function zustandVon(code: unknown) {
  return ZUSTAENDE.find((z) => z.code === clean(code).toLowerCase()) || ZUSTAENDE[0];
}

function zeitpunkt(value?: unknown) {
  const text = clean(value);
  if (!text) return "–";
  const datum = new Date(text);
  if (Number.isNaN(datum.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(datum);
}

function datumText(value?: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return "–";
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

/** Spanne zwischen zwei Zeitpunkten als "3T 22:51 h" oder "00:41 h". */
function spanne(von?: unknown, bis?: unknown) {
  const a = new Date(clean(von)).getTime();
  const b = bis ? new Date(clean(bis)).getTime() : NaN;
  if (Number.isNaN(a) || Number.isNaN(b)) return "–";
  const minuten = Math.max(0, Math.round((b - a) / 60000));
  const tage = Math.floor(minuten / 1440);
  const rest = minuten % 1440;
  const zeit = `${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")} h`;
  return tage > 0 ? `${tage}T ${zeit}` : zeit;
}

function Balken({ stufe }: { stufe: number }) {
  return (
    <span className="inline-flex items-end gap-[2px]" title={PRIORITAETEN[stufe - 1]?.label}>
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={cx("w-[3px] rounded-sm", n <= stufe ? (stufe >= 4 ? "bg-danger-500" : stufe === 3 ? "bg-amber-500" : "bg-brand-600") : "bg-paper-300")}
          style={{ height: `${4 + n * 2.5}px` }}
        />
      ))}
    </span>
  );
}

const feldClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

function Feld({ label, pflicht, children }: { label: string; pflicht?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-ink-500">{label}{pflicht ? <span className="text-danger-500"> *</span> : null}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function AufgabenSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [setupFehlt, setSetupFehlt] = useState(false);

  const [tickets, setTickets] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [eigenerName, setEigenerName] = useState("");

  const [reiter, setReiter] = useState("alle");
  const [suche, setSuche] = useState("");
  const [artFilter, setArtFilter] = useState("");
  const [ansicht, setAnsicht] = useState<"liste" | "board">("liste");

  const [blattOffen, setBlattOffen] = useState(false);
  const [abschnitt, setAbschnitt] = useState("allgemein");
  const [form, setForm] = useState<Row>({ ...leereAufgabe });

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/aufgaben-liste", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Aufgaben konnten nicht geladen werden.");
      setSetupFehlt(Boolean(ergebnis.setupFehlt));
      setTickets(ergebnis.tickets || []);
      setEmployees(ergebnis.employees || []);
      setSites(ergebnis.sites || []);
      setCustomers(ergebnis.customers || []);
      setEigenerName(clean(ergebnis.eigenerName));
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Aufgaben konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const sessionToken = data.session?.access_token || "";
      setToken(sessionToken);
      setAuthLoading(false);
      if (sessionToken) await load(sessionToken);
    }
    init();
  }, [load]);

  const heute = new Date().toISOString().slice(0, 10);

  const gefiltert = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const archiviert = ticket.archived === true || clean(ticket.status).toLowerCase() === "abgeschlossen";

      if (reiter === "archiviert") { if (!archiviert) return false; }
      else if (archiviert) return false;

      if (reiter === "neu" && clean(ticket.status).toLowerCase() !== "neu") return false;
      if (reiter === "mir" && clean(ticket.assigned_to) !== eigenerName) return false;
      if (reiter === "vonmir" && clean(ticket.created_by) !== eigenerName) return false;
      if (reiter === "ueberfaellig") {
        const faellig = clean(ticket.due_date).slice(0, 10);
        if (!faellig || faellig >= heute) return false;
      }

      if (artFilter && clean(ticket.ticket_type).toUpperCase() !== artFilter) return false;
      if (!needle) return true;
      return `${clean(ticket.identifier)} ${clean(ticket.title)} ${clean(ticket.assigned_to)} ${clean(ticket.link_customer_name)} ${clean(ticket.link_work_site_name)}`.toLowerCase().includes(needle);
    });
  }, [tickets, reiter, suche, artFilter, eigenerName, heute]);

  const zaehler = useMemo(() => {
    const aktiv = tickets.filter((t) => t.archived !== true && clean(t.status).toLowerCase() !== "abgeschlossen");
    return {
      alle: aktiv.length,
      neu: aktiv.filter((t) => clean(t.status).toLowerCase() === "neu").length,
      mir: aktiv.filter((t) => clean(t.assigned_to) === eigenerName).length,
      vonmir: aktiv.filter((t) => clean(t.created_by) === eigenerName).length,
      ueberfaellig: aktiv.filter((t) => clean(t.due_date) && clean(t.due_date).slice(0, 10) < heute).length,
      archiviert: tickets.length - aktiv.length
    };
  }, [tickets, eigenerName, heute]);

  function neueAufgabe() {
    setForm({ ...leereAufgabe });
    setAbschnitt("allgemein");
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  function bearbeiten(ticket: Row) {
    setForm({
      ...leereAufgabe,
      ...ticket,
      due_date: clean(ticket.due_date).slice(0, 10),
      link_work_site_id: clean(ticket.link_work_site_id),
      link_customer_id: clean(ticket.link_customer_id)
    });
    setAbschnitt("allgemein");
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  async function speichern(weitere = false) {
    if (!clean(form.title)) { setError("Bitte einen Titel eintragen."); return; }
    if (!clean(form.ticket_type)) { setError("Bitte eine Aufgabenart wählen."); return; }

    setSaving(true);
    setError(null);
    try {
      const objekt = sites.find((site) => site.id === clean(form.link_work_site_id));
      const kunde = customers.find((row) => row.id === clean(form.link_customer_id));
      const koerper = {
        ...form,
        link_work_site_name: objekt ? clean(objekt.name) : null,
        link_customer_name: kunde ? clean(kunde.name) : null
      };

      const antwort = await fetch("/api/admin/aufgaben-liste", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(koerper)
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");

      setMessage(form.id ? "Aufgabe gespeichert." : `Aufgabe ${clean(ergebnis.item?.identifier)} angelegt.`);
      if (weitere) {
        setForm({ ...leereAufgabe, ticket_type: form.ticket_type });
        setAbschnitt("allgemein");
      } else {
        setBlattOffen(false);
      }
      await load();
    } catch (speicherFehler) {
      setError(speicherFehler instanceof Error ? speicherFehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function zustandSetzen(ticket: Row, status: string) {
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/aufgaben-liste", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: ticket.id, status })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Änderung fehlgeschlagen.");
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Änderung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  /** Liste als CSV, damit sie in Excel weiterverarbeitet werden kann. */
  function exportieren() {
    const spalten = ["Kürzel", "Art", "Priorität", "Status", "Titel", "Erstellt", "Fällig", "Zugewiesen an", "Reaktionszeit", "Bearbeitungszeit"];
    const zeilen = gefiltert.map((t) => [
      clean(t.identifier),
      artVon(t.ticket_type).label,
      clean(t.priority),
      zustandVon(t.status).label,
      clean(t.title),
      zeitpunkt(t.created_at),
      datumText(t.due_date),
      clean(t.assigned_to),
      spanne(t.created_at, t.first_response_at),
      spanne(t.created_at, t.completed_at)
    ]);
    const csv = [spalten, ...zeilen].map((zeile) => zeile.map((wert) => `"${String(wert).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const adresse = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = adresse;
    link.download = `aufgaben-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(adresse);
  }

  if (authLoading) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Lade Anmeldung…</main>;
  if (!token) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</main>;

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="px-4 py-5 md:px-6 xl:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
              <UiIcon name="list" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Aufgaben</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAnsicht(ansicht === "liste" ? "board" : "liste")}
              className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700"
            >
              {ansicht === "liste" ? "Kanban-Board" : "Liste"}
            </button>
            <button onClick={exportieren} disabled={!gefiltert.length} className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">
              Exportieren
            </button>
            <button onClick={neueAufgabe} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white">
              + Aufgabe erstellen
            </button>
          </div>
        </header>

        {setupFehlt ? (
          <p className="mt-4 rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">
            Die Aufgabentabelle fehlt noch. Bitte einmal <strong>supabase/aufgaben_tabelle.sql</strong> in Supabase ausführen, danach läuft dieser Bereich.
          </p>
        ) : null}
        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{message}</p> : null}

        <div className="mt-4 flex gap-6 overflow-x-auto border-b border-paper-200">
          {([
            ["alle", "Alle", zaehler.alle],
            ["neu", "Neu", zaehler.neu],
            ["mir", "Mir zugewiesen", zaehler.mir],
            ["vonmir", "Von mir erstellt", zaehler.vonmir],
            ["ueberfaellig", "Überfällig", zaehler.ueberfaellig],
            ["archiviert", "Archiviert", zaehler.archiviert]
          ] as const).map(([wert, label, anzahl]) => (
            <button
              key={wert}
              onClick={() => setReiter(wert)}
              className={cx("relative -mb-px shrink-0 pb-3 text-[15px]", reiter === wert ? "font-semibold text-brand-700" : "text-ink-400")}
            >
              {label}{anzahl ? <span className="ml-1.5 text-[13px] text-ink-400">{anzahl}</span> : null}
              {reiter === wert ? <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-brand-600" /> : null}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex w-full max-w-[320px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
            <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
            <input value={suche} onChange={(event) => setSuche(event.target.value)} placeholder="Suchen" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
          </div>
          <select value={artFilter} onChange={(event) => setArtFilter(event.target.value)} className="rounded-xl border border-paper-200 bg-white px-3.5 py-2.5 text-[14px] text-ink-700 outline-none">
            <option value="">Alle Arten</option>
            {ARTEN.map((art) => <option key={art.code} value={art.code}>{art.label}</option>)}
          </select>
        </div>

        {ansicht === "liste" ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
            <table className="w-full min-w-[1000px] text-left">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3">Art</th>
                  <th className="px-3 py-3">Kürzel</th>
                  <th className="px-3 py-3">Prio</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Titel</th>
                  <th className="px-3 py-3">Erstellt</th>
                  <th className="px-3 py-3">Fällig</th>
                  <th className="px-3 py-3">Zugewiesen</th>
                  <th className="px-3 py-3">Reaktion</th>
                  <th className="px-3 py-3">Bearbeitung</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((ticket) => {
                  const art = artVon(ticket.ticket_type);
                  const zustand = zustandVon(ticket.status);
                  const prio = PRIORITAETEN.find((p) => p.code === clean(ticket.priority).toLowerCase()) || PRIORITAETEN[1];
                  const ueberfaellig = clean(ticket.due_date) && clean(ticket.due_date).slice(0, 10) < heute && clean(ticket.status) !== "abgeschlossen";
                  return (
                    <tr key={ticket.id} onClick={() => bearbeiten(ticket)} className="cursor-pointer border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                      <td className="px-4 py-3"><span className={cx("rounded-md px-2 py-1 text-[12px] font-semibold", art.ton)}>{art.label}</span></td>
                      <td className="px-3 py-3 font-mono text-[13px] text-ink-600">{clean(ticket.identifier) || "–"}</td>
                      <td className="px-3 py-3"><Balken stufe={prio.balken} /></td>
                      <td className="px-3 py-3"><span className={cx("rounded-md px-2 py-1 text-[12px] font-semibold", zustand.ton)}>{zustand.label}</span></td>
                      <td className="px-3 py-3 text-[14px] font-medium text-ink-900">{clean(ticket.title)}</td>
                      <td className="px-3 py-3 text-[13px] text-ink-500">{zeitpunkt(ticket.created_at)}</td>
                      <td className={cx("px-3 py-3 text-[13px]", ueberfaellig ? "font-semibold text-danger-600" : "text-ink-500")}>{datumText(ticket.due_date)}</td>
                      <td className="px-3 py-3 text-[13px] text-ink-600">{clean(ticket.assigned_to) || "–"}</td>
                      <td className="px-3 py-3 text-[13px] text-ink-500">{spanne(ticket.created_at, ticket.first_response_at)}</td>
                      <td className="px-3 py-3 text-[13px] text-ink-500">{spanne(ticket.created_at, ticket.completed_at)}</td>
                    </tr>
                  );
                })}
                {!gefiltert.length && !loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center">
                      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
                        <UiIcon name="close" className="h-5 w-5" />
                      </span>
                      <p className="mt-3 text-[16px] font-semibold text-ink-900">Noch keine Daten hinterlegt</p>
                      <p className="mt-1 text-[13px] text-ink-400">Leg oben eine Aufgabe an, dann steht sie hier.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {ZUSTAENDE.map((spalte) => {
              const eigene = gefiltert.filter((ticket) => clean(ticket.status).toLowerCase() === spalte.code);
              return (
                <section key={spalte.code} className="rounded-2xl border border-paper-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className={cx("rounded-md px-2 py-1 text-[12px] font-semibold", spalte.ton)}>{spalte.label}</span>
                    <span className="text-[12px] font-bold text-ink-400">{eigene.length}</span>
                  </div>
                  <div className="space-y-2">
                    {eigene.map((ticket) => {
                      const art = artVon(ticket.ticket_type);
                      const prio = PRIORITAETEN.find((p) => p.code === clean(ticket.priority).toLowerCase()) || PRIORITAETEN[1];
                      const index = ZUSTAENDE.findIndex((z) => z.code === spalte.code);
                      return (
                        <div key={ticket.id} className="rounded-xl border border-paper-200 p-3">
                          <button onClick={() => bearbeiten(ticket)} className="block w-full text-left">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 font-mono text-[12px] text-ink-400">{clean(ticket.identifier)}</span>
                              <span className={cx("truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold", art.ton)}>{art.label}</span>
                              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                <Balken stufe={prio.balken} />
                                {clean(ticket.assigned_to) ? (
                                  <span
                                    title={clean(ticket.assigned_to)}
                                    className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white"
                                  >
                                    {clean(ticket.assigned_to).split(" ").filter(Boolean).map((teil) => teil[0]).slice(0, 2).join("").toUpperCase()}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <p className="min-w-0 flex-1 text-[14px] font-medium text-ink-900">{clean(ticket.title)}</p>
                              {clean(ticket.due_date) ? (
                                <span className={cx(
                                  "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                                  clean(ticket.due_date).slice(0, 10) < heute ? "bg-danger-100 text-danger-700" : "bg-paper-200 text-ink-600"
                                )}>
                                  {datumText(ticket.due_date)}
                                </span>
                              ) : null}
                            </div>
                          </button>
                          <div className="mt-2 flex gap-1">
                            {index > 0 ? (
                              <button onClick={() => zustandSetzen(ticket, ZUSTAENDE[index - 1].code)} disabled={saving} className="rounded-lg border border-paper-300 px-2 py-1 text-[12px] text-ink-600 disabled:opacity-50">←</button>
                            ) : null}
                            {index < ZUSTAENDE.length - 1 ? (
                              <button onClick={() => zustandSetzen(ticket, ZUSTAENDE[index + 1].code)} disabled={saving} className="flex-1 rounded-lg border border-brand-500/40 bg-brand-50 px-2 py-1 text-[12px] font-semibold text-brand-700 disabled:opacity-50">
                                {ZUSTAENDE[index + 1].label} →
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {!eigene.length ? <p className="py-6 text-center text-[13px] text-ink-300">Nichts hier</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {blattOffen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setBlattOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[900px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <p className="text-[19px] font-bold">{form.id ? `Aufgabe ${clean(form.identifier)}` : "Neue Aufgabe erstellen"}</p>
              <button onClick={() => setBlattOffen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              <nav className="hidden w-[170px] shrink-0 border-r border-paper-200 p-3 md:block">
                {[["allgemein", "Allgemein"], ["kontakt", "Kontakt"], ["verknuepfungen", "Verknüpfungen"]].map(([wert, label]) => (
                  <button
                    key={wert}
                    onClick={() => setAbschnitt(wert)}
                    className={cx("mb-1 block w-full rounded-lg px-3 py-2.5 text-left text-[14px]", abschnitt === wert ? "bg-paper-200 font-semibold text-ink-900" : "text-ink-600 hover:bg-paper-100")}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="min-w-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {abschnitt === "allgemein" ? (
                  <>
                    <Feld label="Titel" pflicht>
                      <input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Worum geht es" className={feldClass} />
                    </Feld>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Feld label="Aufgabenart" pflicht>
                        <select value={form.ticket_type || ""} onChange={(e) => setForm({ ...form, ticket_type: e.target.value })} className={feldClass}>
                          <option value="">Bitte auswählen</option>
                          {ARTEN.map((art) => <option key={art.code} value={art.code}>{art.code} · {art.label}</option>)}
                        </select>
                      </Feld>
                      <Feld label="Priorität">
                        <select value={form.priority || "mittel"} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={feldClass}>
                          {PRIORITAETEN.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                        </select>
                      </Feld>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Feld label="Zuständig">
                        <select value={form.assigned_to || ""} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={feldClass}>
                          <option value="">Noch niemand</option>
                          {employees.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                        </select>
                      </Feld>
                      <Feld label="Fällig am">
                        <input type="date" value={clean(form.due_date).slice(0, 10)} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={feldClass} />
                      </Feld>
                    </div>
                    {form.id ? (
                      <Feld label="Status">
                        <select value={clean(form.status) || "neu"} onChange={(e) => setForm({ ...form, status: e.target.value })} className={feldClass}>
                          {ZUSTAENDE.map((z) => <option key={z.code} value={z.code}>{z.label}</option>)}
                        </select>
                      </Feld>
                    ) : null}
                    <Feld label="Beschreibung">
                      <textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={7} className={feldClass} />
                    </Feld>
                  </>
                ) : null}

                {abschnitt === "kontakt" ? (
                  <>
                    <p className="text-[13px] text-ink-400">Wer sich gemeldet hat, damit man nicht erst suchen muss.</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Feld label="Kontaktperson"><input value={form.contact_person || ""} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className={feldClass} /></Feld>
                      <Feld label="Telefon"><input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className={feldClass} /></Feld>
                    </div>
                    <Feld label="E-Mail"><input type="email" value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className={feldClass} /></Feld>
                  </>
                ) : null}

                {abschnitt === "verknuepfungen" ? (
                  <>
                    <p className="text-[13px] text-ink-400">Woran die Aufgabe hängt. Damit findet man sie später wieder.</p>
                    <Feld label="Mitarbeiter">
                      <select value={form.link_employee_name || ""} onChange={(e) => setForm({ ...form, link_employee_name: e.target.value })} className={feldClass}>
                        <option value="">Keiner</option>
                        {employees.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                      </select>
                    </Feld>
                    <Feld label="Objekt">
                      <select value={form.link_work_site_id || ""} onChange={(e) => setForm({ ...form, link_work_site_id: e.target.value })} className={feldClass}>
                        <option value="">Keines</option>
                        {sites.map((site) => <option key={site.id} value={site.id}>{clean(site.name)}</option>)}
                      </select>
                    </Feld>
                    <Feld label="Kunde">
                      <select value={form.link_customer_id || ""} onChange={(e) => setForm({ ...form, link_customer_id: e.target.value })} className={feldClass}>
                        <option value="">Keiner</option>
                        {customers.map((kunde) => <option key={kunde.id} value={kunde.id}>{clean(kunde.name)}</option>)}
                      </select>
                    </Feld>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-paper-200 px-5 py-3">
              {!form.id ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={form.direkt_offen !== false} onChange={(e) => setForm({ ...form, direkt_offen: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                  <span className="text-[14px] text-ink-600">Direkt auf offen stellen</span>
                </label>
              ) : null}
              <span className="flex-1" />
              {!form.id ? (
                <button onClick={() => speichern(true)} disabled={saving} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">
                  Weitere Aufgabe erstellen
                </button>
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
