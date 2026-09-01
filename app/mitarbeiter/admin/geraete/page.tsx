"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Geräte und Inventar.
 *
 * Zwei Fragen an dieselben Daten: Was steht wo — das ist der Alltag. Und was
 * ist es noch wert — das will der Steuerberater. Deshalb drei Ansichten auf
 * denselben Bestand: nach Objekt, als flache Liste, als Inventarliste mit
 * Anschaffung und Restbuchwert.
 *
 * Der Restbuchwert wird immer frisch gerechnet, nie gespeichert. Eine
 * gespeicherte Zahl ist ab dem Tag danach falsch.
 */

type Row = Record<string, any>;

const GERAETETYPEN = [
  "Reinigungsmaschine",
  "Staubsauger",
  "Hochdruckreiniger",
  "Einscheibenmaschine",
  "Kehrmaschine",
  "Leiter",
  "Reinigungswagen",
  "Werkzeug",
  "Fahrzeug",
  "Sonstiges"
];

const ZUSTAENDE = [
  { code: "aktiv", label: "Aktiv", ton: "bg-success-100 text-success-700" },
  { code: "wartung", label: "In Wartung", ton: "bg-amber-100 text-amber-800" },
  { code: "defekt", label: "Defekt", ton: "bg-danger-100 text-danger-700" },
  { code: "ausgemustert", label: "Ausgemustert", ton: "bg-paper-200 text-ink-600" }
];

const leeresGeraet: Row = {
  id: "",
  name: "",
  device_type: "",
  manufacturer: "",
  model: "",
  serial_number: "",
  inventory_number: "",
  nfc_tag_id: "",
  work_site_id: "",
  assigned_to: "",
  status: "aktiv",
  purchase_date: "",
  purchase_price: "",
  supplier: "",
  invoice_number: "",
  useful_life_years: "8",
  disposed_at: "",
  disposal_note: "",
  last_service_date: "",
  next_service_date: "",
  service_interval_months: "",
  notes: ""
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function zahlText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(".", ",");
}

