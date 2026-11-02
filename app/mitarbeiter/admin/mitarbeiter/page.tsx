"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";
import EinrichtungBlock from "../EinrichtungBlock";

/**
 * Mitarbeiterbereich.
 *
 * Liste mit Reitern und Suche, ein Klick öffnet die Akte als Blatt über der
 * Liste. In der Akte oben die Bereiche, links die Abschnitte der Stammdaten.
 *
 * Die Reiter Einsatzplan, Lohnzeit, Abwesenheiten und Objektkontrollen lesen
 * nur — geändert wird an der Stelle, wo die Daten entstehen. Sonst hat man
 * zwei Orte für dieselbe Sache und irgendwann zwei Wahrheiten.
 */

type Row = Record<string, any>;

type Daten = {
  employees: Row[];
  tasks: Row[];
  timeEntries: Row[];
  absences: Row[];
  qualityReports: Row[];
  sites: Row[];
  assignments: Row[];
};

const WOCHENTAGE = [
  { feld: "hours_monday", label: "Montag" },
  { feld: "hours_tuesday", label: "Dienstag" },
  { feld: "hours_wednesday", label: "Mittwoch" },
  { feld: "hours_thursday", label: "Donnerstag" },
  { feld: "hours_friday", label: "Freitag" },
  { feld: "hours_saturday", label: "Samstag" },
  { feld: "hours_sunday", label: "Sonntag" }
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function zahlText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(".", ",");
}

function initialen(name: string) {
  const teile = name.split(" ").filter(Boolean);
  return ((teile[0]?.[0] || "") + (teile[teile.length - 1]?.[0] || "")).toUpperCase() || "?";
}

