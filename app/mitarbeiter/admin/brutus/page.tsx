"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Brutus: Zugang für die App auf dem Handy.
 *
 * Die Anmeldung im Browser läuft nach kurzer Zeit ab. Für eine App auf dem
 * Handy ist das unbrauchbar — sie soll einmal eingerichtet werden und dann
 * monatelang laufen. Hier wird dafür ein langlebiger Schlüssel ausgestellt.
 *
 * Der Schlüssel wird **genau einmal** angezeigt. Danach steht in der Datenbank
 * nur seine Prüfsumme, und die lässt sich nicht zurückrechnen. Wer ihn
 * verliert, stellt einen neuen aus und schaltet den alten ab — das ist
 * sicherer, als ihn irgendwo nachschlagen zu können.
 *
 * Nicht zu verwechseln mit "Geräte" (Inventar) oder "Schlüssel" (die zu den
 * Objekten). Hier geht es nur um die Brutus-App.
 */

type Schluessel = {
  id: string;
  bezeichnung: string;
  besitzer: string | null;
  erstellt_am: string;
  zuletzt_am: string | null;
  aktiv: boolean;
};

function datumText(wert: string | null) {
  if (!wert) return "noch nie";
  const datum = new Date(wert);
  if (Number.isNaN(datum.getTime())) return "unbekannt";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

export default function BrutusSeite() {
  const [token, setToken] = useState("");
  const [laden, setLaden] = useState(true);
  const [liste, setListe] = useState<Schluessel[]>([]);
  const [setupFehlt, setSetupFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("Handy Matteo");
  const [frisch, setFrisch] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  const holen = useCallback(async (t: string) => {
    setLaden(true);
    setFehler(null);
    try {
      const antwort = await fetch("/api/admin/brutus-schluessel", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${t}` }
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Konnte nicht geladen werden.");
      setSetupFehlt(Boolean(ergebnis.setupFehlt));
      setListe(ergebnis.schluessel || []);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Konnte nicht geladen werden.");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    async function start() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const sitzung = data.session?.access_token || "";
      setToken(sitzung);
      if (sitzung) await holen(sitzung);
      else setLaden(false);
    }
    start();
  }, [holen]);

  async function anlegen() {
    setFehler(null);
    setFrisch(null);
    setKopiert(false);
    try {
      const antwort = await fetch("/api/admin/brutus-schluessel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bezeichnung })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Konnte nicht angelegt werden.");
      setFrisch(ergebnis.schluessel);
      await holen(token);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Konnte nicht angelegt werden.");
    }
  }

  async function abschalten(id: string, name: string) {
    if (!window.confirm(`Schlüssel „${name}" abschalten? Das Handy kommt danach nicht mehr herein.`)) return;
    setFehler(null);
    try {
      const antwort = await fetch("/api/admin/brutus-schluessel", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Konnte nicht abgeschaltet werden.");
      await holen(token);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Konnte nicht abgeschaltet werden.");
    }
  }

  async function kopieren() {
    if (!frisch) return;
    try {
      await navigator.clipboard.writeText(frisch);
      setKopiert(true);
    } catch {
      setKopiert(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Brutus</h1>
      <p className="mt-1 text-[15px] text-ink-500">
        Zugang für die Brutus-App auf dem Handy. Ein Schlüssel je Gerät, jederzeit einzeln
        abschaltbar.
      </p>

      {setupFehlt ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-[14px] text-amber-900">
          Die Tabelle fehlt noch. Bitte einmal <code>supabase/geraete_schluessel.sql</code> in
          Supabase ausführen.
        </p>
      ) : null}

      {fehler ? (
        <p className="mt-4 rounded-xl bg-danger-100 p-3 text-[14px] text-danger-700">{fehler}</p>
      ) : null}

      <div className="mt-6 rounded-2xl border border-paper-200 bg-white p-4">
        <label className="block">
          <span className="block text-[13px] text-ink-500">Wofür ist der Schlüssel?</span>
          <input
            className="mt-1.5 w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] outline-none focus:border-brand-500"
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
            placeholder="Handy Matteo"
          />
        </label>
        <button
          type="button"
          className="mt-3 w-full rounded-xl bg-brand-500 px-4 py-3 text-[15px] font-medium text-white disabled:opacity-50"
          onClick={anlegen}
          disabled={!token || !bezeichnung.trim()}
        >
          Neuen Schlüssel erzeugen
        </button>
      </div>

      {frisch ? (
        <div className="mt-4 rounded-2xl border-2 border-brand-500 bg-brand-50 p-4">
          <p className="text-[14px] font-semibold">
            Jetzt ins Handy eintragen. Dieser Schlüssel wird nie wieder angezeigt.
          </p>
          <code className="mt-2 block break-all rounded-xl bg-white p-3 text-[14px]">{frisch}</code>
          <button
            type="button"
            className="mt-3 rounded-xl border border-brand-500 px-4 py-2 text-[14px] font-medium"
            onClick={kopieren}
          >
            {kopiert ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      ) : null}

      <h2 className="mt-8 text-[17px] font-semibold">Ausgestellte Schlüssel</h2>

      {laden ? <p className="mt-2 text-[14px] text-ink-400">Lädt …</p> : null}
      {!laden && !liste.length ? (
        <p className="mt-2 text-[14px] text-ink-400">Noch keiner ausgestellt.</p>
      ) : null}

      <ul className="mt-2 space-y-2">
        {liste.map((eintrag) => (
          <li
            key={eintrag.id}
            className="flex items-center justify-between rounded-xl border border-paper-200 bg-white p-3"
          >
            <div>
              <p className={eintrag.aktiv ? "font-medium" : "font-medium text-ink-300 line-through"}>
                {eintrag.bezeichnung}
              </p>
              <p className="text-[12px] text-ink-400">
                seit {datumText(eintrag.erstellt_am)} · zuletzt benutzt: {datumText(eintrag.zuletzt_am)}
              </p>
            </div>
            {eintrag.aktiv ? (
              <button
                type="button"
                className="rounded-xl border border-danger-500 px-3 py-1.5 text-[13px] text-danger-700"
                onClick={() => abschalten(eintrag.id, eintrag.bezeichnung)}
              >
                Abschalten
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
