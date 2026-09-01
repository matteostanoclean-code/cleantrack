"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";
import { VORGABEN } from "@/lib/einstellungen";
import { BEREICHE, FARB_OPTIONEN, STAMMSPALTEN, bereichFinden, gruppeFinden } from "@/lib/einstellungenPlan";
import type { Feld, Gruppe, Spalte } from "@/lib/einstellungenPlan";
import { TARIFVORLAGEN, TARIF_GRUPPEN, TARIF_QUELLE, TARIF_REGELN, TARIF_WARNUNG } from "@/lib/tarifvorlagen";
import type { Tarifvorlage } from "@/lib/tarifvorlagen";

/**
 * Der eine Bildschirm für sämtliche Einstellungen.
 *
 * Er liest den Bauplan aus lib/einstellungenPlan.ts und zeichnet daraus die
 * Reiter oben, die Leiste links und den Inhalt. Es gibt deshalb nur diese eine
 * Datei statt dreißig fast gleicher Formulare — und eine neue Einstellung ist
 * ein Eintrag im Bauplan, kein neuer Bildschirm.
 *
 * Alles wird einmal geladen. Zwischen den Seiten zu springen kostet danach
 * keine Abfrage mehr.
 */

type AnyRow = Record<string, any>;

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

function geldText(value: unknown) {
  const zahl = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(zahl)) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(zahl);
}

const feldClass =
  "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

/** Ein Wert aus einer Listenzeile: gemeinsame Spalte oder aus dem JSON-Teil. */
function wertAusZeile(zeile: AnyRow, schluessel: string) {
  if (STAMMSPALTEN.includes(schluessel)) return zeile[schluessel];
  const daten = zeile.daten && typeof zeile.daten === "object" ? zeile.daten : {};
  return daten[schluessel];
}

function Schalter({ an, onChange, label, hinweis }: { an: boolean; onChange: (wert: boolean) => void; label: string; hinweis?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={an}
        onClick={() => onChange(!an)}
        className={cx(
          "mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition",
          an ? "bg-brand-600" : "bg-paper-300"
        )}
      >
        <span className={cx("block h-5 w-5 rounded-full bg-white transition", an ? "translate-x-5" : "translate-x-0")} />
      </button>
      <span className="min-w-0">
        <span className="block text-[15px] text-ink-800">{label}</span>
        {hinweis ? <span className="mt-0.5 block text-[13px] text-ink-400">{hinweis}</span> : null}
      </span>
    </label>
  );
}

