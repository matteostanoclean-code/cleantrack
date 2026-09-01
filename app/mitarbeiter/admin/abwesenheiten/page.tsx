"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Abwesenheiten als Zeitleiste.
 *
 * Eine Zeile je Mitarbeiter, eine Spalte je Tag, die Abwesenheit als Balken
 * darüber. Der Sinn ist nicht die Liste — den einzelnen Antrag sieht man auch
 * anders. Der Sinn ist zu sehen, wer gleichzeitig weg ist, bevor man zwei
 * Leuten dieselbe Woche genehmigt.
 *
 * Genehmigen und die Stunden setzen bleiben in der Urlaubsliste. Hier wird
 * geplant, dort entschieden.
 */

type Row = Record<string, any>;

const ARTEN = [
  { code: "urlaub", label: "Urlaub", farbe: "bg-amber-500", punkt: "bg-amber-500" },
  { code: "krankheit", label: "Krankheit", farbe: "bg-danger-500", punkt: "bg-danger-500" },
  { code: "unbezahlt", label: "Unbezahlte Freistellung", farbe: "bg-ink-400", punkt: "bg-ink-400" },
  { code: "sonstiges", label: "Sonstiges", farbe: "bg-brand-600", punkt: "bg-brand-600" }
];

const FORTZAHLUNG = [
  { code: "voll", label: "Volle Fortzahlung", hinweis: "Stunden werden nach dem Wochentagsmuster gutgeschrieben." },
  { code: "keine", label: "Keine Fortzahlung", hinweis: "Es werden keine Stunden gutgeschrieben." }
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function iso(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function parseIso(text: string) {
  return new Date(`${text}T12:00:00`);
}

function addDays(datum: Date, tage: number) {
  const naechster = new Date(datum);
  naechster.setDate(naechster.getDate() + tage);
  return naechster;
}

function montagVon(text: string) {
  const datum = parseIso(text);
  const tag = datum.getDay();
  return iso(addDays(datum, tag === 0 ? -6 : 1 - tag));
}

/** Kalenderwoche nach ISO, also die mit dem ersten Donnerstag. */
function kalenderwoche(text: string) {
  const datum = parseIso(text);
  const ziel = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const wochentag = ziel.getUTCDay() || 7;
  ziel.setUTCDate(ziel.getUTCDate() + 4 - wochentag);
  const jahresanfang = new Date(Date.UTC(ziel.getUTCFullYear(), 0, 1));
  return Math.ceil(((ziel.getTime() - jahresanfang.getTime()) / 86400000 + 1) / 7);
}

function datumText(value?: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return "–";
  const datum = parseIso(text);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

function artVon(eintrag: Row) {
  const text = clean(eintrag.request_type || eintrag.absence_type).toLowerCase();
  if (text.includes("krank")) return ARTEN[1];
  if (text.includes("unbezahlt") || text.includes("freistellung")) return ARTEN[2];
  if (text.includes("urlaub")) return ARTEN[0];
  return ARTEN[3];
}

function stundenText(minuten: number) {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

const feldClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

function Feld({ label, pflicht, hinweis, children }: { label: string; pflicht?: boolean; hinweis?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-ink-500">{label}{pflicht ? <span className="text-danger-500"> *</span> : null}</span>
      <div className="mt-1.5">{children}</div>
      {hinweis ? <span className="mt-1 block text-[12px] text-ink-400">{hinweis}</span> : null}
    </label>
  );
}

export default function AbwesenheitenSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Row[]>([]);
  const [absences, setAbsences] = useState<Row[]>([]);

  const heute = iso(new Date());
  const [start, setStart] = useState(() => montagVon(iso(new Date())));
  const [wochen, setWochen] = useState(4);
  const [suche, setSuche] = useState("");
  const [artFilter, setArtFilter] = useState("");
  const [ansicht, setAnsicht] = useState<"zeitleiste" | "liste">("zeitleiste");

  const [neuOffen, setNeuOffen] = useState(false);
  const [form, setForm] = useState<Row>({
    employee_name: "",
    request_type: "",
    start_date: heute,
    end_date: heute,
    pay: "voll",
    reason: "",
    auto_approve: true
  });

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/mobile/admin/dashboard", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Abwesenheiten konnten nicht geladen werden.");
      setEmployees((ergebnis.employees || []).filter((row: Row) => clean(row.name) && row.active !== false));
      setAbsences(ergebnis.absences || []);
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Abwesenheiten konnten nicht geladen werden.");
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

  const tage = useMemo(() => {
    const liste: string[] = [];
    const anfang = parseIso(start);
    for (let i = 0; i < wochen * 7; i += 1) liste.push(iso(addDays(anfang, i)));
    return liste;
  }, [start, wochen]);

  const ende = tage[tage.length - 1] || start;

  /** Kalenderwochen mit ihrer Spaltenzahl, für die Kopfzeile. */
  const wochenKoepfe = useMemo(() => {
    const koepfe: Array<{ kw: number; anzahl: number }> = [];
    for (const tag of tage) {
      const kw = kalenderwoche(tag);
      const letzte = koepfe[koepfe.length - 1];
      if (letzte && letzte.kw === kw) letzte.anzahl += 1;
      else koepfe.push({ kw, anzahl: 1 });
    }
    return koepfe;
  }, [tage]);

  const sichtbar = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    return absences.filter((eintrag) => {
      const von = clean(eintrag.start_date).slice(0, 10);
      const bis = clean(eintrag.end_date || eintrag.start_date).slice(0, 10);
      if (!von) return false;
      if (bis < start || von > ende) return false;
      if (artFilter && artVon(eintrag).code !== artFilter) return false;
      if (!needle) return true;
      return `${clean(eintrag.employee_name)} ${clean(eintrag.request_type || eintrag.absence_type)} ${clean(eintrag.reason)}`.toLowerCase().includes(needle);
    });
  }, [absences, start, ende, artFilter, suche]);

  const sichtbareMitarbeiter = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((person) => clean(person.name).toLowerCase().includes(needle));
  }, [employees, suche]);

  /** Balken je Mitarbeiter: wo er anfängt und wie viele Tage er im Fenster liegt. */
  function balkenFuer(name: string) {
    return sichtbar
      .filter((eintrag) => clean(eintrag.employee_name) === name)
      .map((eintrag) => {
        const von = clean(eintrag.start_date).slice(0, 10);
        const bis = clean(eintrag.end_date || eintrag.start_date).slice(0, 10);
        const startIndex = Math.max(0, tage.indexOf(von < start ? start : von));
        const endIndex = tage.indexOf(bis > ende ? ende : bis);
        const breite = Math.max(1, (endIndex < 0 ? tage.length - 1 : endIndex) - startIndex + 1);
        return { eintrag, startIndex, breite, angeschnittenLinks: von < start, angeschnittenRechts: bis > ende };
      })
      .filter((balken) => balken.startIndex >= 0);
  }

  async function anlegen(weitere = false) {
    if (!clean(form.employee_name)) { setError("Bitte einen Mitarbeiter wählen."); return; }
    if (!clean(form.request_type)) { setError("Bitte eine Abwesenheitsart wählen."); return; }
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/mobile/admin/vacation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          employee_name: form.employee_name,
          request_type: form.request_type,
          start_date: form.start_date,
          end_date: form.end_date || form.start_date,
          reason: form.reason,
          // Ohne Fortzahlung wird nichts gutgeschrieben, deshalb gar nicht erst
          // genehmigt rechnen lassen.
          status: form.auto_approve ? "approved" : "open",
          pay: form.pay
        })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Abwesenheit konnte nicht angelegt werden.");

      const gutschrift = ergebnis.gutschrift;
      setMessage(gutschrift && gutschrift.minuten > 0
        ? `Angelegt. ${gutschrift.tage} Tage mit ${stundenText(gutschrift.minuten)} Std. gutgeschrieben.`
        : "Abwesenheit angelegt.");

      if (weitere) setForm({ ...form, reason: "" });
      else setNeuOffen(false);
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Abwesenheit konnte nicht angelegt werden.");
    } finally {
      setSaving(false);
    }
  }

  const abwesenheitstage = useMemo(() => {
    const von = parseIso(clean(form.start_date));
    const bis = parseIso(clean(form.end_date || form.start_date));
    if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime()) || bis < von) return 0;
    return Math.round((bis.getTime() - von.getTime()) / 86400000) + 1;
  }, [form.start_date, form.end_date]);

  if (authLoading) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Lade Anmeldung…</main>;
  if (!token) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</main>;

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="px-4 py-5 md:px-6 xl:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
              <UiIcon name="plane" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Abwesenheiten</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-xl border border-paper-300">
              <button onClick={() => setAnsicht("zeitleiste")} className={cx("px-3 py-2.5 text-[14px]", ansicht === "zeitleiste" ? "bg-amber-500 font-semibold text-white" : "bg-white text-ink-600")}>Zeitleiste</button>
              <button onClick={() => setAnsicht("liste")} className={cx("px-3 py-2.5 text-[14px]", ansicht === "liste" ? "bg-amber-500 font-semibold text-white" : "bg-white text-ink-600")}>Liste</button>
            </div>
            <a href="/mitarbeiter/admin/urlaub" className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700">Genehmigen</a>
            <button onClick={() => { setNeuOffen(true); setError(null); setMessage(null); }} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white">+ Abwesenheit erstellen</button>
          </div>
        </header>

        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{message}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-paper-300 bg-white">
            <button onClick={() => setStart(iso(addDays(parseIso(start), -7)))} className="px-3 py-2.5 text-ink-600" aria-label="Woche zurück"><UiIcon name="chevronLeft" className="h-4 w-4" /></button>
            <button onClick={() => setStart(montagVon(heute))} className="border-x border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700">Heute</button>
            <button onClick={() => setStart(iso(addDays(parseIso(start), 7)))} className="px-3 py-2.5 text-ink-600" aria-label="Woche vor"><UiIcon name="chevronRight" className="h-4 w-4" /></button>
          </div>
          <span className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] text-ink-700">{datumText(start)} → {datumText(ende)}</span>
          <select value={wochen} onChange={(e) => setWochen(Number(e.target.value))} className="rounded-xl border border-paper-300 bg-white px-3 py-2.5 text-[14px] text-ink-700 outline-none">
            <option value={2}>2 Wochen</option>
            <option value={4}>4 Wochen</option>
            <option value={8}>8 Wochen</option>
            <option value={13}>Ein Quartal</option>
          </select>
          <select value={artFilter} onChange={(e) => setArtFilter(e.target.value)} className="rounded-xl border border-paper-300 bg-white px-3 py-2.5 text-[14px] text-ink-700 outline-none">
            <option value="">Alle Arten</option>
            {ARTEN.map((art) => <option key={art.code} value={art.code}>{art.label}</option>)}
          </select>
          <div className="flex w-full max-w-[260px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
            <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
          </div>
        </div>

        {ansicht === "zeitleiste" ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
            <div style={{ minWidth: `${220 + tage.length * 38}px` }}>
              {/* Kopf: Kalenderwochen, darunter die Tage */}
              <div className="flex border-b border-paper-200">
                <div className="w-[220px] shrink-0 px-4 py-3 text-[13px] font-bold text-ink-600">Mitarbeiter</div>
                <div className="flex-1">
                  <div className="flex">
                    {wochenKoepfe.map((kopf, index) => (
                      <div key={index} style={{ width: `${kopf.anzahl * 38}px` }} className="border-l border-paper-200 py-1.5 text-center text-[12px] font-semibold text-brand-600">
                        KW {kopf.kw}
                      </div>
                    ))}
                  </div>
                  <div className="flex">
                    {tage.map((tag) => {
                      const datum = parseIso(tag);
                      const wochenende = datum.getDay() === 0 || datum.getDay() === 6;
                      return (
                        <div key={tag} style={{ width: "38px" }} className={cx("border-l border-t border-paper-200 py-1 text-center", wochenende && "bg-paper-100", tag === heute && "bg-brand-50")}>
                          <div className="text-[10px] text-ink-400">{new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(datum).replace(".", "")}</div>
                          <div className={cx("text-[12px] font-semibold", tag === heute ? "text-brand-700" : "text-ink-700")}>{tag.slice(8, 10)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Eine Zeile je Mitarbeiter */}
              {sichtbareMitarbeiter.map((person) => {
                const name = clean(person.name);
                const balken = balkenFuer(name);
                return (
                  <div key={person.id} className="flex border-b border-paper-200 last:border-0">
                    <div className="flex w-[220px] shrink-0 items-center gap-2.5 px-4 py-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                        {name.split(" ").filter(Boolean).map((teil) => teil[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <span className="truncate text-[14px] font-medium">{name}</span>
                    </div>
                    <div className="relative flex-1">
                      <div className="flex h-full">
                        {tage.map((tag) => {
                          const datum = parseIso(tag);
                          const wochenende = datum.getDay() === 0 || datum.getDay() === 6;
                          return <div key={tag} style={{ width: "38px" }} className={cx("min-h-[52px] border-l border-paper-200", wochenende && "bg-paper-100/70", tag === heute && "bg-brand-50/60")} />;
                        })}
                      </div>
                      {balken.map((balkenEintrag, index) => {
                        const art = artVon(balkenEintrag.eintrag);
                        const offen = !["approved", "genehmigt"].includes(clean(balkenEintrag.eintrag.status).toLowerCase());
                        return (
                          <button
                            key={`${balkenEintrag.eintrag.id}-${index}`}
                            title={`${art.label}: ${datumText(balkenEintrag.eintrag.start_date)} bis ${datumText(balkenEintrag.eintrag.end_date || balkenEintrag.eintrag.start_date)}`}
                            onClick={() => { window.location.href = "/mitarbeiter/admin/urlaub"; }}
                            style={{ left: `${balkenEintrag.startIndex * 38 + 2}px`, width: `${balkenEintrag.breite * 38 - 4}px` }}
                            className={cx(
                              "absolute top-2 h-9 overflow-hidden rounded-md px-2 text-left text-white",
                              art.farbe,
                              offen && "opacity-60 ring-2 ring-dashed ring-white/70"
                            )}
                          >
                            <span className="block truncate text-[11px] font-semibold leading-tight">{art.label}{offen ? " · offen" : ""}</span>
                            <span className="block truncate text-[10px] leading-tight opacity-90">
                              {datumText(balkenEintrag.eintrag.start_date)} → {datumText(balkenEintrag.eintrag.end_date || balkenEintrag.eintrag.start_date)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {!sichtbareMitarbeiter.length ? <p className="px-4 py-10 text-center text-[14px] text-ink-400">Kein Mitarbeiter gefunden.</p> : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3">Mitarbeiter</th><th className="px-3 py-3">Art</th><th className="px-3 py-3">Zeitraum</th><th className="px-3 py-3">Tage</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Gutgeschrieben</th>
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((eintrag) => {
                  const art = artVon(eintrag);
                  const genehmigt = ["approved", "genehmigt"].includes(clean(eintrag.status).toLowerCase());
                  const von = parseIso(clean(eintrag.start_date));
                  const bis = parseIso(clean(eintrag.end_date || eintrag.start_date));
                  const anzahl = Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime()) ? 0 : Math.round((bis.getTime() - von.getTime()) / 86400000) + 1;
                  return (
                    <tr key={eintrag.id} className="border-b border-paper-200 last:border-0">
                      <td className="px-4 py-3 text-[14px] font-semibold">{clean(eintrag.employee_name)}</td>
                      <td className="px-3 py-3"><span className="flex items-center gap-2 text-[14px]"><span className={cx("h-2.5 w-2.5 rounded-full", art.punkt)} />{art.label}</span></td>
                      <td className="px-3 py-3 text-[14px] text-ink-600">{datumText(eintrag.start_date)} – {datumText(eintrag.end_date || eintrag.start_date)}</td>
                      <td className="px-3 py-3 text-[14px] text-ink-600">{anzahl}</td>
                      <td className="px-3 py-3">
                        <span className={cx("rounded-md px-2 py-1 text-[12px] font-semibold", genehmigt ? "bg-success-100 text-success-700" : "bg-amber-100 text-amber-800")}>
                          {genehmigt ? "Genehmigt" : "Offen"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-[14px] font-semibold">{eintrag.credited_minutes ? `${stundenText(Number(eintrag.credited_minutes))} h` : "–"}</td>
                    </tr>
                  );
                })}
                {!sichtbar.length ? <tr><td colSpan={6} className="px-4 py-12 text-center text-[14px] text-ink-400">Keine Abwesenheit in diesem Zeitraum.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px] text-ink-500">
          {ARTEN.map((art) => (
            <span key={art.code} className="flex items-center gap-2"><span className={cx("h-2.5 w-2.5 rounded-full", art.punkt)} />{art.label}</span>
          ))}
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500 opacity-60 ring-2 ring-dashed ring-ink-300" />gestrichelt = noch nicht genehmigt</span>
        </div>
      </div>

      {neuOffen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setNeuOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <p className="text-[19px] font-bold">Neue Abwesenheit erstellen</p>
              <button onClick={() => setNeuOffen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <Feld label="Mitarbeiter" pflicht>
                <select value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} className={feldClass}>
                  <option value="">Mitarbeiter auswählen</option>
                  {employees.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                </select>
              </Feld>

              <Feld label="Abwesenheitsart" pflicht>
                <select value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value, pay: e.target.value === "unbezahlt" ? "keine" : form.pay })} className={feldClass}>
                  <option value="">Abwesenheitsart auswählen</option>
                  {ARTEN.map((art) => <option key={art.code} value={art.code}>{art.label}</option>)}
                </select>
              </Feld>

              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="Von"><input type="date" value={clean(form.start_date)} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: clean(form.end_date) < e.target.value ? e.target.value : form.end_date })} className={feldClass} /></Feld>
                <Feld label="Bis"><input type="date" value={clean(form.end_date)} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={feldClass} /></Feld>
              </div>

              <div className="rounded-xl bg-paper-100 px-4 py-3 text-[14px] text-ink-600">
                {abwesenheitstage} {abwesenheitstage === 1 ? "Kalendertag" : "Kalendertage"} — wie viele davon Arbeitstage sind, rechnet die App beim Genehmigen aus dem Wochentagsmuster.
              </div>

              <Feld label="Entgeltfortzahlung" pflicht hinweis={FORTZAHLUNG.find((f) => f.code === form.pay)?.hinweis}>
                <select value={form.pay} onChange={(e) => setForm({ ...form, pay: e.target.value })} className={feldClass}>
                  {FORTZAHLUNG.map((eintrag) => <option key={eintrag.code} value={eintrag.code}>{eintrag.label}</option>)}
                </select>
              </Feld>

              <Feld label="Kommentar">
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} className={feldClass} />
              </Feld>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-paper-200 px-5 py-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.auto_approve !== false} onChange={(e) => setForm({ ...form, auto_approve: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                <span className="text-[14px] text-ink-600">Automatisch freigeben</span>
              </label>
              <span className="flex-1" />
              <button onClick={() => anlegen(true)} disabled={saving} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">Weitere erstellen</button>
              <button onClick={() => anlegen(false)} disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60">
                {saving ? "Speichere…" : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
