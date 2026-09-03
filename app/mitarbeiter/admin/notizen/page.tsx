"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Notizzettel: kurzfristige Dinge mit Fälligkeit.
 *
 * Der Zweck ist das Aufschreiben, nicht das Verwalten. Deshalb steht oben eine
 * Zeile, in die man tippt und Enter drückt — kein Dialog, kein Pflichtfeld
 * außer dem Satz selbst. Alles Weitere lässt sich später nachtragen.
 *
 * Sortiert wird nach Fälligkeit, nicht nach Anlagedatum. Die Spalten sind
 * keine Zustände, die man von Hand weiterschiebt, sondern das Datum: was
 * überfällig ist, wandert von selbst nach links. Ein Board, das man pflegen
 * muss, pflegt am Ende niemand.
 */

type Notiz = {
  id: string;
  titel: string;
  beschreibung: string | null;
  faellig_am: string | null;
  uhrzeit: string | null;
  wichtig: boolean;
  erledigt: boolean;
  erledigt_am: string | null;
  bereich: string | null;
  work_site_id: string | null;
  object_name: string | null;
  created_at: string;
};

type Row = Record<string, any>;

const leereNotiz: Row = {
  id: "",
  titel: "",
  beschreibung: "",
  faellig_am: "",
  uhrzeit: "",
  wichtig: false,
  bereich: "",
  work_site_id: ""
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function heuteIso() {
  const jetzt = new Date();
  return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-${String(jetzt.getDate()).padStart(2, "0")}`;
}

function tageSpaeter(tage: number) {
  const datum = new Date();
  datum.setDate(datum.getDate() + tage);
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(datum.getDate()).padStart(2, "0")}`;
}

function datumText(wert?: string | null) {
  const text = clean(wert).slice(0, 10);
  if (!text) return "";
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(datum);
}

/**
 * In welche Spalte ein Zettel gehört. Allein aus dem Datum, nichts wird von
 * Hand verschoben.
 */
function spalteVon(notiz: Notiz) {
  const datum = clean(notiz.faellig_am).slice(0, 10);
  if (!datum) return "ohne";
  const heute = heuteIso();
  if (datum < heute) return "ueberfaellig";
  if (datum === heute) return "heute";
  if (datum <= tageSpaeter(7)) return "woche";
  return "spaeter";
}

const SPALTEN = [
  { schluessel: "ueberfaellig", titel: "Überfällig", ton: "text-danger-600", rand: "border-danger-500/40" },
  { schluessel: "heute", titel: "Heute", ton: "text-brand-700", rand: "border-brand-500/40" },
  { schluessel: "woche", titel: "Diese Woche", ton: "text-ink-700", rand: "border-paper-200" },
  { schluessel: "spaeter", titel: "Später", ton: "text-ink-500", rand: "border-paper-200" },
  { schluessel: "ohne", titel: "Ohne Datum", ton: "text-ink-400", rand: "border-paper-200" }
];

const feldClass =
  "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

function Feld({ label, hinweis, children }: { label: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-ink-500">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hinweis ? <span className="mt-1 block text-[12px] text-ink-400">{hinweis}</span> : null}
    </label>
  );
}

export default function NotizenSeite() {
  const [token, setToken] = useState("");
  const [authLaden, setAuthLaden] = useState(true);
  const [laden, setLaden] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [setupFehlt, setSetupFehlt] = useState(false);

  const [notizen, setNotizen] = useState<Notiz[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [bereiche, setBereiche] = useState<string[]>([]);

  const [schnellText, setSchnellText] = useState("");
  const [schnellDatum, setSchnellDatum] = useState("");
  const [blatt, setBlatt] = useState<Row | null>(null);
  const [erledigteZeigen, setErledigteZeigen] = useState(false);
  const [bereichFilter, setBereichFilter] = useState("");

  const holen = useCallback(async (aktuellerToken?: string) => {
    const t = aktuellerToken || token;
    if (!t) return;
    setLaden(true);
    setFehler(null);
    try {
      const antwort = await fetch("/api/admin/notizen", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Notizen konnten nicht geladen werden.");
      setSetupFehlt(Boolean(ergebnis.setupFehlt));
      setNotizen(ergebnis.notizen || []);
      setSites(ergebnis.sites || []);
      setBereiche(ergebnis.bereiche || []);
    } catch (ladeFehler) {
      setFehler(ladeFehler instanceof Error ? ladeFehler.message : "Notizen konnten nicht geladen werden.");
    } finally {
      setLaden(false);
    }
  }, [token]);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const sessionToken = data.session?.access_token || "";
      setToken(sessionToken);
      setAuthLaden(false);
      if (sessionToken) await holen(sessionToken);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offene = useMemo(
    () => notizen.filter((notiz) => !notiz.erledigt && (!bereichFilter || clean(notiz.bereich) === bereichFilter)),
    [notizen, bereichFilter]
  );
  const erledigte = useMemo(
    () => notizen.filter((notiz) => notiz.erledigt).slice(0, 40),
    [notizen]
  );

  const nachSpalte = useMemo(() => {
    const topf: Record<string, Notiz[]> = { ueberfaellig: [], heute: [], woche: [], spaeter: [], ohne: [] };
    for (const notiz of offene) topf[spalteVon(notiz)].push(notiz);
    for (const schluessel of Object.keys(topf)) {
      topf[schluessel].sort((a, b) => {
        if (a.wichtig !== b.wichtig) return a.wichtig ? -1 : 1;
        const datumA = `${clean(a.faellig_am)}${clean(a.uhrzeit)}`;
        const datumB = `${clean(b.faellig_am)}${clean(b.uhrzeit)}`;
        return datumA.localeCompare(datumB);
      });
    }
    return topf;
  }, [offene]);

  /** Eine Zeile tippen, Enter, fertig. Alles Weitere kann man nachtragen. */
  async function schnellAnlegen() {
    const titel = schnellText.trim();
    if (!titel) return;
    setSpeichert(true);
    setFehler(null);
    try {
      const antwort = await fetch("/api/admin/notizen", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ titel, faellig_am: schnellDatum || null, bereich: bereichFilter || null })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Konnte nicht gespeichert werden.");
      setSchnellText("");
      await holen();
    } catch (speicherFehler) {
      setFehler(speicherFehler instanceof Error ? speicherFehler.message : "Konnte nicht gespeichert werden.");
    } finally {
      setSpeichert(false);
    }
  }

  async function abhaken(notiz: Notiz) {
    // Sofort umschalten, damit der Haken nicht auf den Server wartet.
    setNotizen((vorher) => vorher.map((eintrag) => (eintrag.id === notiz.id ? { ...eintrag, erledigt: !eintrag.erledigt } : eintrag)));
    try {
      await fetch("/api/admin/notizen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: notiz.id, erledigt: !notiz.erledigt })
      });
      await holen();
    } catch {
      await holen();
    }
  }

  async function blattSpeichern() {
    if (!blatt || !clean(blatt.titel)) { setFehler("Bitte etwas eintragen."); return; }
    setSpeichert(true);
    setFehler(null);
    try {
      const antwort = await fetch("/api/admin/notizen", {
        method: blatt.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(blatt)
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");
      setBlatt(null);
      await holen();
    } catch (speicherFehler) {
      setFehler(speicherFehler instanceof Error ? speicherFehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSpeichert(false);
    }
  }

  async function loeschen(id: string) {
    if (!window.confirm("Diese Notiz wirklich löschen? Abhaken reicht meistens — dann bleibt sie nachlesbar.")) return;
    setSpeichert(true);
    try {
      await fetch(`/api/admin/notizen?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setBlatt(null);
      await holen();
    } finally {
      setSpeichert(false);
    }
  }

  function Zettel({ notiz }: { notiz: Notiz }) {
    return (
      <div className={cx("group rounded-xl border bg-white p-3 transition hover:shadow-sm", notiz.wichtig ? "border-amber-400" : "border-paper-200")}>
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={() => abhaken(notiz)}
            aria-label={notiz.erledigt ? "Wieder aufmachen" : "Abhaken"}
            className={cx(
              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition",
              notiz.erledigt ? "border-success-500 bg-success-500 text-white" : "border-paper-300 hover:border-brand-500"
            )}
          >
            {notiz.erledigt ? <UiIcon name="check" className="h-3 w-3" /> : null}
          </button>
          <button
            type="button"
            onClick={() => setBlatt({ ...leereNotiz, ...notiz, faellig_am: clean(notiz.faellig_am).slice(0, 10), uhrzeit: clean(notiz.uhrzeit).slice(0, 5) })}
            className="min-w-0 flex-1 text-left"
          >
            <span className={cx("block text-[14px] leading-snug", notiz.erledigt ? "text-ink-400 line-through" : "text-ink-900")}>
              {notiz.wichtig ? <span className="text-amber-500">★ </span> : null}
              {notiz.titel}
            </span>
            {notiz.beschreibung ? (
              <span className="mt-0.5 block line-clamp-2 text-[12px] text-ink-400">{notiz.beschreibung}</span>
            ) : null}
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {notiz.faellig_am ? (
                <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", spalteVon(notiz) === "ueberfaellig" ? "bg-danger-100 text-danger-700" : "bg-paper-200 text-ink-600")}>
                  {datumText(notiz.faellig_am)}
                  {notiz.uhrzeit ? ` · ${clean(notiz.uhrzeit).slice(0, 5)}` : ""}
                </span>
              ) : null}
              {notiz.bereich ? <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">{notiz.bereich}</span> : null}
              {notiz.object_name ? <span className="text-[11px] text-ink-400">{notiz.object_name}</span> : null}
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (authLaden) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-ink-400">Lade Login …</main>;
  if (!token) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-paper-100 px-4 text-center">
        <p className="text-[15px] text-ink-500">Bitte anmelden.</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="mx-auto min-h-[100dvh] max-w-[520px] px-4 py-5 md:mx-0 md:max-w-[1400px] md:px-6 xl:px-8" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Verwaltung</p>
            <h1 className="text-3xl font-bold">Notizen</h1>
            <p className="mt-1 text-[14px] text-ink-500">Was kurzfristig ansteht. Die Spalten macht das Datum, nicht du.</p>
          </div>
          <button
            type="button"
            onClick={() => setBlatt({ ...leereNotiz, faellig_am: schnellDatum || "" })}
            className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700"
          >
            Mit allen Feldern
          </button>
        </div>

        {setupFehlt ? (
          <div className="mt-4 rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">
            Die Notiztabelle fehlt noch. Führe <code className="font-mono">supabase/notizen.sql</code> im Supabase-Editor aus.
          </div>
        ) : null}
        {fehler ? <div className="mt-4 rounded-xl bg-danger-100 px-4 py-3 text-[14px] text-danger-700">{fehler}</div> : null}

        {/* Schnelleingabe: eine Zeile, Enter, fertig. */}
        <div className="mt-5 rounded-2xl border border-paper-200 bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={schnellText}
              onChange={(e) => setSchnellText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") schnellAnlegen(); }}
              placeholder="Was steht an? Tippen und Enter."
              className="min-w-0 flex-1 rounded-xl border border-paper-200 px-4 py-3 text-[15px] outline-none focus:border-brand-500"
            />
            <input
              type="date"
              value={schnellDatum}
              onChange={(e) => setSchnellDatum(e.target.value)}
              className="rounded-xl border border-paper-200 px-4 py-3 text-[15px] outline-none focus:border-brand-500 sm:w-[170px]"
            />
            <button
              type="button"
              disabled={!schnellText.trim() || speichert}
              onClick={schnellAnlegen}
              className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40"
            >
              Merken
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-ink-400">Fällig:</span>
            {([["Heute", heuteIso()], ["Morgen", tageSpaeter(1)], ["In einer Woche", tageSpaeter(7)], ["Ohne Datum", ""]] as const).map(([label, wert]) => (
              <button
                key={label}
                type="button"
                onClick={() => setSchnellDatum(wert)}
                className={cx(
                  "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition",
                  schnellDatum === wert ? "bg-ink-900 text-white" : "bg-paper-100 text-ink-500 hover:bg-paper-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {bereiche.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-ink-400">Bereich</span>
            <button
              type="button"
              onClick={() => setBereichFilter("")}
              className={cx("rounded-lg px-3 py-1.5 text-[13px] font-semibold", !bereichFilter ? "bg-ink-900 text-white" : "border border-paper-200 bg-white text-ink-500")}
            >
              Alle
            </button>
            {bereiche.map((bereich) => (
              <button
                key={bereich}
                type="button"
                onClick={() => setBereichFilter(bereich === bereichFilter ? "" : bereich)}
                className={cx("rounded-lg px-3 py-1.5 text-[13px] font-semibold", bereichFilter === bereich ? "bg-ink-900 text-white" : "border border-paper-200 bg-white text-ink-500")}
              >
                {bereich}
              </button>
            ))}
          </div>
        ) : null}

        {/* Das Board */}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {SPALTEN.map((spalte) => {
            const zettel = nachSpalte[spalte.schluessel] || [];
            return (
              <div key={spalte.schluessel} className={cx("rounded-2xl border bg-paper-100/60 p-3", spalte.rand)}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cx("text-[13px] font-bold uppercase tracking-wide", spalte.ton)}>{spalte.titel}</p>
                  <span className="text-[13px] font-semibold text-ink-400">{zettel.length || ""}</span>
                </div>
                <div className="mt-2.5 space-y-2">
                  {zettel.length === 0 ? (
                    <p className="py-4 text-center text-[13px] text-ink-300">–</p>
                  ) : (
                    zettel.map((notiz) => <Zettel key={notiz.id} notiz={notiz} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Erledigtes wird weggeräumt, nicht gelöscht. */}
        {erledigte.length ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setErledigteZeigen((wert) => !wert)}
              className="flex items-center gap-2 text-[14px] font-semibold text-ink-500"
            >
              <UiIcon name={erledigteZeigen ? "chevronDown" : "chevronRight"} className="h-4 w-4" />
              Erledigt ({erledigte.length})
            </button>
            {erledigteZeigen ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {erledigte.map((notiz) => <Zettel key={notiz.id} notiz={notiz} />)}
              </div>
            ) : null}
          </div>
        ) : null}

        {!laden && !offene.length && !erledigte.length && !setupFehlt ? (
          <p className="mt-8 text-center text-[15px] text-ink-400">Noch nichts notiert. Schreib oben rein, was dir gerade einfällt.</p>
        ) : null}
      </div>

      {/* Blatt mit allen Feldern */}
      {blatt ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-6" onClick={() => setBlatt(null)}>
          <div className="max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[18px] font-bold">{blatt.id ? "Notiz bearbeiten" : "Neue Notiz"}</h3>
              <button type="button" onClick={() => setBlatt(null)} className="text-ink-400">
                <UiIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <Feld label="Was steht an">
                <input value={clean(blatt.titel)} onChange={(e) => setBlatt({ ...blatt, titel: e.target.value })} className={feldClass} />
              </Feld>
              <Feld label="Mehr dazu, optional">
                <textarea rows={3} value={clean(blatt.beschreibung)} onChange={(e) => setBlatt({ ...blatt, beschreibung: e.target.value })} className={feldClass} />
              </Feld>
              <div className="grid grid-cols-2 gap-3">
                <Feld label="Fällig am">
                  <input type="date" value={clean(blatt.faellig_am).slice(0, 10)} onChange={(e) => setBlatt({ ...blatt, faellig_am: e.target.value })} className={feldClass} />
                </Feld>
                <Feld label="Uhrzeit" hinweis="Nur bei einem Termin.">
                  <input type="time" value={clean(blatt.uhrzeit).slice(0, 5)} onChange={(e) => setBlatt({ ...blatt, uhrzeit: e.target.value })} className={feldClass} />
                </Feld>
              </div>
              <Feld label="Bereich, optional" hinweis="Freier Text, zum Beispiel Steuerberater oder Verein.">
                <input
                  list="notiz-bereiche"
                  value={clean(blatt.bereich)}
                  onChange={(e) => setBlatt({ ...blatt, bereich: e.target.value })}
                  className={feldClass}
                />
                <datalist id="notiz-bereiche">
                  {bereiche.map((bereich) => <option key={bereich} value={bereich} />)}
                </datalist>
              </Feld>
              <Feld label="Objekt, optional">
                <select value={clean(blatt.work_site_id)} onChange={(e) => setBlatt({ ...blatt, work_site_id: e.target.value })} className={feldClass}>
                  <option value="">Ohne Objekt</option>
                  {sites.map((objekt) => <option key={objekt.id} value={objekt.id}>{clean(objekt.name)}</option>)}
                </select>
              </Feld>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={blatt.wichtig === true} onChange={(e) => setBlatt({ ...blatt, wichtig: e.target.checked })} className="h-4 w-4" />
                <span className="text-[15px] text-ink-800">Wichtig — steht in seiner Spalte oben</span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" disabled={speichert} onClick={blattSpeichern} className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40">
                {speichert ? "Wird gespeichert …" : "Speichern"}
              </button>
              <button type="button" onClick={() => setBlatt(null)} className="rounded-xl border border-paper-300 px-4 py-3 text-[15px] font-semibold text-ink-700">
                Abbrechen
              </button>
              {blatt.id ? (
                <button type="button" disabled={speichert} onClick={() => loeschen(String(blatt.id))} className="ml-auto rounded-xl border border-danger-500/40 px-4 py-3 text-[15px] font-semibold text-danger-600">
                  Löschen
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
