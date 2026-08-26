/**
 * Bilder fürs Hochladen vorbereiten, Antworten sicher lesen.
 *
 * Läuft im Browser. Beides gehört zusammen, weil dasselbe Problem dahinter
 * steckt: ein zu großes Foto kommt gar nicht erst bei der App an, und was
 * zurückkommt, ist dann kein Datensatz, sondern Klartext.
 */

/**
 * Ein Handyfoto ist schnell fünf Megabyte groß. Der Server nimmt pro Anfrage
 * nur rund viereinhalb an und antwortet sonst mit "Request Entity Too Large".
 *
 * Gerechnet wird auf 1600 Pixel lange Kante, das reicht für einen Nachweis und
 * landet bei ein paar hundert Kilobyte. Was kein Bild ist, etwa ein PDF bei
 * einer Krankmeldung, bleibt unangetastet.
 */
export async function bildVerkleinern(datei: File, maxKante = 1600, guete = 0.82): Promise<File> {
  if (!datei.type.startsWith("image/") || typeof document === "undefined") return datei;
  let adresse = "";
  try {
    adresse = URL.createObjectURL(datei);
    const bild = await new Promise<HTMLImageElement>((fertig, fehler) => {
      const element = new Image();
      element.onload = () => fertig(element);
      element.onerror = () => fehler(new Error("Bild konnte nicht gelesen werden."));
      element.src = adresse;
    });

    const faktor = Math.min(1, maxKante / Math.max(bild.width, bild.height));
    const breite = Math.max(1, Math.round(bild.width * faktor));
    const hoehe = Math.max(1, Math.round(bild.height * faktor));

    const flaeche = document.createElement("canvas");
    flaeche.width = breite;
    flaeche.height = hoehe;
    const stift = flaeche.getContext("2d");
    if (!stift) return datei;
    stift.drawImage(bild, 0, 0, breite, hoehe);

    const klotz = await new Promise<Blob | null>((fertig) => flaeche.toBlob(fertig, "image/jpeg", guete));
    if (!klotz || klotz.size >= datei.size) return datei;
    return new File([klotz], `${datei.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return datei;
  } finally {
    if (adresse) URL.revokeObjectURL(adresse);
  }
}

export async function bilderVerkleinern(dateien: File[]) {
  const fertig: File[] = [];
  for (const datei of dateien) fertig.push(await bildVerkleinern(datei));
  return fertig;
}

/**
 * Antwort lesen, ohne an fremdem Text zu zerbrechen.
 *
 * Geht etwas schief, bevor die App überhaupt drankommt, antwortet die
 * Plattform in Klartext. Der Versuch, das als Datensatz zu lesen, endete in
 * "Unexpected token R" — eine Meldung, mit der niemand etwas anfangen kann.
 */
export async function antwortLesen(response: Response): Promise<Record<string, any>> {
  const roh = await response.text();
  try {
    return JSON.parse(roh);
  } catch {
    if (response.status === 413) {
      return { ok: false, error: "Die Anhänge sind zusammen zu groß. Bitte weniger oder kleinere Bilder wählen." };
    }
    const kurz = roh.trim().replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140);
    return { ok: false, error: kurz ? `Der Server meldet: ${kurz}` : `Der Server hat mit Fehler ${response.status} geantwortet.` };
  }
}
