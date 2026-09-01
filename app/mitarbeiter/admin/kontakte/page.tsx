import Platzhalter from "../Platzhalter";

export default function Seite() {
  return (
    <Platzhalter
      titel="Kontakte"
      kommt="Ansprechpartner je Kunde und Objekt: Name, Rolle, Telefon, E-Mail. Damit auf dem Objekt klar ist, wen man anruft, wenn etwas ist."
      heute={[{ text: "Kunden mit Ansprechpartner", adresse: "/mitarbeiter/admin/kunden" }]}
    />
  );
}