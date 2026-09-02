"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Auswertung: was ein Objekt einbringt und was es kostet.
 *
 * Umsatz allein sagt nichts. Ein Objekt mit 800 Euro Pauschale, an dem zwanzig
 * Stunden hängen, ist schlechter als eines mit 400 und fünf. Die Tabelle
 * stellt beides nebeneinander und rechnet den Deckungsbeitrag aus.
 *
 * Sortiert wird nach dem Deckungsbeitrag von unten, nicht nach Umsatz von
 * oben: was Geld kostet, soll man zuerst sehen.
 */

type Zeile = {
  id: string;
  name: string;
  objektnummer: number | null;
  kunde: string | null;
  tags: string | null;
  aktiv: boolean;
  art: "pauschale" | "stundensatz" | "keiner";
  pauschale: number | null;
  stundensatz: number | null;
  minutenFrei: number;
  minutenOffen: number;
  minutenGeplant: number;
  minutenOhneLohn: number;
  personen: number;
  leistungsErloes: number;
  materialerloes: number;
  materialkosten: number;
  materialZeilen: number;
  materialOhnePreis: number;
  erloes: number;
  lohnkosten: number;
  deckungsbeitrag: number | null;
  marge: number | null;
  erloesJeStunde: number | null;
};

type Daten = {
  monat: string;
  von: string;
  bis: string;
  laufend: boolean;
  zeilen: Zeile[];
  summe: {
    erloes: number;
    lohnkosten: number;
    lohnkostenGesamt: number;
    materialkosten: number;
    materialerloes: number;
    materialOhnePreis: number;
    deckungsbeitrag: number;
    minutenFrei: number;
    minutenOffen: number;
    minutenGeplant: number;
    minutenOhneObjekt: number;
    objekteOhneSatz: number;
  };
  lohnkostenMonat: number | null;
  lohnkostenMonatDetails: { gehalt: number | null; ag_kosten: number | null; sachzuwendung: number | null; notiz: string | null };
  monatskostenId: string | null;
  personenOhneLohn: string[];
  materialGemeldet: Array<{ objekt: string; artikel: string }>;
  hinweisKosten: string;
};

/**
 * Die Ampel. Zwanzig Prozent sind eine gesetzte Marke, kein Naturgesetz —
 * sie steht auch so auf dem Bildschirm, damit niemand sie für eine
 * betriebswirtschaftliche Wahrheit hält.
 */
const MARGE_GUT = 20;

function euro(wert: number | null | undefined) {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(wert);
}

function euroGenau(wert: number | null | undefined) {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(wert);
}

function stunden(minuten: number) {
  if (!minuten) return "–";
  return `${(minuten / 60).toFixed(1).replace(".", ",")} h`;
}

function prozent(wert: number | null) {
  if (wert === null || !Number.isFinite(wert)) return "–";
  return `${wert.toFixed(0)} %`;
}

function monatName(monat: string) {
  const [jahr, m] = monat.split("-").map(Number);
  if (!jahr || !m) return monat;
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(jahr, m - 1, 1));
}

function ampel(zeile: Zeile) {
  if (zeile.art === "keiner") return "bg-paper-300";
  if (zeile.deckungsbeitrag !== null && zeile.deckungsbeitrag < 0) return "bg-danger-500";
  if (zeile.marge !== null && zeile.marge < MARGE_GUT) return "bg-amber-400";
  return "bg-success-500";
}

function Kennzahl({ titel, wert, hinweis, ton }: { titel: string; wert: string; hinweis?: string; ton?: string }) {
  return (
    <div className="rounded-2xl border border-paper-200 bg-white p-4">
      <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">{titel}</p>
      <p className={cx("mt-1 text-[26px] font-bold leading-tight", ton || "text-ink-900")}>{wert}</p>
      {hinweis ? <p className="mt-0.5 text-[13px] text-ink-400">{hinweis}</p> : null}
    </div>
  );
}