function FeldZeichnen({ feld, wert, setzen }: { feld: Feld; wert: any; setzen: (wert: any) => void }) {
  if (feld.art === "schalter") {
    return <Schalter an={wert !== false && wert !== null && wert !== undefined ? Boolean(wert) : false} onChange={setzen} label={feld.label} hinweis={feld.hinweis} />;
  }

  const beschriftung = (
    <span className="block text-[13px] text-ink-500">
      {feld.label}
      {"pflicht" in feld && feld.pflicht ? <span className="text-danger-500"> *</span> : null}
      {"einheit" in feld && feld.einheit ? <span className="text-ink-300"> ({feld.einheit})</span> : null}
    </span>
  );

  let eingabe: React.ReactNode = null;

  if (feld.art === "textbereich") {
    eingabe = <textarea rows={4} value={clean(wert)} onChange={(e) => setzen(e.target.value)} className={feldClass} />;
  } else if (feld.art === "auswahl") {
    eingabe = (
      <select value={clean(wert)} onChange={(e) => setzen(e.target.value)} className={feldClass}>
        {feld.optionen.map((option) => (
          <option key={option.wert} value={option.wert}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (feld.art === "farbe") {
    eingabe = (
      <div className="flex flex-wrap gap-2">
        {FARB_OPTIONEN.map((farbe) => (
          <button
            key={farbe.wert}
            type="button"
            title={farbe.label}
            onClick={() => setzen(farbe.wert)}
            className={cx(
              "h-8 w-8 rounded-full border-2 transition",
              clean(wert).toUpperCase() === farbe.wert ? "border-ink-900 scale-110" : "border-transparent"
            )}
            style={{ backgroundColor: farbe.wert }}
          />
        ))}
      </div>
    );
  } else if (feld.art === "zahl" || feld.art === "geld") {
    eingabe = (
      <input
        type="text"
        inputMode="decimal"
        value={wert === null || wert === undefined ? "" : String(wert)}
        onChange={(e) => setzen(e.target.value)}
        className={feldClass}
      />
    );
  } else if (feld.art === "zeit") {
    eingabe = <input type="time" value={clean(wert).slice(0, 5)} onChange={(e) => setzen(e.target.value)} className={feldClass} />;
  } else if (feld.art === "datum") {
    eingabe = <input type="date" value={clean(wert).slice(0, 10)} onChange={(e) => setzen(e.target.value)} className={feldClass} />;
  } else {
    eingabe = <input type="text" value={clean(wert)} onChange={(e) => setzen(e.target.value)} className={feldClass} />;
  }

  return (
    <label className="block">
      {beschriftung}
      <div className="mt-1.5">{eingabe}</div>
      {feld.hinweis ? <span className="mt-1 block text-[12px] text-ink-400">{feld.hinweis}</span> : null}
    </label>
  );
}

function feldBreit(feld: Feld) {
  if (feld.art === "schalter") return true;
  if (feld.art === "textbereich") return true;
  return "breit" in feld && Boolean(feld.breit);
}

export default function EinstellungenAnsicht({ bereich, gruppe }: { bereich: string; gruppe: string }) {
  const [token, setToken] = useState("");
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [setupFehlt, setSetupFehlt] = useState(false);

  const [werte, setWerte] = useState<AnyRow>(VORGABEN);
  const [listen, setListen] = useState<Record<string, AnyRow[]>>({});

  // Formular
  const [entwurf, setEntwurf] = useState<AnyRow>({});

  // Listen
  const [reiter, setReiter] = useState<"alle" | "aktiv" | "inaktiv">("aktiv");
  const [suche, setSuche] = useState("");
  const [blatt, setBlatt] = useState<AnyRow | null>(null);
  const [vorlagenOffen, setVorlagenOffen] = useState(false);

  const aktiverBereich = bereichFinden(bereich) || BEREICHE[0];
  const aktiveGruppe: Gruppe | null = gruppeFinden(aktiverBereich.schluessel, gruppe) || aktiverBereich.gruppen[0] || null;

  const laden_ = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLaden(true);
    setFehler(null);
    try {
      const antwort = await fetch("/api/admin/einstellungen", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Einstellungen konnten nicht geladen werden.");
      setSetupFehlt(Boolean(ergebnis.setupFehlt));
      setWerte(ergebnis.werte || VORGABEN);
      setListen(ergebnis.listen || {});
    } catch (ladeFehler) {
      setFehler(ladeFehler instanceof Error ? ladeFehler.message : "Einstellungen konnten nicht geladen werden.");
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
      if (sessionToken) await laden_(sessionToken);
      else setLaden(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Beim Wechsel der Seite den Entwurf neu aus den geladenen Werten setzen.
  useEffect(() => {
    setMeldung(null);
    setFehler(null);
    setSuche("");
    setBlatt(null);
    setVorlagenOffen(false);
    if (aktiveGruppe?.art === "formular") setEntwurf({ ...(werte[aktiveGruppe.bereich] || {}) });
  }, [bereich, gruppe, werte, aktiveGruppe?.art]);

  const geaendert = useMemo(() => {
    if (aktiveGruppe?.art !== "formular") return false;
    const original = werte[aktiveGruppe.bereich] || {};
    return Object.keys(entwurf).some((schluessel) => String(entwurf[schluessel] ?? "") !== String(original[schluessel] ?? ""));
  }, [entwurf, werte, aktiveGruppe]);

  async function formularSpeichern() {
    if (aktiveGruppe?.art !== "formular") return;
    setSpeichern(true);
    setFehler(null);
    try {
      // Zahlen als Zahlen schicken, damit aus "25" keine "25" in der Datenbank wird.
      const bereinigt: AnyRow = {};
      const alleFelder = aktiveGruppe.abschnitte.flatMap((abschnitt) => abschnitt.felder);
      for (const [schluessel, wert] of Object.entries(entwurf)) {
        const feld = alleFelder.find((eintrag) => eintrag.schluessel === schluessel);
        if (feld && (feld.art === "zahl" || feld.art === "geld")) {
          const zahl = Number(String(wert ?? "").replace(",", "."));
          bereinigt[schluessel] = Number.isFinite(zahl) ? zahl : null;
        } else if (feld?.art === "auswahl" && schluessel === "wochen_taktung") {
          bereinigt[schluessel] = Number(wert) || 30;
        } else {
          bereinigt[schluessel] = wert;
        }
      }

      const antwort = await fetch("/api/admin/einstellungen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schluessel: aktiveGruppe.bereich, wert: bereinigt })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");
      setWerte((vorher) => ({ ...vorher, [aktiveGruppe.bereich]: ergebnis.wert }));
      setMeldung("Gespeichert.");
    } catch (speicherFehler) {
      setFehler(speicherFehler instanceof Error ? speicherFehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSpeichern(false);
    }
  }

  async function eintragSpeichern() {
    if (aktiveGruppe?.art !== "liste" || !blatt) return;
    setSpeichern(true);
    setFehler(null);
    try {
      const felder: AnyRow = {};
      for (const feld of aktiveGruppe.felder) {
        const wert = blatt[feld.schluessel];
        if (feld.art === "zahl" || feld.art === "geld") {
          const zahl = Number(String(wert ?? "").replace(",", "."));
          felder[feld.schluessel] = Number.isFinite(zahl) ? zahl : null;
        } else if (feld.art === "schalter") {
          felder[feld.schluessel] = Boolean(wert);
        } else {
          felder[feld.schluessel] = wert ?? null;
        }
      }
      // Was aus einer Tarifvorlage kam, wird mitgeschrieben, aber nicht angezeigt.
      if (blatt.vorlage) felder.vorlage = blatt.vorlage;
      if (blatt.steuerfrei !== undefined) felder.steuerfrei = blatt.steuerfrei;

      const antwort = await fetch("/api/admin/stammlisten", {
        method: blatt.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ liste: aktiveGruppe.liste, id: blatt.id || undefined, felder })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");

      setMeldung(blatt.id ? "Gespeichert." : `${aktiveGruppe.einzahl} angelegt.`);
      setBlatt(null);
      await laden_();
    } catch (speicherFehler) {
      setFehler(speicherFehler instanceof Error ? speicherFehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSpeichern(false);
    }
  }

  async function eintragLoeschen(id: string) {
    if (aktiveGruppe?.art !== "liste") return;
    const sicher = window.confirm(
      `${aktiveGruppe.einzahl} wirklich löschen? Was bereits damit erfasst wurde, bleibt bestehen — es steht danach nur nicht mehr zur Auswahl.`
    );
    if (!sicher) return;
    setSpeichern(true);
    try {
      const antwort = await fetch(`/api/admin/stammlisten?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Löschen fehlgeschlagen.");
      setBlatt(null);
      setMeldung("Gelöscht.");
      await laden_();
    } catch (loeschFehler) {
      setFehler(loeschFehler instanceof Error ? loeschFehler.message : "Löschen fehlgeschlagen.");
    } finally {
      setSpeichern(false);
    }
  }

  function neuerEintrag(vorbelegt?: AnyRow) {
    if (aktiveGruppe?.art !== "liste") return;
    const leer: AnyRow = { aktiv: true };
    for (const feld of aktiveGruppe.felder) {
      if (feld.art === "schalter") leer[feld.schluessel] = feld.schluessel === "aktiv";
      else leer[feld.schluessel] = "";
    }
    setBlatt({ ...leer, ...(vorbelegt || {}) });
    setVorlagenOffen(false);
  }

  function vorlageUebernehmen(vorlage: Tarifvorlage) {
    neuerEintrag({
      name: vorlage.name,
      einheit: vorlage.einheit,
      hoehe: String(vorlage.hoehe),
      grundlage: vorlage.grundlage === "manuell" ? "auftragsarten" : vorlage.grundlage,
      wochentage: vorlage.wochentage || "",
      von: vorlage.von || "",
      bis: vorlage.bis || "",
      vorlage: vorlage.schluessel,
      steuerfrei: Boolean(vorlage.steuerfrei),
      aktiv: true
    });
  }

  const listenZeilen = useMemo(() => {
    if (aktiveGruppe?.art !== "liste") return [];
    const alle = listen[aktiveGruppe.liste] || [];
    const needle = suche.trim().toLowerCase();
    return alle.filter((zeile) => {
      if (reiter === "aktiv" && zeile.aktiv === false) return false;
      if (reiter === "inaktiv" && zeile.aktiv !== false) return false;
      if (!needle) return true;
      const daten = zeile.daten && typeof zeile.daten === "object" ? Object.values(zeile.daten).join(" ") : "";
      return `${clean(zeile.name)} ${clean(zeile.nummer)} ${daten}`.toLowerCase().includes(needle);
    });
  }, [listen, aktiveGruppe, reiter, suche]);

  function spalteText(zeile: AnyRow, spalte: Spalte) {
    const wert = wertAusZeile(zeile, spalte.schluessel);
    if (spalte.art === "datum") return datumText(wert);
    if (spalte.art === "geld") return wert === null || wert === undefined || wert === "" ? "–" : geldText(wert);
    if (spalte.art === "prozent") return wert === null || wert === undefined || wert === "" ? "–" : `${wert} %`;
    if (spalte.art === "zahl") return wert === null || wert === undefined || wert === "" ? "–" : String(wert);
    return clean(wert) || "–";
  }

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      {/* Reiter oben */}
      <div className="border-b border-paper-200 bg-white">
        <div className="px-4 pt-5 md:px-6 xl:px-8" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <UiIcon name="settings" className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold">Einstellungen</h1>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto pb-0">
            {BEREICHE.map((eintrag) => {
              const aktiv = eintrag.schluessel === aktiverBereich.schluessel;
              const ziel = `/mitarbeiter/admin/einstellungen/${eintrag.schluessel}/${eintrag.gruppen[0]?.schluessel || ""}`;
              return (
                <Link
                  key={eintrag.schluessel}
                  href={ziel}
                  className={cx(
                    "shrink-0 rounded-t-lg px-4 py-2.5 text-[14px] font-semibold transition",
                    aktiv ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-paper-100"
                  )}
                >
                  {eintrag.titel}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex flex-col gap-0 md:flex-row">
        {/* Leiste links */}
        <aside className="shrink-0 border-b border-paper-200 bg-white px-4 py-3 md:w-[230px] md:border-b-0 md:border-r md:py-5">
          <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {aktiverBereich.gruppen.map((eintrag) => {
              const aktiv = eintrag.schluessel === aktiveGruppe?.schluessel;
              return (
                <Link
                  key={eintrag.schluessel}
                  href={`/mitarbeiter/admin/einstellungen/${aktiverBereich.schluessel}/${eintrag.schluessel}`}
                  className={cx(
                    "shrink-0 rounded-lg px-3 py-2.5 text-[14px] transition",
                    aktiv ? "bg-paper-200 font-semibold text-ink-900" : "text-ink-500 hover:bg-paper-100"
                  )}
                >
                  {eintrag.titel}
                </Link>
              );
            })}
          </div>
        </aside>

        {/* Inhalt */}
        <section className="min-w-0 flex-1 px-4 py-5 md:px-6 xl:px-8">
          {setupFehlt ? (
            <div className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">
              Die Einstellungstabellen fehlen noch. Führe <code className="font-mono">supabase/einstellungen.sql</code> im Supabase SQL-Editor aus,
              dann lassen sich die Werte speichern. Solange siehst du hier die Vorgaben.
            </div>
          ) : null}
          {fehler ? <div className="mb-4 rounded-xl bg-danger-100 px-4 py-3 text-[14px] text-danger-700">{fehler}</div> : null}
          {meldung ? <div className="mb-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{meldung}</div> : null}

          {laden ? (
            <p className="text-[15px] text-ink-400">Wird geladen …</p>
          ) : !aktiveGruppe ? (
            <p className="text-[15px] text-ink-400">Diesen Bereich gibt es nicht.</p>
          ) : aktiveGruppe.art === "hinweis" ? (
            <div className="max-w-[720px]">
              <h2 className="text-[20px] font-bold">{aktiveGruppe.ueberschrift}</h2>
              <div className="mt-4 space-y-3 rounded-2xl border border-paper-200 bg-white p-5">
                {aktiveGruppe.absaetze.map((absatz) => (
                  <p key={absatz} className="text-[15px] leading-relaxed text-ink-600">
                    {absatz}
                  </p>
                ))}
                {aktiveGruppe.wege?.length ? (
                  <div className="border-t border-paper-200 pt-4">
                    {aktiveGruppe.wege.map((weg) => (
                      <Link key={weg.adresse} href={weg.adresse} className="block rounded-xl border border-paper-200 px-4 py-3 text-[15px] font-medium text-brand-700 hover:bg-paper-100">
                        {weg.text}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : aktiveGruppe.art === "formular" ? (
            <div className="max-w-[820px]">
              <h2 className="text-[20px] font-bold">{aktiveGruppe.ueberschrift}</h2>
              {aktiveGruppe.hinweis ? <p className="mt-1 text-[14px] text-ink-500">{aktiveGruppe.hinweis}</p> : null}

              <div className="mt-4 space-y-4">
                {aktiveGruppe.abschnitte.map((abschnitt) => (
                  <div key={abschnitt.titel} className="rounded-2xl border border-paper-200 bg-white p-5">
                    <p className="text-[15px] font-semibold text-ink-900">{abschnitt.titel}</p>
                    {abschnitt.hinweis ? <p className="mt-0.5 text-[13px] text-ink-400">{abschnitt.hinweis}</p> : null}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {abschnitt.felder.map((feld) => (
                        <div key={feld.schluessel} className={feldBreit(feld) ? "sm:col-span-2" : ""}>
                          <FeldZeichnen
                            feld={feld}
                            wert={entwurf[feld.schluessel]}
                            setzen={(wert) => setEntwurf((vorher) => ({ ...vorher, [feld.schluessel]: wert }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="sticky bottom-0 mt-4 flex items-center gap-3 bg-paper-100 py-4">
                <button
                  type="button"
                  disabled={!geaendert || speichern}
                  onClick={formularSpeichern}
                  className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40"
                >
                  {speichern ? "Wird gespeichert …" : "Speichern"}
                </button>
                {geaendert ? (
                  <button
                    type="button"
                    onClick={() => setEntwurf({ ...(werte[aktiveGruppe.bereich] || {}) })}
                    className="rounded-xl border border-paper-300 bg-white px-4 py-3 text-[15px] font-semibold text-ink-700"
                  >
                    Verwerfen
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[20px] font-bold">{aktiveGruppe.ueberschrift}</h2>
                  {aktiveGruppe.hinweis ? <p className="mt-1 max-w-[640px] text-[14px] text-ink-500">{aktiveGruppe.hinweis}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {aktiveGruppe.tarifvorlagen ? (
                    <button
                      type="button"
                      onClick={() => setVorlagenOffen(true)}
                      className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700"
                    >
                      Aus Tarifvorlage
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => neuerEintrag()}
                    className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white"
                  >
                    <UiIcon name="plus" className="h-4 w-4" />
                    {aktiveGruppe.einzahl}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(["alle", "aktiv", "inaktiv"] as const).map((wert) => (
                  <button
                    key={wert}
                    type="button"
                    onClick={() => setReiter(wert)}
                    className={cx(
                      "rounded-lg px-3 py-1.5 text-[13px] font-semibold transition",
                      reiter === wert ? "bg-ink-900 text-white" : "bg-white text-ink-500 border border-paper-200"
                    )}
                  >
                    {wert === "alle" ? "Alle" : wert === "aktiv" ? "Aktiv" : "Inaktiv"}
                  </button>
                ))}
                <input
                  type="search"
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                  placeholder="Suchen"
                  className="ml-auto w-full max-w-[260px] rounded-xl border border-paper-200 bg-white px-4 py-2 text-[14px] outline-none focus:border-brand-500"
                />
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-paper-200 text-[11px] uppercase tracking-wide text-ink-400">
                      {aktiveGruppe.spalten.map((spalte) => (
                        <th key={spalte.schluessel} className={cx("px-4 py-3 font-semibold", spalte.rechts && "text-right")}>
                          {spalte.titel}
                        </th>
                      ))}
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {listenZeilen.length === 0 ? (
                      <tr>
                        <td colSpan={aktiveGruppe.spalten.length + 1} className="px-4 py-10 text-center text-[15px] text-ink-400">
                          Noch nichts hinterlegt.
                        </td>
                      </tr>
                    ) : (
                      listenZeilen.map((zeile) => (
                        <tr
                          key={zeile.id}
                          onClick={() => {
                            const gefuellt: AnyRow = { id: zeile.id };
                            for (const feld of aktiveGruppe.felder) gefuellt[feld.schluessel] = wertAusZeile(zeile, feld.schluessel);
                            gefuellt.aktiv = zeile.aktiv !== false;
                            setBlatt(gefuellt);
                          }}
                          className="cursor-pointer border-b border-paper-100 last:border-0 hover:bg-paper-50"
                        >
                          {aktiveGruppe.spalten.map((spalte) => {
                            if (spalte.art === "schalter") {
                              const an = Boolean(wertAusZeile(zeile, spalte.schluessel));
                              return (
                                <td key={spalte.schluessel} className="px-4 py-3">
                                  <span
                                    className={cx(
                                      "inline-block rounded-md px-2 py-0.5 text-[12px] font-semibold",
                                      an ? "bg-success-100 text-success-700" : "bg-paper-200 text-ink-500"
                                    )}
                                  >
                                    {an ? "Ja" : "Nein"}
                                  </span>
                                </td>
                              );
                            }
                            if (spalte.art === "farbe") {
                              return (
                                <td key={spalte.schluessel} className="px-4 py-3">
                                  <span className="flex items-center gap-2 text-[14px] font-medium text-ink-900">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: clean(zeile.farbe) || "#8E8E93" }} />
                                    {spalteText(zeile, spalte)}
                                  </span>
                                </td>
                              );
                            }
                            return (
                              <td key={spalte.schluessel} className={cx("px-4 py-3 text-[14px] text-ink-700", spalte.rechts && "text-right")}>
                                {spalteText(zeile, spalte)}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right">
                            <UiIcon name="chevronRight" className="ml-auto h-4 w-4 text-ink-300" />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Blatt zum Anlegen und Ändern */}
      {blatt && aktiveGruppe?.art === "liste" ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-6" onClick={() => setBlatt(null)}>
          <div
            className="max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[18px] font-bold">
                {blatt.id ? `${aktiveGruppe.einzahl} bearbeiten` : `${aktiveGruppe.einzahl} anlegen`}
              </h3>
              <button type="button" onClick={() => setBlatt(null)} className="text-ink-400">
                <UiIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            {blatt.vorlage ? (() => {
              const vorlage = TARIFVORLAGEN.find((eintrag) => eintrag.schluessel === blatt.vorlage);
              if (!vorlage) return null;
              return (
                <div className="mt-3 space-y-2">
                  <div className="rounded-xl bg-brand-100 px-4 py-3 text-[13px] leading-relaxed text-brand-700">
                    <p className="font-semibold">Aus dem Rahmentarifvertrag, {vorlage.fundstelle}</p>
                    {vorlage.hinweis ? <p className="mt-1">{vorlage.hinweis}</p> : null}
                  </div>
                  {vorlage.abgelaufen ? (
                    <div className="rounded-xl bg-danger-100 px-4 py-3 text-[13px] leading-relaxed text-danger-700">
                      <p className="font-semibold">Gilt nach diesem Text nicht mehr</p>
                      <p className="mt-1">{vorlage.abgelaufen}</p>
                    </div>
                  ) : null}
                </div>
              );
            })() : null}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {aktiveGruppe.felder.map((feld) => (
                <div key={feld.schluessel} className={feldBreit(feld) ? "sm:col-span-2" : ""}>
                  <FeldZeichnen
                    feld={feld}
                    wert={blatt[feld.schluessel]}
                    setzen={(wert) => setBlatt((vorher) => ({ ...(vorher || {}), [feld.schluessel]: wert }))}
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={speichern}
                onClick={eintragSpeichern}
                className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40"
              >
                {speichern ? "Wird gespeichert …" : "Speichern"}
              </button>
              <button type="button" onClick={() => setBlatt(null)} className="rounded-xl border border-paper-300 px-4 py-3 text-[15px] font-semibold text-ink-700">
                Abbrechen
              </button>
              {blatt.id ? (
                <button
                  type="button"
                  disabled={speichern}
                  onClick={() => eintragLoeschen(String(blatt.id))}
                  className="ml-auto rounded-xl border border-danger-500/40 px-4 py-3 text-[15px] font-semibold text-danger-600"
                >
                  Löschen
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Tarifvorlagen */}
      {vorlagenOffen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-6" onClick={() => setVorlagenOffen(false)}>
          <div
            className="max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[18px] font-bold">Aus Tarifvorlage übernehmen</h3>
              <button type="button" onClick={() => setVorlagenOffen(false)} className="text-ink-400">
                <UiIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-brand-100 px-4 py-3 text-[13px] leading-relaxed text-brand-700">{TARIF_QUELLE}</div>
            <div className="mt-2 rounded-xl bg-amber-100 px-4 py-3 text-[13px] leading-relaxed text-amber-800">{TARIF_WARNUNG}</div>

            {/* Zwei Regeln, die keine Vorlage abbilden kann, weil sie erst beim
                Zusammentreffen mehrerer Zuschläge greifen. */}
            <div className="mt-2 space-y-1.5 rounded-xl border border-paper-200 px-4 py-3">
              {TARIF_REGELN.map((regel) => (
                <p key={regel.fundstelle} className="text-[13px] leading-relaxed text-ink-600">
                  <span className="font-semibold text-ink-800">{regel.fundstelle}</span> — {regel.text}
                </p>
              ))}
            </div>

            <div className="mt-4 space-y-5">
              {TARIF_GRUPPEN.map((gruppeEintrag) => {
                const vorlagen = TARIFVORLAGEN.filter((vorlage) => vorlage.gruppe === gruppeEintrag.schluessel);
                if (!vorlagen.length) return null;
                return (
                  <div key={gruppeEintrag.schluessel}>
                    <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">
                      {gruppeEintrag.titel} <span className="text-ink-300">{vorlagen.length}</span>
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {vorlagen.map((vorlage) => (
                        <button
                          key={vorlage.schluessel}
                          type="button"
                          onClick={() => vorlageUebernehmen(vorlage)}
                          className={cx(
                            "flex w-full items-start justify-between gap-4 rounded-xl border px-4 py-3 text-left transition hover:border-brand-500",
                            vorlage.abgelaufen ? "border-danger-500/40 bg-danger-100/40" : "border-paper-200"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium text-ink-800">{vorlage.name}</span>
                            <span className="mt-0.5 block text-[12px] text-ink-400">
                              {vorlage.fundstelle}
                              {vorlage.hinweis ? ` · ${vorlage.hinweis}` : ""}
                            </span>
                            {vorlage.abgelaufen ? (
                              <span className="mt-1 block text-[12px] font-semibold text-danger-600">Gilt nach diesem Text nicht mehr</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-[14px] font-semibold text-ink-600">
                            {vorlage.einheit === "prozent" ? `${vorlage.hoehe} %` : `${String(vorlage.hoehe).replace(".", ",")} €/h`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
