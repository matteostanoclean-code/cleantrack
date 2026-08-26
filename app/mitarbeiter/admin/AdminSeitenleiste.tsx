"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Feste Seitenleiste für den Adminbereich am Rechner.
 *
 * Am Handy wird sie ausgeblendet — dort bleibt die bisherige Bedienung über
 * die Reiter innerhalb der Seiten. Ab der Breite "lg" steht sie links und der
 * Inhalt nutzt den Rest.
 */

type Eintrag = { titel: string; adresse: string; symbol: string };
type Gruppe = { name: string; eintraege: Eintrag[] };

const GRUPPEN: Gruppe[] = [
  {
    name: "Überblick",
    eintraege: [
      { titel: "Dashboard", adresse: "/mitarbeiter/admin", symbol: "▦" },
      { titel: "Tageszentrale", adresse: "/mitarbeiter/admin/tageszentrale", symbol: "◷" },
      { titel: "Auswertung", adresse: "/mitarbeiter/admin/auswertung", symbol: "◔" },
    ],
  },
  {
    name: "Planung",
    eintraege: [
      { titel: "Einsatzplanung", adresse: "/mitarbeiter/admin/planung", symbol: "▤" },
      { titel: "Kapazität", adresse: "/mitarbeiter/admin/kapazitaet", symbol: "▥" },
      { titel: "Urlaub", adresse: "/mitarbeiter/admin/urlaub", symbol: "☀" },
    ],
  },
  {
    name: "Zeiten",
    eintraege: [
      { titel: "Zeitenfreigabe", adresse: "/mitarbeiter/admin/zeiten", symbol: "✓" },
      { titel: "Freigaben und Meldungen", adresse: "/mitarbeiter/admin/freigaben", symbol: "≡" },
      { titel: "Chat vom Team", adresse: "/mitarbeiter/admin/chat", symbol: "✉" },
      { titel: "Lohnexport", adresse: "/mitarbeiter/admin/lohnexport", symbol: "↓" },
    ],
  },
  {
    name: "Objekte und Geräte",
    eintraege: [
      { titel: "Geräte", adresse: "/mitarbeiter/admin/geraete", symbol: "⚙" },
      { titel: "Geräte-Etiketten", adresse: "/mitarbeiter/admin/geraete/etiketten", symbol: "▢" },
      { titel: "Artikel fürs Material", adresse: "/mitarbeiter/admin/artikel", symbol: "▣" },
      { titel: "NFC-Aufkleber", adresse: "/mitarbeiter/admin/nfc", symbol: "◎" },
    ],
  },
  {
    name: "Team",
    eintraege: [
      { titel: "Mitarbeiter aktivieren", adresse: "/mitarbeiter/admin/aktivieren", symbol: "＋" },
      { titel: "Push-Nachrichten", adresse: "/mitarbeiter/admin/push", symbol: "◈" },
    ],
  },
];

export default function AdminSeitenleiste() {
  const pfad = usePathname() || "";
  const [angemeldet, setAngemeldet] = useState(false);
  const [ungelesen, setUngelesen] = useState(0);

  /**
   * Die Seitenleiste gehört zum Rahmen und weiß von sich aus nichts über die
   * Anmeldung. Ohne diese Prüfung stünde sie auch neben dem Login-Feld.
   */
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let aktiv = true;

    supabase.auth.getSession().then(({ data }) => {
      if (aktiv) setAngemeldet(Boolean(data.session?.access_token));
    });

    const { data: beobachter } = supabase.auth.onAuthStateChange((_ereignis, sitzung) => {
      if (aktiv) setAngemeldet(Boolean(sitzung?.access_token));
    });

    return () => {
      aktiv = false;
      beobachter.subscription.unsubscribe();
    };
  }, []);

  /**
   * Anzahl ungelesener Chat-Nachrichten für den roten Punkt. Wird beim Laden
   * und danach alle 30 Sekunden geholt, außerdem bei jedem Seitenwechsel.
   */
  useEffect(() => {
    if (!angemeldet) return;
    let aktiv = true;

    async function holen() {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const antwort = await fetch("/api/admin/chat?zaehler=1", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        const ergebnis = await antwort.json();
        if (aktiv && ergebnis?.ok) setUngelesen(Number(ergebnis.ungelesen) || 0);
      } catch {
        /* Zähler ist Beiwerk, Fehler bleiben still */
      }
    }

    holen();
    const uhr = setInterval(holen, 30000);
    return () => {
      aktiv = false;
      clearInterval(uhr);
    };
  }, [angemeldet, pfad]);

  if (!angemeldet) return null;

  return (
    <aside className="hidden w-[248px] shrink-0 border-r border-paper-200 bg-white md:block print:hidden">
      <div className="sticky top-0 flex h-[100dvh] flex-col overflow-y-auto px-3 py-5">
        <Link href="/mitarbeiter" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-[15px] font-bold text-white">S</span>
          <span className="text-[16px] font-semibold text-ink-900">Schichtklar</span>
        </Link>

        <nav className="flex-1 space-y-5">
          {GRUPPEN.map((gruppe) => (
            <div key={gruppe.name}>
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-300">
                {gruppe.name}
              </p>
              <ul className="space-y-0.5">
                {gruppe.eintraege.map((eintrag) => {
                  const aktiv =
                    pfad === eintrag.adresse ||
                    (eintrag.adresse !== "/mitarbeiter/admin" && pfad.startsWith(`${eintrag.adresse}/`));
                  return (
                    <li key={eintrag.adresse}>
                      <Link
                        href={eintrag.adresse}
                        className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-[14px] transition ${
                          aktiv
                            ? "bg-brand-50 font-semibold text-brand-700"
                            : "text-ink-600 hover:bg-paper-100"
                        }`}
                      >
                        <span className="w-4 shrink-0 text-center text-[13px] opacity-70">{eintrag.symbol}</span>
                        <span className="truncate">{eintrag.titel}</span>
                        {eintrag.adresse === "/mitarbeiter/admin/chat" && ungelesen > 0 ? (
                          <span className="ml-auto shrink-0 rounded-full bg-danger-500 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-white">
                            {ungelesen}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <Link
          href="/mitarbeiter"
          className="mt-6 rounded-lg border border-paper-200 px-3 py-2 text-center text-[13px] font-medium text-ink-500 hover:bg-paper-100"
        >
          Zur Mitarbeiter-App
        </Link>
      </div>
    </aside>
  );
}
