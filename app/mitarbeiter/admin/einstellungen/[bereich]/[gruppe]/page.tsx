import EinstellungenAnsicht from "../../EinstellungenAnsicht";

export const dynamic = "force-dynamic";

/**
 * Alle Einstellungsseiten laufen über diese eine Adresse. Welcher Bildschirm
 * gezeichnet wird, entscheidet der Bauplan in lib/einstellungenPlan.ts.
 */
export default async function Seite({ params }: { params: Promise<{ bereich: string; gruppe: string }> }) {
  const { bereich, gruppe } = await params;
  return <EinstellungenAnsicht bereich={bereich} gruppe={gruppe} />;
}
