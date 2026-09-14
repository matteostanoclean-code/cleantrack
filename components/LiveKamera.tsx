"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UiIcon, cx } from "@/components/ui";

/**
 * Fotos, die nur im Moment der Aufnahme entstehen können.
 *
 * Der Anlass: Beim Qualitätsnachweis oder einer Schadensmeldung soll das Foto
 * belegen, wann es gemacht wurde. Ein normales Dateifeld lässt aber immer auch
 * die Galerie zu — dann kommt das Bild von letzter Woche, und niemand sieht es
 * ihm an. Auch "capture" am Dateifeld ist nur ein Wunsch an den Browser, kein
 * Zwang.
 *
 * Deshalb öffnet diese Kamera das Kamerabild direkt in der App. Eine Galerie
 * gibt es hier nicht, und damit auch keinen Weg für ein altes Foto.
 *
 * Die Zeit kommt vom Server, nicht vom Handy: beim Öffnen wird einmal
 * nachgefragt und die Abweichung der Handyuhr herausgerechnet. Ist das Handy
 * offline, steht im Foto ausdrücklich "Gerätezeit", damit niemand die Angabe
 * für belastbarer hält, als sie ist.
 *
 * Zeit, Objekt und Name werden ins Bild geschrieben, nicht nur daneben
 * gespeichert. So trägt das Foto seinen Beleg mit, auch wenn es als Anhang an
 * einen Kunden geht.
 */

type Props = {
  fotos: File[];
  onChange: (fotos: File[]) => void;
  max?: number;
  objekt?: string | null;
  person?: string | null;
  titel?: string;
};

const LANGE_KANTE = 1600;

function zweistellig(zahl: number) {
  return String(zahl).padStart(2, "0");
}

function stempelText(zeit: Date) {
  const datum = `${zweistellig(zeit.getDate())}.${zweistellig(zeit.getMonth() + 1)}.${zeit.getFullYear()}`;
  const uhr = `${zweistellig(zeit.getHours())}:${zweistellig(zeit.getMinutes())}:${zweistellig(zeit.getSeconds())}`;
  return `${datum} · ${uhr} Uhr`;
}

function dateiName(zeit: Date) {
  return `live-${zeit.getFullYear()}-${zweistellig(zeit.getMonth() + 1)}-${zweistellig(zeit.getDate())}_${zweistellig(zeit.getHours())}-${zweistellig(zeit.getMinutes())}-${zweistellig(zeit.getSeconds())}.jpg`;
}

