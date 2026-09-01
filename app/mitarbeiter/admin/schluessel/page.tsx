"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Schlüssel.
 *
 * Ein Schlüssel gehört zu einem Objekt und liegt entweder im Büro oder bei
 * einer Person. Das Wichtige ist nicht die Liste, sondern die Kette: wer hat
 * ihn seit wann. Geht einer verloren, muss in fünf Sekunden klar sein, wer ihn
 * zuletzt hatte — sonst wird die Schließanlage teuer.
 *
 * Übergabe und Rückgabe sind deshalb eigene Knöpfe mit Datum, kein Namensfeld,
 * das jemand still überschreibt.
 */

type Row = Record<string, any>;

const ZUSTAENDE = [
  { code: "im_buero", label: "Im Büro", ton: "bg-paper-200 text-ink-600" },
  { code: "ausgegeben", label: "Ausgegeben", ton: "bg-brand-100 text-brand-700" },
  { code: "verloren", label: "Verloren", ton: "bg-danger-100 text-danger-700" }
];

const leererSchluessel: Row = {
  id: "",
  key_name: "",
  key_number: "",
  key_identifier: "",
  key_count: "1",
  work_site_id: "",
  employee_name: "",
  handover_date: "",
  notes: ""
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function datumText(value?: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return "–";
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

function zustandVon(schluessel: Row) {
  const code = clean(schluessel.status).toLowerCase();
  if (code === "verloren") return ZUSTAENDE[2];
  if (clean(schluessel.employee_name)) return ZUSTAENDE[1];
  return ZUSTAENDE[0];
}

/** Wie lange jemand den Schlüssel schon hat. */
function seitTagen(value?: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return null;
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - datum.getTime()) / 86400000));
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

