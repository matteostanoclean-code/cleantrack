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
type Reklamation = {
  kuerzel: string;
  datum: string;
  objekt: string;
  text: string;
  stand: "eingegangen" | "in_arbeit" | "erledigt";
  erledigtAm: string | null;
};

/** Wie der Stand einer Reklamation aussieht: Wort, Farbe, Zeichen. */
const STAND: Record<Reklamation["stand"], { wort: string; farbe: string; icon: string }> = {
  eingegangen: { wort: "Eingegangen", farbe: "bg-paper-200 text-ink-600", icon: "clock" },
  in_arbeit: { wort: "In Arbeit", farbe: "bg-brand-50 text-brand-700", icon: "stopwatch" },
  erledigt: { wort: "Erledigt", farbe: "bg-success-100 text-success-700", icon: "check" }
};

function datumText(wert: string) {
  const datum = new Date(`${wert}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return wert;
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(datum);
}

/** TT/MM/JJJJ — die Schreibweise, die im ganzen Haus gilt. */
function datumKurz(wert: string) {
  const teile = String(wert || "").slice(0, 10).split("-");
  return teile.length === 3 ? `${teile[2]}/${teile[1]}/${teile[0]}` : wert;
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
  const [reklamationen, setReklamationen] = useState<Reklamation[]>([]);
  const [objektFilter, setObjektFilter] = useState("");
  // Aufgeklappte Monate. Der neueste geht beim Laden von allein auf, die
  // älteren bleiben zu — sonst scrollt man durch ein halbes Jahr Termine.
  const [offeneMonate, setOffeneMonate] = useState<string[]>([]);
  const [listeOffen, setListeOffen] = useState(false);

  const [meldenOffen, setMeldenOffen] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [gesendet, setGesendet] = useState<string | null>(null);
  const [form, setForm] = useState({ work_site_id: "", beschreibung: "", name: "", email: "", telefon: "" });
  const [bilder, setBilder] = useState<File[]>([]);

  // `still` lädt nach, ohne die Seite gegen "Wird geladen …" zu tauschen —
  // nach dem Absenden einer Meldung soll die Bestätigung stehen bleiben.
  const holen = useCallback(async (still = false) => {
    if (!still) setLaden(true);
    setFehler(null);
    try {
      const antwort = await fetch(`/api/portal/${encodeURIComponent(token)}`, { cache: "no-store" });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Das hat nicht geklappt.");
      setKunde(ergebnis.kunde);
      setObjekte(ergebnis.objekte || []);
      setBesuche(ergebnis.besuche || []);
      setReklamationen(ergebnis.reklamationen || []);
      // Immer genau ein Objekt im Blick. Eine Sammelansicht über alle Objekte
      // mischte Treppenhaus und Büro in dieselbe Liste und half niemandem
      // (Ansage 02.11.2026).
      //
      // Offen ist das Objekt mit dem jüngsten Termin, nicht das erste im
      // Alphabet: Wer das Portal aufmacht, will sehen, wo zuletzt gereinigt
      // wurde — nicht ein Objekt, unter dem nichts steht.
      const objekteListe: Objekt[] = ergebnis.objekte || [];
      const zuletzt = (ergebnis.besuche || [])[0]?.objektId;
      const start = objekteListe.find((objekt) => objekt.id === zuletzt) || objekteListe[0];
      if (start) {
        setObjektFilter((alt) => alt || start.id);
        setForm((alt) => ({ ...alt, work_site_id: alt.work_site_id || start.id }));
      }
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

  // Der neueste Monat geht auf, sobald die Liste steht oder das Objekt
  // wechselt. Ohne das stünde man vor lauter zugeklappten Kästen.
  useEffect(() => {
    const neuester = nachMonat[0]?.[0];
    setOffeneMonate(neuester ? [neuester] : []);
  }, [nachMonat]);

  const offeneMeldungen = useMemo(
    () => reklamationen.filter((eintrag) => eintrag.stand !== "erledigt").length,
    [reklamationen]
  );

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
      setForm({ work_site_id: objektFilter || objekte[0]?.id || "", beschreibung: "", name: "", email: "", telefon: "" });
      setBilder([]);
      // Neu laden, damit die frische Meldung gleich in der Liste steht.
      await holen(true);
      setListeOffen(true);
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

        {/*
          Was schon gemeldet wurde, mit Stand. Vorher sah der Kunde nach dem
          Absenden nie wieder, was aus seiner Meldung geworden ist — und rief
          an, um genau das zu fragen (Ansage 02.11.2026).
        */}
        {reklamationen.length ? (
          <button
            type="button"
            onClick={() => setListeOffen((alt) => !alt)}
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-paper-200 bg-white px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper-200 text-ink-600">
                <UiIcon name="list" className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">Eingereichte Reklamationen</span>
                <span className="mt-0.5 block text-[13px] text-ink-400">
                  {reklamationen.length} {reklamationen.length === 1 ? "Meldung" : "Meldungen"}
                  {offeneMeldungen ? ` · ${offeneMeldungen} in Bearbeitung` : " · alle erledigt"}
                </span>
              </span>
            </span>
            <UiIcon name={listeOffen ? "chevronDown" : "chevronRight"} className="h-5 w-5 shrink-0 text-ink-300" />
          </button>
        ) : null}

        {listeOffen ? (
          <div className="mt-2 space-y-2">
            {reklamationen.map((eintrag) => {
              const stand = STAND[eintrag.stand] || STAND.eingegangen;
              return (
                <div key={eintrag.kuerzel} className="rounded-2xl border border-paper-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-ink-400">
                        {datumText(eintrag.datum)}
                        {eintrag.objekt ? ` · ${eintrag.objekt}` : ""}
                      </p>
                      <p className="mt-1 text-[15px] leading-snug">{eintrag.text}</p>
                    </div>
                    <span className={cx("flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold", stand.farbe)}>
                      <UiIcon name={stand.icon} className="h-3.5 w-3.5" />
                      {stand.wort}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-ink-300">
                    {eintrag.kuerzel}
                    {eintrag.stand === "erledigt" && eintrag.erledigtAm ? ` · erledigt am ${datumKurz(eintrag.erledigtAm)}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}

        {/*
          Ein Objekt zur Zeit. Ein Knopf "Alle Objekte" gab es, er mischte
          aber Treppenhaus und Büro in eine Liste (Ansage 02.11.2026).
        */}
        {objekte.length > 1 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {objekte.map((objekt) => (
              <button
                key={objekt.id}
                type="button"
                onClick={() => setObjektFilter(objekt.id)}
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
          /*
            Monatsweise zum Aufklappen. Der neueste Monat steht offen, die
            älteren als Zeile mit Anzahl — ein halbes Jahr Termine am Stück
            war nicht zu überblicken (Ansage 02.11.2026).
          */
          <div className="mt-5 space-y-2">
            {nachMonat.map(([monat, eintraege]) => {
              const auf = offeneMonate.includes(monat);
              return (
                <section key={monat} className="overflow-hidden rounded-2xl border border-paper-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setOffeneMonate((alt) => (auf ? alt.filter((eintrag) => eintrag !== monat) : [...alt, monat]))}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold capitalize">{monatText(`${monat}-01`)}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-400">
                        {eintraege.length} {eintraege.length === 1 ? "Termin" : "Termine"}
                      </span>
                    </span>
                    <UiIcon name={auf ? "chevronDown" : "chevronRight"} className="h-5 w-5 shrink-0 text-ink-300" />
                  </button>
                  {auf ? (
                    <div className="border-t border-paper-100">
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
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
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
