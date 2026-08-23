"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

const inputClass =
  "w-full rounded-xl border border-paper-200 bg-white px-4 py-3.5 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

function aktuellerMonat() {
  return new Date().toISOString().slice(0, 7);
}

function letzterMonat() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function monatText(monat: string) {
  if (!/^\d{4}-\d{2}$/.test(monat)) return monat;
  const [j, m] = monat.split("-").map(Number);
  return new Date(j, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export default function LohnexportSeite() {
  const [token, setToken] = useState("");
  const [laedt, setLaedt] = useState(true);
  const [monat, setMonat] = useState(letzterMonat());
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    async function start() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      setToken(data.session?.access_token || "");
      setLaedt(false);
    }
    start();
  }, []);

  async function herunterladen() {
    setArbeitet(true);
    setMeldung("");
    setFehler("");
    try {
      const antwort = await fetch(`/api/admin/lohnexport?month=${monat}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
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

  if (laedt) {
    return <div className="p-6 text-ink-500">Lädt…</div>;
  }

  if (!token) {
    return (
      <div className="p-6">
        <p className="text-ink-700">Bitte zuerst anmelden.</p>
        <Link href="/mitarbeiter" className="mt-3 inline-block text-brand-600 underline">
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl p-5 pb-24">
      <Link href="/mitarbeiter?tab=admin" className="text-sm text-ink-500 underline">
        Zurück
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-ink-900">Lohnexport</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-600">
        Erzeugt die Arbeitszeittabelle für die Lohnbuchhaltung: ein Blatt je Mitarbeiter, mit
        Datum, Beginn, Ende, Pause, Einsatzort, Soll, Ist und Arbeitszeitkonto.
      </p>

      <div className="mt-6 rounded-2xl border border-paper-200 bg-white p-5">
        <label className="block text-sm font-medium text-ink-700">Monat</label>
        <input
          type="month"
          value={monat}
          max={aktuellerMonat()}
          onChange={(e) => setMonat(e.target.value)}
          className={`${inputClass} mt-2`}
        />

        <button
          type="button"
          onClick={herunterladen}
          disabled={arbeitet}
          className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-3.5 text-[15px] font-medium text-white disabled:opacity-60"
        >
          {arbeitet ? "Datei wird erstellt…" : `Export für ${monatText(monat)}`}
        </button>

        {meldung ? <p className="mt-4 text-[15px] text-green-700">{meldung}</p> : null}
        {fehler ? <p className="mt-4 text-[15px] text-red-600">{fehler}</p> : null}
      </div>

      <p className="mt-5 text-sm leading-relaxed text-ink-500">
        Vor der Abgabe die Zeiten unter „Zeitenfreigabe" prüfen. Der Export nimmt alle erfassten
        Zeiten des Monats, auch noch nicht freigegebene.
      </p>
    </div>
  );
}
