import { redirect } from "next/navigation";
import { BEREICHE, bereichFinden } from "@/lib/einstellungenPlan";

/** Ein Reiter ohne Unterseite landet auf seiner ersten Unterseite. */
export default async function Seite({ params }: { params: Promise<{ bereich: string }> }) {
  const { bereich } = await params;
  const gefunden = bereichFinden(bereich) || BEREICHE[0];
  redirect(`/mitarbeiter/admin/einstellungen/${gefunden.schluessel}/${gefunden.gruppen[0].schluessel}`);
}
