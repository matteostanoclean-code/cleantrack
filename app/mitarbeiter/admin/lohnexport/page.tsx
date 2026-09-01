"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Lohn: was jeder im Monat gearbeitet hat und was in den Lohn geht.
 *
 * Die Zeiten kommen aus derselben Rechnung wie die Zeitenfreigabe. Solange
 * dort etwas offen ist, ist die Lohnzeit vorläufig — deshalb steht "Offen"
 * in der zweiten Spalte und nicht irgendwo hinten. Wer eine rote Zahl hat,
 * darf noch nicht exportiert werden.
 */

type Zeile = {
  id: string;
  name: string;
  employee_number: string;
  offen: number;
  vertragMinuten: number;
  sollMinuten: number;
  arbeitMinuten: number;
  abwesenheitMinuten: number;
  lohnMinuten: number;
  saldoMinuten: number;
  stundensatz: number;
};

function aktuellerMonat() {
  return new Date().toISOString().slice(0, 7);
}

function monatText(monat: string) {
  if (!/^\d{4}-\d{2}$/.test(monat)) return monat;
  const [j, m] = monat.split("-").map(Number);
  return new Date(j, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function monatVerschieben(monat: string, schritte: number) {
  const [j, m] = monat.split("-").map(Number);
  const datum = new Date(j, (m - 1) + schritte, 1);
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}`;
}

function stunden(minuten: number) {
  const negativ = minuten < 0;
  const m = Math.abs(Math.round(minuten));
  return `${negativ ? "– " : ""}${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} Std.`;
}

export default function LohnSeite() {
  const [token, setToken] = useState("");
  const [laedt, setLaedt] = useState(true);
  const [lade, setLade] = useState(false);
  const [monat, setMonat] = useState(aktuellerMonat());
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [suche, setSuche] = useState("");
  const [zeilen, setZeilen] = useState<Zeile[]>([]);

  const laden = useCallback(async (currentToken: string, welcherMonat: string) => {
    if (!currentToken) return;
    setLade(true);
    setFehler("");
    try {
      const antwort = await fetch(`/api/admin/lohn?month=${welcherMonat}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Lohnübersicht konnte nicht geladen werden.");
      setZeilen(ergebnis.zeilen || []);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Lohnübersicht konnte nicht geladen werden.");
    } finally {
      setLade(false);
    }
  }, []);

  useEffect(() => {
    async function start() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const sessionToken = data.session?.access_token || "";
      setToken(sessionToken);
      setLaedt(false);
      if (sessionToken) await laden(sessionToken, monat);
    }
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token) laden(token, monat);
  }, [token, monat, laden]);

  const gefiltert = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    if (!needle) return zeilen;
    return zeilen.filter((zeile) => `${zeile.name} ${zeile.employee_number}`.toLowerCase().includes(needle));
  }, [zeilen, suche]);

  const summe = useMemo(() => ({
    offen: gefiltert.reduce((s, z) => s + z.offen, 0),
    arbeit: gefiltert.reduce((s, z) => s + z.arbeitMinuten, 0),
    abwesenheit: gefiltert.reduce((s, z) => s + z.abwesenheitMinuten, 0),
    lohn: gefiltert.reduce((s, z) => s + z.lohnMinuten, 0)
  }), [gefiltert]);

  async function herunterladen() {
    setArbeitet(true);
    setMeldung("");
    setFehler("");
    try {
      const antwort = await fetch(`/api/admin/lohnexport?month=${monat}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!antwort.ok) {
        const text = await antwort.text();
        let grund = "Export fehlgeschlagen.";
        try {
          grund = JSON.parse(text).error || grund;
        } catch {
          /* Antwort war kein JSON */
        }
        throw new Error(grund);
      }

      const daten = await antwort.blob();
      const adresse = URL.createObjectURL(daten);
      const link = document.createElement("a");
      link.href = adresse;
      link.download = `Arbeitszeiten_${monat}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(adresse);
      setMeldung(`Datei für ${monatText(monat)} wurde erstellt.`);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Export fehlgeschlagen.");
    } finally {
      setArbeitet(false);
    }
  }

  if (laedt) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Lädt…</main>;
  if (!token) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</main>;

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="px-4 py-5 md:px-6 xl:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
              <UiIcon name="euro" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Lohn</h1>
          </div>
          <button onClick={herunterladen} disabled={arbeitet} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60">
            {arbeitet ? "Erstelle…" : "Lohnexport erstellen"}
          </button>
        </header>

        {fehler ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{fehler}</p> : null}
        {meldung ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{meldung}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-paper-300 bg-white">
            <button onClick={() => setMonat(monatVerschieben(monat, -1))} className="px-3 py-2.5 text-ink-600" aria-label="Monat zurück"><UiIcon name="chevronLeft" className="h-4 w-4" /></button>
            <span className="border-x border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700">{monatText(monat)}</span>
            <button onClick={() => setMonat(monatVerschieben(monat, 1))} className="px-3 py-2.5 text-ink-600" aria-label="Monat vor"><UiIcon name="chevronRight" className="h-4 w-4" /></button>
          </div>
          <button onClick={() => setMonat(aktuellerMonat())} className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700">Dieser Monat</button>
          <div className="flex w-full max-w-[260px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
            <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
          </div>
        </div>

        {/*
          Solange etwas offen ist, ist die Lohnzeit vorläufig. Das gehört an den
          Anfang und nicht ins Kleingedruckte unter der Tabelle.
        */}
        {summe.offen > 0 ? (
          <a href="/mitarbeiter/admin/zeiten" className="mt-4 flex items-center gap-3 rounded-xl border border-danger-500/40 bg-danger-50 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger-500 text-[15px] font-bold text-white">{summe.offen}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-danger-700">Zeiten noch nicht freigegeben</span>
              <span className="block text-[13px] text-danger-700/80">Solange sie offen sind, stimmt die Lohnzeit nicht. In der Zeitenfreigabe erledigen.</span>
            </span>
            <UiIcon name="chevronRight" className="h-4 w-4 shrink-0 text-danger-700" />
          </a>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-3 py-3">Offen</th>
                <th className="px-3 py-3">Nr.</th>
                <th className="px-3 py-3 text-right">Vertrag</th>
                <th className="px-3 py-3 text-right">Soll</th>
                <th className="px-3 py-3 text-right">Arbeitszeit</th>
                <th className="px-3 py-3 text-right">Abwesenheit</th>
                <th className="px-3 py-3 text-right">Lohnzeit</th>
                <th className="px-3 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((zeile) => (
                <tr key={zeile.id} className="border-b border-paper-200 last:border-0">
                  <td className="px-4 py-3 text-[15px] font-semibold text-ink-900">{zeile.name}</td>
                  <td className="px-3 py-3">
                    {zeile.offen > 0 ? (
                      <a href="/mitarbeiter/admin/zeiten" className="inline-block rounded-md bg-danger-500 px-2 py-1 text-[12px] font-bold text-white">{zeile.offen}</a>
                    ) : (
                      <span className="inline-block rounded-md bg-success-500 px-2 py-1 text-[12px] font-bold text-white">Fertig</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[14px] text-ink-500">{zeile.employee_number || "–"}</td>
                  <td className="px-3 py-3 text-right text-[14px] text-ink-600">{zeile.vertragMinuten ? stunden(zeile.vertragMinuten) : "–"}</td>
                  <td className="px-3 py-3 text-right text-[14px] text-ink-600">{stunden(zeile.sollMinuten)}</td>
                  <td className="px-3 py-3 text-right text-[14px] text-ink-800">{stunden(zeile.arbeitMinuten)}</td>
                  <td className="px-3 py-3 text-right text-[14px] text-ink-600">{stunden(zeile.abwesenheitMinuten)}</td>
                  <td className="px-3 py-3 text-right text-[15px] font-bold text-ink-900">{stunden(zeile.lohnMinuten)}</td>
                  <td className={cx("px-3 py-3 text-right text-[14px] font-semibold", zeile.saldoMinuten < 0 ? "text-danger-600" : zeile.saldoMinuten > 0 ? "text-amber-700" : "text-ink-500")}>
                    {zeile.vertragMinuten ? stunden(zeile.saldoMinuten) : "–"}
                  </td>
                </tr>
              ))}
              {!gefiltert.length && !lade ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-[14px] text-ink-400">Keine Mitarbeiter in dieser Auswahl.</td></tr>
              ) : null}
            </tbody>
            {gefiltert.length ? (
              <tfoot>
                <tr className="border-t-2 border-paper-300 bg-paper-100/60">
                  <td className="px-4 py-3 text-[14px] font-bold" colSpan={5}>Zusammen</td>
                  <td className="px-3 py-3 text-right text-[14px] font-bold">{stunden(summe.arbeit)}</td>
                  <td className="px-3 py-3 text-right text-[14px] font-bold">{stunden(summe.abwesenheit)}</td>
                  <td className="px-3 py-3 text-right text-[15px] font-bold text-ink-900">{stunden(summe.lohn)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        <div className="mt-3 max-w-[720px] text-[13px] leading-relaxed text-ink-400">
          <p><strong className="text-ink-600">Vertrag</strong> ist das Vereinbarte, aus den Wochenstunden auf den Monat gerechnet. Ohne hinterlegte Stunden steht dort ein Strich.</p>
          <p className="mt-1"><strong className="text-ink-600">Soll</strong> ist die Summe der Zeitvorgaben aller Einsätze im Monat, <strong className="text-ink-600">Arbeitszeit</strong> das, was freigegeben ist.</p>
          <p className="mt-1"><strong className="text-ink-600">Lohnzeit</strong> ist Arbeitszeit plus gutgeschriebene Abwesenheit — das geht in den Lohn.</p>
        </div>
      </div>
    </main>
  );
}
