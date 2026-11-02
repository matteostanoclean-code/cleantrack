"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";

/**
 * QR-Code zum Kundenportal, mit dem Firmenzeichen in der Mitte und der
 * Unterschrift darunter.
 *
 * Gezeichnet wird auf eine Leinwand statt als SVG. Der Grund ist der Weg
 * danach: Aus der Leinwand fällt mit einem Klick ein PNG heraus, das sich
 * drucken, in einen Brief kleben oder per Mail verschicken lässt. Ein SVG mit
 * eingebettetem Logo hätte beim Umwandeln in ein Bild je nach Browser
 * geklemmt.
 *
 * Fehlerkorrektur steht auf H (bis 30 % Verlust). Das Logo deckt die Mitte ab,
 * und ohne diese Stufe wäre der Code danach nicht mehr lesbar. Deshalb bleibt
 * das Logo auch bei 22 % der Kantenlänge — das sind knapp 5 % der Fläche.
 */

const LOGO = "/logo-zeichen.png";
const LOGO_ANTEIL = 0.22;

type Props = {
  /** Die Adresse, die im Code steht. */
  wert: string;
  /** Kundenname, klein unter die Unterschrift. */
  name?: string;
  /** Kantenlänge der Anzeige in Bildpunkten. */
  groesse?: number;
};

/** Ein Rechteck mit runden Ecken — für den weißen Kasten hinter dem Logo. */
function rundesRechteck(ctx: CanvasRenderingContext2D, x: number, y: number, breite: number, hoehe: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + breite, y, x + breite, y + hoehe, radius);
  ctx.arcTo(x + breite, y + hoehe, x, y + hoehe, radius);
  ctx.arcTo(x, y + hoehe, x, y, radius);
  ctx.arcTo(x, y, x + breite, y, radius);
  ctx.closePath();
}

export default function PortalQr({ wert, name, groesse = 280 }: Props) {
  const leinwand = useRef<HTMLCanvasElement | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  /**
   * Die Karte zeichnen. `faktor` ist die Auflösung: 1 für die Anzeige,
   * mehr für die Datei zum Drucken.
   */
  const zeichnen = useCallback(async (ziel: HTMLCanvasElement, faktor: number) => {
    const breite = 600;
    const hoehe = 760;
    const rand = 60;
    const qrKante = breite - rand * 2;

    ziel.width = breite * faktor;
    ziel.height = hoehe * faktor;
    const ctx = ziel.getContext("2d");
    if (!ctx) throw new Error("Diese Ansicht kann nichts zeichnen.");
    ctx.scale(faktor, faktor);

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, breite, hoehe);

    const code = qrcode(0, "H");
    code.addData(wert);
    code.make();
    const felder = code.getModuleCount();
    const kante = qrKante / felder;

    ctx.fillStyle = "#0F1720";
    for (let zeile = 0; zeile < felder; zeile += 1) {
      for (let spalte = 0; spalte < felder; spalte += 1) {
        if (!code.isDark(zeile, spalte)) continue;
        // Eine Spur über die Kante hinaus, sonst stehen beim Skalieren feine
        // weiße Linien zwischen den Feldern.
        ctx.fillRect(rand + spalte * kante, rand + zeile * kante, kante + 0.5, kante + 0.5);
      }
    }

    // Logo in die Mitte, auf einem weißen Kasten mit etwas Luft.
    const logoKante = Math.round(qrKante * LOGO_ANTEIL);
    const kasten = logoKante + 22;
    const kastenX = rand + (qrKante - kasten) / 2;
    const kastenY = rand + (qrKante - kasten) / 2;
    ctx.fillStyle = "#FFFFFF";
    rundesRechteck(ctx, kastenX, kastenY, kasten, kasten, 14);
    ctx.fill();

    const bild = new Image();
    bild.src = LOGO;
    await bild.decode();
    ctx.drawImage(bild, kastenX + 11, kastenY + 11, logoKante, logoKante);

    // Schrift aus dem Haus, nicht die des Betriebssystems.
    const familie =
      getComputedStyle(document.body).getPropertyValue("--font-body").trim() || "system-ui, sans-serif";
    ctx.textAlign = "center";

    ctx.fillStyle = "#0F1720";
    ctx.font = `700 46px ${familie}`;
    ctx.fillText("Kundenportal", breite / 2, 625);

    ctx.fillStyle = "#4B5563";
    ctx.font = `400 30px ${familie}`;
    ctx.fillText("Zeiten und Reklamationen", breite / 2, 668);

    if (name) {
      ctx.fillStyle = "#9CA3AF";
      ctx.font = `400 22px ${familie}`;
      ctx.fillText(name, breite / 2, 712);
    }
  }, [wert, name]);

  useEffect(() => {
    let abgebrochen = false;
    async function los() {
      const ziel = leinwand.current;
      if (!ziel || !wert) return;
      try {
        // Erst wenn die Schrift steht, sonst wird die Unterschrift in der
        // Ersatzschrift gezeichnet und fällt später anders aus.
        if (document.fonts?.ready) await document.fonts.ready;
        if (abgebrochen) return;
        await zeichnen(ziel, 1);
        if (!abgebrochen) setFehler(null);
      } catch (problem) {
        if (!abgebrochen) setFehler(problem instanceof Error ? problem.message : "Der QR-Code ließ sich nicht erzeugen.");
      }
    }
    los();
    return () => { abgebrochen = true; };
  }, [wert, zeichnen]);

  /** Als PNG herunterladen, in Druckauflösung. */
  async function herunterladen() {
    try {
      const ziel = document.createElement("canvas");
      // Faktor 3: die 600 Punkte werden 1800 und reichen für DIN A5 im Druck.
      await zeichnen(ziel, 3);
      const link = document.createElement("a");
      link.href = ziel.toDataURL("image/png");
      link.download = `Kundenportal ${name || "QR"}.png`.replace(/[\\/:*?"<>|]/g, "-");
      link.click();
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : "Das Bild ließ sich nicht erzeugen.");
    }
  }

  if (!wert) return null;

  return (
    <div className="mt-3 rounded-xl border border-paper-200 bg-white p-3">
      {fehler ? <p className="mb-2 text-[12px] text-danger-700">{fehler}</p> : null}
      <div className="flex flex-wrap items-center gap-4">
        <canvas
          ref={leinwand}
          style={{ width: groesse, height: (groesse / 600) * 760 }}
          className="shrink-0 rounded-lg border border-paper-200"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-700">Zum Aushängen</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-400">
            Mit der Handy-Kamera zu scannen. Hängt der Zettel im Treppenhaus, kommt jeder dort hinein —
            gib ihn nur dem Ansprechpartner oder häng ihn im Büro des Kunden aus.
          </p>
          <button
            type="button"
            onClick={herunterladen}
            className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Als Bild herunterladen
          </button>
        </div>
      </div>
    </div>
  );
}