export default function AuswertungSeite() {
  const [token, setToken] = useState("");
  const [authLaden, setAuthLaden] = useState(true);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [daten, setDaten] = useState<Daten | null>(null);
  const [monat, setMonat] = useState(() => new Date().toISOString().slice(0, 7));
  const [sortierung, setSortierung] = useState<"db" | "erloes" | "stunden" | "name">("db");

  // Lohnkosten des Monats, von Hand aus der Abrechnung.
  const [lohnOffen, setLohnOffen] = useState(false);
  const [lohnForm, setLohnForm] = useState({ lohnkosten: "", gehalt: "", ag_kosten: "", sachzuwendung: "", notiz: "" });
  const [lohnSpeichert, setLohnSpeichert] = useState(false);

  const holen = useCallback(async (aktuellerToken?: string, aktuellerMonat?: string) => {
    const t = aktuellerToken || token;
    if (!t) return;
    setLaden(true);
    setFehler(null);
    try {
      const antwort = await fetch(`/api/admin/auswertung?month=${encodeURIComponent(aktuellerMonat || monat)}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${t}` }
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Auswertung konnte nicht geladen werden.");
      setDaten(ergebnis);
    } catch (ladeFehler) {
      setFehler(ladeFehler instanceof Error ? ladeFehler.message : "Auswertung konnte nicht geladen werden.");
    } finally {
      setLaden(false);
    }
  }, [monat, token]);

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

  const gerechnet = useMemo(() => {
    const zeilen = (daten?.zeilen || []).filter((zeile) => zeile.art !== "keiner" && (zeile.aktiv || zeile.minutenFrei > 0));
    const sortiert = [...zeilen];
    if (sortierung === "db") sortiert.sort((a, b) => (a.deckungsbeitrag ?? 0) - (b.deckungsbeitrag ?? 0));
    if (sortierung === "erloes") sortiert.sort((a, b) => b.erloes - a.erloes);
    if (sortierung === "stunden") sortiert.sort((a, b) => b.minutenFrei - a.minutenFrei);
    if (sortierung === "name") sortiert.sort((a, b) => a.name.localeCompare(b.name));
    return sortiert;
  }, [daten, sortierung]);

  const ohneSatz = useMemo(
    () => (daten?.zeilen || []).filter((zeile) => zeile.art === "keiner" && (zeile.aktiv || zeile.minutenFrei > 0)),
    [daten]
  );

  function lohnBearbeiten() {
    if (!daten) return;
    const d = daten.lohnkostenMonatDetails;
    const alsText = (wert: number | null) => (wert === null || wert === undefined ? "" : String(wert).replace(".", ","));
    setLohnForm({
      lohnkosten: alsText(daten.lohnkostenMonat),
      gehalt: alsText(d.gehalt),
      ag_kosten: alsText(d.ag_kosten),
      sachzuwendung: alsText(d.sachzuwendung),
      notiz: d.notiz || ""
    });
    setLohnOffen(true);
  }

  /**
   * Lohnkosten des Monats speichern.
   *
   * Die Aufteilung in Gehalt, Arbeitgeberkosten und Sachzuwendung ist
   * freiwillig — gerechnet wird mit der Gesamtsumme. Sind alle drei gefüllt
   * und die Summe leer, wird sie daraus gebildet, damit man nicht dieselbe
   * Zahl zweimal tippt.
   */
  async function lohnSpeichern() {
    if (!daten) return;
    const zahlVon = (wert: string) => {
      const text = wert.trim().replace(/\./g, "").replace(",", ".");
      if (!text) return null;
      const zahl = Number(text);
      return Number.isFinite(zahl) ? zahl : null;
    };

    const gehalt = zahlVon(lohnForm.gehalt);
    const ag = zahlVon(lohnForm.ag_kosten);
    const sach = zahlVon(lohnForm.sachzuwendung);
    const summeAusTeilen = [gehalt, ag, sach].some((w) => w !== null)
      ? (gehalt ?? 0) + (ag ?? 0) + (sach ?? 0)
      : null;
    const gesamt = zahlVon(lohnForm.lohnkosten) ?? summeAusTeilen;

    if (gesamt === null) { setFehler("Bitte einen Betrag eintragen."); return; }

    setLohnSpeichert(true);
    setFehler(null);
    try {
      const antwort = await fetch("/api/admin/stammlisten", {
        method: daten.monatskostenId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          liste: "monatskosten",
          id: daten.monatskostenId || undefined,
          felder: {
            name: daten.monat,
            aktiv: true,
            lohnkosten: gesamt,
            gehalt,
            ag_kosten: ag,
            sachzuwendung: sach,
            notiz: lohnForm.notiz.trim() || null
          }
        })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");
      setLohnOffen(false);
      await holen();
    } catch (speicherFehler) {
      setFehler(speicherFehler instanceof Error ? speicherFehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setLohnSpeichert(false);
    }
  }

  function csvHolen() {
    if (!daten) return;
    const zeilen = [
      ["Objekt", "Kunde", "Abrechnung", "Pauschale", "Stundensatz", "Stunden freigegeben", "Stunden offen", "Erloes Leistung", "Erloes Material", "Erloes gesamt", "Lohnkosten", "Materialkosten", "Deckungsbeitrag", "Marge %", "Erloes je Stunde"],
      ...gerechnet.map((zeile) => [
        zeile.name,
        zeile.kunde || "",
        zeile.art === "pauschale" ? "Pauschale" : "Stundensatz",
        zeile.pauschale?.toFixed(2) || "",
        zeile.stundensatz?.toFixed(2) || "",
        (zeile.minutenFrei / 60).toFixed(2),
        (zeile.minutenOffen / 60).toFixed(2),
        zeile.leistungsErloes.toFixed(2),
        zeile.materialerloes.toFixed(2),
        zeile.erloes.toFixed(2),
        zeile.lohnkosten.toFixed(2),
        zeile.materialkosten.toFixed(2),
        zeile.deckungsbeitrag?.toFixed(2) || "",
        zeile.marge?.toFixed(1) || "",
        zeile.erloesJeStunde?.toFixed(2) || ""
      ])
    ];
    // Semikolon und BOM, damit Excel die Datei ohne Nachfragen richtig öffnet.
    const text = "﻿" + zeilen.map((z) => z.map((w) => `"${String(w).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const adresse = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = adresse;
    link.download = `auswertung-${daten.monat}.csv`;
    link.click();
    URL.revokeObjectURL(adresse);
  }

  if (authLaden) {
    return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-ink-400">Lade Login …</main>;
  }
  if (!token) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-paper-100 px-4 text-center">
        <div>
          <p className="text-[15px] text-ink-500">Bitte anmelden.</p>
          <Link href="/mitarbeiter" className="mt-3 inline-block rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white">Zur App</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      {/* Gleicher Rahmen wie die übrigen Adminseiten: am Rechner links an der
          Seitenleiste, nicht mittig. */}
      <div className="mx-auto min-h-[100dvh] max-w-[520px] px-4 py-5 md:mx-0 md:max-w-[1200px] md:px-6 xl:px-8" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Objekte</p>
            <h1 className="text-3xl font-bold">Auswertung</h1>
            <p className="mt-1 text-[14px] text-ink-500">Was jedes Objekt einbringt und was es an Lohn kostet.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={monat}
              onChange={(e) => { setMonat(e.target.value); holen(undefined, e.target.value); }}
              className="rounded-xl border border-paper-200 bg-white px-4 py-2.5 text-[15px] outline-none focus:border-brand-500"
            />
            <button onClick={() => holen()} disabled={laden} className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">
              {laden ? "Lädt …" : "Neu laden"}
            </button>
            <button onClick={csvHolen} disabled={!daten} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40">CSV</button>
          </div>
        </div>

        {fehler ? <div className="mt-4 rounded-xl bg-danger-100 px-4 py-3 text-[14px] text-danger-700">{fehler}</div> : null}

        {daten ? (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kennzahl titel="Erlös" wert={euro(daten.summe.erloes)} hinweis={monatName(daten.monat)} />
              <button type="button" onClick={lohnBearbeiten} className="rounded-2xl border border-paper-200 bg-white p-4 text-left transition hover:border-brand-500">
                <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Kosten</p>
                <p className="mt-1 text-[26px] font-bold leading-tight text-ink-900">
                  {euro(daten.summe.lohnkostenGesamt + daten.summe.materialkosten)}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-400">
                  Lohn {euro(daten.summe.lohnkostenGesamt)} + Material {euro(daten.summe.materialkosten)}
                </p>
                <p className={cx("mt-1 text-[12px] font-semibold", daten.lohnkostenMonat === null ? "text-amber-600" : "text-brand-700")}>
                  {daten.lohnkostenMonat === null ? "Lohnkosten eintragen" : "Aus der Abrechnung · ändern"}
                </p>
              </button>
              <Kennzahl
                titel="Deckungsbeitrag"
                wert={euro(daten.summe.deckungsbeitrag)}
                hinweis={daten.summe.erloes > 0 ? `${((daten.summe.deckungsbeitrag / daten.summe.erloes) * 100).toFixed(0)} % vom Erlös` : undefined}
                ton={daten.summe.deckungsbeitrag < 0 ? "text-danger-600" : "text-success-700"}
              />
              <Kennzahl
                titel="Stunden"
                wert={stunden(daten.summe.minutenFrei)}
                hinweis={daten.summe.minutenOffen ? `${stunden(daten.summe.minutenOffen)} noch offen` : "alles freigegeben"}
                ton={daten.summe.minutenOffen ? "text-amber-600" : undefined}
              />
            </section>

            {/* Was die Zahl unsicher macht, steht über der Tabelle und nicht darunter. */}
            <div className="mt-4 space-y-2">
              {daten.laufend ? (
                <p className="rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">
                  <strong>Der Monat läuft noch.</strong> Die volle Pauschale steht schon drin, die Stunden sind erst zum Teil erfasst — die Marge sieht dadurch besser aus, als sie am Monatsende sein wird.
                </p>
              ) : null}
              {daten.summe.minutenOffen ? (
                <p className="rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">
                  <strong>{stunden(daten.summe.minutenOffen)} sind noch nicht freigegeben</strong> und deshalb hier nicht gezählt. Bei Objekten mit Stundensatz fehlt dieser Erlös noch.{" "}
                  <Link href="/mitarbeiter/admin/zeiten" className="font-semibold underline">Zur Zeitenfreigabe</Link>
                </p>
              ) : null}
              {/* Steht die Zahl aus der Abrechnung, ist der fehlende Stundenlohn
                  je Person kein Mangel mehr am Gesamtergebnis — nur noch
                  daran, dass sich der Lohn nicht auf Objekte verteilen lässt. */}
              {daten.personenOhneLohn.length && daten.lohnkostenMonat === null ? (
                <p className="rounded-xl bg-danger-100 px-4 py-3 text-[14px] text-danger-700">
                  <strong>Ohne hinterlegten Stundenlohn:</strong> {daten.personenOhneLohn.join(", ")}. Deren Stunden fehlen in den Kosten, der Deckungsbeitrag ist dadurch zu hoch.{" "}
                  <Link href="/mitarbeiter/admin/mitarbeiter" className="font-semibold underline">Zu den Mitarbeitern</Link>
                </p>
              ) : null}
              {daten.summe.materialOhnePreis ? (
                <p className="rounded-xl bg-danger-100 px-4 py-3 text-[14px] text-danger-700">
                  <strong>{daten.summe.materialOhnePreis} Materialzeilen ohne Einkaufspreis.</strong> Diese Kosten fehlen. Trag den Preis am Artikel nach, dann zählt er ab der nächsten Bestellung mit.{" "}
                  <Link href="/mitarbeiter/admin/artikel" className="font-semibold underline">Zu den Artikeln</Link>
                </p>
              ) : null}
              {daten.materialGemeldet?.length ? (
                <p className="rounded-xl bg-paper-200 px-4 py-3 text-[14px] text-ink-600">
                  {daten.materialGemeldet.length === 1 ? "Ein Artikel ist gemeldet" : `${daten.materialGemeldet.length} Artikel sind gemeldet`}, aber noch nicht bestellt — kostet noch nichts.{" "}
                  <Link href="/mitarbeiter/admin/bestellungen" className="font-semibold underline">Zu den Bestellungen</Link>
                </p>
              ) : null}
              {daten.summe.minutenOhneObjekt ? (
                <p className="rounded-xl bg-paper-200 px-4 py-3 text-[14px] text-ink-600">
                  {stunden(daten.summe.minutenOhneObjekt)} wurden ohne Objekt gestempelt und tauchen in keiner Zeile auf.
                </p>
              ) : null}
              <p className="rounded-xl border border-paper-200 px-4 py-3 text-[13px] leading-relaxed text-ink-500">
                {daten.lohnkostenMonat === null
                  ? daten.hinweisKosten
                  : "Die Lohnkosten oben sind die eingetragene Gesamtsumme aus der Abrechnung. In der Tabelle steht je Objekt nur, was sich über die gestempelten Stunden zuordnen lässt — die Spalte summiert sich deshalb nicht auf die Gesamtsumme."}{" "}
                Die Ampel steht auf Gelb unter {MARGE_GUT} % Marge — eine gesetzte Marke, keine betriebswirtschaftliche Regel.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-ink-400">Sortiert nach</span>
              {([["db", "Deckungsbeitrag"], ["erloes", "Erlös"], ["stunden", "Stunden"], ["name", "Name"]] as const).map(([wert, label]) => (
                <button
                  key={wert}
                  type="button"
                  onClick={() => setSortierung(wert)}
                  className={cx(
                    "rounded-lg px-3 py-1.5 text-[13px] font-semibold transition",
                    sortierung === wert ? "bg-ink-900 text-white" : "border border-paper-200 bg-white text-ink-500"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
              <table className="w-full min-w-[1040px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-paper-200 text-[11px] uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-3 font-semibold">Objekt</th>
                    <th className="px-4 py-3 font-semibold">Abrechnung</th>
                    <th className="px-4 py-3 text-right font-semibold">Stunden</th>
                    <th className="px-4 py-3 text-right font-semibold">Erlös</th>
                    <th className="px-4 py-3 text-right font-semibold">Lohnkosten</th>
                    <th className="px-4 py-3 text-right font-semibold">Material</th>
                    <th className="px-4 py-3 text-right font-semibold">Deckungsbeitrag</th>
                    <th className="px-4 py-3 text-right font-semibold">Marge</th>
                    <th className="px-4 py-3 text-right font-semibold">€ je Stunde</th>
                  </tr>
                </thead>
                <tbody>
                  {gerechnet.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-[15px] text-ink-400">
                        Für diesen Monat gibt es keine Objekte mit hinterlegter Pauschale oder Stundensatz.
                      </td>
                    </tr>
                  ) : (
                    gerechnet.map((zeile) => (
                      <tr key={zeile.id} className="border-b border-paper-100 last:border-0 hover:bg-paper-50">
                        <td className="px-4 py-3">
                          <span className="flex items-start gap-2.5">
                            <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", ampel(zeile))} />
                            <span className="min-w-0">
                              <span className="block text-[14px] font-semibold text-ink-900">{zeile.name}</span>
                              {zeile.kunde ? <span className="block text-[12px] text-ink-400">{zeile.kunde}</span> : null}
                              {zeile.minutenOhneLohn ? (
                                <span className="block text-[12px] text-danger-600">{stunden(zeile.minutenOhneLohn)} ohne Stundenlohn</span>
                              ) : null}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block text-[13px] font-medium text-ink-700">
                            {zeile.art === "pauschale" ? "Pauschale" : "Stundensatz"}
                          </span>
                          <span className="block text-[12px] text-ink-400">
                            {zeile.art === "pauschale" ? `${euroGenau(zeile.pauschale)} im Monat` : `${euroGenau(zeile.stundensatz)} je Stunde`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="block text-[14px] text-ink-800">{stunden(zeile.minutenFrei)}</span>
                          {zeile.minutenOffen ? <span className="block text-[12px] text-amber-600">{stunden(zeile.minutenOffen)} offen</span> : null}
                        </td>
                        <td className="px-4 py-3 text-right text-[14px] text-ink-800">{euro(zeile.erloes)}</td>
                        <td className="px-4 py-3 text-right text-[14px] text-ink-800">{euro(zeile.lohnkosten)}</td>
                        <td className="px-4 py-3 text-right">
                          {zeile.materialZeilen ? (
                            <>
                              <span className="block text-[14px] text-ink-800">{euro(zeile.materialkosten)}</span>
                              {zeile.materialerloes ? (
                                <span className="block text-[12px] text-success-700">+{euro(zeile.materialerloes)} berechnet</span>
                              ) : (
                                <span className="block text-[12px] text-ink-400">nicht berechnet</span>
                              )}
                              {zeile.materialOhnePreis ? (
                                <span className="block text-[12px] text-amber-600">{zeile.materialOhnePreis} ohne Preis</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-[14px] text-ink-300">–</span>
                          )}
                        </td>
                        <td className={cx("px-4 py-3 text-right text-[14px] font-semibold", (zeile.deckungsbeitrag ?? 0) < 0 ? "text-danger-600" : "text-ink-900")}>
                          {euro(zeile.deckungsbeitrag)}
                        </td>
                        <td className={cx("px-4 py-3 text-right text-[14px]", (zeile.marge ?? 0) < 0 ? "text-danger-600" : "text-ink-700")}>
                          {prozent(zeile.marge)}
                        </td>
                        <td className="px-4 py-3 text-right text-[14px] text-ink-700">{euroGenau(zeile.erloesJeStunde)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {gerechnet.length ? (
                  <tfoot>
                    <tr className="border-t-2 border-paper-200 bg-paper-50 text-[14px] font-semibold">
                      <td className="px-4 py-3" colSpan={2}>Summe</td>
                      <td className="px-4 py-3 text-right">{stunden(gerechnet.reduce((s, z) => s + z.minutenFrei, 0))}</td>
                      <td className="px-4 py-3 text-right">{euro(gerechnet.reduce((s, z) => s + z.erloes, 0))}</td>
                      <td className="px-4 py-3 text-right">{euro(gerechnet.reduce((s, z) => s + z.lohnkosten, 0))}</td>
                      <td className="px-4 py-3 text-right">{euro(gerechnet.reduce((s, z) => s + z.materialkosten, 0))}</td>
                      <td className="px-4 py-3 text-right">{euro(gerechnet.reduce((s, z) => s + (z.deckungsbeitrag ?? 0), 0))}</td>
                      <td className="px-4 py-3" colSpan={2} />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            {/* Objekte ohne Satz sind keine Nullzeile, sondern eine offene Aufgabe. */}
            {ohneSatz.length ? (
              <div className="mt-5 rounded-2xl border border-paper-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <UiIcon name="warning" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">
                      {ohneSatz.length === 1 ? "Ein Objekt ohne Satz" : `${ohneSatz.length} Objekte ohne Satz`}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-500">
                      Hier steht weder eine Pauschale noch ein Stundensatz. Diese Objekte fehlen in der Rechnung oben — mit null Umsatz würden sie das Bild verzerren.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {ohneSatz.map((zeile) => (
                    <Link
                      key={zeile.id}
                      href={`/mitarbeiter/admin/objekte?objekt=${zeile.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-paper-200 px-4 py-3 hover:border-brand-500"
                    >
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-ink-800">{zeile.name}</span>
                        {zeile.kunde ? <span className="block text-[12px] text-ink-400">{zeile.kunde}</span> : null}
                      </span>
                      <span className="shrink-0 text-[13px] text-ink-500">{stunden(zeile.minutenFrei)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <Link href="/mitarbeiter/admin/auswertung/zeiten" className="inline-flex items-center gap-2 text-[14px] font-semibold text-brand-700">
                Stunden, Stempelzeiten und GPS-Kontrolle
                <UiIcon name="chevronRight" className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : laden ? (
          <p className="mt-6 text-[15px] text-ink-400">Wird geladen …</p>
        ) : null}
      </div>

      {/* Lohnkosten des Monats */}
      {lohnOffen && daten ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-6" onClick={() => setLohnOffen(false)}>
          <div className="max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-bold">Lohnkosten {monatName(daten.monat)}</h3>
                <p className="mt-0.5 text-[13px] text-ink-400">Die Zahl aus deiner Lohnabrechnung, als Gesamtsumme.</p>
              </div>
              <button type="button" onClick={() => setLohnOffen(false)} className="text-ink-400">
                <UiIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-5 block">
              <span className="block text-[13px] text-ink-500">Gesamtkosten<span className="text-danger-500"> *</span></span>
              <input
                inputMode="decimal"
                value={lohnForm.lohnkosten}
                onChange={(e) => setLohnForm({ ...lohnForm, lohnkosten: e.target.value })}
                placeholder="z. B. 5338,73"
                className="mt-1.5 w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[17px] font-semibold text-ink-900 outline-none focus:border-brand-500"
              />
            </label>

            <p className="mt-5 text-[13px] font-semibold text-ink-600">Aufteilung, freiwillig</p>
            <p className="mt-0.5 text-[12px] text-ink-400">
              Nur zum Nachschlagen. Lässt du die Gesamtsumme leer, wird sie aus diesen drei gebildet.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {([["gehalt", "Gehalt"], ["ag_kosten", "AG-Kosten"], ["sachzuwendung", "Sachzuwendung"]] as const).map(([schluessel, label]) => (
                <label key={schluessel} className="block">
                  <span className="block text-[12px] text-ink-500">{label}</span>
                  <input
                    inputMode="decimal"
                    value={lohnForm[schluessel]}
                    onChange={(e) => setLohnForm({ ...lohnForm, [schluessel]: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-paper-200 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-brand-500"
                  />
                </label>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="block text-[13px] text-ink-500">Notiz</span>
              <textarea
                rows={2}
                value={lohnForm.notiz}
                onChange={(e) => setLohnForm({ ...lohnForm, notiz: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[14px] outline-none focus:border-brand-500"
              />
            </label>

            <div className="mt-6 flex items-center gap-3">
              <button type="button" disabled={lohnSpeichert} onClick={lohnSpeichern} className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40">
                {lohnSpeichert ? "Wird gespeichert …" : "Speichern"}
              </button>
              <button type="button" onClick={() => setLohnOffen(false)} className="rounded-xl border border-paper-300 px-4 py-3 text-[15px] font-semibold text-ink-700">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
