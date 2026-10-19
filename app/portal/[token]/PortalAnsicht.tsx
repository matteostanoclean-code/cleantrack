"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UiIcon, cx } from "@/components/ui";
import { antwortLesen, bilderVerkleinern } from "@/lib/bild";

/**
 * Was der Kunde sieht: wann wir da waren, und ein Weg, sich zu beschweren.
 *
 * Bewusst karg. Wer hier landet, hat eine von zwei Fragen: "Waren die
 * eigentlich da?" oder "Das war nicht in Ordnung." Für beides braucht es
 * keine Oberfläche mit zwölf Knöpfen.
 *
 * Keine Stunden, keine Preise, keine Namen — das steht so auch auf der Seite,
 * damit niemand dahinter etwas Verstecktes vermutet.
 */

type Besuch = { datum: string; objektId: string; objekt: string; leistungen: string[] };
type Objekt = { id: string; name: string; anschrift: string };

function datumText(wert: string) {
  const datum = new Date(`${wert}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return wert;
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(datum);
}

function monatText(wert: string) {
  const datum = new Date(`${wert}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return wert;
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(datum);
}

export default function PortalAnsicht({ token }: { token: string }) {
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kunde, setKunde] = useState<{ name: string } | null>(null);
  const [objekte, setObjekte] = useState<Objekt[]>([]);
  const [besuche, setBesuche] = useState<Besuch[]>([]);
  const [objektFilter, setObjektFilter] = useState("");

  const [meldenOffen, setMeldenOffen] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [gesendet, setGesendet] = useState<string | null>(null);
  const [form, setForm] = useState({ work_site_id: "", beschreibung: "", name: "", email: "", telefon: "" });
  const [bilder, setBilder] = useState<File[]>([]);

  const holen = useCallback(async () => {
    setLaden(true);
    setFehler(null);
    try {
      const antwort = await fetch(`/api/portal/${encodeURIComponent(token)}`, { cache: "no-store" });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Das hat nicht geklappt.");
      setKunde(ergebnis.kunde);
      setObjekte(ergebnis.objekte || []);
      setBesuche(ergebnis.besuche || []);
      if ((ergebnis.objekte || []).length === 1) setForm((alt) => ({ ...alt, work_site_id: ergebnis.objekte[0].id }));
    } catch (ladeFehler) {
      setFehler(ladeFehler instanceof Error ? ladeFehler.message : "Das hat nicht geklappt.");
    } finally {
      setLaden(false);
    }
  }, [token]);

  useEffect(() => { holen(); }, [holen]);

  const gefiltert = useMemo(
    () => besuche.filter((besuch) => !objektFilter || besuch.objektId === objektFilter),
    [besuche, objektFilter]
  );

  // Nach Monat gruppieren: so liest sich eine Liste von Terminen.
  const nachMonat = useMemo(() => {
    const karte = new Map<string, Besuch[]>();
    for (const besuch of gefiltert) {
      const monat = besuch.datum.slice(0, 7);
      karte.set(monat, [...(karte.get(monat) || []), besuch]);
    }
    return Array.from(karte.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [gefiltert]);

  async function senden() {
    if (!form.beschreibung.trim()) { setFehler("Bitte beschreiben Sie kurz, was nicht gepasst hat."); return; }
    setSendet(true);
    setFehler(null);
    try {
      // Bilder zuerst, damit die Meldung die fertigen Adressen mitbringt.
      const adressen: string[] = [];
      if (bilder.length) {
        const kleinere = await bilderVerkleinern(bilder.slice(0, 6));
        for (const bild of kleinere) {
          const daten = new FormData();
          daten.set("bild", bild);
          const antwort = await fetch(`/api/portal/${encodeURIComponent(token)}/bild`, { method: "POST", body: daten });
          const ergebnis = await antwortLesen(antwort);
          if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Ein Bild konnte nicht hochgeladen werden.");
          adressen.push(ergebnis.url);
        }
      }

      const antwort = await fetch(`/api/portal/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, photo_urls: adressen })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Die Meldung konnte nicht gesendet werden.");

      setGesendet(ergebnis.kuerzel);
      setMeldenOffen(false);
      setForm({ work_site_id: objekte.length === 1 ? objekte[0].id : "", beschreibung: "", name: "", email: "", telefon: "" });
      setBilder([]);
    } catch (sendeFehler) {
      setFehler(sendeFehler instanceof Error ? sendeFehler.message : "Die Meldung konnte nicht gesendet werden.");
    } finally {
      setSendet(false);
    }
  }

  if (laden) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-ink-400">Wird geladen …</main>;

  if (!kunde) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-paper-100 px-5 text-center">
        <div className="max-w-[380px]">
          <img src="/logo-app.png" alt="" className="mx-auto w-full max-w-[220px]" />
          <p className="mt-6 text-[15px] leading-relaxed text-ink-500">
            Dieser Zugang ist nicht gültig. Vielleicht wurde der Link erneuert — fragen Sie bitte kurz bei uns nach.
          </p>
        </div>
      </main>
    );
  }

  const feldClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none focus:border-brand-500";

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="mx-auto max-w-[680px] px-4 py-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <img src="/logo-app.png" alt="Matteo Stano Clean Gebäudereinigung" className="h-10 w-auto object-contain" />
            <h1 className="mt-4 text-[26px] font-bold leading-tight">{kunde.name}</h1>
            <p className="mt-1 text-[14px] text-ink-500">Ihre Reinigungstermine der letzten sechs Monate.</p>
          </div>
        </header>

        {gesendet ? (
          <div className="mt-5 rounded-2xl border border-success-500/40 bg-success-100 p-4">
            <p className="text-[15px] font-semibold text-success-700">Ihre Meldung ist angekommen.</p>
            <p className="mt-1 text-[14px] text-success-700">
              Sie liegt unter {gesendet} vor und wird von uns bearbeitet. Wir melden uns bei Ihnen.
            </p>
          </div>
        ) : null}
        {fehler ? <div className="mt-5 rounded-2xl bg-danger-100 px-4 py-3 text-[14px] text-danger-700">{fehler}</div> : null}

        <button
          type="button"
          onClick={() => { setMeldenOffen(true); setGesendet(null); setFehler(null); }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-4 text-[16px] font-semibold text-white"
        >
          <UiIcon name="warning" className="h-5 w-5" />
          Etwas reklamieren
        </button>

        {objekte.length > 1 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setObjektFilter("")}
              className={cx("rounded-lg px-3 py-2 text-[14px] font-semibold", !objektFilter ? "bg-ink-900 text-white" : "border border-paper-200 bg-white text-ink-600")}
            >
              Alle Objekte
            </button>
            {objekte.map((objekt) => (
              <button
                key={objekt.id}
                type="button"
                onClick={() => setObjektFilter(objekt.id === objektFilter ? "" : objekt.id)}
                className={cx("rounded-lg px-3 py-2 text-[14px] font-semibold", objektFilter === objekt.id ? "bg-ink-900 text-white" : "border border-paper-200 bg-white text-ink-600")}
              >
                {objekt.name}
              </button>
            ))}
          </div>
        ) : null}

        {nachMonat.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-paper-200 bg-white px-4 py-8 text-center text-[15px] text-ink-400">
            Für diesen Zeitraum ist noch kein Termin erfasst.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {nachMonat.map(([monat, eintraege]) => (
              <section key={monat}>
                <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">
                  {monatText(`${monat}-01`)} · {eintraege.length} {eintraege.length === 1 ? "Termin" : "Termine"}
                </p>
                <div className="mt-2 overflow-hidden rounded-2xl border border-paper-200 bg-white">
                  {eintraege.map((besuch) => (
                    <div key={`${besuch.datum}-${besuch.objektId}`} className="flex items-start gap-3 border-b border-paper-100 px-4 py-3 last:border-0">
                      <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success-100 text-success-700">
                        <UiIcon name="check" className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold">{datumText(besuch.datum)}</p>
                        <p className="text-[13px] text-ink-400">
                          {besuch.objekt}
                          {besuch.leistungen.length ? ` · ${besuch.leistungen.join(", ")}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="mt-8 text-[12px] leading-relaxed text-ink-400">
          Angezeigt werden Tage, an denen vor Ort gearbeitet wurde. Arbeitszeiten, Preise und Namen unserer
          Mitarbeiterinnen und Mitarbeiter werden hier bewusst nicht gezeigt. Fragen zum Vertrag oder zur Rechnung
          beantworten wir gern persönlich.
        </p>
      </div>

      {/* Reklamation */}
      {meldenOffen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-6" onClick={() => setMeldenOffen(false)}>
          <div className="max-h-[92dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[19px] font-bold">Etwas reklamieren</h2>
                <p className="mt-0.5 text-[13px] text-ink-400">Wir schauen uns das an und melden uns bei Ihnen.</p>
              </div>
              <button type="button" onClick={() => setMeldenOffen(false)} className="text-ink-400" aria-label="Schließen">
                <UiIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {objekte.length > 1 ? (
                <label className="block">
                  <span className="block text-[13px] text-ink-500">Um welches Objekt geht es?</span>
                  <select value={form.work_site_id} onChange={(e) => setForm({ ...form, work_site_id: e.target.value })} className={`${feldClass} mt-1.5`}>
                    <option value="">Bitte wählen</option>
                    {objekte.map((objekt) => <option key={objekt.id} value={objekt.id}>{objekt.name}</option>)}
                  </select>
                </label>
              ) : null}

              <label className="block">
                <span className="block text-[13px] text-ink-500">Was hat nicht gepasst?</span>
                <textarea
                  rows={5}
                  value={form.beschreibung}
                  onChange={(e) => setForm({ ...form, beschreibung: e.target.value })}
                  placeholder="Zum Beispiel: Im Treppenhaus im 2. OG wurde nicht gewischt."
                  className={`${feldClass} mt-1.5 placeholder:text-ink-200`}
                />
              </label>

              <label className="block rounded-xl border border-dashed border-paper-300 p-4">
                <span className="text-[13px] text-ink-500">Foto, bis zu sechs — hilft uns sehr</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setBilder(Array.from(e.target.files || []).slice(0, 6))}
                  className="mt-3 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                />
                {bilder.length ? <p className="mt-2 text-[13px] text-ink-600">{bilder.length} ausgewählt</p> : null}
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-[13px] text-ink-500">Ihr Name</span>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${feldClass} mt-1.5`} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-ink-500">Rückruf unter</span>
                  <input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} className={`${feldClass} mt-1.5`} />
                </label>
              </div>
              <label className="block">
                <span className="block text-[13px] text-ink-500">E-Mail, falls wir schriftlich antworten sollen</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${feldClass} mt-1.5`} />
              </label>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button type="button" disabled={sendet} onClick={senden} className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-50">
                {sendet ? "Wird gesendet …" : "Absenden"}
              </button>
              <button type="button" onClick={() => setMeldenOffen(false)} className="rounded-xl border border-paper-300 px-4 py-3 text-[15px] font-semibold text-ink-700">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