function datumText(value?: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return "–";
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

function kurzDatum(value?: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return "–";
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(datum);
}

/** "vor 2 Stunden", "vor 3 Tagen" oder ein Strich. */
function seitWann(value?: unknown) {
  const text = clean(value);
  if (!text) return null;
  const zeit = new Date(text).getTime();
  if (Number.isNaN(zeit)) return null;
  const minuten = Math.max(0, Math.round((Date.now() - zeit) / 60000));
  if (minuten < 60) return `vor ${minuten} Min.`;
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return `vor ${stunden} ${stunden === 1 ? "Stunde" : "Stunden"}`;
  const tage = Math.round(stunden / 24);
  if (tage < 31) return `vor ${tage} ${tage === 1 ? "Tag" : "Tagen"}`;
  return datumText(text);
}

function stunden(minuten: number) {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

function planMinuten(task: Row) {
  const direkt = Number(task.planned_minutes ?? task.max_minutes ?? 0);
  if (Number.isFinite(direkt) && direkt > 0) return Math.round(direkt);
  const von = clean(task.start_time).slice(0, 5);
  const bis = clean(task.end_time).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(von) || !/^\d{2}:\d{2}$/.test(bis)) return 0;
  const a = Number(von.slice(0, 2)) * 60 + Number(von.slice(3, 5));
  const b = Number(bis.slice(0, 2)) * 60 + Number(bis.slice(3, 5));
  return b >= a ? b - a : 1440 - a + b;
}

const feldClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";
const labelClass = "block text-[13px] text-ink-500";

function Feld({ label, hinweis, children }: { label: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <div className="mt-1.5">{children}</div>
      {hinweis ? <span className="mt-1 block text-[12px] text-ink-400">{hinweis}</span> : null}
    </label>
  );
}

function Abschnitt({ titel, text, children }: { titel: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-paper-200 py-6 first:pt-0 last:border-0">
      <h3 className="text-[16px] font-bold text-ink-900">{titel}</h3>
      {text ? <p className="mt-0.5 text-[13px] text-ink-400">{text}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Leer({ text }: { text: string }) {
  return (
    <div className="grid place-items-center py-16 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
        <UiIcon name="close" className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[16px] font-semibold text-ink-900">Noch keine Daten hinterlegt</p>
      <p className="mt-1 text-[13px] text-ink-400">{text}</p>
    </div>
  );
}

const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * Entgeltabrechnungen je Mitarbeiter: ansehen und von Hand hochladen.
 *
 * Normalerweise legt der Lohn-Wächter sie ab, sobald die Mail vom Lohnbüro
 * kommt. Das hier ist der Weg für einen älteren Monat oder eine Korrektur.
 * Hochgeladen wird genau auf diesen Mitarbeiter — deshalb steht sein Name
 * im Knopf, damit niemand im falschen Blatt landet.
 */
function LohnDokumente({ mitarbeiterId, mitarbeiterName, token }: { mitarbeiterId: string; mitarbeiterName: string; token: string }) {
  const heute = new Date();
  const [dokumente, setDokumente] = useState<Row[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [jahr, setJahr] = useState(String(heute.getFullYear()));
  const [monat, setMonat] = useState(String(heute.getMonth() + 1));
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");

  const laden = useCallback(async () => {
    if (!mitarbeiterId || !token) return;
    setLaedt(true);
    try {
      const antwort = await fetch(`/api/admin/lohn-dokumente?mitarbeiter=${encodeURIComponent(mitarbeiterId)}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const ergebnis = await antwort.json();
      setDokumente(ergebnis.ok ? ergebnis.dokumente || [] : []);
      if (ergebnis.ok && ergebnis.eingerichtet === false) {
        setFehler("Die Ablage ist noch nicht eingerichtet: supabase/lohndokumente.sql ausführen.");
      }
    } catch {
      setFehler("Die Abrechnungen konnten nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, [mitarbeiterId, token]);

  useEffect(() => { laden(); }, [laden]);

  async function hochladen(datei: File) {
    setArbeitet(true);
    setFehler("");
    setMeldung("");
    try {
      const puffer = await datei.arrayBuffer();
      // In Haeppchen umwandeln: String.fromCharCode mit einer ganzen PDF auf
      // einmal sprengt den Aufrufstapel.
      const bytes = new Uint8Array(puffer);
      let roh = "";
      for (let i = 0; i < bytes.length; i += 8192) roh += String.fromCharCode(...bytes.subarray(i, i + 8192));

      const antwort = await fetch("/api/admin/lohn-dokumente", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          employee_profile_id: mitarbeiterId,
          jahr: Number(jahr),
          monat: Number(monat),
          dateiname: datei.name,
          inhalt: btoa(roh)
        })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Hochladen fehlgeschlagen.");
      setMeldung(`${MONATSNAMEN[Number(monat) - 1]} ${jahr} liegt jetzt bei ${mitarbeiterName}. Er sieht sie in der App unter „Deine Abrechnungen".`);
      await laden();
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : "Hochladen fehlgeschlagen.");
    } finally {
      setArbeitet(false);
    }
  }

  async function entfernen(dokument: Row) {
    const monatsname = MONATSNAMEN[Math.max(0, Math.min(11, Number(dokument.monat) - 1))];
    if (!window.confirm(`${monatsname} ${dokument.jahr} entfernen?\n\n${mitarbeiterName} sieht sie dann nicht mehr in der App. Die Datei in der Personalakte bleibt unberührt.`)) return;
    setArbeitet(true);
    setFehler("");
    setMeldung("");
    try {
      const antwort = await fetch(`/api/admin/lohn-dokumente?id=${encodeURIComponent(clean(dokument.id))}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Entfernen fehlgeschlagen.");
      setMeldung(`${monatsname} ${dokument.jahr} ist entfernt.`);
      await laden();
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : "Entfernen fehlgeschlagen.");
    } finally {
      setArbeitet(false);
    }
  }

  async function oeffnen(id: string) {
    setFehler("");
    try {
      const antwort = await fetch("/api/admin/lohn-dokumente", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Konnte nicht geöffnet werden.");
      const link = document.createElement("a");
      link.href = ergebnis.adresse;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : "Konnte nicht geöffnet werden.");
    }
  }

  return (
    <div>
      <p className="text-[15px] font-semibold text-ink-900">Entgeltabrechnungen</p>
      <p className="mt-0.5 text-[13px] text-ink-400">
        Was hier liegt, sieht {mitarbeiterName || "der Mitarbeiter"} in der App unter „Deine Abrechnungen". Der Lohn-Wächter
        legt sie jeden Monat von selbst ab — hier geht ein älterer Monat oder eine Korrektur von Hand.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-paper-200 bg-paper-100/60 p-4">
        <Feld label="Monat">
          <select value={monat} onChange={(e) => setMonat(e.target.value)} className={feldClass}>
            {MONATSNAMEN.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
        </Feld>
        <Feld label="Jahr">
          <input inputMode="numeric" value={jahr} onChange={(e) => setJahr(e.target.value)} className={feldClass} />
        </Feld>
        <label className={cx("cursor-pointer rounded-xl bg-brand-600 px-5 py-3 text-[14px] font-semibold text-white", arbeitet && "opacity-50")}>
          {arbeitet ? "Lädt hoch …" : "PDF auswählen"}
          <input
            type="file"
            accept="application/pdf"
            disabled={arbeitet}
            className="hidden"
            onChange={(e) => { const datei = e.target.files?.[0]; e.target.value = ""; if (datei) hochladen(datei); }}
          />
        </label>
      </div>

      {meldung ? <p className="mt-3 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{meldung}</p> : null}
      {fehler ? <p className="mt-3 rounded-xl bg-danger-50 px-4 py-3 text-[14px] text-danger-700">{fehler}</p> : null}

      {laedt ? (
        <p className="mt-5 text-[14px] text-ink-400">Lade …</p>
      ) : dokumente.length ? (
        <ul className="mt-5 divide-y divide-paper-200">
          {/* Die ganze Zeile ist der Knopf. Vorher war "Ansehen" nur Text
              daneben — man tippt darauf, und nichts passiert. */}
          {dokumente.map((dokument) => (
            <li key={clean(dokument.id)} className="flex items-center gap-2">
              <button
                onClick={() => oeffnen(clean(dokument.id))}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-left hover:bg-paper-100"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink-900">
                    {MONATSNAMEN[Math.max(0, Math.min(11, Number(dokument.monat) - 1))]} {dokument.jahr}
                  </span>
                  <span className="block text-[12px] text-ink-400">
                    hochgeladen von {clean(dokument.hochgeladen_von) || "Büro"} am {datumText(dokument.hochgeladen_at)}
                    {dokument.gesehen_at ? ` · geöffnet am ${datumText(dokument.gesehen_at)}` : " · noch nicht geöffnet"}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-brand-700">Ansehen</span>
              </button>
              <button
                onClick={() => entfernen(dokument)}
                disabled={arbeitet}
                title="Diese Abrechnung entfernen"
                className="shrink-0 rounded-lg px-2 py-2 text-[13px] font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-40"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[14px] text-ink-400">Noch keine Abrechnung hinterlegt.</p>
      )}
    </div>
  );
}

export default function MitarbeiterSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [daten, setDaten] = useState<Daten | null>(null);

  const [reiter, setReiter] = useState<"alle" | "aktiv" | "passiv">("alle");
  const [suche, setSuche] = useState("");
  const [offenId, setOffenId] = useState<string | null>(null);
  const [bereich, setBereich] = useState("informationen");
  const [abschnitt, setAbschnitt] = useState("allgemein");
  const [form, setForm] = useState<Row>({});
  // Das kleine Formular zum Anlegen. null heißt zu.
  const [neu, setNeu] = useState<Row | null>(null);

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/mitarbeiter", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Mitarbeiter konnten nicht geladen werden.");
      setDaten(ergebnis);
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Mitarbeiter konnten nicht geladen werden.");
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

  /**
   * Von "Login vergeben" kommt man mit ?neu=1 hierher. Dann geht das Formular
   * von allein auf — sonst landet man auf einer Liste und sucht den Knopf.
   */
  const [neuGeprueft, setNeuGeprueft] = useState(false);
  useEffect(() => {
    if (neuGeprueft || authLoading) return;
    setNeuGeprueft(true);
    if (new URLSearchParams(window.location.search).get("neu")) neuOeffnen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, neuGeprueft]);

  const alle = daten?.employees || [];

  const gefiltert = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    return alle.filter((person) => {
      const aktiv = person.active !== false;
      if (reiter === "aktiv" && !aktiv) return false;
      if (reiter === "passiv" && aktiv) return false;
      if (!needle) return true;
      return `${clean(person.name)} ${clean(person.email)} ${clean(person.employee_number)} ${clean(person.city)}`.toLowerCase().includes(needle);
    });
  }, [alle, reiter, suche]);

  const offen = useMemo(() => alle.find((person) => person.id === offenId) || null, [alle, offenId]);

  function oeffnen(person: Row) {
    setOffenId(person.id);
    setBereich("informationen");
    setAbschnitt("allgemein");
    setMessage(null);
    setError(null);
    const teile = clean(person.name).split(" ").filter(Boolean);
    setForm({
      ...person,
      first_name: clean(person.first_name) || teile[0] || "",
      last_name: clean(person.last_name) || teile.slice(1).join(" ") || "",
      country: clean(person.country) || "DE Deutschland"
    });
  }

  /**
   * Neuen Mitarbeiter anlegen.
   *
   * Bewusst ein kleines Formular statt der ganzen Akte: Beim Anlegen weiß man
   * den Namen und wann es losgeht, selten schon die Bankverbindung. Der Rest
   * wird danach in der Akte nachgetragen, die sich gleich öffnet.
   */
  function neuOeffnen() {
    setNeu({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      employment_type: "Minijob",
      hourly_rate: "15",
      weekly_hours: "",
      contract_start: "",
      annual_vacation_days: "30",
      active: true,
      role: "employee"
    });
    setError(null);
    setMessage(null);
  }

  async function neuAnlegen() {
    if (!neu) return;
    if (!clean(neu.first_name) || !clean(neu.last_name)) {
      setError("Bitte Vor- und Nachnamen eintragen.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/mitarbeiter", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(neu)
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Anlegen fehlgeschlagen.");
      setNeu(null);
      setMessage(`${clean(neu.first_name)} ${clean(neu.last_name)} angelegt. Den Login vergibst du unter „Login vergeben".`);
      await load();
      // Direkt die Akte aufmachen, damit der Rest gleich nachgetragen wird.
      if (ergebnis.item?.id) oeffnen(ergebnis.item);
    } catch (anlegeFehler) {
      setError(anlegeFehler instanceof Error ? anlegeFehler.message : "Anlegen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  function bewegen(richtung: -1 | 1) {
    if (!offenId) return;
    const index = gefiltert.findIndex((person) => person.id === offenId);
    const naechste = gefiltert[index + richtung];
    if (naechste) oeffnen(naechste);
  }

  async function speichern() {
    if (!offen) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const antwort = await fetch("/api/admin/mitarbeiter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, id: offen.id })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");
      if (ergebnis.hinweis) setError(ergebnis.hinweis);
      else setMessage("Gespeichert.");
      await load();
    } catch (speicherFehler) {
      setError(speicherFehler instanceof Error ? speicherFehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  /* --------------------------------------------------- Daten je Reiter */

  const eigeneEinsaetze = useMemo(
    () => (daten?.tasks || [])
      .filter((task) => clean(task.employee_name) === clean(offen?.name))
      .sort((a, b) => clean(b.task_date).localeCompare(clean(a.task_date))),
    [daten?.tasks, offen?.name]
  );

  const eigeneZeiten = useMemo(
    () => (daten?.timeEntries || []).filter((eintrag) => clean(eintrag.employee_name) === clean(offen?.name)),
    [daten?.timeEntries, offen?.name]
  );

  const eigeneAbwesenheiten = useMemo(
    () => (daten?.absences || []).filter((eintrag) => clean(eintrag.employee_name) === clean(offen?.name)),
    [daten?.absences, offen?.name]
  );

  /**
   * Urlaubsstand: Anspruch, genommen, offen.
   *
   * Gezählt werden Werktage ohne Wochenende und ohne Feiertage — ein
   * Feiertag im Urlaub kostet keinen Urlaubstag. Nur Urlaub zählt,
   * Krankheit und unbezahlte Freistellung nicht, und nur das laufende Jahr.
   */
  const urlaubsstand = useMemo(() => {
    const jahr = new Date().getFullYear();
    const feiertage = new Set<string>((daten as any)?.feiertage || []);

    const tageZaehlen = (von: string, bis: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(von)) return 0;
      const ende = /^\d{4}-\d{2}-\d{2}$/.test(bis) ? bis : von;
      let zahl = 0;
      const lauf = new Date(`${von}T12:00:00`);
      const schluss = new Date(`${ende}T12:00:00`);
      while (lauf <= schluss) {
        const tag = lauf.toISOString().slice(0, 10);
        const wochentag = lauf.getDay();
        if (tag.startsWith(String(jahr)) && wochentag !== 0 && wochentag !== 6 && !feiertage.has(tag)) zahl += 1;
        lauf.setDate(lauf.getDate() + 1);
        if (zahl > 400) break;
      }
      return zahl;
    };

    const istUrlaub = (eintrag: Row) =>
      clean(eintrag.request_type || eintrag.absence_type).toLowerCase().includes("urlaub");

    // Der Altbestand aus der Excel-Zeit, aber nur wenn er zum laufenden Jahr
    // gehört. Sonst stünde im Januar bei jedem der Vorjahresverbrauch.
    const vorherJahr = Number(offen?.urlaub_genommen_jahr || 0);
    const vorher = vorherJahr === jahr ? Number(offen?.urlaub_bereits_genommen || 0) : 0;

    let genommen = vorher;
    let beantragt = 0;
    for (const eintrag of eigeneAbwesenheiten) {
      if (!istUrlaub(eintrag)) continue;
      const tage = tageZaehlen(clean(eintrag.start_date).slice(0, 10), clean(eintrag.end_date || eintrag.start_date).slice(0, 10));
      if (!tage) continue;
      const status = clean(eintrag.status).toLowerCase();
      if (status === "approved") genommen += tage;
      else if (status !== "rejected" && status !== "abgelehnt") beantragt += tage;
    }

    const anspruch = Number(offen?.annual_vacation_days || offen?.vacation_days || 0);
    return { jahr, anspruch, genommen, beantragt, vorher, offen: anspruch - genommen };
  }, [eigeneAbwesenheiten, offen, daten]);

  const eigeneKontrollen = useMemo(
    () => (daten?.qualityReports || []).filter((eintrag) => clean(eintrag.employee_name) === clean(offen?.name)),
    [daten?.qualityReports, offen?.name]
  );

  const eigeneObjekte = useMemo(
    () => (daten?.assignments || []).filter((eintrag) => clean(eintrag.employee_name) === clean(offen?.name) && eintrag.active !== false),
    [daten?.assignments, offen?.name]
  );

  if (authLoading) {
    return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Lade Anmeldung…</main>;
  }
  if (!token) {
    return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</main>;
  }

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="px-4 py-5 md:px-6 xl:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
              <UiIcon name="users" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Mitarbeiter</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load()} disabled={loading} className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">
              {loading ? "Lade…" : "Aktualisieren"}
            </button>
            <button
              onClick={() => neuOeffnen()}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white"
            >
              <UiIcon name="plus" className="h-4 w-4" />
              Neuer Mitarbeiter
            </button>
          </div>
        </header>

        <div className="mt-4 flex gap-6 border-b border-paper-200">
          {([["alle", "Alle"], ["aktiv", "Aktiv"], ["passiv", "Passiv"]] as const).map(([wert, label]) => (
            <button
              key={wert}
              onClick={() => setReiter(wert)}
              className={cx("relative -mb-px pb-3 text-[15px]", reiter === wert ? "font-semibold text-brand-700" : "text-ink-400")}
            >
              {label}
              {reiter === wert ? <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-brand-600" /> : null}
            </button>
          ))}
        </div>

        <div className="mt-4 max-w-[360px]">
          <div className="flex items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
            <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
            <input value={suche} onChange={(event) => setSuche(event.target.value)} placeholder="Suchen" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
          </div>
        </div>

        {error && !offen ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}

        {/*
          Der Einrichtungsstand gehört hierher, nicht aufs Dashboard: Es ist
          eine Frage über die Mannschaft, und die Antwort steht direkt über der
          Liste, in der man sie ändert.
        */}
        <div className="mt-5">
          <EinrichtungBlock token={token} />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-paper-200 bg-white">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Nummer</th>
                <th className="px-4 py-3">Adresse</th>
                <th className="px-4 py-3">Gruppe</th>
                <th className="px-4 py-3">Zuletzt aktiv</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((person) => {
                const aktiv = person.active !== false;
                const zuletzt = seitWann(person.last_active);
                return (
                  <tr key={person.id} onClick={() => oeffnen(person)} className="cursor-pointer border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {clean(person.avatar_url) ? (
                          <img src={clean(person.avatar_url)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-[13px] font-bold text-white">
                            {initialen(clean(person.name))}
                          </span>
                        )}
                        <span className="text-[15px] font-semibold text-ink-900">{clean(person.name)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[14px] text-ink-600">{clean(person.employee_number) || "–"}</td>
                    <td className="px-4 py-3 text-[14px] text-ink-600">
                      {clean(person.street) ? (
                        <>
                          <span className="block text-[12px] text-ink-400">{clean(person.street)}</span>
                          <span>{[clean(person.postal_code), clean(person.city)].filter(Boolean).join(" ") || "–"}</span>
                        </>
                      ) : "–"}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-ink-600">{clean(person.employee_group) || "–"}</td>
                    <td className="px-4 py-3">
                      {zuletzt ? <span className="rounded-md bg-success-100 px-2 py-1 text-[12px] font-semibold text-success-700">{zuletzt}</span> : <span className="text-[14px] text-ink-400">–</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cx("rounded-md px-2.5 py-1 text-[12px] font-bold", aktiv ? "bg-success-500 text-white" : "bg-paper-300 text-ink-600")}>
                        {aktiv ? "Aktiv" : "Passiv"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!gefiltert.length && !loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[14px] text-ink-400">Kein Mitarbeiter gefunden.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {offen ? (
        <div className="fixed inset-0 z-50 flex bg-ink-900/30" onClick={() => setOffenId(null)}>
          <div className="ml-auto flex h-full w-full max-w-[1180px] flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            {/* Kopf der Akte */}
            <div className="flex items-center gap-3 border-b border-paper-200 px-5 py-4">
              {clean(offen.avatar_url) ? (
                <img src={clean(offen.avatar_url)} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-[15px] font-bold text-white">{initialen(clean(offen.name))}</span>
              )}
              <div className="min-w-0">
                <p className="truncate text-[19px] font-bold">{clean(offen.name)}</p>
              </div>
              <span className={cx("shrink-0 rounded-md px-2.5 py-1 text-[12px] font-bold", offen.active !== false ? "bg-success-500 text-white" : "bg-paper-300 text-ink-600")}>
                {offen.active !== false ? "Aktiv" : "Passiv"}
              </span>

              <div className="ml-auto flex items-center gap-2">
                <a href="/mitarbeiter/admin/aktivieren" className="hidden rounded-xl border border-paper-300 px-3 py-2 text-[13px] font-semibold text-ink-700 md:block">
                  Zugangsdaten senden
                </a>
                <button onClick={() => bewegen(-1)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Vorheriger">
                  <UiIcon name="chevronLeft" className="h-4 w-4" />
                </button>
                <button onClick={() => bewegen(1)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Nächster">
                  <UiIcon name="chevronRight" className="h-4 w-4" />
                </button>
                <button onClick={() => setOffenId(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                  <UiIcon name="close" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Bereiche */}
            <div className="flex gap-1 overflow-x-auto border-b border-paper-200 px-4 py-2">
              {([
                ["informationen", "Informationen"],
                ["einsatzplan", "Einsatzplan"],
                ["lohnzeit", "Lohnzeit"],
                ["abwesenheiten", "Abwesenheiten"],
                ["objektkontrollen", "Objektkontrollen"],
                ["objekte", "Objekte"]
              ] as const).map(([wert, label]) => (
                <button
                  key={wert}
                  onClick={() => setBereich(wert)}
                  className={cx(
                    "shrink-0 rounded-lg px-3.5 py-2 text-[14px] transition",
                    bereich === wert ? "bg-brand-600 font-semibold text-white" : "text-ink-600 hover:bg-paper-100"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1">
              {bereich === "informationen" ? (
                <>
                  <nav className="hidden w-[190px] shrink-0 border-r border-paper-200 p-3 md:block">
                    {[["allgemein", "Allgemein"], ["vertrag", "Vertrag"], ["konto", "Account"], ["dokumente", "Dokumente"]].map(([wert, label]) => (
                      <button
                        key={wert}
                        onClick={() => setAbschnitt(wert)}
                        className={cx(
                          "mb-1 block w-full rounded-lg px-3 py-2.5 text-left text-[14px]",
                          abschnitt === wert ? "bg-paper-200 font-semibold text-ink-900" : "text-ink-600 hover:bg-paper-100"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>

                  <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
                    <div className="mx-auto max-w-[840px]">
                      {abschnitt === "allgemein" ? (
                        <>
                          <Abschnitt titel="Persönliche Informationen" text="Die persönlichen Daten des Mitarbeiters.">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="Vorname"><input value={form.first_name || ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={feldClass} /></Feld>
                              <Feld label="Nachname"><input value={form.last_name || ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={feldClass} /></Feld>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="Geschlecht">
                                <select value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={feldClass}>
                                  <option value="">Keine Angabe</option>
                                  <option value="weiblich">Weiblich</option>
                                  <option value="männlich">Männlich</option>
                                  <option value="divers">Divers</option>
                                </select>
                              </Feld>
                              <Feld label="Sprache"><input value={form.language || ""} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="Deutsch" className={feldClass} /></Feld>
                            </div>
                            <Feld label="Geburtsdatum"><input type="date" value={clean(form.birthday).slice(0, 10)} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className={feldClass} /></Feld>
                          </Abschnitt>

                          <Abschnitt titel="Adresse" text="Die Anschrift des Mitarbeiters.">
                            <Feld label="Straße"><input value={form.street || ""} onChange={(e) => setForm({ ...form, street: e.target.value })} className={feldClass} /></Feld>
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="Postleitzahl"><input value={form.postal_code || ""} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className={feldClass} /></Feld>
                              <Feld label="Stadt"><input value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} className={feldClass} /></Feld>
                            </div>
                            <Feld label="Land"><input value={form.country || ""} onChange={(e) => setForm({ ...form, country: e.target.value })} className={feldClass} /></Feld>
                            <Feld label="Adresszusatz"><input value={form.address_addition || ""} onChange={(e) => setForm({ ...form, address_addition: e.target.value })} className={feldClass} /></Feld>
                          </Abschnitt>

                          <Abschnitt titel="Kontakt" text="Über diese Adresse meldet sich der Mitarbeiter in der App an.">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="E-Mail-Adresse"><input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className={feldClass} /></Feld>
                              <Feld label="Telefonnummer"><input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={feldClass} /></Feld>
                            </div>
                          </Abschnitt>
                        </>
                      ) : null}

                      {abschnitt === "vertrag" ? (
                        <>
                          <Abschnitt titel="Anstellung" text="Art der Anstellung und Gruppe.">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="Anstellung">
                                <select value={form.employment_type || ""} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} className={feldClass}>
                                  <option value="">Bitte auswählen</option>
                                  <option value="Minijob">Minijob</option>
                                  <option value="Teilzeit">Teilzeit</option>
                                  <option value="Vollzeit">Vollzeit</option>
                                  <option value="Aushilfe">Aushilfe</option>
                                </select>
                              </Feld>
                              <Feld label="Mitarbeitergruppe"><input value={form.employee_group || ""} onChange={(e) => setForm({ ...form, employee_group: e.target.value })} placeholder="z. B. Unterhaltsreinigung" className={feldClass} /></Feld>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="Vertragsstart"><input type="date" value={clean(form.contract_start).slice(0, 10)} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} className={feldClass} /></Feld>
                              <Feld label="Vertragsende" hinweis="Leer lassen bei unbefristet."><input type="date" value={clean(form.contract_end).slice(0, 10)} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} className={feldClass} /></Feld>
                            </div>
                          </Abschnitt>

                          <Abschnitt titel="Vergütung" text="Lohn und Lohnart.">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="Stundenlohn in Euro"><input inputMode="decimal" value={zahlText(form.hourly_rate)} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} className={feldClass} /></Feld>
                              <Feld label="Lohnart">
                                <select value={form.wage_type || ""} onChange={(e) => setForm({ ...form, wage_type: e.target.value })} className={feldClass}>
                                  <option value="">Bitte auswählen</option>
                                  <option value="Stundenlohn">Stundenlohn</option>
                                  <option value="Monatslohn">Monatslohn</option>
                                </select>
                              </Feld>
                            </div>
                            <Feld label="Monatliche Höchststunden" hinweis="Für die Minijob-Warnung. Leer heißt: keine Grenze.">
                              <input inputMode="decimal" value={zahlText(form.monthly_hour_limit)} onChange={(e) => setForm({ ...form, monthly_hour_limit: e.target.value })} className={feldClass} />
                            </Feld>
                          </Abschnitt>

                          <Abschnitt titel="Wochenstunden" text="Was an einem normalen Wochentag anfällt. Grundlage für die Urlaubsstunden.">
                            <Feld label="Wochenstunden gesamt"><input inputMode="decimal" value={zahlText(form.weekly_hours)} onChange={(e) => setForm({ ...form, weekly_hours: e.target.value })} className={feldClass} /></Feld>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
                              {WOCHENTAGE.map((tag) => (
                                <label key={tag.feld} className="block">
                                  <span className="block text-[12px] text-ink-500">{tag.label}</span>
                                  <input
                                    inputMode="decimal"
                                    value={zahlText(form[tag.feld])}
                                    onChange={(e) => setForm({ ...form, [tag.feld]: e.target.value })}
                                    placeholder="0"
                                    className="mt-1 w-full rounded-xl border border-paper-200 px-3 py-2.5 text-[15px] outline-none focus:border-brand-500"
                                  />
                                </label>
                              ))}
                            </div>
                            <label className="flex cursor-pointer items-center gap-3">
                              <input type="checkbox" checked={form.travel_time_allowed === true} onChange={(e) => setForm({ ...form, travel_time_allowed: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                              <span className="text-[14px] text-ink-600">Fahrzeiterfassung in der App erlauben</span>
                            </label>
                            {/*
                              Normalfall ist die Stempelzeit. Dieser Haken ist
                              die Ausnahme für feste Vereinbarungen — und er
                              kürzt nie: Mehrarbeit wird zusätzlich bezahlt.
                            */}
                            <label className="flex cursor-pointer items-start gap-3">
                              <input type="checkbox" checked={form.inhaber === true} onChange={(e) => setForm({ ...form, inhaber: e.target.checked })} className="mt-0.5 h-5 w-5 accent-brand-600" />
                              <span>
                                <span className="block text-[14px] text-ink-700">Inhaber</span>
                                <span className="mt-0.5 block text-[13px] text-ink-400">
                                  Taucht in Team-Übersichten wie „Einrichtung im Team" nicht auf. Einsätze, Zeiten und Lohn bleiben unberührt.
                                </span>
                              </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-3">
                              <input type="checkbox" checked={form.fixed_paid_time === true} onChange={(e) => setForm({ ...form, fixed_paid_time: e.target.checked })} className="mt-0.5 h-5 w-5 accent-brand-600" />
                              <span>
                                <span className="block text-[14px] text-ink-700">Feste bezahlte Zeit vereinbart</span>
                                <span className="mt-0.5 block text-[13px] text-ink-400">
                                  Bezahlt wird die eingeplante Zeit, auch wenn kürzer gestempelt wurde. Wer länger braucht, bekommt die Mehrarbeit zusätzlich. Ohne Haken zählt die Stempelzeit.
                                </span>
                              </span>
                            </label>
                          </Abschnitt>

                          <Abschnitt titel="Urlaubsanspruch" text="Jährlicher Anspruch, unabhängig vom Startdatum.">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="Urlaubstage im Jahr"><input inputMode="numeric" value={zahlText(form.annual_vacation_days)} onChange={(e) => setForm({ ...form, annual_vacation_days: e.target.value })} className={feldClass} /></Feld>
                              <Feld label="Fortzahlung je Tag in Stunden" hinweis="Leer heißt: aus dem Wochentagsmuster rechnen.">
                                <input inputMode="decimal" value={zahlText(form.absence_pay_per_day)} onChange={(e) => setForm({ ...form, absence_pay_per_day: e.target.value })} className={feldClass} />
                              </Feld>
                            </div>
                            {/*
                              Der Altbestand aus der Excel-Zeit. Das Jahr steht
                              ausdrücklich dabei: ohne das schleppte sich der
                              Wert in den nächsten Januar, und jeder hätte dort
                              schon zwanzig Tage verbraucht.
                            */}
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <Feld label="Bereits genommen" hinweis="Tage, die in diesem Jahr schon genommen sind, ohne Eintrag in der App.">
                                <input inputMode="decimal" value={zahlText(form.urlaub_bereits_genommen)} onChange={(e) => setForm({ ...form, urlaub_bereits_genommen: e.target.value })} className={feldClass} />
                              </Feld>
                              <Feld label="Zu welchem Jahr" hinweis="Stimmt das Jahr nicht mehr, zählt der Wert nicht mit.">
                                <input inputMode="numeric" value={zahlText(form.urlaub_genommen_jahr) || String(new Date().getFullYear())} onChange={(e) => setForm({ ...form, urlaub_genommen_jahr: e.target.value })} className={feldClass} />
                              </Feld>
                            </div>
                          </Abschnitt>
                        </>
                      ) : null}

                      {abschnitt === "konto" ? (
                        <>
                          <Abschnitt titel="Benutzer" text="Nummer, Status und Rechte.">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Feld label="Mitarbeiternummer"><input value={form.employee_number || ""} onChange={(e) => setForm({ ...form, employee_number: e.target.value })} className={feldClass} /></Feld>
                              <Feld label="Status">
                                <select value={form.active === false ? "passiv" : "aktiv"} onChange={(e) => setForm({ ...form, active: e.target.value === "aktiv" })} className={feldClass}>
                                  <option value="aktiv">Aktiv</option>
                                  <option value="passiv">Passiv</option>
                                </select>
                              </Feld>
                            </div>
                            <Feld label="Rechtegruppe" hinweis="Admin sieht den ganzen Adminbereich. Mitarbeiter nur die eigene App.">
                              <select value={clean(form.role) || "employee"} onChange={(e) => setForm({ ...form, role: e.target.value })} className={feldClass}>
                                <option value="employee">Mitarbeiter</option>
                                <option value="objektleiter">Objektleiter</option>
                                <option value="admin">Admin</option>
                              </select>
                            </Feld>
                            <Feld label="Tags"><input value={form.tags || ""} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="mit Komma trennen" className={feldClass} /></Feld>
                            <Feld label="Sonstiges"><textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className={feldClass} /></Feld>
                          </Abschnitt>

                          <Abschnitt titel="Zugang zur App" text="Wird auf der Seite Login vergeben eingerichtet.">
                            <p className="text-[14px] text-ink-600">
                              {clean(offen.auth_user_id) ? "Für diese Person ist ein Zugang eingerichtet." : "Für diese Person gibt es noch keinen Zugang."}
                            </p>
                            <a href="/mitarbeiter/admin/aktivieren" className="inline-block rounded-xl border border-brand-500/40 bg-brand-50 px-4 py-2.5 text-[14px] font-semibold text-brand-700">
                              Zur Zugangsverwaltung
                            </a>
                          </Abschnitt>
                        </>
                      ) : null}

                      {abschnitt === "dokumente" ? (
                        <LohnDokumente
                          mitarbeiterId={clean(offen.id)}
                          mitarbeiterName={clean(offen.name)}
                          token={token}
                        />
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              {bereich === "einsatzplan" ? (
                <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
                  {eigeneEinsaetze.length ? (
                    <table className="w-full min-w-[620px] text-left">
                      <thead>
                        <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                          <th className="py-3">Datum</th><th className="py-3">Zeit</th><th className="py-3">Objekt</th><th className="py-3">Auftrag</th><th className="py-3 text-right">Planzeit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eigeneEinsaetze.slice(0, 200).map((task) => (
                          <tr key={task.id} className="border-b border-paper-200 last:border-0">
                            <td className="py-3 text-[14px] font-semibold">{kurzDatum(task.task_date)}</td>
                            <td className="py-3 text-[14px] text-ink-600">{clean(task.start_time).slice(0, 5) || "–"} – {clean(task.end_time).slice(0, 5) || "–"}</td>
                            <td className="py-3 text-[14px] text-ink-600">{clean(task.site) || clean(task.customer_name) || "–"}</td>
                            <td className="py-3">
                              <span className="rounded-md bg-amber-100 px-2 py-1 text-[12px] font-medium text-amber-800">{clean(task.title) || clean(task.task_type) || "Einsatz"}</span>
                            </td>
                            <td className="py-3 text-right text-[14px] font-semibold">{stunden(planMinuten(task))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <Leer text="Sobald Einsätze auf diese Person laufen, stehen sie hier." />}
                </div>
              ) : null}

              {bereich === "lohnzeit" ? (
                <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
                  {eigeneZeiten.length ? (
                    <table className="w-full min-w-[620px] text-left">
                      <thead>
                        <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                          <th className="py-3">Zeitpunkt</th><th className="py-3">Vorgang</th><th className="py-3">Objekt</th><th className="py-3">Freigabe</th><th className="py-3 text-right">Erfasst</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eigeneZeiten.slice(0, 200).map((eintrag) => (
                          <tr key={eintrag.id} className="border-b border-paper-200 last:border-0">
                            <td className="py-3 text-[14px] font-semibold">
                              {new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(eintrag.created_at))}
                            </td>
                            <td className="py-3 text-[14px] text-ink-600">
                              {({ clock_in: "Eingestempelt", clock_out: "Ausgestempelt", break_start: "Pause gestartet", break_end: "Pause beendet" } as Row)[clean(eintrag.action)] || clean(eintrag.action)}
                            </td>
                            <td className="py-3 text-[14px] text-ink-600">{clean(eintrag.work_site_name) || "–"}</td>
                            <td className="py-3 text-[13px] text-ink-500">{clean(eintrag.approval_status) || "–"}</td>
                            <td className="py-3 text-right text-[14px] font-semibold">{eintrag.actual_minutes ? stunden(Number(eintrag.actual_minutes)) : "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <Leer text="Sobald gestempelt wird, stehen die Buchungen hier." />}
                  <p className="mt-4 text-[13px] text-ink-400">Freigeben und korrigieren in der <a href="/mitarbeiter/admin/zeiten" className="font-semibold text-brand-700">Zeitenfreigabe</a>.</p>
                </div>
              ) : null}

              {bereich === "abwesenheiten" ? (
                <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
                  {/*
                    Anspruch, genommen, offen — wie in der Urlaubsliste.
                    Vorher standen hier Anträge statt Tage, das beantwortete
                    die eigentliche Frage nicht (Ansage 02.11.2026).
                  */}
                  <div className="mb-4 grid max-w-[560px] grid-cols-4 gap-3 rounded-2xl border border-paper-200 p-4">
                    <div><p className="text-[22px] font-bold">{urlaubsstand.anspruch}</p><p className="text-[12px] text-ink-400">Anspruch {urlaubsstand.jahr}</p></div>
                    <div><p className="text-[22px] font-bold">{urlaubsstand.genommen}</p><p className="text-[12px] text-ink-400">genommen</p></div>
                    <div>
                      <p className={cx("text-[22px] font-bold", urlaubsstand.offen < 0 ? "text-danger-600" : "text-success-700")}>{urlaubsstand.offen}</p>
                      <p className="text-[12px] text-ink-400">offen</p>
                    </div>
                    <div><p className="text-[22px] font-bold text-amber-700">{urlaubsstand.beantragt}</p><p className="text-[12px] text-ink-400">beantragt</p></div>
                  </div>
                  <p className="mb-4 text-[12px] text-ink-400">
                    Gezählt werden Werktage ohne Wochenende und ohne Feiertage, nur Urlaub und nur im laufenden Jahr.
                    {urlaubsstand.vorher > 0
                      ? ` Darin ${urlaubsstand.vorher} Tage aus „Bereits genommen“, die vor Schichtklar liegen.`
                      : " Was vor Schichtklar genommen wurde, trägst du beim Mitarbeiter unter Vertrag als „Bereits genommen“ ein."}
                  </p>
                  {eigeneAbwesenheiten.length ? (
                    <table className="w-full min-w-[620px] text-left">
                      <thead>
                        <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                          <th className="py-3">Typ</th><th className="py-3">Zeitraum</th><th className="py-3">Status</th><th className="py-3 text-right">Gutgeschrieben</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eigeneAbwesenheiten.map((eintrag) => (
                          <tr key={eintrag.id} className="border-b border-paper-200 last:border-0">
                            <td className="py-3 text-[14px] font-semibold">{clean(eintrag.request_type || eintrag.absence_type) || "Abwesenheit"}</td>
                            <td className="py-3 text-[14px] text-ink-600">{datumText(eintrag.start_date)} – {datumText(eintrag.end_date || eintrag.start_date)}</td>
                            <td className="py-3 text-[13px] text-ink-500">{clean(eintrag.status) || "offen"}</td>
                            <td className="py-3 text-right text-[14px] font-semibold">{eintrag.credited_minutes ? `${stunden(Number(eintrag.credited_minutes))} h` : "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <Leer text="Sobald Urlaub oder Krankmeldungen erfasst sind, stehen sie hier." />}
                  <p className="mt-4 text-[13px] text-ink-400">Genehmigen und Stunden setzen unter <a href="/mitarbeiter/admin/urlaub" className="font-semibold text-brand-700">Abwesenheiten</a>.</p>
                </div>
              ) : null}

              {bereich === "objektkontrollen" ? (
                <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
                  {eigeneKontrollen.length ? (
                    <table className="w-full min-w-[520px] text-left">
                      <thead>
                        <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                          <th className="py-3">Datum</th><th className="py-3">Objekt</th><th className="py-3">Bewertung</th><th className="py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eigeneKontrollen.map((eintrag) => (
                          <tr key={eintrag.id} className="border-b border-paper-200 last:border-0">
                            <td className="py-3 text-[14px] font-semibold">{datumText(eintrag.created_at)}</td>
                            <td className="py-3 text-[14px] text-ink-600">{clean(eintrag.site) || "–"}</td>
                            <td className="py-3 text-[14px]">{eintrag.rating ? "★".repeat(Number(eintrag.rating)) : "–"}</td>
                            <td className="py-3 text-[13px] text-ink-500">{clean(eintrag.status) || "offen"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <Leer text="Qualitätsnachweise aus der App erscheinen hier." />}
                </div>
              ) : null}

              {bereich === "objekte" ? (
                <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
                  {eigeneObjekte.length ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      {eigeneObjekte.map((eintrag) => (
                        <div key={`${eintrag.work_site_id}`} className="rounded-xl border border-paper-200 p-3">
                          <p className="text-[15px] font-semibold">{clean(eintrag.site_name) || "Objekt"}</p>
                        </div>
                      ))}
                    </div>
                  ) : <Leer text="Dieser Person sind noch keine Objekte fest zugeordnet." />}
                  <p className="mt-4 text-[13px] text-ink-400">Zuordnen unter <a href="/mitarbeiter/admin/objektzuordnung" className="font-semibold text-brand-700">Objekte je Mitarbeiter</a>.</p>
                </div>
              ) : null}
            </div>

            {/* Fuß: nur wo etwas zu speichern ist */}
            {bereich === "informationen" && abschnitt !== "dokumente" ? (
              <div className="flex items-center gap-3 border-t border-paper-200 px-5 py-3">
                {error ? <p className="min-w-0 flex-1 truncate text-[13px] text-rose-700">{error}</p> : null}
                {message ? <p className="min-w-0 flex-1 truncate text-[13px] text-success-700">{message}</p> : null}
                {!error && !message ? <span className="flex-1" /> : null}
                <button onClick={() => setOffenId(null)} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700">Schließen</button>
                <button onClick={speichern} disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60">
                  {saving ? "Speichere…" : "Speichern"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Neuer Mitarbeiter: nur das Nötige, der Rest kommt in der Akte */}
      {neu ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-6" onClick={() => setNeu(null)}>
          <div className="max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-bold">Neuer Mitarbeiter</h3>
                <p className="mt-0.5 text-[13px] text-ink-400">Alles Weitere trägst du gleich danach in der Akte nach.</p>
              </div>
              <button onClick={() => setNeu(null)} className="text-ink-400" aria-label="Schließen">
                <UiIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Feld label="Vorname"><input value={clean(neu.first_name)} onChange={(e) => setNeu({ ...neu, first_name: e.target.value })} className={feldClass} /></Feld>
              <Feld label="Nachname"><input value={clean(neu.last_name)} onChange={(e) => setNeu({ ...neu, last_name: e.target.value })} className={feldClass} /></Feld>
              <Feld label="E-Mail" hinweis="Braucht es später für den Login."><input type="email" value={clean(neu.email)} onChange={(e) => setNeu({ ...neu, email: e.target.value })} className={feldClass} /></Feld>
              <Feld label="Telefon"><input value={clean(neu.phone)} onChange={(e) => setNeu({ ...neu, phone: e.target.value })} className={feldClass} /></Feld>
              <Feld label="Beschäftigung">
                <select value={clean(neu.employment_type)} onChange={(e) => setNeu({ ...neu, employment_type: e.target.value })} className={feldClass}>
                  {["Minijob", "Teilzeit", "Vollzeit", "Aushilfe"].map((art) => <option key={art} value={art}>{art}</option>)}
                </select>
              </Feld>
              <Feld label="Stundenlohn" hinweis="Lohngruppe 1 liegt 2026 bei 15,00 €.">
                <input inputMode="decimal" value={clean(neu.hourly_rate)} onChange={(e) => setNeu({ ...neu, hourly_rate: e.target.value })} className={feldClass} />
              </Feld>
              <Feld label="Eintritt"><input type="date" value={clean(neu.contract_start)} onChange={(e) => setNeu({ ...neu, contract_start: e.target.value })} className={feldClass} /></Feld>
              <Feld label="Urlaubstage im Jahr" hinweis="30 bei Fünf-Tage-Woche, sonst anteilig.">
                <input inputMode="numeric" value={clean(neu.annual_vacation_days)} onChange={(e) => setNeu({ ...neu, annual_vacation_days: e.target.value })} className={feldClass} />
              </Feld>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button onClick={neuAnlegen} disabled={saving} className="rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-50">
                {saving ? "Lege an…" : "Anlegen"}
              </button>
              <button onClick={() => setNeu(null)} className="rounded-xl border border-paper-300 px-4 py-3 text-[15px] font-semibold text-ink-700">Abbrechen</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
