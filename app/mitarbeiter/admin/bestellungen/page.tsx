"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Materialbestellungen.
 *
 * Eine Bestellung besteht aus mehreren Zeilen, eine je Artikel. Hier stehen
 * sie wieder als ein Vorgang.
 *
 * Das Objekt hängt an jeder Zeile. Kommt die Bestellung über den NFC-Aufkleber
 * am Objekt, steht es schon fest, bevor jemand tippt — deshalb ist die Spalte
 * Objekt nie leer, egal woher die Bestellung kam.
 */

type Row = Record<string, any>;

type Bestellung = {
  gruppe: string;
  nummer: string;
  objekt: string;
  objektId: string;
  adresse: string;
  person: string;
  eingang: string;
  status: string;
  kommentar: string;
  posten: Row[];
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function datumText(value?: unknown) {
  const text = clean(value);
  if (!text) return "–";
  const datum = new Date(text);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

/** Aus den Zeilen den Zustand der ganzen Bestellung ableiten. */
function zustandVon(posten: Row[]) {
  if (posten.some((p) => clean(p.billed_at))) return "billed";
  if (posten.every((p) => clean(p.status).toLowerCase() === "done")) return "done";
  if (posten.some((p) => clean(p.ordered_at))) return "ordered";
  return "open";
}

const ZUSTAENDE: Record<string, { label: string; ton: string }> = {
  open: { label: "Offen", ton: "bg-danger-500 text-white" },
  ordered: { label: "Bestellt", ton: "bg-amber-100 text-amber-800" },
  done: { label: "Erledigt", ton: "bg-success-100 text-success-700" },
  billed: { label: "Abgerechnet", ton: "bg-paper-200 text-ink-600" }
};

const feldClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

export default function BestellungenSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [articles, setArticles] = useState<Row[]>([]);
  const [lines, setLines] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);

  const [reiter, setReiter] = useState("offen");
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<Bestellung | null>(null);

  const [neuOffen, setNeuOffen] = useState(false);
  const [neuObjekt, setNeuObjekt] = useState("");
  const [neuKommentar, setNeuKommentar] = useState("");
  const [neuPerson, setNeuPerson] = useState("");
  const [neuArtikel, setNeuArtikel] = useState("");
  const [neuMenge, setNeuMenge] = useState("1");
  const [korb, setKorb] = useState<Array<{ id: string; name: string; menge: number }>>([]);

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/material", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Bestellungen konnten nicht geladen werden.");
      setArticles(ergebnis.articles || []);
      setLines(ergebnis.lines || []);
      setSites(ergebnis.sites || []);
      setEmployees(ergebnis.employees || []);
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Bestellungen konnten nicht geladen werden.");
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

  const bestellungen = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const zeile of lines) {
      // Ohne order_group auf den alten Weg zurückfallen: Minute und Objekt.
      const schluessel = clean(zeile.order_group) || `${clean(zeile.created_at).slice(0, 16)}|${clean(zeile.object_name || zeile.site)}`;
      map.set(schluessel, [...(map.get(schluessel) || []), zeile]);
    }
    return Array.from(map.entries()).map(([gruppe, posten]) => {
      const erste = posten[0] || {};
      const objektId = clean(erste.work_site_id);
      const objekt = sites.find((site) => site.id === objektId);
      return {
        gruppe,
        nummer: clean(erste.order_number) || "–",
        objekt: clean(erste.object_name || erste.site) || "Ohne Objekt",
        objektId,
        adresse: clean(objekt?.address),
        person: clean(erste.employee_name),
        eingang: clean(erste.created_at),
        status: zustandVon(posten),
        kommentar: clean(erste.comment || erste.notes),
        posten
      } as Bestellung;
    }).sort((a, b) => b.eingang.localeCompare(a.eingang));
  }, [lines, sites]);

  const gefiltert = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    return bestellungen.filter((bestellung) => {
      if (reiter === "offen" && !["open", "ordered"].includes(bestellung.status)) return false;
      if (reiter === "erledigt" && bestellung.status !== "done") return false;
      if (reiter === "abgerechnet" && bestellung.status !== "billed") return false;
      if (!needle) return true;
      return `${bestellung.nummer} ${bestellung.objekt} ${bestellung.person} ${bestellung.posten.map((p) => clean(p.material_name)).join(" ")}`.toLowerCase().includes(needle);
    });
  }, [bestellungen, reiter, suche]);

  const zaehler = useMemo(() => ({
    alle: bestellungen.length,
    offen: bestellungen.filter((b) => ["open", "ordered"].includes(b.status)).length,
    erledigt: bestellungen.filter((b) => b.status === "done").length,
    abgerechnet: bestellungen.filter((b) => b.status === "billed").length
  }), [bestellungen]);

  /** Artikel des gewählten Objekts, dazu die ohne Objektbindung. */
  const waehlbareArtikel = useMemo(() => {
    const objekt = sites.find((site) => site.id === neuObjekt);
    return articles.filter((artikel) => {
      const id = clean(artikel.work_site_id);
      const name = clean(artikel.object_name).toLowerCase();
      if (!id && !name) return true;
      if (neuObjekt && id === neuObjekt) return true;
      if (objekt && name === clean(objekt.name).toLowerCase()) return true;
      return false;
    });
  }, [articles, sites, neuObjekt]);

  function hinzufuegen() {
    const artikel = articles.find((row) => row.id === neuArtikel);
    if (!artikel) return;
    const menge = Math.max(1, Math.round(Number(neuMenge) || 1));
    setKorb((aktuell) => {
      const vorhanden = aktuell.find((p) => p.id === artikel.id);
      if (vorhanden) return aktuell.map((p) => (p.id === artikel.id ? { ...p, menge: p.menge + menge } : p));
      return [...aktuell, { id: artikel.id, name: clean(artikel.name), menge }];
    });
    setNeuArtikel("");
    setNeuMenge("1");
  }

  async function bestellen() {
    if (!neuObjekt) { setError("Bitte ein Objekt wählen."); return; }
    if (!korb.length) { setError("Bitte mindestens einen Artikel hinzufügen."); return; }
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/material", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          was: "bestellung",
          work_site_id: neuObjekt,
          comment: neuKommentar,
          employee_name: neuPerson,
          items: korb.map((p) => ({ id: p.id, name: p.name, menge: p.menge }))
        })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Bestellung konnte nicht angelegt werden.");
      setMessage(`Bestellung ${ergebnis.order_number} angelegt.`);
      setNeuOffen(false);
      setKorb([]);
      setNeuKommentar("");
      setNeuObjekt("");
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Bestellung konnte nicht angelegt werden.");
    } finally {
      setSaving(false);
    }
  }

  async function zustandSetzen(bestellung: Bestellung, status: string) {
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/material", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ was: "bestellung", order_group: bestellung.gruppe, status })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Änderung fehlgeschlagen.");
      setMessage(status === "done" ? "Als geliefert gebucht, Lagerbestand am Objekt erhöht." : "Zustand geändert.");
      setOffen(null);
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Änderung fehlgeschlagen.");
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
              <UiIcon name="box" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Bestellungen</h1>
          </div>
          <button onClick={() => { setNeuOffen(true); setError(null); setMessage(null); }} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white">
            + Bestellung erstellen
          </button>
        </header>

        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{message}</p> : null}

        <div className="mt-4 flex gap-6 overflow-x-auto border-b border-paper-200">
          {([["alle", "Alle", zaehler.alle], ["offen", "Offen", zaehler.offen], ["erledigt", "Erledigt", zaehler.erledigt], ["abgerechnet", "Abgerechnet", zaehler.abgerechnet]] as const).map(([wert, label, anzahl]) => (
            <button key={wert} onClick={() => setReiter(wert)} className={cx("relative -mb-px shrink-0 pb-3 text-[15px]", reiter === wert ? "font-semibold text-brand-700" : "text-ink-400")}>
              {label}{anzahl ? <span className="ml-1.5 text-[13px] text-ink-400">{anzahl}</span> : null}
              {reiter === wert ? <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-brand-600" /> : null}
            </button>
          ))}
        </div>

        <div className="mt-4 flex w-full max-w-[320px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
          <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">ID</th>
                <th className="px-3 py-3">Objekt</th>
                <th className="px-3 py-3">Mitarbeiter</th>
                <th className="px-3 py-3">Eingang</th>
                <th className="px-3 py-3">Artikel</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((bestellung) => {
                const zustand = ZUSTAENDE[bestellung.status] || ZUSTAENDE.open;
                return (
                  <tr key={bestellung.gruppe} onClick={() => setOffen(bestellung)} className="cursor-pointer border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                    <td className="px-4 py-3 text-[14px] font-semibold text-ink-900">#{bestellung.nummer}</td>
                    <td className="px-3 py-3">
                      {bestellung.adresse ? <span className="block text-[12px] text-ink-400">{bestellung.adresse}</span> : null}
                      <span className="text-[14px] text-ink-700">{bestellung.objekt}</span>
                    </td>
                    <td className="px-3 py-3 text-[14px] text-ink-700">{bestellung.person || "–"}</td>
                    <td className="px-3 py-3 text-[14px] text-ink-600">{datumText(bestellung.eingang)}</td>
                    <td className="px-3 py-3 text-[14px] text-ink-600">{bestellung.posten.length}</td>
                    <td className="px-3 py-3"><span className={cx("rounded-md px-2.5 py-1 text-[12px] font-bold", zustand.ton)}>{zustand.label}</span></td>
                  </tr>
                );
              })}
              {!gefiltert.length && !loading ? (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-[14px] text-ink-400">Keine Bestellungen in dieser Auswahl.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bestellung ansehen */}
      {offen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setOffen(null)}>
          <div className="flex max-h-[92dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <div>
                <p className="text-[19px] font-bold">Bestellung #{offen.nummer}</p>
                <p className="text-[13px] text-ink-400">{offen.objekt} · {datumText(offen.eingang)} · {offen.person || "ohne Person"}</p>
              </div>
              <button onClick={() => setOffen(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {offen.kommentar ? <p className="mb-3 rounded-xl bg-paper-100 px-4 py-3 text-[14px] text-ink-600">{offen.kommentar}</p> : null}
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                    <th className="py-2">Artikel</th><th className="py-2">Lieferant</th><th className="py-2 text-right">Anzahl</th>
                  </tr>
                </thead>
                <tbody>
                  {offen.posten.map((posten) => (
                    <tr key={posten.id} className="border-b border-paper-200 last:border-0">
                      <td className="py-2.5 text-[14px] font-medium">{clean(posten.material_name || posten.product_name) || "Material"}</td>
                      <td className="py-2.5 text-[13px] text-ink-500">{clean(posten.supplier) || "–"}</td>
                      <td className="py-2.5 text-right text-[14px] font-semibold">{Number(posten.quantity ?? posten.quantity_requested ?? 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-paper-200 px-5 py-3">
              <span className="flex-1 text-[13px] text-ink-400">Beim Liefern wird der Lagerbestand am Objekt erhöht.</span>
              {offen.status === "open" ? (
                <button onClick={() => zustandSetzen(offen, "ordered")} disabled={saving} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">Als bestellt merken</button>
              ) : null}
              {offen.status !== "done" && offen.status !== "billed" ? (
                <button onClick={() => zustandSetzen(offen, "done")} disabled={saving} className="rounded-xl bg-success-500 px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60">Geliefert</button>
              ) : null}
              {offen.status === "done" ? (
                <button onClick={() => zustandSetzen(offen, "billed")} disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60">Abgerechnet</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Neue Bestellung */}
      {neuOffen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setNeuOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[900px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <p className="text-[19px] font-bold">Neue Bestellung</p>
              <button onClick={() => setNeuOffen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <label className="block">
                <span className="block text-[13px] text-ink-500">Objekt <span className="text-danger-500">*</span></span>
                <select value={neuObjekt} onChange={(e) => { setNeuObjekt(e.target.value); setKorb([]); }} className={cx(feldClass, "mt-1.5")}>
                  <option value="">Objekt auswählen</option>
                  {sites.map((site) => <option key={site.id} value={site.id}>{clean(site.name)}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="block text-[13px] text-ink-500">Für wen</span>
                <select value={neuPerson} onChange={(e) => setNeuPerson(e.target.value)} className={cx(feldClass, "mt-1.5")}>
                  <option value="">Büro</option>
                  {employees.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="block text-[13px] text-ink-500">Kommentar</span>
                <textarea value={neuKommentar} onChange={(e) => setNeuKommentar(e.target.value)} rows={3} className={cx(feldClass, "mt-1.5")} />
              </label>

              <div className="border-t border-paper-200 pt-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-[220px] flex-1">
                    <span className="block text-[13px] text-ink-500">Artikel</span>
                    <select value={neuArtikel} onChange={(e) => setNeuArtikel(e.target.value)} disabled={!neuObjekt} className={cx(feldClass, "mt-1.5 disabled:bg-paper-100")}>
                      <option value="">{neuObjekt ? "Artikel auswählen" : "Erst Objekt wählen"}</option>
                      {waehlbareArtikel.map((artikel) => (
                        <option key={artikel.id} value={artikel.id}>
                          {clean(artikel.article_number) ? `${artikel.article_number} · ` : ""}{clean(artikel.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="w-[120px]">
                    <span className="block text-[13px] text-ink-500">Anzahl</span>
                    <input inputMode="numeric" value={neuMenge} onChange={(e) => setNeuMenge(e.target.value)} className={cx(feldClass, "mt-1.5")} />
                  </label>
                  <button onClick={hinzufuegen} disabled={!neuArtikel} className="rounded-xl bg-brand-600 px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40">Hinzufügen</button>
                </div>

                <table className="mt-4 w-full text-left">
                  <thead>
                    <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                      <th className="py-2">Artikel</th><th className="py-2">Lieferant</th><th className="py-2">Nummer</th><th className="py-2 text-right">Lagerbestand</th><th className="py-2 text-right">Anzahl</th><th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {korb.map((posten) => {
                      const artikel = articles.find((row) => row.id === posten.id);
                      return (
                        <tr key={posten.id} className="border-b border-paper-200 last:border-0">
                          <td className="py-2.5 text-[14px] font-medium">{posten.name}</td>
                          <td className="py-2.5 text-[13px] text-ink-500">{clean(artikel?.supplier) || "–"}</td>
                          <td className="py-2.5 text-[13px] text-ink-500">{clean(artikel?.article_number) || "–"}</td>
                          <td className="py-2.5 text-right text-[13px] text-ink-500">{Number(artikel?.current_stock || 0)}</td>
                          <td className="py-2.5 text-right text-[14px] font-semibold">{posten.menge}</td>
                          <td className="py-2.5 text-right">
                            <button onClick={() => setKorb((aktuell) => aktuell.filter((p) => p.id !== posten.id))} className="text-[13px] font-semibold text-rose-600">Entfernen</button>
                          </td>
                        </tr>
                      );
                    })}
                    {!korb.length ? <tr><td colSpan={6} className="py-8 text-center text-[13px] text-ink-300">Noch nichts hinzugefügt.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-paper-200 px-5 py-3">
              <span className="flex-1 text-[13px] text-ink-400">{korb.length ? `${korb.length} ${korb.length === 1 ? "Posten" : "Posten"}` : ""}</span>
              <button onClick={() => setNeuOffen(false)} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700">Abbrechen</button>
              <button onClick={bestellen} disabled={saving || !korb.length || !neuObjekt} className="rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50">
                {saving ? "Sende…" : "Bestellen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
