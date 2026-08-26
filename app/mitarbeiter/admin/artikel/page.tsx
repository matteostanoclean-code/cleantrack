"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

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
  category: "",
  unit: "Stück",
  current_stock: "0",
  min_stock: "1",
  image_url: "",
  supplier: "",
  notes: "",
  work_site_id: ""
};

function clean(value: unknown) {
  return String(value ?? "").trim();
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
  const [filter, setFilter] = useState("alle");
  const [form, setForm] = useState<Row>({ ...emptyArtikel });
  const [formOffen, setFormOffen] = useState(false);

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
      setSites(objekte.data || []);
      setArtikel(produkte.data || []);
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
      category: clean(row.category),
      unit: clean(row.unit) || "Stück",
      current_stock: String(row.current_stock ?? "0"),
      min_stock: String(row.min_stock ?? row.minimum_stock ?? "1"),
      image_url: clean(row.image_url),
      supplier: clean(row.supplier),
      notes: clean(row.notes),
      work_site_id: clean(row.work_site_id)
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
        // Leerzeichen am Ende erzeugen sonst eine zweite Gruppe mit gleichem Namen.
        category: clean(form.category) || null,
        unit: clean(form.unit) || null,
        current_stock: Number(form.current_stock) || 0,
        min_stock: Number(form.min_stock) || 0,
        minimum_stock: Number(form.min_stock) || 0,
        image_url: clean(form.image_url) || null,
        supplier: clean(form.supplier) || null,
        notes: clean(form.notes) || null,
        work_site_id: clean(form.work_site_id) || null,
        object_name: clean(form.work_site_id) ? objektName(form.work_site_id) : null
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

        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFilter("alle")} className={`shrink-0 rounded-full border px-4 py-2 text-[13px] ${filter === "alle" ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600"}`}>
            Alle ({artikel.length})
          </button>
          <button onClick={() => setFilter("allgemein")} className={`shrink-0 rounded-full border px-4 py-2 text-[13px] ${filter === "allgemein" ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600"}`}>
            Ohne Objekt
          </button>
          {sites.map((site) => {
            const anzahl = artikel.filter((row) => clean(row.work_site_id) === site.id || clean(row.object_name).toLowerCase() === clean(site.name).toLowerCase()).length;
            if (!anzahl) return null;
            return (
              <button key={site.id} onClick={() => setFilter(site.id)} className={`shrink-0 rounded-full border px-4 py-2 text-[13px] ${filter === site.id ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600"}`}>
                {clean(site.name)} ({anzahl})
              </button>
            );
          })}
        </div>

        {!gefiltert.length ? (
          <div className="rounded-2xl border border-paper-200 bg-white p-6 text-center">
            <p className="font-bold text-ink-800">Keine Artikel</p>
            <p className="mt-1 text-sm text-ink-400">Leg oben einen an. Ohne Artikel sieht der Mitarbeiter beim Bestellen nur das freie Feld.</p>
          </div>
        ) : null}

        {gruppen.map(([gruppe, zeilen]) => (
          <section key={gruppe} className="rounded-2xl border border-paper-200 bg-white p-4">
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

              <Field label="Bild-Adresse, optional"><input value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} placeholder="https://…" className={inputClass} /></Field>
              <Field label="Lieferant, optional"><input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} className={inputClass} /></Field>
              <Field label="Notiz, optional"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} className={inputClass} /></Field>

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
