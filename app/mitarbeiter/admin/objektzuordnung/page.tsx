"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Welche Objekte ein Mitarbeiter sieht.
 *
 * Hier wird abgehakt, wo jemand regelmäßig ist. Objekte mit einem Einsatz auf
 * ihn sieht er ohnehin — das steht als Hinweis daneben, damit niemand rätselt,
 * warum ein Objekt auftaucht, das hier nicht angehakt ist.
 */

type Row = Record<string, any>;

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

export default function ObjektzuordnungSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [fromTasks, setFromTasks] = useState<Record<string, string[]>>({});

  const [aktiv, setAktiv] = useState("");
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [suche, setSuche] = useState("");

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/objektzuordnung", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Zuordnung konnte nicht geladen werden.");
      setEmployees(ergebnis.employees || []);
      setSites(ergebnis.sites || []);
      setAssignments(ergebnis.assignments || []);
      setFromTasks(ergebnis.fromTasks || {});
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Zuordnung konnte nicht geladen werden.");
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

  // Beim Wechsel des Mitarbeiters die Haken aus der Datenbank übernehmen.
  useEffect(() => {
    if (!aktiv) {
      setGewaehlt(new Set());
      return;
    }
    const eigene = assignments
      .filter((zeile) => clean(zeile.employee_name) === aktiv)
      .map((zeile) => clean(zeile.work_site_id))
      .filter(Boolean);
    setGewaehlt(new Set(eigene));
  }, [aktiv, assignments]);

  // Ersten Mitarbeiter vorwählen, damit die Seite nicht leer wirkt.
  useEffect(() => {
    if (!aktiv && employees.length) setAktiv(clean(employees[0].name));
  }, [aktiv, employees]);

  const anzahlProMitarbeiter = useMemo(() => {
    const map = new Map<string, number>();
    for (const zeile of assignments) {
      const name = clean(zeile.employee_name);
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    return map;
  }, [assignments]);

  const ausEinsaetzen = useMemo(() => new Set(fromTasks[aktiv] || []), [fromTasks, aktiv]);

  const sichtbareObjekte = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    if (!needle) return sites;
    return sites.filter((site) => `${clean(site.name)} ${clean(site.customer_name)} ${clean(site.address)}`.toLowerCase().includes(needle));
  }, [sites, suche]);

  function umschalten(id: string) {
    setGewaehlt((aktuell) => {
      const naechste = new Set(aktuell);
      if (naechste.has(id)) naechste.delete(id);
      else naechste.add(id);
      return naechste;
    });
  }

  async function speichern() {
    if (!aktiv) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const antwort = await fetch("/api/admin/objektzuordnung", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeName: aktiv, workSiteIds: Array.from(gewaehlt) })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");
      setMessage(`${aktiv}: ${ergebnis.count} ${ergebnis.count === 1 ? "Objekt" : "Objekte"} zugeordnet.`);
      await load();
    } catch (speicherFehler) {
      setError(speicherFehler instanceof Error ? speicherFehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-ink-400">Lade Anmeldung…</div></Shell>;
  if (!token) return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</div></Shell>;

  return (
    <Shell>
      <div className="space-y-4 pb-28">
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Schichtklar Admin</p>
          <h1 className="text-3xl font-bold">Objekte je Mitarbeiter</h1>
          <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-ink-400">
            Hier steht, wo jemand regelmäßig ist. In der App sieht er genau diese Objekte, dazu die, an denen
            gerade ein Einsatz auf ihn läuft. Alles andere bleibt für ihn unsichtbar.
          </p>
        </header>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {message && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">{message}</p>}
        {loading && <p className="rounded-2xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700">Lade…</p>}

        <div className="flex flex-wrap gap-2">
          {employees.map((mitarbeiter) => {
            const name = clean(mitarbeiter.name);
            const anzahl = anzahlProMitarbeiter.get(name) || 0;
            return (
              <button
                key={mitarbeiter.id}
                onClick={() => setAktiv(name)}
                className={`shrink-0 rounded-full border px-4 py-2 text-[13px] ${aktiv === name ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600"}`}
              >
                {name} ({anzahl})
              </button>
            );
          })}
          {!employees.length && !loading ? <p className="text-sm text-ink-400">Keine aktiven Mitarbeiter.</p> : null}
        </div>

        {aktiv ? (
          <section className="rounded-2xl border border-paper-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{aktiv}</p>
                <p className="text-xs text-ink-400">{gewaehlt.size} von {sites.length} Objekten angehakt</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setGewaehlt(new Set(sites.map((site) => clean(site.id))))} className="rounded-xl border border-paper-300 px-3 py-2 text-xs font-bold text-ink-600">Alle</button>
                <button onClick={() => setGewaehlt(new Set())} className="rounded-xl border border-paper-300 px-3 py-2 text-xs font-bold text-ink-600">Keins</button>
              </div>
            </div>

            <input value={suche} onChange={(event) => setSuche(event.target.value)} placeholder="Objekt oder Kunde suchen…" className={inputClass} />

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {sichtbareObjekte.map((site) => {
                const id = clean(site.id);
                const angehakt = gewaehlt.has(id);
                const durchEinsatz = ausEinsaetzen.has(id);
                return (
                  <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${angehakt ? "border-brand-500/50 bg-brand-50" : "border-paper-200"}`}>
                    <input type="checkbox" checked={angehakt} onChange={() => umschalten(id)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink-900">{clean(site.name) || "Objekt ohne Namen"}</span>
                      <span className="block truncate text-[12px] text-ink-400">{clean(site.customer_name) || clean(site.address) || "Keine Angabe"}</span>
                      {durchEinsatz && !angehakt ? (
                        <span className="mt-1 block text-[12px] text-amber-700">Sieht er ohnehin, dort läuft ein Einsatz auf ihn</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
              {!sichtbareObjekte.length ? <p className="text-sm text-ink-400">Kein Objekt gefunden.</p> : null}
            </div>
          </section>
        ) : null}
      </div>

      {aktiv ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-paper-200 bg-white px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto max-w-[520px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8">
            <button onClick={speichern} disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white disabled:opacity-60">
              {saving ? "Speichere…" : `Für ${aktiv} speichern`}
            </button>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
