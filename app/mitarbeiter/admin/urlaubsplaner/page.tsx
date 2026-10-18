"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Urlaubsplaner: ein ganzes Jahr, eine Zeile je Person.
 *
 * Die Abwesenheitsliste zeigt zwei bis acht Wochen. Das reicht, um zu sehen,
 * wer nächste Woche fehlt, aber nicht, um einen Sommer zu planen. Hier steht
 * das Jahr am Stück.
 *
 * Darunter die Kunden. Wenn beim Kunden Betriebsferien sind, wird dort nicht
 * gereinigt — das ist der beste Zeitraum für den Urlaub der eigenen Leute.
 * Bisher stand dieses Wissen nur in Matteos Kopf und die Planung lief daran
 * vorbei. Deshalb stehen beide Blöcke untereinander auf derselben Zeitachse,
 * nicht auf zwei Bildschirmen.
 *
 * Bedienung: einmal auf einen Tag tippen setzt den Anfang, ein zweites Mal in
 * derselben Zeile das Ende. Kein Ziehen, das geht auf dem Handy daneben.
 */

type Row = Record<string, any>;

type Mitarbeiter = { id: string; name: string; rolle: string; anspruch: number };
type Objekt = { id: string; name: string; customer_name: string | null };
type Feiertag = { name: string; datum: string };
type AnyFrei = {
  datum: string;
  objekte: Array<{ name: string; grund: string; einsaetze: number }>;
  personen: Array<{ name: string; entfallen: number; bleibt: number; objekte: string[] }>;
};

const ZELLE = 9;

const ARTEN = [
  { code: "urlaub", label: "Urlaub", farbe: "bg-amber-500" },
  { code: "krankheit", label: "Krankheit", farbe: "bg-danger-500" },
  { code: "unbezahlt", label: "Unbezahlte Freistellung", farbe: "bg-ink-400" },
  { code: "sonstiges", label: "Sonstiges", farbe: "bg-brand-600" }
];

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function zweistellig(zahl: number) {
  return String(zahl).padStart(2, "0");
}

function isoVon(jahr: number, monat: number, tag: number) {
  return `${jahr}-${zweistellig(monat + 1)}-${zweistellig(tag)}`;
}

function tageImMonat(jahr: number, monat: number) {
  return new Date(jahr, monat + 1, 0).getDate();
}

function wochentag(datum: string) {
  return new Date(`${datum}T12:00:00`).getDay();
}

