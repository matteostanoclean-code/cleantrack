import Platzhalter from "../Platzhalter";

export default function Seite() {
  return (
    <Platzhalter
      titel="Schlüssel"
      kommt="Schlüsselverwaltung: welcher Schlüssel gehört zu welchem Objekt, wer hat ihn gerade, wann wurde er übergeben. Mit Quittung bei der Übergabe."
      heute={[{ text: "Geräte und Inventar", adresse: "/mitarbeiter/admin/geraete" }]}
    />
  );
}