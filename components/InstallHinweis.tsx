"use client";

import { useEffect, useState } from "react";

/**
 * Hinweis, dass Schichtklar auf den Startbildschirm gehört.
 *
 * Warum das mehr ist als Bequemlichkeit: Auf dem iPhone kommen Push-Nachrichten
 * ausschließlich bei einer installierten App an. Wer Schichtklar nur in Safari
 * öffnet, bekommt nie eine Meldung — weder über eine neue Nachricht vom Büro
 * noch über eine Änderung am Einsatzplan.
 *
 * Der Hinweis verschwindet, sobald die App installiert ist, und lässt sich
 * wegklicken. Weggeklickt bleibt er 14 Tage still, damit er nicht nervt, aber
 * auch nicht endgültig vergessen wird.
 */

type Geraet = "android" | "ios" | "andere";

const SPEICHER = "schichtklar-install-hinweis-bis";
const RUHE_TAGE = 14;

function geraeteArt(): Geraet {
  if (typeof navigator === "undefined") return "andere";
  const kennung = navigator.userAgent || "";
  if (/android/i.test(kennung)) return "android";
  // iPad meldet sich neuerdings als Macintosh, deshalb zusätzlich auf Touch prüfen.
  const istApple = /iphone|ipad|ipod/i.test(kennung) || (/macintosh/i.test(kennung) && navigator.maxTouchPoints > 1);
  if (istApple) return "ios";
  return "andere";
}

function istInstalliert() {
  if (typeof window === "undefined") return true;
  const alsApp = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const appleAlsApp = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(alsApp || appleAlsApp);
}

function ruht() {
  try {
    const bis = window.localStorage.getItem(SPEICHER);
    if (!bis) return false;
    return Date.now() < Number(bis);
  } catch {
    return false;
  }
}

export default function InstallHinweis() {
  const [zeigen, setZeigen] = useState(false);
  const [geraet, setGeraet] = useState<Geraet>("andere");
  const [aufforderung, setAufforderung] = useState<any>(null);

  useEffect(() => {
    if (istInstalliert() || ruht()) return;
    setGeraet(geraeteArt());
    setZeigen(true);

    // Android und Chrome bieten eine echte Installationsabfrage an. Die fangen
    // wir ab, damit der Knopf unten sie auslösen kann.
    function merken(ereignis: Event) {
      ereignis.preventDefault();
      setAufforderung(ereignis);
    }
    window.addEventListener("beforeinstallprompt", merken);

    function fertig() {
      setZeigen(false);
    }
    window.addEventListener("appinstalled", fertig);

    return () => {
      window.removeEventListener("beforeinstallprompt", merken);
      window.removeEventListener("appinstalled", fertig);
    };
  }, []);

  function spaeter() {
    try {
      window.localStorage.setItem(SPEICHER, String(Date.now() + RUHE_TAGE * 86400000));
    } catch {
      /* ohne Speicher erscheint der Hinweis beim nächsten Start wieder */
    }
    setZeigen(false);
  }

  async function installieren() {
    if (!aufforderung) return;
    aufforderung.prompt();
    try {
      await aufforderung.userChoice;
    } catch {
      /* abgebrochen */
    }
    setAufforderung(null);
    setZeigen(false);
  }

  if (!zeigen) return null;

  return (
    <div className="mb-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
      <p className="text-[15px] font-semibold text-ink-900">Schichtklar auf den Startbildschirm</p>

      {geraet === "ios" ? (
        <>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-700">
            Auf dem iPhone bekommst du Meldungen vom Büro <strong>nur</strong>, wenn Schichtklar auf
            dem Startbildschirm liegt. In Safari allein kommt nichts an.
          </p>
          <ol className="mt-3 space-y-1.5 text-[14px] text-ink-700">
            <li>1. Unten auf das Teilen-Symbol tippen</li>
            <li>2. „Zum Home-Bildschirm" wählen</li>
            <li>3. Bestätigen — fertig</li>
          </ol>
        </>
      ) : geraet === "android" ? (
        <>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-700">
            Dann startet Schichtklar wie eine App, ohne Browserrahmen, und Meldungen vom Büro
            kommen zuverlässig an.
          </p>
          {aufforderung ? (
            <button
              type="button"
              onClick={installieren}
              className="mt-3 w-full rounded-xl bg-brand-600 px-4 py-3 text-[15px] font-semibold text-white"
            >
              Jetzt installieren
            </button>
          ) : (
            <ol className="mt-3 space-y-1.5 text-[14px] text-ink-700">
              <li>1. Oben rechts auf die drei Punkte tippen</li>
              <li>2. „App installieren" wählen</li>
              <li>3. Bestätigen — fertig</li>
            </ol>
          )}
        </>
      ) : (
        <p className="mt-1 text-[14px] leading-relaxed text-ink-700">
          Öffne Schichtklar auf deinem Handy und lege es dort auf den Startbildschirm. Nur dann
          kommen Meldungen vom Büro an.
        </p>
      )}

      <button
        type="button"
        onClick={spaeter}
        className="mt-3 text-[13px] font-semibold text-ink-500 underline"
      >
        Später
      </button>
    </div>
  );
}
