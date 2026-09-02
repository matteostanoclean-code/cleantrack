"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { antwortLesen, bildVerkleinern } from "@/lib/bild";
import { cx } from "@/components/ui";

/**
 * Artikelstamm fürs Material.
 *
 * Was hier steht, sieht der Mitarbeiter beim Bestellen. Ein Artikel gehört
 * entweder zu einem Objekt oder zu keinem — Artikel ohne Objekt tauchen
 * überall auf, das sind die Sachen, die es an jedem Objekt gibt.
 *
 * Die Gruppe ist die Überschrift im Bestellblatt. Bleibt sie leer, landet der
 * Artikel unter "Artikel ohne Gruppe".
 */

type Row = Record<string, any>;

const emptyArtikel: Row = {
  id: "",
  name: "",
  article_number: "",
  external_number: "",
  category: "",
  unit: "Stück",
  current_stock: "0",
  min_stock: "1",
  image_url: "",
  supplier: "",
  description: "",
  notes: "",
  work_site_id: "",
  purchase_price: "",
  sale_price: "",
  billable: false
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

/** Leeres Preisfeld heißt "kein Preis hinterlegt", nicht "kostet nichts". */
function preisWert(value: unknown) {
  const text = clean(value).replace(",", ".");
  if (!text) return null;
  const zahl = Number(text);
  return Number.isFinite(zahl) ? zahl : null;
}

function euro(value: unknown) {
  const zahl = Number(value);
  if (!Number.isFinite(zahl)) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(zahl);
}

function datumText(value: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return "–";
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

/**
 * Wann wurde ein Artikel zuletzt bestellt, und in welchem Abstand?
 *
 * Damit lässt sich nachbestellen, bevor jemand vor leeren Spendern steht. Der
 * Rhythmus ist der Durchschnitt der Abstände zwischen den letzten Bestellungen
 * — er braucht mindestens zwei, sonst gibt es keinen Abstand zu mitteln, und
 * dann steht hier auch nichts. Eine erfundene Zahl wäre schlimmer als keine.
 */
function rhythmus(zeilen: Row[]) {
  const tage = zeilen
    .map((zeile) => clean(zeile.delivered_at || zeile.ordered_at || zeile.created_at).slice(0, 10))
    .filter(Boolean)
    .sort();
  // Mehrere Zeilen derselben Bestellung zählen als ein Termin.
  const termine = Array.from(new Set(tage));
  if (!termine.length) return { zuletzt: null as string | null, tageHer: null as number | null, abstand: null as number | null };

  const zuletzt = termine[termine.length - 1];
  const tageHer = Math.round((Date.now() - new Date(`${zuletzt}T12:00:00`).getTime()) / 86400000);

  if (termine.length < 2) return { zuletzt, tageHer, abstand: null };
  const abstaende: number[] = [];
  for (let i = 1; i < termine.length; i++) {
    const a = new Date(`${termine[i - 1]}T12:00:00`).getTime();
    const b = new Date(`${termine[i]}T12:00:00`).getTime();
    abstaende.push(Math.round((b - a) / 86400000));
  }
  const abstand = Math.round(abstaende.reduce((s, w) => s + w, 0) / abstaende.length);
  return { zuletzt, tageHer, abstand };
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

export default function ArtikelSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sites, setSites] = useState<Row[]>([]);
  const [artikel, setArtikel] = useState<Row[]>([]);
  // Bestellzeilen, nur zum Rechnen des Rhythmus. Wer wann was bestellt hat,
  // steht in den Bestellungen — hier interessiert allein: wie oft.
  const [bestellungen, setBestellungen] = useState<Row[]>([]);
  // Rechnungszeilen vom Lieferanten. Die Nettopreise schwanken, deshalb
  // interessiert nicht nur der letzte Preis, sondern der Verlauf.
  const [einkaeufe, setEinkaeufe] = useState<Row[]>([]);
  const [filter, setFilter] = useState("alle");
  const [form, setForm] = useState<Row>({ ...emptyArtikel });
  const [formOffen, setFormOffen] = useState(false);
  const [bildLaeuft, setBildLaeuft] = useState(false);
  const [bildFeldKey, setBildFeldKey] = useState(0);

  /**
   * Bild verkleinern und hochladen.
   *
   * Ein Handyfoto hat schnell fünf Megabyte, der Server nimmt rund viereinhalb
   * pro Anfrage an. Ohne das Verkleinern kommt statt einer Antwort nur der
   * Klartext "Request Entity Too Large" zurück.
   */
  async function bildHochladen(datei: File | null) {
    if (!datei) return;
    setBildLaeuft(true);
    setError(null);
    try {
      const klein = await bildVerkleinern(datei);
      const daten = new FormData();
      daten.set("bild", klein);
      const response = await fetch("/api/admin/artikel-bild", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: daten
      });
      const ergebnis = await antwortLesen(response);
      if (!response.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Bild konnte nicht hochgeladen werden.");
      setForm((aktuell) => ({ ...aktuell, image_url: ergebnis.url }));
    } catch (uploadFehler) {
      setError(uploadFehler instanceof Error ? uploadFehler.message : "Bild konnte nicht hochgeladen werden.");
    } finally {
      setBildLaeuft(false);
      setBildFeldKey((wert) => wert + 1);
    }
  }

  const ruf = useCallback(async (body: Row, currentToken?: string) => {
    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentToken || token}` },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "Aktion fehlgeschlagen.");
    return result;
  }, [token]);

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const objekte = await ruf({ action: "select", table: "work_sites", select: "id, name, customer_name", orderBy: "name" }, t);
      const produkte = await ruf({ action: "select", table: "material_products", select: "*", orderBy: "name" }, t);
      const zeilen = await ruf({ action: "select", table: "material_reports", select: "material_product_id, material_id, created_at, ordered_at, delivered_at, quantity, status", orderBy: "created_at" }, t);
      setSites(objekte.data || []);
      setArtikel(produkte.data || []);
      setBestellungen(zeilen.data || []);
      try {
        const rechnungen = await ruf({ action: "select", table: "material_purchases", select: "*", orderBy: "invoice_date" }, t);
        setEinkaeufe(rechnungen.data || []);
      } catch {
        // Fehlt die Tabelle noch, laeuft die Seite ohne Preisverlauf weiter.
        setEinkaeufe([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Artikel konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [ruf, token]);

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

  const objektName = useCallback((id: unknown) => {
    const treffer = sites.find((site) => site.id === clean(id));
    return treffer ? clean(treffer.name) : "";
  }, [sites]);

  const gefiltert = useMemo(() => {
    if (filter === "alle") return artikel;
    if (filter === "allgemein") return artikel.filter((row) => !clean(row.work_site_id) && !clean(row.object_name));
    return artikel.filter((row) => clean(row.work_site_id) === filter || clean(row.object_name).toLowerCase() === objektName(filter).toLowerCase());
  }, [artikel, filter, objektName]);

  const gruppen = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of gefiltert) {
      const gruppe = clean(row.category) || "Artikel ohne Gruppe";
      map.set(gruppe, [...(map.get(gruppe) || []), row]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [gefiltert]);

  function neu() {
    const vorauswahl = filter !== "alle" && filter !== "allgemein" ? filter : "";
    setForm({ ...emptyArtikel, work_site_id: vorauswahl });
    setFormOffen(true);
  }

  function bearbeiten(row: Row) {
    setForm({
      ...emptyArtikel,
      id: row.id,
      name: clean(row.name),
      article_number: String(row.article_number ?? ""),
      external_number: clean(row.external_number),
      category: clean(row.category),
      unit: clean(row.unit) || "Stück",
      current_stock: String(row.current_stock ?? "0"),
      min_stock: String(row.min_stock ?? row.minimum_stock ?? "1"),
      image_url: clean(row.image_url),
      supplier: clean(row.supplier),
      description: clean(row.description || row.notes),
      notes: clean(row.notes),
      work_site_id: clean(row.work_site_id),
      purchase_price: row.purchase_price === null || row.purchase_price === undefined ? "" : String(row.purchase_price),
      sale_price: row.sale_price === null || row.sale_price === undefined ? "" : String(row.sale_price),
      billable: row.billable === true
    });
    setFormOffen(true);
  }

  async function speichern() {
    if (!clean(form.name)) {
      setError("Bitte einen Namen eintragen.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: Row = {
        name: clean(form.name),
        article_number: Number(form.article_number) || null,
        external_number: clean(form.external_number) || null,
        description: clean(form.description) || null,
        // Leerzeichen am Ende erzeugen sonst eine zweite Gruppe mit gleichem Namen.
        category: clean(form.category) || null,
        unit: clean(form.unit) || null,
        current_stock: Number(form.current_stock) || 0,
        min_stock: Number(form.min_stock) || 0,
        minimum_stock: Number(form.min_stock) || 0,
        image_url: clean(form.image_url) || null,
        supplier: clean(form.supplier) || null,
        notes: clean(form.description || form.notes) || null,
        work_site_id: clean(form.work_site_id) || null,
        object_name: clean(form.work_site_id) ? objektName(form.work_site_id) : null,
        purchase_price: preisWert(form.purchase_price),
        sale_price: form.billable ? preisWert(form.sale_price) : null,
        billable: form.billable === true
      };

      if (form.id) {
        await ruf({ action: "update", table: "material_products", id: form.id, payload });
        setMessage("Artikel geändert.");
      } else {
        await ruf({ action: "insert", table: "material_products", payload });
        setMessage("Artikel angelegt.");
      }
      setFormOffen(false);
      setForm({ ...emptyArtikel });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function loeschen() {
    if (!form.id) return;
    if (!window.confirm(`"${form.name}" wirklich löschen? Bestehende Bestellungen bleiben erhalten.`)) return;
    setSaving(true);
    setError(null);
    try {
      await ruf({ action: "delete", table: "material_products", id: form.id });
      setMessage("Artikel gelöscht.");
      setFormOffen(false);
      setForm({ ...emptyArtikel });
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Löschen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-ink-400">Lade Anmeldung…</div></Shell>;
  if (!token) return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</div></Shell>;

  return (
    <Shell>
      <div className="space-y-4 pb-24">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Schichtklar Admin</p>
            <h1 className="text-3xl font-bold">Artikel fürs Material</h1>
            <p className="mt-1 text-xs text-ink-400">Was hier steht, sieht der Mitarbeiter beim Bestellen.</p>
          </div>
          <button onClick={neu} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-bold text-white">+ Neuer Artikel</button>
        </header>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {message && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">{message}</p>}
        {loading && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">Lade…</p>}

        {/* Auswahlfeld statt Reihe von Knöpfen: es gibt über 25 Objekte, und
            Objekte ohne Artikel müssen auswählbar bleiben — sonst kommt man an
            das leere Objekt nicht heran, für das man gerade Artikel anlegen will. */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFilter("alle")} className={`shrink-0 rounded-full border px-4 py-2 text-[13px] ${filter === "alle" ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600"}`}>
            Alle ({artikel.length})
          </button>
          <button onClick={() => setFilter("allgemein")} className={`shrink-0 rounded-full border px-4 py-2 text-[13px] ${filter === "allgemein" ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600"}`}>
            Für alle Objekte ({artikel.filter((row) => !clean(row.work_site_id) && !clean(row.object_name)).length})
          </button>
          <select
            value={filter === "alle" || filter === "allgemein" ? "" : filter}
            onChange={(event) => setFilter(event.target.value || "alle")}
            className="min-w-[240px] flex-1 rounded-full border border-paper-300 bg-white px-4 py-2 text-[13px] text-ink-600 outline-none focus:border-brand-500"
          >
            <option value="">Objekt wählen…</option>
            {sites.map((site) => {
              const anzahl = artikel.filter((row) => clean(row.work_site_id) === site.id || clean(row.object_name).toLowerCase() === clean(site.name).toLowerCase()).length;
              return <option key={site.id} value={site.id}>{clean(site.name)} ({anzahl})</option>;
            })}
          </select>
        </div>

        {!gefiltert.length ? (
          <div className="rounded-2xl border border-paper-200 bg-white p-6 text-center">
            <p className="font-bold text-ink-800">Keine Artikel</p>
            <p className="mt-1 text-sm text-ink-400">Leg oben einen an. Ohne Artikel sieht der Mitarbeiter beim Bestellen nur das freie Feld.</p>
          </div>
        ) : null}

        {/*
          Am Rechner eine Tabelle, wie sie ein Artikelstamm sein soll: Nummer,
          Gruppe, Lieferant, Bestand und Mindestbestand nebeneinander. Wer
          unter dem Mindestbestand liegt, wird rot — das ist die Zeile, die
          bestellt werden muss.
        */}
        <div className="hidden overflow-x-auto rounded-2xl border border-paper-200 bg-white md:block">
          <table className="w-full min-w-[1080px] text-left">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-3 py-3">Nummer</th>
                <th className="px-3 py-3">Artikelgruppe</th>
                <th className="px-3 py-3">Lieferant</th>
                <th className="px-3 py-3">Objekt</th>
                <th className="px-3 py-3 text-right">Einkauf</th>
                <th className="px-3 py-3">Berechnet</th>
                <th className="px-3 py-3 text-right">Bestand</th>
                <th className="px-3 py-3 text-right">Min. Bestand</th>
                <th className="px-3 py-3">Nachbestellen</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((row) => {
                const bestand = Number(row.current_stock ?? 0);
                const minimum = Number(row.min_stock ?? row.minimum_stock ?? 0);
                const knapp = minimum > 0 && bestand < minimum;
                const takt = rhythmus(bestellungen.filter((z) => clean(z.material_product_id || z.material_id) === clean(row.id)));
                // Faellig, sobald seit der letzten Bestellung mehr Zeit vergangen
                // ist als sonst zwischen zweien liegt.
                const faellig = takt.abstand !== null && takt.tageHer !== null && takt.tageHer >= takt.abstand;
                return (
                  <tr key={row.id} onClick={() => bearbeiten(row)} className="cursor-pointer border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {clean(row.image_url) ? (
                          <img src={clean(row.image_url)} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper-100 text-[16px]">📦</span>
                        )}
                        <span className="text-[15px] font-medium text-brand-700">{clean(row.name) || "Ohne Namen"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[14px] text-ink-600">{clean(row.article_number) || "–"}</td>
                    <td className="px-3 py-3 text-[14px] text-ink-600">{clean(row.category) || "–"}</td>
                    <td className="px-3 py-3">
                      {clean(row.supplier) ? (
                        <span className="rounded-md bg-success-100 px-2 py-1 text-[12px] font-semibold text-success-700">{clean(row.supplier)}</span>
                      ) : <span className="text-[13px] text-ink-300">–</span>}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink-500">{clean(row.object_name) || objektName(row.work_site_id) || "Alle Objekte"}</td>
                    <td className="px-3 py-3 text-right text-[14px] text-ink-700">
                      {row.purchase_price === null || row.purchase_price === undefined || row.purchase_price === "" ? (
                        <span className="text-[13px] text-amber-600">fehlt</span>
                      ) : (
                        <>
                          <span className="block">{euro(row.purchase_price)}</span>
                          {clean(row.price_updated_at) ? (
                            <span className="block text-[12px] text-ink-400">Stand {datumText(row.price_updated_at)}</span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.billable === true ? (
                        <span className="rounded-md bg-brand-100 px-2 py-1 text-[12px] font-semibold text-brand-700">
                          {row.sale_price ? euro(row.sale_price) : "ja"}
                        </span>
                      ) : (
                        <span className="rounded-md bg-paper-200 px-2 py-1 text-[12px] font-semibold text-ink-500">nein</span>
                      )}
                    </td>
                    <td className={cx("px-3 py-3 text-right text-[14px] font-semibold", knapp ? "text-danger-600" : "text-ink-800")}>
                      {bestand} {clean(row.unit) || "Stk."}
                    </td>
                    <td className="px-3 py-3 text-right text-[14px] text-ink-500">{minimum || "–"}</td>
                    <td className="px-3 py-3">
                      {takt.zuletzt ? (
                        <>
                          <span className="block text-[13px] text-ink-700">
                            vor {takt.tageHer} {takt.tageHer === 1 ? "Tag" : "Tagen"}
                          </span>
                          <span className={cx("block text-[12px]", faellig ? "font-semibold text-danger-600" : "text-ink-400")}>
                            {takt.abstand
                              ? faellig
                                ? `fällig, sonst alle ${takt.abstand} Tage`
                                : `alle ${takt.abstand} Tage`
                              : "erst einmal bestellt"}
                          </span>
                        </>
                      ) : (
                        <span className="text-[13px] text-ink-300">noch nie</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!gefiltert.length && !loading ? (
                <tr><td colSpan={10} className="px-4 py-14 text-center text-[14px] text-ink-400">Keine Artikel in dieser Auswahl.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Am Handy nach Gruppe, dort ist eine Tabelle mit sieben Spalten unbrauchbar. */}
        {gruppen.map(([gruppe, zeilen]) => (
          <section key={gruppe} className="rounded-2xl border border-paper-200 bg-white p-4 md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold">{gruppe}</p>
              <span className="rounded-full bg-paper-100 px-3 py-1 text-[11px] font-bold text-ink-600">{zeilen.length}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {zeilen.map((row) => (
                <button key={row.id} onClick={() => bearbeiten(row)} className="flex items-center gap-3 rounded-xl border border-paper-200 p-3 text-left">
                  {clean(row.image_url) ? (
                    <img src={clean(row.image_url)} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-paper-100 text-[18px]">📦</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink-400">
                      {row.current_stock ?? 0} / {row.min_stock ?? row.minimum_stock ?? 0} {clean(row.unit) || "Stk."}
                    </span>
                    <span className="block truncate text-[15px] font-medium text-ink-900">{clean(row.name) || "Ohne Namen"}</span>
                    <span className="block truncate text-[12px] text-ink-400">{clean(row.object_name) || objektName(row.work_site_id) || "Für alle Objekte"}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {formOffen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setFormOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <p className="text-[17px] font-bold">{form.id ? "Artikel ändern" : "Neuer Artikel"}</p>
              <button onClick={() => setFormOffen(false)} className="rounded-xl border border-paper-300 px-3 py-2 text-sm font-bold text-ink-600">Schließen</button>
            </div>

            <form id="artikel-formular" onSubmit={(event) => { event.preventDefault(); speichern(); }} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <Field label="Name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required placeholder="z. B. Toilettenpapier, 3-lagig" className={inputClass} /></Field>

              <Field label="Objekt">
                <select value={form.work_site_id} onChange={(event) => setForm({ ...form, work_site_id: event.target.value })} className={inputClass}>
                  <option value="">Für alle Objekte</option>
                  {sites.map((site) => <option key={site.id} value={site.id}>{clean(site.name)}</option>)}
                </select>
              </Field>

              <Field label="Gruppe, die Überschrift beim Bestellen">
                <input list="artikel-gruppen" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="z. B. Verbrauchsmaterial" className={inputClass} />
                <datalist id="artikel-gruppen">
                  {Array.from(new Set(artikel.map((row) => clean(row.category)).filter(Boolean))).map((gruppe) => <option key={gruppe} value={gruppe} />)}
                </datalist>
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Einheit"><input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} className={inputClass} /></Field>
                <Field label="Bestand"><input type="number" min="0" value={form.current_stock} onChange={(event) => setForm({ ...form, current_stock: event.target.value })} className={inputClass} /></Field>
                <Field label="Soll"><input type="number" min="0" value={form.min_stock} onChange={(event) => setForm({ ...form, min_stock: event.target.value })} className={inputClass} /></Field>
              </div>

              <Field label="Bild, optional">
                <div className="flex items-center gap-3">
                  {clean(form.image_url) ? (
                    <img src={clean(form.image_url)} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-paper-200 object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-paper-100 text-[22px]">📦</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <input
                      key={bildFeldKey}
                      type="file"
                      accept="image/*"
                      onChange={(event) => bildHochladen(event.target.files?.[0] || null)}
                      className="block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                    />
                    {bildLaeuft ? <p className="mt-1 text-[12px] text-brand-700">Lade Bild hoch…</p> : null}
                    {clean(form.image_url) ? (
                      <button type="button" onClick={() => setForm({ ...form, image_url: "" })} className="mt-1 text-[12px] font-semibold text-rose-600">Bild entfernen</button>
                    ) : null}
                  </div>
                </div>
              </Field>
              <Field label="Lieferant, optional"><input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nummer"><input inputMode="numeric" value={form.article_number} onChange={(event) => setForm({ ...form, article_number: event.target.value })} placeholder="wird vergeben" className={inputClass} /></Field>
                <Field label="Externe Nummer"><input value={form.external_number} onChange={(event) => setForm({ ...form, external_number: event.target.value })} placeholder="beim Lieferanten" className={inputClass} /></Field>
              </div>
              {/*
                Preis und Weiterberechnung.

                Der Artikel gehört ohnehin schon zu einem Objekt, deshalb darf
                der Schalter hier stehen: Toilettenpapier bei EUROVIA ist eine
                andere Zeile als Toilettenpapier beim Testobjekt, und nur bei
                einem von beiden zahlt der Kunde.
              */}
              <div className="rounded-xl border border-paper-200 p-4">
                <p className="text-[15px] font-semibold text-ink-900">Preis</p>
                <p className="mt-0.5 text-[13px] text-ink-400">
                  Der Einkaufspreis zählt als Kosten am Objekt und geht in die Auswertung ein — auch dann, wenn du ihn nicht weiterberechnest.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Einkauf netto je Einheit">
                    <input inputMode="decimal" value={form.purchase_price} onChange={(event) => setForm({ ...form, purchase_price: event.target.value })} placeholder="z. B. 12,90" className={inputClass} />
                  </Field>
                  <Field label="Verkauf netto je Einheit">
                    <input
                      inputMode="decimal"
                      value={form.sale_price}
                      onChange={(event) => setForm({ ...form, sale_price: event.target.value })}
                      disabled={!form.billable}
                      placeholder={form.billable ? "z. B. 15,90" : "nicht berechnet"}
                      className={`${inputClass} disabled:bg-paper-100 disabled:text-ink-300`}
                    />
                  </Field>
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.billable === true}
                    onChange={(event) => setForm({ ...form, billable: event.target.checked })}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block text-[15px] text-ink-800">Wird dem Kunden weiterberechnet</span>
                    <span className="mt-0.5 block text-[13px] text-ink-400">
                      Aus heißt: reine Kosten, wie Toiletten- und Handpapier bei MG. An heißt: steht als Position auf der Rechnung.
                    </span>
                  </span>
                </label>

                {/*
                  Preisverlauf aus den Lieferantenrechnungen.

                  Der Preis oben ist nur der zuletzt bekannte Stand für neue
                  Bestellungen. Was tatsächlich gerechnet wird, steht in der
                  jeweiligen Bestellzeile — sonst würde eine neue Rechnung die
                  Kosten vergangener Monate rückwirkend verschieben.
                */}
                {form.id ? (() => {
                  const verlauf = einkaeufe
                    .filter((zeile) => clean(zeile.material_product_id) === clean(form.id))
                    .sort((a, b) => clean(b.invoice_date).localeCompare(clean(a.invoice_date)))
                    .slice(0, 6);
                  if (!verlauf.length) {
                    return (
                      <p className="mt-4 border-t border-paper-200 pt-3 text-[13px] text-ink-400">
                        Noch keine Lieferantenrechnung erfasst. Schick mir die Rechnung, dann steht der Verlauf hier.
                      </p>
                    );
                  }
                  const neuester = Number(verlauf[0].unit_price);
                  const vorheriger = verlauf[1] ? Number(verlauf[1].unit_price) : null;
                  return (
                    <div className="mt-4 border-t border-paper-200 pt-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Aus den Rechnungen</p>
                      <div className="mt-2 space-y-1">
                        {verlauf.map((zeile) => (
                          <div key={zeile.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="text-ink-500">
                              {datumText(zeile.invoice_date)}
                              {clean(zeile.invoice_number) ? <span className="text-ink-300"> · {clean(zeile.invoice_number)}</span> : null}
                            </span>
                            <span className="font-medium text-ink-800">
                              {euro(zeile.unit_price)}
                              <span className="text-ink-400"> × {Number(zeile.quantity) || 1}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                      {vorheriger !== null && Number.isFinite(neuester) && Number.isFinite(vorheriger) && vorheriger > 0 ? (
                        <p className={cx("mt-2 text-[13px] font-semibold", neuester > vorheriger ? "text-danger-600" : neuester < vorheriger ? "text-success-700" : "text-ink-400")}>
                          {neuester === vorheriger
                            ? "Preis unverändert."
                            : `${neuester > vorheriger ? "Teurer" : "Günstiger"} geworden: ${(((neuester - vorheriger) / vorheriger) * 100).toFixed(0).replace("-", "")} % gegenüber der Rechnung davor.`}
                        </p>
                      ) : null}
                    </div>
                  );
                })() : null}
              </div>

              <Field label="Beschreibung, optional"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className={inputClass} /></Field>

              {form.id && (
                <button type="button" onClick={loeschen} className="w-full rounded-xl border border-rose-300 bg-rose-50 py-3 text-sm font-bold text-rose-700">Artikel löschen</button>
              )}
            </form>

            <div className="border-t border-paper-200 px-5 py-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
              <button form="artikel-formular" disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white disabled:opacity-60">
                {saving ? "Speichere…" : form.id ? "Änderung speichern" : "Artikel anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
