import Platzhalter from "../Platzhalter";

export default function Seite() {
  return (
    <Platzhalter
      titel="Einstellungen"
      kommt="Betriebsweite Einstellungen: Radius fürs Stempeln, Toleranz bei Abweichungen, Texte für Erklärungen, wer Meldungen bekommt."
      heute={[{ text: "Push-Nachrichten", adresse: "/mitarbeiter/admin/push" }]}
    />
  );
}