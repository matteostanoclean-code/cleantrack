"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Seitenleiste des Adminbereichs.
 *
 * Dunkle Leiste links, oben das Firmenzeichen, darunter die Bereiche in drei
 * Blöcken: was täglich läuft, die Stammdaten, dann Hilfe und Einstellungen.
 * Bereiche mit Unterpunkten klappen auf und bleiben offen, solange man darin
 * unterwegs ist.
 *
 * Die roten Zahlen kommen von /api/admin/aufgaben, derselben Stelle wie die
 * Zahlen im Dashboard. Zwei Quellen wären früher oder später uneins.
 *
 * Am Handy ist die Leiste ausgeblendet, dort führen die Kacheln im Dashboard.
 */

type Eintrag = {
  titel: string;
  adresse: string;
  icon: string;
  /** Schlüssel in den Zahlen von /api/admin/aufgaben */
  zaehler?: string;
  kinder?: Eintrag[];
  /** Noch nicht gebaut, wird grau dargestellt und ist nicht anklickbar. */
  ruht?: boolean;
};

type Block = { name?: string; eintraege: Eintrag[] };

const BLOECKE: Block[] = [
  {
    eintraege: [
      { titel: "Dashboard", adresse: "/mitarbeiter/admin", icon: "grid" },
      { titel: "Suche", adresse: "/mitarbeiter/admin/suche", icon: "search" },
      { titel: "Chat", adresse: "/mitarbeiter/admin/chat", icon: "chat", zaehler: "chat" },
      {
        titel: "Einsatzplaner",
        adresse: "/mitarbeiter/admin/einsatzplaner",
        icon: "calendar",
        zaehler: "ohneMitarbeiter",
        kinder: [
          { titel: "Wochenplan", adresse: "/mitarbeiter/admin/einsatzplaner", icon: "calendar" },
          { titel: "Serien und Verteilung", adresse: "/mitarbeiter/admin/planung", icon: "refresh", zaehler: "ohneMitarbeiter" }
        ]
      },
      { titel: "Tageszentrale", adresse: "/mitarbeiter/admin/tageszentrale", icon: "clock" },
      { titel: "Zeitenfreigabe", adresse: "/mitarbeiter/admin/zeiten", icon: "stopwatch", zaehler: "zeiten" },
      { titel: "Abwesenheiten", adresse: "/mitarbeiter/admin/abwesenheiten", icon: "plane", zaehler: "urlaub" },
      { titel: "Lohnabrechnung", adresse: "/mitarbeiter/admin/lohnexport", icon: "euro" }
    ]
  },
  {
    eintraege: [
      {
        titel: "Mitarbeiter",
        adresse: "/mitarbeiter/admin/mitarbeiter",
        icon: "users",
        kinder: [
          { titel: "Übersicht", adresse: "/mitarbeiter/admin/mitarbeiter", icon: "users" },
          { titel: "Login vergeben", adresse: "/mitarbeiter/admin/aktivieren", icon: "user" },
          { titel: "Objekte je Mitarbeiter", adresse: "/mitarbeiter/admin/objektzuordnung", icon: "building" },
          { titel: "Kapazität", adresse: "/mitarbeiter/admin/kapazitaet", icon: "priority" },
          { titel: "Push-Nachrichten", adresse: "/mitarbeiter/admin/push", icon: "bell" }
        ]
      },
      {
        titel: "Objekte",
        adresse: "/mitarbeiter/admin/objekte",
        icon: "building",
        kinder: [
          { titel: "Objekte", adresse: "/mitarbeiter/admin/objekte", icon: "building" },
          { titel: "Kunden", adresse: "/mitarbeiter/admin/kunden", icon: "user" },
          { titel: "Kontakte", adresse: "/mitarbeiter/admin/kontakte", icon: "note" },
          { titel: "Geräte", adresse: "/mitarbeiter/admin/geraete", icon: "box" },
          { titel: "Geräte-Etiketten", adresse: "/mitarbeiter/admin/geraete/etiketten", icon: "photo" },
          { titel: "NFC-Aufkleber", adresse: "/mitarbeiter/admin/nfc", icon: "target" },
          { titel: "Schlüssel", adresse: "/mitarbeiter/admin/schluessel", icon: "key" },
          { titel: "Auswertung", adresse: "/mitarbeiter/admin/auswertung", icon: "priority" }
        ]
      },
      { titel: "Aufgaben", adresse: "/mitarbeiter/admin/aufgaben", icon: "list" },
      {
        titel: "Materialwesen",
        // Führt auf die Bestellungen: das ist der Bereich, der Arbeit macht.
        // Der Artikelstamm wird selten angefasst.
        adresse: "/mitarbeiter/admin/bestellungen",
        icon: "box",
        zaehler: "material",
        kinder: [
          { titel: "Bestellungen", adresse: "/mitarbeiter/admin/bestellungen", icon: "flag", zaehler: "material" },
          { titel: "Artikel", adresse: "/mitarbeiter/admin/artikel", icon: "box" }
        ]
      }
    ]
  },
  {
    eintraege: [
      { titel: "Faktura", adresse: "/mitarbeiter/admin", icon: "invoice", ruht: true }
    ]
  },
  {
    eintraege: [
      { titel: "Hilfe", adresse: "/mitarbeiter/admin/hilfe", icon: "help" },
      { titel: "Einstellungen", adresse: "/mitarbeiter/admin/einstellungen", icon: "settings" }
    ]
  }
];

/** Adresse ohne Suchteil, für den Vergleich mit dem aktuellen Pfad. */
function pfadVon(adresse: string) {
  return adresse.split("?")[0];
}

function tabVon(adresse: string) {
  const teil = adresse.split("?")[1] || "";
  return new URLSearchParams(teil).get("tab") || "";
}

