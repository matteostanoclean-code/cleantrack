/**
 * Wie der Absender einer Meldung heißen soll.
 *
 * "Nachricht vom Büro" klingt nach Behörde — im Betrieb schreibt Matteo, und
 * das soll auch dastehen. Aus dem Profilnamen wird der Vorname, ein Anhängsel
 * wie "_admin" fliegt weg: der Login heißt "Matteo_admin", der Mensch heißt
 * Matteo.
 *
 * Steht bewusst in einer eigenen Datei und nicht in lib/push.ts. Die App
 * braucht denselben Namen für die Anzeige, und push.ts zieht die
 * Versand-Bibliothek nach sich — die gehört auf den Server, nicht in den
 * Browser.
 */
export function absenderName(profilName: unknown, ersatz = "Büro") {
  const sauber = String(profilName || "").replace(/[_-](admin|buero|büro)$/i, "").trim();
  const vorname = sauber.split(/\s+/)[0] || "";
  return vorname || ersatz;
}