export default function SchluesselSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [setupFehlt, setSetupFehlt] = useState(false);

  const [keys, setKeys] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);

  const [reiter, setReiter] = useState<"alle" | "ausgegeben" | "buero" | "verloren">("alle");
  const [suche, setSuche] = useState("");
  const [objektFilter, setObjektFilter] = useState("");

  const [blattOffen, setBlattOffen] = useState(false);
  const [form, setForm] = useState<Row>({ ...leererSchluessel });
  const [uebergabe, setUebergabe] = useState<Row | null>(null);
  const [uebergabePerson, setUebergabePerson] = useState("");

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/schluessel", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Schlüssel konnten nicht geladen werden.");
      setSetupFehlt(Boolean(ergebnis.setupFehlt));
      setKeys(ergebnis.keys || []);
      setSites(ergebnis.sites || []);
      setEmployees(ergebnis.employees || []);
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Schlüssel konnten nicht geladen werden.");
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
    return keys.filter((schluessel) => {
      const zustand = zustandVon(schluessel).code;
      if (reiter === "ausgegeben" && zustand !== "ausgegeben") return false;
      if (reiter === "buero" && zustand !== "im_buero") return false;
      if (reiter === "verloren" && zustand !== "verloren") return false;
      if (objektFilter && clean(schluessel.work_site_id) !== objektFilter) return false;
      if (!needle) return true;
      return `${clean(schluessel.key_name)} ${clean(schluessel.key_number)} ${clean(schluessel.key_identifier)} ${clean(schluessel.object_name)} ${clean(schluessel.employee_name)}`.toLowerCase().includes(needle);
    });
  }, [keys, reiter, suche, objektFilter]);

  const zaehler = useMemo(() => ({
    alle: keys.length,
    ausgegeben: keys.filter((s) => zustandVon(s).code === "ausgegeben").length,
    buero: keys.filter((s) => zustandVon(s).code === "im_buero").length,
    verloren: keys.filter((s) => zustandVon(s).code === "verloren").length
  }), [keys]);

  function neu() {
    setForm({ ...leererSchluessel, work_site_id: objektFilter });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  function bearbeiten(schluessel: Row) {
    setForm({
      ...leererSchluessel,
      ...schluessel,
      key_count: String(schluessel.key_count ?? "1"),
      handover_date: clean(schluessel.handover_date).slice(0, 10),
      work_site_id: clean(schluessel.work_site_id)
    });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  async function speichern(weitere = false) {
    if (!clean(form.work_site_id)) { setError("Bitte ein Objekt wählen. Ein Schlüssel ohne Schloss ist kein Schlüssel."); return; }
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/schluessel", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");
      setMessage(form.id ? "Schlüssel gespeichert." : `Schlüssel ${clean(ergebnis.item?.key_number) || ""} angelegt.`);
      if (weitere) setForm({ ...leererSchluessel, work_site_id: form.work_site_id });
      else setBlattOffen(false);
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function vorgang(schluessel: Row, welcher: "uebergeben" | "zurueck" | "verloren", person?: string) {
    if (welcher === "verloren" && !window.confirm("Schlüssel als verloren melden? Das bleibt in der Historie stehen.")) return;
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/schluessel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: schluessel.id, vorgang: welcher, employee_name: person })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Vorgang fehlgeschlagen.");
      setMessage(
        welcher === "uebergeben" ? `Übergeben an ${person}.`
          : welcher === "zurueck" ? "Zurück im Büro."
            : "Als verloren gemeldet."
      );
      setUebergabe(null);
      setUebergabePerson("");
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Vorgang fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Lade Anmeldung…</main>;
  if (!token) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</main>;

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="px-4 py-5 md:px-6 xl:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
              <UiIcon name="key" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Schlüssel</h1>
          </div>
          <button onClick={neu} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white">+ Schlüssel anlegen</button>
        </header>

        {setupFehlt ? <p className="mt-4 rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">Die Schlüsseltabelle fehlt noch in der Datenbank.</p> : null}
        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{message}</p> : null}

        {zaehler.verloren > 0 ? (
          <p className="mt-4 rounded-xl border border-danger-500/40 bg-danger-50 px-4 py-3 text-[14px] text-danger-700">
            {zaehler.verloren} {zaehler.verloren === 1 ? "Schlüssel gilt" : "Schlüssel gelten"} als verloren. Prüf, ob die Schließanlage getauscht werden muss.
          </p>
        ) : null}

        <div className="mt-4 flex gap-6 overflow-x-auto border-b border-paper-200">
          {([["alle", "Alle", zaehler.alle], ["ausgegeben", "Ausgegeben", zaehler.ausgegeben], ["buero", "Im Büro", zaehler.buero], ["verloren", "Verloren", zaehler.verloren]] as const).map(([wert, label, anzahl]) => (
            <button key={wert} onClick={() => setReiter(wert)} className={cx("relative -mb-px shrink-0 pb-3 text-[15px]", reiter === wert ? "font-semibold text-brand-700" : "text-ink-400")}>
              {label}{anzahl ? <span className="ml-1.5 text-[13px] text-ink-400">{anzahl}</span> : null}
              {reiter === wert ? <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-brand-600" /> : null}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex w-full max-w-[300px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
            <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Nummer, Kennung, Objekt, Person" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
          </div>
          <select value={objektFilter} onChange={(e) => setObjektFilter(e.target.value)} className="rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-[14px] text-ink-700 outline-none">
            <option value="">Alle Objekte</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{clean(site.name)}</option>)}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
          <table className="w-full min-w-[960px] text-left">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Nr.</th>
                <th className="px-3 py-3">Titel</th>
                <th className="px-3 py-3">Kennung</th>
                <th className="px-3 py-3">Objekt</th>
                <th className="px-3 py-3">Wer hat ihn</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Vorgang</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((schluessel) => {
                const zustand = zustandVon(schluessel);
                const tage = seitTagen(schluessel.handover_date);
                return (
                  <tr key={schluessel.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                    <td onClick={() => bearbeiten(schluessel)} className="cursor-pointer px-4 py-3 font-mono text-[14px] font-semibold text-ink-800">{clean(schluessel.key_number) || "–"}</td>
                    <td onClick={() => bearbeiten(schluessel)} className="cursor-pointer px-3 py-3 text-[15px] font-medium text-ink-900">
                      {clean(schluessel.key_name) || "Ohne Titel"}
                      {Number(schluessel.key_count) > 1 ? <span className="ml-2 rounded bg-paper-200 px-1.5 py-0.5 text-[11px] font-semibold text-ink-600">{schluessel.key_count} Stück</span> : null}
                    </td>
                    <td onClick={() => bearbeiten(schluessel)} className="cursor-pointer px-3 py-3 font-mono text-[13px] text-ink-500">{clean(schluessel.key_identifier) || "–"}</td>
                    <td onClick={() => bearbeiten(schluessel)} className="cursor-pointer px-3 py-3">
                      <span className="block text-[14px] text-ink-700">{clean(schluessel.object_name) || "–"}</span>
                      {clean(schluessel.customer_name) ? <span className="block text-[12px] text-ink-400">{clean(schluessel.customer_name)}</span> : null}
                    </td>
                    <td onClick={() => bearbeiten(schluessel)} className="cursor-pointer px-3 py-3">
                      {clean(schluessel.employee_name) ? (
                        <>
                          <span className="block text-[14px] font-medium text-ink-800">{clean(schluessel.employee_name)}</span>
                          <span className="block text-[12px] text-ink-400">
                            seit {datumText(schluessel.handover_date)}{tage !== null ? ` · ${tage} ${tage === 1 ? "Tag" : "Tage"}` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-[14px] text-ink-400">niemand</span>
                      )}
                    </td>
                    <td onClick={() => bearbeiten(schluessel)} className="cursor-pointer px-3 py-3">
                      <span className={cx("rounded-md px-2 py-1 text-[12px] font-semibold", zustand.ton)}>{zustand.label}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {zustand.code === "ausgegeben" ? (
                          <button onClick={() => vorgang(schluessel, "zurueck")} disabled={saving} className="rounded-lg border border-paper-300 px-2.5 py-1.5 text-[12px] font-semibold text-ink-700 disabled:opacity-50">Zurück</button>
                        ) : zustand.code === "im_buero" ? (
                          <button onClick={() => { setUebergabe(schluessel); setUebergabePerson(""); }} disabled={saving} className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">Übergeben</button>
                        ) : null}
                        {zustand.code !== "verloren" ? (
                          <button onClick={() => vorgang(schluessel, "verloren")} disabled={saving} className="rounded-lg border border-danger-300 px-2.5 py-1.5 text-[12px] font-semibold text-danger-600 disabled:opacity-50">Verloren</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!gefiltert.length && !loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[14px] text-ink-400">Kein Schlüssel in dieser Auswahl.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Übergeben */}
      {uebergabe ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4" onClick={() => setUebergabe(null)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-[18px] font-bold">Schlüssel übergeben</p>
            <p className="mt-1 text-[14px] text-ink-400">
              {clean(uebergabe.key_name) || "Schlüssel"} · {clean(uebergabe.object_name) || "ohne Objekt"}
            </p>
            <div className="mt-4">
              <Feld label="An wen" pflicht>
                <select value={uebergabePerson} onChange={(e) => setUebergabePerson(e.target.value)} className={feldClass}>
                  <option value="">Person auswählen</option>
                  {employees.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                </select>
              </Feld>
            </div>
            <p className="mt-3 text-[13px] text-ink-400">Das Datum von heute wird gestempelt, und die Person bekommt eine Meldung.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setUebergabe(null)} className="flex-1 rounded-xl border border-paper-300 py-2.5 text-[14px] font-semibold text-ink-700">Abbrechen</button>
              <button onClick={() => vorgang(uebergabe, "uebergeben", uebergabePerson)} disabled={saving || !uebergabePerson} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50">Übergeben</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Anlegen und ändern */}
      {blattOffen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setBlattOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <p className="text-[19px] font-bold">{form.id ? "Schlüssel ändern" : "Neuen Schlüssel anlegen"}</p>
              <button onClick={() => setBlattOffen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <Feld label="Titel" hinweis="Wofür er ist, zum Beispiel Haupteingang oder Putzraum.">
                <input value={form.key_name} onChange={(e) => setForm({ ...form, key_name: e.target.value })} className={feldClass} />
              </Feld>

              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="Nummer" hinweis={form.id ? undefined : "Wird vergeben, wenn leer."}>
                  <input value={form.key_number} onChange={(e) => setForm({ ...form, key_number: e.target.value })} className={feldClass} />
                </Feld>
                <Feld label="Anzahl" hinweis="Wenn mehrere gleiche Schlüssel im Umlauf sind.">
                  <input inputMode="numeric" value={form.key_count} onChange={(e) => setForm({ ...form, key_count: e.target.value })} className={feldClass} />
                </Feld>
              </div>

              <Feld label="Schlüsselkennung" hinweis="Die Prägung auf dem Schlüssel. Danach fragt der Schlüsseldienst.">
                <input value={form.key_identifier} onChange={(e) => setForm({ ...form, key_identifier: e.target.value })} className={feldClass} />
              </Feld>

              <Feld label="Objekt" pflicht hinweis="Ein Schlüssel ohne Schloss ist kein Schlüssel.">
                <select value={form.work_site_id} onChange={(e) => setForm({ ...form, work_site_id: e.target.value })} className={feldClass}>
                  <option value="">Objekt auswählen</option>
                  {sites.map((site) => <option key={site.id} value={site.id}>{clean(site.name)}</option>)}
                </select>
              </Feld>

              {form.id ? (
                <div className="rounded-2xl border border-paper-200 bg-paper-100/70 p-3">
                  <p className="text-[13px] font-semibold text-ink-700">Aktuell</p>
                  <p className="mt-1 text-[14px] text-ink-600">
                    {clean(form.employee_name)
                      ? `Bei ${clean(form.employee_name)} seit ${datumText(form.handover_date)}.`
                      : "Liegt im Büro."}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-400">Übergeben und Zurücknehmen läuft über die Knöpfe in der Liste, damit das Datum stimmt.</p>
                </div>
              ) : (
                <Feld label="Gleich übergeben an" hinweis="Kann auch später über die Liste passieren.">
                  <select value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value, handover_date: e.target.value ? new Date().toISOString().slice(0, 10) : "" })} className={feldClass}>
                    <option value="">Niemand, bleibt im Büro</option>
                    {employees.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                  </select>
                </Feld>
              )}

              <Feld label="Kommentar"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={feldClass} /></Feld>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-paper-200 px-5 py-3">
              <span className="flex-1" />
              {!form.id ? (
                <button onClick={() => speichern(true)} disabled={saving} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">Weiteren anlegen</button>
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
