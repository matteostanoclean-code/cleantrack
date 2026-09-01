/**
 * Gemeinsames rund um Objekte.
 *
 * Liegt hier und nicht in der Route, weil eine Route nur ihre Handler
 * ausliefern darf — und weil der Bildschirm dieselben Leistungen kennen muss
 * wie der Server.
 */

/** Was an einem Objekt gemacht werden kann. Weitere kommen später aus den Einstellungen. */
export const OBJEKT_TAGS = [
  "Unterhaltsreinigung",
  "Glasreinigung",
  "Treppenhausreinigung",
  "Gartenarbeiten",
  "Bauendreinigung",
  "Wohnungsreinigung"
];

/**
 * Anschrift in Koordinaten übersetzen, über OpenStreetMap.
 *
 * Schlägt es fehl, wird ohne Koordinaten gespeichert und die Seite sagt das.
 * Lieber ein Objekt ohne Standort, an dem sichtbar nicht gestempelt werden
 * kann, als eines mit falschen Koordinaten mitten im Nachbarort.
 */
export async function koordinaten(strasse: string, plz: string, ort: string) {
  const sauber = (wert: unknown) => String(wert ?? "").trim();
  const teile = [strasse, plz, ort].map(sauber).filter(Boolean);
  if (teile.length < 2) return null;

  try {
    const adresse = new URL("https://nominatim.openstreetmap.org/search");
    adresse.searchParams.set("street", sauber(strasse));
    if (sauber(plz)) adresse.searchParams.set("postalcode", sauber(plz));
    if (sauber(ort)) adresse.searchParams.set("city", sauber(ort));
    adresse.searchParams.set("country", "Germany");
    adresse.searchParams.set("format", "json");
    adresse.searchParams.set("limit", "1");

    const antwort = await fetch(adresse.toString(), {
      headers: { "User-Agent": "schichtklar/1.0 (kontakt@matteostano-clean.de)" },
      cache: "no-store"
    });
    if (!antwort.ok) return null;

    const treffer = await antwort.json();
    const erster = Array.isArray(treffer) ? treffer[0] : null;
    if (!erster?.lat || !erster?.lon) return null;
    return { latitude: Number(erster.lat), longitude: Number(erster.lon) };
  } catch {
    return null;
  }
}