function euro(value: unknown) {
  const zahl = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(zahl)) return "–";
  return zahl.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function datumText(value?: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return "–";
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

function zustandVon(code: unknown) {
  return ZUSTAENDE.find((z) => z.code === clean(code).toLowerCase()) || ZUSTAENDE[0];
}

function wartungFaellig(geraet: Row) {
  const naechste = clean(geraet.next_service_date).slice(0, 10);
  if (!naechste) return false;
  return naechste <= new Date().toISOString().slice(0, 10);
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

export default function GeraeteSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [setupFehlt, setSetupFehlt] = useState(false);

  const [devices, setDevices] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [summe, setSumme] = useState<Row>({ anzahl: 0, anschaffung: 0, restwert: 0, abgegangen: 0 });

  const [ansicht, setAnsicht] = useState<"objekt" | "liste" | "inventar">("objekt");
  const [suche, setSuche] = useState("");
  const [objektFilter, setObjektFilter] = useState("");
  const [mitAbgang, setMitAbgang] = useState(false);

  const [blattOffen, setBlattOffen] = useState(false);
  const [abschnitt, setAbschnitt] = useState("geraet");
  const [form, setForm] = useState<Row>({ ...leeresGeraet });

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/geraete", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Geräte konnten nicht geladen werden.");
      setSetupFehlt(Boolean(ergebnis.setupFehlt));
      setDevices(ergebnis.devices || []);
      setSites(ergebnis.sites || []);
      setEmployees(ergebnis.employees || []);
      setSumme(ergebnis.summe || { anzahl: 0, anschaffung: 0, restwert: 0, abgegangen: 0 });
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Geräte konnten nicht geladen werden.");
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

  const gefiltert = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    return devices.filter((geraet) => {
      if (!mitAbgang && clean(geraet.disposed_at)) return false;
      if (objektFilter && clean(geraet.work_site_id) !== objektFilter) return false;
      if (!needle) return true;
      return `${clean(geraet.name)} ${clean(geraet.device_type)} ${clean(geraet.manufacturer)} ${clean(geraet.model)} ${clean(geraet.serial_number)} ${clean(geraet.inventory_number)} ${clean(geraet.work_site_name)}`.toLowerCase().includes(needle);
    });
  }, [devices, suche, objektFilter, mitAbgang]);

  const nachObjekt = useMemo(() => {
    const map = new Map<string, { id: string; name: string; kunde: string; geraete: Row[] }>();
    for (const geraet of gefiltert) {
      const id = clean(geraet.work_site_id) || "__lager";
      const objekt = sites.find((site) => site.id === clean(geraet.work_site_id));
      const name = clean(geraet.work_site_name) || clean(objekt?.name) || "Ohne Objekt";
      const vorhanden = map.get(id);
      if (vorhanden) vorhanden.geraete.push(geraet);
      else map.set(id, { id, name, kunde: clean(objekt?.customer_name), geraete: [geraet] });
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === "__lager") return 1;
      if (b.id === "__lager") return -1;
      return a.name.localeCompare(b.name);
    });
  }, [gefiltert, sites]);

  const faellig = useMemo(() => devices.filter((geraet) => !clean(geraet.disposed_at) && wartungFaellig(geraet)).length, [devices]);
  const defekt = useMemo(() => devices.filter((geraet) => clean(geraet.status).toLowerCase() === "defekt").length, [devices]);

  function neu() {
    setForm({ ...leeresGeraet, work_site_id: objektFilter });
    setAbschnitt("geraet");
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  function bearbeiten(geraet: Row) {
    setForm({
      ...leeresGeraet,
      ...geraet,
      purchase_price: zahlText(geraet.purchase_price),
      useful_life_years: geraet.useful_life_years ?? "",
      service_interval_months: geraet.service_interval_months ?? "",
      purchase_date: clean(geraet.purchase_date).slice(0, 10),
      disposed_at: clean(geraet.disposed_at).slice(0, 10),
      last_service_date: clean(geraet.last_service_date).slice(0, 10),
      next_service_date: clean(geraet.next_service_date).slice(0, 10),
      work_site_id: clean(geraet.work_site_id)
    });
    setAbschnitt("geraet");
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  async function speichern(weitere = false) {
    if (!clean(form.name)) { setError("Bitte einen Namen eintragen."); return; }
    if (!clean(form.work_site_id)) { setError("Bitte ein Objekt wählen. Jedes Gerät steht irgendwo."); return; }
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/geraete", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");
      setMessage(form.id ? "Gerät gespeichert." : `Gerät angelegt, Inventarnummer ${clean(ergebnis.item?.inventory_number) || "vergeben"}.`);
      if (weitere) setForm({ ...leeresGeraet, work_site_id: form.work_site_id, device_type: form.device_type, supplier: form.supplier });
      else setBlattOffen(false);
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  /** Inventarliste als CSV, so wie sie der Steuerberater braucht. */
  function exportieren() {
    const spalten = [
      "Inventarnummer", "Bezeichnung", "Typ", "Hersteller", "Modell", "Seriennummer",
      "Objekt", "Anschaffungsdatum", "Anschaffungspreis netto", "Lieferant", "Rechnungsnummer",
      "Nutzungsdauer Jahre", "Abschreibung bisher", "Restbuchwert", "Abgang", "Bemerkung"
    ];
    const zeilen = gefiltert.map((geraet) => [
      clean(geraet.inventory_number),
      clean(geraet.name),
      clean(geraet.device_type),
      clean(geraet.manufacturer),
      clean(geraet.model),
      clean(geraet.serial_number),
      clean(geraet.work_site_name),
      clean(geraet.purchase_date).slice(0, 10),
      geraet.purchase_price ?? "",
      clean(geraet.supplier),
      clean(geraet.invoice_number),
      geraet.useful_life_years ?? "",
      geraet.abschreibungBisher ?? "",
      geraet.restwert ?? "",
      clean(geraet.disposed_at).slice(0, 10),
      clean(geraet.disposal_note || geraet.notes)
    ]);
    const csv = [spalten, ...zeilen].map((zeile) => zeile.map((wert) => `"${String(wert).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const adresse = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = adresse;
    link.download = `Inventarliste_${new Date().toISOString().slice(0, 10)}.csv`;
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
              <UiIcon name="box" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Geräte</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/mitarbeiter/admin/geraete/etiketten" className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700">Etiketten drucken</a>
            <button onClick={exportieren} disabled={!gefiltert.length} className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">Inventarliste</button>
            <button onClick={neu} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white">+ Gerät anlegen</button>
          </div>
        </header>

        {setupFehlt ? (
          <p className="mt-4 rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">
            Die Gerätetabelle fehlt noch. Bitte einmal <strong>supabase/geraete_tabelle.sql</strong> in Supabase ausführen.
          </p>
        ) : null}
        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{message}</p> : null}

        {/* Was die Bilanz wissen will, steht oben. */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-paper-200 bg-white p-4">
            <p className="text-[13px] text-ink-400">Im Bestand</p>
            <p className="mt-1 text-[24px] font-bold">{summe.anzahl}</p>
          </div>
          <div className="rounded-2xl border border-paper-200 bg-white p-4">
            <p className="text-[13px] text-ink-400">Anschaffung netto</p>
            <p className="mt-1 text-[24px] font-bold">{euro(summe.anschaffung)}</p>
          </div>
          <div className="rounded-2xl border border-paper-200 bg-white p-4">
            <p className="text-[13px] text-ink-400">Restbuchwert</p>
            <p className="mt-1 text-[24px] font-bold text-brand-600">{euro(summe.restwert)}</p>
          </div>
          <div className={cx("rounded-2xl border p-4", faellig || defekt ? "border-danger-500/40 bg-white" : "border-paper-200 bg-white")}>
            <p className="text-[13px] text-ink-400">Wartung fällig · defekt</p>
            <p className={cx("mt-1 text-[24px] font-bold", faellig || defekt ? "text-danger-600" : "text-ink-900")}>{faellig} · {defekt}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-paper-300">
            {([["objekt", "Nach Objekt"], ["liste", "Alle Geräte"], ["inventar", "Inventarliste"]] as const).map(([wert, label]) => (
              <button key={wert} onClick={() => setAnsicht(wert)} className={cx("px-3.5 py-2.5 text-[14px]", ansicht === wert ? "bg-brand-600 font-semibold text-white" : "bg-white text-ink-600")}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex w-full max-w-[280px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
            <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Gerät, Nummer, Hersteller" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
          </div>
          <select value={objektFilter} onChange={(e) => setObjektFilter(e.target.value)} className="rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-[14px] text-ink-700 outline-none">
            <option value="">Alle Objekte</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{clean(site.name)}</option>)}
          </select>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-paper-300 bg-white px-3.5 py-2.5">
            <input type="checkbox" checked={mitAbgang} onChange={(e) => setMitAbgang(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            <span className="text-[14px] text-ink-700">Abgegangene zeigen</span>
          </label>
        </div>

        {ansicht === "objekt" ? (
          <div className="mt-4 space-y-3">
            {nachObjekt.map((gruppe) => (
              <section key={gruppe.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold">{gruppe.name}</p>
                    <p className="truncate text-[13px] text-ink-400">{gruppe.kunde || "Kein Kunde hinterlegt"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-paper-100 px-3 py-1 text-[12px] font-bold text-ink-600">{gruppe.geraete.length}</span>
                </div>
                {gruppe.geraete.map((geraet) => {
                  const zustand = zustandVon(geraet.status);
                  return (
                    <button key={geraet.id} onClick={() => bearbeiten(geraet)} className="flex w-full items-start gap-3 border-t border-paper-200 py-3 text-left">
                      <span className="mt-0.5 shrink-0 text-ink-400"><UiIcon name="box" className="h-[20px] w-[20px]" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-ink-900">{clean(geraet.name)}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-ink-400">
                          {[clean(geraet.inventory_number) && `Nr. ${geraet.inventory_number}`, clean(geraet.manufacturer), clean(geraet.serial_number)].filter(Boolean).join(" · ") || "Ohne weitere Angaben"}
                        </span>
                        {wartungFaellig(geraet) ? <span className="mt-1 block text-[13px] font-medium text-danger-600">Wartung fällig seit {datumText(geraet.next_service_date)}</span> : null}
                      </span>
                      <span className={cx("shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold", zustand.ton)}>{zustand.label}</span>
                    </button>
                  );
                })}
              </section>
            ))}
            {!nachObjekt.length && !loading ? <p className="rounded-2xl border border-paper-200 bg-white px-4 py-12 text-center text-[14px] text-ink-400">Noch keine Geräte erfasst.</p> : null}
          </div>
        ) : null}

        {ansicht === "liste" ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3">Name</th><th className="px-3 py-3">Nr.</th><th className="px-3 py-3">Hersteller</th>
                  <th className="px-3 py-3">Seriennummer</th><th className="px-3 py-3">Objekt</th>
                  <th className="px-3 py-3">Letzte Wartung</th><th className="px-3 py-3">Nächste</th><th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((geraet) => {
                  const zustand = zustandVon(geraet.status);
                  return (
                    <tr key={geraet.id} onClick={() => bearbeiten(geraet)} className="cursor-pointer border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                      <td className="px-4 py-3 text-[15px] font-semibold text-ink-900">{clean(geraet.name)}</td>
                      <td className="px-3 py-3 text-[14px] text-ink-500">{clean(geraet.inventory_number) || "–"}</td>
                      <td className="px-3 py-3 text-[14px] text-ink-600">{[clean(geraet.manufacturer), clean(geraet.model)].filter(Boolean).join(" ") || "–"}</td>
                      <td className="px-3 py-3 text-[13px] text-ink-500">{clean(geraet.serial_number) || "–"}</td>
                      <td className="px-3 py-3 text-[14px] text-ink-600">{clean(geraet.work_site_name) || "–"}</td>
                      <td className="px-3 py-3 text-[13px] text-ink-500">{datumText(geraet.last_service_date)}</td>
                      <td className={cx("px-3 py-3 text-[13px]", wartungFaellig(geraet) ? "font-semibold text-danger-600" : "text-ink-500")}>{datumText(geraet.next_service_date)}</td>
                      <td className="px-3 py-3"><span className={cx("rounded-md px-2 py-1 text-[12px] font-semibold", zustand.ton)}>{zustand.label}</span></td>
                    </tr>
                  );
                })}
                {!gefiltert.length && !loading ? <tr><td colSpan={8} className="px-4 py-12 text-center text-[14px] text-ink-400">Keine Geräte in dieser Auswahl.</td></tr> : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {ansicht === "inventar" ? (
          <>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
              <table className="w-full min-w-[1080px] text-left">
                <thead>
                  <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-3">Inv.-Nr.</th><th className="px-3 py-3">Bezeichnung</th><th className="px-3 py-3">Objekt</th>
                    <th className="px-3 py-3">Angeschafft</th><th className="px-3 py-3 text-right">Preis netto</th>
                    <th className="px-3 py-3 text-center">Jahre</th><th className="px-3 py-3 text-right">Abgeschrieben</th>
                    <th className="px-3 py-3 text-right">Restbuchwert</th><th className="px-3 py-3">Abgang</th>
                  </tr>
                </thead>
                <tbody>
                  {gefiltert.map((geraet) => (
                    <tr key={geraet.id} onClick={() => bearbeiten(geraet)} className={cx("cursor-pointer border-b border-paper-200 last:border-0 hover:bg-paper-100/60", clean(geraet.disposed_at) && "opacity-50")}>
                      <td className="px-4 py-3 font-mono text-[13px] text-ink-600">{clean(geraet.inventory_number) || "–"}</td>
                      <td className="px-3 py-3">
                        <span className="block text-[15px] font-semibold text-ink-900">{clean(geraet.name)}</span>
                        <span className="block text-[12px] text-ink-400">{[clean(geraet.manufacturer), clean(geraet.model)].filter(Boolean).join(" ") || clean(geraet.device_type)}</span>
                      </td>
                      <td className="px-3 py-3 text-[14px] text-ink-600">{clean(geraet.work_site_name) || "–"}</td>
                      <td className="px-3 py-3 text-[13px] text-ink-500">{datumText(geraet.purchase_date)}</td>
                      <td className="px-3 py-3 text-right text-[14px] text-ink-800">{geraet.purchase_price ? euro(geraet.purchase_price) : "–"}</td>
                      <td className="px-3 py-3 text-center text-[13px] text-ink-500">{geraet.useful_life_years || "–"}</td>
                      <td className="px-3 py-3 text-right text-[13px] text-ink-500">{geraet.abschreibungBisher !== null && geraet.abschreibungBisher !== undefined ? euro(geraet.abschreibungBisher) : "–"}</td>
                      <td className="px-3 py-3 text-right text-[15px] font-bold text-ink-900">{geraet.restwert !== null && geraet.restwert !== undefined ? euro(geraet.restwert) : "–"}</td>
                      <td className="px-3 py-3 text-[13px] text-ink-500">{clean(geraet.disposed_at) ? datumText(geraet.disposed_at) : "–"}</td>
                    </tr>
                  ))}
                  {!gefiltert.length && !loading ? <tr><td colSpan={9} className="px-4 py-12 text-center text-[14px] text-ink-400">Keine Geräte in dieser Auswahl.</td></tr> : null}
                </tbody>
                {gefiltert.length ? (
                  <tfoot>
                    <tr className="border-t-2 border-paper-300 bg-paper-100/60">
                      <td className="px-4 py-3 text-[14px] font-bold" colSpan={4}>Zusammen</td>
                      <td className="px-3 py-3 text-right text-[14px] font-bold">{euro(gefiltert.reduce((s, g) => s + Number(g.purchase_price || 0), 0))}</td>
                      <td />
                      <td className="px-3 py-3 text-right text-[14px] font-bold">{euro(gefiltert.reduce((s, g) => s + Number(g.abschreibungBisher || 0), 0))}</td>
                      <td className="px-3 py-3 text-right text-[15px] font-bold">{euro(gefiltert.reduce((s, g) => s + Number(g.restwert || 0), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            <p className="mt-3 max-w-[720px] text-[13px] leading-relaxed text-ink-400">
              Der Restbuchwert wird linear gerechnet: Anschaffungspreis geteilt durch die Nutzungsdauer, mal die vollen Monate seit der
              Anschaffung. Monatsgenau, nicht taggenau — für die Inventarliste reicht das und die Zahl bleibt nachrechenbar.
              Wo Preis oder Nutzungsdauer fehlen, steht ein Strich statt einer erfundenen Zahl.
            </p>
          </>
        ) : null}
      </div>

      {blattOffen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setBlattOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <div>
                <p className="text-[19px] font-bold">{form.id ? clean(form.name) || "Gerät ändern" : "Neues Gerät anlegen"}</p>
                {form.id && form.restwert !== null && form.restwert !== undefined ? (
                  <p className="text-[13px] text-ink-400">Restbuchwert {euro(form.restwert)}</p>
                ) : null}
              </div>
              <button onClick={() => setBlattOffen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-paper-200 px-4 py-2">
              {([["geraet", "Gerät"], ["anschaffung", "Anschaffung"], ["wartung", "Wartung"]] as const).map(([wert, label]) => (
                <button key={wert} onClick={() => setAbschnitt(wert)} className={cx("rounded-lg px-3.5 py-2 text-[14px]", abschnitt === wert ? "bg-brand-600 font-semibold text-white" : "text-ink-600 hover:bg-paper-100")}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {abschnitt === "geraet" ? (
                <>
                  <Feld label="Bezeichnung" pflicht><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Nass-Trocken-Sauger" className={feldClass} /></Feld>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Feld label="Gerätetyp">
                      <input list="geraetetypen" value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value })} className={feldClass} />
                      <datalist id="geraetetypen">{GERAETETYPEN.map((typ) => <option key={typ} value={typ} />)}</datalist>
                    </Feld>
                    <Feld label="Objekt" pflicht hinweis="Jedes Gerät steht irgendwo. Ohne Kundenbezug aufs eigene Objekt.">
                      <select value={form.work_site_id} onChange={(e) => setForm({ ...form, work_site_id: e.target.value })} className={feldClass}>
                        <option value="">Objekt auswählen</option>
                        {sites.map((site) => <option key={site.id} value={site.id}>{clean(site.name)}</option>)}
                      </select>
                    </Feld>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Feld label="Hersteller"><input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} className={feldClass} /></Feld>
                    <Feld label="Modell"><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={feldClass} /></Feld>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Feld label="Seriennummer"><input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} className={feldClass} /></Feld>
                    <Feld label="Inventarnummer" hinweis={form.id ? undefined : "Wird vergeben, wenn leer."}>
                      <input value={form.inventory_number} onChange={(e) => setForm({ ...form, inventory_number: e.target.value })} className={feldClass} />
                    </Feld>
                  </div>

                  {/*
                    NFC statt QR: Der Aufkleber am Gerät wird aufgelegt, nicht
                    fotografiert. Ein QR-Code am Sauger ist nach einem halben
                    Jahr Putzmittel nicht mehr lesbar.
                  */}
                  <Feld label="NFC-Kennung" hinweis="Die Kennung des Aufklebers am Gerät. Etiketten mit QR gibt es weiterhin zum Ausdrucken.">
                    <input value={form.nfc_tag_id} onChange={(e) => setForm({ ...form, nfc_tag_id: e.target.value })} placeholder="z. B. 04:A2:1B:9C" className={feldClass} />
                  </Feld>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Feld label="Status">
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={feldClass}>
                        {ZUSTAENDE.map((z) => <option key={z.code} value={z.code}>{z.label}</option>)}
                      </select>
                    </Feld>
                    <Feld label="Zugeteilt an" hinweis="Wenn ein Gerät fest bei einer Person liegt.">
                      <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={feldClass}>
                        <option value="">Niemand</option>
                        {employees.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                      </select>
                    </Feld>
                  </div>

                  <Feld label="Notiz"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={feldClass} /></Feld>
                </>
              ) : null}

              {abschnitt === "anschaffung" ? (
                <>
                  <p className="text-[13px] text-ink-400">Diese Angaben gehen in die Inventarliste für die Bilanz.</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Feld label="Anschaffungsdatum"><input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className={feldClass} /></Feld>
                    <Feld label="Anschaffungspreis netto"><input inputMode="decimal" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} placeholder="z. B. 1250,00" className={feldClass} /></Feld>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Feld label="Lieferant"><input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={feldClass} /></Feld>
                    <Feld label="Rechnungsnummer" hinweis="Damit der Beleg wiedergefunden wird."><input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className={feldClass} /></Feld>
                  </div>
                  <Feld label="Nutzungsdauer in Jahren" hinweis="Reinigungsmaschinen meist 8 Jahre, Kleingeräte kürzer. Im Zweifel beim Steuerberater nachfragen.">
                    <input inputMode="numeric" value={form.useful_life_years} onChange={(e) => setForm({ ...form, useful_life_years: e.target.value })} className={feldClass} />
                  </Feld>

                  <div className="rounded-2xl border border-paper-200 bg-paper-100/70 p-3">
                    <p className="mb-2 text-[13px] font-semibold text-ink-700">Abgang</p>
                    <div className="space-y-3">
                      <Feld label="Ausgeschieden am" hinweis="Verkauft, verschrottet oder gestohlen. Danach zählt das Gerät nicht mehr zum Bestand.">
                        <input type="date" value={form.disposed_at} onChange={(e) => setForm({ ...form, disposed_at: e.target.value })} className={feldClass} />
                      </Feld>
                      {clean(form.disposed_at) ? (
                        <Feld label="Was ist damit passiert"><input value={form.disposal_note} onChange={(e) => setForm({ ...form, disposal_note: e.target.value })} className={feldClass} /></Feld>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              {abschnitt === "wartung" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Feld label="Letzte Wartung"><input type="date" value={form.last_service_date} onChange={(e) => setForm({ ...form, last_service_date: e.target.value })} className={feldClass} /></Feld>
                    <Feld label="Nächste Wartung"><input type="date" value={form.next_service_date} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} className={feldClass} /></Feld>
                  </div>
                  <Feld label="Abstand in Monaten" hinweis="Nur als Erinnerung für dich, das nächste Datum wird nicht automatisch gesetzt.">
                    <input inputMode="numeric" value={form.service_interval_months} onChange={(e) => setForm({ ...form, service_interval_months: e.target.value })} className={feldClass} />
                  </Feld>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-paper-200 px-5 py-3">
              <span className="flex-1" />
              {!form.id ? (
                <button onClick={() => speichern(true)} disabled={saving} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">Weiteres anlegen</button>
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
