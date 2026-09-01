"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Wie weit das Team wirklich in der App angekommen ist.
 *
 * Vier Schritte je Person, in dieser Reihenfolge: Es steht ein Einsatz auf
 * sie, sie hat einen Login bekommen, sie hat sich angemeldet, sie hat
 * gestempelt. Erst wenn alle vier stehen, arbeitet jemand mit der App.
 *
 * Bewusst vier Schritte statt einer Ja-Nein-Spalte: Ein vergebener Login, den
 * nie jemand benutzt, sieht in einer Liste aus wie Fortschritt und ist keiner.
 */

type Einrichtung = {
  gesamt: number;
  personen: Array<{
    id: string;
    name: string;
    email: string;
    einsatz: boolean;
    login: boolean;
    angemeldet: boolean;
    gestempelt: boolean;
    push: boolean;
    fortschritt: number;
  }>;
  kennzahlen: { einsatz: number; login: number; angemeldet: number; gestempelt: number; push: number; fertig: number };
};

function QuoteCard({ titel, wert, gesamt, hervorgehoben }: { titel: string; wert: number; gesamt: number; hervorgehoben?: boolean }) {
  const prozent = gesamt > 0 ? Math.round((wert / gesamt) * 1000) / 10 : 0;
  const voll = gesamt > 0 && wert === gesamt;
  return (
    <div className={`rounded-2xl border p-4 ${hervorgehoben ? "border-transparent bg-[#141d33]" : "border-paper-200 bg-white"}`}>
      <p className={`text-[13px] ${hervorgehoben ? "text-white/70" : "text-ink-400"}`}>{titel}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={`text-[28px] font-bold leading-none ${hervorgehoben ? "text-white" : "text-ink-900"}`}>{prozent}%</p>
        <p className={`text-[13px] ${hervorgehoben ? "text-white/70" : "text-ink-400"}`}>{wert} / {gesamt}</p>
      </div>
      <span className={`mt-3 block h-1.5 overflow-hidden rounded-full ${hervorgehoben ? "bg-white/20" : "bg-paper-200"}`}>
        <span className={`block h-1.5 rounded-full ${voll ? "bg-success-500" : "bg-danger-500"}`} style={{ width: `${Math.max(2, prozent)}%` }} />
      </span>
    </div>
  );
}

function Haken({ an }: { an: boolean }) {
  return (
    <td className="px-3 py-3 text-center">
      <span className={`text-[16px] font-bold ${an ? "text-success-600" : "text-ink-200"}`}>{an ? "✓" : "✕"}</span>
    </td>
  );
}

export default function EinrichtungBlock({ token, titel = "Einrichtung im Team" }: { token: string; titel?: string }) {
  const [stand, setStand] = useState<Einrichtung | null>(null);
  const [eingeklappt, setEingeklappt] = useState(false);

  const holen = useCallback(async () => {
    if (!token) return;
    try {
      const antwort = await fetch("/api/admin/einrichtung", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const ergebnis = await antwort.json();
      if (ergebnis?.ok) setStand(ergebnis);
    } catch {
      /* Die Seite darf ohne diesen Block weiterlaufen. */
    }
  }, [token]);

  useEffect(() => {
    holen();
  }, [holen]);

  if (!stand || stand.gesamt === 0) return null;

  const fertig = stand.kennzahlen.fertig === stand.gesamt;

  return (
    <section className="mb-4">
      <button onClick={() => setEingeklappt((wert) => !wert)} className="flex w-full items-center gap-2 pb-2 text-left">
        <h2 className="text-[17px] font-bold text-ink-900">{titel}</h2>
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${fertig ? "bg-success-100 text-success-700" : "bg-amber-100 text-amber-800"}`}>
          {stand.kennzahlen.fertig} von {stand.gesamt} vollständig
        </span>
        <span className="ml-auto text-[13px] text-ink-400">{eingeklappt ? "Aufklappen" : "Zuklappen"}</span>
      </button>

      {!eingeklappt ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <QuoteCard titel="Mit Einsätzen" wert={stand.kennzahlen.einsatz} gesamt={stand.gesamt} />
            <QuoteCard titel="Login vergeben" wert={stand.kennzahlen.login} gesamt={stand.gesamt} />
            <QuoteCard titel="Schon angemeldet" wert={stand.kennzahlen.angemeldet} gesamt={stand.gesamt} />
            <QuoteCard titel="Schon gestempelt" wert={stand.kennzahlen.gestempelt} gesamt={stand.gesamt} />
            <QuoteCard titel="Push aktiv" wert={stand.kennzahlen.push} gesamt={stand.gesamt} />
            <QuoteCard titel="Vollständig" wert={stand.kennzahlen.fertig} gesamt={stand.gesamt} hervorgehoben />
          </div>

          <div className="mt-3 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Fortschritt</th>
                  <th className="px-3 py-3 text-center">Einsatz</th>
                  <th className="px-3 py-3 text-center">Login</th>
                  <th className="px-3 py-3 text-center">Angemeldet</th>
                  <th className="px-3 py-3 text-center">Gestempelt</th>
                </tr>
              </thead>
              <tbody>
                {stand.personen.map((person) => (
                  <tr key={person.id} className="border-b border-paper-200 last:border-0">
                    <td className="px-4 py-3">
                      <p className="text-[15px] font-semibold text-ink-900">{person.name}</p>
                      {person.email ? <p className="text-[12px] text-ink-400">{person.email}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-[110px] shrink-0 overflow-hidden rounded-full bg-paper-200">
                          <span
                            className={`block h-1.5 rounded-full ${person.fortschritt === 100 ? "bg-success-500" : "bg-amber-500"}`}
                            style={{ width: `${person.fortschritt}%` }}
                          />
                        </span>
                        <span className="text-[13px] font-semibold text-ink-600">{person.fortschritt}%</span>
                      </div>
                    </td>
                    <Haken an={person.einsatz} />
                    <Haken an={person.login} />
                    <Haken an={person.angemeldet} />
                    <Haken an={person.gestempelt} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stand.kennzahlen.login < stand.gesamt ? (
            <a href="/mitarbeiter/admin/aktivieren" className="mt-3 flex items-center justify-between rounded-2xl border border-paper-200 bg-white px-4 py-3">
              <span>
                <span className="block text-[15px] font-semibold text-ink-900">Login vergeben</span>
                <span className="block text-[13px] text-ink-400">{stand.gesamt - stand.kennzahlen.login} Leute haben noch keinen Zugang</span>
              </span>
              <span className="rounded-md bg-danger-500 px-2 py-1 text-[12px] font-bold text-white">{stand.gesamt - stand.kennzahlen.login}</span>
            </a>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