function datumText(datum: string) {
  const wert = clean(datum).slice(0, 10);
  if (!wert) return "–";
  const d = new Date(`${wert}T12:00:00`);
  if (Number.isNaN(d.getTime())) return wert;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function artVon(eintrag: Row) {
  const text = `${clean(eintrag.request_type)} ${clean(eintrag.absence_type)}`.toLowerCase();
  if (text.includes("krank")) return ARTEN[1];
  if (text.includes("unbezahlt") || text.includes("freistell")) return ARTEN[2];
  if (text.includes("urlaub")) return ARTEN[0];
  return ARTEN[3];
}

/** Werktage eines Zeitraums im Jahr, ohne Wochenende und Feiertage. */
function werktage(von: string, bis: string, jahr: number, feiertage: Set<string>) {
  const start = von < `${jahr}-01-01` ? `${jahr}-01-01` : von;
  const ende = bis > `${jahr}-12-31` ? `${jahr}-12-31` : bis;
  if (!start || !ende || ende < start) return 0;
  let zahl = 0;
  const lauf = new Date(`${start}T12:00:00`);
  const schluss = new Date(`${ende}T12:00:00`);
  while (lauf <= schluss) {
    const tag = lauf.getDay();
    const text = `${lauf.getFullYear()}-${zweistellig(lauf.getMonth() + 1)}-${zweistellig(lauf.getDate())}`;
    if (tag !== 0 && tag !== 6 && !feiertage.has(text)) zahl += 1;
    lauf.setDate(lauf.getDate() + 1);
  }
  return zahl;
}

const feldClass =
  "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none focus:border-brand-500";

export default function UrlaubsplanerSeite() {
  const [token, setToken] = useState("");
  const [authLaden, setAuthLaden] = useState(true);
  const [laden, setLaden] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [setupFehlt, setSetupFehlt] = useState(false);

  const [jahr, setJahr] = useState(() => new Date().getFullYear());
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [abwesenheiten, setAbwesenheiten] = useState<Row[]>([]);
  const [objekte, setObjekte] = useState<Objekt[]>([]);
  const [schliessungen, setSchliessungen] = useState<Row[]>([]);
  const [feiertage, setFeiertage] = useState<Feiertag[]>([]);
  const [kunden, setKunden] = useState<Array<{ name: string }>>([]);
  const [freigestellt, setFreigestellt] = useState<AnyFrei[]>([]);
  const [pushHinweis, setPushHinweis] = useState<string | null>(null);

  // Zwei Klicks ergeben einen Zeitraum: erst der Anfang, dann das Ende.
  const [auswahl, setAuswahl] = useState<{ zeile: string; art: "person" | "objekt"; von: string } | null>(null);

  const [personBlatt, setPersonBlatt] = useState<Row | null>(null);
  const [objektBlatt, setObjektBlatt] = useState<Row | null>(null);

  const holen = useCallback(async (aktuellerToken?: string, aktuellesJahr?: number) => {
    const t = aktuellerToken || token;
    if (!t) return;
    setLaden(true);
    setFehler(null);
    try {
      const antwort = await fetch(`/api/admin/urlaubsplaner?jahr=${aktuellesJahr || jahr}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${t}` }
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Der Planer konnte nicht geladen werden.");
      setSetupFehlt(Boolean(ergebnis.setupFehlt));
      setMitarbeiter(ergebnis.mitarbeiter || []);
      setAbwesenheiten(ergebnis.abwesenheiten || []);
      setObjekte(ergebnis.objekte || []);
      setSchliessungen(ergebnis.schliessungen || []);
      setFeiertage(ergebnis.feiertage || []);
      setKunden(ergebnis.kunden || []);
      setFreigestellt(ergebnis.freigestellt || []);
    } catch (ladeFehler) {
      setFehler(ladeFehler instanceof Error ? ladeFehler.message : "Der Planer konnte nicht geladen werden.");
    } finally {
      setLaden(false);
    }
  }, [jahr, token]);

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

  const feiertagsTage = useMemo(() => new Set(feiertage.map((eintrag) => eintrag.datum)), [feiertage]);
  const feiertagsNamen = useMemo(() => {
    const karte = new Map<string, string>();
    for (const eintrag of feiertage) karte.set(eintrag.datum, eintrag.name);
    return karte;
  }, [feiertage]);

  const monate = useMemo(
    () => MONATE.map((name, index) => ({ name, index, tage: tageImMonat(jahr, index) })),
    [jahr]
  );

  /** Objekte, für die es in diesem Jahr etwas zu zeigen gibt. */
  const objektZeilen = useMemo(() => {
    const ids = new Set(schliessungen.map((eintrag) => clean(eintrag.work_site_id)).filter(Boolean));
    return objekte.filter((objekt) => ids.has(clean(objekt.id)));
  }, [objekte, schliessungen]);

  function balkenFuerPerson(name: string) {
    return abwesenheiten.filter((eintrag) => clean(eintrag.employee_name) === name);
  }

  function balkenFuerObjekt(id: string) {
    return schliessungen.filter((eintrag) => clean(eintrag.work_site_id) === id);
  }

  function tagAngeklickt(zeile: string, art: "person" | "objekt", datum: string) {
    setMeldung(null);
    if (!auswahl || auswahl.zeile !== zeile) {
      setAuswahl({ zeile, art, von: datum });
      return;
    }
    const von = auswahl.von <= datum ? auswahl.von : datum;
    const bis = auswahl.von <= datum ? datum : auswahl.von;
    setAuswahl(null);
    if (art === "person") {
      setPersonBlatt({ employee_name: zeile, request_type: "urlaub", start_date: von, end_date: bis, reason: "", auto_approve: true, pay: "voll" });
    } else {
      setObjektBlatt({ work_site_id: zeile, von, bis, grund: "Betriebsferien", faellt_aus: true, notiz: "" });
    }
  }

  async function personSpeichern() {
    if (!personBlatt) return;
    setSpeichert(true);
    setFehler(null);
    try {
      const antwort = await fetch("/api/mobile/admin/vacation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          employee_name: personBlatt.employee_name,
          request_type: personBlatt.request_type,
          start_date: personBlatt.start_date,
          end_date: personBlatt.end_date || personBlatt.start_date,
          reason: personBlatt.reason,
          status: personBlatt.auto_approve ? "approved" : "open",
          pay: personBlatt.pay
        })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Konnte nicht angelegt werden.");
      setPersonBlatt(null);
      const uebergabe = ergebnis.uebergabe;
      setMeldung(
        uebergabe?.anzahl
          ? `Abwesenheit eingetragen. ${uebergabe.anzahl === 1 ? "Ein Einsatz steht" : `${uebergabe.anzahl} Einsätze stehen`} jetzt auf dir.`
          : "Abwesenheit eingetragen."
      );
      // Ging der Push nicht raus, steht hier warum — statt still zu scheitern.
      setPushHinweis(uebergabe?.hinweis || null);
      await holen();
    } catch (speicherFehler) {
      setFehler(speicherFehler instanceof Error ? speicherFehler.message : "Konnte nicht angelegt werden.");
    } finally {
      setSpeichert(false);
    }
  }

  async function objektSpeichern() {
    if (!objektBlatt) return;
    setSpeichert(true);
    setFehler(null);
    try {
      const antwort = await fetch("/api/admin/urlaubsplaner", {
        method: objektBlatt.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(objektBlatt)
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Konnte nicht gespeichert werden.");
      setObjektBlatt(null);
      setMeldung(
        Number(ergebnis.anzahl) > 1
          ? `Kundenurlaub für ${ergebnis.anzahl} Objekte eingetragen: ${(ergebnis.objekte || []).join(", ")}.`
          : "Kundenurlaub eingetragen."
      );
      await holen();
    } catch (speicherFehler) {
      setFehler(speicherFehler instanceof Error ? speicherFehler.message : "Konnte nicht gespeichert werden.");
    } finally {
      setSpeichert(false);
    }
  }

  async function objektLoeschen(id: string) {
    if (!window.confirm("Diesen Kundenurlaub löschen?")) return;
    setSpeichert(true);
    try {
      await fetch(`/api/admin/urlaubsplaner?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setObjektBlatt(null);
      await holen();
    } finally {
      setSpeichert(false);
    }
  }

  /** Eine Jahreszeile: alle Tage als schmale Zellen, Balken darüber. */
  function Jahreszeile({
    zeile,
    art,
    eintraege,
    farbeVon,
    beschriftung,
    onBalken
  }: {
    zeile: string;
    art: "person" | "objekt";
    eintraege: Row[];
    farbeVon: (eintrag: Row) => string;
    beschriftung: (eintrag: Row) => string;
    onBalken?: (eintrag: Row) => void;
  }) {
    const belegt = new Map<string, Row>();
    for (const eintrag of eintraege) {
      const von = clean(eintrag.start_date || eintrag.von).slice(0, 10);
      const bis = clean(eintrag.end_date || eintrag.bis || eintrag.start_date || eintrag.von).slice(0, 10);
      if (!von) continue;
      const lauf = new Date(`${von}T12:00:00`);
      const schluss = new Date(`${bis}T12:00:00`);
      while (lauf <= schluss) {
        belegt.set(`${lauf.getFullYear()}-${zweistellig(lauf.getMonth() + 1)}-${zweistellig(lauf.getDate())}`, eintrag);
        lauf.setDate(lauf.getDate() + 1);
      }
    }

    return (
      <div className="flex">
        {monate.map((monat) => (
          /*
            Kein Rand am Monatsblock: ohne feste Breite käme er zur Breite dazu,
            im Kopf liegt er dagegen innerhalb der gesetzten Breite. Das hat die
            Spalten um ein Pixel je Monat auseinanderlaufen lassen. Der
            Monatstrenner sitzt deshalb auf der ersten Zelle, dort liegt er
            innen und kostet keine Breite.
          */
          <div key={monat.index} className="flex">
            {Array.from({ length: monat.tage }, (_, index) => {
              const datum = isoVon(jahr, monat.index, index + 1);
              const tag = wochentag(datum);
              const wochenende = tag === 0 || tag === 6;
              const feiertag = feiertagsTage.has(datum);
              const eintrag = belegt.get(datum);
              const istAnfang = auswahl?.zeile === zeile && auswahl.von === datum;
              const titel = eintrag
                ? `${datumText(datum)} · ${beschriftung(eintrag)}`
                : `${datumText(datum)}${feiertag ? ` · ${feiertagsNamen.get(datum)}` : ""}`;
              return (
                <button
                  key={datum}
                  type="button"
                  title={titel}
                  onClick={() => (eintrag && onBalken ? onBalken(eintrag) : tagAngeklickt(zeile, art, datum))}
                  style={{ width: ZELLE }}
                  className={cx(
                    "h-6 border-r border-white/70 last:border-r-0",
                    // Monatstrenner, innen gezeichnet: kostet keine Breite.
                    index === 0 && monat.index > 0 && "border-l-2 border-l-paper-400",
                    eintrag ? farbeVon(eintrag) : feiertag ? "bg-brand-100" : wochenende ? "bg-paper-200" : "bg-paper-100 hover:bg-brand-100",
                    istAnfang && "ring-2 ring-inset ring-ink-900"
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  const breite = monate.reduce((summe, monat) => summe + monat.tage * ZELLE, 0);

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
      <div className="mx-auto min-h-[100dvh] max-w-[520px] px-4 py-5 md:mx-0 md:max-w-none md:px-6 xl:px-8" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Abwesenheiten</p>
            <h1 className="text-3xl font-bold">Urlaubsplaner</h1>
            <p className="mt-1 text-[14px] text-ink-500">Das ganze Jahr. Oben das Team, unten die Kunden mit Betriebsferien.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-paper-300 bg-white">
              <button type="button" onClick={() => { const neu = jahr - 1; setJahr(neu); holen(undefined, neu); }} className="px-3 py-2.5 text-ink-600" aria-label="Jahr zurück">
                <UiIcon name="chevronLeft" className="h-4 w-4" />
              </button>
              <span className="px-3 text-[15px] font-semibold">{jahr}</span>
              <button type="button" onClick={() => { const neu = jahr + 1; setJahr(neu); holen(undefined, neu); }} className="px-3 py-2.5 text-ink-600" aria-label="Jahr vor">
                <UiIcon name="chevronRight" className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setObjektBlatt({ work_site_id: "", von: "", bis: "", grund: "Betriebsferien", faellt_aus: true, notiz: "" })}
              className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700"
            >
              Kundenurlaub
            </button>
          </div>
        </div>

        {setupFehlt ? (
          <div className="mt-4 rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">
            Die Tabelle für Kundenurlaub fehlt noch. Führe <code className="font-mono">supabase/kundenurlaub.sql</code> im Supabase-Editor aus.
          </div>
        ) : null}
        {fehler ? <div className="mt-4 rounded-xl bg-danger-100 px-4 py-3 text-[14px] text-danger-700">{fehler}</div> : null}
        {meldung ? <div className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{meldung}</div> : null}
        {pushHinweis ? <div className="mt-2 rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800">{pushHinweis}</div> : null}

        <p className="mt-4 text-[13px] text-ink-400">
          {auswahl
            ? "Jetzt auf den letzten Tag in derselben Zeile tippen."
            : "Auf einen Tag tippen setzt den Anfang, der zweite Klick in derselben Zeile das Ende. Ein Klick auf einen Balken öffnet ihn."}
        </p>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
          <div style={{ minWidth: breite + 260 }}>
            {/* Monatsköpfe */}
            <div className="flex border-b border-paper-200 bg-paper-50">
              <div className="sticky left-0 z-10 w-[180px] shrink-0 bg-paper-50 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                {jahr}
              </div>
              <div className="flex">
                {monate.map((monat) => (
                  <div
                    key={monat.index}
                    style={{ width: monat.tage * ZELLE }}
                    className={cx(
                      "overflow-hidden px-1 py-2 text-[11px] font-semibold text-ink-500",
                      // Derselbe Trenner wie in den Zeilen, ebenfalls innen.
                      monat.index > 0 && "border-l-2 border-l-paper-400"
                    )}
                  >
                    {monat.name.slice(0, 3)}
                  </div>
                ))}
              </div>
              <div className="w-[80px] shrink-0 px-3 py-2 text-right text-[11px] font-semibold uppercase text-ink-400">Rest</div>
            </div>

            {/* Team */}
            {mitarbeiter.map((person) => {
              const eintraege = balkenFuerPerson(person.name);
              const genommen = eintraege
                .filter((eintrag) => artVon(eintrag).code === "urlaub" && clean(eintrag.status).toLowerCase() !== "rejected")
                .reduce((summe, eintrag) => summe + werktage(clean(eintrag.start_date).slice(0, 10), clean(eintrag.end_date || eintrag.start_date).slice(0, 10), jahr, feiertagsTage), 0);
              const rest = person.anspruch - genommen;
              return (
                <div key={person.id} className="flex items-center border-b border-paper-100 last:border-0">
                  <div className="sticky left-0 z-10 w-[180px] shrink-0 bg-white px-3 py-1.5">
                    <span className="block truncate text-[14px] font-medium text-ink-900">{person.name}</span>
                    <span className="block text-[11px] text-ink-400">{genommen} von {person.anspruch} Tagen</span>
                  </div>
                  <Jahreszeile
                    zeile={person.name}
                    art="person"
                    eintraege={eintraege}
                    farbeVon={(eintrag) => cx(artVon(eintrag).farbe, clean(eintrag.status).toLowerCase() === "open" && "opacity-50")}
                    beschriftung={(eintrag) => `${artVon(eintrag).label}${clean(eintrag.status).toLowerCase() === "open" ? " (offen)" : ""}`}
                  />
                  <div className={cx("w-[80px] shrink-0 px-3 text-right text-[14px] font-semibold", rest < 0 ? "text-danger-600" : "text-ink-700")}>
                    {person.anspruch ? rest : "–"}
                  </div>
                </div>
              );
            })}

            {/* Kunden */}
            <div className="flex border-y border-paper-200 bg-paper-50">
              <div className="sticky left-0 z-10 w-[180px] shrink-0 bg-paper-50 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                Kunden
              </div>
              <div style={{ width: breite }} />
              <div className="w-[80px] shrink-0" />
            </div>

            {objektZeilen.length === 0 ? (
              <div className="px-3 py-6 text-[14px] text-ink-400">
                Noch kein Kundenurlaub eingetragen. Oben rechts über „Kundenurlaub" anlegen — zum Beispiel Betriebsferien oder Werksurlaub.
              </div>
            ) : (
              objektZeilen.map((objekt) => (
                <div key={objekt.id} className="flex items-center border-b border-paper-100 last:border-0">
                  <div className="sticky left-0 z-10 w-[180px] shrink-0 bg-white px-3 py-1.5">
                    <span className="block truncate text-[14px] font-medium text-ink-900">{objekt.name}</span>
                    {objekt.customer_name ? <span className="block truncate text-[11px] text-ink-400">{objekt.customer_name}</span> : null}
                  </div>
                  <Jahreszeile
                    zeile={objekt.id}
                    art="objekt"
                    eintraege={balkenFuerObjekt(objekt.id)}
                    farbeVon={(eintrag) => (eintrag.faellt_aus === false ? "bg-brand-300" : "bg-success-600")}
                    beschriftung={(eintrag) => `${clean(eintrag.grund) || "Geschlossen"}${eintrag.faellt_aus === false ? " (Hinweis)" : ""}`}
                    onBalken={(eintrag) => setObjektBlatt({ ...eintrag, von: clean(eintrag.von).slice(0, 10), bis: clean(eintrag.bis).slice(0, 10) })}
                  />
                  <div className="w-[80px] shrink-0" />
                </div>
              ))
            )}
          </div>
        </div>

        {/*
          Wer wird frei. Das ist der eigentliche Zweck des Kundenurlaubs:
          nicht zu wissen, dass zu ist, sondern wen man an dem Tag wegschicken
          kann, ohne dass ein Kunde es merkt.
        */}
        {freigestellt.length ? (
          <div className="mt-6 rounded-2xl border border-paper-200 bg-white p-5">
            <p className="text-[15px] font-semibold">Wer durch Kundenurlaub frei wird</p>
            <p className="mt-0.5 text-[13px] text-ink-400">
              Tage, an denen Einsätze ausfallen, weil beim Kunden zu ist. „Ganz frei" heißt: an dem Tag steht sonst nichts mehr an.
            </p>
            <div className="mt-4 space-y-3">
              {freigestellt.map((tag) => (
                <div key={tag.datum} className="rounded-xl border border-paper-200 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold text-ink-900">{datumText(tag.datum)}</span>
                    <span className="text-[12px] text-ink-400">
                      {tag.objekte.map((objekt) => `${objekt.name} (${objekt.grund})`).join(" · ")}
                    </span>
                  </div>
                  {tag.personen.length ? (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {tag.personen.map((person) => (
                        <div key={person.name} className="flex items-center justify-between gap-3 rounded-lg bg-paper-100 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium text-ink-800">{person.name}</span>
                            <span className="block text-[12px] text-ink-400">
                              {(person.entfallen / 60).toFixed(1).replace(".", ",")} Std. fallen weg
                            </span>
                          </span>
                          <span
                            className={cx(
                              "shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold",
                              person.bleibt > 0 ? "bg-amber-100 text-amber-800" : "bg-success-100 text-success-700"
                            )}
                          >
                            {person.bleibt > 0 ? `noch ${(person.bleibt / 60).toFixed(1).replace(".", ",")} Std.` : "ganz frei"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-ink-400">An dem Tag war dort niemand eingeteilt.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Legende */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-500">
          {ARTEN.map((art) => (
            <span key={art.code} className="flex items-center gap-1.5">
              <span className={cx("h-3 w-3 rounded-sm", art.farbe)} />
              {art.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-success-600" />Kunde geschlossen</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-brand-100" />Feiertag</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-paper-200" />Wochenende</span>
          <span className="text-ink-400">Blasse Balken sind noch nicht genehmigt.</span>
        </div>

        <p className="mt-3 text-[13px] text-ink-400">
          Die Resttage rechnen Werktage ohne Wochenende und ohne die eingetragenen Feiertage.{" "}
          <Link href="/mitarbeiter/admin/abwesenheiten" className="font-semibold text-brand-700">Zur Abwesenheitsliste</Link>
        </p>
      </div>

      {/* Abwesenheit einer Person */}
      {personBlatt ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-6" onClick={() => setPersonBlatt(null)}>
          <div className="max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-bold">{clean(personBlatt.employee_name)}</h3>
                <p className="mt-0.5 text-[13px] text-ink-400">
                  {datumText(clean(personBlatt.start_date))} bis {datumText(clean(personBlatt.end_date))} ·{" "}
                  {werktage(clean(personBlatt.start_date), clean(personBlatt.end_date), jahr, feiertagsTage)} Werktage
                </p>
              </div>
              <button type="button" onClick={() => setPersonBlatt(null)} className="text-ink-400"><UiIcon name="close" className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="block text-[13px] text-ink-500">Art</span>
                <select value={clean(personBlatt.request_type)} onChange={(e) => setPersonBlatt({ ...personBlatt, request_type: e.target.value })} className={`${feldClass} mt-1.5`}>
                  {ARTEN.map((art) => <option key={art.code} value={art.code}>{art.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[13px] text-ink-500">Von</span>
                  <input type="date" value={clean(personBlatt.start_date)} onChange={(e) => setPersonBlatt({ ...personBlatt, start_date: e.target.value })} className={`${feldClass} mt-1.5`} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-ink-500">Bis</span>
                  <input type="date" value={clean(personBlatt.end_date)} onChange={(e) => setPersonBlatt({ ...personBlatt, end_date: e.target.value })} className={`${feldClass} mt-1.5`} />
                </label>
              </div>
              <label className="block">
                <span className="block text-[13px] text-ink-500">Bemerkung</span>
                <input value={clean(personBlatt.reason)} onChange={(e) => setPersonBlatt({ ...personBlatt, reason: e.target.value })} className={`${feldClass} mt-1.5`} />
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={personBlatt.auto_approve !== false} onChange={(e) => setPersonBlatt({ ...personBlatt, auto_approve: e.target.checked })} className="mt-1 h-4 w-4" />
                <span>
                  <span className="block text-[15px] text-ink-800">Gleich genehmigen</span>
                  <span className="mt-0.5 block text-[13px] text-ink-400">Die Stunden werden nach dem Wochentagsmuster gutgeschrieben.</span>
                </span>
              </label>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button type="button" disabled={speichert} onClick={personSpeichern} className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40">
                {speichert ? "Wird gespeichert …" : "Eintragen"}
              </button>
              <button type="button" onClick={() => setPersonBlatt(null)} className="rounded-xl border border-paper-300 px-4 py-3 text-[15px] font-semibold text-ink-700">Abbrechen</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Kundenurlaub */}
      {objektBlatt ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-6" onClick={() => setObjektBlatt(null)}>
          <div className="max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[18px] font-bold">{objektBlatt.id ? "Kundenurlaub ändern" : "Kundenurlaub eintragen"}</h3>
              <button type="button" onClick={() => setObjektBlatt(null)} className="text-ink-400"><UiIcon name="close" className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 space-y-4">
              {/*
                Kunde oder einzelnes Objekt. Macht der Kunde Betriebsferien,
                macht er an allen seinen Objekten zu — MG hat Nobel und Carl,
                die Kirchengemeinde St. Martin und den Kindergarten. Das
                einzeln einzutragen vergisst man beim zweiten.
              */}
              <label className="block">
                <span className="block text-[13px] text-ink-500">Wer macht zu</span>
                <select
                  value={clean(objektBlatt.customer_name) ? `k:${clean(objektBlatt.customer_name)}` : clean(objektBlatt.work_site_id) ? `o:${clean(objektBlatt.work_site_id)}` : ""}
                  onChange={(e) => {
                    const wert = e.target.value;
                    if (wert.startsWith("k:")) setObjektBlatt({ ...objektBlatt, customer_name: wert.slice(2), work_site_id: "" });
                    else setObjektBlatt({ ...objektBlatt, customer_name: "", work_site_id: wert.slice(2) });
                  }}
                  className={`${feldClass} mt-1.5`}
                  disabled={Boolean(objektBlatt.id)}
                >
                  <option value="">Bitte wählen</option>
                  <optgroup label="Ganzer Kunde, alle Objekte">
                    {kunden.map((kunde) => <option key={kunde.name} value={`k:${kunde.name}`}>{kunde.name}</option>)}
                  </optgroup>
                  <optgroup label="Einzelnes Objekt">
                    {objekte.map((objekt) => (
                      <option key={objekt.id} value={`o:${objekt.id}`}>{objekt.name}{objekt.customer_name ? ` · ${objekt.customer_name}` : ""}</option>
                    ))}
                  </optgroup>
                </select>
                {objektBlatt.id ? <span className="mt-1 block text-[12px] text-ink-400">Beim Ändern bleibt das Objekt, wie es ist.</span> : null}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[13px] text-ink-500">Von</span>
                  <input type="date" value={clean(objektBlatt.von)} onChange={(e) => setObjektBlatt({ ...objektBlatt, von: e.target.value })} className={`${feldClass} mt-1.5`} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-ink-500">Bis</span>
                  <input type="date" value={clean(objektBlatt.bis)} onChange={(e) => setObjektBlatt({ ...objektBlatt, bis: e.target.value })} className={`${feldClass} mt-1.5`} />
                </label>
              </div>
              <label className="block">
                <span className="block text-[13px] text-ink-500">Grund</span>
                <input value={clean(objektBlatt.grund)} onChange={(e) => setObjektBlatt({ ...objektBlatt, grund: e.target.value })} placeholder="z. B. Betriebsferien" className={`${feldClass} mt-1.5`} />
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={objektBlatt.faellt_aus !== false} onChange={(e) => setObjektBlatt({ ...objektBlatt, faellt_aus: e.target.checked })} className="mt-1 h-4 w-4" />
                <span>
                  <span className="block text-[15px] text-ink-800">In dieser Zeit wird dort nicht gereinigt</span>
                  <span className="mt-0.5 block text-[13px] text-ink-400">Aus heißt: nur ein Hinweis, der Einsatz bleibt stehen.</span>
                </span>
              </label>
              <label className="block">
                <span className="block text-[13px] text-ink-500">Notiz</span>
                <input value={clean(objektBlatt.notiz)} onChange={(e) => setObjektBlatt({ ...objektBlatt, notiz: e.target.value })} className={`${feldClass} mt-1.5`} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" disabled={speichert} onClick={objektSpeichern} className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40">
                {speichert ? "Wird gespeichert …" : "Speichern"}
              </button>
              <button type="button" onClick={() => setObjektBlatt(null)} className="rounded-xl border border-paper-300 px-4 py-3 text-[15px] font-semibold text-ink-700">Abbrechen</button>
              {objektBlatt.id ? (
                <button type="button" disabled={speichert} onClick={() => objektLoeschen(String(objektBlatt.id))} className="ml-auto rounded-xl border border-danger-500/40 px-4 py-3 text-[15px] font-semibold text-danger-600">
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