export default function LiveKamera({ fotos, onChange, max = 6, objekt, person, titel = "Fotos" }: Props) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bereit, setBereit] = useState(false);
  const [blitz, setBlitz] = useState(false);
  const [vorschau, setVorschau] = useState<string[]>([]);
  // Abweichung der Handyuhr zum Server in Millisekunden. null heißt: nicht
  // ermittelt, es gilt die Gerätezeit.
  const [abweichung, setAbweichung] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Vorschaubilder aus den Dateien, und wieder freigeben, wenn sie gehen.
  useEffect(() => {
    const adressen = fotos.map((foto) => URL.createObjectURL(foto));
    setVorschau(adressen);
    return () => adressen.forEach((adresse) => URL.revokeObjectURL(adresse));
  }, [fotos]);

  const kameraAus = useCallback(() => {
    streamRef.current?.getTracks().forEach((spur) => spur.stop());
    streamRef.current = null;
    setBereit(false);
  }, []);

  useEffect(() => () => kameraAus(), [kameraAus]);

  async function serverzeitHolen() {
    try {
      const vorher = Date.now();
      const antwort = await fetch("/api/zeit", { cache: "no-store" });
      const nachher = Date.now();
      const ergebnis = await antwort.json();
      const server = new Date(ergebnis.jetzt).getTime();
      if (!Number.isFinite(server)) return null;
      // Die Mitte der Anfrage gegen die Serverzeit, damit die Laufzeit des
      // Netzes nicht mit in die Abweichung rutscht.
      return server - Math.round((vorher + nachher) / 2);
    } catch {
      return null;
    }
  }

  async function oeffnen() {
    setFehler(null);
    setOffen(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      setFehler("Dieses Handy lässt die Kamera in der App nicht zu. Bitte den Browser aktualisieren.");
      return;
    }

    const [zeit, stream] = await Promise.all([
      serverzeitHolen(),
      navigator.mediaDevices
        .getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        })
        .catch((grund: unknown) => {
          const name = (grund as { name?: string })?.name || "";
          if (name === "NotAllowedError" || name === "SecurityError") {
            setFehler("Die Kamera ist nicht freigegeben. In den Einstellungen des Handys der App den Zugriff auf die Kamera erlauben und es noch einmal versuchen.");
          } else if (name === "NotFoundError" || name === "OverconstrainedError") {
            setFehler("Es wurde keine Kamera gefunden.");
          } else if (name === "NotReadableError") {
            setFehler("Die Kamera wird gerade von einer anderen App benutzt. Diese schließen und es noch einmal versuchen.");
          } else {
            setFehler("Die Kamera ließ sich nicht öffnen.");
          }
          return null;
        })
    ]);

    setAbweichung(zeit);
    if (!stream) return;

    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Manche Browser spielen erst nach einer Berührung ab. Das Bild kommt
        // dann trotzdem, sobald jemand auf den Auslöser tippt.
      }
    }
  }

  function schliessen() {
    kameraAus();
    setOffen(false);
  }

  function ausloesen() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || fotos.length >= max) return;

    const zeit = new Date(Date.now() + (abweichung ?? 0));

    const massstab = Math.min(1, LANGE_KANTE / Math.max(video.videoWidth, video.videoHeight));
    const breite = Math.round(video.videoWidth * massstab);
    const hoehe = Math.round(video.videoHeight * massstab);

    const leinwand = document.createElement("canvas");
    leinwand.width = breite;
    leinwand.height = hoehe;
    const stift = leinwand.getContext("2d");
    if (!stift) return;

    stift.drawImage(video, 0, 0, breite, hoehe);

    // Der Stempel unten im Bild.
    const schrift = Math.max(16, Math.round(breite / 42));
    const zeilen = [
      `${stempelText(zeit)}${abweichung === null ? " (Gerätezeit)" : ""}`,
      [objekt, person].map((wert) => String(wert || "").trim()).filter(Boolean).join(" · ")
    ].filter(Boolean);
    const rand = Math.round(schrift * 0.6);
    const balken = zeilen.length * Math.round(schrift * 1.35) + rand * 2;

    stift.fillStyle = "rgba(0, 0, 0, 0.55)";
    stift.fillRect(0, hoehe - balken, breite, balken);
    stift.fillStyle = "#ffffff";
    stift.textBaseline = "top";
    zeilen.forEach((text, index) => {
      stift.font = `${index === 0 ? "600" : "400"} ${schrift}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      stift.fillText(text, rand, hoehe - balken + rand + index * Math.round(schrift * 1.35), breite - rand * 2);
    });

    leinwand.toBlob(
      (blob) => {
        if (!blob) return;
        const datei = new File([blob], dateiName(zeit), { type: "image/jpeg", lastModified: zeit.getTime() });
        onChange([...fotos, datei].slice(0, max));
      },
      "image/jpeg",
      0.85
    );

    setBlitz(true);
    window.setTimeout(() => setBlitz(false), 120);
  }

  function entfernen(index: number) {
    onChange(fotos.filter((_, position) => position !== index));
  }

  const voll = fotos.length >= max;

  return (
    <div className="rounded-xl border border-dashed border-paper-300 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-ink-400">
          {titel} · {fotos.length} von {max}
        </span>
        <button
          type="button"
          onClick={oeffnen}
          disabled={voll}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          <UiIcon name="photo" className="h-4 w-4" />
          {fotos.length ? "Weiteres Foto" : "Foto aufnehmen"}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-400">Nur direkt mit der Kamera. Zeit und Objekt stehen im Bild.</p>

      {vorschau.length ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {vorschau.map((adresse, index) => (
            <div key={adresse} className="relative">
              <img src={adresse} alt="" className="h-20 w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => entfernen(index)}
                aria-label="Foto entfernen"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
              >
                <UiIcon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {offen ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
          <div className="flex items-center justify-between px-4 pb-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
            <span className="text-[14px] font-semibold">
              {fotos.length} von {max}
            </span>
            <button type="button" onClick={schliessen} className="rounded-lg bg-white/15 px-4 py-2 text-[14px] font-semibold">
              Fertig
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              onLoadedMetadata={() => setBereit(true)}
              className="h-full w-full object-contain"
            />
            {blitz ? <div className="pointer-events-none absolute inset-0 bg-white/70" /> : null}
            {fehler ? (
              <div className="absolute inset-0 grid place-items-center p-6">
                <p className="max-w-[340px] rounded-xl bg-white/10 p-4 text-center text-[15px] leading-relaxed">{fehler}</p>
              </div>
            ) : !bereit ? (
              <div className="absolute inset-0 grid place-items-center text-[15px] text-white/70">Kamera startet …</div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 px-6 pt-4" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
              {vorschau.slice(-3).map((adresse) => (
                <img key={adresse} src={adresse} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              ))}
            </div>
            <button
              type="button"
              onClick={ausloesen}
              disabled={!bereit || voll || Boolean(fehler)}
              aria-label="Auslösen"
              className={cx(
                "grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full border-4 border-white transition active:scale-95",
                !bereit || voll || fehler ? "opacity-40" : ""
              )}
            >
              <span className="block h-14 w-14 rounded-full bg-white" />
            </button>
            <div className="min-w-0 flex-1 text-right text-[12px] leading-tight text-white/70">
              {voll ? "Maximum erreicht" : abweichung === null && bereit ? "Offline: Gerätezeit" : ""}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
