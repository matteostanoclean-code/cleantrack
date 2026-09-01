import Platzhalter from "../Platzhalter";

export default function Seite() {
  return (
    <Platzhalter
      titel="Suche"
      kommt="Eine Suche über alles: Mitarbeiter, Kunden, Objekte, Einsätze, Zeiten, Material. Ein Feld, alle Treffer nach Art gruppiert."
      heute={[{ text: "Objekte und Kunden im Dashboard", adresse: "/mitarbeiter/admin?tab=sites" }, { text: "Einsätze im Einsatzplaner", adresse: "/mitarbeiter/admin/planung" }]}
    />
  );
}