export default function AdminSeitenleiste() {
  const pfad = usePathname() || "";
  const suchteil = useSearchParams();
  const aktuellerTab = suchteil?.get("tab") || "";
  const [angemeldet, setAngemeldet] = useState(false);
  const [zahlen, setZahlen] = useState<Record<string, number>>({});
  const [offen, setOffen] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    if (!angemeldet) return;
    let aktiv = true;

    async function holen() {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const antwort = await fetch("/api/admin/aufgaben", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` }
        });
        const ergebnis = await antwort.json();
        if (aktiv && ergebnis?.ok) {
          setZahlen({
            chat: Number(ergebnis.chat) || 0,
            zeiten: Number(ergebnis.zeiten) || 0,
            urlaub: Number(ergebnis.urlaub) || 0,
            material: Number(ergebnis.material) || 0,
            ohneMitarbeiter: Number(ergebnis.ohneMitarbeiter) || 0,
            gesamt: Number(ergebnis.gesamt) || 0
          });
        }
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

  function istAktiv(eintrag: Eintrag) {
    const ziel = pfadVon(eintrag.adresse);
    const tab = tabVon(eintrag.adresse);
    if (tab) return pfad === ziel && aktuellerTab === tab;
    if (ziel === "/mitarbeiter/admin") return pfad === ziel && !aktuellerTab;
    return pfad === ziel || pfad.startsWith(`${ziel}/`);
  }

  function gruppeAktiv(eintrag: Eintrag) {
    return Boolean(eintrag.kinder?.some(istAktiv));
  }

  function zahl(eintrag: Eintrag) {
    return eintrag.zaehler ? zahlen[eintrag.zaehler] || 0 : 0;
  }

  /** Summe der Kinder, damit eine zugeklappte Gruppe ihre offenen Punkte zeigt. */
  function gruppenZahl(eintrag: Eintrag) {
    const eigene = zahl(eintrag);
    if (!eintrag.kinder) return eigene;
    return eigene || eintrag.kinder.reduce((summe, kind) => summe + zahl(kind), 0);
  }

  function Punkt({ wert }: { wert: number }) {
    if (wert <= 0) return null;
    return (
      <span className="ml-auto shrink-0 rounded-full bg-danger-500 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-white">
        {wert}
      </span>
    );
  }

  return (
    <aside className="hidden w-[248px] shrink-0 bg-[#141d33] md:block print:hidden">
      <div className="sticky top-0 flex h-[100dvh] flex-col overflow-y-auto">
        <Link href="/mitarbeiter/admin" className="flex items-center gap-3 px-4 py-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white p-1.5">
            <img src="/logo-zeichen.png" alt="" className="h-full w-full object-contain" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[14px] font-semibold text-white">Matteo Stano Clean</span>
            <span className="block truncate text-[13px] text-white/60">Gebäudereinigung</span>
          </span>
          {zahlen.gesamt > 0 ? (
            <span className="relative shrink-0 text-white/70">
              <UiIcon name="bell" className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#141d33] bg-danger-500" />
            </span>
          ) : null}
        </Link>

        <nav className="flex-1 px-3 pb-4">
          {BLOECKE.map((block, index) => (
            <div key={index} className={cx("py-2", index > 0 && "mt-2 border-t border-white/10 pt-3")}>
              <ul className="space-y-0.5">
                {block.eintraege.map((eintrag) => {
                  const aufgeklappt = offen[eintrag.titel] ?? gruppeAktiv(eintrag);
                  const aktiv = istAktiv(eintrag) || (!aufgeklappt && gruppeAktiv(eintrag));

                  if (eintrag.ruht) {
                    return (
                      <li key={eintrag.titel}>
                        <span className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-white/25">
                          <UiIcon name={eintrag.icon} className="h-[18px] w-[18px] shrink-0" />
                          <span className="truncate">{eintrag.titel}</span>
                          <span className="ml-auto shrink-0 text-[11px]">folgt</span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={eintrag.titel}>
                      <div className="flex items-center">
                        <Link
                          href={eintrag.adresse}
                          className={cx(
                            "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition",
                            aktiv ? "bg-brand-600 font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <UiIcon name={eintrag.icon} className="h-[18px] w-[18px] shrink-0" />
                          <span className="truncate">{eintrag.titel}</span>
                          <Punkt wert={gruppenZahl(eintrag)} />
                        </Link>
                        {eintrag.kinder ? (
                          <button
                            type="button"
                            onClick={() => setOffen((aktuell) => ({ ...aktuell, [eintrag.titel]: !aufgeklappt }))}
                            aria-label={aufgeklappt ? `${eintrag.titel} zuklappen` : `${eintrag.titel} aufklappen`}
                            className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-white/50 hover:text-white"
                          >
                            <UiIcon name={aufgeklappt ? "chevronDown" : "chevronRight"} className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>

                      {eintrag.kinder && aufgeklappt ? (
                        <ul className="mb-1 ml-[26px] space-y-0.5 border-l border-white/10 pl-3">
                          {eintrag.kinder.map((kind) => (
                            <li key={kind.titel}>
                              <Link
                                href={kind.adresse}
                                className={cx(
                                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition",
                                  istAktiv(kind) ? "bg-white/15 font-semibold text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                                )}
                              >
                                <span className="truncate">{kind.titel}</span>
                                <Punkt wert={zahl(kind)} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <Link
          href="/mitarbeiter"
          className="mx-3 mb-4 rounded-lg border border-white/15 px-3 py-2 text-center text-[13px] text-white/60 hover:bg-white/10 hover:text-white"
        >
          Zur Mitarbeiter-App
        </Link>
      </div>
    </aside>
  );
}
